self.addEventListener('push', event => {
    event.waitUntil((async () => {
        let payload = {};
        try {
            payload = event.data?.json() || {};
        } catch (error) {
            console.error('No se pudo interpretar la notificación push:', error);
        }

        await self.registration.showNotification(payload.title || 'INV. Armijhon', {
            body: payload.body || 'Tienes una nueva notificación del chat.',
            icon: new URL('assets/images/pwa-icon-192.png', self.registration.scope).href,
            badge: new URL('assets/images/pwa-icon-192.png', self.registration.scope).href,
            tag: payload.tag || 'inv-armijhon-chat',
            data: { url: payload.url || './' }
        });
    })());
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil((async () => {
        const target = new URL(event.notification.data?.url || './', self.registration.scope);
        if (target.origin !== self.location.origin) return;

        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of windows) {
            if (client.url.startsWith(self.location.origin) && 'focus' in client) {
                await client.navigate(target.href);
                return client.focus();
            }
        }
        if (self.clients.openWindow) await self.clients.openWindow(target.href);
    })());
});
