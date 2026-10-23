# audioplayer — initial development plan

_Drafted 2026-10-16 from CLAUDE.md. Status: decisions settled (§6); M0–M4 done._

## 1. What CLAUDE.md asks for

- A web app that lets the user **browse local files** and **play audio files** with a **minimal player control**.
- **Entirely self-contained**: runs by opening a single `.html` file (i.e. from `file://`, no server, no network).
- Source in `src/`; Claude's notes in `notes/`; `quarto/`, `docs/`, `README.md`, `releases.md` are off-limits.
- Unit tests for utilities, integration/component tests for critical UI flows; run tests before big refactors.

## 2. Key technical constraints

1. **Browsers can't read the disk on their own.** The user must grant access, via one of:
   - `<input type="file" webkitdirectory multiple>` — works in every modern browser and from `file://`; gives a one-time snapshot of a folder tree (read-only, no re-scan without re-picking).
   - `window.showDirectoryPicker()` (File System Access API) — live, lazy directory handles; **Chromium-only** (Chrome/Edge), not Firefox/Safari.
   - Drag-and-drop of a folder (`DataTransferItem.webkitGetAsEntry`) — broad support, useful as a bonus.
   → **Decision: browser-agnostic, Safari required.** Use `webkitdirectory` (plus folder drag-and-drop) as the only access paths; no `showDirectoryPicker`. Both feed one in-memory tree model.
2. **ES modules don't load over `file://`** (CORS). So the shipped file must have all JS/CSS inlined. That means a small **build step**: author modular code in `src/`, bundle/inline to one HTML file.
3. **Playback** uses the native `HTMLAudioElement` with `URL.createObjectURL(file)`; revoke URLs on track change. Playable formats depend on the browser — detect with `audio.canPlayType(mime)` instead of a hard-coded list.

## 3. Proposed stack

| Concern | Choice | Why |
|---|---|---|
| Language | Vanilla JS (ES modules) + JSDoc types | No framework needed for a small UI; keeps the output tiny |
| Build | Vite + own `build/singleFile.js` plugin | Inlines JS/CSS into one `dist/audioplayer.html`; replaced `vite-plugin-singlefile` (its micromatch→braces dep had unfixable audit warnings) |
| Unit tests | Vitest | Same config as Vite; Node 22 is available |
| Component tests | Vitest + jsdom (+ Testing Library DOM) | Test UI flows without a browser |
| E2E (later, optional) | Playwright opening the built file via `file://` | Verifies the "single file" promise for real |

(Alternative if you want zero tooling: one hand-written `src/audioplayer.html` with inline script — simpler, but much harder to unit-test.)

## 4. Proposed layout

```
src/
  index.html              # shell markup
  main.js                 # wiring / app bootstrap
  fs/
    pickFolder.js         # showDirectoryPicker vs webkitdirectory fallback
    tree.js               # build/sort/filter the in-memory file tree (pure)
  audio/
    formats.js            # extension→MIME, canPlayType checks (pure)
    player.js             # wraps HTMLAudioElement: load/play/pause/seek/next
  ui/
    browser.js            # folder tree / file list view
    controls.js           # play/pause, seek bar, time, volume
    format.js             # mm:ss formatting etc. (pure)
  styles.css
tests/
  unit/ …                 # tree, formats, format
  component/ …            # browse→select→play flow
package.json, vite.config.js   # at repo root
dist/audioplayer.html          # build output (gitignored, or committed for releases — your call)
```

## 5. Milestones

**M0 — Scaffolding**
- `package.json`, Vite + singlefile plugin, Vitest + jsdom, `.gitignore` (node_modules, dist).
- `npm run dev | build | test`. Build emits `dist/audioplayer.html`; smoke-check it opens from `file://`.

**M1 — Pure utilities (TDD)**
- `tree.js`: turn a flat `File[]` (with `webkitRelativePath`) or directory handles into a nested tree; sort dirs-first, alphabetical (natural sort so "Track 2" < "Track 10").
- `formats.js`: recognise audio files by extension/MIME; flag playable vs. not.
- `format.js`: duration → `m:ss` / `h:mm:ss`.

**M2 — File browsing UI**
- "Open folder" button (+ drop zone). Collapsible folder tree / breadcrumb list; audio files highlighted, others dimmed or hidden (toggle).
- Empty and error states (permission denied, no audio found).

**M3 — Minimal player**
- Click a track to play. Controls: play/pause, seek bar with elapsed/total time, volume/mute.
- Next/previous within the current folder; auto-advance at end.
- Keyboard: Space = play/pause, ←/→ = seek ±5s.

**M4 — Tests for critical flows + polish**
- Component test: pick folder (mocked) → tree renders → click track → player shows title and "playing" state.
- Accessibility: buttons labelled, focus visible, seek bar is a real `<input type="range">`.
- Light/dark via `prefers-color-scheme`.

**Later / optional**: metadata (ID3 title/artist via a small parser), shuffle/repeat, remembering last volume in `localStorage`, Playwright E2E against the built file.

## 6. Decisions (settled 2026-10-16)

1. Name typo in CLAUDE.md fixed by Neel.
2. Build step (Vite + Vitest) approved.
3. Must be browser-agnostic and support Safari → `webkitdirectory` + drag-and-drop only.
4. **Claude never runs git commits (or any git write operations). Neel manages all git interactions.** `dist/` is gitignored by default; Neel decides what to commit.
5. Non-audio files are shown greyed out (not clickable).
