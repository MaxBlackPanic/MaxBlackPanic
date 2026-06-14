import Foundation

/// A 2-D container of tiles addressed by `[col][row]`, with `row 0` at the
/// bottom. Empty cells are `nil` (briefly the case during clears/collapses).
///
/// `Grid` is a value type so the engine can freely snapshot, mutate and compare
/// boards without aliasing surprises — important for deterministic testing.
struct Grid: Equatable {
    let columns: Int
    let rows: Int
    private(set) var cells: [[Tile?]]

    init(columns: Int, rows: Int) {
        self.columns = columns
        self.rows = rows
        self.cells = Array(repeating: Array(repeating: nil, count: rows), count: columns)
    }

    func contains(_ p: GridPosition) -> Bool {
        p.col >= 0 && p.col < columns && p.row >= 0 && p.row < rows
    }

    subscript(_ p: GridPosition) -> Tile? {
        get { contains(p) ? cells[p.col][p.row] : nil }
        set { if contains(p) { cells[p.col][p.row] = newValue } }
    }

    subscript(col: Int, row: Int) -> Tile? {
        get { self[GridPosition(col: col, row: row)] }
        set { self[GridPosition(col: col, row: row)] = newValue }
    }

    /// All positions, column-major.
    var allPositions: [GridPosition] {
        var result: [GridPosition] = []
        result.reserveCapacity(columns * rows)
        for c in 0..<columns {
            for r in 0..<rows {
                result.append(GridPosition(col: c, row: r))
            }
        }
        return result
    }
}
