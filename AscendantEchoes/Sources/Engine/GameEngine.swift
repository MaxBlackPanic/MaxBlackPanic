import Foundation

/// The brain of a single floor. It ties together `BoardManager`,
/// `MatchDetector` and `ComboSystem`, owns the authoritative score / move /
/// objective state, and turns a player swap into an ordered `SwapResolution`
/// that the SpriteKit scene replays as animation.
///
/// It exposes only value-type results, so the engine can be unit-tested with a
/// seeded RNG and without any rendering.
final class GameEngine {
    let floor: Floor
    let board: BoardManager
    private let combo = ComboSystem()

    private(set) var score = 0
    private(set) var movesRemaining: Int
    private(set) var collected: [ElementType: Int] = [:]
    private(set) var essenceEarned = 0

    /// One free Reshape per floor when the ability is unlocked.
    var reshapeCharges = 0

    var grid: Grid { board.grid }

    enum Outcome: Equatable { case inProgress, won, lost }

    init(floor: Floor, extraMoves: Int = 0,
         rng: RandomNumberGenerator = SystemRandomNumberGenerator()) {
        self.floor = floor
        self.movesRemaining = floor.moveBudget + extraMoves
        self.board = BoardManager(columns: floor.columns,
                                  rows: floor.rows,
                                  elementPool: floor.elementPool,
                                  rng: rng)
    }

    // MARK: - Player input

    /// Attempts a normal adjacent swap. Returns the full resolution; if the swap
    /// creates no match the board is left untouched and the result is invalid.
    func attemptSwap(_ a: GridPosition, _ b: GridPosition) -> SwapResolution {
        let moveA = TileMove(id: board.grid[a]?.id ?? UUID(), from: a, to: b)
        let moveB = TileMove(id: board.grid[b]?.id ?? UUID(), from: b, to: a)

        guard a.isAdjacent(to: b), board.grid[a] != nil, board.grid[b] != nil else {
            return SwapResolution(isValid: false, swapA: moveA, swapB: moveB, waves: [])
        }

        board.swap(a, b)
        guard MatchDetector.hasMatch(board.grid) else {
            board.swap(a, b)
            return SwapResolution(isValid: false, swapA: moveA, swapB: moveB, waves: [])
        }

        movesRemaining = max(0, movesRemaining - 1)
        let waves = runCascades(swapAnchors: [a, b])
        return SwapResolution(isValid: true, swapA: moveA, swapB: moveB, waves: waves)
    }

    // MARK: - Abilities

    /// Reshape: swap any two orbs (adjacent or not), free of charge, consuming a
    /// charge. Resolves whatever matches result (possibly none).
    func reshape(_ a: GridPosition, _ b: GridPosition) -> SwapResolution? {
        guard reshapeCharges > 0, board.grid[a] != nil, board.grid[b] != nil else { return nil }
        reshapeCharges -= 1
        let moveA = TileMove(id: board.grid[a]!.id, from: a, to: b)
        let moveB = TileMove(id: board.grid[b]!.id, from: b, to: a)
        board.swap(a, b)
        let waves = runCascades(swapAnchors: [a, b])
        return SwapResolution(isValid: true, swapA: moveA, swapB: moveB, waves: waves)
    }

    /// Echo Blast: manually detonate a single orb (and any chain it triggers).
    func echoBlast(at p: GridPosition) -> [CascadeWave]? {
        guard board.grid[p] != nil else { return nil }
        combo.reset()
        var waves = [applyClear(seed: [p], creations: [], topRunLength: 0, forceResonance: true)]
        waves += continueCascades()
        if !board.hasPossibleMove() { board.shuffle() }
        return waves
    }

    // MARK: - Cascade engine

    /// Resolves the initial match (from a swap) and all follow-up cascades.
    private func runCascades(swapAnchors: [GridPosition]) -> [CascadeWave] {
        combo.reset()
        var waves: [CascadeWave] = []
        let first = MatchDetector.analyse(board.grid, swapAnchors: swapAnchors)
        if !first.isEmpty {
            waves.append(applyClear(seed: first.clearedPositions,
                                    creations: first.creations,
                                    topRunLength: first.topRunLength,
                                    forceResonance: false))
            waves += continueCascades()
        }
        if !board.hasPossibleMove() { board.shuffle() }
        return waves
    }

    /// Keeps resolving matches until the board is stable.
    private func continueCascades() -> [CascadeWave] {
        var waves: [CascadeWave] = []
        while true {
            let result = MatchDetector.analyse(board.grid)
            guard !result.isEmpty else { break }
            waves.append(applyClear(seed: result.clearedPositions,
                                    creations: result.creations,
                                    topRunLength: result.topRunLength,
                                    forceResonance: false))
        }
        return waves
    }

    /// The core of a single wave: expand detonations, score, spawn specials,
    /// apply gravity and refill. Shared by swaps, reshapes and echo blasts.
    private func applyClear(seed: Set<GridPosition>,
                            creations: [SpecialCreation],
                            topRunLength: Int,
                            forceResonance: Bool) -> CascadeWave {
        var wave = CascadeWave()
        wave.topRunLength = topRunLength
        wave.isResonance = forceResonance || topRunLength >= 5 ||
                           creations.contains { $0.kind == .echoBomb }

        let creationAnchors = Set(creations.map(\.position))
        let expanded = board.detonationClears(seed: seed)
        let finalCleared = expanded.subtracting(creationAnchors)
        wave.detonatedSpecials = expanded.count > seed.count

        var detonationBonus = 0
        for p in finalCleared {
            guard let tile = board.grid[p] else { continue }
            wave.clears.append(ClearEvent(position: p, tile: tile))
            wave.elementCounts[tile.element, default: 0] += 1
            collected[tile.element, default: 0] += 1
            detonationBonus += tile.special.detonationBonus
        }

        let scored = combo.register(clearedCount: wave.clears.count,
                                    detonationBonus: detonationBonus,
                                    isResonance: wave.isResonance)
        wave.scoreDelta = scored.score
        wave.multiplier = scored.multiplier
        wave.comboStep = scored.comboStep
        wave.essenceDelta = combo.essence(forClearedCount: wave.clears.count,
                                          specials: creations.count)
        score += wave.scoreDelta
        essenceEarned += wave.essenceDelta

        board.remove(finalCleared)
        for creation in creations {
            board.placeSpecial(creation)
            if let tile = board.grid[creation.position] {
                wave.placements.append(SpecialPlacement(tileID: tile.id,
                                                        position: creation.position,
                                                        kind: creation.kind,
                                                        element: creation.element))
            }
        }
        wave.collapses = board.applyGravity()
        wave.spawns = board.refill()
        return wave
    }

    // MARK: - Objective evaluation

    var outcome: Outcome {
        if objectiveMet { return .won }
        if movesRemaining <= 0 { return .lost }
        return .inProgress
    }

    var objectiveMet: Bool {
        switch floor.objective {
        case .reachScore(let target):
            return score >= target
        case .collect(let element, let count):
            return (collected[element] ?? 0) >= count
        case .survive(_, let minScore):
            return movesRemaining <= 0 && score >= minScore
        }
    }

    /// 0...1 progress toward the floor objective (for the HUD progress ring).
    var objectiveProgress: Double {
        switch floor.objective {
        case .reachScore(let target):
            return min(1, Double(score) / Double(max(1, target)))
        case .collect(let element, let count):
            return min(1, Double(collected[element] ?? 0) / Double(max(1, count)))
        case .survive(_, let minScore):
            return min(1, Double(score) / Double(max(1, minScore)))
        }
    }
}
