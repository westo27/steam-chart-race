'use strict';

const PALETTE = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6'];
const MAX_GAMES = 5;

const DIMENSIONS = {
  mobile:  { width: 1080, height: 1920 },
  desktop: { width: 1920, height: 1080 },
};

const COLOR_CHOICES = [
  '#e74c3c', '#ff5722', '#e67e22', '#f39c12',
  '#f1c40f', '#cddc39', '#2ecc71', '#1abc9c',
  '#00bcd4', '#3498db', '#2980b9', '#9b59b6',
  '#e91e63', '#f06292', '#8bc34a', '#607d8b',
];

const state = {
  games: [],       // { appid, name, color } — sidebar game list
  chartGames: [],  // { name, color, points } — ready for drawFrame
  opts: { usePeak: true, snapToNice: true, logScale: false, windowYears: 4, lineThickness: 5, showImages: true, peakMarkers: true, fullColorPicker: false, endSummary: true, summaryDuration: 5, summaryStats: true, showTitle: false },
};

// --- DOM refs ---
const searchInput = document.getElementById('game-search');
const autocompleteList = document.getElementById('autocomplete-list');
const gameList = document.getElementById('game-list');
const durationSlider = document.getElementById('duration-slider');
const durationLabel = document.getElementById('duration-label');
const windowSlider = document.getElementById('window-slider');
const windowLabel = document.getElementById('window-label');
const thicknessSlider = document.getElementById('thickness-slider');
const thicknessLabel = document.getElementById('thickness-label');
const btnPreview = document.getElementById('btn-preview');
const btnExport = document.getElementById('btn-export');
const statusBar = document.getElementById('status-bar');
const btnPickAudio = document.getElementById('btn-pick-audio');
const btnClearAudio = document.getElementById('btn-clear-audio');
const audioLabel = document.getElementById('audio-label');

let audioPath = null;

btnPickAudio.addEventListener('click', async () => {
  const result = await window.api.pickAudioDialog();
  if (result.canceled) return;
  audioPath = result.filePath;
  const name = audioPath.split(/[\\/]/).pop();
  audioLabel.textContent = name;
  btnClearAudio.classList.remove('hidden');
});

btnClearAudio.addEventListener('click', () => {
  audioPath = null;
  audioLabel.textContent = 'No music';
  btnClearAudio.classList.add('hidden');
});
const canvas = document.getElementById('chart-canvas');

canvas.width = DIMENSIONS.mobile.width;
canvas.height = DIMENSIONS.mobile.height;

const ctx = canvas.getContext('2d');
drawPlaceholder();

// --- Color palette popup ---

let paletteTargetGame = null;
let paletteTargetBtn = null;

const colorPaletteEl = (() => {
  const el = document.createElement('div');
  el.className = 'color-palette hidden';
  const grid = document.createElement('div');
  grid.className = 'palette-grid';
  COLOR_CHOICES.forEach(hex => {
    const btn = document.createElement('button');
    btn.className = 'palette-swatch';
    btn.style.background = hex;
    btn.title = hex;
    btn.addEventListener('click', () => applyPaletteColor(hex));
    grid.appendChild(btn);
  });
  el.appendChild(grid);
  document.body.appendChild(el);
  return el;
})();

// Hidden native input used when fullColorPicker is on
const nativeColorInput = (() => {
  const el = document.createElement('input');
  el.type = 'color';
  el.style.cssText = 'position:fixed;width:0;height:0;opacity:0;pointer-events:none';
  el.addEventListener('input', (e) => {
    if (!paletteTargetGame) return;
    applyGameColor(paletteTargetGame, paletteTargetBtn, e.target.value);
  });
  el.addEventListener('change', () => {
    paletteTargetGame = null;
    paletteTargetBtn = null;
  });
  document.body.appendChild(el);
  return el;
})();

