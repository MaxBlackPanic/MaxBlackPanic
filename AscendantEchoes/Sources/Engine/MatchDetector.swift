import Foundation

/// A contiguous run of same-element tiles in one direction.
private struct Run {
    let positions: [GridPosition]
    let element: ElementType
    let isHorizontal: Bool
    var length: Int { positions.count }
}

/// The outcome of scanning a board for matches.
struct MatchResult {
    /// Every position that is part of any 3+ match.
    let clearedPositions: Set<GridPosition>
    /// Specials that *should be spawned* as a reward for big/shaped matches.
    let creations: [SpecialCreation]
    /// Run lengths involved, used for combo/score flavour ("5-match!").
    let topRunLength: Int

    var isEmpty: Bool { clearedPositions.isEmpty }
}

/// Instruction to create a special orb at a position once the match clears.
struct SpecialCreation {
    let position: GridPosition
    let kind: SpecialKind
    let element: ElementType
}

/// Pure, stateless match analysis. Given a `Grid` it finds all runs of three
/// or more, classifies shapes (line / L / T / +) and decides which special
/// orbs the match earns. No rendering, no mutation — fully unit-testable.
enum MatchDetector {

    /// Finds every horizontal and vertical run of length >= 3.
    private static func runs(in grid: Grid) -> [Run] {
        var runs: [Run] = []

        // Horizontal scan.
        for row in 0..<grid.rows {
            var start = 0
            while start < grid.columns {
                guard let tile = grid[start, row], !isBlocker(tile) else { start += 1; continue }
                var end = start + 1
                while end < grid.columns,
                      let next = grid[end, row], next.element == tile.element, !isBlocker(next) {
                    end += 1
                }
                let length = end - start
                if length >= 3 {
                    let positions = (start..<end).map { GridPosition(col: $0, row: row) }
                    runs.append(Run(positions: positions, element: tile.element, isHorizontal: true))
                }
                start = end
            }
        }

        // Vertical scan.
        for col in 0..<grid.columns {
            var start = 0
            while start < grid.rows {
                guard let tile = grid[col, start], !isBlocker(tile) else { start += 1; continue }
                var end = start + 1
                while end < grid.rows,
                      let next = grid[col, end], next.element == tile.element, !isBlocker(next) {
                    end += 1
                }
                let length = end - start
                if length >= 3 {
                    let positions = (start..<end).map { GridPosition(col: col, row: $0) }
                    runs.append(Run(positions: positions, element: tile.element, isHorizontal: false))
                }
                start = end
            }
        }

        return runs
    }

    /// Tiles flagged as blockers never match (reserved for future obstacle
    /// floors — currently always false, kept as an extension point).
    private static func isBlocker(_ tile: Tile) -> Bool { false }

    /// Analyse the whole board and decide clears + special rewards.
    ///
    /// - Parameter swapAnchors: positions the player just swapped. Used to
    ///   place a newly created special under the player's finger when possible,
    ///   which feels far more intentional than a "random" placement.
    static func analyse(_ grid: Grid, swapAnchors: [GridPosition] = []) -> MatchResult {
        let runs = runs(in: grid)
        guard !runs.isEmpty else {
            return MatchResult(clearedPositions: [], creations: [], topRunLength: 0)
        }

        var cleared = Set<GridPosition>()
        for run in runs { cleared.formUnion(run.positions) }

        var creations: [SpecialCreation] = []
        var consumed = Set<GridPosition>() // positions already promised to a creation

        // 1. Shaped matches (intersections of a horizontal and vertical run of
        //    the same element) earn an Echo Bomb. Detect these first since they
        //    out-rank plain line bonuses.
        let horizontals = runs.filter { $0.isHorizontal }
        let verticals = runs.filter { !$0.isHorizontal }
        for h in horizontals {
            for v in verticals where v.element == h.element {
                let hSet = Set(h.positions)
                let intersection = v.positions.filter { hSet.contains($0) }
                guard let pivot = intersection.first else { continue }
                // Require a genuine corner/T (both arms >= 3) — that's an L/T/+.
                if h.length >= 3 && v.length >= 3 {
                    let anchor = bestAnchor(from: [pivot] + h.positions + v.positions,
                                            swapAnchors: swapAnchors)
                    creations.append(SpecialCreation(position: anchor, kind: .echoBomb, element: h.element))
                    consumed.formUnion(h.positions)
                    consumed.formUnion(v.positions)
                }
            }
        }

        // 2. Straight-line bonuses for runs not already consumed by a shape.
        var topRun = 0
        for run in runs {
            topRun = max(topRun, run.length)
            if run.positions.allSatisfy({ consumed.contains($0) }) { continue }
            let kind: SpecialKind
            switch run.length {
            case 5...:
                kind = .cataclysm
            case 4:
                kind = run.isHorizontal ? .surgeRow : .surgeColumn
            default:
                continue // length 3 → no special
            }
            let anchor = bestAnchor(from: run.positions, swapAnchors: swapAnchors)
            creations.append(SpecialCreation(position: anchor, kind: kind, element: run.element))
            consumed.formUnion(run.positions)
        }

        return MatchResult(clearedPositions: cleared, creations: creations, topRunLength: topRun)
    }

    /// Prefer placing the special on a tile the player actively swapped.
    private static func bestAnchor(from positions: [GridPosition],
                                   swapAnchors: [GridPosition]) -> GridPosition {
        for anchor in swapAnchors where positions.contains(anchor) {
            return anchor
        }
        // Otherwise pick the middle-ish position for a pleasing placement.
        return positions[positions.count / 2]
    }

    /// Convenience: does this board contain at least one match right now?
    static func hasMatch(_ grid: Grid) -> Bool {
        !runs(in: grid).isEmpty
    }
}
