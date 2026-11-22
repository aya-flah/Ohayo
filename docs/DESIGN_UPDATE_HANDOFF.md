# Sonae design overhaul: handoff notes

**For:** the other Claude chat working on Sonae
**Date:** 2026-11-21
**State:** nothing is committed yet. Every change below is uncommitted in the working tree on `main`. Run `git status` to see it.

This file explains what changed in the website and Android app design, why, and what to keep in mind before you change anything else.

---

## 1. The big idea

The old UI was a plain admin dashboard: a side rail, white cards and a boxed 3D view on the Twin page only.

The new direction is **Japanese minimalism plus spatial glassmorphism**:

- The **3D farm is now a full-screen canvas behind every page** (tank, pump, pylon, solar panels, pipes, plots).
- The UI floats over the farm on **frosted-glass HUD cards**, with a **pill navigation bar** and **spatial badges** anchored to equipment in 3D.
- **Colour only carries meaning** (physics-driven palette, see section 3).
- Two modes:
  - **Spatial Glass** (default, dark)
  - **Field mode**, a high-contrast "sunlight" mode for outdoor use, switched with the sun/moon button at the top right

The Android app is still Capacitor wrapping `apps/web/dist`, so every change applies to both. `npm run mobile:sync` has already been run, so the Android assets hold the new build.

---

## 2. New files

| File | What it does |
| --- | --- |
| `apps/web/src/components/ui.tsx` | Shared glass primitives. **Use these instead of writing new card or button markup.** |
| `apps/web/src/lib/scene.ts` | Zustand store for the background farm: `cursor`, `forceCut`, `live`, plus `useSceneState()`, `useFieldMode()` and `poseFor(path)`. |
| `docs/DESIGN_UPDATE_HANDOFF.md` | This file. |

What `ui.tsx` contains:

- `Stagger` and `Rise`: page-level staggered reveal. Children rise out of a blur.
- `GlassCard`: a frosted card with a light that follows the mouse pointer. It uses the `rise` variant, so it animates in when it sits inside `Stagger`.
  - Inside a parent that doesn't use `Stagger`, pass `variants={{}}`.
- `Segmented`: a radio group whose thumb slides between options. Each option can carry a tone (`water`, `solar`, `ok` or `cut`).
- `AnimatedNumber` and `Stat`: numbers that roll like a meter, and KPI tiles built on them.
- `PageHeader`: eyebrow, large title and a faint kanji watermark (備, 結, 再, 設…).
- `Pill`: a semantic status chip with a pulsing dot.
- `Sheet`: a generic modal sheet. It isn't used yet; the existing dialogs were restyled in place instead.
- `EASE`: the shared easing curve `[0.16, 1, 0.3, 1]`.

## 3. Design tokens (`apps/web/src/styles/app.css`, rewritten)

The CSS variable names components already used (`--ink`, `--ink-2`, `--line`, `--water`, `--ok`, `--solar`, `--cut`, `--accent*`, `--surface*`) all still exist, so old class names like `text-ink-2` and `bg-ok-soft` keep working. Only their values changed.

| Meaning | Glass (dark) | Field (light) |
| --- | --- | --- |
| Glass surface | `rgb(11 18 30 / .68)` + 28px blur | white `/ .9` |
| Hairline | `rgb(255 255 255 / .14)` | `#E6E2DA` |
| Text | `#F8FAFC` / `#94A3B8` | `#141B24` / `#4B5563` |
| Water, pumping | `#38BDF8`, deep `#1B4D7E` | `#1B6FAE` / `#1B4D7E` |
| Gravity, safe | `#10B981` | `#2E7D5B` |
| Solar, heat | `#F59E0B` | `#E59A24` |
| Power cut, alert | `#FF5A5F` | `#D64545` |

New tokens: `--glass`, `--glass-strong`, `--glass-line(-strong)`, `--glass-shadow`, `--scrim`, `--scrim-twin`, `--water-deep` and `--glow-*`.

New utility classes:

- Surfaces: `.glass`, `.glass-strong`, `.glass-soft`, `.glass-edge` (the luminous top hairline)
- Buttons: `.btn-danger`, `.btn-sm`
- Text and chips: `.eyebrow`, `.chip`, `.dot`, `.dot-pulse`, `.text-gradient-water`
- Other: `.range` (water-filled slider), `.scene-badge`, `.noise`
- Keyframes: `wave-x`, `rise`, `gravity-drop`

Typography:

- **Plus Jakarta Sans** (variable) is the main font. It comes from the new dependency `@fontsource-variable/plus-jakarta-sans`.
- **Shippori Mincho B1** is kept only for Japanese glyphs, through `font-jp`.
- The body text is 16px.
- `font-display` now maps to Plus Jakarta Sans too.
- Zen Kaku Gothic is no longer imported. The package is still in `package.json`, so you can remove it if you like.

