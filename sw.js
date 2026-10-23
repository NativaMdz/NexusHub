/* NexusOne - Service Worker (PWA)
   - Só intercepta arquivos do PRÓPRIO site. Firebase, fontes e CDNs passam direto (nunca ficam em cache).
   - Página: rede primeiro (sempre a versão mais nova); cópia guardada só como plano B sem internet.
   - Ícones: cache primeiro.
   Para forçar atualização do cache no futuro, basta mudar a VERSION. */
const VERSION = 'v3';
const CACHE = 'nexus-shell-' + VERSION;
const ICONS = ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

const OFFLINE_HTML = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>NexusOne</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#050507;color:#e6e6ee;font-family:sans-serif;text-align:center;padding:24px}'
    + 'h1{color:#00f3ff;letter-spacing:2px}p{color:#8b8b99}button{margin-top:16px;padding:12px 22px;border:none;border-radius:12px;background:linear-gradient(90deg,#00f3ff,#b026ff);color:#000;font-weight:700}</style></head>'
    + '<body><div><h1>NEXUS ONE</h1><p>Você está sem conexão.<br>Reconecte-se à internet para entrar na rede.</p><button onclick="location.reload()">Tentar de novo</button></div></body></html>';

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(caches.open(CACHE).then((c) => Promise.all(ICONS.map((i) => c.add(i).catch(() => {})))));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k.startsWith('nexus-shell-') && k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return; // Firebase, Google Fonts, CDNs: não mexe

    // Página: rede primeiro, cópia local só se estiver offline
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req).then((res) => {
                if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
                return res;
            }).catch(() =>
                caches.match(req, { ignoreSearch: true }).then((hit) =>
                    hit || new Response(OFFLINE_HTML, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
                )
            )
        );
        return;
    }

    // Ícones: cache primeiro
    if (/\.(png|ico)$/i.test(url.pathname)) {
        event.respondWith(
            caches.match(req).then((hit) => hit || fetch(req).then((res) => {
                if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
                return res;
            }))
        );
    }
});

// Toque na notificação: foca o app já aberto e pede para abrir a conversa; se estiver fechado, abre o site já na conversa
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const data = event.notification.data || {};
    event.waitUntil((async () => {
        const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const w of wins) {
            if ('focus' in w) {
                await w.focus();
                if (data.uid) w.postMessage({ type: 'open-chat', uid: data.uid });
                return;
            }
        }
        if (self.clients.openWindow) {
            const u = new URL(data.url || self.registration.scope);
            if (data.uid) u.searchParams.set('chat', data.uid);
            await self.clients.openWindow(u.href);
        }
    })());
});
