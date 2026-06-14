// Ascendant Echoes — web engine.
//
// A faithful TypeScript port of the Swift `GameEngine` stack (BoardManager,
// MatchDetector, ComboSystem, LevelGenerator). Pure logic, no DOM — so it can
// be unit-tested with Vitest and reused by the Canvas renderer. `row 0` is the
// bottom of the board so gravity pulls toward row 0.

// MARK: - Elements

export enum ElementType {
  Flame = 0,
  Storm,
  Verdant,
  Crystal,
  Shadow,
  Radiant,
}

export const ALL_ELEMENTS: ElementType[] = [
  ElementType.Flame,
  ElementType.Storm,
  ElementType.Verdant,
  ElementType.Crystal,
  ElementType.Shadow,
  ElementType.Radiant,
];

export interface ElementMeta {
  name: string;
  core: string;
  glow: string;
  symbol: string;
  scoreBonus: number;
}

export const ELEMENT_META: Record<ElementType, ElementMeta> = {
  [ElementType.Flame]: { name: "Flame", core: "#FF5C2E", glow: "#FFB34D", symbol: "🔥", scoreBonus: 0 },
  [ElementType.Storm]: { name: "Storm", core: "#6B73FA", glow: "#A6C7FF", symbol: "⚡", scoreBonus: 0 },
  [ElementType.Verdant]: { name: "Verdant", core: "#47D976", glow: "#99FFB3", symbol: "🍃", scoreBonus: 0 },
  [ElementType.Crystal]: { name: "Crystal", core: "#B3F5FF", glow: "#E6FFFF", symbol: "💎", scoreBonus: 0 },
  [ElementType.Shadow]: { name: "Shadow", core: "#7A42A8", glow: "#C68CFF", symbol: "🌙", scoreBonus: 3 },
  [ElementType.Radiant]: { name: "Radiant", core: "#FFD647", glow: "#FFF599", symbol: "☀️", scoreBonus: 4 },
};

// MARK: - Tiles & positions

export type SpecialKind = "none" | "surgeRow" | "surgeColumn" | "echoBomb" | "cataclysm";

export function detonationBonus(kind: SpecialKind): number {
  switch (kind) {
    case "surgeRow":
    case "surgeColumn":
      return 60;
    case "echoBomb":
      return 120;
    case "cataclysm":
      return 250;
    default:
      return 0;
  }
}

export interface GridPosition {
  col: number;
  row: number;
}

export const posKey = (p: GridPosition): string => `${p.col},${p.row}`;
export const parseKey = (k: string): GridPosition => {
  const [c, r] = k.split(",").map(Number);
  return { col: c, row: r };
};

export function isAdjacent(a: GridPosition, b: GridPosition): boolean {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
}

export interface Tile {
  id: string;
  element: ElementType;
  special: SpecialKind;
}

let tileCounter = 0;
export function makeTile(element: ElementType, special: SpecialKind = "none"): Tile {
  tileCounter += 1;
  return { id: `t${tileCounter}`, element, special };
}

// MARK: - RNG (seedable for deterministic tests)

export type RNG = () => number; // returns [0,1)

export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(arr: T[], rng: RNG): T => arr[Math.floor(rng() * arr.length)];

// MARK: - Grid

export class Grid {
  readonly columns: number;
  readonly rows: number;
  cells: (Tile | null)[][];

  constructor(columns: number, rows: number) {
    this.columns = columns;
    this.rows = rows;
    this.cells = Array.from({ length: columns }, () => Array<Tile | null>(rows).fill(null));
  }

  contains(p: GridPosition): boolean {
    return p.col >= 0 && p.col < this.columns && p.row >= 0 && p.row < this.rows;
  }

  get(p: GridPosition): Tile | null {
    return this.contains(p) ? this.cells[p.col][p.row] : null;
  }

  set(p: GridPosition, tile: Tile | null): void {
    if (this.contains(p)) this.cells[p.col][p.row] = tile;
  }

  at(col: number, row: number): Tile | null {
    return this.get({ col, row });
  }

  allPositions(): GridPosition[] {
    const out: GridPosition[] = [];
    for (let c = 0; c < this.columns; c++) for (let r = 0; r < this.rows; r++) out.push({ col: c, row: r });
    return out;
  }
}

