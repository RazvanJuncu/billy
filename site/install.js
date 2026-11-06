/* Billy installation: same app on desktop and phone; QR contains no secrets.
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
      title:"Add Billy to iPhone or iPad",
      subtitle:"Use Safari to add the same Billy to your Home Screen.",
      help:"On iOS, use the Safari Share menu. If Add to Home Screen is missing, check the additional Share actions.",
      steps:[
        "Open this guide in Safari. If you are in another app's browser, use Open in Safari first.",
        "Tap Open Billy below so Safari shows the Billy homepage.",
        "Tap Share, then Add to Home Screen. Enable Open as Web App if offered.",
        "Tap Add. Launch Billy from your Home Screen, sign in, and use Upload New."
      ]
    },
    android: {
      label:"Android / Samsung detected",
      title:"Install Billy on Android",
      subtitle:"Chrome or Samsung Internet recommended.",
      help:"If a direct install option does not appear here, open the Billy homepage and add it from your browser menu.",
      steps:[
        "Open this page in Chrome or Samsung Internet.",
        "If Install Billy is shown below, tap it and confirm.",
        "Otherwise tap Open Billy, open the browser menu and choose Install app or Add to Home screen.",
        "Launch Billy from your Home Screen and sign in once."
      ]
    },
    huawei: {
      label:"Huawei detected",
      title:"Add Billy on Huawei",
      subtitle:"Huawei Browser can create a Home Screen shortcut.",
      help:"Depending on your Huawei browser version, you may get a shortcut instead of a standalone web app.",
      steps:[
        "Open this guide in Huawei Browser.",
        "Tap Open Billy to open the main Billy homepage.",
        "Use the browser menu to choose Add to Home screen (wording may vary).",
        "Open the Billy icon on your Home Screen. Sign in to your approved team."
      ]
    },
    desktop: {label:"Desktop detected"}
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
    $("feedback").textContent="Billy installed. Open it from your Home Screen.";
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
        ? "Installation confirmed. Find Billy on your device."
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

  // iOS can pin the install guide itself. Always launch the main Billy app instead.
  if (window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true) {
    location.replace("./");
  }
})();
