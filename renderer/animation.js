'use strict';

// animation.js — preview loop
// Calls drawFrame() on every display refresh until progress reaches 1,
// then optionally plays a 5-second full-range summary at the end.

let animationId = null;

function startPreview(games, opts, canvas, durationMs) {
  stopPreview();
  resetAnimationState(games);

  const SUMMARY_MS = (opts.summaryDuration || 5) * 1000;
  let startTime = null;

  function tick(timestamp) {
    if (!startTime) startTime = timestamp;
    const elapsed = timestamp - startTime;

    if (elapsed <= durationMs) {
      // Normal animation phase
      drawFrame(elapsed / durationMs, games, opts, canvas);
      animationId = requestAnimationFrame(tick);
    } else if (opts.endSummary && elapsed <= durationMs + SUMMARY_MS) {
      // Summary phase: smoothly expand window toward full range
      const summaryProgress = (elapsed - durationMs) / SUMMARY_MS;
      drawFrame(1.0, games, { ...opts, summaryProgress }, canvas);
      animationId = requestAnimationFrame(tick);
    } else {
      animationId = null;
    }
  }

  animationId = requestAnimationFrame(tick);
}

function stopPreview() {
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}
