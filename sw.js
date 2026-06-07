const C = 'wow-wear-v5';
const SHELL = ['/'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks =>
      Promise.all(ks.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;

  if (url.includes('connect.facebook.net') || url.includes('analytics.tiktok.com')) return;

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match('/').then(r => r || Response.error())
      )
    );
    return;
  }

  if (url.includes('script.google.com')) {
    e.respondWith(
      fetch(e.request).catch(() => Response.error())
    );
    return;
  }

  if (/\.(css|js|png|jpg|jpeg|webp|svg|ico|woff2?)(\?|$)/.test(url)) {
    e.respondWith(
      caches.open(C).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) {
            fetch(e.request).then(res => { if (res && res.ok) cache.put(e.request, res.clone()); }).catch(() => {});
            return cached;
          }
          return fetch(e.request).then(res => {
            if (res && res.ok) cache.put(e.request, res.clone());
            return res;
          }).catch(() => Response.error());
        })
      )
    );
    return;
  }
});

self.addEventListener('push', e => {
  let data = { title: 'WOW.WEAR', body: 'Нові товари вже в каталозі 👗', icon: '/icon-192.png', badge: '/icon-192.png', tag: 'wow-wear', url: '/' };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body, icon: data.icon, badge: data.badge,
      tag: data.tag, data: { url: data.url }, vibrate: [100, 50, 100],
      actions: [{ action: 'open', title: '👗 Переглянути' }, { action: 'dismiss', title: 'Закрити' }],
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) { c.navigate(url); return c.focus(); }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
