// ═══════════════════════════════════════════════════════════════
//  CORTOBA ATELIER — Service Worker (Push Notifications)
// ═══════════════════════════════════════════════════════════════

const CACHE_VERSION = 'cortoba-v1';

// Installation : pré-cache des assets critiques (optionnel)
self.addEventListener('install', function(event) {
    self.skipWaiting();
});

// Activation : nettoyage des vieux caches
self.addEventListener('activate', function(event) {
    event.waitUntil(self.clients.claim());
});

// Réception d'une notification push
self.addEventListener('push', function(event) {
    if (!event.data) return;

    var payload;
    try {
        payload = event.data.json();
    } catch (e) {
        payload = {
            title: 'Cortoba Atelier',
            body: event.data.text() || 'Nouvelle notification',
        };
    }

    var title = payload.title || 'Cortoba Atelier';
    var options = {
        body:    payload.body || '',
        icon:    payload.icon || '/cortoba-plateforme/img/cortoba-icon-192.png',
        badge:   payload.badge || '/cortoba-plateforme/img/cortoba-badge-72.png',
        tag:     payload.tag || 'cortoba-default',
        data:    payload.data || {},
        vibrate: [200, 100, 200],
        actions: [
            { action: 'open', title: 'Ouvrir' },
            { action: 'dismiss', title: 'Fermer' }
        ],
        requireInteraction: false,
        renotify: true,
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Clic sur une notification push
self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    if (event.action === 'dismiss') return;

    var url = '/cortoba-plateforme/plateforme-nas.html';
    var data = event.notification.data || {};

    if (data.url) {
        url = data.url;
    } else if (data.linkPage) {
        url = '/cortoba-plateforme/plateforme-nas.html#page=' + data.linkPage;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            // Si un onglet est déjà ouvert, le focaliser
            for (var i = 0; i < clientList.length; i++) {
                var client = clientList[i];
                if (client.url.indexOf('plateforme-nas') !== -1 && 'focus' in client) {
                    client.focus();
                    // Envoyer un message au client pour naviguer
                    client.postMessage({
                        type: 'NOTIFICATION_CLICK',
                        page: data.linkPage || 'notifications',
                        linkId: data.linkId || null,
                    });
                    return;
                }
            }
            // Sinon, ouvrir un nouvel onglet
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});

// Fermeture d'une notification
self.addEventListener('notificationclose', function(event) {
    // Analytics ou tracking optionnel
});

// Messages depuis le client (page principale)
self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
