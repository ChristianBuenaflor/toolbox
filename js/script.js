const $ = (id) => document.getElementById(id);

const state = {
  logo: null,
  logoUrl: null,
  qr: null,
  generated: false,
  currentData: ""
};

const typeLabels = {
  url: "Website",
  text: "Plain text",
  email: "Email",
  phone: "Phone",
  sms: "SMS",
  wifi: "Wi-Fi",
  vcard: "Contact",
  location: "Location"
};

const fields = {
  url: `
    <label class="field"><span>Website URL</span>
      <input id="url" type="url" placeholder="https://example.com" autocomplete="url">
    </label>`,
  text: `
    <label class="field"><span>Your text</span>
      <textarea id="text" rows="5" placeholder="Enter any text you want to encode..."></textarea>
    </label>`,
  email: `
    <div class="grid-2">
      <label class="field"><span>Email address</span><input id="email" type="email" placeholder="hello@example.com"></label>
      <label class="field"><span>Subject</span><input id="subject" type="text" placeholder="Hello"></label>
    </div>
    <label class="field"><span>Message</span><textarea id="emailMessage" rows="4" placeholder="Your message..."></textarea></label>`,
  phone: `
    <label class="field"><span>Phone number</span><input id="phone" type="tel" placeholder="+63 912 345 6789"></label>`,
  sms: `
    <div class="grid-2">
      <label class="field"><span>Phone number</span><input id="smsPhone" type="tel" placeholder="+63 912 345 6789"></label>
      <label class="field"><span>Message</span><input id="smsMessage" type="text" placeholder="Hello!"></label>
    </div>`,
  wifi: `
    <div class="grid-2">
      <label class="field"><span>Network name (SSID)</span><input id="ssid" type="text" placeholder="My Wi-Fi"></label>
      <label class="field"><span>Password</span><input id="wifiPassword" type="text" placeholder="Password"></label>
    </div>
    <div class="grid-2">
      <label class="field"><span>Security</span><select id="wifiSecurity"><option>WPA</option><option>WEP</option><option value="nopass">None</option></select></label>
      <label class="switch-row compact"><span><strong>Hidden network</strong></span><input id="wifiHidden" type="checkbox"><span class="switch"></span></label>
    </div>`,
  vcard: `
    <div class="grid-2">
      <label class="field"><span>First name</span><input id="firstName" type="text" placeholder="Christian"></label>
      <label class="field"><span>Last name</span><input id="lastName" type="text" placeholder="Buenaflor"></label>
    </div>
    <div class="grid-2">
      <label class="field"><span>Phone</span><input id="contactPhone" type="tel" placeholder="+63 912 345 6789"></label>
      <label class="field"><span>Email</span><input id="contactEmail" type="email" placeholder="hello@example.com"></label>
    </div>
    <label class="field"><span>Organization</span><input id="organization" type="text" placeholder="Company name"></label>`,
  location: `
    <div class="grid-2">
      <label class="field"><span>Latitude</span><input id="latitude" type="number" step="any" placeholder="14.5995"></label>
      <label class="field"><span>Longitude</span><input id="longitude" type="number" step="any" placeholder="120.9842"></label>
    </div>
    <label class="field"><span>Location label (optional)</span><input id="locationLabel" type="text" placeholder="Manila"></label>`
};

