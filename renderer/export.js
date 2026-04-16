'use strict';

// export.js — frame capture loop
// Decoupled from real time: iterates frames sequentially, no requestAnimationFrame.

async function exportVideo(games, opts, canvas, durationSecs, outPath, onProgress) {
  const animFrames = durationSecs * 30;
  const summaryFrames = opts.endSummary ? (opts.summaryDuration || 5) * 30 : 0;
  const totalFrames = animFrames + summaryFrames;

  resetAnimationState(games);

  async function captureFrame(index) {
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.slice('data:image/png;base64,'.length);
    const buffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    await window.api.writeFrame(index, buffer);
  }

  // Phase 1: normal animation
  for (let f = 0; f < animFrames; f++) {
    const progress = f / (animFrames - 1);
    drawFrame(progress, games, opts, canvas);
    await captureFrame(f);
    if (onProgress) onProgress(f / totalFrames);
  }

  // Phase 2: full-range summary
  if (opts.endSummary) {
    for (let f = 0; f < summaryFrames; f++) {
      const summaryProgress = f / (summaryFrames - 1);
      drawFrame(1.0, games, { ...opts, summaryProgress }, canvas);
      await captureFrame(animFrames + f);
      if (onProgress) onProgress((animFrames + f) / totalFrames);
    }
  }

  await window.api.encodeVideo(outPath, { fps: 30 });
}
