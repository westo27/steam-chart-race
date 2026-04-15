# Steam Chart Race — Claude Code context

## What this project is

A desktop tool that generates animated line chart videos comparing Steam game player counts over time, exported as 9:16 MP4 files for TikTok, Instagram Reels, and YouTube Shorts.

The user types in two or more Steam game names, the tool fetches historical player count data from steamcharts.com, renders an animated line chart with lines drawing left to right month by month, and exports a video.

This is a personal tool first, with a possible path to selling it later. UI polish is secondary to getting the video output looking great.

---

## Core user flow

1. User types a game name → autocomplete searches local Steam app cache → user picks the game → app ID stored
2. Repeat for 2–5 games
3. Tool fetches `steamcharts.com/app/{appid}` for each game, parses the monthly player count table
4. Animated line chart renders — lines draw left to right, month by month
5. Export as 9:16 MP4

---

## Tech stack

| Area | Technology |
|------|-----------|
| Shell | Electron |
| Frontend | Vanilla JavaScript + HTML + CSS |
| Chart rendering | D3.js scales + Canvas (no SVG) |
| Animation | requestAnimationFrame in preview, frame-counter loop in export |
| Data fetching | Node.js fetch in main process, exposed via IPC |
| HTML parsing | cheerio |
| Video export | Bundled ffmpeg binary via ffmpeg-static + fluent-ffmpeg |
| Steam app list cache | better-sqlite3, refreshed weekly |
| Settings / projects | JSON files in `app.getPath('userData')` |
| Build / packaging | electron-builder |

**No React. No TypeScript. No build step for the renderer code.** Keep it simple — readable over clever.

---

## Architecture

Electron splits into **main process** (Node.js, full system access) and **renderer process** (browser-like, runs the UI). Communication via IPC, with a `preload.js` bridge using `contextBridge`.

Do **not** disable `contextIsolation` or enable `nodeIntegration` in the renderer — both are major security footguns.

```
/
  package.json
  main.js                    Electron main process entry
  preload.js                 contextBridge IPC exposure
  /renderer
    index.html
    app.js                   UI logic, search, game list, controls
    chart.js                 drawFrame(), pure render function
    animation.js             preview loop (requestAnimationFrame)
    export.js                frame capture orchestration
    style.css
  /main
    steamcharts.js           HTTP fetch + cheerio HTML parsing
    steam-apps.js            SQLite cache + autocomplete search
    ffmpeg-export.js         frame writing + ffmpeg invocation
  /assets
    icon.png
```

### preload.js pattern

```javascript
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  searchGames: (query) => ipcRenderer.invoke('search-games', query),
  fetchPlayerData: (appid) => ipcRenderer.invoke('fetch-player-data', appid),
  writeFrame: (index, buffer) => ipcRenderer.invoke('write-frame', index, buffer),
  encodeVideo: (outPath, opts) => ipcRenderer.invoke('encode-video', outPath, opts),
  saveProject: (data) => ipcRenderer.invoke('save-project', data),
  loadProject: () => ipcRenderer.invoke('load-project'),
});
```

---

## Data sources

### Steam game search (autocomplete)

Steam publishes a full list of all games and their app IDs:
```
https://api.steampowered.com/ISteamApps/GetAppList/v2/
```

The list is ~80MB and contains a lot of garbage (DLC, soundtracks, demos, server tools, region SKUs). Strategy:

1. On first run (or weekly refresh), fetch the JSON in main process
2. Insert into SQLite: `apps(appid INTEGER PRIMARY KEY, name TEXT)`, with index on `name`
3. Renderer queries via IPC: `searchGames(query)` returns top 10 matches ordered by name-match-quality
4. Cache refresh runs in background, never blocks UI

Filter out obvious junk during ingest: entries with empty names, names containing "Soundtrack", "Demo", "Server", "Dedicated Server", "SDK", "Beta", "Trailer".

### Historical player count data

Steamcharts.com has monthly average and peak player counts going back to 2012:
```
https://steamcharts.com/app/{appid}
```

The page has a table with columns: Month, Avg. Players, Gain, % Gain, Peak Players. Parse with cheerio in the main process.

