const scope = self.registration.scope
const cachePrefix = 'mpkpb-shell:' + scope + ':'
const cacheName = cachePrefix + '__BUILD_ID__'
const shell = new URL('./', scope).href
const appFiles = __APP_FILES__.map((file) => new URL(file, scope).href)
const assets = new Set(appFiles)

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) =>
    cache.addAll([shell, ...appFiles].map((url) => new Request(url, { cache: 'reload' }))),
  ))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith(cachePrefix) && key !== cacheName)
    .map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  const navigation = request.mode === 'navigate' && url.pathname === new URL(shell).pathname
  if (!navigation && !assets.has(url.href)) return
  event.respondWith(caches.open(cacheName).then(async (cache) =>
    await cache.match(navigation ? shell : url.href) ?? fetch(request),
  ))
})
