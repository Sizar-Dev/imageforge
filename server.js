const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const cors = require('cors');
const compression = require('compression');

// ── Optional Dependencies ──────────────────────────────────

let heicConvert = null;
try { heicConvert = require('heic-convert'); } catch (e) { console.log('heic-convert not available'); }

let archiver = null;
try { archiver = require('archiver'); } catch (e) { console.log('archiver not available'); }

let pdfPoppler = null;
try { pdfPoppler = require('pdf-poppler'); } catch (e) { console.log('pdf-poppler not available'); }

let bmpJs = null;
try { bmpJs = require('bmp-js'); } catch (e) { console.log('bmp-js not available'); }

let tgaJs = null;
try { tgaJs = require('tga-js'); } catch (e) { console.log('tga-js not available'); }

const netpbm = require('./netpbm');

let qoijs = null;
try { qoijs = require('qoijs'); } catch (e) { console.log('qoijs not available'); }

let icoEndec = null;
try { icoEndec = require('ico-endec'); } catch (e) { console.log('ico-endec not available'); }

let hdrify = null;
try { hdrify = require('hdrify'); } catch (e) { console.log('hdrify not available'); }

let ddsParser = null;
try { ddsParser = require('dds-parser'); } catch (e) { console.log('dds-parser not available'); }

let dcrawModule = null;
try { dcrawModule = require('dcraw'); } catch (e) { console.log('dcraw not available'); }

let openjpegCodec = null;

let jxlCodec = null;
let jxlEncodeReady = false;

async function initWasmCodecs() {
  try {
    const mod = await import('@cornerstonejs/codec-openjpeg');
    const factory = mod.default || mod;
    const instance = await factory();
    openjpegCodec = { J2KDecoder: instance.J2KDecoder, J2KEncoder: instance.J2KEncoder };
    console.log('  OpenJPEG:   loaded (WASM)');
  } catch (e) { console.log('  OpenJPEG:   not available -', e.message); }
  try {
    const jxlMod = await import('@jsquash/jxl/decode.js');
    const utilsMod = await import('@jsquash/jxl/utils.js');
    const jxlDecoderMod = await import('@jsquash/jxl/codec/dec/jxl_dec.js');
    const fs2 = require('fs');
    const wasmPath = require('path').join(__dirname, 'node_modules/@jsquash/jxl/codec/dec/jxl_dec.wasm');
    const wasmBinary = new Uint8Array(fs2.readFileSync(wasmPath));
    const module = await utilsMod.initEmscriptenModule(jxlDecoderMod.default, undefined, { wasmBinary });
    jxlCodec = module;
    console.log('  JXL decode: loaded (WASM)');
  } catch (e) { console.log('  JXL decode: not available -', e.message); }
  try {
    const jxlEncodeMod = await import('@jsquash/jxl/encode.js');
    const utilsMod = await import('@jsquash/jxl/utils.js');
    const jxlEncMod = await import('@jsquash/jxl/codec/enc/jxl_enc.js');
    const wasmPath = require('path').join(__dirname, 'node_modules/@jsquash/jxl/codec/enc/jxl_enc.wasm');
    const wasmBinary = new (require('fs').readFileSync)(wasmPath);
    await utilsMod.initEmscriptenModule(jxlEncMod.default, undefined, { wasmBinary: new Uint8Array(wasmBinary) });
    await jxlEncodeMod.init({ wasmBinary: new Uint8Array(wasmBinary) });
    jxlEncodeReady = true;
    console.log('  JXL encode: loaded (WASM)');
  } catch (e) { console.log('  JXL encode: not available -', e.message); }
}

// ── Express Setup ──────────────────────────────────────────

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({ storage, limits: { fileSize: Infinity } });

// ── Format Registry ────────────────────────────────────────