Sizing: buttons and inputs are at least 48px tall, and buttons are fully rounded pills.

Theme:

- `<html data-theme>` is now always set, to `dark`, `light` or `system`.
- The default theme changed from `system` to `dark` (Glass), in `lib/store.ts`.
- Glass and dark are the same thing; Field and light are the same thing.

## 4. Shell, navigation and transitions (`components/Shell.tsx`, rewritten)

- **Backdrop**: `TwinScene` is lazy-loaded once into a fixed `z-0` layer behind everything.
  - Pointer events only reach it on `/twin`.
  - A scrim layer keeps text readable. It fades out on `/twin`.
  - A film-grain layer adds texture.
- **CutFlash**: when the farm's grid goes off, a coral pulse comes in from the screen edges, and a soft coral vignette stays while the cut lasts.
- **Top HUD**, floating, in three parts:
  - the brand pill (備 tile that fills with water on hover)
  - the desktop pill navigation, with a sliding gradient indicator (`layoutId="nav-liquid"`)
  - the status cluster (tank %, grid on or cut, farm time) and the Glass/Field toggle
- **Mobile dock**: a floating glass bar at the bottom with five tabs (58px tap targets) and its own sliding indicator.
- **Page transition**:
  - The old page blurs and sinks.
  - The new page's cards rise in one after another (`Stagger`).
  - A band of light sweeps across the screen in the direction you moved through the nav (`TideSweep`).
  - The **3D camera flies to a new pose for each page** (see section 5).
- **Intro**: once per browser session, 備え fills like a tank, ripples spread, and the intro closes as a shrinking circle. Tap to skip it. The flag lives in sessionStorage under `sonae:intro`.

## 5. The 3D farm (`pages/twin/Scene.tsx`, heavily reworked)

`TwinScene` now takes these props: `{ state, reduced, pose, interactive, field, badges }`.

Atmosphere:

- The sky changes colour with the hour, with separate palettes for Glass and Field.
- Stars and a moon appear at night, and the sun disc moves across the sky.
- Fog hides the ground's edge, so the farm reads as a small diorama island.

Flows: glowing particles travel along the pipes and cables:

- **cyan** up the pump riser
- **emerald** along the gravity line to the plots
- **blue** along the grid line, when the pump runs on the grid
- **amber** along the solar cable, when the pump runs on sun

Equipment:

- Tank: glass shell, rippling water surface, a ring that pulses out from the surface, and level rings.
- Pump: a rotor that spins and a light in the colour of its energy source.
- Pylon: a beacon that blinks coral during a cut.
- Solar panels: an amber glow and sparkles in proportion to the kW they produce.
- Plots: an emerald sheen and mist while they are being irrigated.

Spatial badges (`.scene-badge`) are drei `<Html>` labels for Tank, Grid, Pump, Solar and Gravity flow. They only show on `/twin`.

**Camera rig** (`Rig` and the `POSES` table):

- Each route has a pose: target, radius, polar angle, azimuth, plus a **lens shift** (`camera.setViewOffset`) that slides the farm into the empty part of the page without distorting the perspective.
- Phones use their own `mobileShift` and `mobileR` values.
- On every pose change the camera glides there with exponential smoothing. On first load it swoops down from above.
- On `/twin`, OrbitControls takes over once the camera arrives. Grabbing the scene stops the fly.
- **To retune the framing, edit `POSES`.** The shift values are fractions of the screen.

Data flow:

- Pages write `useScene().setCursor()`. The Plan page's scrubber and playback now drive the farm behind it.
- The Twin page writes `cursor`, `forceCut` and `live` (MQTT telemetry).
- The Shell resets `live` and `forceCut` when you leave `/twin`, and moves the cursor to 0 ("now", sun pumping) on Yui, Replay and Settings.
- `useSceneState()` returns the live state if there is one, otherwise `twinAt(plan, input, cursor, forceCut)`.

## 6. Page by page

- **Plan** (`PlanPage.tsx`, rewritten layout, same logic):
  - `PageHeader` with the scenario `Segmented` and an "Add a STEG cut" button (now `btn-danger`).
  - The main glass instrument card has:
    - an animated timeline legend
    - `TankTimeline`: pump bars grow in, the tank line draws itself, the cursor glows
    - a **PlayOrb**: a round play button whose ring fills with progress
    - a strip with the current hour's reason, which animates when it changes
    - the liquid **TankGauge**
  - The energy card is now six `Stat` tiles plus an animated sun/grid/peak mix bar. Alerts became cards with a coloured edge. Manual cuts are removable chips.
