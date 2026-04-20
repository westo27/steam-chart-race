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
  const { fps = 30, audioPath = null, totalDuration = null } = opts;
  const inputPattern = path.join(tempDir, 'frame_%04d.png');

  console.log('[ffmpeg-export] encoding', outPath, audioPath ? `+ audio: ${audioPath}` : '(silent)');

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg()
      .input(inputPattern)
      .inputOptions([`-framerate ${fps}`]);

    if (audioPath) {
      // Real audio: loop it so short tracks cover long videos, then trim to video length
      cmd
        .input(audioPath)
        .inputOptions(['-stream_loop -1']);
    } else {
      // Silent fallback — required by TikTok/Instagram
      cmd
        .input('anullsrc=r=44100:cl=stereo')
        .inputOptions(['-f lavfi']);
    }

    cmd
      .outputOptions([
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-crf 18',
        '-movflags +faststart',
        '-map 0:v:0',
        '-map 1:a:0',
        ...(audioPath && totalDuration ? [`-t ${totalDuration}`] : ['-shortest']),
      ])
      .output(outPath)
      .on('start', c => console.log('[ffmpeg-export] command:', c))
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