const FORMATS = {
  jpg:  { name: 'JPEG',        ext: 'jpg',  mime: 'image/jpeg',       cat: 'common',  decoder: 'sharp'  },
  jpeg: { name: 'JPEG',        ext: 'jpeg', mime: 'image/jpeg',       cat: 'common',  decoder: 'sharp'  },
  png:  { name: 'PNG',         ext: 'png',  mime: 'image/png',        cat: 'common',  decoder: 'sharp'  },
  gif:  { name: 'GIF',         ext: 'gif',  mime: 'image/gif',        cat: 'common',  decoder: 'sharp'  },
  webp: { name: 'WebP',        ext: 'webp', mime: 'image/webp',       cat: 'modern',  decoder: 'sharp'  },
  avif: { name: 'AVIF',        ext: 'avif', mime: 'image/avif',       cat: 'modern',  decoder: 'sharp'  },
  tiff: { name: 'TIFF',        ext: 'tiff', mime: 'image/tiff',       cat: 'pro',     decoder: 'sharp'  },
  tif:  { name: 'TIFF',        ext: 'tif',  mime: 'image/tiff',       cat: 'pro',     decoder: 'sharp'  },
  bmp:  { name: 'BMP',         ext: 'bmp',  mime: 'image/bmp',        cat: 'common',  decoder: 'bmp-js' },
  ico:  { name: 'ICO',         ext: 'ico',  mime: 'image/x-icon',     cat: 'common',  decoder: 'ico-endec' },
  heic: { name: 'HEIC',        ext: 'heic', mime: 'image/heic',       cat: 'apple',   decoder: 'heic'   },
  heif: { name: 'HEIF',        ext: 'heif', mime: 'image/heif',       cat: 'apple',   decoder: 'heic'   },
  svg:  { name: 'SVG',         ext: 'svg',  mime: 'image/svg+xml',    cat: 'vector',  decoder: 'sharp'  },
  svgz: { name: 'SVGZ',        ext: 'svgz', mime: 'image/svg+xml',    cat: 'vector',  decoder: 'sharp'  },
  raw:  { name: 'RAW',         ext: 'raw',  mime: 'image/raw',        cat: 'raw',     decoder: 'dcraw'  },
  cr2:  { name: 'Canon CR2',   ext: 'cr2',  mime: 'image/x-canon-cr2',cat: 'raw',     decoder: 'dcraw'  },
  nef:  { name: 'Nikon NEF',   ext: 'nef',  mime: 'image/x-nikon-nef',cat: 'raw',     decoder: 'dcraw'  },
  arw:  { name: 'Sony ARW',    ext: 'arw',  mime: 'image/x-sony-arw', cat: 'raw',     decoder: 'dcraw'  },
  dng:  { name: 'Adobe DNG',   ext: 'dng',  mime: 'image/x-adobe-dng',cat: 'raw',     decoder: 'dcraw'  },
  orf:  { name: 'Olympus ORF', ext: 'orf',  mime: 'image/x-olympus-orf',cat: 'raw',   decoder: 'dcraw'  },
  raf:  { name: 'Fuji RAF',    ext: 'raf',  mime: 'image/x-fuji-raf', cat: 'raw',     decoder: 'dcraw'  },
  rw2:  { name: 'Panasonic RW2',ext: 'rw2', mime: 'image/x-panasonic-rw2',cat: 'raw', decoder: 'dcraw'  },
  pef:  { name: 'Pentax PEF',  ext: 'pef',  mime: 'image/x-pentax-pef',cat: 'raw',    decoder: 'dcraw'  },
  jp2:  { name: 'JPEG 2000',   ext: 'jp2',  mime: 'image/jp2',        cat: 'legacy',  decoder: 'openjpeg' },
  j2k:  { name: 'JPEG 2000',   ext: 'j2k',  mime: 'image/jp2',        cat: 'legacy',  decoder: 'openjpeg' },
  tga:  { name: 'Targa',       ext: 'tga',  mime: 'image/x-targa',    cat: 'legacy',  decoder: 'tga-js'  },
  dds:  { name: 'DDS',         ext: 'dds',  mime: 'image/vnd.ms-dds', cat: 'legacy',  decoder: 'dds-parser' },
  exr:  { name: 'OpenEXR',     ext: 'exr',  mime: 'image/exr',        cat: 'pro',     decoder: 'hdrify'  },
  hdr:  { name: 'Radiance HDR',ext: 'hdr',  mime: 'image/vnd.radiance',cat: 'pro',    decoder: 'hdrify'  },
  pbm:  { name: 'PBM',         ext: 'pbm',  mime: 'image/x-portable-bitmap',cat: 'legacy',decoder:'netpbm' },
  pgm:  { name: 'PGM',         ext: 'pgm',  mime: 'image/x-portable-graymap',cat:'legacy',decoder:'netpbm' },
  ppm:  { name: 'PPM',         ext: 'ppm',  mime: 'image/x-portable-pixmap', cat:'legacy',decoder:'netpbm' },
  qoi:  { name: 'QOI',         ext: 'qoi',  mime: 'image/qoi',        cat: 'modern',  decoder: 'qoijs'  },
  jxl:  { name: 'JPEG XL',     ext: 'jxl',  mime: 'image/jxl',        cat: 'modern',  decoder: 'jxl'    },
  pdf:  { name: 'PDF',         ext: 'pdf',  mime: 'application/pdf',  cat: 'document', decoder: 'pdf'    },
};

const OUTPUT_FORMATS = ['jpg','png','gif','webp','avif','tiff','heic','bmp','ico','ppm','pgm','pbm','qoi','hdr','exr','jxl','jp2'];

const CONCURRENT_LIMIT = 3;
const CLEANUP_MS = 10 * 60 * 1000;

const jobs = new Map();
const queue = [];
let activeCount = 0;

// ── Helpers ────────────────────────────────────────────────

function getFormat(filename) {
  const ext = path.extname(filename).slice(1).toLowerCase();
  return FORMATS[ext] ? ext : null;
}

function isDecoderAvailable(decoder) {
  switch (decoder) {
    case 'sharp': return true;
    case 'heic': return !!heicConvert;
    case 'pdf': return !!pdfPoppler;
    case 'bmp-js': return !!bmpJs;
    case 'tga-js': return !!tgaJs;
    case 'netpbm': return true;
    case 'qoijs': return !!qoijs;
    case 'ico-endec': return !!icoEndec;
    case 'hdrify': return !!hdrify;
    case 'dds-parser': return !!ddsParser;
    case 'dcraw': return !!dcrawModule;
    case 'openjpeg': return !!openjpegCodec;
    case 'jxl': return !!jxlCodec;
    default: return false;
  }
}

