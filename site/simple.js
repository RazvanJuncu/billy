/* BillyDPI / Progressive workflow.
   Each action reveals only the next functional action. Nothing is uploaded to
   company storage or Excel until a real server-side connector is configured. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const body = document.body;
  const screens = ["home", "new", "uploaded", "edit", "process", "review", "upload"];
  const names = {new:"New Document",uploaded:"Uploaded Documents",edit:"Edit Document",process:"Process Document",review:"Review Document",upload:"Upload Document"};
  const sessionFiles = [];
  let activeFile = null;
  let approved = false;
  let firstName = "";
  let greetingIndex = -1;
  const greetings = [
    ["Welcome back, {name}.", "Your workspace is ready."],
    ["Good to see you, {name}.", "Let's get something done."],
    ["Ready to roll, {name}?", "One document at a time."],
    ["Look who's back, {name}.", "The document desk is open."],
    ["Back at it, {name}.", "Paperwork, meet your match."],
    ["New day, new docs, {name}.", "Let's keep it simple."],
    ["Hey, {name}. Ready?", "BillyDPI is ready too."],
    ["Smooth scanning ahead, {name}.", "Start wherever you like."],
    ["Time to tame some paperwork, {name}.", "You've got this."],
    ["Your desk is clear, {name}.", "For now."],
    ["Got paperwork, {name}?", "Let's sort it out."],
    ["Welcome aboard, {name}.", "Everything starts with a scan."],
    ["Another round, {name}?", "Let's keep things moving."],
    ["All set, {name}?", "A little less admin today."],
    ["Here we go again, {name}.", "Make it quick, make it clean."]
  ];

  function rotateGreeting() {
    if (!firstName || document.hidden || body.dataset.billyScreen !== "home") return;
    greetingIndex = (greetingIndex + 1) % greetings.length;
    const [headline, subline] = greetings[greetingIndex];
    const title = $("simpleGreetingTitle");
    const subtitle = $("simpleGreetingSubtitle");
    const setText = () => {
      title.textContent = headline.replace("{name}",firstName);
      subtitle.textContent = subline;
      title.classList.remove("is-changing");
      subtitle.classList.remove("is-changing");
    };
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setText();return;
    }
    title.classList.add("is-changing");
    subtitle.classList.add("is-changing");
    window.setTimeout(setText,180);
  }

  function announce(message) {
    $("simpleFlowNotice").textContent = message || "";
    $("simpleFlowNotice").hidden = !message;
  }

  function showScreen(name) {
    const next = screens.includes(name) ? name : "home";
    body.dataset.billyScreen = next;
    for (const section of screens) {
      const el = $("simple" + section.charAt(0).toUpperCase() + section.slice(1));
      if (el) el.hidden = section !== next;
    }
    $("simpleFlowHeader").hidden = next === "home";
    $("simpleFlowTitle").textContent = names[next] || "";
    $("simpleReviewToUpload").hidden = !(next === "review" && approved);
    if (next === "edit") window.BillyWorkspace?.showView("capture");
    if (next === "review") window.BillyWorkspace?.showView("review");
    if (next === "process" || next === "upload" || next === "new" || next === "uploaded" || next === "home") {
      window.BillyWorkspace?.showView("capture");
    }
    announce("");
    if (next === "home" && firstName && greetingIndex < 0) rotateGreeting();
    if (next === "uploaded") renderUploaded();
    if (next === "process") updateProcess();
    if (next === "upload") updateUpload();
    $("workspaceStage").scrollTop = 0;
  }

  function updateProcess() {
    const ready = Boolean(window.BillyApp?.isOnline());
    const action = $("simpleRunProcess");
    action.disabled = !ready;
    $("simpleProcessStatus").textContent = ready
      ? "Ready."
      : "Vision AI is not connected yet. Processing requires a secure server.";
  }

  function updateUpload() {
    const exportable = approved;
    $("simpleExportCsv").disabled = !exportable;
    $("simpleExportJson").disabled = !exportable;
    $("simpleUploadNote").textContent = exportable
      ? "Approved and saved in the pilot review log. Company Excel upload is not connected yet."
      : "Review and approve the document before exporting.";
  }

  function recordFile(file) {
    activeFile = file;
    approved = false;
    let record = sessionFiles.find(record => record.file === file);
    if (!record) {
      record = {file, status:"Not processed", documentType:$("documentType").value};
      sessionFiles.unshift(record);
    } else {
      record.status = "Not processed";
    }
    showScreen("edit");
  }

  function renderUploaded() {
    const list = $("simpleDocumentsList");
    list.replaceChildren();
    $("simpleDocumentsEmpty").hidden = sessionFiles.length > 0;
    $("simpleDocumentsIntro").textContent = sessionFiles.length
      ? "Files added in this browser session. They are not uploaded to company storage."
      : "No documents have been uploaded to company storage.";
    for (const item of sessionFiles) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "simple-document-item";
      const name = document.createElement("span");
      name.className = "simple-document-name";
      name.textContent = item.file.name;
      const status = document.createElement("span");
      status.className = "simple-document-status";
      status.textContent = item.status;
      button.append(name, status);
      button.addEventListener("click",() => {
        // Opening a session file starts another draft; never imply persistence.
        window.BillyApp?.openFile(item.file);
      });
      list.appendChild(button);
    }
  }

  function goBack() {
    const now = body.dataset.billyScreen;
    if (now === "edit") showScreen("new");
    else if (now === "process") showScreen("edit");
    else if (now === "review") showScreen("process");
    else if (now === "upload") showScreen("review");
    else showScreen("home");
  }

  function bind(id, fn) {
    const el = $(id);
    if (!el) throw Error("BillyDPI control missing: " + id);
    el.addEventListener("click", fn);
  }
  bind("simpleHomeButton", () => showScreen("home"));
  bind("simpleBack", goBack);
  bind("simpleNewDocument", () => showScreen("new"));
  bind("simpleUploadedDocuments", () => showScreen("uploaded"));
  bind("simpleCapture", () => $("scanOpenCamera").click());
  bind("simpleAddFiles", () => $("filePicker").click());
  bind("simpleContinue", () => showScreen("process"));
  bind("simpleRunProcess", () => {
    if (!window.BillyApp?.isOnline()) { updateProcess(); return; }
    $("simpleRunProcess").disabled = true;
    $("scanButton").click();
  });
  bind("simpleExportCsv", () => window.BillyReview?.exportCSV());
  bind("simpleExportJson", () => window.BillyReview?.exportJSON());
  bind("simpleReviewAgain", () => showScreen("review"));
  bind("simpleReviewToUpload", () => { if (approved) showScreen("upload"); });
  bind("simpleNewFromUpload", () => showScreen("new"));
  bind("simpleUploadedBackToHome", () => showScreen("home"));

  const addArea = $("simpleNew");
  addArea.addEventListener("dragover",event => {
    event.preventDefault();
    addArea.classList.add("simple-dragging");
  });
  addArea.addEventListener("dragleave",() => addArea.classList.remove("simple-dragging"));
  addArea.addEventListener("drop",event => {
    event.preventDefault();
    addArea.classList.remove("simple-dragging");
    const file = event.dataTransfer?.files?.[0];
    if (file) window.BillyApp?.acceptFile(file);
  });

  window.addEventListener("billy:document-loaded",event => {
    if (event.detail?.file) recordFile(event.detail.file);
  });
  window.addEventListener("billy:ocr-ready",() => {
    if (activeFile) {
      const rec = sessionFiles.find(item => item.file === activeFile);
      if (rec) rec.status = "Extracted · pending review";
    }
    $("simpleRunProcess").disabled = false;
    showScreen("review");
  });
  window.addEventListener("billy:process-complete",() => updateProcess());
  window.addEventListener("billy:engine-updated",() => { if (body.dataset.billyScreen === "process") updateProcess(); });
  window.addEventListener("billy:document-revised",() => {
    approved = false;
    const rec = sessionFiles.find(item => item.file === activeFile);
    if (rec) rec.status = "Not processed";
    if (body.dataset.billyScreen === "review" || body.dataset.billyScreen === "upload") showScreen("edit");
  });
  window.addEventListener("billy:account-ready",event => {
    const updated = String(event.detail?.firstName || "").trim().slice(0,32);
    if (updated && updated !== firstName) {
      firstName = updated;
      greetingIndex = -1;
      rotateGreeting();
    }
    if (body.dataset.billyScreen === "process") updateProcess();
  });
  // Re-read the name when the user returns to the tab. Avoid stacked timers.
  document.addEventListener("visibilitychange",()=>{
    if (!document.hidden && firstName && greetingIndex < 0) rotateGreeting();
  });
  window.setInterval(rotateGreeting,6500);
  window.addEventListener("billy:document-approved",() => {
    approved = true;
    const rec = sessionFiles.find(item => item.file === activeFile);
    if (rec) rec.status = "Approved in pilot";
    showScreen("upload");
  });

  showScreen("home");
  const existingName = window.BillyAccounts?.firstName?.();
  if (existingName && window.BillyAccounts?.active?.()) {
    firstName = existingName.slice(0,32);
    rotateGreeting();
  }
  window.BillySimple = {showScreen, getState:() => ({
    screen:body.dataset.billyScreen, sessionFiles:sessionFiles.length, approved
  })};
})();
