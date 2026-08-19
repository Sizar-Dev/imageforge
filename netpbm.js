/**
 * Netpbm Format Parser (PBM/PGM/PPM)
 * Supports: P1 (ASCII PBM), P2 (ASCII PGM), P3 (ASCII PPM),
 *           P4 (Binary PBM), P5 (Binary PGM), P6 (Binary PPM)
 * Zero dependencies. ~80 lines.
 */
'use strict';

function parse(buffer) {
  const str = buffer.toString('ascii');
  const tokens = str.split(/[\s]+/);
  let idx = 0;

  function next() { return tokens[idx++]; }

  // Magic number
  const magic = next();
  if (!magic || !magic.startsWith('P')) {
    throw new Error('Invalid Netpbm file: missing magic number');
  }

  const type = magic;
  let width, height, maxVal;

  // Skip comments
  function nextValue() {
    let val = next();
    while (val && val.startsWith('#')) {
      val = next();
    }
    return val;
  }

  width = parseInt(nextValue(), 10);
  height = parseInt(nextValue(), 10);

  const isPbm = (type === 'P1' || type === 'P4');
  if (!isPbm) {
    maxVal = parseInt(nextValue(), 10);
  } else {
    maxVal = 1;
  }

  // Find where pixel data starts (skip header text for binary formats)
  let dataStart;
  if (type === 'P4' || type === 'P5' || type === 'P6') {
    // Binary: find the byte after the last header byte
    const headerStr = buffer.toString('ascii');
    const headerEnd = headerStr.indexOf('\n', headerStr.indexOf(magic));
    // For P4/P5/P6, the data starts right after the newline following maxVal
    // Search for the position after the last numeric header line
    let pos = 0;
    let linesFound = 0;
    const targetLines = isPbm ? 2 : 3; // P1/P4: magic + dimensions = 2, P2/P5/P6: magic + dims + max = 3
    // Actually just find the byte position after the last header token
    // Re-parse: find the position right after maxVal (or height for PBM)
    const searchStr = buffer.toString('binary');
    // Match: P[1-6]\s+#comment\s*width\s+height[\s+maxVal]\s
    const match = searchStr.match(/P[1-6](\s+#[^\n]*\n|\s+)*\s*\d+\s+\d+(\s+\d+\s)?/);
    if (match) {
      dataStart = match.index + match[0].length;
    } else {
      dataStart = 0;
    }
  } else {
    // ASCII: tokens after the header are the pixel data
    dataStart = null; // We'll use tokens from idx onwards
  }

  let channels, bitDepth;
  switch (type) {
    case 'P1': channels = 1; bitDepth = 1; break; // PBM ASCII
    case 'P2': channels = 1; bitDepth = maxVal <= 255 ? 8 : 16; break; // PGM ASCII
    case 'P3': channels = 3; bitDepth = maxVal <= 255 ? 8 : 16; break; // PPM ASCII
    case 'P4': channels = 1; bitDepth = 1; break; // PBM Binary
    case 'P5': channels = 1; bitDepth = maxVal <= 255 ? 8 : 16; break; // PGM Binary
    case 'P6': channels = 3; bitDepth = maxVal <= 255 ? 8 : 16; break; // PPM Binary
    default: throw new Error(`Unsupported Netpbm type: ${type}`);
  }

  const pixelCount = width * height;
  const rgba = Buffer.alloc(pixelCount * 4);

  function parseAsciiPixels() {
    for (let i = 0; i < pixelCount; i++) {
      const val = parseInt(nextValue(), 10);
      const off = i * 4;
      if (channels === 1) {
        // Grayscale: map maxVal range to 0-255
        const gray = maxVal === 1 ? (val ? 255 : 0) : Math.round(val * 255 / maxVal);
        rgba[off] = gray;
        rgba[off + 1] = gray;
        rgba[off + 2] = gray;
        rgba[off + 3] = 255;
      } else {
        // RGB
        rgba[off] = Math.round(val * 255 / maxVal);
        rgba[off + 1] = Math.round(parseInt(nextValue(), 10) * 255 / maxVal);
        rgba[off + 2] = Math.round(parseInt(nextValue(), 10) * 255 / maxVal);
        rgba[off + 3] = 255;
      }
    }
  }

  function parseBinaryPixels() {
    const data = buffer.slice(dataStart);
    let pos = 0;

    if (type === 'P4') {
      // PBM binary: 1 bit per pixel, row-padded to byte boundary
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const byteIdx = y * Math.ceil(width / 8) + Math.floor(x / 8);
          const bitIdx = 7 - (x % 8);
          const bit = (data[byteIdx] >> bitIdx) & 1;
          const off = (y * width + x) * 4;
          const gray = bit ? 0 : 255; // P4: 0=white, 1=black
          rgba[off] = gray;
          rgba[off + 1] = gray;
          rgba[off + 2] = gray;
          rgba[off + 3] = 255;
        }
      }
    } else if (type === 'P5') {
      // PGM binary
      for (let i = 0; i < pixelCount; i++) {
        const val = maxVal <= 255 ? data[i] : (data[i * 2] << 8 | data[i * 2 + 1]);
        const gray = maxVal === 255 ? val : Math.round(val * 255 / maxVal);
        const off = i * 4;
        rgba[off] = gray;
        rgba[off + 1] = gray;
        rgba[off + 2] = gray;
        rgba[off + 3] = 255;
      }
    } else if (type === 'P6') {
      // PPM binary: R, G, B bytes
      for (let i = 0; i < pixelCount; i++) {
        const off4 = i * 4;
        const off3 = i * 3;
        if (maxVal <= 255) {
          rgba[off4] = data[off3];
          rgba[off4 + 1] = data[off3 + 1];
          rgba[off4 + 2] = data[off3 + 2];
        } else {
          rgba[off4] = Math.round((data[off3 * 2] << 8 | data[off3 * 2 + 1]) * 255 / maxVal);
          rgba[off4 + 1] = Math.round((data[off3 * 2 + 2] << 8 | data[off3 * 2 + 3]) * 255 / maxVal);
          rgba[off4 + 2] = Math.round((data[off3 * 2 + 4] << 8 | data[off3 * 2 + 5]) * 255 / maxVal);
        }
        rgba[off4 + 3] = 255;
      }
    }
  }

  if (dataStart === null) {
    parseAsciiPixels();
  } else {
    parseBinaryPixels();
  }

  return { data: rgba, width, height, channels: 4 };
}

module.exports = { parse };
