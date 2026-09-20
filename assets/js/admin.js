const config = window.SUPABASE_CONFIG || {};
const loginStatus = document.getElementById('login-status');
if (!window.supabase || !config.url || !config.publishableKey) {
    loginStatus.textContent = 'No se pudo cargar la conexión con Supabase. Revisa tu conexión a internet.';
    throw new Error('Supabase no está disponible o falta la configuración pública.');
}
const supabaseClient = window.supabase.createClient(config.url, config.publishableKey);
const loginView = document.getElementById('login-view');
const ordersView = document.getElementById('orders-view');
const ordersList = document.getElementById('orders-list');
const ordersStatus = document.getElementById('orders-status');
const ordersSummary = document.getElementById('orders-summary');
const logoutButton = document.getElementById('logout-button');
const themeToggle = document.getElementById('theme-toggle');
const realtimeStatus = document.getElementById('realtime-status');
let ordersChannel;

const formatVes = value => new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
}).format(value);

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));

function showLogin() {
    loginView.classList.remove('hidden');
    ordersView.classList.add('hidden');
    logoutButton.classList.add('hidden');
}

function showOrders() {
    loginView.classList.add('hidden');
    ordersView.classList.remove('hidden');
    logoutButton.classList.remove('hidden');
    loadOrders();
    subscribeToOrders();
}

function initTheme() {
    const light = localStorage.getItem('admin-theme') === 'light';
    document.documentElement.classList.toggle('light', light);
    document.body.classList.toggle('bg-slate-50', light);
    document.body.classList.toggle('text-slate-900', light);
    themeToggle.innerHTML = `<i class="fa-solid fa-${light ? 'moon' : 'sun'}"></i>`;
}

function toggleAdminTheme() {
    const light = !document.documentElement.classList.contains('light');
    localStorage.setItem('admin-theme', light ? 'light' : 'dark');
    initTheme();
}

function subscribeToOrders() {
    if (ordersChannel) return;
    ordersChannel = supabaseClient.channel('admin-orders-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
            loadOrders();
            ordersStatus.textContent = payload.eventType === 'INSERT' ? 'Nuevo pedido recibido.' : 'Pedido actualizado.';
        })
        .subscribe(status => {
            if (status === 'SUBSCRIBED') realtimeStatus.classList.remove('hidden');
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                realtimeStatus.classList.add('hidden');
                ordersStatus.textContent = 'Realtime no está activo. Usa Actualizar para consultar manualmente.';
            }
        });
}

async function loadOrders() {
    ordersStatus.textContent = 'Cargando pedidos...';
    const { data, error } = await supabaseClient
        .from('orders')
        .select('*, order_items(*), payment_receipts(*)')
        .order('created_at', { ascending: false });

    if (error) {
        ordersStatus.textContent = 'No se pudieron cargar los pedidos.';
        console.error(error);
        return;
    }

    ordersStatus.textContent = '';
    ordersSummary.textContent = `${data.length} pedido${data.length === 1 ? '' : 's'}`;
    const ordersWithReceipts = await Promise.all(data.map(async order => {
        if (order.payment_receipts?.length) return order;
        const { data: receipts } = await supabaseClient
            .from('payment_receipts')
            .select('*')
            .eq('order_id', order.id)
            .limit(1);
        return { ...order, payment_receipts: receipts || [] };
    }));

    ordersList.innerHTML = ordersWithReceipts.length ? ordersWithReceipts.map(renderOrder).join('') : '<div class="rounded-2xl border border-slate-800 p-8 text-center text-sm text-slate-400">No hay pedidos todavía.</div>';

    ordersList.querySelectorAll('[data-status]').forEach(button => {
        button.addEventListener('click', () => updateOrderStatus(button.dataset.id, button.dataset.status));
    });
}

