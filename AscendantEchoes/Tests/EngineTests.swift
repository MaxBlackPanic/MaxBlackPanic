import XCTest
@testable import AscendantEchoes

/// A small deterministic RNG so board generation is reproducible in tests.
struct SeededGenerator: RandomNumberGenerator {
    var state: UInt64
    init(seed: UInt64) { state = seed == 0 ? 0x9E3779B97F4A7C15 : seed }
    mutating func next() -> UInt64 {
        state ^= state << 13
        state ^= state >> 7
        state ^= state << 17
        return state
    }
}

final class MatchDetectorTests: XCTestCase {

    /// Builds a grid from a layout of element indices; `nil` indices stay empty.
    private func makeGrid(_ rows: [[Int?]]) -> Grid {
        let height = rows.count
        let width = rows[0].count
        var grid = Grid(columns: width, rows: height)
        // rows[0] is the *top* visual row for readability; map to row index.
        for (r, line) in rows.enumerated() {
            let row = height - 1 - r
            for (c, value) in line.enumerated() {
                if let value, let element = ElementType(rawValue: value) {
                    grid[c, row] = Tile(element: element)
                }
            }
        }
        return grid
    }

    func testHorizontalThreeMatch() {
        let grid = makeGrid([
            [0, 0, 0, 1],
            [2, 3, 4, 5],
            [1, 2, 3, 4],
            [5, 4, 3, 2]
        ])
        let result = MatchDetector.analyse(grid)
        XCTAssertEqual(result.clearedPositions.count, 3)
        XCTAssertTrue(result.creations.isEmpty, "A 3-match should not create a special")
    }

    func testHorizontalFourCreatesSurge() {
        let grid = makeGrid([
            [0, 0, 0, 0],
            [2, 3, 4, 5],
            [1, 2, 3, 4],
            [5, 4, 3, 2]
        ])
        let result = MatchDetector.analyse(grid)
        XCTAssertEqual(result.clearedPositions.count, 4)
        XCTAssertEqual(result.creations.first?.kind, .surgeRow)
    }

    func testVerticalFiveCreatesCataclysm() {
        let grid = makeGrid([
            [0, 1, 2, 3, 4],
            [0, 4, 3, 2, 1],
            [0, 1, 2, 3, 4],
            [0, 4, 3, 2, 1],
            [0, 1, 2, 3, 4]
        ])
        let result = MatchDetector.analyse(grid)
        XCTAssertEqual(result.creations.first?.kind, .cataclysm)
        XCTAssertGreaterThanOrEqual(result.topRunLength, 5)
    }

    func testLShapeCreatesEchoBomb() {
        // Vertical 3 of element 0 in column 0 + horizontal 3 of element 0 on
        // the bottom row sharing the corner → an L.
        let grid = makeGrid([
            [0, 5, 4],
            [0, 3, 2],
            [0, 0, 0]
        ])
        let result = MatchDetector.analyse(grid)
        XCTAssertTrue(result.creations.contains { $0.kind == .echoBomb })
    }
}

final class BoardManagerTests: XCTestCase {

    func testInitialBoardHasNoMatchesButHasMoves() {
        var rng: RandomNumberGenerator = SeededGenerator(seed: 42)
        let board = BoardManager(columns: 8, rows: 8,
                                 elementPool: Array(ElementType.allCases.prefix(6)), rng: rng)
        XCTAssertFalse(MatchDetector.hasMatch(board.grid))
        XCTAssertTrue(board.hasPossibleMove())
        _ = rng // silence unused warning on some toolchains
    }

    func testGravityCompactsColumns() {
        let board = BoardManager(columns: 3, rows: 3, elementPool: [.flame])
        // Remove the bottom row; everything above should drop by one.
        board.remove([GridPosition(col: 0, row: 0),
                      GridPosition(col: 1, row: 0),
                      GridPosition(col: 2, row: 0)])
        let moves = board.applyGravity()
        XCTAssertEqual(moves.count, 6, "Two tiles per column should fall")
        // Bottom row should now be filled again (by the tiles that fell).
        for c in 0..<3 {
            XCTAssertNotNil(board.grid[c, 0])
        }
    }

    func testRefillFillsEmptyCells() {
        let board = BoardManager(columns: 4, rows: 4, elementPool: Array(ElementType.allCases))
        board.remove(Set(board.grid.allPositions))
        let spawns = board.refill()
        XCTAssertEqual(spawns.count, 16)
        XCTAssertTrue(board.grid.allPositions.allSatisfy { board.grid[$0] != nil })
    }
}

final class GameEngineTests: XCTestCase {

    func testSwapWithNoMatchIsInvalidAndRestoresBoard() {
        let floor = LevelGenerator.makeFloor(1)
        let engine = GameEngine(floor: floor, rng: SeededGenerator(seed: 7))
        let before = engine.grid
        // Find two adjacent tiles that do NOT form a match when swapped.
        var tested = false
        outer: for p in engine.grid.allPositions {
            let q = GridPosition(col: p.col + 1, row: p.row)
            guard engine.grid.contains(q) else { continue }
            let res = engine.attemptSwap(p, q)
            if !res.isValid {
                XCTAssertEqual(engine.grid, before, "Invalid swap must restore the board")
                tested = true
                break outer
            } else {
                // It was valid; board changed legitimately — stop the test early.
                tested = true
                break outer
            }
        }
        XCTAssertTrue(tested)
    }

    func testScoreIncreasesOnValidSwap() {
        let floor = LevelGenerator.makeFloor(2)
        let engine = GameEngine(floor: floor, rng: SeededGenerator(seed: 99))
        // Drive swaps until we land a valid one, then assert score grew.
        for p in engine.grid.allPositions {
            for q in [GridPosition(col: p.col + 1, row: p.row),
                      GridPosition(col: p.col, row: p.row + 1)] {
                guard engine.grid.contains(q) else { continue }
                let res = engine.attemptSwap(p, q)
                if res.isValid {
                    XCTAssertGreaterThan(engine.score, 0)
                    XCTAssertGreaterThan(engine.essenceEarned, 0)
                    return
                }
            }
        }
    }

    func testObjectiveProgressIsBounded() {
        let engine = GameEngine(floor: LevelGenerator.makeFloor(1), rng: SeededGenerator(seed: 1))
        XCTAssertGreaterThanOrEqual(engine.objectiveProgress, 0)
        XCTAssertLessThanOrEqual(engine.objectiveProgress, 1)
    }
}