function openColorPicker(game, btn) {
  paletteTargetGame = game;
  paletteTargetBtn = btn;
  if (state.opts.fullColorPicker) {
    nativeColorInput.value = game.color;
    nativeColorInput.click();
    return;
  }
  const rect = btn.getBoundingClientRect();
  colorPaletteEl.style.left = (rect.right + 8) + 'px';
  colorPaletteEl.style.top = rect.top + 'px';
  colorPaletteEl.classList.remove('hidden');
}

function applyPaletteColor(hex) {
  if (!paletteTargetGame) return;
  applyGameColor(paletteTargetGame, paletteTargetBtn, hex);
  colorPaletteEl.classList.add('hidden');
  paletteTargetGame = null;
  paletteTargetBtn = null;
}

function applyGameColor(game, btn, hex) {
  game.color = hex;
  if (btn) btn.style.background = hex;
  const cg = state.chartGames.find(g => g.appid === game.appid);
  if (cg) cg.color = hex;
  if (state.chartGames.length) drawFrame(1.0, state.chartGames, state.opts, canvas);
}

document.addEventListener('click', (e) => {
  if (!colorPaletteEl.classList.contains('hidden')
      && !colorPaletteEl.contains(e.target)
      && !e.target.classList.contains('game-color')) {
    colorPaletteEl.classList.add('hidden');
    paletteTargetGame = null;
    paletteTargetBtn = null;
  }
});

// --- Duration slider ---

durationSlider.addEventListener('input', () => {
  durationLabel.textContent = durationSlider.value + 's';
});

// index 0 = 6mo, index 1 = 1yr, index 2 = 2yr, … index 10 = 10yr
const WINDOW_OPTIONS = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
function windowLabel_(idx) { return idx === 0 ? '6mo' : WINDOW_OPTIONS[idx] + 'yr'; }

windowSlider.addEventListener('input', () => {
  const idx = parseInt(windowSlider.value, 10);
  state.opts.windowYears = WINDOW_OPTIONS[idx];
  windowLabel.textContent = windowLabel_(idx);
  if (state.chartGames.length) {
    resetAnimationState(state.chartGames, canvas);
    drawFrame(1.0, state.chartGames, state.opts, canvas);
  }
});

thicknessSlider.addEventListener('input', () => {
  state.opts.lineThickness = parseInt(thicknessSlider.value, 10);
  thicknessLabel.textContent = thicknessSlider.value + 'px';
  if (state.chartGames.length) {
    resetAnimationState(state.chartGames, canvas);
    drawFrame(1.0, state.chartGames, state.opts, canvas);
  }
});

document.getElementById('show-images').addEventListener('change', (e) => {
  state.opts.showImages = e.target.checked;
  if (state.chartGames.length) {
    resetAnimationState(state.chartGames, canvas);
    drawFrame(1.0, state.chartGames, state.opts, canvas);
  }
});

document.getElementById('show-title').addEventListener('change', (e) => {
  state.opts.showTitle = e.target.checked;
  if (state.chartGames.length) {
    resetAnimationState(state.chartGames, canvas);
    drawFrame(1.0, state.chartGames, state.opts, canvas);
  }
});

document.getElementById('peak-markers').addEventListener('change', (e) => {
  state.opts.peakMarkers = e.target.checked;
  if (state.chartGames.length) {
    resetAnimationState(state.chartGames, canvas);
    drawFrame(1.0, state.chartGames, state.opts, canvas);
  }
});

document.getElementById('full-color-picker').addEventListener('change', (e) => {
  state.opts.fullColorPicker = e.target.checked;
  colorPaletteEl.classList.add('hidden');
});

document.getElementById('view-mode-toggle').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  document.querySelectorAll('#view-mode-toggle .seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const mode = btn.dataset.value;
  canvas.width  = DIMENSIONS[mode].width;
  canvas.height = DIMENSIONS[mode].height;
  if (state.chartGames.length) {
    resetAnimationState(state.chartGames, canvas);
    drawFrame(1.0, state.chartGames, state.opts, canvas);
  } else {
    drawPlaceholder();
  }
});

document.getElementById('player-count-toggle').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  document.querySelectorAll('#player-count-toggle .seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.opts.usePeak = btn.dataset.value === 'peak';
  if (state.chartGames.length) {
    resetAnimationState(state.chartGames, canvas);
    drawFrame(1.0, state.chartGames, state.opts, canvas);
  }
});

