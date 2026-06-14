# Ascendant Echoes

An original, juicy **match-3 ascension** game for iPhone (iOS 17+). You are a
**Resonant Wanderer** climbing an endless **Tower of Ascension**, shattering
elemental orbs into ever-bigger combos, evolving your character, and unlocking
powers as you rise. Built with **SwiftUI** (menus / HUD) and **SpriteKit**
(the board) for smooth 60 FPS gameplay.

> 100% original IP. All visuals are procedural shapes, SF Symbols and
> code-generated particles/gradients — no third-party art or trademarked
> mechanics. Drop in your own art/audio later without touching the logic.

---

## ✨ Features

- **Match-3 core with insane combos**
  - Dynamic board (7×7 → 9×9 as you climb), 6 elements (Flame, Storm, Verdant,
    Crystal, Shadow, Radiant).
  - Drag/swipe to swap. Cascading collapses with gravity easing.
  - **Surge Orbs** (4-match → clear row/column), **Cataclysm Orbs** (5-match →
    clear a whole element), **Echo Bombs** (L/T/+ shapes → 3×3 blast).
  - **Chain-reacting specials** (BFS detonation) and **Ascension Fury** at deep
    combo chains with exponential multipliers + **Echo Resonance ×10**.
- **Tower progression** — procedurally generated floors with rotating
  objectives (score / collect / survive), four biomes, and light narrative
  "vision" snippets between floors.
- **Power progression** — earn **Essence**, level up, evolve the Wanderer's form
  (Wanderer → Adept → Luminary → Ascendant), and unlock abilities (Reshape,
  Echo Blast, Essence Flow, Steadfast).
- **Juice** — particle bursts, screen shake, combo pop-ups, rising-pitch SFX and
  rich Core Haptics on big moments.
- **Retention systems** — daily login streak rewards, energy economy, cosmetic
  aura colours, Game Center leaderboards, placeholder IAPs.
- **Accessibility** — always-on element glyphs (colour-blind friendly), large
  tap targets, dark mode, haptics/audio toggles.
- **Persistence** — `UserDefaults` + iCloud key-value mirroring.
- **Testable architecture** — pure logic engine with unit tests; seeded RNG.

---

## 🧱 Architecture

Clean separation between **pure logic** (no UIKit/SpriteKit) and
**presentation**, with MVVM gluing SwiftUI to the engine.

```
Sources/
├── App/            App entry, AppState (router/profile), GameViewModel (MVVM)
├── Models/         ElementType, Tile/GridPosition/SpecialKind, Floor/Biome
├── Engine/         Grid, BoardManager, MatchDetector, ComboSystem,
│                   GameEngine, LevelGenerator, ResolutionEvents, RandomSupport
├── Progress/       PlayerProgress (level/abilities/forms), SaveManager
├── Services/       EnergySystem, HapticsManager, AudioManager,
│                   GameCenterManager, AnalyticsManager
├── Scene/          GameScene (render+input), OrbNode, ParticleManager, Theme
├── UI/             RootView, MainMenu, FloorIntro, GameView, HUD, Result,
│                   Shop, Settings, Tutorial, Styles
└── Resources/      Info.plist, Assets.xcassets (AppIcon placeholder)
Tests/              EngineTests (MatchDetector, BoardManager, GameEngine)
```

**Data flow:** `GameEngine.attemptSwap` mutates the board via `BoardManager`,
detects matches with `MatchDetector`, scores via `ComboSystem`, and returns a
value-type **`SwapResolution`** (an ordered list of `CascadeWave`s). `GameScene`
*replays* that as animation and reports state back to `GameViewModel` →
SwiftUI HUD. The engine never imports SpriteKit, so it's fully unit-testable.

---

## 🚀 Build & Run

The project is defined with **[XcodeGen](https://github.com/yonyz/XcodeGen)** so
no fragile `.pbxproj` is checked in.

```bash
# 1. Install XcodeGen (one-time)
brew install xcodegen

# 2. Generate the Xcode project
cd AscendantEchoes
xcodegen generate

# 3. Open and run
open AscendantEchoes.xcodeproj
#   → select an iPhone simulator (iOS 17+) and press ⌘R
```

**No XcodeGen?** Create a new *iOS App* (SwiftUI lifecycle) in Xcode, delete the
template's `ContentView`/`App` files, drag the `Sources/` folder in (Create
groups), set Deployment Target to iOS 17, and point the Info.plist build setting
at `Sources/Resources/Info.plist`.

**Run on device:** set your Team in *Signing & Capabilities* and a unique bundle
id. Haptics and Game Center require a real device to fully experience.

**Tests:** `⌘U` in Xcode, or `xcodebuild test -scheme AscendantEchoes
-destination 'platform=iOS Simulator,name=iPhone 15'`.

---

## 🎨 Assets (all optional — game runs with zero added assets)

- **Orbs / glyphs:** rendered from SF Symbols + shapes in `OrbNode`. Replace
  `ElementType.symbolName` or swap to textures from `Assets.xcassets`.
- **Particles:** generated in code (`ParticleManager`). No `.sks` needed.
- **App Icon:** `Assets.xcassets/AppIcon.appiconset` has a 1024 slot — drop a
  PNG in. Suggested concept: a glowing hexagonal orb cluster spiralling upward
  on a deep indigo-to-violet gradient.
- **Audio:** `AudioManager` auto-loads files named `match`, `swap`, `special`,
  `resonance`, `cleared`, `button`, `menu`, `climb` (`.caf/.wav/.m4a/.mp3`) if
  present; silent otherwise.

---

## 🔧 Tuning knobs

| What | Where |
|------|-------|
| Combo multiplier curve, Fury threshold, Resonance ×10 | `ComboSystem` |
| Floor size/objectives/difficulty ramp | `LevelGenerator` |
| Energy cap / refill cadence / cost | `EnergySystem` |
| Ability costs & effects | `Ability` (`PlayerProgress`) |
| Levelling curve | `PlayerProgress.essenceForNextLevel` |
| Animation timings | `Theme.Timing` |
| Element colours / glyphs | `ElementType` |

---

## 🛣️ Expansion ideas

- Obstacle tiles (ice, vines, locked orbs) — `MatchDetector.isBlocker` is a
  ready hook.
- Boss floors with HP bars and attack timers.
- StoreKit 2 IAP + rewarded ads behind the placeholder shop actions.
- CloudKit record-based saves (replace the KVS mirror in `SaveManager`).
- Seasonal events / battle pass driven by `AnalyticsManager` cohorts.
- A seventh "Aether" element and 10×10 boards for end-game floors.

See **IMPLEMENTATION_GUIDE.md** for a step-by-step build order and how each
system fits together.
