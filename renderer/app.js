'use strict';

const PALETTE = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6'];
const MAX_GAMES = 5;

const state = {
  games: [],       // { appid, name, color } — sidebar game list
  chartGames: [],  // { name, color, points } — ready for drawFrame
  opts: { snapToNice: true, logScale: false, windowYears: 4 },
};

// --- DOM refs ---
const searchInput = document.getElementById('game-search');
const autocompleteList = document.getElementById('autocomplete-list');
const gameList = document.getElementById('game-list');
const durationSlider = document.getElementById('duration-slider');
const durationLabel = document.getElementById('duration-label');
const windowSlider = document.getElementById('window-slider');
const windowLabel = document.getElementById('window-label');
const btnPreview = document.getElementById('btn-preview');
const btnExport = document.getElementById('btn-export');
const statusBar = document.getElementById('status-bar');
const canvas = document.getElementById('chart-canvas');

canvas.width = 1080;
canvas.height = 1920;

const ctx = canvas.getContext('2d');
drawPlaceholder();

// --- Duration slider ---

durationSlider.addEventListener('input', () => {
  durationLabel.textContent = durationSlider.value + 's';
});

windowSlider.addEventListener('input', () => {
  state.opts.windowYears = parseInt(windowSlider.value, 10);
  windowLabel.textContent = windowSlider.value + 'yr';
  if (state.chartGames.length) {
    resetAnimationState(state.chartGames);
    drawFrame(1.0, state.chartGames, state.opts, canvas);
  }
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
    li.innerHTML = `
      <span class="game-swatch" style="background:${game.color}"></span>
      <span class="game-name" title="${game.name}">${game.name}</span>
      <button class="game-remove" title="Remove">×</button>
    `;
    li.querySelector('.game-remove').addEventListener('click', () => removeGame(game.appid));
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
    setStatus(`Fetching ${name}… (${i + 1}/${state.games.length})`);

    const result = await window.api.fetchPlayerData(appid);

    if (result.error || !result.months.length) {
      setStatus(`No data for ${name}: ` + (result.error || 'empty'));
      continue;
    }

    const points = result.months
      .map(m => ({ date: parseMonth(m.month), avg: m.avg, peak: m.peak }))
      .filter(p => p.date !== null);

    state.chartGames.push({ name, color, points });
  }

  if (!state.chartGames.length) {
    drawPlaceholder();
    setStatus('No data loaded.');
    return;
  }

  resetAnimationState(state.chartGames);
  drawFrame(1.0, state.chartGames, state.opts, canvas);
  setStatus(state.chartGames.length === 1
    ? `${state.chartGames[0].name} loaded — add another game to compare`
    : `${state.chartGames.length} games loaded`
  );
  updateButtons();
}

function updateButtons() {
  const ready = state.chartGames.length >= 2;
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
  if (state.chartGames.length < 2) return;
  const durationMs = parseInt(durationSlider.value, 10) * 1000;
  setStatus('Playing…');
  startPreview(state.chartGames, state.opts, canvas, durationMs);
});

// --- Export ---

btnExport.addEventListener('click', async () => {
  if (state.chartGames.length < 2) return;

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
    );
    setStatus('Export complete: ' + filePath);
  } catch (e) {
    setStatus('Export failed: ' + e.message);
    console.error('[export] failed:', e);
  } finally {
    updateButtons();
  }
});

console.log('[app] window.api available:', typeof window.api !== 'undefined');
