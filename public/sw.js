// Service worker: shows reminders. The push itself carries no text; the words are fetched from the app.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let note = { title: 'All For One', body: 'Time to check in.' };
    try { const res = await fetch('/api/nudge', { credentials: 'include' }); if (res.ok) note = await res.json(); } catch { /* fall back to the generic words */ }
    await self.registration.showNotification(note.title, { body: note.body, icon: '/icon.svg', badge: '/icon.svg', tag: 'nudge' });
  })());
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window' });
    if (open.length) return open[0].focus();
    return self.clients.openWindow('/');
  })());
});
