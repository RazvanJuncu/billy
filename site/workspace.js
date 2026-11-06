/* Billy Document Studio — functional navigation for the full-screen instrument workspace.
   No server-side state, demo records, or fabricated OCR results are used here. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const body = document.body;
  const validViews = new Set(["capture","review","engine"]);
  let hasDocument = false;
  let hasOutput = false;

  function showView(view) {
    const next = validViews.has(view) ? view : "capture";
    body.dataset.view = next;
    const capture = next === "capture";
    const review = next === "review";
    const engine = next === "engine";
    for(const [id,active] of [
      ["railCapture",capture],["railReview",review],["railEngine",engine],
      ["desktopSource",!review],["desktopReview",review],
      ["mobileCaptureTab",capture],["mobileReviewTab",review],["mobileEngineTab",engine]
    ]) {
      const button=$(id);
      if(!button) continue;
      button.classList.toggle("is-active",active);
      if(button.classList.contains("view-tab")) button.setAttribute("aria-pressed",String(active));
      if(button.classList.contains("mobile-tab")) {
        if(active) button.setAttribute("aria-current","page");
        else button.removeAttribute("aria-current");
      }
    }
    $("stageEyebrow").textContent = review ? "EXTRACTED TEXT" : "WORKSPACE";
    if (next === "engine" && matchMedia("(max-width: 720px)").matches) {
      $("studioInspector").scrollTop=0;
    }
  }

  function displayFile(file) {
    if(!file) return;
    hasDocument = true;
    hasOutput = false;
    body.classList.add("has-document");
    $("stageDocumentName").textContent = file.name.toUpperCase();
    $("mobileFileActions").hidden=false;
    $("mobileFixButton").hidden=$("fixPerspective").hidden;
    showView("capture");
  }

  function displayResult() {
    hasOutput = true;
    showView("review");
  }

  function openEngine() {
    showView("engine");
    $("settings").open=true;
  }

  function trigger(id) {
    $(id)?.click();
  }

  function bind(id,handler) {
    const node=$(id);
    if (!node) throw Error("Missing Billy workspace control: "+id);
    node.addEventListener("click",handler);
  }

  bind("railCapture",()=>showView("capture"));
  bind("railReview",()=>showView("review"));
  bind("railEngine",openEngine);
  bind("railCamera",()=>trigger("scanOpenCamera"));
  bind("railImport",()=>trigger("scanImportPhoto"));
  bind("topNew",()=>trigger("scanOpenCamera"));
  bind("desktopSource",()=>showView("capture"));
  bind("desktopReview",()=>showView("review"));
  bind("mobileCaptureTab",()=>showView("capture"));
  bind("mobileReviewTab",()=>showView("review"));
  bind("mobileEngineTab",()=>showView("engine"));
  bind("reviewConnect",openEngine);
  bind("mobileFixButton",()=>trigger("fixPerspective"));
  bind("mobileReadButton",()=>{
    showView("engine");
    trigger("scanButton");
  });
  window.addEventListener("billy:document-loaded",event=>displayFile(event.detail?.file));
  window.addEventListener("billy:ocr-ready",displayResult);

  showView("capture");
  window.BillyWorkspace = {showView, getState:()=>({view:body.dataset.view,hasDocument,hasOutput})};
})();
