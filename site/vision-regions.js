/* Billy Vision: evidence overlays are AI-estimated, never proof of correctness.
   Feedback scores are historical agreement only once a team has >=20 reviews. */
(() => {
  "use strict";
  const PDFJS_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.mjs";
  const PDFJS_WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.worker.min.mjs";
  let pdfPromise = null;
  let teardown = null;

  function element(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function loadPdfjs() {
    if (pdfPromise) return pdfPromise;
    // Modern PDF.js ESM build includes security fixes missing in the legacy v3.
    pdfPromise = import(PDFJS_URL).then(lib => {
      lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      return lib;
    }).catch(error => {
      pdfPromise = null;
      throw Error("Secure PDF preview unavailable: " + (error.message || "network error"));
    });
    return pdfPromise;
  }

  const readable = path => path.replace(/\[([0-9]+)\]/g, (_, n) => " #" + (Number(n) + 1))
    .replace(/[_.]/g, " ").replace(/\b\w/g, value => value.toUpperCase());

  const safeRegion = item => {
    if (!item || typeof item.field_path !== "string" || !Array.isArray(item.box_2d) ||
        item.box_2d.length !== 4 || !Number.isInteger(item.page) ||
        item.page < 1 || item.page > 30) return false;
    const [y1, x1, y2, x2] = item.box_2d;
    return [y1,x1,y2,x2].every(n => Number.isInteger(n) && n >= 0 && n <= 1000) &&
      y2 > y1 && x2 > x1;
  };

  function mount({root, file, regions = [], agreement = {}}) {
    if (teardown) teardown();
    let stale = false;
    let sourceUrl = null;
    let pdf = null;
    let pageNumber = 1;
    let totalPages = 1;
    let selectedPath = null;
    const supported = Array.isArray(regions) ? regions.filter(safeRegion).slice(0,180) : [];
    const pdfInput = file && (file.type === "application/pdf" || /\.pdf$/i.test(file.name || ""));

    const panel = element("section","review-visual");
    const heading = element("div","review-visual-heading");
    const title = element("strong","","Document evidence");
    const subline = element("p","",
      "Boxes are AI-estimated positions, not verified OCR. Tap a region to correct its value.");
    heading.append(title, subline);
    panel.appendChild(heading);

    const caption = element("p","review-evidence-legend",
      "Confidence is not calibrated. % values, when available, are historical reviewer agreement for that field, not certainty about this page.");
    panel.appendChild(caption);

    const controls = element("div","review-evidence-pages");
    const previous = element("button","","Previous");
    const current = element("span","review-page-count","Page 1");
    const next = element("button","","Next");
    previous.type = next.type = "button";
    controls.append(previous,current,next);
    panel.appendChild(controls);

    const scroller = element("div","review-preview-scroll");
    const sheet = element("div","review-sheet");
    const imageSlot = element("div","review-sheet-image");
    const markers = element("div","review-sheet-markers");
    sheet.append(imageSlot,markers);
    scroller.appendChild(sheet);
    panel.appendChild(scroller);
    const status = element("p","review-preview-status","");
    panel.appendChild(status);

    const editor = element("div","review-evidence-editor");
    editor.hidden = true;
    const editorName = element("label","review-evidence-field-name");
    const correction = element("input","review-evidence-edit");
    correction.type = "text";
    correction.autocomplete = "off";
    editorName.appendChild(correction);
    const actions = element("div","review-evidence-edit-actions");
    const apply = element("button","","Apply correction");
    const cancel = element("button","","Cancel");
    apply.type = cancel.type = "button";
    actions.append(apply,cancel);
    editor.append(editorName,actions);
    panel.appendChild(editor);

    const regionsList = element("div","review-region-list");
    panel.appendChild(regionsList);
    const anchor = root.querySelector(".review-warnings");
    root.insertBefore(panel,anchor||root.firstChild);

    function target(path) {
      return Array.from(root.querySelectorAll("[data-evidence-path]"))
        .find(input => input.dataset.evidencePath === path);
    }
    function historyLabel(path) {
      const key = path.includes("[") ? path.split("[")[0] : path;
      const h = agreement && agreement[key];
      if (h && typeof h.percent === "number" && h.sample_size >= 20)
        return h.percent.toFixed(1).replace(/\.0$/, "") + "% prior agreement · n=" + h.sample_size;
      return "Not calibrated";
    }
    function openEditor(region) {
      const input = target(region.field_path);
      if (!input) {
        status.textContent = "This region is not linked to an editable field. Use the fields below.";
        return;
      }
      selectedPath = region.field_path;
      editorName.firstChild && editorName.firstChild.nodeType === Node.TEXT_NODE &&
        editorName.removeChild(editorName.firstChild);
      editorName.prepend(document.createTextNode(readable(region.field_path) + " · " + historyLabel(region.field_path)));
      correction.value = input.value || "";
      editor.hidden = false;
      markers.querySelectorAll(".review-region-marker").forEach(marker => {
        marker.classList.toggle("is-selected", marker.dataset.fieldPath === region.field_path);
      });
      correction.focus();
      editor.scrollIntoView({behavior:"smooth",block:"nearest"});
    }
    function paintMarkers() {
      markers.replaceChildren();
      regionsList.replaceChildren();
      const currentRegions = supported.filter(item => item.page === pageNumber && target(item.field_path));
      for (const region of currentRegions) {
        const [y1,x1,y2,x2] = region.box_2d;
        const button = element("button","review-region-marker");
        button.type = "button";
        button.dataset.fieldPath = region.field_path;
        button.style.top = y1 / 10 + "%";
        button.style.left = x1 / 10 + "%";
        button.style.width = (x2 - x1) / 10 + "%";
        button.style.height = (y2 - y1) / 10 + "%";
        button.title = readable(region.field_path) + " · " + historyLabel(region.field_path);
        button.setAttribute("aria-label", "Edit " + readable(region.field_path) + ". " + historyLabel(region.field_path));
        button.addEventListener("click",() => openEditor(region));
        markers.appendChild(button);

        const row = element("button","review-region-row");
        row.type = "button";
        const name = element("span","",readable(region.field_path));
        const metric = element("small","",historyLabel(region.field_path));
        row.append(name,metric);
        row.addEventListener("click",() => openEditor(region));
        regionsList.appendChild(row);
      }
      if (!currentRegions.length)
        regionsList.appendChild(element("p","review-no-regions",
          "No reliably localized editable fields on this page. Review the text fields below."));
    }
    function updateNav() {
      current.textContent = "Page " + pageNumber + " / " + totalPages;
      previous.disabled = pageNumber <= 1;
      next.disabled = pageNumber >= totalPages;
    }
    function clearSheet() {
      imageSlot.replaceChildren();
      markers.replaceChildren();
      editor.hidden = true;
      selectedPath = null;
    }

    async function renderPage() {
      clearSheet();
      updateNav();
      status.textContent = "Preparing document preview…";
      if (!file) {
        status.textContent = "Original file unavailable. Edit the extracted fields below.";
        return;
      }
      try {
        if (pdfInput) {
          if (!pdf) {
            const lib = await loadPdfjs();
            if (stale) return;
            const data = new Uint8Array(await file.arrayBuffer());
            pdf = await lib.getDocument({data, isEvalSupported:false, enableScripting:false}).promise;
            totalPages = Math.min(pdf.numPages, 30);
            updateNav();
          }
          const page = await pdf.getPage(pageNumber);
          if (stale) return;
          const natural = page.getViewport({scale:1});
          const viewport = page.getViewport({scale:Math.min(1.6, 760 / natural.width)});
          const canvas = element("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d",{alpha:false});
          if (!context) throw Error("Canvas unavailable.");
          await page.render({canvasContext:context,viewport}).promise;
          if (stale) return;
          imageSlot.replaceChildren(canvas);
        } else {
          if (!sourceUrl) sourceUrl = URL.createObjectURL(file);
          const img = element("img");
          img.alt = "Original scanned document";
          img.src = sourceUrl;
          await img.decode();
          if (stale) return;
          imageSlot.replaceChildren(img);
        }
        status.textContent = "";
        updateNav();
        paintMarkers();
      } catch (error) {
        status.textContent = "Preview unavailable: " + (error.message || "could not display this document") +
          ". Editable extracted fields remain below.";
        markers.replaceChildren();
      }
    }

    previous.addEventListener("click",()=>{if(pageNumber>1){pageNumber--;renderPage();}});
    next.addEventListener("click",()=>{if(pageNumber<totalPages){pageNumber++;renderPage();}});
    apply.addEventListener("click",()=>{
      if (!selectedPath) return;
      const input = target(selectedPath);
      if (input) {
        input.value = correction.value;
        input.dispatchEvent(new Event(input.tagName === "SELECT" ? "change" : "input",{bubbles:true}));
      }
      editor.hidden = true;
      selectedPath = null;
      paintMarkers();
    });
    cancel.addEventListener("click",()=>{editor.hidden=true;selectedPath=null;paintMarkers();});
    correction.addEventListener("keydown",event=>{
      if(event.key==="Enter"){event.preventDefault();apply.click();}
      else if(event.key==="Escape"){event.preventDefault();cancel.click();}
    });
    updateNav();
    renderPage();
    teardown = () => {
      stale = true;
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      if (pdf) pdf.destroy();
      panel.remove();
    };
  }
  window.BillyRegions = {mount, safeRegion};
})();