function isConvertable(inputFmt, outputFmt) {
  if (!OUTPUT_FORMATS.includes(outputFmt)) return false;
  const input = FORMATS[inputFmt];
  if (!input) return false;
  if (inputFmt === outputFmt) return true;
  return isDecoderAvailable(input.decoder);
}

// ── Decoder Functions ──────────────────────────────────────

function decodeBmpToSharp(inputPath) {
  const buf = fs.readFileSync(inputPath);
  const decoded = bmpJs.decode(buf);
  return sharp(decoded.data, { raw: { width: decoded.width, height: decoded.height, channels: 4 } });
}

function decodeTgaToSharp(inputPath) {
  const buf = fs.readFileSync(inputPath);
  const loader = new tgaJs();
  loader.load(new Uint8Array(buf));
  const out = { width: loader.header.width, height: loader.header.height, data: new Uint8ClampedArray(loader.header.width * loader.header.height * 4) };
  const imageData = loader.getImageData(out);
  return sharp(Buffer.from(imageData.data), { raw: { width: imageData.width, height: imageData.height, channels: 4 } });
}

function decodeNetpbmToSharp(inputPath) {
  const buf = fs.readFileSync(inputPath);
  const result = netpbm.parse(buf);
  return sharp(result.data, { raw: { width: result.width, height: result.height, channels: 4 } });
}

function decodeQoiToSharp(inputPath) {
  const buf = fs.readFileSync(inputPath);
  const decoded = qoijs.decode(new Uint8Array(buf));
  const channels = decoded.channels || 4;
  return sharp(Buffer.from(decoded.data), { raw: { width: decoded.width, height: decoded.height, channels } });
}

function decodeHdrToSharp(inputPath) {
  const buf = fs.readFileSync(inputPath);
  const image = hdrify.readHdr(new Uint8Array(buf));
  const pxCount = image.width * image.height;
  const ch = image.data.length === pxCount * 4 ? 4 : 3;
  const uint8 = Buffer.alloc(pxCount * 4);
  for (let i = 0; i < pxCount; i++) {
    uint8[i * 4]     = Math.min(255, Math.round(image.data[i * ch] * 255));
    uint8[i * 4 + 1] = Math.min(255, Math.round(image.data[i * ch + 1] * 255));
    uint8[i * 4 + 2] = Math.min(255, Math.round(image.data[i * ch + 2] * 255));
    uint8[i * 4 + 3] = 255;
  }
  return sharp(uint8, { raw: { width: image.width, height: image.height, channels: 4 } });
}

function decodeDdsToSharp(inputPath) {
  const buf = fs.readFileSync(inputPath);
  const u8 = new Uint8Array(buf);
  const info = ddsParser.parseHeaders(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
  const image = info.images[0];
  const rgba = ddsParser.decodeDds(
    buf.slice(image.offset, image.offset + image.length),
    info.format, image.shape.width, image.shape.height
  );
  return sharp(Buffer.from(rgba), { raw: { width: image.shape.width, height: image.shape.height, channels: 4 } });
}

function decodeRawToSharp(inputPath) {
  const buf = fs.readFileSync(inputPath);
  const tiffBuffer = dcrawModule(buf, { exportAsTiff: true });
  return sharp(tiffBuffer);
}

async function decodeJp2ToSharp(inputPath) {
  const buf = fs.readFileSync(inputPath);
  const decoder = new openjpegCodec.J2KDecoder();
  const encodedBuf = decoder.getEncodedBuffer(buf.length);
  encodedBuf.set(new Uint8Array(buf));
  decoder.decode();
  const frameInfo = decoder.getFrameInfo();
  const decodedBuffer = decoder.getDecodedBuffer();
  const channels = frameInfo ? (frameInfo.numComponents || 3) : 3;
  return sharp(Buffer.from(decodedBuffer), { raw: { width: frameInfo.width, height: frameInfo.height, channels } });
}

async function decodeJxlToSharp(inputPath) {
  const buf = fs.readFileSync(inputPath);
  const result = jxlCodec.decode(new Uint8Array(buf));
  return sharp(Buffer.from(result.data), { raw: { width: result.width, height: result.height, channels: 4 } });
}

function decodeIcoToSharp(inputPath) {
  const buf = fs.readFileSync(inputPath);
  const images = icoEndec.decode(buf);
  if (!images || images.length === 0) throw new Error('No images found in ICO file');
  const largest = images.reduce((best, img) => (img.width > best.width ? img : best), images[0]);
  return sharp(largest.imageData);
}

// ── Output Encoder: BMP ────────────────────────────────────

function sharpToBmp(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    sharp(inputPath)
      .raw({ depth: 'uchar' })
      .toBuffer({ resolveWithObject: true })
      .then(({ data, info }) => {
        const encoded = bmpJs.encode({
          data: data,
          width: info.width,
          height: info.height
        });
        fs.writeFileSync(outputPath, encoded.data);
        resolve();
      })
      .catch(reject);
  });
}

// ── Output Encoder: ICO ────────────────────────────────────

function sharpToIco(inputPath, outputPath) {
  const sizes = [16, 32, 48, 64, 128, 256];
  return Promise.all(
    sizes.map(size => sharp(inputPath).resize(size, size, { fit: 'inside' }).png().toBuffer())
  ).then(pngBuffers => {
    const icoBuffer = icoEndec.encode(pngBuffers);
    fs.writeFileSync(outputPath, icoBuffer);
  });
}

