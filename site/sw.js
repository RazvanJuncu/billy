/* Billy offline scanner shell. OCR remains a separately connected backend. */
const CACHE = "billydpi-orbit-v76-multidoc3a";
const ASSETS = ["./","./index.html","./styles.css","./brand.css","./billydpi-logo.svg","./upload-new-mark.svg","./review.css","./excel-preview.css","./ramp-review.css","./vision-regions.css","./accounts.css","./document-type.css","./simple.css","./multi-documents.css","./scanner-enhance.css","./quickscan.css","./quickscan.js","./snap.css","./snap.webmanifest","./install.html","./install.css","./install.js","./simple.js","./documents-index.js","./documents-hub.js","./document-preview.js","./original-archive.js","./preloader.css","./preloader.js","./account-config.js","./accounts.js","./vision-regions.js","./vision-review.js","./excel-preview.js","./quickverify-crop.js","./ramp-review.js","./multi-documents.js","./app.js","./workspace.js","./scanner.js","./perspective.js","./manifest.webmanifest","./favicon.svg","./icon-192.png","./icon-512.png"];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith("billy-")||k.startsWith("billydpi-"))&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET" || new URL(request.url).origin!==self.location.origin) return;
  if(request.mode==="navigate") {
    // Keep offline install instructions separate from the application's main shell.
    const fallback = new URL(request.url).pathname.endsWith("/install.html") ? "./install.html" : "./index.html";
    // Force fresh HTML when online, even if iOS keeps an HTTP cache.
    event.respondWith(fetch(request,{cache:"no-store"}).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(fallback,copy));}
      return response;
    }).catch(()=>caches.match(fallback)));
    return;
  }
  // Network-first keeps new app releases fresh; cached files remain usable offline.
  const path = new URL(request.url).pathname;
  const critical = /\/(?:simple\.css|simple\.js|scanner\.js|scanner-enhance\.css|quickscan\.css|quickscan\.js|vision-regions\.css|vision-regions\.js|vision-review\.js|excel-preview\.js|excel-preview\.css|quickverify-crop\.js|ramp-review\.js|ramp-review\.css|review\.css|app\.js|upload-new-mark\.svg)$/.test(path);
  event.respondWith(fetch(request,critical ? {cache:"no-store"} : undefined).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
    return response;
  }).catch(()=>caches.match(request,{ignoreSearch:true})));
});
