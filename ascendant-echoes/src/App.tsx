import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import {
  GameEngine,
  LevelGenerator,
  objectiveSummary,
  BIOME_META,
  type Floor,
  type Outcome,
} from "./engine";
import { GameController } from "./gameController";

// ---- Lightweight persistent progress (localStorage) -------------------------

interface Progress {
  currentFloor: number;
  highestFloor: number;
  essence: number;
  level: number;
}

const STORAGE_KEY = "ae_web_progress_v1";
const defaultProgress: Progress = { currentFloor: 1, highestFloor: 1, essence: 0, level: 1 };

function loadProgress(): Progress {
  if (typeof window === "undefined") return defaultProgress;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaultProgress, ...JSON.parse(raw) } : defaultProgress;
  } catch {
    return defaultProgress;
  }
}

function saveProgress(p: Progress): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore quota / privacy errors */
  }
}

const essenceForNextLevel = (level: number) => Math.floor(120 * Math.pow(1.18, level - 1));

function gainEssence(p: Progress, amount: number): Progress {
  let { essence, level } = p;
  essence += amount;
  while (essence >= essenceForNextLevel(level)) {
    essence -= essenceForNextLevel(level);
    level += 1;
  }
  return { ...p, essence, level };
}

const wandererTitle = (level: number) =>
  level >= 25 ? "The Ascendant" : level >= 12 ? "Radiant Luminary" : level >= 5 ? "Echo Adept" : "Resonant Wanderer";

type Screen = "menu" | "intro" | "play" | "result";

// ---- Component --------------------------------------------------------------