// ── Output Encoder: PPM/PGM/PBM ────────────────────────────

function sharpToNetpbm(inputPath, outputPath, format) {
  return sharp(inputPath)
    .keepMetadata()
    .raw({ depth: 'uchar' })
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => {
      const { width, height, channels } = info;
      let out;
      if (format === 'ppm') {
        const header = Buffer.from(`P6\n${width} ${height}\n255\n`);
        const pixels = channels === 1
          ? Buffer.from(Uint8Array.from({ length: width * height * 3 }, (_, i) => data[Math.floor(i / 3)]))
          : channels === 4
          ? (() => { const rgb = Buffer.alloc(width * height * 3); for (let i = 0; i < width * height; i++) { rgb[i * 3] = data[i * 4]; rgb[i * 3 + 1] = data[i * 4 + 1]; rgb[i * 3 + 2] = data[i * 4 + 2]; } return rgb; })()
          : data;
        out = Buffer.concat([header, pixels.slice(0, width * height * 3)]);
      } else if (format === 'pgm') {
        const header = Buffer.from(`P5\n${width} ${height}\n255\n`);
        let grey;
        if (channels === 1) {
          grey = data;
        } else {
          grey = Buffer.alloc(width * height);
          for (let i = 0; i < width * height; i++) {
            grey[i] = Math.round(0.299 * data[i * channels] + 0.587 * data[i * channels + 1] + 0.114 * data[i * channels + 2]);
          }
        }
        out = Buffer.concat([header, grey]);
      } else if (format === 'pbm') {
        const rowBytes = Math.ceil(width / 8);
        const header = Buffer.from(`P4\n${width} ${height}\n`);
        let grey;
        if (channels === 1) {
          grey = data;
        } else {
          grey = Buffer.alloc(width * height);
          for (let i = 0; i < width * height; i++) {
            grey[i] = Math.round(0.299 * data[i * channels] + 0.587 * data[i * channels + 1] + 0.114 * data[i * channels + 2]);
          }
        }
        const bits = Buffer.alloc(rowBytes * height);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (grey[y * width + x] > 127) {
              bits[y * rowBytes + Math.floor(x / 8)] |= (1 << (7 - (x % 8)));
            }
          }
        }
        out = Buffer.concat([header, bits]);
      }
      fs.writeFileSync(outputPath, out);
    });
}

// ── Output Encoder: QOI ─────────────────────────────────────

function sharpToQoi(inputPath, outputPath) {
  return sharp(inputPath)
    .keepMetadata()
    .raw({ depth: 'uchar' })
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => {
      const channels = info.channels > 4 ? 3 : info.channels;
      const raw = channels === 4 ? data : Buffer.from(data.buffer, data.byteOffset, info.width * info.height * channels);
      const encoded = qoijs.encode(new Uint8Array(raw), { width: info.width, height: info.height, channels, colorspace: 0 });
      fs.writeFileSync(outputPath, Buffer.from(encoded));
    });
}

// ── Output Encoder: HDR ─────────────────────────────────────

function sharpToHdr(inputPath, outputPath) {
  return sharp(inputPath)
    .keepMetadata()
    .raw({ depth: 'float' })
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => {
      const { width, height, channels } = info;
      const floatData = new Float32Array(width * height * 3);
      for (let i = 0; i < width * height; i++) {
        if (channels >= 3) {
          floatData[i * 3] = data[i * channels] / 255;
          floatData[i * 3 + 1] = data[i * channels + 1] / 255;
          floatData[i * 3 + 2] = data[i * channels + 2] / 255;
        } else {
          const v = data[i] / 255;
          floatData[i * 3] = v;
          floatData[i * 3 + 1] = v;
          floatData[i * 3 + 2] = v;
        }
      }
      const out = hdrify.writeHdr({ width, height, data: floatData });
      fs.writeFileSync(outputPath, out);
    });
}

// ── Output Encoder: EXR ─────────────────────────────────────

function sharpToExr(inputPath, outputPath) {
  return sharp(inputPath)
    .keepMetadata()
    .raw({ depth: 'float' })
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => {
      const { width, height, channels } = info;
      const floatData = new Float32Array(width * height * 3);
      for (let i = 0; i < width * height; i++) {
        if (channels >= 3) {
          floatData[i * 3] = data[i * channels] / 255;
          floatData[i * 3 + 1] = data[i * channels + 1] / 255;
          floatData[i * 3 + 2] = data[i * channels + 2] / 255;
        } else {
          const v = data[i] / 255;
          floatData[i * 3] = v;
          floatData[i * 3 + 1] = v;
          floatData[i * 3 + 2] = v;
        }
      }
      const out = hdrify.writeExr({ width, height, data: floatData });
      fs.writeFileSync(outputPath, out);
    });
}

// ── Output Encoder: JXL ─────────────────────────────────────

async function sharpToJxl(inputPath, outputPath) {
  const jxlEncodeMod = await import('@jsquash/jxl/encode.js');
  if (!jxlEncodeReady) throw new Error('JXL encoder not available');
  const { data, info } = await sharp(inputPath)
    .keepMetadata()
    .ensureAlpha()
    .raw({ depth: 'uchar' })
    .toBuffer({ resolveWithObject: true });
  const result = await jxlEncodeMod.default({ data: new Uint8Array(data), width: info.width, height: info.height, channels: 4 });
  fs.writeFileSync(outputPath, Buffer.from(result));
}