// MARK: - Resolution events

export interface TileMove {
  id: string;
  from: GridPosition;
  to: GridPosition;
}
export interface TileSpawn {
  tile: Tile;
  position: GridPosition;
  dropFrom: number;
}
export interface ClearEvent {
  position: GridPosition;
  tile: Tile;
}
export interface SpecialPlacement {
  tileID: string;
  position: GridPosition;
  kind: SpecialKind;
  element: ElementType;
}
export interface CascadeWave {
  clears: ClearEvent[];
  placements: SpecialPlacement[];
  collapses: TileMove[];
  spawns: TileSpawn[];
  comboStep: number;
  multiplier: number;
  scoreDelta: number;
  essenceDelta: number;
  topRunLength: number;
  isResonance: boolean;
  elementCounts: Record<number, number>;
}
export interface SwapResolution {
  isValid: boolean;
  swapA: TileMove;
  swapB: TileMove;
  waves: CascadeWave[];
}

// MARK: - Match detection

interface Run {
  positions: GridPosition[];
  element: ElementType;
  isHorizontal: boolean;
}
export interface SpecialCreation {
  position: GridPosition;
  kind: SpecialKind;
  element: ElementType;
}
export interface MatchResult {
  cleared: Set<string>;
  creations: SpecialCreation[];
  topRunLength: number;
}

function findRuns(grid: Grid): Run[] {
  const runs: Run[] = [];
  // Horizontal.
  for (let row = 0; row < grid.rows; row++) {
    let start = 0;
    while (start < grid.columns) {
      const tile = grid.at(start, row);
      if (!tile) {
        start++;
        continue;
      }
      let end = start + 1;
      while (end < grid.columns && grid.at(end, row)?.element === tile.element) end++;
      if (end - start >= 3) {
        const positions: GridPosition[] = [];
        for (let c = start; c < end; c++) positions.push({ col: c, row });
        runs.push({ positions, element: tile.element, isHorizontal: true });
      }
      start = end;
    }
  }
  // Vertical.
  for (let col = 0; col < grid.columns; col++) {
    let start = 0;
    while (start < grid.rows) {
      const tile = grid.at(col, start);
      if (!tile) {
        start++;
        continue;
      }
      let end = start + 1;
      while (end < grid.rows && grid.at(col, end)?.element === tile.element) end++;
      if (end - start >= 3) {
        const positions: GridPosition[] = [];
        for (let r = start; r < end; r++) positions.push({ col, row: r });
        runs.push({ positions, element: tile.element, isHorizontal: false });
      }
      start = end;
    }
  }
  return runs;
}

function bestAnchor(positions: GridPosition[], anchors: GridPosition[]): GridPosition {
  for (const a of anchors) {
    if (positions.some((p) => p.col === a.col && p.row === a.row)) return a;
  }
  return positions[Math.floor(positions.length / 2)];
}

export const MatchDetector = {
  hasMatch(grid: Grid): boolean {
    return findRuns(grid).length > 0;
  },

  analyse(grid: Grid, anchors: GridPosition[] = []): MatchResult {
    const runs = findRuns(grid);
    if (runs.length === 0) return { cleared: new Set(), creations: [], topRunLength: 0 };

    const cleared = new Set<string>();
    for (const run of runs) for (const p of run.positions) cleared.add(posKey(p));

    const creations: SpecialCreation[] = [];
    const consumed = new Set<string>();

    // Shaped matches (L / T / +) → Echo Bomb.
    const horizontals = runs.filter((r) => r.isHorizontal);
    const verticals = runs.filter((r) => !r.isHorizontal);
    for (const h of horizontals) {
      for (const v of verticals) {
        if (v.element !== h.element) continue;
        const hSet = new Set(h.positions.map(posKey));
        const pivot = v.positions.find((p) => hSet.has(posKey(p)));
        if (!pivot) continue;
        if (h.positions.length >= 3 && v.positions.length >= 3) {
          const anchor = bestAnchor([pivot, ...h.positions, ...v.positions], anchors);
          creations.push({ position: anchor, kind: "echoBomb", element: h.element });
          h.positions.forEach((p) => consumed.add(posKey(p)));
          v.positions.forEach((p) => consumed.add(posKey(p)));
        }
      }
    }

    let topRun = 0;
    for (const run of runs) {
      topRun = Math.max(topRun, run.positions.length);
      if (run.positions.every((p) => consumed.has(posKey(p)))) continue;
      let kind: SpecialKind | null = null;
      if (run.positions.length >= 5) kind = "cataclysm";
      else if (run.positions.length === 4) kind = run.isHorizontal ? "surgeRow" : "surgeColumn";
      if (!kind) continue;
      const anchor = bestAnchor(run.positions, anchors);
      creations.push({ position: anchor, kind, element: run.element });
      run.positions.forEach((p) => consumed.add(posKey(p)));
    }

    return { cleared, creations, topRunLength: topRun };
  },
};

