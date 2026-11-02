# ToolboxKo

A modern, responsive, client-side toolbox with multiple daily-use tools. No backend or database required.

Live tools:
- **QR Generator** — styled QR codes with logo, history, and PNG/JPG/SVG export
- **Image Converter** — bulk JPG/PNG/SVG conversion with resize and file-size limit
- **Case Converter** — UPPERCASE, lowercase, Title, Sentence, camelCase, snake_case, kebab-case

## Project structure

```text
toolbox/
├── index.html
├── css/
│   └── style.css
├── js/
│   └── script.js
└── README.md
```

## Run

No build process is required.

1. Download or clone the project.
2. Open `index.html` in a modern browser.
3. Use the sidebar to switch tools: QR Generator / Image Converter / Case Converter.

Internet connection is required for CDN dependencies unless replaced with local copies.

## 1. QR Generator

Types: Website / URL, Plain Text, Email (`mailto:`), Phone (`tel:`), SMS (`smsto:`), Wi-Fi (`WIFI:`), Contact / vCard, Location (`geo:`).

Customization:
- Size: 240–600 px
- White padding for exports (default 40 px, 0–150), applied to downloaded raster images
- Foreground / background colors with hex inputs
- Dots: square, rounded, dots, classy, classy-rounded
- Corners: square, dot, extra-rounded
- Error correction: L (7%), M (15%), Q (25%), H (30%)
- Logo upload (PNG/JPG/WebP, max 2 MB), auto-switches to H
- Transparent background option

Actions:
- Generate, Copy image (Clipboard API), Print, Download PNG / JPG (padded canvas, JPG quality 0.95) / SVG
- Recent history in `localStorage` (`qrHistory`), click to reload, clear history
- Live re-render on option change after first generation
- Light/dark theme (`qrTheme` in `localStorage`)

## 2. Image Converter

- Output formats: JPG (smaller files), PNG (transparency), SVG (base64-embedded scalable + code view)
- Bulk upload via click or drag-and-drop, preview grid with per-file remove
- Resize: original size by default; "Customize image size" toggle reveals exact Width / Height with Unit (px, in @300dpi, cm @118.11)
- Max size target (default 300 KB, min 50 KB): JPG reduces quality 0.95→0.15 then scales 0.9x; PNG scales down until under limit
- Single file: direct download; multiple files: ZIP archive via JSZip (`converted_images_<timestamp>.zip`)
- SVG mode: shows code panel with Copy code / Download SVG

## 3. Case Converter

- Modes: UPPER, lower, Title Case, Sentence case, camelCase, snake_case, kebab-case
- Live conversion on input / mode switch
- Copy result (Clipboard API with fallback), Clear

## Dependencies (CDN)

CDN scripts are pinned with Subresource Integrity (SRI) hashes and loaded with
`crossorigin="anonymous"` + `defer`. If you upgrade a CDN version, recompute
the `integrity` hash for the new file, otherwise the script will be blocked.

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js" integrity="sha384-..." crossorigin="anonymous" defer></script>
<script src="https://unpkg.com/qr-code-styling@1.9.2/lib/qr-code-styling.js" integrity="sha384-..." crossorigin="anonymous" defer></script>
```

Fonts: Inter + Space Grotesk via Google Fonts.

## Privacy

All processing happens in the browser. No content is sent to a custom backend. QR history and theme are stored locally in `localStorage`. Wi-Fi QR codes are never written to history so passwords are not persisted.

## Security notes

- `Content-Security-Policy` is set via `<meta>` (scripts: self + pinned CDNs; no plugins/objects).
- All `localStorage` access is validated and wrapped in try/catch (corrupt data or private mode can't crash the app).
- History, preview and status rendering use DOM APIs / text assignment — user content is never injected as HTML.
- Uploads are allow-listed by MIME type and capped (logo: PNG/JPG/WEBP, 2 MB; converter: 20 files, 25 MB each, JPG/PNG/GIF/BMP/WEBP only).
- QR payloads are capped (4000 chars), URLs restricted to http(s), phones validated, and vCard fields are newline-stripped/escaped.
- Print view is built with DOM APIs (`window.open` uses `noopener,noreferrer` + `opener = null`).

## Browser support

Current Chrome, Edge, Firefox, Safari. Clipboard image/text copy requires Clipboard API support and may require HTTPS or localhost.
