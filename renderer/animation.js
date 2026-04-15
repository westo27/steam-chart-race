'use strict';

// animation.js — preview loop
// Calls drawFrame() on every display refresh until progress reaches 1.

let animationId = null;

function startPreview(games, opts, canvas, durationMs) {
  stopPreview();
  resetAnimationState(games);

  let startTime = null;

  function tick(timestamp) {
    if (!startTime) startTime = timestamp;
    const progress = Math.min((timestamp - startTime) / durationMs, 1);

    drawFrame(progress, games, opts, canvas);

    if (progress < 1) {
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
