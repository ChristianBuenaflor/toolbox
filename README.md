# QR Code Generator

A modern, responsive, client-side QR Code Generator built with separate HTML, CSS, and JavaScript files.

## Features

- Website / URL QR codes
- Plain text QR codes
- Email QR codes
- Phone QR codes
- SMS QR codes
- Wi-Fi QR codes
- Contact / vCard QR codes
- Location / geo QR codes
- Live QR customization
- 240–600 px QR sizes
- White padding around downloaded raster images
- Custom foreground/background colors
- Square, rounded, dots, classy and classy-rounded dot styles
- Multiple corner styles
- Error correction levels L, M, Q and H
- Logo upload with automatic High error correction recommendation
- Transparent background option
- Download PNG, JPG and SVG
- Copy QR image to clipboard
- Print QR code
- Recent QR history using localStorage
- Light/dark theme
- Responsive mobile layout
- No backend or database required

## Project structure

```text
qr-code-generator/
├── index.html
├── style.css
├── script.js
└── README.md
```

## Run

No build process is required.

1. Download or clone the project.
2. Open `index.html` in a modern browser.
3. Enter your content.
4. Customize the QR code.
5. Click **Generate QR Code**.
6. Download, copy or print it.

The project loads QR Code Styling from a CDN, so an internet connection is required unless you replace the CDN dependency with a local copy.

## White spacing

Downloaded PNG/JPG files receive the configured outer padding. The default is 40 px.

In `script.js`:

```js
const padding = Number($("padding").value) || 0;
```

The preview itself does not receive this outer export padding.

## Error correction

| Level | Approx. recovery |
|---|---:|
| L | 7% |
| M | 15% |
| Q | 25% |
| H | 30% |

Use **H** when placing a logo over the QR code.

## Privacy

QR data is processed in the browser. The project does not send generated content to a custom backend. Recent history is stored locally in the browser using `localStorage`.

## Main dependency

QR Code Styling:

```html
<script src="https://unpkg.com/qr-code-styling@1.9.2/lib/qr-code-styling.js"></script>
```

## Browser support

Use a current version of Chrome, Edge, Firefox or Safari. Clipboard image copying requires browser support for the Clipboard API and may require HTTPS or localhost.

## License

You can modify and use this project for personal or commercial projects. Check the QR Code Styling library's license separately.
