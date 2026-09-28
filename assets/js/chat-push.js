(() => {
    const notificationEndpoint = 'customer-chat';
    let publicKeyRequest;
    let cachedPublicKey = null;

    function isIosDevice() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent)
            || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    function isStandaloneApp() {
        return window.matchMedia('(display-mode: standalone)').matches
            || navigator.standalone === true;
    }

    function getCompatibility() {
        if (!window.isSecureContext) {
            return { supported: false, reason: 'Las notificaciones requieren una conexión HTTPS segura.' };
        }
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
            return { supported: false, reason: 'Este navegador no admite notificaciones push. Puedes seguir usando el chat con la página abierta.' };
        }
        if (isIosDevice() && !isStandaloneApp()) {
            return { supported: false, reason: 'En iPhone o iPad, agrega primero el sitio a la pantalla de inicio y ábrelo desde su icono para activar notificaciones.' };
        }
        return { supported: true, reason: '' };
    }

    function getServiceWorkerUrl() {
        return new URL('service-worker.js', document.baseURI);
    }

    function getApplicationServerKey(value) {
        const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '='));
        return Uint8Array.from(raw, character => character.charCodeAt(0));
    }

    function prepare(client) {
        if (!publicKeyRequest) {
            publicKeyRequest = client.functions.invoke(notificationEndpoint, {
                body: { action: 'push_public_key' }
            }).then(({ data, error }) => {
                if (error) throw error;
                if (data?.error) throw new Error(data.error);
                if (typeof data?.publicKey !== 'string' || !data.publicKey) {
                    throw new Error('Las notificaciones aún no están configuradas en el servidor.');
                }
                cachedPublicKey = data.publicKey;
                return cachedPublicKey;
            }).catch(error => {
                publicKeyRequest = null;
                cachedPublicKey = null;
                throw error;
            });
        }
        return publicKeyRequest;
    }

    async function getExistingSubscription() {
        if (!('serviceWorker' in navigator)) return null;
        const registration = await navigator.serviceWorker.getRegistration(getServiceWorkerUrl().href);
        return registration?.pushManager ? registration.pushManager.getSubscription() : null;
    }

    async function enable({ client, audience, conversationId, sessionToken }) {
        const compatibility = getCompatibility();
        if (!compatibility.supported) throw new Error(compatibility.reason);
        if (!cachedPublicKey) throw new Error('Las notificaciones aún se están preparando. Intenta de nuevo en unos segundos.');
        if (Notification.permission === 'denied') {
            throw new Error('Las notificaciones están bloqueadas en el navegador. Habilítalas en los ajustes del sitio y vuelve a intentarlo.');
        }

        const permission = Notification.permission === 'granted'
            ? 'granted'
            : await Notification.requestPermission();
        if (permission !== 'granted') {
            throw new Error('No se concedió permiso para mostrar notificaciones.');
        }

        const registration = await navigator.serviceWorker.register(getServiceWorkerUrl().href);
        let subscription = await registration.pushManager.getSubscription();
        let createdHere = false;
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: getApplicationServerKey(cachedPublicKey)
            });
            createdHere = true;
        }

        const body = {
            action: 'push_subscribe',
            audience,
            subscription: subscription.toJSON(),
            ...(audience === 'customer' ? { conversationId, sessionToken } : {})
        };
        const { data, error } = await client.functions.invoke(notificationEndpoint, { body });
        if (error || data?.error) {
            if (createdHere) await subscription.unsubscribe();
            throw error || new Error(data.error);
        }
        return subscription;
    }

    async function disable({ client, audience, conversationId, sessionToken }) {
        const subscription = await getExistingSubscription();
        if (!subscription) return;
        const body = {
            action: 'push_unsubscribe',
            audience,
            endpoint: subscription.endpoint,
            ...(audience === 'customer' ? { conversationId, sessionToken } : {})
        };
        const { data, error } = await client.functions.invoke(notificationEndpoint, { body });
        if (error || data?.error) throw error || new Error(data.error);
        const removed = await subscription.unsubscribe();
        if (!removed) throw new Error('No se pudo desactivar la suscripción del navegador.');
    }

    window.ChatPush = {
        prepare,
        getCompatibility,
        getExistingSubscription,
        enable,
        disable
    };
})();