// ── Output Encoder: JP2 ─────────────────────────────────────

async function sharpToJp2(inputPath, outputPath) {
  const { data, info } = await sharp(inputPath)
    .keepMetadata()
    .removeAlpha()
    .raw({ depth: 'uchar' })
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const encoder = new openjpegCodec.J2KEncoder();
  const maxDecomp = Math.max(1, Math.floor(Math.log2(Math.min(width, height))));
  encoder.setCompressionRatio(1);
  encoder.setDecompositions(maxDecomp);
  const decBuf = encoder.getDecodedBuffer({ width, height, componentCount: channels, bitsPerSample: 8, isSigned: false });
  decBuf.set(new Uint8Array(data.buffer, data.byteOffset, Math.min(data.length, decBuf.length)));
  encoder.encode();
  const encodedBuf = encoder.getEncodedBuffer();
  fs.writeFileSync(outputPath, encodedBuf);
}

// ── Sharp Output Pipeline ──────────────────────────────────

function sharpOutputSwitch(pipeline, outputFmt) {
  switch (outputFmt) {
    case 'jpg': case 'jpeg':
      return pipeline.jpeg({ quality: 100, chromaSubsampling: '4:4:4' });
    case 'png':
      return pipeline.png({ compressionLevel: 6, adaptiveFiltering: true });
    case 'gif':
      return pipeline.gif();
    case 'webp':
      return pipeline.webp({ lossless: true });
    case 'avif':
      return pipeline.avif({ lossless: true });
    case 'tiff': case 'tif':
      return pipeline.tiff({ compression: 'lzw' });
    case 'heic':
      return pipeline.heif({ compression: 'av1', lossless: true });
    default:
      return pipeline.toFormat(outputFmt);
  }
}

// ── Conversion Pipeline ────────────────────────────────────

function processQueue() {
  while (activeCount < CONCURRENT_LIMIT && queue.length > 0) {
    const job = queue.shift();
    activeCount++;
    convertFile(job).finally(() => {
      activeCount--;
      processQueue();
    });
  }
}