// MARK: - Board manager

export class BoardManager {
  grid: Grid;
  readonly elementPool: ElementType[];
  private rng: RNG;

  constructor(columns: number, rows: number, elementPool: ElementType[], rng: RNG = Math.random) {
    this.grid = new Grid(columns, rows);
    this.elementPool = elementPool.length ? elementPool : ALL_ELEMENTS;
    this.rng = rng;
    this.fillInitialBoard();
  }

  private nonMatchingTile(col: number, row: number): Tile {
    const forbidden = new Set<ElementType>();
    if (col >= 2) {
      const a = this.grid.at(col - 1, row);
      const b = this.grid.at(col - 2, row);
      if (a && b && a.element === b.element) forbidden.add(a.element);
    }
    if (row >= 2) {
      const a = this.grid.at(col, row - 1);
      const b = this.grid.at(col, row - 2);
      if (a && b && a.element === b.element) forbidden.add(a.element);
    }
    const choices = this.elementPool.filter((e) => !forbidden.has(e));
    return makeTile(pick(choices.length ? choices : this.elementPool, this.rng));
  }

  fillInitialBoard(): void {
    for (let c = 0; c < this.grid.columns; c++)
      for (let r = 0; r < this.grid.rows; r++) this.grid.set({ col: c, row: r }, this.nonMatchingTile(c, r));
    if (!this.hasPossibleMove()) this.shuffle();
  }

  swap(a: GridPosition, b: GridPosition): void {
    const tmp = this.grid.get(a);
    this.grid.set(a, this.grid.get(b));
    this.grid.set(b, tmp);
  }

  detonationClears(seed: Set<string>): Set<string> {
    const result = new Set<string>();
    const queue = [...seed];
    while (queue.length) {
      const key = queue.pop()!;
      if (result.has(key)) continue;
      const p = parseKey(key);
      if (!this.grid.contains(p)) continue;
      result.add(key);
      const tile = this.grid.get(p);
      if (!tile || tile.special === "none") continue;
      for (const a of this.affected(tile, p)) {
        const ak = posKey(a);
        if (!result.has(ak)) queue.push(ak);
      }
    }
    return result;
  }

  private affected(tile: Tile, p: GridPosition): GridPosition[] {
    switch (tile.special) {
      case "surgeRow":
        return Array.from({ length: this.grid.columns }, (_, c) => ({ col: c, row: p.row }));
      case "surgeColumn":
        return Array.from({ length: this.grid.rows }, (_, r) => ({ col: p.col, row: r }));
      case "echoBomb": {
        const cells: GridPosition[] = [];
        for (let dc = -1; dc <= 1; dc++)
          for (let dr = -1; dr <= 1; dr++) {
            const q = { col: p.col + dc, row: p.row + dr };
            if (this.grid.contains(q)) cells.push(q);
          }
        return cells;
      }
      case "cataclysm":
        return this.grid.allPositions().filter((q) => this.grid.get(q)?.element === tile.element);
      default:
        return [];
    }
  }

  remove(positions: Set<string>): void {
    for (const k of positions) this.grid.set(parseKey(k), null);
  }

  placeSpecial(creation: SpecialCreation): void {
    const existing = this.grid.get(creation.position);
    if (existing) {
      existing.element = creation.element;
      existing.special = creation.kind;
    } else {
      this.grid.set(creation.position, makeTile(creation.element, creation.kind));
    }
  }