**Defensive parsing:**
- Wrap parser in try/catch and log raw HTML on failure
- Cache parsed results to disk (keyed by appid + ISO week) so dev iteration doesn't re-hit steamcharts
- Steamcharts data only updates monthly — weekly cache is fine

---

## Chart design

- Dark background (#0d1117)
- Each game gets a distinct colour from a fixed palette
- Lines animate left to right, drawing month by month
- Right-side ranked label stack (see Labels section)
- X axis: time (months/years)
- Y axis: average concurrent players, dynamic scaling
- Year markers on X axis
- Current date label centred at the bottom

The video output should look like a premium data visualisation, not a basic chart.

### Colour palette (assign in order)

1. `#e74c3c` — red
2. `#3498db` — blue
3. `#2ecc71` — green
4. `#f39c12` — amber
5. `#9b59b6` — purple

---

## Y axis behaviour (dynamic scaling)

The y-axis max eases toward the current visible max each frame, not the dataset max. This makes early data fill the frame, then everything rescales down dramatically as later spikes occur.

### The maths

```javascript
// Each frame:
const visibleData = games.flatMap(g => g.points.slice(0, currentPointIndex + 1));
const visibleMaxRaw = Math.max(...visibleData.map(p => p.players));
const target = useNiceNumbers ? niceMax(visibleMaxRaw * 1.1) : visibleMaxRaw * 1.1;
currentMax += (target - currentMax) * 0.08; // easing factor
```

### Settings

- **Easing factor**: 0.08 per frame at 30fps (lower = smoother but laggy, higher = snappy but jumpy)
- **Headroom**: 10% above visible max
- **Initial value**: first data point or 1000 floor (avoid divide-by-zero on frame 1)

### "Snap to nice numbers" toggle (default: on)

When on, target max snaps to the nearest nice value from the sequence `[1, 2, 2.5, 5, 10] × 10ⁿ`. This gives stable axis labels (100K → 250K → 500K → 1M) instead of arbitrary values flickering through.

When off, target max is raw visible max × 1.1. Smoother axis motion, but labels read as garbage. Useful for comparison/debugging only.

```javascript
function niceMax(v) {
  if (v <= 0) return 1;
  const steps = [1, 2, 2.5, 5, 10];
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const s of steps) if (s * mag >= v) return s * mag;
  return 10 * mag;
}
```

### Log scale interaction

If both log scale and nice numbers are on, snap to powers of 10 (10K, 100K, 1M) instead of the 1/2/2.5/5 sequence. Animate in log space to avoid weird interpolation:

```javascript
currentLogMax += (targetLogMax - currentLogMax) * 0.08;
currentMax = Math.pow(10, currentLogMax);
```

---

## Right-side ranked label stack

Replaces both the end-of-line labels and the bottom in-video legend. Game labels stack on the right in rank order (highest current value at top), reordering smoothly during the animation as rankings change.

### Layout

- Reserve ~270px on the right of the 1080×1920 export for the label column
- Each label: 28px tall pill with 6px gap between labels
- Label content: colour swatch (10×10px), game name (12px medium weight), current value (11px, right-aligned)
- Pill background `#161b22`, border `rgba(255,255,255,0.08)`
- Thin dashed connector line from label's left edge back to the line tip on the chart, 35% alpha in the game's colour

### Reorder animation

```javascript
// Each frame:
const ranked = [...games].sort((a, b) => b.currentVal - a.currentVal);
ranked.forEach((g, rank) => {
  const targetY = labelTopY + rank * (labelH + labelGap);
  g.labelY += (targetY - g.labelY) * 0.18;
});
```

Easing factor 0.18 — labels need to feel snappy, viewers actively track rank changes.

### Hysteresis

If two games have nearly identical values, their labels will jitter swapping rank every frame. Only swap rank if value difference exceeds 1% of current axis max, or compare values rounded to display precision.

---

## Staggered launches (games with different start dates)

When games have different earliest data points (e.g. Game A from 2014, Game B from 2021), each game's line only starts drawing at the frame corresponding to its actual launch month. The video timeline spans from the earliest data of any game to the latest, with each line starting at its real position on that timeline.

### Determining when a line starts

The video timeline spans `[globalMinDate, globalMaxDate]` across all games. For each game, compute its `startProgress` — the progress value (0–1) at which its first data point appears:

```javascript
const globalStart = Math.min(...games.map(g => g.firstDate));
const globalEnd = Math.max(...games.map(g => g.lastDate));
const totalSpan = globalEnd - globalStart;

games.forEach(g => {
  g.startProgress = (g.firstDate - globalStart) / totalSpan;
});
```

A game with `startProgress = 0.45` doesn't draw anything until the animation passes 45%.

### Label fade-in

A label that's not visible at all (its line hasn't started) would create dead space in the right-side stack and confuse the ranking. Handle it as follows:

