// Frame writing + ffmpeg invocation — stub for step 1
// Real implementation in step 7

const os = require('os');
const path = require('path');
const fs = require('fs');

let tempDir = null;

function writeFrame(index, buffer) {
  if (!tempDir) {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'steamchartrace-'));
    console.log('[ffmpeg-export] temp dir:', tempDir);
  }
  const filename = path.join(tempDir, `frame_${String(index).padStart(4, '0')}.png`);
  fs.writeFileSync(filename, Buffer.from(buffer));
  console.log('[ffmpeg-export] wrote frame', index);
}

async function encodeVideo(outPath, opts) {
  console.log('[ffmpeg-export] encodeVideo stub called', outPath, opts);
  tempDir = null;
  return { success: true };
}

module.exports = { writeFrame, encodeVideo };
