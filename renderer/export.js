'use strict';

// export.js — frame capture loop
// Decoupled from real time: iterates frames sequentially, no requestAnimationFrame.

async function exportVideo(games, opts, canvas, durationSecs, outPath, onProgress) {
  const totalFrames = durationSecs * 30;

  resetAnimationState(games);

  for (let f = 0; f < totalFrames; f++) {
    const progress = f / (totalFrames - 1);
    drawFrame(progress, games, opts, canvas);

    // Capture canvas as PNG and send to main process
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.slice('data:image/png;base64,'.length);
    const buffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

    await window.api.writeFrame(f, buffer);

    if (onProgress) onProgress(f / totalFrames);
  }

  await window.api.encodeVideo(outPath, { fps: 30 });
}