- Before `progress < g.startProgress`: label is rendered at **0% opacity** and **excluded from rank ordering**. Other games stack above it as if it didn't exist.
- At the moment `progress >= g.startProgress`: label fades in over ~500ms (15 frames at 30fps), and joins the rank ordering at its correct position (which will be near the bottom since it just started with low values).
- During fade-in, the label's `currentVal` and rank position should be live — fade is purely opacity, not a delay on the data.

```javascript
// Each frame, per game:
if (progress < g.startProgress) {
  g.opacity = 0;
  g.inRanking = false;
} else {
  const framesSinceStart = (progress - g.startProgress) * totalFrames;
  g.opacity = Math.min(1, framesSinceStart / 15);
  g.inRanking = true;
}

// Then sort and assign rank positions only among games where inRanking === true
```

### "Released [date]" marker

When a line first appears, show a small text marker at the line's starting point on the chart (not the label):

- Text: `Released Mar 2021` (game's first data month/year)
- Position: just above and to the right of the line's first data point
- Style: 10px, game's colour at 70% alpha, fades in with the line then fades out over ~2 seconds
- Once faded out, never reappears

```javascript
// Marker opacity:
const framesSinceStart = (progress - g.startProgress) * totalFrames;
const fadeIn = Math.min(1, framesSinceStart / 15);     // 0.5s fade in
const hold = 60;                                        // 2s hold
const fadeOut = Math.max(0, 1 - (framesSinceStart - 15 - hold) / 30); // 1s fade out
g.markerOpacity = fadeIn * Math.min(1, fadeOut);
```

### Implications for rank ordering

The "currently ranked" set changes mid-animation as games come online. This means:

- A game appearing for the first time slides in at its rank position from outside the visible stack (start its `labelY` at `chartBottom + 50` so it slides up into view)
- Games already in the stack may shift down to make room
- The same easing factor (0.18) handles both — it's all just label position eased toward target

### Edge case: all games start at the same date

If every game has the same `firstDate`, `startProgress = 0` for all of them and behaviour is identical to the simple case. No special-casing needed.

---

## Animation approach

### Core principle

- Total video duration is fixed (default 30s, user adjustable 5–60s)
- All data points spread evenly across that duration
- More data points = faster movement per point, not a longer video

### The maths

```
ms per data point = (duration in ms) / (number of data points)
total frames      = (duration in seconds) × 30
```

Example: 17 data points at 30 seconds = ~1764ms per data point.

### Pure render function

`drawFrame(progress)` must take a progress value 0–1 and produce a complete frame. Both preview and export call this same function.

**Eased state (`currentMax`, `labelY` values) is mutable but must be reset to initial values at the start of every animation run** (preview play, export start). This keeps the function deterministic per run without forcing a closed-form expression for the easing.

```javascript
// Reset before any new animation run:
function resetAnimationState() {
  currentMax = INITIAL_MAX;
  games.forEach((g, i) => g.labelY = LABEL_TOP_Y + i * (LABEL_H + LABEL_GAP));
}
```

### Preview loop

```javascript
function animate(timestamp) {
  if (!startTime) startTime = timestamp;
  const progress = Math.min((timestamp - startTime) / durationMs, 1);
  drawFrame(progress);
  if (progress < 1) requestAnimationFrame(animate);
}
```

### Export loop (decoupled from real-time)

```javascript
async function exportFrames() {
  resetAnimationState();
  const totalFrames = duration * 30;
  for (let f = 0; f < totalFrames; f++) {
    drawFrame(f / (totalFrames - 1));
    const buffer = await canvasToPngBuffer(canvas);
    await window.api.writeFrame(f, buffer);
    updateProgress(f / totalFrames);
  }
  await window.api.encodeVideo(outPath, { fps: 30, width: 1080, height: 1920 });
}
```

### drawFrame(progress)

1. Reset canvas (fill dark background)
2. Compute current values for each game by interpolating between data points
3. Update ranked label positions (ease toward target rank y)
4. Update `currentMax` (ease toward visible max)
5. Draw grid lines and y-axis labels (formatted as "1.8M", "600K")
6. For each game:
   - Draw line up to current interpolated position
   - Draw filled circle dot at the tip
7. Draw connector lines from each tip to its label
8. Draw label pills (background → swatch → name → value)
9. Draw current date label centred at the bottom

---

## Video export pipeline

1. User clicks Export, picks output location via `dialog.showSaveDialog`
2. Renderer resets eased state, runs export loop
3. Each frame written as PNG to a temp dir in main process: `tempDir/frame_0000.png`
4. After all frames written, main process invokes ffmpeg via fluent-ffmpeg:
   ```
   ffmpeg -framerate 30 -i frame_%04d.png \
     -c:v libx264 -pix_fmt yuv420p -crf 18 \
     -movflags +faststart \
     output.mp4
   ```
5. Move output to user's chosen location, clean up temp dir
6. Show "Export complete" toast with "Show in Finder/Explorer" button

### Critical settings

- **Pixel format `yuv420p`** is non-negotiable for TikTok/Instagram compatibility
- **CRF 18** for high quality without absurd file sizes
- **`+faststart`** moves metadata to the front of the file for streaming previews
- Output dimensions: **1080 × 1920** (9:16), 30fps
- Audio: silent track added so platforms don't flag it as broken
  ```
  -f lavfi -i anullsrc=r=44100:cl=stereo -shortest
  ```

---

## UI details

### Game search autocomplete

- Minimum 2 characters before showing results
- Top 10 results in a dropdown
- Keyboard navigable (arrow keys + enter)
- Click outside to dismiss
- On selection: add game to list, clear input, close dropdown
- Maximum 5 games — disable input when full

### Game list

- Each row: colour swatch, name, all-time peak count, remove button
- Colour assigned automatically from palette in order

### Date range

- Two text inputs: start and end ("Jan 2018" format)
- Defaults: earliest available data across all games → current month
- Changing range updates chart immediately

### Peak markers (toggleable, default on)

- Small dot at each game's all-time peak data point
- Dashed vertical line from dot up to top of chart area
- Small label showing peak value ("3.2M peak"), in game's colour

### Controls panel

- Duration slider (5–60s)
- "Snap to nice numbers" checkbox (default on)
- "Log scale" checkbox (default off)
- "Peak markers" checkbox (default on)
- Export button (lazy-load ffmpeg flow not needed — bundled binary)

### Project save/load

- Menu items: New, Open, Save, Save As, Recent
- Format: `.steamrace` JSON file with full state (games, duration, range, toggles)
- Recent projects list in app data dir

---

## Coding conventions

- Vanilla JS, no TypeScript, no build step for renderer
- Two-space indent, single quotes, semicolons
- Console.log liberally during development
- If something gets complicated, step back and find a simpler approach
- All eased state must reset at start of every animation run

---

## Known gotchas

- **better-sqlite3 needs rebuilding against Electron's Node version.** Add `"postinstall": "electron-builder install-app-deps"` to package.json from day one.
- **Steam app list is ~80MB JSON** — fetch and ingest into SQLite once, refresh weekly in background.
- **Steamcharts HTML structure can change without notice** — defensive parsing with logging.
- **Some games have missing months in steamcharts data** — handle gaps by either linear interpolation or breaking the line.
- **Dead games can have 0 average players** — clamp to 1 for log scale, or skip those data points.
- **Different player count scales** (CS2 at 1M+ vs a dead game at 100) — log scale toggle handles this.
- **Hysteresis on label rank swaps** to prevent jitter when values are close.
- **Y-axis label values change as `currentMax` changes** — redraw labels every frame, accept brief flicker through values when not snapping to nice numbers.

---

## MVP scope

- [ ] Electron app shell with main/renderer/preload structure
- [ ] Steam app list ingest into SQLite, autocomplete search
- [ ] Steamcharts fetch + cheerio parse for 2–5 games, cached
- [ ] Animated chart with dynamic y-axis (snap to nice numbers)
- [ ] Right-side ranked label stack with reorder animation
- [ ] Frame-by-frame export to MP4 via bundled ffmpeg
- [ ] Output looks good enough to post on TikTok

**Not in MVP:**
- Project save/load (add right after MVP)
- Peak markers (add right after MVP)
- Log scale (add right after MVP)
- Code signing / notarization
- Auto-updates
- License keys / paid tier
- Title cards or audio overlay
- Mobile / web versions

---

## Build order recommendation

Don't build the UI first. Build in this order to de-risk the hard parts early:

1. Electron shell + IPC scaffolding
2. Steamcharts fetch + parse (one hardcoded appid → JSON in console)
3. Static chart of one game's real data on canvas
4. Animation loop (preview only, one game)
5. Multiple games, dynamic y-axis
6. Right-side label stack with reorder
7. Frame export + ffmpeg encode (one game, hardcoded)
8. Search UI + game list management (the easy bit, save for last)
9. Date range, toggles, polish

This way you hit the riskiest unknowns (HTML parsing, ffmpeg pipeline, render performance) before sinking time into UI polish.

---

## Working with Claude Code

This spec is the shared reference. Read it before starting any task. When in doubt, follow what's written here over assumptions from training data.

### Process rules

- **Build in the order specified in the build order section.** Do not skip ahead. Each step assumes earlier steps are working.
- **One step per session.** Don't try to combine steps even if they seem related — the integration mistakes compound and become hard to debug.
- **Run the code between steps.** "Implemented and should work" is not the same as "I ran it and saw the expected output." Verify before moving on.
- **Stop and ask before adding new dependencies.** The dependency list in the tech stack section is intentional. If something genuinely needs a new package, surface it as a question first rather than installing.
- **Stop and ask before introducing new architectural patterns.** No build steps for the renderer, no TypeScript, no React, no state management libraries, no test framework in the MVP. If a task seems to require any of these, that's a signal to ask, not to add.

### Code rules

- **Match the conventions section.** Vanilla JS, two-space indent, single quotes, semicolons.
- **Keep `drawFrame` pure-per-run.** Eased state mutates during a run but resets at the start. Do not refactor toward closed-form easing expressions — that complexity is explicitly rejected.
- **Don't disable Electron security features.** `contextIsolation: true` and `nodeIntegration: false` are non-negotiable. All renderer→main communication goes through the `contextBridge` API in `preload.js`.
- **Defensive parsing on steamcharts HTML.** Wrap parsers in try/catch, log raw HTML on failure, never throw uncaught from a parse.
- **Surface ffmpeg errors.** Don't swallow stderr. If encoding fails, the user (and the developer) needs to see why.
- **Round numbers before display.** Any value that reaches the screen goes through a formatter — never display raw float results.

### Things that should prompt a pause

- A file is getting longer than ~300 lines — probably needs splitting
- IPC payloads are getting large or frequent — probably need batching or a different boundary
- The same logic appears in both main and renderer — one of them is in the wrong place
- A "small" change requires touching 5+ files — the abstraction is wrong
- Tempted to add a "just in case" feature not in the spec — don't

### What to ask the human about

- Visual tuning constants (easing factors, padding, colours, font sizes) — propose a value but expect the human to tune it
- Anything ambiguous in the spec — flag it, don't guess
- New dependencies, new architectural patterns, new files outside the structure
- When you've finished a step, before starting the next one