async function convertFile(job) {
  const inputPath = job.inputPath;
  const inputFmt = job.inputFormat;
  const outputFmt = job.outputFormat;
  const outputInfo = FORMATS[outputFmt];
  const inputInfo = FORMATS[inputFmt];

  job.status = 'converting';
  job.progress = 20;

  try {
    const outputPath = path.join(uploadsDir, `${job.id}.${outputInfo.ext}`);
    job.outputPath = outputPath;
    job.progress = 30;

    // ── Same-format copy (fast path) ──
    if (inputFmt === outputFmt || (inputFmt === 'jpg' && outputFmt === 'jpeg') || (inputFmt === 'jpeg' && outputFmt === 'jpg') || (inputFmt === 'tiff' && outputFmt === 'tif') || (inputFmt === 'tif' && outputFmt === 'tiff')) {
      job.progress = 60;
      fs.copyFileSync(inputPath, outputPath);
      job.progress = 100;
      job.status = 'done';
      job.outputSize = fs.statSync(outputPath).size;
      return;
    }

    // ── SVG/SVGZ → other ──
    if ((inputFmt === 'svg' || inputFmt === 'svgz')) {
      job.progress = 50;
      let svgInput = inputPath;
      if (inputFmt === 'svgz') {
        const compressed = fs.readFileSync(inputPath);
        svgInput = zlib.gunzipSync(compressed);
      }
      let pipeline = sharp(svgInput, { density: 300 }).keepMetadata();
      const CUSTOM_OUTPUTS = ['ppm', 'pgm', 'pbm', 'qoi', 'hdr', 'exr', 'jxl', 'jp2'];
      if (CUSTOM_OUTPUTS.includes(outputFmt)) {
        const tempPng = path.join(uploadsDir, `_temp_${job.id}.png`);
        await pipeline.png().toFile(tempPng);
        job.progress = 60;
        try {
          if (outputFmt === 'ppm' || outputFmt === 'pgm' || outputFmt === 'pbm') {
            await sharpToNetpbm(tempPng, outputPath, outputFmt);
          } else if (outputFmt === 'qoi') {
            await sharpToQoi(tempPng, outputPath);
          } else if (outputFmt === 'hdr') {
            await sharpToHdr(tempPng, outputPath);
          } else if (outputFmt === 'exr') {
            await sharpToExr(tempPng, outputPath);
          } else if (outputFmt === 'jxl') {
            await sharpToJxl(tempPng, outputPath);
          } else if (outputFmt === 'jp2') {
            await sharpToJp2(tempPng, outputPath);
          }
        } finally {
          try { fs.unlinkSync(tempPng); } catch (e) {}
        }
      } else {
        pipeline = sharpOutputSwitch(pipeline, outputFmt);
        await pipeline.toFile(outputPath);
      }

    // ── PDF → other ──
    } else if (inputFmt === 'pdf') {
      if (!pdfPoppler) throw new Error('PDF support not available. Install pdf-poppler: npm install pdf-poppler');
      job.progress = 40;
      const pdfDir = path.join(uploadsDir, `pdf_${job.id}`);
      if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
      job.progress = 50;
      await pdfPoppler.convert(inputPath, { format: 'png', out_dir: pdfDir, out_prefix: 'page', page: 1, scale: 1200 });
      job.progress = 70;
      const pdfFiles = fs.readdirSync(pdfDir).filter(f => f.endsWith('.png')).sort();
      if (pdfFiles.length === 0) throw new Error('PDF conversion produced no output');
      const pdfPngPath = path.join(pdfDir, pdfFiles[0]);
      let pipeline = sharp(pdfPngPath).keepMetadata();
      const CUSTOM_OUTPUTS = ['ppm', 'pgm', 'pbm', 'qoi', 'hdr', 'exr', 'jxl', 'jp2'];
      if (CUSTOM_OUTPUTS.includes(outputFmt)) {
        const tempPng = path.join(uploadsDir, `_temp_${job.id}.png`);
        await pipeline.png().toFile(tempPng);
        job.progress = 80;
        try {
          if (outputFmt === 'ppm' || outputFmt === 'pgm' || outputFmt === 'pbm') {
            await sharpToNetpbm(tempPng, outputPath, outputFmt);
          } else if (outputFmt === 'qoi') {
            await sharpToQoi(tempPng, outputPath);
          } else if (outputFmt === 'hdr') {
            await sharpToHdr(tempPng, outputPath);
          } else if (outputFmt === 'exr') {
            await sharpToExr(tempPng, outputPath);
          } else if (outputFmt === 'jxl') {
            await sharpToJxl(tempPng, outputPath);
          } else if (outputFmt === 'jp2') {
            await sharpToJp2(tempPng, outputPath);
          }
        } finally {
          try { fs.unlinkSync(tempPng); } catch (e) {}
        }
      } else {
        pipeline = sharpOutputSwitch(pipeline, outputFmt);
        await pipeline.toFile(outputPath);
      }
      fs.rmSync(pdfDir, { recursive: true, force: true });

    // ── HEIC/HEIF → other ──
    } else if (inputFmt === 'heic' || inputFmt === 'heif') {
      if (!heicConvert) throw new Error('HEIC/HEIF support not available. Install heic-convert: npm install heic-convert');
      job.progress = 40;
      const inputBuffer = fs.readFileSync(inputPath);
      job.progress = 50;
      const CUSTOM_OUTPUTS = ['ppm', 'pgm', 'pbm', 'qoi', 'hdr', 'exr', 'jxl', 'jp2'];
      if (CUSTOM_OUTPUTS.includes(outputFmt)) {
        const pngBuffer = await heicConvert({ buffer: inputBuffer, format: 'PNG' });
        job.progress = 60;
        const tempPng = path.join(uploadsDir, `_temp_${job.id}.png`);
        fs.writeFileSync(tempPng, pngBuffer);
        try {
          if (outputFmt === 'ppm' || outputFmt === 'pgm' || outputFmt === 'pbm') {
            await sharpToNetpbm(tempPng, outputPath, outputFmt);
          } else if (outputFmt === 'qoi') {
            await sharpToQoi(tempPng, outputPath);
          } else if (outputFmt === 'hdr') {
            await sharpToHdr(tempPng, outputPath);
          } else if (outputFmt === 'exr') {
            await sharpToExr(tempPng, outputPath);
          } else if (outputFmt === 'jxl') {
            await sharpToJxl(tempPng, outputPath);
          } else if (outputFmt === 'jp2') {
            await sharpToJp2(tempPng, outputPath);
          }
        } finally {
          try { fs.unlinkSync(tempPng); } catch (e) {}
        }
      } else if (outputFmt === 'jpg' || outputFmt === 'jpeg') {
        const outputBuffer = await heicConvert({ buffer: inputBuffer, format: 'JPEG', quality: 1.0 });
        job.progress = 80;
        fs.writeFileSync(outputPath, outputBuffer);
      } else if (outputFmt === 'png') {
        const outputBuffer = await heicConvert({ buffer: inputBuffer, format: 'PNG' });
        job.progress = 80;
        fs.writeFileSync(outputPath, outputBuffer);
      } else {
        const pngBuffer = await heicConvert({ buffer: inputBuffer, format: 'PNG' });
        job.progress = 60;
        let pipeline = sharp(pngBuffer).keepMetadata();
        pipeline = sharpOutputSwitch(pipeline, outputFmt);
        job.progress = 80;
        await pipeline.toFile(outputPath);
      }

    // ── ICO output (special: multi-size container) ──
    } else if (outputFmt === 'ico') {
      job.progress = 50;
      await sharpToIco(inputPath, outputPath);

    // ── BMP output ──
    } else if (outputFmt === 'bmp') {
      job.progress = 50;
      await sharpToBmp(inputPath, outputPath);

    // ── All other formats via decoder → Sharp pipeline ──
    } else {
      job.progress = 40;
      let pipeline;

      switch (inputInfo.decoder) {
        case 'sharp':
          pipeline = sharp(inputPath).keepMetadata();
          break;

        case 'bmp-js':
          pipeline = decodeBmpToSharp(inputPath);
          break;

        case 'tga-js':
          pipeline = decodeTgaToSharp(inputPath);
          break;

        case 'netpbm':
          pipeline = decodeNetpbmToSharp(inputPath);
          break;

        case 'qoijs':
          pipeline = decodeQoiToSharp(inputPath);
          break;

        case 'hdrify':
          if (inputFmt === 'exr') {
            const buf = fs.readFileSync(inputPath);
            const exrImage = hdrify.readExr(new Uint8Array(buf));
            const pxCount = exrImage.width * exrImage.height;
            const ch = exrImage.data.length === pxCount * 4 ? 4 : 3;
            const uint8 = Buffer.alloc(pxCount * 4);
            for (let i = 0; i < pxCount; i++) {
              uint8[i * 4]     = Math.min(255, Math.round(exrImage.data[i * ch] * 255));
              uint8[i * 4 + 1] = Math.min(255, Math.round(exrImage.data[i * ch + 1] * 255));
              uint8[i * 4 + 2] = Math.min(255, Math.round(exrImage.data[i * ch + 2] * 255));
              uint8[i * 4 + 3] = 255;
            }
            pipeline = sharp(uint8, { raw: { width: exrImage.width, height: exrImage.height, channels: 4 } });
          } else {
            pipeline = decodeHdrToSharp(inputPath);
          }
          break;

        case 'dds-parser':
          pipeline = decodeDdsToSharp(inputPath);
          break;

        case 'dcraw':
          pipeline = decodeRawToSharp(inputPath);
          break;

        case 'openjpeg':
          pipeline = await decodeJp2ToSharp(inputPath);
          break;

        case 'jxl':
          pipeline = await decodeJxlToSharp(inputPath);
          break;

        case 'ico-endec':
          pipeline = decodeIcoToSharp(inputPath);
          break;

        default:
          throw new Error(`No decoder available for format: ${inputFmt}`);
      }

      job.progress = 50;
      pipeline = pipeline.keepMetadata();

      const CUSTOM_OUTPUTS = ['ppm', 'pgm', 'pbm', 'qoi', 'hdr', 'exr', 'jxl', 'jp2'];
      if (CUSTOM_OUTPUTS.includes(outputFmt)) {
        const tempPng = path.join(uploadsDir, `_temp_${job.id}.png`);
        await pipeline.png().toFile(tempPng);
        job.progress = 60;
        try {
          if (outputFmt === 'ppm' || outputFmt === 'pgm' || outputFmt === 'pbm') {
            await sharpToNetpbm(tempPng, outputPath, outputFmt);
          } else if (outputFmt === 'qoi') {
            await sharpToQoi(tempPng, outputPath);
          } else if (outputFmt === 'hdr') {
            await sharpToHdr(tempPng, outputPath);
          } else if (outputFmt === 'exr') {
            await sharpToExr(tempPng, outputPath);
          } else if (outputFmt === 'jxl') {
            await sharpToJxl(tempPng, outputPath);
          } else if (outputFmt === 'jp2') {
            await sharpToJp2(tempPng, outputPath);
          }
        } finally {
          try { fs.unlinkSync(tempPng); } catch (e) {}
        }
      } else {
        pipeline = sharpOutputSwitch(pipeline, outputFmt);
        job.progress = 70;
        await pipeline.toFile(outputPath);
      }
    }

    job.progress = 100;
    job.status = 'done';
    job.outputSize = fs.statSync(outputPath).size;
  } catch (err) {
    console.error(`Conversion failed for job ${job.id}:`, err.message);
    job.status = 'error';
    job.error = err.message;
    if (job.outputPath && fs.existsSync(job.outputPath)) {
      try { fs.unlinkSync(job.outputPath); } catch (e) {}
    }
  } finally {
    if (inputPath && fs.existsSync(inputPath)) {
      try { fs.unlinkSync(inputPath); } catch (e) {}
    }
  }
}

