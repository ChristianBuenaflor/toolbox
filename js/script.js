 const qrText =
        document.getElementById("qrText");

    const qrSize =
        document.getElementById("qrSize");

    const errorCorrection =
        document.getElementById("errorCorrection");

    const foreground =
        document.getElementById("foreground");

    const background =
        document.getElementById("background");

    const foregroundValue =
        document.getElementById("foregroundValue");

    const backgroundValue =
        document.getElementById("backgroundValue");

    const qrcodeContainer =
        document.getElementById("qrcode");

    const generateBtn =
        document.getElementById("generateBtn");

    const clearBtn =
        document.getElementById("clearBtn");

    const downloadBtn =
        document.getElementById("downloadBtn");

    const status =
        document.getElementById("status");


    /*
    ============================================
    GENERATE QR CODE
    ============================================
    */

    function generateQRCode() {

        const text = qrText.value.trim();

        qrcodeContainer.innerHTML = "";

        if (!text) {

            status.textContent =
                "Enter text or a URL to generate a QR code.";

            return;
        }

        const size =
            Number(qrSize.value);

        new QRCode(qrcodeContainer, {

            text: text,

            width: size,
            height: size,

            colorDark: foreground.value,
            colorLight: background.value,

            correctLevel:
                QRCode.CorrectLevel[
                    errorCorrection.value
                ]

        });

        status.textContent =
            "QR code generated successfully.";
    }


    /*
    ============================================
    UPDATE PREVIEW SIZE
    ============================================
    */

    function updatePreviewSize() {

        const size =
            Number(qrSize.value);

        qrcodeContainer.style.width =
            Math.min(size, 300) + "px";

        qrcodeContainer.style.height =
            Math.min(size, 300) + "px";
    }


    /*
    ============================================
    UPDATE COLOR LABELS
    ============================================
    */

    function updateColorLabels() {

        foregroundValue.textContent =
            foreground.value.toUpperCase();

        backgroundValue.textContent =
            background.value.toUpperCase();

        generateQRCode();
    }


    /*
    ============================================
    CLEAR
    ============================================
    */

    function clearQRCode() {

        qrText.value = "";

        qrcodeContainer.innerHTML = "";

        status.textContent =
            "Enter text or a URL to generate a QR code.";
    }


    /*
    ============================================
    DOWNLOAD QR CODE WITH WHITE SPACING
    ============================================
    */

    function downloadQRCode() {

        const canvas =
            qrcodeContainer.querySelector("canvas");

        if (!canvas) {

            status.textContent =
                "Generate a QR code first.";

            return;
        }


        /*
        White margin around QR code.

        Change this value if you want
        more or less spacing.
        */

        const padding = 40;


        /*
        Create a new canvas that is larger
        than the QR code.
        */

        const outputCanvas =
            document.createElement("canvas");


        const ctx =
            outputCanvas.getContext("2d");


        /*
        QR dimensions
        */

        const qrWidth =
            canvas.width;

        const qrHeight =
            canvas.height;


        /*
        Final downloaded image size:

        QR width + left padding + right padding
        QR height + top padding + bottom padding
        */

        outputCanvas.width =
            qrWidth + (padding * 2);

        outputCanvas.height =
            qrHeight + (padding * 2);


        /*
        Fill the entire downloaded image
        with WHITE.
        */

        ctx.fillStyle = "#ffffff";

        ctx.fillRect(
            0,
            0,
            outputCanvas.width,
            outputCanvas.height
        );


        /*
        Draw the original QR code
        in the center.
        */

        ctx.drawImage(
            canvas,
            padding,
            padding,
            qrWidth,
            qrHeight
        );


        /*
        Download PNG
        */

        const link =
            document.createElement("a");

        link.download =
            "qr-code.png";

        link.href =
            outputCanvas.toDataURL("image/png");

        document.body.appendChild(link);

        link.click();

        document.body.removeChild(link);


        status.textContent =
            "QR code downloaded with white spacing.";
    }


    /*
    ============================================
    EVENT LISTENERS
    ============================================
    */

    generateBtn.addEventListener(
        "click",
        generateQRCode
    );


    clearBtn.addEventListener(
        "click",
        clearQRCode
    );


    downloadBtn.addEventListener(
        "click",
        downloadQRCode
    );


    qrText.addEventListener(
        "input",
        generateQRCode
    );


    qrSize.addEventListener(
        "change",
        () => {

            updatePreviewSize();

            generateQRCode();

        }
    );


    errorCorrection.addEventListener(
        "change",
        generateQRCode
    );


    foreground.addEventListener(
        "input",
        updateColorLabels
    );


    background.addEventListener(
        "input",
        updateColorLabels
    );


    /*
    ============================================
    INITIALIZE
    ============================================
    */

    updatePreviewSize();

    status.textContent =
        "Enter text or a URL to generate a QR code.";