- **TankGauge**: liquid glass with two looping sine waves, bubbles while pumping, a reserve line that turns coral when water is low, inlet and outlet pipes that light up, and a rolling m³ number. It has a new optional `irrigating` prop.
- **TurnsList**: an emerald "gravity line" with a falling-light animation runs down the list. Turns are glass cards that slide in as you scroll (`whileInView`).
- **Twin** (`TwinPage.tsx`, rewritten): a full-screen HUD over the interactive farm.
  - Desktop: a title card with the data-source switch, a right rail with six instruments (values roll; Tank shows a fill level) and a node-event log, and a bottom control dock with play, a water-filled scrubber and the "Cut the power now" button.
  - Phone: the instruments become a strip you swipe sideways inside the title card.
  - It now uses absolute positioning inside a full-viewport box, not `fixed`, so the page-exit transform doesn't make it jump.
- **Yui**: restyled through string replacement only. **No contract or wagmi logic changed.**
  - Header, plus four step tiles linked by a travelling "escrow" light.
  - Wallet, offers, trades and the sell form are glass. The sell form uses `Segmented`.
  - The buy dialog has a lock icon that springs closed.
- **Replay**: same simulation logic.
  - The heat strip bars grow in, and cut days glow coral.
  - The results table became rows with animated before/after bars (grey for without, emerald for with Sonae).
  - The seasons picker is now a `Segmented` instead of a `<select>`.
  - The run button fills with progress while it runs.
- **Settings**: icon section headers, unit suffixes inside the inputs, the diesel option became an animated switch, and a visual three-card theme picker (Spatial Glass, Field, Match device) with mini previews.
- **Dialogs**: `PhoneSms` springs up in 3D tilt, shows a typing indicator, then the bubble pops in. `OutageDialog` is glass with a coral glow, and its submit button is `btn-danger`.

## 7. Other changes

- `apps/mobile/capacitor.config.ts`: the splash, status bar and background colour went from `#00419a` to `#0b121e`, and `overlaysWebView: false` was added.
- `apps/web/index.html` and `vite.config.ts` (PWA manifest): the theme and background colours are now `#0b121e`. The Shell also updates `<meta name="theme-color">` when you switch to Field mode.
- `lib/store.ts`: the default theme is now `'dark'`.
- `components/Icons.tsx`: new icons `IconSunMode`, `IconMoon`, `IconLeaf`, `IconCoin` and `IconGauge`.
- `package.json` and `package-lock.json`: the dependency `@fontsource-variable/plus-jakarta-sans` was added.

## 8. Checked, and not checked

**Checked:**

- `npm run build:web` passes.
- `tsc` shows only one error, in `YuiPage.tsx`, about the `chainId` type in `waitForTransactionReceipt`. It was already there before this work.
- `npm run sync -w apps/mobile` ran.
- In the browser at 1440×900 and 375×812:
  - every page renders in both modes
  - Plan playback runs
  - cutting and restoring the power on Twin works
  - page changes produce no runtime errors

**Not checked:**

- The design on a real Android device or in Android Studio.
- Performance on low-end phones.
- Yui with a connected MetaMask wallet. Only the "connect wallet" state was seen.

**Known rough edges, and ideas for next steps:**

- **Performance**: the WebGL canvas plus backdrop blur runs on every page. If low-end Android phones stutter:
  - lower the `dpr` in `TwinScene` to `[1, 1.25]`, or
  - render the farm only on `/` and `/twin`, or
  - cut the blur from 28px to 16px in `.glass`.
- **drei `<Html>` warning**: during hot reload, the console shows "Attempted to synchronously unmount a root…" from drei's `<Html>`. It did not happen during normal navigation.
- **Android status bar**: it stays dark in Field mode, because `@capacitor/status-bar` isn't called from the web code.
- **Android splash and icons**: they still use the old blue art in `android/app/src/main/res/drawable*/splash.png`.
- **Bundle size**: `Scene` is 930 kB (252 kB gzipped) and loads lazily after the first paint.

## 9. Rules if you keep building on this

1. New surfaces use `GlassCard`, or `.card` plus `.glass-edge`. Never write a bare white or `bg-surface` card.
2. Only use colour for meaning. Water and pumping are cyan, gravity and safe are emerald, sun and heat are amber, cuts and alerts are coral. Neutral information stays ink.
3. Every number uses `.num` (tabular-nums). Animated numbers use `AnimatedNumber`.
4. Tap targets are at least 48px (`.btn` already is).
5. Wrap page content in `<Stagger>`, and use `GlassCard`, `Rise` or `PageHeader` as its direct animated children.
6. Respect `prefers-reduced-motion`. The CSS kills animations, and the scene and numbers check it too.
7. If a page needs the farm to show a different moment, call `useScene().setCursor(...)`. Don't mount a second canvas.
