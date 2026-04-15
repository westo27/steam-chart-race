// app.js — UI logic, step 1 scaffold
// Search, game list, and controls wiring. Chart/animation added in later steps.

const PALETTE = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6'];
const MAX_GAMES = 5;

const state = {
  games: [], // { appid, name, color, data: null }
};

// --- DOM refs ---
const searchInput = document.getElementById('game-search');
const autocompleteList = document.getElementById('autocomplete-list');
const gameList = document.getElementById('game-list');
const durationSlider = document.getElementById('duration-slider');
const durationLabel = document.getElementById('duration-label');
const btnPreview = document.getElementById('btn-preview');
const btnExport = document.getElementById('btn-export');
const statusBar = document.getElementById('status-bar');
const canvas = document.getElementById('chart-canvas');

// Set canvas to export resolution; CSS scales it to fit
canvas.width = 1080;
canvas.height = 1920;

const ctx = canvas.getContext('2d');

// Draw placeholder frame
drawPlaceholder();

// --- Duration slider ---

durationSlider.addEventListener('input', () => {
  durationLabel.textContent = durationSlider.value + 's';
});

// --- Search autocomplete ---

let autocompleteIndex = -1;
let searchTimer = null;

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const query = searchInput.value.trim();
  if (query.length < 2) {
    hideAutocomplete();
    return;
  }
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
    if (autocompleteIndex >= 0 && items[autocompleteIndex]) {
      items[autocompleteIndex].click();
    }
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

  if (!results.length) {
    hideAutocomplete();
    return;
  }

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
  items.forEach((li, i) => {
    li.classList.toggle('active', i === autocompleteIndex);
  });
}

// --- Game selection ---

function selectGame(game) {
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
  state.games.push({ appid: game.appid, name: game.name, color, data: null });
  renderGameList();
  updateButtons();

  if (state.games.length >= MAX_GAMES) {
    searchInput.disabled = true;
  }
}

function removeGame(appid) {
  state.games = state.games.filter(g => g.appid !== appid);
  // Reassign colors in order
  state.games.forEach((g, i) => { g.color = PALETTE[i]; });
  renderGameList();
  updateButtons();
  searchInput.disabled = false;
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

function updateButtons() {
  const hasGames = state.games.length >= 2;
  btnPreview.disabled = !hasGames;
  btnExport.disabled = !hasGames;
}

// --- Placeholder canvas render ---

function drawPlaceholder() {
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.font = '400 28px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Add 2+ games to preview', canvas.width / 2, canvas.height / 2);
}

// --- Status bar ---

function setStatus(msg) {
  statusBar.textContent = msg;
}

// --- Preview / Export (stubs for step 1) ---

btnPreview.addEventListener('click', () => {
  setStatus('Preview coming in step 4.');
});

btnExport.addEventListener('click', () => {
  setStatus('Export coming in step 7.');
});

// Log that the IPC bridge is present
console.log('[app] window.api available:', typeof window.api !== 'undefined');
