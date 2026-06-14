# Ascendant Echoes — standalone web app

A juicy **match-3 ascension** game that runs entirely in the browser (Vite +
React + Canvas 2D). This is the deploy-on-its-own-domain build of the game; the
same engine also powers the `/echoes` route in the root Next.js app and the
native SwiftUI + SpriteKit iOS project in `../AscendantEchoes`.

## Run locally

```bash
cd ascendant-echoes
npm install
npm run dev          # http://localhost:5173
```

Other scripts: `npm run build` (type-check + production bundle to `dist/`),
`npm run preview`, `npm test` (Vitest engine suite), `npm run typecheck`.

## Deploy (own domain on Vercel)

This folder is a self-contained Vercel project — point a new Vercel project's
**Root Directory** at `ascendant-echoes/`. The included `vercel.json` sets the
Vite framework preset, `npm run build`, and `dist` as the output directory.
Then assign your custom domain in the project's Domains settings.

## How to play

Drag an orb into an adjacent orb to line up **3+** of the same element.
- **4 in a row** → Surge Orb (clears a row/column)
- **5 in a row** → Cataclysm Orb (clears a whole element)
- **L / T / + shapes** → Echo Bomb (3×3 blast) + **Echo Resonance ×10**
- Chain cascades to build the combo multiplier and trigger **Ascension Fury**.

Clear each floor's objective within the move budget to climb the Tower. Progress
(level, essence, highest floor) is saved in `localStorage`.

## Structure

| File | Role |
|------|------|
| `src/engine.ts` | Pure game logic — board, matching, specials, cascades, scoring, floors |
| `src/engine.test.ts` | Vitest unit tests for the engine |
| `src/gameController.ts` | Canvas renderer + input (tweens, particles, screen shake) |
| `src/App.tsx` | React UI — menu, floor intro, HUD, result, overlays |
