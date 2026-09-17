QR Code Generator

A simple, modern, and responsive QR Code Generator built with HTML, CSS, and JavaScript. It allows users to create QR codes from text or URLs, customize their appearance, and download them as PNG images with white spacing around the QR code.

Features
Generate QR codes from text or URLs
Live QR code generation while typing
Custom QR code size
200 × 200
300 × 300
400 × 400
500 × 500
600 × 600
Custom QR code foreground color
Custom background color
QR error correction levels
Low — 7%
Medium — 15%
Quartile — 25%
High — 30%
Download QR code as PNG
Adds white spacing around the downloaded QR code
Clear QR code button
Responsive design for desktop, tablet, and mobile
No backend or database required
Technologies
HTML5
CSS3
JavaScript
QRCode.js
Project Structure
qr-code-generator/
│
├── index.html
└── README.md
Getting Started
1. Clone or download the project

Download the project files or clone the repository:

git clone https://github.com/your-username/qr-code-generator.git
2. Open the project

Navigate to the project folder:

cd qr-code-generator
3. Run the application

Since this is a standalone HTML application, you can simply open:

index.html

in your web browser.

No installation or build process is required.

Usage
Enter a URL or text in the Text or URL field.
The QR code will be generated automatically.
Customize the QR code size if needed.
Select the desired error correction level.
Choose the QR code and background colors.
Click Download PNG to save the QR code.
Downloaded QR Code Spacing

The downloaded PNG automatically includes a white margin around the QR code.

The spacing is controlled by:

const padding = 40;

The default padding is 40 pixels on all four sides.

For example:

┌─────────────────────────────┐
│                             │
│    █████████████████████    │
│    ███ QR CODE ██████████    │
│    █████████████████████    │
│                             │
└─────────────────────────────┘

To increase the spacing:

const padding = 60;

To decrease the spacing:

const padding = 20;
QR Code Error Correction

The generator supports four QR error correction levels:

Level	Recovery
Low (L)	7%
Medium (M)	15%
Quartile (Q)	25%
High (H)	30%

Higher error correction allows the QR code to remain readable even when part of it is damaged or obscured, although it generally requires more QR modules.

Customization

The application uses CSS variables for the main interface colors:

:root {
    --primary: #6750a4;
    --primary-dark: #57408f;
    --background: #f7f5fb;
    --surface: #ffffff;
    --text: #24212b;
    --muted: #77727f;
    --border: #ded9e5;
}

You can modify these values to change the overall appearance.

QR Code Library

QR code generation is handled by QRCode.js:

<script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>

The library is loaded from jsDelivr, so an internet connection is required when loading the application unless the library is downloaded and hosted locally.

Browser Support

The application works in modern browsers, including:

Google Chrome
Microsoft Edge
Mozilla Firefox
Safari
License

This project is available for personal and educational use. The QR Code Generator itself does not require a backend, database, or server-side processing.

Author

Christian Buenaflor

Web Developer