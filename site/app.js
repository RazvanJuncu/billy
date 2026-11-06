"use strict";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg", "tif", "tiff", "bmp"]);
const $ = (id) => document.getElementById(id);
const state = {
  api: "http://127.0.0.1:8000",
  online: false,
  busy: false,
  file: null,
  previewUrl: null,
  result: null,
  page: 0,
  tab: "document"
};

function showNotification(message, error = false) {
  $("notification").textContent = message;
  $("notification").classList.toggle("error", error);
  $("notification").hidden = !message;
}

function apiAddress(value) {
  const url = new URL(value.trim());
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Use a plain OCR API address without login details, query parameters or fragments.");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Remote OCR services must use HTTPS. HTTP is only allowed for localhost.");
  }
  return url.origin + url.pathname.replace(/\/+$/, "");
}

function updateScanButton() {
  $("scanButton").disabled = !state.file || !state.online || state.busy;
  $("scanLabel").textContent = state.busy ? "Processing invoice…" : "Scan invoice";
}

async function connectEngine() {
  const dot = $("statusDot");
  const label = $("statusText");
  state.online = false;
  dot.className = "status-dot";
  label.textContent = "Connecting to OCR engine…";
  updateScanButton();
  try {
    const address = apiAddress($("endpoint").value);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    let response;
    try {
      response = await fetch(address + "/api/health", { signal: controller.signal, cache: "no-store" });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error("HTTP " + response.status);
    const payload = await response.json();
    if (payload.status !== "online") throw new Error("Unexpected response from OCR service");
    state.api = address;
    state.online = true;
    dot.className = "status-dot online";
    label.textContent = payload.model_loaded ? "OCR engine connected · model loaded" : "OCR engine connected · model loads on first scan";
    $("settings").open = false;
    showNotification("");
  } catch (error) {
    state.online = false;
    dot.className = "status-dot offline";
    label.textContent = "OCR engine offline";
    showNotification("Start Billy's local Python server to scan invoices. See the README on GitHub for Windows installation instructions. " + (error.message || ""), true);
  }
  updateScanButton();
}

function discardPreview() {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = null;
}

function selectFile(file) {
  if (!file) return;
  const extension = (file.name.split(".").pop() || "").toLowerCase();
  if (!ACCEPTED_EXTENSIONS.has(extension)) {
    showNotification("Unsupported format. Please choose PDF, PNG, JPG, TIFF or BMP.", true);
    return;
  }
  if (file.size === 0 || file.size > MAX_FILE_BYTES) {
    showNotification("Choose a non-empty document no larger than 20 MiB.", true);
    return;
  }
  state.file = file;
  state.result = null;
  state.page = 0;
  discardPreview();
  state.previewUrl = URL.createObjectURL(file);
  $("dropzone").classList.add("has-file");
  $("emptySource").hidden = true;
  const area = $("sourcePreview");
  area.hidden = false;
  area.replaceChildren();
  if (extension === "pdf") {
    const iframe = document.createElement("iframe");
    iframe.title = "Original PDF invoice";
    iframe.src = state.previewUrl;
    area.appendChild(iframe);
  } else if (["jpg", "jpeg", "png", "bmp"].includes(extension)) {
    const image = document.createElement("img");
    image.alt = "Original invoice";
    image.src = state.previewUrl;
    area.appendChild(image);
  } else {
    const warning = document.createElement("div");
    warning.className = "unsupported-preview";
    warning.textContent = "This format may not be previewed by your browser, but PaddleOCR can still process it.";
    area.appendChild(warning);
  }
  $("filename").textContent = file.name;
  $("filesize").textContent = (file.size / 1024 / 1024).toFixed(2) + " MiB";
  $("fileRow").hidden = false;
  $("resultToolbar").hidden = true;
  $("outputFooter").hidden = true;
  $("outputPlaceholder").hidden = false;
  $("formattedOutput").hidden = true;
  $("rawOutput").hidden = true;
  updateScanButton();
  showNotification("");
}

function fileInputHandler() {
  selectFile($("filePicker").files[0]);
  $("filePicker").value = "";
}

function createElement(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

function markdownTable(lines) {
  const table = document.createElement("table");
  let dataRows = lines;
  if (lines.length > 1 && /^\s*\|?\s*:?-+:?/.test(lines[1])) {
    dataRows = lines.filter((row, index) => index !== 1);
  }
  dataRows.forEach((row, index) => {
    const tr = document.createElement("tr");
    const cells = row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
    for (const cell of cells) tr.appendChild(createElement(index === 0 ? "th" : "td", "", cell.trim()));
    table.appendChild(tr);
  });
  return table;
}

function renderHtmlTableSafely(html) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const inputTable = parsed.querySelector("table");
  if (!inputTable) return createElement("p", "", html);
  const outputTable = document.createElement("table");
  for (const tr of inputTable.querySelectorAll("tr")) {
    const outputRow = document.createElement("tr");
    for (const cell of tr.children) {
      if (!["TD", "TH"].includes(cell.tagName)) continue;
      const outputCell = createElement(cell.tagName.toLowerCase(), "", cell.textContent.trim());
      for (const attribute of ["colspan", "rowspan"]) {
        const value = Number(cell.getAttribute(attribute));
        if (Number.isInteger(value) && value >= 1 && value <= 50) outputCell.setAttribute(attribute, String(value));
      }
      outputRow.appendChild(outputCell);
    }
    outputTable.appendChild(outputRow);
  }
  return outputTable;
}

function renderMarkdown(markdown, container) {
  container.replaceChildren();
  const lines = (markdown || "").split(/\r?\n/);
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    if (/^\s*<table[\s>]/i.test(line)) {
      const html = [];
      while (index < lines.length) {
        html.push(lines[index]);
        if (/<\/table>/i.test(lines[index])) { index++; break; }
        index++;
      }
      container.appendChild(renderHtmlTableSafely(html.join("\n")));
      continue;
    }
    if (line.trim().startsWith("|") && index + 1 < lines.length && lines[index + 1].includes("|")) {
      const block = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        block.push(lines[index]);
        index++;
      }
      container.appendChild(markdownTable(block));
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)/);
    if (heading) {
      container.appendChild(createElement("h" + heading[1].length, "", heading[2]));
    } else if (/^\s*[-*]\s+/.test(line)) {
      const list = document.createElement("ul");
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        list.appendChild(createElement("li", "", lines[index].replace(/^\s*[-*]\s+/, "")));
        index++;
      }
      container.appendChild(list);
      continue;
    } else {
      container.appendChild(createElement("p", "", line));
    }
    index++;
  }
  if (!container.childNodes.length) container.appendChild(createElement("p", "", "No recognized content on this page."));
}

