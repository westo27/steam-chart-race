'use strict';

// animation.js — preview loop
// Calls drawFrame() on every display refresh until progress reaches 1,
// then optionally plays a 5-second full-range summary at the end.

let animationId = null;

function startPreview(games, opts, canvas, durationMs) {
  stopPreview();
  resetAnimationState(games, canvas);

  const TRANSITION_MS = 1000;
  const HOLD_MS = (opts.summaryDuration || 5) * 1000;
  const SUMMARY_MS = TRANSITION_MS + HOLD_MS;
  let startTime = null;

  function tick(timestamp) {
    if (!startTime) startTime = timestamp;
    const elapsed = timestamp - startTime;

    if (elapsed <= durationMs) {
      // Normal animation phase
      drawFrame(elapsed / durationMs, games, opts, canvas);
      animationId = requestAnimationFrame(tick);
    } else if (opts.endSummary && elapsed <= durationMs + SUMMARY_MS) {
      // Transition (1s) then hold at full range for summaryDuration
      const summaryElapsed = elapsed - durationMs;
      const summaryProgress = Math.min(summaryElapsed / TRANSITION_MS, 1);
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
