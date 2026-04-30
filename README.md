# Steam Chart Race

A desktop tool that generates animated line chart videos comparing Steam game player counts over time. Output is a 9:16 MP4 sized for TikTok, Instagram Reels, and YouTube Shorts.

## How it works

1. Type two to five Steam game names; an autocomplete picks the app ID from a local cache.
2. The tool fetches `steamcharts.com/app/{appid}` for each game and parses the monthly player count table.
3. An animated line chart renders to canvas, drawing left to right month by month, with a ranked label stack on the right.
4. Frames are written to disk and encoded to MP4 with a bundled ffmpeg.

## Tech stack

| Area | Technology |
|------|-----------|
| Shell | Electron |
| Frontend | Vanilla JavaScript, HTML, CSS (no build step) |
| Chart rendering | D3 scales on Canvas |
| Data fetching | Node.js fetch in main process, exposed via IPC |
| HTML parsing | cheerio |
| Steam app cache | better-sqlite3 |
| Video export | ffmpeg-static + fluent-ffmpeg |
| Packaging | electron-builder |

## Project layout

```
main.js                 Electron main process entry
preload.js              contextBridge IPC exposure
/main
  steamcharts.js        HTTP fetch + cheerio parsing
  steam-apps.js         SQLite cache + autocomplete search
  ffmpeg-export.js      frame writing + ffmpeg invocation
/renderer
  index.html
  app.js                UI logic
  chart.js              drawFrame(progress)
  animation.js          preview loop
  export.js             frame capture orchestration
  style.css
```

## Running locally

```sh
npm install
npm start
```

The `postinstall` hook rebuilds `better-sqlite3` against Electron's Node version.

## Output format

- 1080 × 1920, 30fps
- H.264, `yuv420p`, CRF 18
- `+faststart` metadata
- Silent audio track (TikTok/Instagram require an audio stream)

## Data source etiquette

Steamcharts has no public API and is operated by one person. The fetcher caches results for 30 days per app, rate-limits to one request every two seconds, identifies itself in the User-Agent, and backs off exponentially on HTTP 429. See [claude.md](claude.md) for the full rules.

## Status

Pre-MVP. See the build order and MVP checklist in [claude.md](claude.md).

## Licence

GPL v3. See [LICENSE](LICENSE).

You're free to download, use, fork, and modify this software. If you redistribute it (modified or not), you must do so under GPL v3 and make the source available. This prevents closed-source commercial repackaging.
