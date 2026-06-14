import Foundation

/// Owns the mutable board state and the low-level board operations: filling,
/// swapping, detonation expansion, gravity and refilling. It performs **no**
/// scoring or rendering — `GameEngine` orchestrates those on top of it. Keeping
/// this layer pure makes the trickiest mechanics (collapse/refill) testable.
final class BoardManager {
    private(set) var grid: Grid
    let elementPool: [ElementType]
    private var rng: AnyRandomNumberGenerator

    var columns: Int { grid.columns }
    var rows: Int { grid.rows }

    init(columns: Int, rows: Int, elementPool: [ElementType],
         rng: RandomNumberGenerator = SystemRandomNumberGenerator()) {
        self.grid = Grid(columns: columns, rows: rows)
        self.elementPool = elementPool.isEmpty ? ElementType.allCases : elementPool
        self.rng = AnyRandomNumberGenerator(rng)
        fillInitialBoard()
    }

    // MARK: - Filling

    /// Fills an empty board guaranteeing no pre-existing matches and at least
    /// one legal move (re-rolling cells / shuffling as needed).
    func fillInitialBoard() {
        for c in 0..<columns {
            for r in 0..<rows {
                grid[c, r] = makeNonMatchingTile(col: c, row: r)
            }
        }
        if !hasPossibleMove() { shuffle() }
    }

    /// Produces a tile that does not immediately complete a horizontal or
    /// vertical run of three at the given position.
    private func makeNonMatchingTile(col: Int, row: Int) -> Tile {
        var forbidden = Set<ElementType>()
        if col >= 2, let a = grid[col - 1, row], let b = grid[col - 2, row], a.element == b.element {
            forbidden.insert(a.element)
        }
        if row >= 2, let a = grid[col, row - 1], let b = grid[col, row - 2], a.element == b.element {
            forbidden.insert(a.element)
        }
        let choices = elementPool.filter { !forbidden.contains($0) }
        let element = (choices.isEmpty ? elementPool : choices).randomElement(using: &rng) ?? .flame
        return Tile(element: element)
    }

    // MARK: - Swapping

    /// Swaps two positions in place (no validity checks — caller decides).
    func swap(_ a: GridPosition, _ b: GridPosition) {
        let tmp = grid[a]
        grid[a] = grid[b]
        grid[b] = tmp
    }

    // MARK: - Detonations

    /// Expands a seed set of cleared positions to include every tile destroyed
    /// by chain-reacting specials. Breadth-first so a Surge can ignite an Echo
    /// Bomb which ignites a Cataclysm, all in one wave.
    func detonationClears(seed: Set<GridPosition>) -> Set<GridPosition> {
        var result = Set<GridPosition>()
        var queue = Array(seed)
        while let p = queue.popLast() {
            guard grid.contains(p), !result.contains(p) else { continue }
            result.insert(p)
            guard let tile = grid[p], tile.special.isSpecial else { continue }
            for a in affectedPositions(of: tile, at: p) where !result.contains(a) {
                queue.append(a)
            }
        }
        return result
    }

    /// Which cells a detonating special destroys.
    private func affectedPositions(of tile: Tile, at p: GridPosition) -> [GridPosition] {
        switch tile.special {
        case .none:
            return []
        case .surgeRow:
            return (0..<columns).map { GridPosition(col: $0, row: p.row) }
        case .surgeColumn:
            return (0..<rows).map { GridPosition(col: p.col, row: $0) }
        case .echoBomb:
            var cells: [GridPosition] = []
            for dc in -1...1 {
                for dr in -1...1 {
                    let q = GridPosition(col: p.col + dc, row: p.row + dr)
                    if grid.contains(q) { cells.append(q) }
                }
            }
            return cells
        case .cataclysm:
            // Colour bomb: every tile sharing this orb's element.
            return grid.allPositions.filter { grid[$0]?.element == tile.element }
        }
    }

    // MARK: - Mutation

    /// Removes the given positions from the board (used after capturing clears).
    func remove(_ positions: Set<GridPosition>) {
        for p in positions { grid[p] = nil }
    }

    /// Upgrades the tile at a position into a special orb in place.
    func placeSpecial(_ creation: SpecialCreation) {
        guard var tile = grid[creation.position] else {
            // Anchor was cleared away (rare race) — spawn a fresh special tile.
            grid[creation.position] = Tile(element: creation.element, special: creation.kind)
            return
        }
        tile.element = creation.element
        tile.special = creation.kind
        grid[creation.position] = tile
    }

    /// Applies gravity, compacting each column toward row 0. Returns the moves
    /// so the renderer can animate the falls.
    func applyGravity() -> [TileMove] {
        var moves: [TileMove] = []
        for c in 0..<columns {
            var writeRow = 0
            for r in 0..<rows {
                guard let tile = grid[c, r] else { continue }
                if r != writeRow {
                    grid[c, writeRow] = tile
                    grid[c, r] = nil
                    moves.append(TileMove(id: tile.id,
                                          from: GridPosition(col: c, row: r),
                                          to: GridPosition(col: c, row: writeRow)))
                }
                writeRow += 1
            }
        }
        return moves
    }

    /// Refills empty cells from the top with fresh random tiles.
    func refill() -> [TileSpawn] {
        var spawns: [TileSpawn] = []
        for c in 0..<columns {
            var dropIndex = 0
            for r in 0..<rows where grid[c, r] == nil {
                let tile = Tile(element: elementPool.randomElement(using: &rng) ?? .flame)
                grid[c, r] = tile
                spawns.append(TileSpawn(tile: tile,
                                        position: GridPosition(col: c, row: r),
                                        dropFrom: rows + dropIndex))
                dropIndex += 1
            }
        }
        return spawns
    }

    // MARK: - Hints & shuffling

    /// Returns a swap that would create a match, if one exists. Drives both the
    /// hint system and the "no moves left → shuffle" safeguard.
    func findHint() -> (GridPosition, GridPosition)? {
        for c in 0..<columns {
            for r in 0..<rows {
                let p = GridPosition(col: c, row: r)
                // Only test right and up neighbours to avoid duplicate checks.
                for q in [GridPosition(col: c + 1, row: r), GridPosition(col: c, row: r + 1)] {
                    guard grid.contains(q) else { continue }
                    swap(p, q)
                    let matched = MatchDetector.hasMatch(grid)
                    swap(p, q) // revert
                    if matched { return (p, q) }
                }
            }
        }
        return nil
    }

    func hasPossibleMove() -> Bool { findHint() != nil }

    /// Reshuffles the board until there are no standing matches but at least one
    /// legal move exists.
    func shuffle() {
        let tiles = grid.allPositions.compactMap { grid[$0] }
        var attempts = 0
        repeat {
            var pool = tiles.shuffled(using: &rng)
            for c in 0..<columns {
                for r in 0..<rows {
                    grid[c, r] = pool.removeLast()
                }
            }
            attempts += 1
        } while (MatchDetector.hasMatch(grid) || !hasPossibleMove()) && attempts < 50
    }
}