document.getElementById('end-summary').addEventListener('change', (e) => {
  state.opts.endSummary = e.target.checked;
});

document.getElementById('summary-stats').addEventListener('change', (e) => {
  state.opts.summaryStats = e.target.checked;
});

const summaryDurationSlider = document.getElementById('summary-duration-slider');
const summaryDurationLabel = document.getElementById('summary-duration-label');
summaryDurationSlider.addEventListener('input', () => {
  state.opts.summaryDuration = parseInt(summaryDurationSlider.value, 10);
  summaryDurationLabel.textContent = summaryDurationSlider.value + 's';
});

// --- Search autocomplete ---

let autocompleteIndex = -1;
let searchTimer = null;

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const query = searchInput.value.trim();
  if (query.length < 2) { hideAutocomplete(); return; }
  searchTimer = setTimeout(() => runSearch(query), 200);
});

searchInput.addEventListener('keydown', (e) => {
  const items = autocompleteList.querySelectorAll('li');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    autocompleteIndex = Math.min(autocompleteIndex + 1, items.length - 1);
    highlightItem(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    autocompleteIndex = Math.max(autocompleteIndex - 1, -1);
    highlightItem(items);
  } else if (e.key === 'Enter') {
    if (autocompleteIndex >= 0 && items[autocompleteIndex]) items[autocompleteIndex].click();
  } else if (e.key === 'Escape') {
    hideAutocomplete();
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrap')) hideAutocomplete();
});

async function runSearch(query) {
  const results = await window.api.searchGames(query);
  showAutocomplete(results);
}

function showAutocomplete(results) {
  autocompleteList.innerHTML = '';
  autocompleteIndex = -1;
  if (!results.length) { hideAutocomplete(); return; }

  results.forEach((game) => {
    const li = document.createElement('li');
    li.textContent = game.name;
    li.addEventListener('click', () => selectGame(game));
    autocompleteList.appendChild(li);
  });
  autocompleteList.classList.remove('hidden');
}

function hideAutocomplete() {
  autocompleteList.classList.add('hidden');
  autocompleteList.innerHTML = '';
  autocompleteIndex = -1;
}

function highlightItem(items) {
  items.forEach((li, i) => li.classList.toggle('active', i === autocompleteIndex));
}

// --- Game selection ---

async function selectGame(game) {
  hideAutocomplete();
  searchInput.value = '';

  if (state.games.find(g => g.appid === game.appid)) {
    setStatus('Already added.');
    return;
  }
  if (state.games.length >= MAX_GAMES) {
    setStatus('Maximum 5 games.');
    return;
  }

  const color = PALETTE[state.games.length];
  state.games.push({ appid: game.appid, name: game.name, color });
  renderGameList();

  if (state.games.length >= MAX_GAMES) searchInput.disabled = true;

  await fetchAndRedraw();
}

function removeGame(appid) {
  stopPreview();
  state.games = state.games.filter(g => g.appid !== appid);
  state.games.forEach((g, i) => { g.color = PALETTE[i]; });
  renderGameList();
  searchInput.disabled = false;
  fetchAndRedraw();
}

function renderGameList() {
  gameList.innerHTML = '';
  state.games.forEach((game) => {
    const li = document.createElement('li');

    const colorInput = document.createElement('button');
    colorInput.className = 'game-color';
    colorInput.style.background = game.color;
    colorInput.title = 'Pick colour';
    colorInput.addEventListener('click', (e) => {
      e.stopPropagation();
      openColorPicker(game, colorInput);
    });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'game-name';
    nameSpan.title = game.name;
    nameSpan.textContent = game.name;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'game-remove';
    removeBtn.title = 'Remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => removeGame(game.appid));

    li.appendChild(colorInput);
    li.appendChild(nameSpan);
    li.appendChild(removeBtn);
    gameList.appendChild(li);
  });
}

// --- Fetch data for all games in state.games, rebuild chartGames, redraw ---

async function fetchAndRedraw() {
  stopPreview();
  updateButtons();

  if (state.games.length === 0) {
    state.chartGames = [];
    drawPlaceholder();
    return;
  }

  setStatus('Fetching data…');
  state.chartGames = [];

  for (let i = 0; i < state.games.length; i++) {
    const { appid, name, color } = state.games[i];
    setStatus(`Loading ${name}… (${i + 1}/${state.games.length})`);

    const result = await window.api.fetchPlayerData(appid);

    if (result.error || !result.months.length) {
      setStatus(`No data for ${name}: ` + (result.error || 'empty'));
      continue;
    }

    const points = result.months
      .map(m => ({ date: parseMonth(m.month), avg: m.avg, peak: m.peak }))
      .filter(p => p.date !== null);

    state.chartGames.push({ appid, name, color, points });
  }

  if (!state.chartGames.length) {
    drawPlaceholder();
    setStatus('No data loaded.');
    return;
  }

  // Preload game images via main process to avoid canvas CORS taint
  setStatus('Loading images…');
  await Promise.all(state.chartGames.map(async (g) => {
    g.image = await loadGameImage(g.appid);
  }));

  resetAnimationState(state.chartGames, canvas);
  drawFrame(1.0, state.chartGames, state.opts, canvas);
  setStatus(state.chartGames.length === 1
    ? `${state.chartGames[0].name} loaded — add another game to compare`
    : `${state.chartGames.length} games loaded`
  );
  updateButtons();
}

async function loadGameImage(appid) {
  try {
    const url = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/capsule_sm_120.jpg`;
    console.log('[app] fetching image for appid', appid, url);
    const dataUrl = await window.api.fetchImage(url);
    if (!dataUrl) {
      console.warn('[app] fetchImage returned null for appid', appid);
      return null;
    }
    console.log('[app] got dataUrl for appid', appid, 'length:', dataUrl.length);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        console.log('[app] image loaded for appid', appid, img.naturalWidth, 'x', img.naturalHeight);
        resolve(img);
      };
      img.onerror = (e) => {
        console.error('[app] image load error for appid', appid, e);
        resolve(null);
      };
      img.src = dataUrl;
    });
  } catch (e) {
    console.warn('[app] loadGameImage failed for appid', appid, e.message);
    return null;
  }
}

function updateButtons() {
  const ready = state.chartGames.length >= 1;
  btnPreview.disabled = !ready;
  btnExport.disabled = !ready;
}

// --- Placeholder ---

function drawPlaceholder() {
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.font = '400 28px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Search for games to compare', canvas.width / 2, canvas.height / 2);
}

// --- Status bar ---

function setStatus(msg) {
  statusBar.textContent = msg;
}

// --- Preview ---

btnPreview.addEventListener('click', () => {
  if (state.chartGames.length < 1) return;
  const durationMs = parseInt(durationSlider.value, 10) * 1000;
  setStatus('Playing…');
  startPreview(state.chartGames, state.opts, canvas, durationMs);
});

// --- Export ---

btnExport.addEventListener('click', async () => {
  if (state.chartGames.length < 1) return;

  const { filePath, canceled } = await window.api.saveVideoDialog();
  if (canceled || !filePath) return;

  btnExport.disabled = true;
  btnPreview.disabled = true;
  stopPreview();

  const durationSecs = parseInt(durationSlider.value, 10);
  const totalFrames = durationSecs * 30;

  try {
    await exportVideo(
      state.chartGames,
      state.opts,
      canvas,
      durationSecs,
      filePath,
      (pct) => setStatus(`Exporting… ${Math.round(pct * 100)}% (${Math.round(pct * totalFrames)}/${totalFrames} frames)`),
      audioPath,
    );
    setStatus('Export complete — ' + filePath);
    window.api.revealFile(filePath);
  } catch (e) {
    setStatus('Export failed: ' + e.message);
    console.error('[export] failed:', e);
  } finally {
    updateButtons();
  }
});

console.log('[app] window.api available:', typeof window.api !== 'undefined');