function escapeWifi(value) {
  return String(value).replace(/([\\;,:"])/g, "\\$1");
}

function buildData() {
  const type = $("qrType").value;
  const value = (id) => $(id)?.value.trim() || "";

  if (type === "url") {
    let url = value("url");
    if (!url) throw new Error("Please enter a website URL.");
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    try { new URL(url); } catch { throw new Error("Please enter a valid URL."); }
    return url;
  }

  if (type === "text") {
    const text = value("text");
    if (!text) throw new Error("Please enter some text.");
    return text;
  }

  if (type === "email") {
    const email = value("email");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Please enter a valid email address.");
    const subject = encodeURIComponent(value("subject"));
    const message = encodeURIComponent(value("emailMessage"));
    return `mailto:${email}${subject || message ? `?${subject ? `subject=${subject}` : ""}${subject && message ? "&" : ""}${message ? `body=${message}` : ""}` : ""}`;
  }

  if (type === "phone") {
    const phone = value("phone");
    if (!phone) throw new Error("Please enter a phone number.");
    return `tel:${phone}`;
  }

  if (type === "sms") {
    const phone = value("smsPhone");
    if (!phone) throw new Error("Please enter a phone number.");
    return `SMSTO:${phone}:${value("smsMessage")}`;
  }

  if (type === "wifi") {
    const ssid = value("ssid");
    if (!ssid) throw new Error("Please enter the Wi-Fi network name.");
    const security = $("wifiSecurity").value;
    const hidden = $("wifiHidden").checked ? "true" : "false";
    return `WIFI:T:${security};S:${escapeWifi(ssid)};P:${escapeWifi(value("wifiPassword"))};H:${hidden};;`;
  }

  if (type === "vcard") {
    const first = value("firstName"), last = value("lastName");
    if (!first && !last) throw new Error("Please enter a contact name.");
    return [
      "BEGIN:VCARD", "VERSION:3.0",
      `N:${last};${first};;;`,
      `FN:${[first, last].filter(Boolean).join(" ")}`,
      value("contactPhone") ? `TEL:${value("contactPhone")}` : "",
      value("contactEmail") ? `EMAIL:${value("contactEmail")}` : "",
      value("organization") ? `ORG:${value("organization")}` : "",
      "END:VCARD"
    ].filter(Boolean).join("\n");
  }

  if (type === "location") {
    const lat = value("latitude"), lng = value("longitude");
    if (lat === "" || lng === "" || Number(lat) < -90 || Number(lat) > 90 || Number(lng) < -180 || Number(lng) > 180) {
      throw new Error("Enter valid latitude and longitude values.");
    }
    return `geo:${lat},${lng}${value("locationLabel") ? `?q=${encodeURIComponent(value("locationLabel"))}` : ""}`;
  }
}

function options() {
  const transparent = $("transparent").checked;
  return {
    width: Number($("size").value),
    height: Number($("size").value),
    type: "canvas",
    data: state.currentData,
    margin: 0,
    qrOptions: { errorCorrectionLevel: $("errorCorrection").value },
    dotsOptions: {
      color: $("foreground").value,
      type: $("dots").value
    },
    cornersSquareOptions: {
      color: $("foreground").value,
      type: $("corners").value
    },
    cornersDotOptions: {
      color: $("foreground").value,
      type: $("corners").value === "dot" ? "dot" : "square"
    },
    backgroundOptions: {
      color: transparent ? "rgba(0,0,0,0)" : $("background").value
    },
    image: state.logoUrl || undefined,
    imageOptions: {
      crossOrigin: "anonymous",
      margin: 8,
      imageSize: 0.28,
      hideBackgroundDots: true
    }
  };
}

function renderQR(saveHistory = true) {
  try {
    state.currentData = buildData();
    if (state.qr) $("qr").innerHTML = "";
    state.qr = new QRCodeStyling(options());
    state.qr.append($("qr"));
    $("emptyPreview").classList.add("hidden");
    $("qrInfo").classList.remove("hidden");
    $("typeLabel").textContent = typeLabels[$("qrType").value];
    $("charCount").textContent = `${state.currentData.length} characters`;
    $("statusBadge").textContent = "Generated";
    state.generated = true;
    if (saveHistory) addHistory();
  } catch (error) {
    showToast(error.message);
  }
}

function getPaddedCanvas() {
  return new Promise((resolve, reject) => {
    if (!state.qr || !state.generated) return reject(new Error("Generate a QR code first."));
    state.qr.getRawData("png").then((blob) => {
      const image = new Image();
      image.onload = () => {
        const padding = Number($("padding").value) || 0;
        const canvas = document.createElement("canvas");
        canvas.width = image.width + padding * 2;
        canvas.height = image.height + padding * 2;
        const ctx = canvas.getContext("2d");
        if (!$("transparent").checked) {
          ctx.fillStyle = $("background").value;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(image, padding, padding);
        resolve(canvas);
      };
      image.onerror = reject;
      image.src = URL.createObjectURL(blob);
    }).catch(reject);
  });
}

async function downloadRaster(format) {
  try {
    const canvas = await getPaddedCanvas();
    const mime = format === "jpg" ? "image/jpeg" : "image/png";
    const quality = format === "jpg" ? 0.95 : undefined;
    const link = document.createElement("a");
    link.download = `qr-code.${format}`;
    link.href = canvas.toDataURL(mime, quality);
    link.click();
    showToast(`${format.toUpperCase()} downloaded.`);
  } catch (error) { showToast(error.message); }
}

async function downloadSvg() {
  if (!state.qr || !state.generated) return showToast("Generate a QR code first.");
  try {
    await state.qr.download({ name: "qr-code", extension: "svg" });
    showToast("SVG downloaded.");
  } catch (error) { showToast("SVG export failed."); }
}

async function copyQR() {
  try {
    const canvas = await getPaddedCanvas();
    canvas.toBlob(async (blob) => {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      showToast("QR code copied to clipboard.");
    }, "image/png");
  } catch (error) {
    showToast("Copy is not supported by this browser.");
  }
}

async function printQR() {
  try {
    const canvas = await getPaddedCanvas();
    const dataUrl = canvas.toDataURL("image/png");
    const title = typeLabels[$("qrType").value];
    const win = window.open("", "_blank", "width=700,height=800");
    if (!win) return showToast("Please allow pop-ups to print.");
    win.document.write(`
      <!doctype html><html><head><title>Print QR Code</title>
      <style>body{font-family:Arial,sans-serif;text-align:center;padding:40px}img{max-width:80%;height:auto}h1{font-size:24px;margin-bottom:24px}@media print{button{display:none}}</style>
      </head><body><h1>${title} QR Code</h1><img src="${dataUrl}" alt="QR Code"><script>window.onload=()=>window.print()<\/script></body></html>
    `);
    win.document.close();
  } catch (error) { showToast(error.message); }
}

function addHistory() {
  const history = JSON.parse(localStorage.getItem("qrHistory") || "[]");
  const item = {
    id: Date.now(),
    type: $("qrType").value,
    data: state.currentData,
    label: getHistoryLabel()
  };
  const filtered = history.filter(x => x.data !== item.data);
  localStorage.setItem("qrHistory", JSON.stringify([item, ...filtered].slice(0, 10)));
  renderHistory();
}

function getHistoryLabel() {
  const type = $("qrType").value;
  if (type === "url") return state.currentData;
  if (type === "wifi") return $("ssid")?.value.trim() || "Wi-Fi network";
  if (type === "vcard") return [$("firstName")?.value, $("lastName")?.value].filter(Boolean).join(" ") || "Contact";
  return state.currentData.replace(/\s+/g, " ").slice(0, 70);
}

function renderHistory() {
  const list = $("historyList");
  const history = JSON.parse(localStorage.getItem("qrHistory") || "[]");
  if (!history.length) {
    list.innerHTML = '<div class="history-empty">Your recent QR codes will appear here.</div>';
    return;
  }
  list.innerHTML = history.map(item => `
    <button class="history-item" data-id="${item.id}" type="button">
      <span class="history-icon">QR</span>
      <span class="history-copy"><strong>${escapeHtml(typeLabels[item.type])}</strong><small>${escapeHtml(item.label)}</small></span>
      <span class="history-arrow">→</span>
    </button>
  `).join("");

  list.querySelectorAll(".history-item").forEach(button => {
    button.addEventListener("click", () => {
      const item = history.find(x => x.id === Number(button.dataset.id));
      if (!item) return;
      loadHistoryItem(item);
    });
  });
}

function loadHistoryItem(item) {
  $("qrType").value = item.type;
  renderFields();
  const type = item.type;
  const d = item.data;

  if (type === "url") $("url").value = d;
  else if (type === "text") $("text").value = d;
  else if (type === "phone") $("phone").value = d.replace(/^tel:/, "");
  else if (type === "email") {
    const match = d.match(/^mailto:([^?]+)(?:\?subject=([^&]*))?(?:&body=(.*))?$/);
    if (match) { $("email").value = match[1]; $("subject").value = decodeURIComponent(match[2] || ""); $("emailMessage").value = decodeURIComponent(match[3] || ""); }
  } else if (type === "sms") {
    const parts = d.split(":");
    $("smsPhone").value = parts[1] || "";
    $("smsMessage").value = parts.slice(2).join(":") || "";
  } else if (type === "wifi") {
    const m = d.match(/^WIFI:T:([^;]*);S:((?:\\.|[^;])*)?;P:((?:\\.|[^;])*)?;H:(true|false);;/);
    if (m) { $("wifiSecurity").value = m[1]; $("ssid").value = (m[2] || "").replace(/\\([\\;,:"])/g, "$1"); $("wifiPassword").value = (m[3] || "").replace(/\\([\\;,:"])/g, "$1"); $("wifiHidden").checked = m[4] === "true"; }
  } else if (type === "vcard") {
    const get = (key) => (d.match(new RegExp(`^${key}:(.*)$`, "m")) || [,""])[1];
    const n = get("N").split(";");
    $("lastName").value = n[0] || ""; $("firstName").value = n[1] || ""; $("contactPhone").value = get("TEL"); $("contactEmail").value = get("EMAIL"); $("organization").value = get("ORG");
  } else if (type === "location") {
    const m = d.match(/^geo:([^,]+),([^?]+)(?:\?q=(.*))?$/);
    if (m) { $("latitude").value = m[1]; $("longitude").value = m[2]; $("locationLabel").value = decodeURIComponent(m[3] || ""); }
  }
  renderQR(false);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderFields() {
  $("formFields").innerHTML = fields[$("qrType").value];
}

function clearAll() {
  renderFields();
  $("qr").innerHTML = "";
  $("emptyPreview").classList.remove("hidden");
  $("qrInfo").classList.add("hidden");
  $("statusBadge").textContent = "Ready";
  state.generated = false;
  state.currentData = "";
}

function syncColor(colorId, hexId) {
  $(colorId).addEventListener("input", () => $(hexId).value = $(colorId).value.toUpperCase());
  $(hexId).addEventListener("change", () => {
    let value = $(hexId).value.trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) return showToast("Use a 6-digit hex color, e.g. #111827.");
    $(colorId).value = value;
    if (state.generated) renderQR(false);
  });
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[c]));
}

function toggleTheme() {
  const dark = document.body.classList.toggle("dark");
  localStorage.setItem("qrTheme", dark ? "dark" : "light");
  $("themeToggle").textContent = dark ? "☀" : "☾";
}

function setupToolNavigation() {
  const navButtons = document.querySelectorAll(".nav-button");
  const toolPanels = document.querySelectorAll(".tool-panel");

  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const selectedView = button.dataset.view;

      navButtons.forEach((item) => {
        const isActive = item === button;
        item.classList.toggle("active", isActive);
        item.setAttribute("aria-pressed", String(isActive));
      });

      toolPanels.forEach((panel) => {
        const isActive = panel.id === `${selectedView}Panel`;
        panel.classList.toggle("active", isActive);
      });
    });
  });
}

