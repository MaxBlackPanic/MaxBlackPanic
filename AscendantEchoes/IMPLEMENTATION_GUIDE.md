# Implementation Guide — Ascendant Echoes

This guide explains the **build order** (vertical slice first), how each module
fits, and where to extend. Follow it top-to-bottom to understand or rebuild the
project from scratch.

## 0. The core loop (build this first)

> Player swaps two orbs → matches resolve into cascades → score/essence accrue →
> objective met → ascend a floor → spend essence on power → repeat.

The vertical slice = **basic matching + one floor + basic progression**, which
is everything in `Engine/` + `GameScene` + a minimal `GameView`. Everything else
(shop, daily rewards, Game Center, IAP) layers on without touching the loop.

## 1. Models (no dependencies)

- `ElementType` — the six elements, their colours, glyphs, score bonuses.
- `Tile` / `GridPosition` / `SpecialKind` — board atoms. `row 0` is the bottom.
- `Floor` / `Biome` / `FloorObjective` — the description of a level.

## 2. Pure engine (`Engine/`)

Build and unit-test these **before any rendering**:

1. `Grid` — value-type 2-D store with bounds-safe subscripts.
2. `MatchDetector` — stateless analysis. Scans runs, classifies shapes, returns
   `MatchResult` (cleared positions + `SpecialCreation`s). *Test these rules.*
3. `BoardManager` — owns the grid; fill (no initial matches), swap, **detonation
   BFS** (chain-reacting specials), gravity (returns `TileMove`s), refill
   (returns `TileSpawn`s), hint/shuffle. Uses an injected RNG via
   `AnyRandomNumberGenerator` for deterministic tests.
4. `ComboSystem` — escalating multiplier, Fury mode, Echo Resonance ×10.
5. `GameEngine` — the orchestrator. `attemptSwap` → validate → resolve all
   cascades → return `SwapResolution` (ordered `CascadeWave`s). Also `reshape`
   and `echoBlast` abilities. Tracks score / moves / collected / essence and
   evaluates the objective.

`ResolutionEvents` defines the value types the engine emits and the renderer
consumes (`TileMove`, `TileSpawn`, `ClearEvent`, `SpecialPlacement`,
`CascadeWave`, `SwapResolution`). This is the **contract** between logic and
presentation — keep it pure.

## 3. Rendering & input (`Scene/`)

- `Theme` — timings, SwiftUI→SpriteKit colour bridging, colour-blind flag.
- `OrbNode` — one orb: glow + body + SF-Symbol glyph + special badge, restyled
  in place when it becomes special. Textures are cached.
- `ParticleManager` — code-built one-shot emitters (match burst, resonance
  burst, ambient motes). No `.sks` files.
- `GameScene` — the only place that knows about pixels:
  - `computeLayout`/`position(_:)` map grid ↔ screen.
  - Touch handling: drag-to-swap + tap targeting for abilities.
  - `animate(_:)` replays a `SwapResolution`: swap slide → per wave
    (clears+particles → special placements → collapse → refill) → reconcile.
  - Reports state back through `GameSceneDelegate`.

## 4. MVVM glue (`App/`)

- `GameViewModel` — creates the engine+scene for a floor, conforms to
  `GameSceneDelegate`, republishes score/moves/combo/outcome for SwiftUI, and
  arms abilities.
- `AppState` — app-wide router (`Route`), persistent `PlayerProgress`,
  `EnergySystem`, daily login. Forwards nested `ObservableObject` changes.
- `AscendantEchoesApp` — `@main`, injects `AppState`, dark mode, starts music.

## 5. Progression & persistence (`Progress/`)

- `PlayerProgress` — level/essence/abilities/form/streak; `gainEssence`
  auto-levels; manual `Codable` (because of `@Published`).
- `SaveManager` — `UserDefaults` source of truth, mirrored to iCloud KVS.

## 6. Services (`Services/`)

`EnergySystem` (lazy time-based refill), `HapticsManager` (Core Haptics +
fallback), `AudioManager` (graceful when assets absent, rising-pitch combos),
`GameCenterManager` (fail-soft leaderboards), `AnalyticsManager` (pluggable
sink). All are singletons with safe no-op behaviour so the game runs anywhere.

## 7. UI (`UI/`)

`RootView` routes between `MainMenuView`, `TutorialView`, `FloorIntroView`,
`GameView` (SpriteView + HUD + abilities + result), `ShopView`, `SettingsView`.
`Styles.swift` holds the shared button/progress/card components.

## How a swap flows end-to-end

```
Touch (GameScene) ─▶ engine.attemptSwap(a,b)
        │                      │
        │            BoardManager.swap + MatchDetector.hasMatch
        │                      │ valid?
        │            runCascades → applyClear×N
        │              (detonation BFS, ComboSystem scoring,
        │               place specials, gravity, refill)
        ▼                      ▼
   SwapResolution ◀──── ordered [CascadeWave]
        │
GameScene.animate(resolution) ── per wave: particles, falls, spawns, shake/haptics
        │
GameSceneDelegate ─▶ GameViewModel (@Published) ─▶ SwiftUI HUD / Result
        │
   terminal outcome ─▶ AppState.finishFloor (essence, advance, save, Game Center)
```

## Testing strategy

`Tests/EngineTests.swift` covers the rules that matter and are easy to regress:
match lengths → specials, L-shape → Echo Bomb, gravity compaction, refill,
invalid-swap restores the board, score/essence increase, bounded progress.
Because the engine takes a seeded RNG, board generation is reproducible.

Run with `⌘U`. Add rendering/UI tests with XCUITest later if desired.