function renderResult() {
  if (!state.result) return;
  const pages = state.result.pages || [];
  const page = pages[state.page];
  if (!page) return;
  $("outputPlaceholder").hidden = true;
  $("resultToolbar").hidden = false;
  $("outputFooter").hidden = false;
  $("summaryText").textContent = pages.length + (pages.length === 1 ? " page scanned" : " pages scanned");
  $("pagePicker").replaceChildren();
  pages.forEach((item, index) => {
    const option = new Option("Page " + (index + 1), String(index));
    $("pagePicker").appendChild(option);
  });
  $("pagePicker").value = String(state.page);
  for (const button of document.querySelectorAll("[data-tab]")) {
    const selected = button.dataset.tab === state.tab;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  }
  const formatted = $("formattedOutput");
  const raw = $("rawOutput");
  formatted.hidden = state.tab !== "document";
  raw.hidden = state.tab === "document";
  if (state.tab === "document") renderMarkdown(page.markdown, formatted);
  if (state.tab === "markdown") raw.textContent = page.markdown || "";
  if (state.tab === "json") raw.textContent = JSON.stringify(page.ocr || {}, null, 2);
}

async function scanInvoice() {
  if (!state.file || !state.online || state.busy) return;
  state.busy = true;
  updateScanButton();
  showNotification("Billy is reading the invoice. The first scan can take longer while PaddleOCR downloads and loads its models.");
  const currentFile = state.file;
  const form = new FormData();
  form.append("file", currentFile, currentFile.name);
  try {
    const response = await fetch(state.api + "/api/parse", { method: "POST", body: form });
    const responseBody = await response.json();
    if (!response.ok) throw new Error(responseBody.detail || ("HTTP " + response.status));
    if (!Array.isArray(responseBody.pages) || !responseBody.pages.length) throw new Error("The OCR service returned no pages.");
    if (state.file !== currentFile) return;
    state.result = responseBody;
    state.page = 0;
    state.tab = "document";
    renderResult();
    showNotification("Scan complete. Please verify dates, amounts and VAT against the original invoice.");
  } catch (error) {
    showNotification("Could not scan this document: " + (error.message || "Connection error"), true);
  } finally {
    state.busy = false;
    updateScanButton();
  }
}

function downloadFile(text, filename, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$("filePicker").addEventListener("change", fileInputHandler);
$("replaceButton").addEventListener("click", () => $("filePicker").click());
$("dropzone").addEventListener("click", (event) => {
  if (event.target !== $("filePicker") && !state.file) $("filePicker").click();
});
$("dropzone").addEventListener("keydown", (event) => {
  if ((event.key === "Enter" || event.key === " ") && !state.file) {
    event.preventDefault();
    $("filePicker").click();
  }
});
for (const eventName of ["dragenter", "dragover"]) {
  $("dropzone").addEventListener(eventName, (event) => {
    event.preventDefault();
    $("dropzone").classList.add("dragging");
  });
}
$("dropzone").addEventListener("dragleave", () => $("dropzone").classList.remove("dragging"));
$("dropzone").addEventListener("drop", (event) => {
  event.preventDefault();
  $("dropzone").classList.remove("dragging");
  selectFile(event.dataTransfer.files[0]);
});
$("scanButton").addEventListener("click", scanInvoice);
$("connectButton").addEventListener("click", connectEngine);
$("endpoint").addEventListener("keydown", (event) => {
  if (event.key === "Enter") { event.preventDefault(); connectEngine(); }
});
$("pagePicker").addEventListener("change", (event) => {
  state.page = Number(event.target.value);
  renderResult();
});
document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => {
  state.tab = button.dataset.tab;
  renderResult();
}));
$("downloadMd").addEventListener("click", () => {
  if (state.result) downloadFile(state.result.markdown || "", "billy-output.md", "text/markdown;charset=utf-8");
});
$("downloadJson").addEventListener("click", () => {
  if (state.result) downloadFile(JSON.stringify(state.result, null, 2), "billy-output.json", "application/json;charset=utf-8");
});
window.addEventListener("beforeunload", discardPreview);
connectEngine();