// ── Cleanup ────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if ((job.status === 'done' || job.status === 'error') && now - job.createdAt > CLEANUP_MS) {
      if (job.outputPath && fs.existsSync(job.outputPath)) {
        try { fs.unlinkSync(job.outputPath); } catch (e) {}
      }
      jobs.delete(id);
    }
  }
}, 60000);

// ── API Routes ─────────────────────────────────────────────

app.get('/api/formats', (req, res) => {
  const inputFormats = {};
  for (const [key, fmt] of Object.entries(FORMATS)) {
    if (!inputFormats[key]) {
      inputFormats[key] = {
        name: fmt.name,
        ext: fmt.ext,
        mime: fmt.mime,
        category: fmt.cat,
        supported: isDecoderAvailable(fmt.decoder)
      };
    }
  }
  res.json({ input: inputFormats, output: OUTPUT_FORMATS });
});

app.post('/api/convert', upload.array('files', 100), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const outputFormat = req.body.format;
    if (!outputFormat || !OUTPUT_FORMATS.includes(outputFormat)) {
      return res.status(400).json({ error: 'Invalid or unsupported output format' });
    }

    const jobIds = [];
    for (const file of req.files) {
      const inputFormat = getFormat(file.originalname);
      if (!inputFormat) {
        try { fs.unlinkSync(file.path); } catch (e) {}
        continue;
      }

      if (!isConvertable(inputFormat, outputFormat)) {
        try { fs.unlinkSync(file.path); } catch (e) {}
        continue;
      }

      const jobId = uuidv4();
      const job = {
        id: jobId,
        status: 'queued',
        progress: 0,
        inputFormat,
        outputFormat,
        inputPath: file.path,
        outputPath: null,
        originalName: file.originalname,
        inputSize: file.size,
        outputSize: null,
        error: null,
        createdAt: Date.now()
      };

      jobs.set(jobId, job);
      queue.push(job);
      jobIds.push(jobId);
    }

    processQueue();
    res.json({ jobIds });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Server error during upload' });
  }
});