const converterState = {
  selectedFiles: [],
  outputFormat: "jpg",
  targetSizeKB: 300
};

function getConverterSizeConfig() {
  const widthInput = $("imageWidth");
  const heightInput = $("imageHeight");
  const unitSelect = $("imageUnit");
  const targetSizeInput = $("imageTargetSize");

  const unit = unitSelect ? unitSelect.value : "px";
  const targetSizeKB = targetSizeInput ? Math.max(50, Number(targetSizeInput.value) || 300) : 300;
  let width = widthInput ? Number(widthInput.value) || 1600 : 1600;
  let height = heightInput ? Number(heightInput.value) || 1200 : 1200;

  if (unit === "in") {
    width = Math.max(10, width * 300);
    height = Math.max(10, height * 300);
  } else if (unit === "cm") {
    width = Math.max(10, width * 118.11);
    height = Math.max(10, height * 118.11);
  }

  converterState.targetSizeKB = targetSizeKB;
  return { width: Math.round(width), height: Math.round(height), targetSizeKB };
}

function exportBlobWithSizeLimit(canvas, format, maxBytes) {
  return new Promise((resolve, reject) => {
    const mime = format === "jpg" ? "image/jpeg" : "image/png";
    const scaleDown = (nextScale) => {
      const scaledWidth = Math.max(32, Math.round(canvas.width * nextScale));
      const scaledHeight = Math.max(32, Math.round(canvas.height * nextScale));
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = scaledWidth;
      tempCanvas.height = scaledHeight;
      const ctx = tempCanvas.getContext("2d");
      ctx.fillStyle = format === "jpg" ? "#FFFFFF" : "rgba(255,255,255,0)";
      ctx.fillRect(0, 0, scaledWidth, scaledHeight);
      ctx.drawImage(canvas, 0, 0, scaledWidth, scaledHeight);
      return tempCanvas;
    };

    const tryExport = (quality, currentCanvas = canvas) => {
      currentCanvas.toBlob((blob) => {
        if (!blob) return reject(new Error("Unable to export image."));
        if (blob.size <= maxBytes) {
          resolve(blob);
          return;
        }

        if (format === "jpg" && quality > 0.15) {
          tryExport(Math.max(0.15, quality - 0.08), currentCanvas);
          return;
        }

        if (currentCanvas.width > 32 && currentCanvas.height > 32) {
          tryExport(quality, scaleDown(0.9));
          return;
        }

        reject(new Error(`Unable to keep file under ${maxBytes / 1024} KB.`));
      }, mime, quality);
    };

    tryExport(format === "jpg" ? 0.95 : 1);
  });
}

