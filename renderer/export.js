// Steam Chart Race — animated player count videos
// Copyright (C) 2026 Tom Weston
// Licensed under GPL v3. See LICENSE for details.

'use strict';

// export.js — frame capture loop
// Decoupled from real time: iterates frames sequentially, no requestAnimationFrame.

async function exportVideo(games, opts, canvas, durationSecs, outPath, onProgress, audioFilePath) {
  const animFrames = durationSecs * 30;
  const TRANSITION_FRAMES = 30; // 1 second at 30fps
  const holdFrames = opts.endSummary ? (opts.summaryDuration || 5) * 30 : 0;
  const summaryFrames = opts.endSummary ? TRANSITION_FRAMES + holdFrames : 0;
  const totalFrames = animFrames + summaryFrames;

  resetAnimationState(games, canvas);

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
    // 1-second transition: expand window to full range
    for (let f = 0; f < TRANSITION_FRAMES; f++) {
      const summaryProgress = f / (TRANSITION_FRAMES - 1);
      drawFrame(1.0, games, { ...opts, summaryProgress }, canvas);
      await captureFrame(animFrames + f);
      if (onProgress) onProgress((animFrames + f) / totalFrames);
    }
    // Hold at full range for summaryDuration seconds
    for (let f = 0; f < holdFrames; f++) {
      drawFrame(1.0, games, { ...opts, summaryProgress: 1 }, canvas);
      await captureFrame(animFrames + TRANSITION_FRAMES + f);
      if (onProgress) onProgress((animFrames + TRANSITION_FRAMES + f) / totalFrames);
    }
  }

  const totalDuration = totalFrames / 30;
  await window.api.encodeVideo(outPath, { fps: 30, audioPath: audioFilePath || null, totalDuration });
}
