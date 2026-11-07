"use strict";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg", "webp"]);
const $ = (id) => document.getElementById(id);
const state = {
  api: "",
  online: false,
  connecting: false,
  connectionError: "",
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
  const simple = $("simpleFlowNotice");
  if (simple) {
    simple.textContent = message;
    simple.hidden = !message;
  }
}

function apiAddress(value) {
  const url = new URL(value.trim());
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Use a plain OCR API address without login details, query parameters or fragments.");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Remote OCR services must use HTTPS. HTTP is only allowed for localhost.");
  }
  const address = url.origin + url.pathname.replace(/\/+$/, "");
  const official = window.BILLY_AUTH_CONFIG?.apiUrl;
  const local = ["localhost","127.0.0.1"].includes(url.hostname);
  // Session bearer tokens must never be sent to an arbitrary HTTPS server.
  if (!local && (!official || address !== official.replace(/\/+$/, ""))) {
    throw new Error("Only the official Billy Vision HTTPS endpoint may receive team sessions.");
  }
  return address;
}

function setStage(index) {
  const n = Math.max(0, Math.min(3, Number(index) || 0));
  document.querySelectorAll(".workflow-step").forEach((node) => {
    const step = Number(node.dataset.stage);
    node.classList.toggle("is-current", step === n);
    node.classList.toggle("is-complete", step < n);
    if (step === n) node.setAttribute("aria-current", "step");
    else node.removeAttribute("aria-current");
  });
}
window.addEventListener("billy:scanner-stage", (event) => {
  if (event.detail && typeof event.detail.stage === "number") setStage(event.detail.stage);
});

function updateScanButton() {
  const type = $("documentType").value;
  const validType = type === "invoice" || type === "fuel_release";
  $("scanButton").disabled = !state.file || !validType || state.busy;
  $("scanLabel").textContent = state.busy ? "Processing document…" :
    !state.file ? "Select a document first" :
    !validType ? "Choose document type first" :
    state.online ? "Extract with Vision AI" : "Connect Vision AI";
  $("ocrHint").textContent = !state.file
    ? "Capture an invoice or handwritten Fuel Release."
    : !validType ? "Select Invoice or Fuel Release before processing."
    : state.online
      ? "AI can extract the selected document. Human review is required."
      : "Document ready. Connect Vision to read this document.";
  $("ocrHint").classList.toggle("ready", state.online);
  $("ocrHint").classList.toggle("need-engine", !state.online);
}

async function connectEngine() {
  if (state.connecting) return;
  state.connecting = true;
  state.connectionError = "";
  window.dispatchEvent(new CustomEvent("billy:engine-updated"));
  const dot = $("statusDot");
  const label = $("statusText");
  const input = $("endpoint").value.trim() || window.BILLY_AUTH_CONFIG?.apiUrl || "";
  if (input) $("endpoint").value = input;
  if (!input) {
    state.online = false;
    state.api = "";
    dot.className = "status-dot offline";
    label.textContent = "Scanner ready · Vision AI not connected";
    state.connectionError = "Billy Vision endpoint is not configured.";
    state.connecting = false;
    updateScanButton();
    window.dispatchEvent(new CustomEvent("billy:engine-updated"));
    return;
  }
  state.online = false;
  dot.className = "status-dot";
  label.textContent = "Connecting to OCR engine…";
  updateScanButton();
  try {
    const address = apiAddress($("endpoint").value);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      const headers = await window.BillyAccounts.sessionHeaders();
      response = await fetch(address + "/api/vision/health", { signal: controller.signal, cache: "no-store", headers });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      let detail = "";
      try {
        const body = await response.json();
        if (typeof body?.detail === "string") detail = body.detail.slice(0, 180);
      } catch {}
      throw new Error("Vision backend HTTP " + response.status + (detail ? ": " + detail : ""));
    }
    const payload = await response.json();
    if (payload.status !== "online") throw new Error("Unexpected response from OCR service");
    state.api = address;
    state.online = Boolean(payload.configured);
    if (!state.online) state.connectionError = "Gemini API key not detected by Billy cloud backend.";
    dot.className = state.online ? "status-dot online" : "status-dot offline";
    label.textContent = state.online ? "Vision configured · " + payload.model : "Vision server online · API key missing";
    $("settings").open = !state.online;
    showNotification(state.online ? "" : "Vision server is running, but GEMINI_API_KEY is not configured on the server.");
  } catch (error) {
    state.online = false;
    state.connectionError = error?.name === "AbortError"
      ? "Gemini connection timed out. Retry."
      : String(error?.message || "Could not reach Billy Vision.");
    dot.className = "status-dot offline";
    label.textContent = "Gemini disconnected · " + state.connectionError;
    showNotification("Gemini connection: " + state.connectionError, true);
  } finally {
    state.connecting = false;
  }
  updateScanButton();
  window.dispatchEvent(new CustomEvent("billy:engine-updated"));
}

function discardPreview() {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = null;
}

function selectFile(file) {
  if (!file) return;
  const extension = (file.name.split(".").pop() || "").toLowerCase();
  if (!ACCEPTED_EXTENSIONS.has(extension)) {
    showNotification("Vision accepts PDF, PNG, JPG or WebP files.", true);
    return;
  }
  if (file.size === 0 || file.size > MAX_FILE_BYTES) {
    showNotification("Choose a non-empty document no larger than 10 MiB.", true);
    return;
  }
  $("documentType").value = ""; // New file, new explicit classification.
  state.file = file;
  setStage(2);
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
  } else if (["jpg", "jpeg", "png", "webp"].includes(extension)) {
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
  $("fixPerspective").hidden = extension === "pdf";
  document.querySelector(".result-panel")?.classList.remove("has-results");
  $("resultToolbar").hidden = true;
  $("outputFooter").hidden = true;
  $("outputPlaceholder").hidden = false;
  $("formattedOutput").hidden = true;
  $("rawOutput").hidden = true;
  updateScanButton();
  showNotification("");
  window.dispatchEvent(new CustomEvent("billy:document-loaded", {detail:{file}}));
}