app.get('/api/status', (req, res) => {
  const ids = (req.query.ids || '').split(',').filter(Boolean);
  if (ids.length === 0) return res.json([]);

  const results = ids.map(id => {
    const job = jobs.get(id);
    if (!job) return null;
    return {
      id: job.id,
      status: job.status,
      progress: job.progress,
      inputFormat: job.inputFormat,
      outputFormat: job.outputFormat,
      originalName: job.originalName,
      inputSize: job.inputSize,
      outputSize: job.outputSize,
      error: job.error
    };
  }).filter(Boolean);

  res.json(results);
});

app.get('/api/download/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== 'done' || !job.outputPath) {
    return res.status(404).json({ error: 'File not found or not ready' });
  }

  if (!fs.existsSync(job.outputPath)) {
    return res.status(404).json({ error: 'File no longer available' });
  }

  const baseName = path.basename(job.originalName, path.extname(job.originalName));
  const outputExt = FORMATS[job.outputFormat]?.ext || job.outputFormat;
  const downloadName = `${baseName}.${outputExt}`;

  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  res.setHeader('Content-Type', FORMATS[job.outputFormat]?.mime || 'application/octet-stream');

  const stream = fs.createReadStream(job.outputPath);
  stream.pipe(res);
});

app.get('/api/download-all', async (req, res) => {
  const ids = (req.query.ids || '').split(',').filter(Boolean);
  if (ids.length === 0) return res.status(400).json({ error: 'No job IDs provided' });

  if (ids.length === 1) {
    const job = jobs.get(ids[0]);
    if (job && job.status === 'done' && job.outputPath && fs.existsSync(job.outputPath)) {
      const baseName = path.basename(job.originalName, path.extname(job.originalName));
      const outputExt = FORMATS[job.outputFormat]?.ext || job.outputFormat;
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.${outputExt}"`);
      res.setHeader('Content-Type', FORMATS[job.outputFormat]?.mime || 'application/octet-stream');
      return fs.createReadStream(job.outputPath).pipe(res);
    }
    return res.status(404).json({ error: 'File not found' });
  }

  if (!archiver) {
    return res.status(500).json({ error: 'Bulk download not available. Download files individually.' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="imageforge-converted.zip"');

  const archive = archiver('zip', { zlib: { level: 1 } });
  archive.pipe(res);

  let added = 0;
  for (const id of ids) {
    const job = jobs.get(id);
    if (job && job.status === 'done' && job.outputPath && fs.existsSync(job.outputPath)) {
      const baseName = path.basename(job.originalName, path.extname(job.originalName));
      const outputExt = FORMATS[job.outputFormat]?.ext || job.outputFormat;
      archive.file(job.outputPath, { name: `${baseName}.${outputExt}` });
      added++;
    }
  }

  if (added === 0) {
    archive.destroy();
    return res.status(404).json({ error: 'No completed files found' });
  }

  await archive.finalize();
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    sharp: true,
    heic: !!heicConvert,
    archiver: !!archiver,
    pdf: !!pdfPoppler,
    bmp: !!bmpJs,
    tga: !!tgaJs,
    netpbm: true,
    qoi: !!qoijs,
    ico: !!icoEndec,
    hdr: !!hdrify,
    dds: !!ddsParser,
    dcraw: !!dcrawModule,
    openjpeg: !!openjpegCodec,
    jxl: !!jxlCodec
  });
});

// ── Start ──────────────────────────────────────────────────

(async () => {
  await initWasmCodecs();

  app.listen(PORT, () => {
    console.log(`\n  ImageForge running at http://localhost:${PORT}\n`);
    console.log(`  Sharp:       available`);
    console.log(`  HEIC:        ${heicConvert ? 'available' : 'not available'}`);
    console.log(`  Archiver:    ${archiver ? 'available' : 'not available'}`);
    console.log(`  PDF:         ${pdfPoppler ? 'available' : 'not available'}`);
    console.log(`  BMP:         ${bmpJs ? 'available' : 'not available'}`);
    console.log(`  TGA:         ${tgaJs ? 'available' : 'not available'}`);
    console.log(`  Netpbm:      available`);
    console.log(`  QOI:         ${qoijs ? 'available' : 'not available'}`);
    console.log(`  ICO:         ${icoEndec ? 'available' : 'not available'}`);
    console.log(`  HDR/EXR:     ${hdrify ? 'available' : 'not available'}`);
    console.log(`  DDS:         ${ddsParser ? 'available' : 'not available'}`);
    console.log(`  RAW (dcraw): ${dcrawModule ? 'available' : 'not available'}`);
    console.log(`  JPEG 2000:   ${openjpegCodec ? 'available' : 'not available'}`);
    console.log(`  JPEG XL:     ${jxlCodec ? 'available' : 'not available'}`);
    console.log(`  Concurrent:  ${CONCURRENT_LIMIT} simultaneous conversions\n`);
  });
})();