  applyGravity(): TileMove[] {
    const moves: TileMove[] = [];
    for (let c = 0; c < this.grid.columns; c++) {
      let writeRow = 0;
      for (let r = 0; r < this.grid.rows; r++) {
        const tile = this.grid.at(c, r);
        if (!tile) continue;
        if (r !== writeRow) {
          this.grid.set({ col: c, row: writeRow }, tile);
          this.grid.set({ col: c, row: r }, null);
          moves.push({ id: tile.id, from: { col: c, row: r }, to: { col: c, row: writeRow } });
        }
        writeRow++;
      }
    }
    return moves;
  }

  refill(): TileSpawn[] {
    const spawns: TileSpawn[] = [];
    for (let c = 0; c < this.grid.columns; c++) {
      let dropIndex = 0;
      for (let r = 0; r < this.grid.rows; r++) {
        if (this.grid.at(c, r)) continue;
        const tile = makeTile(pick(this.elementPool, this.rng));
        this.grid.set({ col: c, row: r }, tile);
        spawns.push({ tile, position: { col: c, row: r }, dropFrom: this.grid.rows + dropIndex });
        dropIndex++;
      }
    }
    return spawns;
  }

  findHint(): [GridPosition, GridPosition] | null {
    for (let c = 0; c < this.grid.columns; c++) {
      for (let r = 0; r < this.grid.rows; r++) {
        const p = { col: c, row: r };
        for (const q of [
          { col: c + 1, row: r },
          { col: c, row: r + 1 },
        ]) {
          if (!this.grid.contains(q)) continue;
          this.swap(p, q);
          const matched = MatchDetector.hasMatch(this.grid);
          this.swap(p, q);
          if (matched) return [p, q];
        }
      }
    }
    return null;
  }

  hasPossibleMove(): boolean {
    return this.findHint() !== null;
  }

  shuffle(): void {
    const tiles = this.grid.allPositions().map((p) => this.grid.get(p)!).filter(Boolean);
    let attempts = 0;
    do {
      // Fisher–Yates with our RNG.
      for (let i = tiles.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
      }
      let idx = 0;
      for (let c = 0; c < this.grid.columns; c++)
        for (let r = 0; r < this.grid.rows; r++) this.grid.set({ col: c, row: r }, tiles[idx++]);
      attempts++;
    } while ((MatchDetector.hasMatch(this.grid) || !this.hasPossibleMove()) && attempts < 50);
  }
}

// MARK: - Combo system

export const FURY_THRESHOLD = 4;
export const RESONANCE_MULTIPLIER = 10;

export class ComboSystem {
  comboStep = 0;
  furyActive = false;
  private basePerTile = 12;

  reset(): void {
    this.comboStep = 0;
    this.furyActive = false;
  }

  register(clearedCount: number, detonationBonusTotal: number, isResonance: boolean) {
    this.comboStep += 1;
    if (this.comboStep >= FURY_THRESHOLD) this.furyActive = true;
    let multiplier = Math.pow(1.5, this.comboStep - 1);
    if (this.furyActive) multiplier *= 1.5;
    if (isResonance) multiplier = Math.max(multiplier, RESONANCE_MULTIPLIER);
    multiplier = Math.min(multiplier, 64);
    const base = clearedCount * this.basePerTile + detonationBonusTotal;
    return { score: Math.round(base * multiplier), multiplier, comboStep: this.comboStep, fury: this.furyActive };
  }

  essence(clearedCount: number, specials: number): number {
    return clearedCount + specials * 3;
  }
}

// MARK: - Floors

export type FloorObjective =
  | { kind: "reachScore"; target: number }
  | { kind: "collect"; element: ElementType; count: number }
  | { kind: "survive"; moves: number; minScore: number };

export function objectiveSummary(o: FloorObjective): string {
  switch (o.kind) {
    case "reachScore":
      return `Score ${o.target.toLocaleString()}`;
    case "collect":
      return `Collect ${o.count} ${ELEMENT_META[o.element].name}`;
    case "survive":
      return `Score ${o.minScore.toLocaleString()} in ${o.moves} moves`;
  }
}

export enum Biome {
  EtherealClouds = 0,
  AncientRuins,
  CosmicVoid,
  LushRealm,
}

