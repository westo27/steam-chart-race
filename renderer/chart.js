'use strict';

// chart.js — pure render function
// drawFrame(progress, games, opts, canvas) produces one complete frame.
// Mutable eased state lives here and must be reset before each animation run.

const MARGIN = {
  top: 120,
  right: 280,
  bottom: 160,
  left: 90,
};

const LABEL_H = 80;    // pill height in canvas px
const LABEL_GAP = 12;  // gap between pills

const MONTHS_PARSE = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// --- Mutable eased state (reset before each run) ---
let currentMax = 1000;

function resetAnimationState(games) {
  currentMax = 1000;
  // Initialise each game's label Y to its stacked position so there's no
  // fly-in on the first frame
  games.forEach((g, i) => {
    g.labelY = MARGIN.top + i * (LABEL_H + LABEL_GAP);
  });
}

// --- Utilities ---

function parseMonth(str) {
  const parts = str.split(' ');
  const monthIndex = MONTHS_PARSE.indexOf(parts[0]);
  const year = parseInt(parts[1], 10);
  if (monthIndex === -1 || isNaN(year)) return null;
  return new Date(year, monthIndex, 1);
}

function makeScale(d0, d1, r0, r1) {
  return (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
}

function niceMax(v) {
  if (v <= 0) return 1000;
  const steps = [1, 2, 2.5, 5, 10];
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const s of steps) {
    if (s * mag >= v) return s * mag;
  }
  return 10 * mag;
}

function formatY(v) {
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    return (m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)) + 'M';
  }
  if (v >= 1_000) {
    return Math.round(v / 1_000) + 'K';
  }
  return String(Math.round(v));
}

function formatDateLabel(date) {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function colorWithAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Returns drawn points + a smoothly interpolated tip for a game at currentTime.
function getVisiblePoints(game, currentTime) {
  const pts = game.points;

  let lastIdx = -1;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].date.getTime() <= currentTime) lastIdx = i;
    else break;
  }

  if (lastIdx < 0) return null;

  const drawn = pts.slice(0, lastIdx + 1);

  if (lastIdx < pts.length - 1) {
    const p0 = pts[lastIdx];
    const p1 = pts[lastIdx + 1];
    const t = (currentTime - p0.date.getTime()) / (p1.date.getTime() - p0.date.getTime());
    return {
      drawn,
      tip: {
        x: currentTime,
        avg: Math.round(p0.avg + (p1.avg - p0.avg) * t),
      },
    };
  }

  return {
    drawn,
    tip: { x: pts[lastIdx].date.getTime(), avg: pts[lastIdx].avg },
  };
}

// --- Main render function ---

