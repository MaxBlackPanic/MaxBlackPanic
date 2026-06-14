// Canvas renderer + input controller for the web build of Ascendant Echoes.
//
// Mirrors the SpriteKit `GameScene`: it owns no game truth (that lives in
// `GameEngine`); it merely replays the engine's `SwapResolution` waves as juicy
// animation — swaps slide, matches burst into particles, survivors fall with
// easing, fresh orbs rain in from above — and reports state to React.

import {
  GameEngine,
  ELEMENT_META,
  BIOME_META,
  type CascadeWave,
  type SwapResolution,
  type GridPosition,
  type ElementType,
  type SpecialKind,
  type Outcome,
} from "./engine";

const SWAP = 140;
const CLEAR = 200;
const COLLAPSE = 240;
const SPAWN = 260;

type Ease = "linear" | "easeIn" | "easeOut";

interface Sprite {
  id: string;
  element: ElementType;
  special: SpecialKind;
  x: number;
  y: number;
  scale: number;
  alpha: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface Tween {
  target: Sprite;
  keys: string[];
  from: Record<string, number>;
  to: Record<string, number>;
  start: number;
  dur: number;
  ease: Ease;
  resolve: () => void;
  done: boolean;
}

export interface ControllerCallbacks {
  onState?: (score: number, moves: number, progress: number) => void;
  onWave?: (wave: CascadeWave) => void;
  onResonance?: () => void;
  onFinish?: (outcome: Outcome, score: number, essence: number) => void;
}

function applyEase(t: number, ease: Ease): number {
  switch (ease) {
    case "easeIn":
      return t * t;
    case "easeOut":
      return 1 - (1 - t) * (1 - t);
    default:
      return t;
  }
}

export class GameController {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private engine: GameEngine;
  private cb: ControllerCallbacks;

  private sprites = new Map<string, Sprite>();
  private particles: Particle[] = [];
  private tweens: Tween[] = [];

  private cssW = 0;
  private cssH = 0;
  private cell = 40;
  private originX = 0;
  private boardTop = 0;
  private boardH = 0;
  private dpr = 1;

  private inputLocked = false;
  private dragStart: { p: GridPosition; x: number; y: number } | null = null;
  private shakeUntil = 0;
  private rafId = 0;
  private lastTs = 0;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement, engine: GameEngine, cb: ControllerCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.engine = engine;
    this.cb = cb;
  }

  // MARK: - Lifecycle

  start(): void {
    this.resize();
    this.buildSprites();
    this.attachInput();
    this.emitState();
    this.lastTs = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.rafId);
    this.detachInput();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.cssW = rect.width;
    this.cssH = rect.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(this.cssW * this.dpr);
    this.canvas.height = Math.floor(this.cssH * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.layout();
    // Snap sprites to their cells after a resize.
    for (const p of this.engine.grid.allPositions()) {
      const tile = this.engine.grid.get(p);
      if (!tile) continue;
      const s = this.sprites.get(tile.id);
      if (s) {
        const px = this.pixel(p.col, p.row);
        s.x = px.x;
        s.y = px.y;
      }
    }
  }

  private layout(): void {
    const cols = this.engine.floor.columns;
    const rows = this.engine.floor.rows;
    this.cell = Math.min((this.cssW * 0.94) / cols, (this.cssH * 0.66) / rows);
    const boardW = this.cell * cols;
    this.boardH = this.cell * rows;
    this.originX = (this.cssW - boardW) / 2 + this.cell / 2;
    this.boardTop = (this.cssH - this.boardH) / 2 + this.cssH * 0.03;
  }

  private pixel(col: number, row: number): { x: number; y: number } {
    return {
      x: this.originX + col * this.cell,
      y: this.boardTop + this.boardH - this.cell / 2 - row * this.cell,
    };
  }

  private cellFromPixel(x: number, y: number): GridPosition | null {
    const col = Math.round((x - this.originX) / this.cell);
    const row = Math.round((this.boardTop + this.boardH - this.cell / 2 - y) / this.cell);
    const p = { col, row };
    return this.engine.grid.contains(p) ? p : null;
  }

  private buildSprites(): void {
    this.sprites.clear();
    for (const p of this.engine.grid.allPositions()) {
      const tile = this.engine.grid.get(p);
      if (!tile) continue;
      const px = this.pixel(p.col, p.row);
      this.sprites.set(tile.id, {
        id: tile.id,
        element: tile.element,
        special: tile.special,
        x: px.x,
        y: px.y,
        scale: 1,
        alpha: 1,
      });
    }
  }

  // MARK: - Input

  private attachInput(): void {
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
  }
  private detachInput(): void {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
  }

