const os = require('os');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

// Point fluent-ffmpeg at the bundled binary
ffmpeg.setFfmpegPath(ffmpegPath);

let tempDir = null;

function writeFrame(index, buffer) {
  if (!tempDir) {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'steamchartrace-'));
    console.log('[ffmpeg-export] temp dir:', tempDir);
  }
  const filename = path.join(tempDir, `frame_${String(index).padStart(4, '0')}.png`);
  fs.writeFileSync(filename, Buffer.from(buffer));
}

function encodeVideo(outPath, opts) {
  const { fps = 30 } = opts;
  const inputPattern = path.join(tempDir, 'frame_%04d.png');

  console.log('[ffmpeg-export] encoding', outPath);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(inputPattern)
      .inputOptions([`-framerate ${fps}`])
      // Silent audio track — required by TikTok/Instagram, prevents platform flagging
      .input('anullsrc=r=44100:cl=stereo')
      .inputOptions(['-f lavfi'])
      .outputOptions([
        '-c:v libx264',
        '-pix_fmt yuv420p',  // non-negotiable for platform compatibility
        '-crf 18',           // high quality
        '-movflags +faststart', // metadata at front for streaming previews
        '-shortest',         // trim silent audio to video length
      ])
      .output(outPath)
      .on('start', cmd => console.log('[ffmpeg-export] command:', cmd))
      .on('progress', p => console.log(`[ffmpeg-export] progress: ${Math.round(p.percent ?? 0)}%`))
      .on('end', () => {
        console.log('[ffmpeg-export] done:', outPath);
        cleanup();
        resolve({ success: true });
      })
      .on('error', (err, stdout, stderr) => {
        console.error('[ffmpeg-export] error:', err.message);
        console.error('[ffmpeg-export] stderr:', stderr);
        cleanup();
        reject(new Error(err.message));
      })
      .run();
  });
}

function cleanup() {
  if (tempDir) {
    try {
      fs.rmSync(tempDir, { recursive: true });
      console.log('[ffmpeg-export] cleaned up temp dir');
    } catch (e) {
      console.warn('[ffmpeg-export] cleanup failed:', e.message);
    }
    tempDir = null;
  }
}

module.exports = { writeFrame, encodeVideo };