function drawFrame(progress, games, opts, canvas) {
  if (!games || !games.length) return;

  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const chartL = MARGIN.left;
  const chartR = W - MARGIN.right;
  const chartT = MARGIN.top;
  const chartB = H - MARGIN.bottom;

  // --- Background ---
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, W, H);

  // --- Time domain ---
  const allDates = games.flatMap(g => g.points.map(p => p.date.getTime()));
  const minDate = Math.min(...allDates);
  const maxDate = Math.max(...allDates);
  const xScale = makeScale(minDate, maxDate, chartL, chartR);
  const currentTime = minDate + progress * (maxDate - minDate);

  // --- Visible points for each game ---
  const visibles = games.map(g => getVisiblePoints(g, currentTime));

  // --- Ease currentMax ---
  let visibleMax = 1000;
  visibles.forEach(v => {
    if (!v) return;
    v.drawn.forEach(p => { visibleMax = Math.max(visibleMax, p.avg); });
    if (v.tip) visibleMax = Math.max(visibleMax, v.tip.avg);
  });

  const targetMax = opts.snapToNice ? niceMax(visibleMax * 1.1) : visibleMax * 1.1;
  if (progress >= 1) {
    currentMax = targetMax;
  } else {
    currentMax += (targetMax - currentMax) * 0.08;
  }
  if (currentMax < 1000) currentMax = 1000;

  const yScale = makeScale(0, currentMax, chartB, chartT);

  // --- Tip canvas coords (needed by both lines and connector lines) ---
  const tipCoords = games.map((game, gi) => {
    const v = visibles[gi];
    if (!v) return null;
    const ms = v.tip ? v.tip.x : v.drawn[v.drawn.length - 1].date.getTime();
    const avg = v.tip ? v.tip.avg : v.drawn[v.drawn.length - 1].avg;
    return { x: xScale(ms), y: yScale(avg), avg };
  });

  // --- Grid lines + Y axis labels ---
  const GRID_STEPS = 5;
  ctx.setLineDash([]);
  ctx.font = '400 30px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let i = 0; i <= GRID_STEPS; i++) {
    const val = (currentMax / GRID_STEPS) * i;
    const y = yScale(val);

    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartL, y);
    ctx.lineTo(chartR, y);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText(formatY(val), chartL - 14, y);
  }

  // --- X axis year markers ---
  const startYear = new Date(minDate).getFullYear();
  const endYear = new Date(maxDate).getFullYear();
  const pxPerYear = (chartR - chartL) / (endYear - startYear || 1);

  let yearStep = 1;
  if (pxPerYear < 70) yearStep = 2;
  if (pxPerYear < 35) yearStep = 5;
  if (pxPerYear < 15) yearStep = 10;

  ctx.font = '400 26px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (let year = startYear; year <= endYear; year++) {
    const yearMs = new Date(year, 0, 1).getTime();
    if (yearMs < minDate || yearMs > maxDate) continue;
    const x = xScale(yearMs);
    const showLabel = (year - startYear) % yearStep === 0;

    ctx.strokeStyle = showLabel ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(x, chartT);
    ctx.lineTo(x, chartB);
    ctx.stroke();
    ctx.setLineDash([]);

    if (showLabel) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillText(String(year), x, chartB + 18);
    }
  }

  // --- Game lines ---
  games.forEach((game, gi) => {
    const v = visibles[gi];
    if (!v) return;

    ctx.strokeStyle = game.color;
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.setLineDash([]);

    ctx.beginPath();
    v.drawn.forEach((p, i) => {
      const x = xScale(p.date.getTime());
      const y = yScale(p.avg);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (v.tip) ctx.lineTo(xScale(v.tip.x), yScale(v.tip.avg));
    ctx.stroke();

    // Dot at tip
    const tc = tipCoords[gi];
    ctx.beginPath();
    ctx.arc(tc.x, tc.y, 9, 0, Math.PI * 2);
    ctx.fillStyle = game.color;
    ctx.fill();
  });

  // --- Ranked label stack ---

  // Build list of games that have data, with their current values
  const activeItems = games
    .map((game, gi) => ({ game, gi, avg: tipCoords[gi] ? tipCoords[gi].avg : -1 }))
    .filter(item => tipCoords[item.gi] !== null);

  // Sort with hysteresis: group values within 1% of currentMax into the same
  // bucket so near-equal games don't swap rank every frame
  const bucket = Math.max(1, currentMax * 0.01);
  activeItems.sort((a, b) => Math.round(b.avg / bucket) - Math.round(a.avg / bucket));

  // Ease each game's label toward its target rank position
  activeItems.forEach((item, rank) => {
    const targetY = chartT + rank * (LABEL_H + LABEL_GAP);
    if (item.game.labelY === undefined) item.game.labelY = targetY;
    item.game.labelY += (targetY - item.game.labelY) * 0.18;
  });

  const labelX = chartR + 16;
  const pillW = W - labelX - 10;

  // Draw connector lines first (they sit behind the pills)
  activeItems.forEach(item => {
    const tc = tipCoords[item.gi];
    const midY = item.game.labelY + LABEL_H / 2;

    ctx.strokeStyle = colorWithAlpha(item.game.color, 0.35);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(labelX, midY);
    ctx.lineTo(tc.x, tc.y);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // Draw pills
  activeItems.forEach(item => {
    const y = item.game.labelY;
    const midY = y + LABEL_H / 2;

    // Pill background
    ctx.fillStyle = '#161b22';
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(labelX, y, pillW, LABEL_H, 8);
    ctx.fill();
    ctx.stroke();

    // Colour swatch
    const swatchX = labelX + 14;
    ctx.fillStyle = item.game.color;
    ctx.fillRect(swatchX, midY - 8, 16, 16);

    // Game name
    ctx.fillStyle = '#e6edf3';
    ctx.font = '500 26px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.game.name, swatchX + 24, midY - 12);

    // Current value
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '400 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(formatY(item.avg), swatchX + 24, midY + 14);
  });

  // --- Current date label centred at bottom ---
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '400 32px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(formatDateLabel(new Date(currentTime)), W / 2, H - 48);
}
