/* Billy / QuickScan multipage session.
   Pages stay on the user's device until they deliberately choose Finish & Process.
   PDF assembly uses pdf-lib 1.17.1; no direct document upload is performed here. */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
  const MAX_PAGES = 30;
  const pages = [];
  let active = false;
  let busy = false;
  let nextId = 1;

  const isPdf = file => file?.type === "application/pdf" || /\.pdf$/i.test(file?.name || "");
  const isImage = file => /^image\//i.test(file?.type || "") ||
    /\.(?:jpg|jpeg|png|webp|heic|heif)$/i.test(file?.name || "");

  function message(text, error = false) {
    const el = $("quickscanMessage");
    el.textContent = text || "";
    el.hidden = !text;
    el.classList.toggle("is-error", error);
  }

  function pageButton(label, action, disabled = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quickscan-page-control";
    button.textContent = label;
    button.setAttribute("aria-label", label);
    button.disabled = disabled;
    button.addEventListener("click", action);
    return button;
  }

  function countLabel() {
    return pages.length === 1 ? "1 page captured" : pages.length + " pages captured";
  }

  function render() {
    $("quickscanSession").hidden = !active;
    $("quickscanCameraTools").hidden = !active;
    if (!active) return;
    $("quickscanCount").textContent = countLabel();
    $("quickscanEmpty").hidden = pages.length !== 0;
    const list = $("quickscanPages");
    list.replaceChildren();
    pages.forEach((item, index) => {
      const card = document.createElement("li");
      card.className = "quickscan-page";
      const preview = document.createElement("div");
      preview.className = "quickscan-page-preview";
      if (item.kind === "image") {
        const image = document.createElement("img");
        image.src = item.url;
        image.alt = "Preview of page " + (index + 1);
        image.loading = "lazy";
        preview.appendChild(image);
      } else {
        const mark = document.createElement("span");
        mark.className = "quickscan-pdf-mark";
        mark.textContent = "PDF";
        const source = document.createElement("small");
        source.textContent = "p. " + (item.pageIndex + 1);
        preview.append(mark, source);
      }
      const label = document.createElement("div");
      label.className = "quickscan-page-label";
      const title = document.createElement("strong");
      title.textContent = "Page " + (index + 1);
      const description = document.createElement("small");
      description.textContent = item.kind === "image" ? "Photo" :
        (item.file.name.length > 26 ? item.file.name.slice(0, 23) + "..." : item.file.name);
      label.append(title, description);

      const controls = document.createElement("div");
      controls.className = "quickscan-page-controls";
      controls.append(
        pageButton("Move up", () => move(index, -1), index === 0 || busy),
        pageButton("Move down", () => move(index, 1), index === pages.length - 1 || busy),
        pageButton("Remove", () => remove(index), busy)
      );
      card.append(preview, label, controls);
      list.appendChild(card);
    });
    $("quickscanFinish").disabled = !pages.length || busy;
    $("quickscanAddCamera").disabled = busy || pages.length >= MAX_PAGES;
    $("quickscanImportButton").disabled = busy || pages.length >= MAX_PAGES;
  }

  function move(index, direction) {
    const next = index + direction;
    if (busy || next < 0 || next >= pages.length) return;
    const [item] = pages.splice(index, 1);
    pages.splice(next, 0, item);
    render();
  }

  function remove(index) {
    if (busy || !pages[index]) return;
    const [item] = pages.splice(index, 1);
    if (item.url) URL.revokeObjectURL(item.url);
    message("");
    render();
  }

  function clearPages() {
    for (const item of pages) if (item.url) URL.revokeObjectURL(item.url);
    pages.length = 0;
  }

  function close() {
    active = false;
    busy = false;
    clearPages();
    message("");
    render();
  }

  function cancel() {
    if (busy) return;
    if (pages.length && !window.confirm("Discard the " + countLabel() + "?")) return;
    window.BillyScanner?.close?.();
    close();
  }

  function begin() {
    if (!window.BillyAccounts?.active?.()) return;
    if (!active) {
      clearPages();
      active = true;
      message("");
    }
    render();
    window.BillyScanner?.startCamera?.();
  }

  function addCamera() {
    if (busy || pages.length >= MAX_PAGES) return;
    window.BillyScanner?.startCamera?.();
  }

  function acceptPage(file) {
    if (!active) return false;
    if (!file || !isImage(file)) {
      message("Only a photo can be added here. Import PDFs with Import PDF / photo.", true);
      return true;
    }
    if (pages.length >= MAX_PAGES) {
      message("A QuickScan can contain up to " + MAX_PAGES + " pages.", true);
      return true;
    }
    if (!file.size || file.size > MAX_DOCUMENT_BYTES) {
      message("This photo is too large. Maximum: 10 MiB.", true);
      return true;
    }
    pages.push({id:nextId++, kind:"image", file, url:URL.createObjectURL(file)});
    message("");
    render();
    return true;
  }

  async function addPdf(file) {
    if (!file.size || file.size > MAX_DOCUMENT_BYTES)
      throw Error("Choose a PDF no larger than 10 MiB.");
    const API = window.PDFLib?.PDFDocument;
    if (!API) {
      if (pages.length) throw Error("PDF assembly needs an internet connection to load the PDF tools.");
      // A complete imported PDF can still be passed through Billy unchanged.
      pages.push({id:nextId++,kind:"pdf-direct",file,pageIndex:0});
      message("PDF import ready. Page splitting is unavailable offline; you can process this file as-is.");
      return;
    }
    const pdf = await API.load(await file.arrayBuffer());
    const pageCount = pdf.getPageCount();
    if (!pageCount) throw Error("This PDF has no pages.");
    if (pageCount + pages.length > MAX_PAGES)
      throw Error("The PDF contains " + pageCount + " pages; QuickScan supports up to " + MAX_PAGES + " in total.");
    const source = {file, pdf, pageCount};
    for (let i = 0; i < pageCount; i++)
      pages.push({id:nextId++,kind:"pdf",file,source,pageIndex:i});
  }

  async function importChosen(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !active || busy) return;
    if (pages.length >= MAX_PAGES) {
      message("Maximum " + MAX_PAGES + " pages per document.",true);
      return;
    }
    if (isImage(file)) {
      window.BillyScanner?.editFile?.(file);
      return;
    }
    if (!isPdf(file)) {
      message("Choose a PDF or image (JPG, PNG, WebP).", true);
      return;
    }
    busy = true;
    render();
    message("Reading PDF pages...");
    try {
      await addPdf(file);
      if (window.PDFLib?.PDFDocument) message("");
    } catch (error) {
      message(error.message || "Could not read this PDF.", true);
    } finally {
      busy = false;
      render();
    }
  }

  function importFile() {
    if (!active || busy) return;
    $("quickscanImportInput").click();
  }

  function importFromCamera() {
    if (!active || busy) return;
    window.BillyScanner?.close?.();
    importFile();
  }

  async function embeddedImage(output, file, compact = false) {
    const type = file.type.toLowerCase();
    if (!compact && (type === "image/jpeg" || /\.jpe?g$/i.test(file.name)))
      return output.embedJpg(await file.arrayBuffer());
    if (!compact && (type === "image/png" || /\.png$/i.test(file.name)))
      return output.embedPng(await file.arrayBuffer());

    // Normalize iPhone / WebP imports and optionally compress large camera scans.
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const ratio = Math.min(1, (compact ? 1850 : 2600) / Math.max(image.naturalWidth,image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1,Math.round(image.naturalWidth * ratio));
      canvas.height = Math.max(1,Math.round(image.naturalHeight * ratio));
      const context = canvas.getContext("2d");
      if (!context) throw Error("Could not prepare this image.");
      context.fillStyle = "#fff";
      context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(image,0,0,canvas.width,canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve,"image/jpeg",compact ? .72 : .88));
      canvas.width = canvas.height = 0;
      if (!blob) throw Error("Could not convert this image to JPEG.");
      return output.embedJpg(await blob.arrayBuffer());
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function assemble(compact = false) {
    const API = window.PDFLib?.PDFDocument;
    if (!API) throw Error("PDF tools could not load. Connect to the internet and retry.");
    const output = await API.create();
    for (const item of pages) {
      if (item.kind === "pdf-direct") throw Error("Reconnect to combine an imported PDF with other pages.");
      if (item.kind === "pdf") {
        const [page] = await output.copyPages(item.source.pdf,[item.pageIndex]);
        output.addPage(page);
      } else {
        const image = await embeddedImage(output,item.file,compact);
        const multiplier = Math.min(1, 842 / Math.max(image.width,image.height));
        const width = Math.max(1,image.width * multiplier);
        const height = Math.max(1,image.height * multiplier);
        const page = output.addPage([width,height]);
        page.drawImage(image,{x:0,y:0,width,height});
      }
    }
    return output.save({useObjectStreams:true});
  }

  function directlyImportedPdf() {
    if (pages.length === 1 && pages[0].kind === "pdf-direct") return pages[0].file;
    const first = pages[0];
    if (!first || first.kind !== "pdf") return null;
    if (first.source.pageCount !== pages.length) return null;
    if (pages.every((item,index) => item.kind === "pdf" &&
      item.source === first.source && item.pageIndex === index)) return first.file;
    return null;
  }

  async function finish() {
    if (busy || !pages.length) return;
    busy = true;
    render();
    message("Preparing your document...");
    try {
      let result = directlyImportedPdf();
      if (!result && pages.length === 1 && pages[0].kind === "image")
        result = pages[0].file;
      if (!result) {
        let data = await assemble(false);
        if (data.length > MAX_DOCUMENT_BYTES && pages.every(item => item.kind === "image"))
          data = await assemble(true);
        if (data.length > MAX_DOCUMENT_BYTES)
          throw Error("Combined PDF exceeds 10 MiB. Remove pages or import a smaller PDF.");
        result = new File([data],"billy-quickscan-" + Date.now() + ".pdf",{type:"application/pdf"});
      }
      close();
      window.BillyApp?.openFile?.(result);
      // Only process when the authorized Vision endpoint is actually connected.
      if (window.BillyApp?.isOnline?.()) {
        window.BillySimple?.showScreen?.("process");
        $("simpleRunProcess")?.click();
      } else {
        window.BillySimple?.showScreen?.("edit");
      }
    } catch (error) {
      message(error.message || "Could not create the document.",true);
    } finally {
      busy = false;
      render();
    }
  }

  $("quickscanCancel").addEventListener("click",cancel);
  $("quickscanAddCamera").addEventListener("click",addCamera);
  $("quickscanImportButton").addEventListener("click",importFile);
  $("quickscanCameraImport").addEventListener("click",importFromCamera);
  $("quickscanImportInput").addEventListener("change",importChosen);
  $("quickscanFinish").addEventListener("click",finish);
  document.addEventListener("keydown",event => {
    if (active && event.key === "Escape" && $("scannerOverlay").hidden) cancel();
  });
  window.BillyQuickScan = {begin,acceptPage,isActive:() => active,getCount:() => pages.length};
})();
