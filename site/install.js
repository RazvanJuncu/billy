/* Billy Crew setup: platform-aware instructions; QR is local and contains no secrets.
   The matrix is a pre-generated, error-corrected QR for PUBLIC_INSTALL_URL.
   It must be regenerated whenever the public installation URL changes. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const PUBLIC_INSTALL_URL = "https://razvanjuncu.github.io/billy/install.html";
  const QR_ROWS = [
    "1fce8f27f","1045f9841","17589f95d","17525155d","175dac65d","105df5541",
    "1fd55557f","001260a00","17c4e877c","0a2c13a6d","05ef34d16","1f2463adc",
    "14de0659b","1f11713cb","0576421f6","028bd78dc","18f88a6b9","1e2c1e6ed",
    "00d269db6","0033ddf3e","15d6117b9","1b236ca41","14e875d0e","173f64c74",
    "15e0e97f0","001d43315","1fc0e5f56","105ac2b1d","1752e49f8","175fb139b",
    "175c82568","10459381c","1fd50a7a2"
  ];
  let deferredInstallPrompt = null;
  let currentPlatform = null;

  function makeQR() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox","0 0 41 41");
    svg.setAttribute("aria-hidden","true");
    svg.setAttribute("shape-rendering","crispEdges");
    for (let y = 0; y < QR_ROWS.length; y++) {
      const bits = BigInt("0x" + QR_ROWS[y]).toString(2).padStart(33,"0");
      for (let x = 0; x < bits.length; x++) {
        if (bits[x] !== "1") continue;
        const rect = document.createElementNS("http://www.w3.org/2000/svg","rect");
        rect.setAttribute("x",String(x + 4));
        rect.setAttribute("y",String(y + 4));
        rect.setAttribute("width","1");
        rect.setAttribute("height","1");
        rect.setAttribute("fill","#050607");
        svg.appendChild(rect);
      }
    }
    $("qrCode").replaceChildren(svg);
  }

  function detectPlatform() {
    const ua = navigator.userAgent || "";
    const platform = navigator.userAgentData?.platform || navigator.platform || "";
    if (/iphone|ipad|ipod/i.test(ua) || (platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
    if (/huawei|honor|harmonyos|emui/i.test(ua)) return "huawei";
    if (/android/i.test(ua)) return "android";
    if (/win|mac|linux|x11|cros/i.test(platform + " " + ua)) return "desktop";
    return "desktop";
  }

  const guides = {
    ios: {
      label:"iPhone / iPad detected",
      title:"Install on iPhone or iPad",
      subtitle:"Add Billy Crew from your browser.",
      help:"iPhone does not support a one-tap web installation prompt. The app can be added to your Home Screen.",
      steps:[
        "Open this installation page in Safari on your iPhone or iPad.",
        "Open the Safari Share menu, then choose Add to Home Screen.",
        "Turn on Open as Web App (when offered), then tap Add.",
        "Launch Billy Crew from your Home Screen and sign in once."
      ]
    },
    android: {
      label:"Android detected",
      title:"Install on Android",
      subtitle:"Chrome or Samsung Internet recommended.",
      help:"If a direct install prompt is unavailable, open the browser menu and choose Install app or Add to Home screen.",
      steps:[
        "Open this page in Chrome or Samsung Internet.",
        "Tap Install Billy Crew if the button appears, or use the browser menu.",
        "Confirm Install app or Add to Home screen.",
        "Open Billy Crew from your launcher and sign in once."
      ]
    },
    huawei: {
      label:"Huawei detected",
      title:"Add Billy Crew on Huawei",
      subtitle:"Huawei Browser supported as a shortcut.",
      help:"On some Huawei versions this installs a Home Screen shortcut, rather than a standalone PWA. The document capture workflow is still available.",
      steps:[
        "Open this page in Huawei Browser.",
        "Open the browser menu, then select Add to Home screen (wording varies by version).",
        "Confirm the shortcut and open Billy Crew from your Home Screen.",
        "Sign in to your approved BillyDPI team."
      ]
    },
    desktop: {label:"Desktop computer detected"}
  };

  function presentPlatform(selected) {
    currentPlatform = selected;
    const guide = guides[selected] || guides.desktop;
    $("detectedLabel").textContent = guide.label;
    $("desktopGuide").hidden = selected !== "desktop";
    $("mobileGuide").hidden = selected === "desktop";
    if (selected === "desktop") return;

    $("deviceTitle").textContent = guide.title;
    $("deviceSubtitle").textContent = guide.subtitle;
    $("deviceIcon").textContent = selected === "ios" ? "◉" : "▣";
    const steps = $("steps");
    steps.replaceChildren();
    for (const line of guide.steps) {
      const li = document.createElement("li");
      li.textContent = line;
      steps.appendChild(li);
    }
    $("installHelp").textContent = guide.help;
    $("installButton").hidden = !deferredInstallPrompt;
  }

  window.addEventListener("beforeinstallprompt",event=>{
    event.preventDefault();
    deferredInstallPrompt = event;
    if(currentPlatform && currentPlatform !== "desktop"){
      $("installButton").hidden=false;
    }
  });

  window.addEventListener("appinstalled",()=>{
    deferredInstallPrompt = null;
    $("installButton").hidden=true;
    $("feedback").textContent="Billy Crew installed. Open it from your Home Screen.";
  });

  $("installButton").addEventListener("click",async()=>{
    const prompt = deferredInstallPrompt;
    if (!prompt) return;
    deferredInstallPrompt = null;
    $("installButton").hidden=true;
    try {
      await prompt.prompt();
      const choice=await prompt.userChoice;
      $("feedback").textContent = choice.outcome === "accepted"
        ? "Installation confirmed. Find Billy Crew on your device."
        : "Installation canceled. You can still follow the browser instructions above.";
    } catch {
      $("feedback").textContent = "The install prompt could not open. Follow the browser instructions above.";
    }
  });

  $("copyLink").addEventListener("click",async()=>{
    try{
      await navigator.clipboard.writeText(PUBLIC_INSTALL_URL);
      $("feedback").textContent="Installation link copied.";
    }catch{
      $("feedback").textContent="Copy the public link shown above, or scan the QR code.";
    }
  });

  $("platformChoice").addEventListener("change",event=>{
    presentPlatform(event.target.value==="auto" ? detectPlatform() : event.target.value);
  });

  $("qrTarget").href=PUBLIC_INSTALL_URL;
  makeQR();
  presentPlatform(detectPlatform());

  // iOS may launch the pinned installation page rather than honoring manifest.start_url.
  // The standalone app must enter the camera workflow, never show installation instructions.
  if (window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true) {
    location.replace("./?crew=1");
  }
})();
