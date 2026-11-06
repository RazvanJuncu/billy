/* Billy offline scanner shell. OCR remains a separately connected backend. */
const CACHE = "billy-studio-obsidian-v06";
const ASSETS = ["./","./index.html","./styles.css","./brand.css","./app.js","./workspace.js","./scanner.js","./perspective.js","./manifest.webmanifest","./favicon.svg","./icon-192.png","./icon-512.png"];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("billy-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET" || new URL(request.url).origin!==self.location.origin) return;
  if(request.mode==="navigate") {
    event.respondWith(fetch(request).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put("./index.html",copy));}
      return response;
    }).catch(()=>caches.match("./index.html")));
    return;
  }
  // Network-first keeps new app releases fresh; cached files remain usable offline.
  event.respondWith(fetch(request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
    return response;
  }).catch(()=>caches.match(request,{ignoreSearch:true})));
});
