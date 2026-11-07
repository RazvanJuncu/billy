/* Billy offline scanner shell. OCR remains a separately connected backend. */
const CACHE = "billydpi-orbit-v23-visual-feedback";
const ASSETS = ["./","./index.html","./styles.css","./brand.css","./billydpi-logo.svg","./upload-new-mark.svg","./review.css","./vision-regions.css","./accounts.css","./document-type.css","./simple.css","./quickscan.css","./quickscan.js","./snap.css","./snap.webmanifest","./install.html","./install.css","./install.js","./simple.js","./preloader.css","./preloader.js","./account-config.js","./accounts.js","./vision-regions.js","./vision-review.js","./app.js","./workspace.js","./scanner.js","./perspective.js","./manifest.webmanifest","./favicon.svg","./icon-192.png","./icon-512.png"];
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
  const critical = /\/(?:simple\.css|simple\.js|quickscan\.css|quickscan\.js|vision-regions\.css|vision-regions\.js|vision-review\.js|review\.css|app\.js|upload-new-mark\.svg)$/.test(path);
  event.respondWith(fetch(request,critical ? {cache:"no-store"} : undefined).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
    return response;
  }).catch(()=>caches.match(request,{ignoreSearch:true})));
});
