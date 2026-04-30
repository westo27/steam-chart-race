// Steam Chart Race — animated player count videos
// Copyright (C) 2026 Tom Weston
// Licensed under GPL v3. See LICENSE for details.

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const cheerio = require('cheerio');

const REQUEST_DELAY_MS = 2000;
const MAX_RETRIES = 3;

let lastRequestTime = 0;

// --- Cache helpers ---

function getCacheDir() {
  return path.join(app.getPath('userData'), 'steamcharts-cache');
}

function cacheMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function readCache(appid) {
  const cachePath = path.join(getCacheDir(), `${appid}.json`);
  if (!fs.existsSync(cachePath)) {
    return null;
  }
  try {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const currentMonth = cacheMonthKey();
    if (cached.cacheMonth === currentMonth) {
      console.log(`[steamcharts] cache HIT for appid ${appid} (${cached.data?.months?.length ?? 0} months)`);
      return cached.data;
    }
    console.log(`[steamcharts] cache STALE for appid ${appid}: file=${cached.cacheMonth}, now=${currentMonth}`);
    return null;
  } catch (e) {
    console.error('[steamcharts] cache read error:', e.message);
    return null;
  }
}

function writeCache(appid, data) {
  const cacheDir = getCacheDir();
  fs.mkdirSync(cacheDir, { recursive: true });
  const cachePath = path.join(cacheDir, `${appid}.json`);
  fs.writeFileSync(cachePath, JSON.stringify({ cacheMonth: cacheMonthKey(), data }, null, 2), 'utf8');
  console.log(`[steamcharts] cached appid ${appid}`);
}

// --- Fetch with rate limiting + exponential backoff on 429 ---

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = 0) {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < REQUEST_DELAY_MS) {
    await sleep(REQUEST_DELAY_MS - elapsed);
  }
  lastRequestTime = Date.now();

  const res = await fetch(url, {
    headers: { 'User-Agent': 'SteamChartRace/1.0 (personal tool, no commercial use)' },
  });

  if (res.status === 429) {
    if (retries >= MAX_RETRIES) {
      throw new Error('Rate limited by steamcharts — try again later');
    }
    const backoff = 30000 * Math.pow(2, retries);
    console.warn(`[steamcharts] 429 received, retrying in ${backoff / 1000}s (attempt ${retries + 1})`);
    await sleep(backoff);
    return fetchWithRetry(url, retries + 1);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }

  return res.text();
}

// --- HTML parser ---

function parsePlayerData(html, appid) {
  try {
    const $ = cheerio.load(html);
    const rows = [];

    // Steamcharts table: Month | Avg. Players | Gain | % Gain | Peak Players
    $('table.common-table tbody tr').each((_i, tr) => {
      const cells = $(tr).find('td');
      if (cells.length < 5) return;

      const monthStr = $(cells[0]).text().trim();
      // Remove commas from numbers like "1,234,567.8"
      const avgStr = $(cells[1]).text().trim().replace(/,/g, '');
      const peakStr = $(cells[4]).text().trim().replace(/,/g, '');

      const avg = parseFloat(avgStr);
      const peak = parseInt(peakStr, 10);

      // Skip rows with unparseable data
      if (!monthStr || isNaN(avg)) return;

      rows.push({
        month: monthStr,
        avg: Math.round(avg),
        peak: isNaN(peak) ? null : peak,
      });
    });

    if (!rows.length) {
      console.warn('[steamcharts] table parsed but no rows found — logging HTML snippet:');
      console.warn(html.slice(0, 3000));
      return { error: 'no_data', months: [] };
    }

    // Steamcharts returns newest-first — reverse to chronological order
    rows.reverse();

    // Drop the trailing "Last 30 Days" partial-month row steamcharts always appends
    if (rows.length && rows[rows.length - 1].month === 'Last 30 Days') {
      rows.pop();
    }

    console.log(`[steamcharts] parsed ${rows.length} months for appid ${appid}`);
    return { error: null, months: rows };

  } catch (e) {
    console.error('[steamcharts] parse threw:', e.message);
    console.error('[steamcharts] HTML snippet:', html.slice(0, 3000));
    return { error: e.message, months: [] };
  }
}

// --- Public API ---

async function fetchPlayerData(appid) {
  const cached = readCache(appid);
  if (cached) return cached;

  const url = `https://steamcharts.com/app/${appid}`;
  console.log(`[steamcharts] fetching ${url}`);

  let html;
  try {
    html = await fetchWithRetry(url);
  } catch (e) {
    console.error('[steamcharts] fetch failed:', e.message);
    return { error: e.message, months: [], appid };
  }

  const result = parsePlayerData(html, appid);
  result.appid = appid;

  if (!result.error && result.months.length) {
    writeCache(appid, result);
  }

  return result;
}

module.exports = { fetchPlayerData };