export const BIOME_META: Record<Biome, { name: string; sky: [string, string] }> = {
  [Biome.EtherealClouds]: { name: "Ethereal Reaches", sky: ["#33477F", "#8C6BC7"] },
  [Biome.AncientRuins]: { name: "Sunken Ruins", sky: ["#1A2938", "#47666B"] },
  [Biome.CosmicVoid]: { name: "The Cosmic Void", sky: ["#08051A", "#2E0F4D"] },
  [Biome.LushRealm]: { name: "Verdant Sanctum", sky: ["#103328", "#296B4D"] },
};

export interface Floor {
  id: number;
  columns: number;
  rows: number;
  moveBudget: number;
  objective: FloorObjective;
  elementPool: ElementType[];
  biome: Biome;
  vision: string;
}

const VISIONS = [
  "A staircase of light unspools above you, humming with forgotten names.",
  "The echo of your own heartbeat answers from somewhere far higher.",
  "Dust of fallen stars settles on your shoulders like a blessing.",
  "Every orb you shatter remembers the shape of the one before it.",
  "The tower leans toward the dawn it has never been allowed to reach.",
  "You are not the first Wanderer. You may be the one who arrives.",
  "Silence here is a colour, and it is learning your true hue.",
  "Below, the world forgets you. Above, the tower begins to.",
];

export const LevelGenerator = {
  makeFloor(number: number): Floor {
    const n = Math.max(1, number);
    const dimension = Math.min(9, 7 + Math.floor((n - 1) / 8));
    const elementCount = Math.min(ALL_ELEMENTS.length, 4 + Math.floor((n - 1) / 3));
    const pool = ALL_ELEMENTS.slice(0, elementCount);
    const moveBudget = Math.max(18, 32 - Math.floor(n / 4));
    const biome = (n - 1) % 4 as Biome;
    const vision = VISIONS[(n - 1) % VISIONS.length];

    let objective: FloorObjective;
    switch (n % 3) {
      case 1:
        objective = { kind: "reachScore", target: 1500 + n * 650 };
        break;
      case 2:
        objective = { kind: "collect", element: pool[Math.floor(n / 3) % pool.length], count: 24 + n * 3 };
        break;
      default:
        objective = { kind: "survive", moves: Math.max(16, 24 - Math.floor(n / 6)), minScore: 1200 + n * 500 };
    }

    return { id: n, columns: dimension, rows: dimension, moveBudget, objective, elementPool: pool, biome, vision };
  },
};

export type Outcome = "inProgress" | "won" | "lost";

// MARK: - Game engine

export class GameEngine {
  readonly floor: Floor;
  readonly board: BoardManager;
  private combo = new ComboSystem();

  score = 0;
  movesRemaining: number;
  collected: Record<number, number> = {};
  essenceEarned = 0;
  reshapeCharges = 0;

  constructor(floor: Floor, extraMoves = 0, rng: RNG = Math.random) {
    this.floor = floor;
    this.movesRemaining = floor.moveBudget + extraMoves;
    this.board = new BoardManager(floor.columns, floor.rows, floor.elementPool, rng);
  }

  get grid(): Grid {
    return this.board.grid;
  }

  attemptSwap(a: GridPosition, b: GridPosition): SwapResolution {
    const tileA = this.grid.get(a);
    const tileB = this.grid.get(b);
    const swapA: TileMove = { id: tileA?.id ?? "x", from: a, to: b };
    const swapB: TileMove = { id: tileB?.id ?? "x", from: b, to: a };

    if (!isAdjacent(a, b) || !tileA || !tileB) return { isValid: false, swapA, swapB, waves: [] };

    this.board.swap(a, b);
    if (!MatchDetector.hasMatch(this.grid)) {
      this.board.swap(a, b);
      return { isValid: false, swapA, swapB, waves: [] };
    }

    this.movesRemaining = Math.max(0, this.movesRemaining - 1);
    const waves = this.runCascades([a, b]);
    return { isValid: true, swapA, swapB, waves };
  }

  reshape(a: GridPosition, b: GridPosition): SwapResolution | null {
    if (this.reshapeCharges <= 0 || !this.grid.get(a) || !this.grid.get(b)) return null;
    this.reshapeCharges -= 1;
    const swapA: TileMove = { id: this.grid.get(a)!.id, from: a, to: b };
    const swapB: TileMove = { id: this.grid.get(b)!.id, from: b, to: a };
    this.board.swap(a, b);
    const waves = this.runCascades([a, b]);
    return { isValid: true, swapA, swapB, waves };
  }