  private localPoint(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.inputLocked) return;
    const pt = this.localPoint(e);
    const cell = this.cellFromPixel(pt.x, pt.y);
    if (cell) this.dragStart = { p: cell, x: pt.x, y: pt.y };
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.inputLocked || !this.dragStart) return;
    const pt = this.localPoint(e);
    const dx = pt.x - this.dragStart.x;
    const dy = pt.y - this.dragStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < this.cell * 0.35) return;
    const start = this.dragStart.p;
    let target: GridPosition;
    if (Math.abs(dx) > Math.abs(dy)) target = { col: start.col + (dx > 0 ? 1 : -1), row: start.row };
    else target = { col: start.col, row: start.row + (dy < 0 ? 1 : -1) }; // screen-up = row+1
    this.dragStart = null;
    if (!this.engine.grid.contains(target)) return;
    void this.playResolution(this.engine.attemptSwap(start, target));
  };

  private onPointerUp = () => {
    this.dragStart = null;
  };

  // MARK: - Public helpers (driven by React buttons)

  showHint(): void {
    if (this.inputLocked) return;
    const hint = this.engine.board.findHint();
    if (!hint) return;
    for (const p of hint) {
      const tile = this.engine.grid.get(p);
      const s = tile && this.sprites.get(tile.id);
      if (s) void this.tween(s, { scale: 1.3 }, 180).then(() => this.tween(s, { scale: 1 }, 180));
    }
  }

  useEchoBlastNext = false;
  armEchoBlast(): void {
    this.useEchoBlastNext = true;
  }

  // MARK: - Animation playback

  private async playResolution(res: SwapResolution): Promise<void> {
    this.inputLocked = true;
    const a = this.sprites.get(res.swapA.id);
    const b = this.sprites.get(res.swapB.id);
    const pa = this.pixel(res.swapA.to.col, res.swapA.to.row);
    const pb = this.pixel(res.swapB.to.col, res.swapB.to.row);

    if (!res.isValid) {
      await Promise.all([this.tween(a, { x: pa.x, y: pa.y }, SWAP), this.tween(b, { x: pb.x, y: pb.y }, SWAP)]);
      const fa = this.pixel(res.swapA.from.col, res.swapA.from.row);
      const fb = this.pixel(res.swapB.from.col, res.swapB.from.row);
      await Promise.all([this.tween(a, { x: fa.x, y: fa.y }, SWAP), this.tween(b, { x: fb.x, y: fb.y }, SWAP)]);
      this.inputLocked = false;
      return;
    }

    await Promise.all([this.tween(a, { x: pa.x, y: pa.y }, SWAP), this.tween(b, { x: pb.x, y: pb.y }, SWAP)]);
    for (const wave of res.waves) await this.playWave(wave);
    this.finish();
  }

  private async playWave(wave: CascadeWave): Promise<void> {
    this.cb.onWave?.(wave);
    this.emitState();
    if (wave.isResonance) {
      this.cb.onResonance?.();
      this.shakeUntil = performance.now() + 260;
    }

    // Clears + particle bursts.
    const clearProms: Promise<void>[] = [];
    for (const c of wave.clears) {
      const px = this.pixel(c.position.col, c.position.row);
      const heavy = c.tile.special !== "none" || wave.isResonance;
      this.spawnParticles(px.x, px.y, ELEMENT_META[c.tile.element].glow, heavy ? 26 : 12, heavy ? 320 : 150);
      const s = this.sprites.get(c.tile.id);
      if (s) clearProms.push(this.tween(s, { scale: 1.5, alpha: 0 }, CLEAR).then(() => void this.sprites.delete(c.tile.id)));
    }

    // Special placements — restyle surviving anchor sprites with a pop.
    for (const pl of wave.placements) {
      const s = this.sprites.get(pl.tileID);
      if (!s) continue;
      s.element = pl.element;
      s.special = pl.kind;
      void this.tween(s, { scale: 1.3 }, 90).then(() => this.tween(s, { scale: 1 }, 110));
    }

    await Promise.all(clearProms);

    // Collapse + refill.
    const moveProms: Promise<void>[] = [];
    for (const m of wave.collapses) {
      const s = this.sprites.get(m.id);
      if (!s) continue;
      const px = this.pixel(m.to.col, m.to.row);
      moveProms.push(this.tween(s, { x: px.x, y: px.y }, COLLAPSE, "easeIn"));
    }
    for (const sp of wave.spawns) {
      const from = this.pixel(sp.position.col, sp.dropFrom);
      const to = this.pixel(sp.position.col, sp.position.row);
      const sprite: Sprite = {
        id: sp.tile.id,
        element: sp.tile.element,
        special: sp.tile.special,
        x: from.x,
        y: from.y,
        scale: 1,
        alpha: 1,
      };
      this.sprites.set(sp.tile.id, sprite);
      moveProms.push(this.tween(sprite, { x: to.x, y: to.y }, SPAWN, "easeIn"));
    }
    await Promise.all(moveProms);
  }

  private finish(): void {
    const outcome = this.engine.outcome;
    if (outcome !== "inProgress") {
      this.cb.onFinish?.(outcome, this.engine.score, this.engine.essenceEarned);
      // Keep input locked; the floor is over.
    } else {
      this.inputLocked = false;
    }
  }

  private emitState(): void {
    this.cb.onState?.(this.engine.score, this.engine.movesRemaining, this.engine.objectiveProgress);
  }

  // MARK: - Tweening

  private tween(target: Sprite | undefined, props: Record<string, number>, dur: number, ease: Ease = "easeOut"): Promise<void> {
    if (!target) return Promise.resolve();
    const keys = Object.keys(props);
    const from: Record<string, number> = {};
    for (const k of keys) from[k] = (target as unknown as Record<string, number>)[k];
    return new Promise<void>((resolve) => {
      this.tweens.push({ target, keys, from, to: props, start: performance.now(), dur, ease, resolve, done: false });
    });
  }

  private updateTweens(now: number): void {
    for (const tw of this.tweens) {
      const t = tw.dur <= 0 ? 1 : Math.min(1, (now - tw.start) / tw.dur);
      const e = applyEase(t, tw.ease);
      const obj = tw.target as unknown as Record<string, number>;
      for (const k of tw.keys) obj[k] = tw.from[k] + (tw.to[k] - tw.from[k]) * e;
      if (t >= 1 && !tw.done) {
        tw.done = true;
        tw.resolve();
      }
    }
    this.tweens = this.tweens.filter((tw) => !tw.done);
  }

  // MARK: - Particles

  private spawnParticles(x: number, y: number, color: string, count: number, power: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = power * (0.4 + Math.random() * 0.8);
      const life = 0.4 + Math.random() * 0.5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: this.cell * (0.06 + Math.random() * 0.1),
        color,
      });
    }
    if (this.particles.length > 1200) this.particles.splice(0, this.particles.length - 1200);
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 380 * dt; // gentle gravity
      p.vx *= 0.96;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  // MARK: - Render loop

  private loop = (ts: number) => {
    if (this.destroyed) return;
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    this.updateTweens(ts);
    this.updateParticles(dt);
    this.render(ts);
    this.rafId = requestAnimationFrame(this.loop);
  };

  private render(ts: number): void {
    const ctx = this.ctx;
    ctx.save();

    // Screen shake.
    if (ts < this.shakeUntil) {
      const amt = 6 * ((this.shakeUntil - ts) / 260);
      ctx.translate((Math.random() - 0.5) * amt * 2, (Math.random() - 0.5) * amt * 2);
    }

    // Backdrop gradient (biome).
    const sky = BIOME_META[this.engine.floor.biome].sky;
    const g = ctx.createLinearGradient(0, 0, 0, this.cssH);
    g.addColorStop(0, sky[0]);
    g.addColorStop(1, sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, this.cssW + 40, this.cssH + 40);

    // Board frame.
    const cols = this.engine.floor.columns;
    const rows = this.engine.floor.rows;
    const bx = this.originX - this.cell / 2 - 8;
    const by = this.boardTop - 8;
    this.roundRect(bx, by, this.cell * cols + 16, this.cell * rows + 16, 18);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fill();

    // Orbs.
    const sprites = [...this.sprites.values()];
    for (const s of sprites) this.drawOrb(s, ts);

    // Particles.
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    ctx.restore();
  }

  private drawOrb(s: Sprite, ts: number): void {
    const ctx = this.ctx;
    const meta = ELEMENT_META[s.element];
    const r = (this.cell * 0.42) * s.scale;
    ctx.save();
    ctx.globalAlpha = s.alpha;

    // Glow.
    const shimmer = 0.28 + 0.12 * Math.sin(ts / 600 + s.x);
    ctx.globalAlpha = s.alpha * shimmer;
    ctx.fillStyle = meta.glow;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r * 1.25, 0, Math.PI * 2);
    ctx.fill();

    // Body.
    ctx.globalAlpha = s.alpha;
    const grad = ctx.createRadialGradient(s.x - r * 0.3, s.y - r * 0.3, r * 0.1, s.x, s.y, r);
    grad.addColorStop(0, meta.glow);
    grad.addColorStop(1, meta.core);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.strokeStyle = meta.glow;
    ctx.stroke();

    // Glyph.
    ctx.globalAlpha = s.alpha * 0.95;
    ctx.font = `${r * 1.05}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(meta.symbol, s.x, s.y + r * 0.05);

    // Special badge ring.
    if (s.special !== "none") {
      ctx.globalAlpha = s.alpha * (0.7 + 0.3 * Math.sin(ts / 200));
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(1.5, r * 0.12);
      ctx.beginPath();
      ctx.arc(s.x, s.y, r * 1.1, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private roundRect(x: number, y: number, w: number, h: number, radius: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
}
