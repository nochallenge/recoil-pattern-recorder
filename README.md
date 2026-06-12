# Recoil Trainer

Desktop app for recording and visualizing FPS recoil control patterns.
You fire a gun in-game, pull your mouse down to counter the recoil, and
the app records that counter-movement so you can see your own pattern
plotted over time — a training aid to understand your recoil control.

> **Note:** The `humanizer.rs` and `device.rs` modules are left in the
> source tree but **not wired into the UI**. The built app is a pure
> recorder/visualizer and does not inject input into any game.

---

## Prerequisites

You'll need these installed once:

| Tool    | Version    | Install                                                                    |
| ------- | ---------- | -------------------------------------------------------------------------- |
| Node.js | 18 or newer | [nodejs.org](https://nodejs.org/)                                          |
| Rust    | 1.77+      | [rustup.rs](https://rustup.rs/)                                            |

Plus Tauri's platform build deps (only needed once per machine):

- **Windows**: [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (Desktop development with C++)
- **macOS**: `xcode-select --install`
- **Linux**: see the [Tauri 2 Linux prereqs](https://v2.tauri.app/start/prerequisites/#linux) (webkit2gtk etc.). Additionally the `serialport` crate (kept in tree but unused by the UI) needs `libudev-dev` — install via `sudo apt install libudev-dev` on Debian/Ubuntu.

---

## Run it

```sh
git clone https://github.com/nochallenge/recoil-pattern-recorder.git
cd recoil-pattern-recorder
npm install
npm run tauri:dev
```

That's it. The first build takes a few minutes (Cargo compiles all
dependencies). After that, edits to frontend code hot-reload, and
edits to Rust code trigger a fast rebuild.

### Build a release binary

```sh
npm run tauri:build
```

> Release bundling needs icons. If `tauri build` complains about
> missing icons, generate them once from a source PNG:
> `npx @tauri-apps/cli icon path/to/logo.png`

---

## How it works

The fastest flow — no alt-tab required:

1. Open the app once; pick your game, weapon, sens, DPI. Saved automatically.
2. In-game, press <kbd>F8</kbd>. A 3-2-1 countdown plays (audible beeps).
3. On "GO", the recorder is armed. Hold Left Mouse while you fire + counter recoil.
4. Release Left Mouse. A "done" tone plays.
5. Press <kbd>F8</kbd> again to save, or alt-tab to review the preview first.

Each state transition has a distinct beep so you can record without looking at the app.

### Full hotkey map

| Phase | <kbd>F8</kbd> does |
|---|---|
| (app idle) | open modal, auto-arm with last settings |
| form | same as clicking **Arm Recorder** |
| countdown / armed | cancel |
| recording | force-stop |
| done | save |

Saved patterns live in your OS app-data directory (the exact path is
shown at the bottom of the sidebar).

### Supported games

Weapon dropdown auto-fills fire rate and mag size for:

- **Battlefield 6** — modern-military ARs/SMGs/LMGs
- **Fortnite** — cross-chapter weapon archetypes
- **Marvel Rivals** — only the few heroes with bullet weapons (Punisher, Winter Soldier, etc.); ability-based heroes aren't covered
- **Star Wars Battlefront II** — all four classes' blasters
- **THE FINALS** — all three classes (Light / Medium / Heavy) including burst vs auto variants
- **Rainbow Six Siege** — common attacker rifles, SMGs, and LMGs by operator
- **COD Warzone** — current-meta AR/SMG/LMG/marksman/sniper kit

Pick **"Custom…"** if a weapon isn't listed. All fields stay editable —
**the numbers are best-effort starting points**, not authoritative.
Live-service games (Fortnite, Warzone, The Finals) patch fire rates
often; verify in-game and edit the form before arming if a stat feels
off. Every recording saves the exact numbers you used, so your library
stays consistent even if presets update later.

Fire-mode variants (e.g. `Bulldog (auto)` vs `Bulldog (burst)`) are
separate entries because the recoil patterns are genuinely different.

### A/B compare

In the sidebar, **click a pattern** to select it, then click the
**◯** icon on another pattern to overlay it. The visualizer renders
both paths (solid accent vs. dashed warn) and shows side-by-side
stats so you can see whether the new take actually improved.

### What you see after saving

- **Crosshair path** — the cumulative Δx/Δy trajectory, so you can
  see the curve your hand drew.
- **Δx over time** — horizontal corrections per event.
- **Δy over time** — vertical corrections per event.
- **Stats** — duration, event count, peak and total drift.

---

## Anti-cheat reality (the important section)

This app uses OS-level mouse hooks (via `rdev` → `SetWindowsHookEx` on
Windows, accessibility events on macOS). **Kernel anti-cheats will
suppress these hooks when their game has fullscreen focus.** If you
arm, fire a spray, and come back to zero events recorded — that's
what happened.

The built-in **Settings → Capture diagnostic** panel shows live
input events/sec so you can test this instantly per-game. If the
counter ticks while the game is focused, you're good. If it stays
at zero, you need one of the workarounds below.

### Where to record instead

| Target | Works? | Notes |
|---|---|---|
| Aim trainers (Aim Labs, Kovaak's) | ✅ yes | No anti-cheat. Load a recoil-control scenario. |
| Offline / practice / training ranges | ✅ usually | Most games drop the strict AC in these modes. |
| Custom / private matches | ⚠️ varies | Test with the diagnostic first. |
| Live ranked / casual matches | ❌ often no | Kernel AC will eat the capture. |
| Desktop (pantomime the spray) | ✅ yes | Loses in-game feel but captures *your* pull-down motion. |

### Game compatibility — expected behaviour

These are best-guess predictions based on each game's anti-cheat. **Verify
with the in-app capture diagnostic** and update this table as you test.

| Game | Anti-cheat | Expected |
|---|---|---|
| Battlefield 6 | EA Javelin (kernel) | Blocked in fullscreen; try windowed / Portal / practice |
| Fortnite | EAC (kernel) | Usually blocked in match; Creative / Replay modes often fine |
| Marvel Rivals | proprietary (kernel) | Likely blocked in match; training room worth testing |
| Star Wars Battlefront II | none strict | Should work everywhere |
| THE FINALS | EAC (kernel) | Practice range / lobby fine; match likely blocked |
| Rainbow Six Siege | BattlEye (kernel) | Blocked in match; custom games / T-Hunt often fine |
| COD Warzone | Ricochet (kernel) | Aggressively blocked; record outside the game |

**The intended flow:** record in a training environment (aim trainer or
practice range), build muscle memory there, carry the feel to ranked.
This is how most recoil training happens anyway — live matches are
terrible practice conditions regardless of this tool.

The app never injects input anywhere. It only reads what your mouse
does. It doesn't modify game memory, files, or network traffic.

---

## Project layout

```
recoil-pattern-recorder/
├── src/                      # React + TypeScript frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── api.ts                # Tauri command wrappers
│   ├── types.ts              # TS mirror of Rust types
│   ├── styles.css
│   └── components/
│       ├── PatternList.tsx
│       ├── RecordingModal.tsx
│       └── PatternVisualizer.tsx
├── src-tauri/
│   ├── Cargo.toml
│   ├── Cargo.lock            # committed for reproducible binary builds
│   ├── build.rs
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json      # Tauri 2 core IPC permissions
│   ├── icons/icon.png
│   └── src/
│       ├── main.rs           # Tauri commands + app setup
│       ├── pattern.rs        # Pattern data model + tests
│       ├── input_capture.rs  # rdev global input capture
│       ├── recorder.rs       # Recording state machine + tests
│       ├── humanizer.rs      # (unused, kept in tree)
│       └── device.rs         # (unused, kept in tree)
├── patterns/                 # Ignored — user-local .json files
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Development notes

- **Tests**: `cd src-tauri && cargo test` runs the Rust unit tests
  (pattern round-trip serde + recorder state machine).
- **Pattern JSON schema**: `schema_version = 1`. See
  [src-tauri/src/pattern.rs](src-tauri/src/pattern.rs). Changing the
  schema breaks existing saved patterns — bump the version and add a
  migration.
- **Adding new games/weapons**: the frontend dropdown in
  [RecordingModal.tsx](src/components/RecordingModal.tsx) is just a
  free-text list — add options there.
- **Frontend events**: the backend emits `recorder-state-change` on
  every state transition; the frontend also polls `recording_status`
  at 10 Hz while recording for the live counter.
