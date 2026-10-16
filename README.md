<div align="center">

# ⚡ ImageForge

**Universal High-Performance Image Converter with WebAssembly Acceleration**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen.svg)](https://nodejs.org/)
[![Sharp](https://img.shields.io/badge/Engine-Sharp%20%2B%20WASM-blue.svg)](https://sharp.pixelplumbing.com/)
[![Formats](https://img.shields.io/badge/Input%20Formats-35%2B-orange.svg)](#supported-formats)
[![Outputs](https://img.shields.io/badge/Output%20Formats-17-purple.svg)](#supported-formats)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

Convert virtually any image format to modern web standards, professional archival formats, and legacy containers with zero quality loss, instant batch processing, and privacy-first local/server conversion.

[Features](#features) • [Supported Formats](#supported-formats) • [Quick Start](#quick-start) • [API Reference](#api-reference) • [Architecture](#architecture) • [License](#license)

</div>

---

## ✨ Features

- **🌐 35+ Input Formats Supported**: Common web formats, professional camera RAWs (CR2, NEF, ARW, DNG, RAF, RW2, PEF, ORF), HDR/EXR, Apple HEIC/HEIF, QOI, DDS game textures, JPEG 2000, JPEG XL, and Netpbm.
- **🚀 17 Output Formats**: Export instantly to `JPG`, `PNG`, `WebP`, `AVIF`, `JXL (JPEG XL)`, `HEIC`, `TIFF`, `BMP`, `ICO`, `JP2 (JPEG 2000)`, `QOI`, `HDR`, `EXR`, `PPM`, `PGM`, `PBM`, and `GIF`.
- **⚡ WebAssembly Codecs**: Powered by libvips/Sharp with native WASM decoders and encoders for bleeding-edge standards like JPEG XL (`@jsquash/jxl`) and JPEG 2000 (`@cornerstonejs/codec-openjpeg`).
- **📦 Batch Processing & ZIP Export**: Drag-and-drop multiple images simultaneously, monitor conversion queues with real-time progress indicators, and download results individually or as a compressed ZIP.
- **🔒 Privacy First & Auto-Cleanup**: Automated garbage collection purges temporary files and conversion artifacts from memory and disk after 10 minutes.
- **🎨 Glassmorphic Modern UI**: Built with responsive vanilla Tailwind aesthetics, animated mesh gradients, real-time health monitors, and drag-and-drop file zones.
- **🛠️ Extensible REST API**: Complete HTTP REST interface for seamless integration into automation scripts, CI/CD pipelines, and microservices.

---

## 📊 Supported Formats

| Category | Input Formats | Decoder / Engine | Output Supported |
|---|---|---|:---:|
| **Standard Web** | JPEG (`.jpg`, `.jpeg`), PNG (`.png`), GIF (`.gif`) | Sharp / libvips | ✅ |
| **Next-Gen Web** | WebP (`.webp`), AVIF (`.avif`), JPEG XL (`.jxl`), QOI (`.qoi`) | Sharp / `@jsquash/jxl` WASM / QOI | ✅ |
| **Camera RAW** | Canon (`.cr2`), Nikon (`.nef`), Sony (`.arw`), Adobe (`.dng`), Fuji (`.raf`), Olympus (`.orf`), Panasonic (`.rw2`), Pentax (`.pef`), Generic RAW (`.raw`) | dcraw / libvips | ✅ *(to 17 formats)* |
| **Mobile & Apple** | HEIC (`.heic`), HEIF (`.heif`) | heic-convert | ✅ |
| **Scientific & HDR** | Radiance HDR (`.hdr`), OpenEXR (`.exr`), TIFF (`.tiff`, `.tif`) | hdrify / Sharp | ✅ |
| **Game & Legacy** | DDS (`.dds`), Targa (`.tga`), BMP (`.bmp`), ICO (`.ico`), JPEG 2000 (`.jp2`, `.j2k`) | dds-parser / tga-js / OpenJPEG WASM | ✅ |
| **Portable Netpbm** | PPM (`.ppm`), PGM (`.pgm`), PBM (`.pbm`) | Custom Netpbm Parser | ✅ |
| **Documents & Vector**| PDF (`.pdf`), SVG (`.svg`, `.svgz`) | pdf-poppler / Sharp | ✅ *(Rasterize)* |

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended)
- `npm` or `yarn` / `pnpm`

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/AminOu-CoDe/imageforge.git
   cd imageforge
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Open in browser:**
   Visit [http://localhost:3000](http://localhost:3000) in your web browser.

---

## 🔌 API Reference

### 1. Check System Health & Codec Availability
```http
GET /api/health
```
**Response:**
```json
{
  "status": "ok",
  "sharp": true,
  "heic": true,
  "jxl": true,
  "openjpeg": true,
  "dcraw": true
}
```

### 2. List Supported Formats
```http
GET /api/formats
```

### 3. Convert Image(s)
```http
POST /api/convert
Content-Type: multipart/form-data
```
**Body:**
- `files`: Image file(s) (supports up to 100 files per request)
- `format`: Output format (`webp`, `png`, `avif`, `jxl`, `jpg`, `heic`, etc.)

**Response:**
```json
{
  "jobIds": ["6a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d"]
}
```

### 4. Query Job Status
```http
GET /api/status?ids=6a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d
```

### 5. Download Converted Output
```http
GET /api/download/:jobId
```

### 6. Batch Download as ZIP
```http
GET /api/download-all?ids=id1,id2,id3
```

---

## 🏗️ Architecture

```
imageforge/
├── index.html        # Modern frontend UI with drag-and-drop interface
├── styles.css        # Glassmorphic custom styling & animation keyframes
├── script.js         # Client-side state manager, batch queue & polling
├── server.js         # Express backend, format registry & transcoding pipelines
├── netpbm.js         # Specialized Netpbm binary/ASCII encoder & decoder
├── package.json      # Dependencies, scripts & metadata
└── uploads/          # Temporary conversion spool (auto-cleaned)
```

### Conversion Pipeline Logic:
1. **Request Intake**: Files uploaded via `multer` into isolated spool storage.
2. **Format Detection & Validation**: Validates MIME and binary signatures against the format registry.
3. **Decoding**:
   - Standard images handled directly by native **libvips/Sharp**.
   - Advanced/Next-Gen formats routed to specialized WASM decoders (e.g. OpenJPEG for JP2, libjxl WASM for JXL).
   - Camera RAWs decompressed via DCRAW.
4. **Encoding**: Transcoded into the requested destination matrix with metadata preservation and optimal compression profiles.
5. **Garbage Collection**: Jobs and spool storage are automatically pruned after 10 minutes to maintain minimal disk footprint.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

---

<div align="center">
  <sub>Built with ❤️ by <a href="https://github.com/Sizar-Dev">Sizar-Dev</a></sub>
</div>
