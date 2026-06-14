import Foundation

/// A coordinate on the board. `row` 0 is the *bottom* row so gravity simply
/// pulls tiles toward row 0, which keeps the collapse maths intuitive.
struct GridPosition: Hashable, Codable {
    var col: Int
    var row: Int

    static func + (lhs: GridPosition, rhs: (dc: Int, dr: Int)) -> GridPosition {
        GridPosition(col: lhs.col + rhs.dc, row: lhs.row + rhs.dr)
    }

    /// Four orthogonal neighbours — used for swap adjacency checks.
    var orthogonalNeighbours: [GridPosition] {
        [GridPosition(col: col + 1, row: row),
         GridPosition(col: col - 1, row: row),
         GridPosition(col: col, row: row + 1),
         GridPosition(col: col, row: row - 1)]
    }

    func isAdjacent(to other: GridPosition) -> Bool {
        let dc = abs(col - other.col)
        let dr = abs(row - other.row)
        return dc + dr == 1
    }
}

/// The special power baked into a tile, created by big matches.
enum SpecialKind: Equatable, Codable {
    /// Ordinary orb.
    case none
    /// Surge Orb — clears its entire row (from a horizontal 4-match).
    case surgeRow
    /// Surge Orb — clears its entire column (from a vertical 4-match).
    case surgeColumn
    /// Echo Bomb — clears a 3×3 area (from L / T / + shaped matches).
    case echoBomb
    /// Cataclysm Orb — clears every tile of a chosen element (from a 5-match).
    case cataclysm

    var isSpecial: Bool { self != .none }

    /// Extra flat points awarded just for detonating this special.
    var detonationBonus: Int {
        switch self {
        case .none:        return 0
        case .surgeRow,
             .surgeColumn: return 60
        case .echoBomb:    return 120
        case .cataclysm:   return 250
        }
    }
}

/// A single orb on the board. Identity is the stable `id` (so the renderer can
/// follow a sprite as it falls), while `element`/`special` describe its state.
struct Tile: Identifiable, Equatable, Codable {
    let id: UUID
    var element: ElementType
    var special: SpecialKind

    init(id: UUID = UUID(), element: ElementType, special: SpecialKind = .none) {
        self.id = id
        self.element = element
        self.special = special
    }

    static func == (lhs: Tile, rhs: Tile) -> Bool { lhs.id == rhs.id }
}
