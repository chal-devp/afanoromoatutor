const C="oromo-v1",FILES=["/","/index.html","/app.js","/config.js","/lessons.json","/sentences.json","/privacy.html","/delete-account.html","/manifest.json"];
self.addEventListener("install",e=>e.waitUntil(caches.open(C).then(c=>c.addAll(FILES))));
self.addEventListener("fetch",e=>{
  if(e.request.url.includes("/api/")||e.request.method!=="GET"||new URL(e.request.url).origin!==location.origin)return;
  e.respondWith(fetch(e.request).then(r=>{const k=r.clone();caches.open(C).then(c=>c.put(e.request,k));return r}).catch(()=>caches.match(e.request)));
});