export default function App() {
  const [progress, setProgress] = useState<Progress>(defaultProgress);
  const [screen, setScreen] = useState<Screen>("menu");
  const [floor, setFloor] = useState<Floor | null>(null);

  const [hud, setHud] = useState({ score: 0, moves: 0, progress: 0 });
  const [combo, setCombo] = useState<{ step: number; mult: number } | null>(null);
  const [resonance, setResonance] = useState(false);
  const [result, setResult] = useState<{ outcome: Outcome; score: number; essence: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<GameController | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const comboTimer = useRef<ReturnType<typeof setTimeout>>();
  const resonanceTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => setProgress(loadProgress()), []);

  // Set up / tear down the canvas controller whenever we enter play.
  useEffect(() => {
    if (screen !== "play" || !canvasRef.current || !engineRef.current) return;
    const controller = new GameController(canvasRef.current, engineRef.current, {
      onState: (score, moves, prog) => setHud({ score, moves, progress: prog }),
      onWave: (wave) => {
        if (wave.comboStep >= 2) {
          setCombo({ step: wave.comboStep, mult: wave.multiplier });
          clearTimeout(comboTimer.current);
          comboTimer.current = setTimeout(() => setCombo(null), 1100);
        }
      },
      onResonance: () => {
        setResonance(true);
        clearTimeout(resonanceTimer.current);
        resonanceTimer.current = setTimeout(() => setResonance(false), 500);
      },
      onFinish: (outcome, score, essence) => {
        setProgress((prev) => {
          let next = gainEssence(prev, essence);
          if (outcome === "won" && floor) {
            next = { ...next, highestFloor: Math.max(next.highestFloor, floor.id), currentFloor: floor.id + 1 };
          }
          saveProgress(next);
          return next;
        });
        setTimeout(() => setResult({ outcome, score, essence }), 450);
        setTimeout(() => setScreen("result"), 450);
      },
    });
    controllerRef.current = controller;
    controller.start();

    const onResize = () => controller.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      controller.destroy();
      controllerRef.current = null;
    };
  }, [screen, floor]);

  const startClimb = useCallback(() => {
    const f = LevelGenerator.makeFloor(progress.currentFloor);
    setFloor(f);
    setScreen("intro");
  }, [progress.currentFloor]);

  const beginFloor = useCallback(() => {
    if (!floor) return;
    engineRef.current = new GameEngine(floor);
    setHud({ score: 0, moves: floor.moveBudget, progress: 0 });
    setResult(null);
    setCombo(null);
    setScreen("play");
  }, [floor]);

  const goMenu = useCallback(() => {
    setScreen("menu");
    setFloor(null);
  }, []);

  // ---- Screens --------------------------------------------------------------

  if (screen === "menu") {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
          <div>
            <h1 className="text-5xl font-black tracking-[0.2em] text-white drop-shadow-[0_0_20px_rgba(125,211,252,0.6)]">
              ASCENDANT
            </h1>
            <p className="mt-1 text-2xl font-semibold tracking-[0.5em] text-cyan-300">ECHOES</p>
          </div>

          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="text-7xl">🧙</div>
            <p className="mt-3 text-xl font-bold text-white">{wandererTitle(progress.level)}</p>
            <p className="text-sm text-white/60">Level {progress.level}</p>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-cyan-200 transition-all"
                style={{ width: `${(progress.essence / essenceForNextLevel(progress.level)) * 100}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-white/60">
              <span>
                {progress.essence} / {essenceForNextLevel(progress.level)} Essence
              </span>
              <span>Highest: Floor {progress.highestFloor}</span>
            </div>
          </div>

          <button onClick={startClimb} className={btnPrimary}>
            ↑ Ascend · Floor {progress.currentFloor}
          </button>
          <p className="max-w-xs text-xs text-white/40">
            Swap adjacent orbs to match 3+. Match 4/5 or make L/T shapes for huge combos.
          </p>
        </div>
      </Shell>
    );
  }

  if (screen === "intro" && floor) {
    const biome = BIOME_META[floor.biome];
    return (
      <Shell sky={biome.sky}>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <h2 className="text-5xl font-black text-white drop-shadow-[0_0_16px_rgba(125,211,252,0.6)]">
            FLOOR {floor.id}
          </h2>
          <p className="tracking-[0.4em] text-cyan-200">{biome.name.toUpperCase()}</p>
          <p className="max-w-md px-4 text-lg italic text-white/85">“{floor.vision}”</p>
          <div className="w-full max-w-xs space-y-2 rounded-2xl border border-white/10 bg-white/5 p-5 text-white">
            <Row icon="🎯" text={objectiveSummary(floor.objective)} />
            <Row icon="✋" text={`${floor.moveBudget} moves`} />
            <Row icon="🧩" text={`${floor.columns}×${floor.rows} board`} />
          </div>
          <button onClick={beginFloor} className={btnPrimary}>
            ▶ Begin Ascent
          </button>
          <button onClick={goMenu} className={btnGhost}>
            Retreat
          </button>
        </div>
      </Shell>
    );
  }

  // play (and result overlays on top of the canvas)
  return (
    <Shell padded={false}>
      <div className="relative h-full w-full">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

        {/* HUD */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <button onClick={goMenu} className="pointer-events-auto rounded-full bg-black/40 px-3 py-1 text-white/80">
            ✕
          </button>
          <div className="rounded-2xl bg-black/40 px-4 py-2 text-center backdrop-blur">
            <div className="text-2xl font-black text-white tabular-nums">{hud.score.toLocaleString()}</div>
            <div className="text-[11px] text-white/70">{floor ? objectiveSummary(floor.objective) : ""}</div>
            <div className="mx-auto mt-1 h-2 w-40 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-300 transition-all"
                style={{ width: `${hud.progress * 100}%` }}
              />
            </div>
          </div>
          <div className="rounded-2xl bg-black/40 px-3 py-2 text-center">
            <div className={`text-2xl font-bold tabular-nums ${hud.moves <= 3 ? "text-red-400" : "text-white"}`}>
              {hud.moves}
            </div>
            <div className="text-[10px] text-white/70">moves</div>
          </div>
        </div>

        {/* Ability bar */}
        <div className="absolute inset-x-0 bottom-4 flex justify-center gap-3">
          <button
            onClick={() => controllerRef.current?.showHint()}
            className="pointer-events-auto flex h-16 w-16 flex-col items-center justify-center rounded-2xl border border-cyan-400/50 bg-black/40 text-white backdrop-blur"
          >
            <span className="text-xl">💡</span>
            <span className="text-[10px]">Hint</span>
          </button>
        </div>

        {/* Combo popup */}
        {combo && (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 flex flex-col items-center">
            <div className="animate-pulse text-4xl font-black text-white drop-shadow-[0_0_16px_rgba(255,160,0,0.9)]">
              COMBO ×{combo.step}
            </div>
            <div className="text-lg font-bold text-amber-200">{combo.mult.toFixed(1)}× score</div>
          </div>
        )}

        {/* Resonance flash */}
        {resonance && <div className="pointer-events-none absolute inset-0 bg-white/20" />}

        {/* Result overlay */}
        {result && floor && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/70 p-6 text-center">
            <div className="text-7xl">{result.outcome === "won" ? "🏆" : "💫"}</div>
            <h3 className="text-3xl font-bold text-white">
              {result.outcome === "won" ? `Floor ${floor.id} Ascended!` : "The Echo Fades"}
            </h3>
            <div className="w-full max-w-xs space-y-2 rounded-2xl border border-white/10 bg-white/5 p-5 text-white">
              <Row icon="⭐" text={`Score: ${result.score.toLocaleString()}`} />
              <Row icon="💧" text={`Essence: +${result.essence}`} />
            </div>
            {result.outcome === "won" ? (
              <button onClick={() => { setScreen("menu"); setTimeout(startClimb, 0); }} className={btnPrimary}>
                ↑ Continue Climb
              </button>
            ) : (
              <button onClick={beginFloor} className={btnPrimary}>
                ↻ Try Again
              </button>
            )}
            <button onClick={goMenu} className={btnGhost}>
              Return to Sanctum
            </button>
          </div>
        )}
      </div>
    </Shell>
  );
}

// ---- Small presentational helpers ------------------------------------------

function Shell({
  children,
  sky,
  padded = true,
}: {
  children: React.ReactNode;
  sky?: [string, string];
  padded?: boolean;
}) {
  const background = sky
    ? `linear-gradient(to bottom, ${sky[0]}, ${sky[1]})`
    : "linear-gradient(to bottom, #0d0a24, #211244, #0a1933)";
  return (
    <div className="flex min-h-[100dvh] w-full justify-center" style={{ background }}>
      <div className={`flex w-full max-w-md flex-col ${padded ? "p-5" : ""}`}>{children}</div>
    </div>
  );
}

function Row({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-3 text-left">
      <span>{icon}</span>
      <span className="font-medium">{text}</span>
    </div>
  );
}

const btnPrimary =
  "rounded-full bg-gradient-to-b from-cyan-400 to-cyan-500 px-8 py-4 text-base font-bold text-black shadow-[0_4px_20px_rgba(34,211,238,0.5)] active:scale-95 transition";
const btnGhost = "rounded-full border border-white/30 px-6 py-2 text-sm font-medium text-white/80 active:scale-95 transition";