function handlePhotoOrDocument(file) {
  if(!file) return;
  const ext=(file.name.split(".").pop()||"").toLowerCase();
  if (["jpg","jpeg","png","webp","bmp","tif","tiff","heic","heif"].includes(ext) && window.BillyScanner) {
    window.BillyScanner.editFile(file);
  } else {
    selectFile(file);
  }
}
function fileInputHandler() {
  handlePhotoOrDocument($("filePicker").files[0]);
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
  setStage(3);
  document.querySelector(".result-panel")?.classList.add("has-results");
  $("outputPlaceholder").hidden = true;
  $("resultToolbar").hidden = true;
  $("outputFooter").hidden = true;
  $("rawOutput").hidden = true;
  $("formattedOutput").hidden = false;
  if (!window.BillyReview) throw new Error("Billy Review is unavailable.");
  window.BillyReview.render(state.result, state.api, () => window.BillyAccounts.sessionHeaders(), state.file);
}

async function scanInvoice() {
  if (!state.file || state.busy) return;
  if (!["invoice","fuel_release"].includes($("documentType").value)) {
    showNotification("Choose Invoice or Fuel Release before processing this document.",true);
    return;
  }
  if (!state.online) {
    $("settings").open = true;
    window.BillyWorkspace?.showView("engine");
    $("settings").scrollIntoView({behavior:"smooth",block:"nearest"});
    $("endpoint").focus({preventScroll:true});
    showNotification("Invoice ready. Connect a Vision server in Engine settings to extract the invoice.");
    return;
  }
  state.busy = true;
  window.BillyLoader?.startWork("ai","Processing document");
  setStage(2);
  updateScanButton();
  showNotification("BillyDPI Vision is extracting structured data. Excel will not be modified.");
  const currentFile = state.file;
  const form = new FormData();
  form.append("file", currentFile, currentFile.name);
  form.append("document_type", $("documentType").value);
  try {
    const headers = await window.BillyAccounts.sessionHeaders();
    const response = await fetch(state.api + "/api/vision/extract", { method: "POST", body: form, headers });
    const responseBody = await response.json();
    if (!response.ok) throw new Error(responseBody.detail || ("HTTP " + response.status));
    if (!(responseBody.invoice || responseBody.fuel_release) || !responseBody.extraction_id) throw new Error("Vision returned no reviewable document.");
    if (state.file !== currentFile) return;
    state.result = responseBody;
    state.page = 0;
    state.tab = "document";
    renderResult();
    window.dispatchEvent(new CustomEvent("billy:ocr-ready", {detail:{model:responseBody.model}}));
    showNotification(""); // Review screen and colored fields already communicate the next action.
  } catch (error) {
    showNotification("Could not scan this document: " + (error.message || "Connection error"), true);
  } finally {
    state.busy = false;
    window.BillyLoader?.endWork("ai");
    updateScanButton();
    window.dispatchEvent(new CustomEvent("billy:process-complete"));
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
  handlePhotoOrDocument(event.dataTransfer.files[0]);
});
$("scanButton").addEventListener("click", scanInvoice);
$("documentType").addEventListener("change", () => {
  state.result = null;
  $("outputPlaceholder").hidden = false;
  $("formattedOutput").hidden = true;
  $("rawOutput").hidden = true;
  document.querySelector(".result-panel")?.classList.remove("has-results");
  setStage(state.file ? 2 : 0);
  updateScanButton();
  showNotification("");
  window.dispatchEvent(new CustomEvent("billy:document-revised"));
});
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
window.BillyScanner?.init({
  onUse: file => {
    // QuickScan collects multiple camera captures before creating one document.
    if (!window.BillyQuickScan?.acceptPage?.(file)) selectFile(file);
  },
  getSource: () => state.file
});
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // Revalidate the offline shell on every launch, even when iOS holds an older PWA cache.
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
      .then(registration => registration.update())
      .catch(() => {});
  });
}
$("statusDot").className = "status-dot offline";
$("statusText").textContent = "Sign in to connect Vision AI";
updateScanButton();
setStage(0);
window.addEventListener("billy:account-ready", () => {
  const endpoint = window.BILLY_AUTH_CONFIG?.apiUrl ||
    (["localhost","127.0.0.1"].includes(location.hostname) ? "http://127.0.0.1:8000" : "");
  if(endpoint) {
    $("endpoint").value = endpoint;
    connectEngine();
  } else {
    $("statusText").textContent = "Team signed in · Vision server not connected";
  }
});

/* Public local-only UI actions for the progressively disclosed document flow.
   No backend keys or elevated access are provided here. */
window.BillyApp = {
  isOnline: () => state.online,
  visionStatus: () => ({online: state.online, connecting: state.connecting, error: state.connectionError}),
  connectVision: () => {
    if (!window.BillyAccounts?.active?.()) {
      state.connectionError = "Sign in to a Billy organization before connecting Gemini.";
      window.dispatchEvent(new CustomEvent("billy:engine-updated"));
      return;
    }
    return connectEngine();
  },
  hasDocument: () => Boolean(state.file),
  openFile: selectFile,
  acceptFile: handlePhotoOrDocument
};
