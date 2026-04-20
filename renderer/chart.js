'use strict';

// chart.js — pure render function
// drawFrame(progress, games, opts, canvas) produces one complete frame.
// Mutable eased state lives here and must be reset before each animation run.

// Base layout constants (fallback / for resetAnimationState)
const MARGIN = { top: 160, right: 40, bottom: 160, left: 40 };
const LABEL_H = 80;
const LABEL_GAP = 12;

// Returns layout constants for the current canvas size.
// Chart fills the full width; pills overlay on the right side.
function getLayout(W, H) {
  const mobile = H > W;
  const edge = 40; // thin edge padding on both sides
  return {
    margin: {
      top:    mobile ? 200 : 160,
      right:  edge,
      bottom: mobile ? 180 : 160,
      left:   edge,
    },
    labelH:   mobile ? 110 : 80,
    labelGap: mobile ? 14  : 12,
    pillW:    mobile ? 320 : 260,  // pill overlay width
  };
}

const MONTHS_PARSE = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// --- Mutable eased state (reset before each run) ---
let currentMax = 1000;

function resetAnimationState(games, canvas) {
  currentMax = 1000;
  const layout = canvas ? getLayout(canvas.width, canvas.height) : { margin: MARGIN, labelH: LABEL_H, labelGap: LABEL_GAP };
  games.forEach((g, i) => {
    g.labelY = layout.margin.top + i * (layout.labelH + layout.labelGap);
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

function smoothstep(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
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

// Draws text truncated with ellipsis if it exceeds maxWidth
function fillTextEllipsis(ctx, text, x, y, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y);
    return;
  }
  let t = text;
  while (t.length > 0 && ctx.measureText(t + '\u2026').width > maxWidth) {
    t = t.slice(0, -1);
  }
  ctx.fillText(t + '\u2026', x, y);
}

// Returns peak or avg for a data point depending on mode.
// Falls back to avg if peak is null (older steamcharts data).
function getVal(p, usePeak) {
  return (usePeak && p.peak != null) ? p.peak : p.avg;
}

function colorWithAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Returns drawn points + a smoothly interpolated tip for a game at currentTime.
function getVisiblePoints(game, currentTime, usePeak) {
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
    const v0 = getVal(p0, usePeak);
    const v1 = getVal(p1, usePeak);
    return {
      drawn,
      tip: { x: currentTime, val: Math.round(v0 + (v1 - v0) * t) },
    };
  }

  return {
    drawn,
    tip: { x: pts[lastIdx].date.getTime(), val: getVal(pts[lastIdx], usePeak) },
  };
}

// --- Main render function ---

function drawFrame(progress, games, opts, canvas) {
  if (!games || !games.length) return;

  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const { margin: M, labelH: LH, labelGap: LG, pillW: PILL_W } = getLayout(W, H);

  const chartL = M.left;
  const chartR = W - M.right;
  const chartT = M.top;
  const chartB = H - M.bottom;

  // --- Background ---
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, W, H);

  // --- Game title (name vs name vs name…) ---
  if (opts.showTitle !== false && games.length > 0) {
    const SEP = ' vs ';
    const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    const names = games.map(g => g.name);
    const chartAreaLeft = M.left;
    const chartAreaRight = W - M.right;
    const maxW = chartAreaRight - chartAreaLeft - 40;
    const chartMidX = chartAreaLeft + (chartAreaRight - chartAreaLeft) / 2;

    function shrinkToFit(text, start, min) {
      let sz = start;
      ctx.font = `600 ${sz}px ${FONT}`;
      while (ctx.measureText(text).width > maxW && sz > min) {
        sz -= 2;
        ctx.font = `600 ${sz}px ${FONT}`;
      }
      return sz;
    }

    // Try single line first; if it still overflows at min size, split into 2 lines
    let fontSize = shrinkToFit(names.join(SEP), 48, 24);
    ctx.font = `600 ${fontSize}px ${FONT}`;
    const fitsOnOne = names.length === 1 || ctx.measureText(names.join(SEP)).width <= maxW;

    let lineGroups;
    if (fitsOnOne) {
      lineGroups = [names];
    } else {
      // Split at midpoint — try all splits and pick the one that needs the smallest maxW
      let bestSplit = Math.ceil(names.length / 2);
      let bestWorstW = Infinity;
      for (let s = 1; s < names.length; s++) {
        const l1 = ctx.measureText(names.slice(0, s).join(SEP)).width;
        const l2 = ctx.measureText(names.slice(s).join(SEP)).width;
        const worst = Math.max(l1, l2);
        if (worst < bestWorstW) { bestWorstW = worst; bestSplit = s; }
      }
      lineGroups = [names.slice(0, bestSplit), names.slice(bestSplit)];
      // Recompute font size so the widest line fits
      const widest = lineGroups.map(g => g.join(SEP)).sort((a, b) =>
        ctx.measureText(b).width - ctx.measureText(a).width)[0];
      fontSize = shrinkToFit(widest, 44, 20);
    }

    const lineH = fontSize * 1.4;
    const totalH = lineGroups.length * lineH;
    const startY = M.top / 2 - totalH / 2 + lineH / 2;

    ctx.font = `600 ${fontSize}px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    lineGroups.forEach((lineNames, li) => {
      const lineText = lineNames.join(SEP);
      const lineW = ctx.measureText(lineText).width;
      let x = chartMidX - lineW / 2;
      const y = startY + li * lineH;

      lineNames.forEach((name, i) => {
        ctx.fillStyle = '#e6edf3';
        ctx.fillText(name, x, y);
        x += ctx.measureText(name).width;
        if (i < lineNames.length - 1) {
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.fillText(SEP, x, y);
          x += ctx.measureText(SEP).width;
        }
      });
    });
  }

  // --- Time domain ---
  const allDates = games.flatMap(g => g.points.map(p => p.date.getTime()));
  const minDate = Math.min(...allDates);
  const maxDate = Math.max(...allDates);
  const currentTime = minDate + progress * (maxDate - minDate);

  // --- Scrolling window ---
  // Phase 1: window fixed at [minDate, minDate + windowMs]
  // Phase 2: once currentTime passes 85% of the window, pan right keeping
  //          currentTime at 85% of the frame so there's always lookahead space
  const windowMs = (opts.windowYears || 4) * 365.25 * 24 * 60 * 60 * 1000;
  const scrollThreshold = minDate + windowMs * 0.85;

  let windowStart, windowEnd;
  if (currentTime <= scrollThreshold) {
    windowStart = minDate;
    windowEnd = minDate + windowMs;
  } else {
    windowStart = currentTime - windowMs * 0.85;
    windowEnd = windowStart + windowMs;
  }

  // Summary transition: smoothly expand the window toward the full date range
  if (opts.summaryProgress != null) {
    const t = smoothstep(opts.summaryProgress);
    windowStart = windowStart + (minDate - windowStart) * t;
    windowEnd   = windowEnd   + (maxDate - windowEnd)   * t;
  }

  const xScale = makeScale(windowStart, windowEnd, chartL, chartR);

  const usePeak = !!opts.usePeak;

  // --- Visible points for each game ---
  const visibles = games.map(g => getVisiblePoints(g, currentTime, usePeak));

  // --- Ease currentMax ---
  let visibleMax = 1000;
  visibles.forEach(v => {
    if (!v) return;
    v.drawn.forEach(p => { visibleMax = Math.max(visibleMax, getVal(p, usePeak)); });
    if (v.tip) visibleMax = Math.max(visibleMax, v.tip.val);
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
    const val = v.tip ? v.tip.val : getVal(v.drawn[v.drawn.length - 1], usePeak);
    return { x: xScale(ms), y: yScale(val), val };
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
  const startYear = new Date(windowStart).getFullYear();
  const endYear = new Date(windowEnd).getFullYear();
  const windowYears = (windowEnd - windowStart) / (365.25 * 24 * 60 * 60 * 1000);
  const pxPerYear = (chartR - chartL) / windowYears;

  let yearStep = 1;
  if (pxPerYear < 70) yearStep = 2;
  if (pxPerYear < 35) yearStep = 5;
  if (pxPerYear < 18) yearStep = 10;

  ctx.font = '400 26px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (let year = startYear; year <= endYear; year++) {
    const yearMs = new Date(year, 0, 1).getTime();
    if (yearMs < windowStart || yearMs > windowEnd) continue;
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

  // --- Game lines (clipped to chart area so history scrolling off left is hidden) ---
  ctx.save();
  ctx.beginPath();
  ctx.rect(chartL, chartT, chartR - chartL, chartB - chartT);
  ctx.clip();

  games.forEach((game, gi) => {
    const v = visibles[gi];
    if (!v) return;

    const thickness = opts.lineThickness || 5;
    ctx.strokeStyle = game.color;
    ctx.lineWidth = thickness;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.setLineDash([]);

    ctx.beginPath();
    v.drawn.forEach((p, i) => {
      const x = xScale(p.date.getTime());
      const y = yScale(getVal(p, usePeak));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (v.tip) ctx.lineTo(xScale(v.tip.x), yScale(v.tip.val));
    ctx.stroke();

    // Dot at tip — radius scales with line thickness
    const tc = tipCoords[gi];
    ctx.beginPath();
    ctx.arc(tc.x, tc.y, thickness * 1.8, 0, Math.PI * 2);
    ctx.fillStyle = game.color;
    ctx.fill();
  });

  ctx.restore();

  // --- Peak markers ---
  if (opts.peakMarkers !== false && opts.summaryProgress == null) {
    // Collect visible peak info for each game
    const peaks = [];
    games.forEach((game, gi) => {
      const v = visibles[gi];
      if (!v) return;

      // Find the point with the highest peak value that's been drawn
      let best = null;
      for (const p of v.drawn) {
        if (p.peak !== null && (!best || p.peak > best.peak)) best = p;
      }
      if (!best) return;

      const px = xScale(best.date.getTime());
      if (px < chartL || px > chartR) return; // scrolled off screen

      peaks.push({ game, px, py: yScale(getVal(best, usePeak)), peakVal: best.peak });
    });

    // Dashed lines + dots (inside chart clip)
    ctx.save();
    ctx.beginPath();
    ctx.rect(chartL, chartT, chartR - chartL, chartB - chartT);
    ctx.clip();

    peaks.forEach(({ game, px, py, peakVal }) => {
      ctx.strokeStyle = colorWithAlpha(game.color, 0.5);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, chartT);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fillStyle = game.color;
      ctx.fill();
    });

    ctx.restore();

    // Labels in top margin — stagger vertically to avoid overlap
    ctx.font = '400 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    const LABEL_STEP = 30;  // px per vertical slot
    const LABEL_PAD = 12;   // horizontal padding between labels

    // Measure each label and sort left-to-right for greedy placement
    const peakLabels = peaks.map(p => ({
      ...p,
      text: formatY(p.peakVal) + ' peak',
      halfW: ctx.measureText(formatY(p.peakVal) + ' peak').width / 2,
      slot: 0,
    }));
    peakLabels.sort((a, b) => a.px - b.px);

    // Greedy slot assignment: for each label find the lowest slot where it
    // doesn't overlap any already-placed label in that slot
    const placed = [];
    for (const label of peakLabels) {
      let slot = 0;
      let collision = true;
      while (collision) {
        collision = placed.some(p =>
          p.slot === slot &&
          Math.abs(p.px - label.px) < p.halfW + label.halfW + LABEL_PAD
        );
        if (collision) slot++;
      }
      label.slot = slot;
      placed.push(label);
    }

    peakLabels.forEach(({ game, px, slot, text }) => {
      ctx.fillStyle = colorWithAlpha(game.color, 0.85);
      ctx.fillText(text, px, chartT - 8 - slot * LABEL_STEP);
    });
  }

  // --- Ranked label stack ---

  // Build list of games that have data, with their current values
  const activeItems = games
    .map((game, gi) => ({ game, gi, val: tipCoords[gi] ? tipCoords[gi].val : -1 }))
    .filter(item => tipCoords[item.gi] !== null);

  // Sort with hysteresis: group values within 1% of currentMax into the same
  // bucket so near-equal games don't swap rank every frame
  const bucket = Math.max(1, currentMax * 0.01);
  activeItems.sort((a, b) => Math.round(b.val / bucket) - Math.round(a.val / bucket));

  // Ease each game's label toward its target rank position
  activeItems.forEach((item, rank) => {
    const targetY = chartT + rank * (LH + LG);
    if (item.game.labelY === undefined) item.game.labelY = targetY;
    item.game.labelY += (targetY - item.game.labelY) * 0.18;
  });

  const pillW = PILL_W;
  const labelX = W - M.right - pillW - 10;

  // Scale font sizes with pill height
  const pillScale = LH / 80;
  const nameFontSize = Math.round(23 * pillScale);
  const valFontSize  = Math.round(20 * pillScale);
  const imgValFontSize = Math.round(22 * pillScale);

  // Fade out pills + connectors during summary transition
  const pillAlpha = opts.summaryProgress != null ? 1 - smoothstep(opts.summaryProgress) : 1;
  ctx.save();
  ctx.globalAlpha = pillAlpha;

  // Draw connector lines first (they sit behind the pills)
  activeItems.forEach(item => {
    const tc = tipCoords[item.gi];
    const midY = item.game.labelY + LH / 2;

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
  if (pillAlpha > 0) activeItems.forEach(item => {
    const y = item.game.labelY;
    const midY = y + LH / 2;
    const hasImage = !!item.game.image && opts.showImages !== false;

    // Pill background
    ctx.fillStyle = 'rgba(13,17,23,0.82)';
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(labelX, y, pillW, LH, 8);
    ctx.fill();
    ctx.stroke();

    // Colored left border strip
    ctx.fillStyle = item.game.color;
    ctx.fillRect(labelX, y, 4, LH);

    if (hasImage) {
      // Image mode: image on left, value right-aligned, no name text
      const IMG_SLOT_W = pillW - 14 - Math.round(60 * pillScale);
      const IMG_SLOT_H = LH - 10;
      const natW = item.game.image.naturalWidth  || 184;
      const natH = item.game.image.naturalHeight || 69;
      const scale = Math.min(IMG_SLOT_W / natW, IMG_SLOT_H / natH);
      const imgW = natW * scale;
      const imgH = natH * scale;
      const imgX = labelX + 8;
      const imgY = y + (LH - imgH) / 2;

      ctx.drawImage(item.game.image, imgX, imgY, imgW, imgH);

      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = `600 ${imgValFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(formatY(item.val), labelX + pillW - 10, midY);
    } else {
      // No image: colour swatch + name + value
      const swatchSize = Math.round(16 * pillScale);
      ctx.fillStyle = item.game.color;
      ctx.fillRect(labelX + 14, midY - swatchSize / 2, swatchSize, swatchSize);
      const textX = labelX + 14 + swatchSize + 8;
      const maxTextW = labelX + pillW - textX - 10;

      ctx.fillStyle = '#e6edf3';
      ctx.font = `500 ${nameFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      fillTextEllipsis(ctx, item.game.name, textX, midY - Math.round(11 * pillScale), maxTextW);

      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = `400 ${valFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.fillText(formatY(item.val), textX, midY + Math.round(13 * pillScale));
    }
  });
  ctx.restore();

  // --- Current date label centred at bottom ---
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '400 32px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(formatDateLabel(new Date(currentTime)), W / 2, H - 48);

  // --- Summary stats overlay ---
  if (opts.summaryProgress != null && opts.summaryStats !== false) {
    const alpha = smoothstep(opts.summaryProgress);
    if (alpha <= 0) return;

    // Sort games by their final data point value (descending)
    const ranked = games
      .filter(g => g.points && g.points.length > 0)
      .map(g => {
        const finalVal = getVal(g.points[g.points.length - 1], usePeak);
        const allTimePeak = g.points.reduce((m, p) => Math.max(m, p.peak ?? 0), 0);
        return { game: g, finalVal, allTimePeak };
      })
      .sort((a, b) => b.allTimePeak - a.allTimePeak);

    const ROW_H = 68;
    const PAD = 28;
    const panelW = W - M.left - M.right;
    const panelH = PAD + ranked.length * ROW_H + PAD;
    const panelX = M.left;
    const panelY = chartT + 20;

    // Panel background
    ctx.fillStyle = `rgba(13,17,23,${0.9 * alpha})`;
    ctx.strokeStyle = `rgba(255,255,255,${0.1 * alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, 12);
    ctx.fill();
    ctx.stroke();

    // Metric label (top right of panel)
    const metricLabel = 'ALL-TIME PEAK';
    ctx.fillStyle = `rgba(255,255,255,${0.3 * alpha})`;
    ctx.font = `500 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(metricLabel, panelX + panelW - 20, panelY + 14);

    ranked.forEach(({ game, finalVal, allTimePeak }, rank) => {
      const rowY = panelY + PAD + rank * ROW_H;
      const midY = rowY + ROW_H / 2;

      // Rank number
      ctx.fillStyle = `rgba(255,255,255,${0.35 * alpha})`;
      ctx.font = `600 26px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`#${rank + 1}`, panelX + 56, midY);

      // Colour bar
      ctx.fillStyle = colorWithAlpha(game.color, alpha);
      ctx.fillRect(panelX + 64, rowY + 10, 4, ROW_H - 20);

      const hasImage = !!game.image && opts.showImages !== false;
      let nameX = panelX + 78;

      if (hasImage) {
        // Fit capsule image into row height slot
        const IMG_SLOT_W = 120;
        const IMG_SLOT_H = ROW_H - 16;
        const natW = game.image.naturalWidth  || 184;
        const natH = game.image.naturalHeight || 69;
        const scale = Math.min(IMG_SLOT_W / natW, IMG_SLOT_H / natH);
        const imgW = natW * scale;
        const imgH = natH * scale;
        const imgX = panelX + 78;
        const imgY = rowY + (ROW_H - imgH) / 2;
        ctx.globalAlpha = alpha;
        ctx.drawImage(game.image, imgX, imgY, imgW, imgH);
        ctx.globalAlpha = 1;
        nameX = imgX + IMG_SLOT_W + 10;
      }

      // Game name
      ctx.fillStyle = `rgba(230,237,243,${alpha})`;
      ctx.font = `500 28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      fillTextEllipsis(ctx, game.name, nameX, midY, panelX + panelW - 120 - nameX);

      // Value (all-time peak)
      ctx.fillStyle = colorWithAlpha(game.color, alpha);
      ctx.font = `600 30px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(formatY(allTimePeak), panelX + panelW - 20, midY);
    });
  }
}