function statusBadge(status) {
    const styles = {
        pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        approved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        rejected: 'bg-red-500/15 text-red-300 border-red-500/30',
        completed: 'bg-sky-500/15 text-sky-300 border-sky-500/30'
    };
    const labels = { pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado', completed: 'Completado' };
    return `<span class="inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${styles[status] || styles.pending}">${labels[status] || status}</span>`;
}

function renderOrder(order) {
    const items = (order.order_items || []).map(item => `<li>${item.quantity}x ${escapeHtml(item.product_name)} <span class="text-slate-500">($${Number(item.line_total_usd).toFixed(2)})</span></li>`).join('');
    const receipt = order.payment_receipts?.[0];
    const receiptButton = receipt ? `<button class="receipt-link text-violet-300 hover:text-violet-200 text-xs font-bold" data-path="${escapeHtml(receipt.storage_path)}"><i class="fa-solid fa-paperclip mr-1"></i>Ver comprobante</button>` : '<span class="text-xs text-red-300">Sin comprobante</span>';
    const actions = order.status === 'pending' ? `
        <button data-id="${order.id}" data-status="approved" class="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold hover:bg-emerald-500">Aprobar</button>
        <button data-id="${order.id}" data-status="rejected" class="rounded-xl border border-red-500/40 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/10">Rechazar</button>` : order.status === 'approved' ? `<button data-id="${order.id}" data-status="completed" class="rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold hover:bg-sky-500">Marcar completado</button>` : '';

    return `<article class="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
        <div class="flex flex-wrap items-start justify-between gap-3">
            <div><div class="text-xs text-slate-500">${new Date(order.created_at).toLocaleString('es-VE')}</div><h3 class="font-black mt-1">${escapeHtml(order.customer_name)}</h3><div class="text-xs text-slate-400 mt-1">${escapeHtml(order.customer_phone)} · ${order.payment_method === 'pago_movil' ? 'Pago Móvil' : 'Transferencia'}</div></div>
            <div class="text-right">${statusBadge(order.status)}<div class="text-xl font-black text-violet-300 mt-2">Bs. ${formatVes(order.total_ves)}</div><div class="text-[10px] text-slate-500">$${Number(order.total_usd).toFixed(2)} · tasa ${formatVes(order.exchange_rate)}</div></div>
        </div>
        <ul class="border-t border-slate-800 mt-4 pt-4 space-y-1 text-xs text-slate-300">${items}</ul>
        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 mt-4 pt-4">${receiptButton}<div class="flex gap-2">${actions}</div></div>
    </article>`;
}

async function updateOrderStatus(id, status) {
    ordersStatus.textContent = 'Actualizando pedido...';
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const { error } = await supabaseClient.from('orders').update({
        status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: sessionData.session?.user?.id || null
    }).eq('id', id);
    if (error) {
        ordersStatus.textContent = 'No se pudo actualizar el pedido.';
        console.error(error);
        return;
    }
    await loadOrders();
}

document.getElementById('login-form').addEventListener('submit', async event => {
    event.preventDefault();
    loginStatus.textContent = 'Iniciando sesión...';
    try {
        const { error } = await supabaseClient.auth.signInWithPassword({
            email: document.getElementById('login-email').value.trim(),
            password: document.getElementById('login-password').value
        });
        if (error) throw error;
    } catch (error) {
        console.error('Error de inicio de sesión:', error);
        loginStatus.textContent = error.message || 'No se pudo iniciar sesión.';
        loginStatus.className = 'text-xs text-red-400';
        return;
    }
    loginStatus.textContent = '';
    showOrders();
});

logoutButton.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    showLogin();
});

document.getElementById('refresh-orders').addEventListener('click', loadOrders);
themeToggle.addEventListener('click', toggleAdminTheme);

document.addEventListener('click', async event => {
    const button = event.target.closest('.receipt-link');
    if (!button) return;
    const { data, error } = await supabaseClient.storage.from('payment-receipts').createSignedUrl(button.dataset.path, 300);
    if (error) {
        ordersStatus.textContent = 'No se pudo abrir el comprobante.';
        return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
});

supabaseClient.auth.getSession()
    .then(({ data }) => data.session ? showOrders() : showLogin())
    .catch(error => {
        console.error('Error comprobando la sesión:', error);
        loginStatus.textContent = error.message || 'No se pudo comprobar la sesión.';
    });

initTheme();
