// Steam Chart Race — animated player count videos
// Copyright (C) 2026 Tom Weston
// Licensed under GPL v3. See LICENSE for details.

// Steam game search via Steam's store search API.
// Replaces the original GetAppList approach — that endpoint was removed by Valve.
// Live search means results are always current and no local DB is needed.

const SEARCH_URL = 'https://store.steampowered.com/api/storesearch/?term={TERM}&f=games&cc=US&l=english';

async function search(query) {
  if (!query || query.length < 2) return [];

  const url = SEARCH_URL.replace('{TERM}', encodeURIComponent(query));

  let json;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SteamChartRace/1.0 (personal tool)' },
    });
    if (!res.ok) {
      console.error('[steam-apps] search HTTP error:', res.status);
      return [];
    }
    json = await res.json();
  } catch (e) {
    console.error('[steam-apps] search error:', e.message);
    return [];
  }

  const items = json?.items ?? [];
  return items
    .filter(item => item.type === 'app')
    .slice(0, 10)
    .map(item => ({ appid: item.id, name: item.name }));
}

// No-op — kept so main.js call site doesn't break
async function refreshIfNeeded() {}

module.exports = { search, refreshIfNeeded };