  echoBlast(p: GridPosition): CascadeWave[] | null {
    if (!this.grid.get(p)) return null;
    this.combo.reset();
    const waves = [this.applyClear(new Set([posKey(p)]), [], 0, true)];
    waves.push(...this.continueCascades());
    if (!this.board.hasPossibleMove()) this.board.shuffle();
    return waves;
  }

  private runCascades(anchors: GridPosition[]): CascadeWave[] {
    this.combo.reset();
    const waves: CascadeWave[] = [];
    const first = MatchDetector.analyse(this.grid, anchors);
    if (first.cleared.size > 0) {
      waves.push(this.applyClear(first.cleared, first.creations, first.topRunLength, false));
      waves.push(...this.continueCascades());
    }
    if (!this.board.hasPossibleMove()) this.board.shuffle();
    return waves;
  }

  private continueCascades(): CascadeWave[] {
    const waves: CascadeWave[] = [];
    for (;;) {
      const result = MatchDetector.analyse(this.grid);
      if (result.cleared.size === 0) break;
      waves.push(this.applyClear(result.cleared, result.creations, result.topRunLength, false));
    }
    return waves;
  }

  private applyClear(
    seed: Set<string>,
    creations: SpecialCreation[],
    topRunLength: number,
    forceResonance: boolean
  ): CascadeWave {
    const isResonance = forceResonance || topRunLength >= 5 || creations.some((c) => c.kind === "echoBomb");
    const creationAnchors = new Set(creations.map((c) => posKey(c.position)));
    const expanded = this.board.detonationClears(seed);
    const finalCleared = new Set([...expanded].filter((k) => !creationAnchors.has(k)));

    const clears: ClearEvent[] = [];
    const elementCounts: Record<number, number> = {};
    let detBonus = 0;
    for (const k of finalCleared) {
      const p = parseKey(k);
      const tile = this.grid.get(p);
      if (!tile) continue;
      clears.push({ position: p, tile: { ...tile } });
      elementCounts[tile.element] = (elementCounts[tile.element] ?? 0) + 1;
      this.collected[tile.element] = (this.collected[tile.element] ?? 0) + 1;
      detBonus += detonationBonus(tile.special);
    }

    const scored = this.combo.register(clears.length, detBonus, isResonance);
    const essenceDelta = this.combo.essence(clears.length, creations.length);
    this.score += scored.score;
    this.essenceEarned += essenceDelta;

    this.board.remove(finalCleared);
    const placements: SpecialPlacement[] = [];
    for (const creation of creations) {
      this.board.placeSpecial(creation);
      const tile = this.grid.get(creation.position);
      if (tile)
        placements.push({ tileID: tile.id, position: creation.position, kind: creation.kind, element: creation.element });
    }
    const collapses = this.board.applyGravity();
    const spawns = this.board.refill();

    return {
      clears,
      placements,
      collapses,
      spawns,
      comboStep: scored.comboStep,
      multiplier: scored.multiplier,
      scoreDelta: scored.score,
      essenceDelta,
      topRunLength,
      isResonance,
      elementCounts,
    };
  }

  get outcome(): Outcome {
    if (this.objectiveMet) return "won";
    if (this.movesRemaining <= 0) return "lost";
    return "inProgress";
  }

  get objectiveMet(): boolean {
    const o = this.floor.objective;
    switch (o.kind) {
      case "reachScore":
        return this.score >= o.target;
      case "collect":
        return (this.collected[o.element] ?? 0) >= o.count;
      case "survive":
        return this.movesRemaining <= 0 && this.score >= o.minScore;
    }
  }

  get objectiveProgress(): number {
    const o = this.floor.objective;
    switch (o.kind) {
      case "reachScore":
        return Math.min(1, this.score / Math.max(1, o.target));
      case "collect":
        return Math.min(1, (this.collected[o.element] ?? 0) / Math.max(1, o.count));
      case "survive":
        return Math.min(1, this.score / Math.max(1, o.minScore));
    }
  }
}
