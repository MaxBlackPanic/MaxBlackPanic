import { describe, it, expect } from "vitest";
import {
  Grid,
  BoardManager,
  MatchDetector,
  GameEngine,
  LevelGenerator,
  ElementType,
  ALL_ELEMENTS,
  makeTile,
  mulberry32,
  posKey,
  type GridPosition,
} from "./engine";

/** Build a grid from a layout of element indices (top row first for readability). */
function makeGrid(rows: (number | null)[][]): Grid {
  const height = rows.length;
  const width = rows[0].length;
  const grid = new Grid(width, height);
  rows.forEach((line, r) => {
    const row = height - 1 - r;
    line.forEach((value, c) => {
      if (value !== null) grid.set({ col: c, row }, makeTile(value as ElementType));
    });
  });
  return grid;
}

describe("MatchDetector", () => {
  it("finds a horizontal 3-match without creating a special", () => {
    const grid = makeGrid([
      [0, 0, 0, 1],
      [2, 3, 4, 5],
      [1, 2, 3, 4],
      [5, 4, 3, 2],
    ]);
    const result = MatchDetector.analyse(grid);
    expect(result.cleared.size).toBe(3);
    expect(result.creations).toHaveLength(0);
  });

  it("creates a Surge from a horizontal 4-match", () => {
    const grid = makeGrid([
      [0, 0, 0, 0],
      [2, 3, 4, 5],
      [1, 2, 3, 4],
      [5, 4, 3, 2],
    ]);
    const result = MatchDetector.analyse(grid);
    expect(result.cleared.size).toBe(4);
    expect(result.creations[0]?.kind).toBe("surgeRow");
  });

  it("creates a Cataclysm from a vertical 5-match", () => {
    const grid = makeGrid([
      [0, 1, 2, 3, 4],
      [0, 4, 3, 2, 1],
      [0, 1, 2, 3, 4],
      [0, 4, 3, 2, 1],
      [0, 1, 2, 3, 4],
    ]);
    const result = MatchDetector.analyse(grid);
    expect(result.creations[0]?.kind).toBe("cataclysm");
    expect(result.topRunLength).toBeGreaterThanOrEqual(5);
  });

  it("creates an Echo Bomb from an L shape", () => {
    const grid = makeGrid([
      [0, 5, 4],
      [0, 3, 2],
      [0, 0, 0],
    ]);
    const result = MatchDetector.analyse(grid);
    expect(result.creations.some((c) => c.kind === "echoBomb")).toBe(true);
  });
});

describe("BoardManager", () => {
  it("starts with no matches but at least one legal move", () => {
    const board = new BoardManager(8, 8, ALL_ELEMENTS, mulberry32(42));
    expect(MatchDetector.hasMatch(board.grid)).toBe(false);
    expect(board.hasPossibleMove()).toBe(true);
  });

  it("compacts columns under gravity", () => {
    const board = new BoardManager(3, 3, [ElementType.Flame], mulberry32(1));
    board.remove(new Set<string>([posKey({ col: 0, row: 0 }), posKey({ col: 1, row: 0 }), posKey({ col: 2, row: 0 })]));
    const moves = board.applyGravity();
    expect(moves).toHaveLength(6);
    for (let c = 0; c < 3; c++) expect(board.grid.at(c, 0)).not.toBeNull();
  });

  it("refills every empty cell", () => {
    const board = new BoardManager(4, 4, ALL_ELEMENTS, mulberry32(7));
    board.remove(new Set(board.grid.allPositions().map(posKey)));
    const spawns = board.refill();
    expect(spawns).toHaveLength(16);
    expect(board.grid.allPositions().every((p) => board.grid.get(p) !== null)).toBe(true);
  });
});

describe("GameEngine", () => {
  it("rejects a swap that makes no match and restores the board", () => {
    const engine = new GameEngine(LevelGenerator.makeFloor(1), 0, mulberry32(7));
    const before = engine.grid.allPositions().map((p) => engine.grid.get(p)?.id);
    let exercised = false;
    for (const p of engine.grid.allPositions()) {
      const q: GridPosition = { col: p.col + 1, row: p.row };
      if (!engine.grid.contains(q)) continue;
      const res = engine.attemptSwap(p, q);
      exercised = true;
      if (!res.isValid) {
        const after = engine.grid.allPositions().map((pp) => engine.grid.get(pp)?.id);
        expect(after).toEqual(before);
      }
      break;
    }
    expect(exercised).toBe(true);
  });

  it("awards score and essence on a valid swap", () => {
    const engine = new GameEngine(LevelGenerator.makeFloor(2), 0, mulberry32(99));
    for (const p of engine.grid.allPositions()) {
      for (const q of [
        { col: p.col + 1, row: p.row },
        { col: p.col, row: p.row + 1 },
      ]) {
        if (!engine.grid.contains(q)) continue;
        const res = engine.attemptSwap(p, q);
        if (res.isValid) {
          expect(engine.score).toBeGreaterThan(0);
          expect(engine.essenceEarned).toBeGreaterThan(0);
          return;
        }
      }
    }
  });

  it("keeps objective progress within [0,1]", () => {
    const engine = new GameEngine(LevelGenerator.makeFloor(1), 0, mulberry32(1));
    expect(engine.objectiveProgress).toBeGreaterThanOrEqual(0);
    expect(engine.objectiveProgress).toBeLessThanOrEqual(1);
  });
});