function createSvgFromImageData(imageData, width, height) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <image href="data:image/png;base64,${imageData}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" />
    </svg>
  `;
  return new Blob([svg], { type: "image/svg+xml" });
}

function generateConvertedBlob(file, format) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        try {
          const { width: targetWidth, height: targetHeight, targetSizeKB } = getConverterSizeConfig();
          const maxBytes = targetSizeKB * 1024;
          const maxWidth = Math.max(10, targetWidth);
          const maxHeight = Math.max(10, targetHeight);
          const ratio = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
          const width = Math.max(32, Math.round(img.width * ratio));
          const height = Math.max(32, Math.round(img.height * ratio));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");

          if (format === "jpg") {
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, width, height);
          }

          ctx.drawImage(img, 0, 0, width, height);

          if (format === "svg") {
            canvas.toBlob((pngBlob) => {
              if (!pngBlob) return reject(new Error("Unable to create SVG preview."));
              const imageReader = new FileReader();
              imageReader.onload = () => {
                const data = String(imageReader.result).split(",")[1];
                const svgBlob = createSvgFromImageData(data, width, height);
                resolve(svgBlob.size > maxBytes ? svgBlob.slice(0, maxBytes) : svgBlob);
              };
              imageReader.readAsDataURL(pngBlob);
            }, "image/png", 0.95);
            return;
          }

          exportBlobWithSizeLimit(canvas, format, maxBytes)
            .then(resolve)
            .catch(reject);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => reject(new Error("Failed to load image."));
      img.src = event.target.result;
    };

    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function setupImageConverter() {
  const imageUploadArea = $("imageUploadArea");
  const imageFileInput = $("imageFileInput");
  const previewGrid = $("previewGrid");
  const convertBtn = $("convertBtn");
  const statusDiv = $("status");
  const formatOptions = document.querySelectorAll(".format-option");

  if (!imageUploadArea || !imageFileInput || !previewGrid || !convertBtn || !statusDiv) return;

  const showStatus = (message, type) => {
    statusDiv.className = `status ${type}`;
    statusDiv.innerHTML = message;
    statusDiv.classList.remove("hidden");
  };

  const updatePreview = () => {
    previewGrid.innerHTML = "";

    if (converterState.selectedFiles.length === 0) {
      previewGrid.classList.add("hidden");
      convertBtn.disabled = true;
      return;
    }

    previewGrid.classList.remove("hidden");

    converterState.selectedFiles.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const item = document.createElement("div");
        item.className = "preview-item";
        item.innerHTML = `
          <img src="${event.target.result}" alt="${escapeHtml(file.name)}">
          <button type="button" class="remove-btn" data-index="${index}" aria-label="Remove ${escapeHtml(file.name)}">×</button>
          <div class="filename">${escapeHtml(file.name)}</div>
        `;
        const removeBtn = item.querySelector(".remove-btn");
        removeBtn.addEventListener("click", () => {
          converterState.selectedFiles.splice(index, 1);
          updatePreview();
        });
        previewGrid.appendChild(item);
      };
      reader.readAsDataURL(file);
    });
  };

  const convertImage = (file) => generateConvertedBlob(file, converterState.outputFormat);

  const handleFiles = (files) => {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length === 0) {
      showStatus("Please select valid image files.", "error");
      return;
    }

    converterState.selectedFiles = [...converterState.selectedFiles, ...imageFiles];
    updatePreview();
    convertBtn.disabled = false;
    statusDiv.classList.add("hidden");
  };

  const removeFile = (index) => {
    converterState.selectedFiles.splice(index, 1);
    updatePreview();
  };

  imageFileInput.addEventListener("change", (event) => handleFiles(event.target.files));

  imageUploadArea.addEventListener("click", () => imageFileInput.click());
  imageUploadArea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      imageFileInput.click();
    }
  });

  ["dragover", "dragenter"].forEach((eventName) => {
    imageUploadArea.addEventListener(eventName, (event) => {
      event.preventDefault();
      imageUploadArea.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    imageUploadArea.addEventListener(eventName, (event) => {
      event.preventDefault();
      imageUploadArea.classList.remove("dragover");
    });
  });

  imageUploadArea.addEventListener("drop", (event) => {
    handleFiles(event.dataTransfer.files);
  });

  formatOptions.forEach((option) => {
    option.addEventListener("click", () => {
      formatOptions.forEach((item) => item.classList.remove("selected"));
      option.classList.add("selected");
      converterState.outputFormat = option.dataset.format;
    });
  });

  ["imageWidth", "imageHeight", "imageUnit", "imageTargetSize"].forEach((id) => {
    const element = $(id);
    if (element) {
      element.addEventListener("input", () => {
        if (id === "imageUnit") {
          const config = getConverterSizeConfig();
          const width = $("imageWidth");
          const height = $("imageHeight");
          if (config.unit === "px") {
            width.value = Math.max(10, Math.round(width.value || 1600));
            height.value = Math.max(10, Math.round(height.value || 1200));
          }
        }
      });
    }
  });

  convertBtn.addEventListener("click", async () => {
    if (converterState.selectedFiles.length === 0) return;

    convertBtn.disabled = true;
    showStatus(`<span class="spinner">⏳</span> Converting ${converterState.selectedFiles.length} image(s)...`, "processing");

    try {
      const zip = new JSZip();
      const convertedBlobs = [];

      for (let i = 0; i < converterState.selectedFiles.length; i++) {
        const file = converterState.selectedFiles[i];
        const blob = await convertImage(file);
        const originalName = file.name.substring(0, file.name.lastIndexOf(".")) || file.name;
        const fileName = `${originalName}.${converterState.outputFormat}`;
        convertedBlobs.push({ blob, fileName });
      }

      if (convertedBlobs.length === 1) {
        const link = document.createElement("a");
        const url = URL.createObjectURL(convertedBlobs[0].blob);
        link.href = url;
        link.download = convertedBlobs[0].fileName;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        showStatus(`<span class="spinner">⏳</span> Creating ZIP archive...`, "processing");
        convertedBlobs.forEach(({ blob, fileName }) => zip.file(fileName, blob));
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(zipBlob);
        link.href = url;
        link.download = `converted_images_${Date.now()}.zip`;
        link.click();
        URL.revokeObjectURL(url);
      }

      showStatus(`✅ Successfully converted ${converterState.selectedFiles.length} image(s)!<br><small>Target size: ${converterState.targetSizeKB} KB</small>`, "success");
      setTimeout(() => {
        converterState.selectedFiles = [];
        updatePreview();
        imageFileInput.value = "";
      }, 1800);
    } catch (error) {
      showStatus(`❌ Error: ${error.message}`, "error");
      convertBtn.disabled = false;
    }
  });
}

setupToolNavigation();
setupImageConverter();

$("qrType").addEventListener("change", () => { renderFields(); if (state.generated) clearAll(); });
$("generateBtn").addEventListener("click", () => renderQR(true));
$("clearBtn").addEventListener("click", clearAll);
$("downloadPng").addEventListener("click", () => downloadRaster("png"));
$("downloadJpg").addEventListener("click", () => downloadRaster("jpg"));
$("downloadSvg").addEventListener("click", downloadSvg);
$("copyBtn").addEventListener("click", copyQR);
$("printBtn").addEventListener("click", printQR);
$("themeToggle").addEventListener("click", toggleTheme);
$("clearHistoryBtn").addEventListener("click", () => { localStorage.removeItem("qrHistory"); renderHistory(); });
$("removeLogo").addEventListener("click", () => {
  state.logo = null;
  if (state.logoUrl) URL.revokeObjectURL(state.logoUrl);
  state.logoUrl = null;
  $("logoInput").value = "";
  $("logoName").textContent = "Upload logo";
  if (state.generated) renderQR(false);
});
$("logoInput").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) return showToast("Logo must be 2 MB or smaller.");
  state.logo = file;
  if (state.logoUrl) URL.revokeObjectURL(state.logoUrl);
  state.logoUrl = URL.createObjectURL(file);
  $("logoName").textContent = file.name;
  if ($("errorCorrection").value !== "H") $("errorCorrection").value = "H";
  if (state.generated) renderQR(false);
});
["size","padding","dots","corners","errorCorrection","transparent"].forEach(id => {
  $(id).addEventListener("change", () => { if (state.generated) renderQR(false); });
});
syncColor("foreground", "foregroundHex");
syncColor("background", "backgroundHex");

if (localStorage.getItem("qrTheme") === "dark") {
  document.body.classList.add("dark");
  $("themeToggle").textContent = "☀";
}

renderFields();
renderHistory();
