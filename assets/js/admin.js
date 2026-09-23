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
const selectedCount = document.getElementById('selected-count');
const selectAll = document.getElementById('select-all');
const statusFilter = document.getElementById('status-filter');
const searchFilter = document.getElementById('search-filter');
const dateFromFilter = document.getElementById('date-from-filter');
const dateToFilter = document.getElementById('date-to-filter');
const paymentMethodFilter = document.getElementById('payment-method-filter');
const receiptFilter = document.getElementById('receipt-filter');
const sortFilter = document.getElementById('sort-filter');
let orders = [];
let selectedOrderIds = new Set();
let ordersChannel;

const formatVes = value => new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
}).format(Number(value || 0));

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));

const normalizeSearchValue = value => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s-]/g, '');

const visibleOrders = () => {
    const status = statusFilter.value;
    const method = paymentMethodFilter.value;
    const receipt = receiptFilter.value;
    const search = normalizeSearchValue(searchFilter.value);
    const from = dateFromFilter.value ? new Date(`${dateFromFilter.value}T00:00:00`) : null;
    const to = dateToFilter.value ? new Date(`${dateToFilter.value}T23:59:59.999`) : null;

    return orders.filter(order => {
        const createdAt = new Date(order.created_at);
        const receiptText = order.payment_receipts?.map(item => item.ocr_text || '').join(' ') || '';
        const reference = order.payment_receipts?.map(item => item.reference_number || '').join(' ') || '';
        const searchable = normalizeSearchValue(`${order.customer_name || ''} ${order.customer_phone || ''} ${order.id || ''} ${reference} ${receiptText}`);
        const hasReceipt = Boolean(order.payment_receipts?.length);
        return (status === 'all' || order.status === status)
            && (method === 'all' || order.payment_method === method)
            && (receipt === 'all' || (receipt === 'with' && hasReceipt) || (receipt === 'without' && !hasReceipt))
            && (!search || searchable.includes(search))
            && (!from || createdAt >= from)
            && (!to || createdAt <= to);
    }).sort((a, b) => {
        if (sortFilter.value === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
        if (sortFilter.value === 'highest') return Number(b.total_ves || 0) - Number(a.total_ves || 0);
        if (sortFilter.value === 'lowest') return Number(a.total_ves || 0) - Number(b.total_ves || 0);
        return new Date(b.created_at) - new Date(a.created_at);
    });
};

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

    orders = data || [];
    const orderIds = orders.map(order => order.id);
    if (orderIds.length) {
        const { data: receipts, error: receiptsError } = await supabaseClient
            .from('payment_receipts')
            .select('*')
            .in('order_id', orderIds);
        if (receiptsError) {
            console.error('No se pudieron consultar los comprobantes:', receiptsError);
        } else {
            const receiptsByOrder = new Map((receipts || []).map(receipt => [receipt.order_id, receipt]));
            orders = orders.map(order => ({
                ...order,
                payment_receipts: order.payment_receipts?.length
                    ? order.payment_receipts
                    : (receiptsByOrder.has(order.id) ? [receiptsByOrder.get(order.id)] : [])
            }));
        }
    }
    const currentIds = new Set(orders.map(order => order.id));
    selectedOrderIds = new Set([...selectedOrderIds].filter(id => currentIds.has(id)));
    ordersSummary.textContent = `${orders.length} pedido${orders.length === 1 ? '' : 's'} · ${visibleOrders().length} visible${visibleOrders().length === 1 ? '' : 's'}`;
    renderCounters();
    renderOrders();
    ordersStatus.textContent = '';
}

function statusBadge(status) {
    const styles = {
        pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        approved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        rejected: 'bg-red-500/15 text-red-300 border-red-500/30',
        completed: 'bg-sky-500/15 text-sky-300 border-sky-500/30'
    };
    const labels = { pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado', completed: 'Completado' };
    return `<span class="inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${styles[status] || styles.pending}">${labels[status] || escapeHtml(status)}</span>`;
}

function renderCounters() {
    document.getElementById('total-count').textContent = orders.length;
    document.getElementById('pending-count').textContent = orders.filter(order => order.status === 'pending').length;
    document.getElementById('approved-count').textContent = orders.filter(order => order.status === 'approved').length;
    document.getElementById('rejected-count').textContent = orders.filter(order => order.status === 'rejected').length;
    selectedCount.textContent = `${selectedOrderIds.size} seleccionado${selectedOrderIds.size === 1 ? '' : 's'}`;
}

function renderOrders() {
    const filteredOrders = visibleOrders();
    const visibleIds = filteredOrders.map(order => order.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedOrderIds.has(id));
    selectAll.checked = allVisibleSelected;
    selectAll.indeterminate = !allVisibleSelected && visibleIds.some(id => selectedOrderIds.has(id));

    ordersList.innerHTML = filteredOrders.length ? filteredOrders.map(renderOrder).join('') :
        '<div class="rounded-2xl border border-slate-800 p-8 text-center text-sm text-slate-400">No hay pedidos que coincidan con los filtros.</div>';
    ordersSummary.textContent = `${orders.length} pedido${orders.length === 1 ? '' : 's'} · ${filteredOrders.length} visible${filteredOrders.length === 1 ? '' : 's'}`;
}

function renderOrder(order) {
    const items = (order.order_items || []).map(item =>
        `<li>${item.quantity}x ${escapeHtml(item.product_name)} <span class="text-slate-500">($${Number(item.line_total_usd).toFixed(2)})</span></li>`
    ).join('');
    const receipt = order.payment_receipts?.[0];
    const receiptButton = receipt
        ? `<div class="flex flex-wrap items-center gap-3"><button class="receipt-link text-violet-300 hover:text-violet-200 text-xs font-bold" data-path="${escapeHtml(receipt.storage_path)}"><i class="fa-solid fa-paperclip mr-1"></i>Ver comprobante</button>${receipt.reference_number ? `<span class="text-xs text-slate-400">Ref: <strong>${escapeHtml(receipt.reference_number)}</strong></span>` : `<span class="text-xs text-slate-500">OCR: ${escapeHtml(receipt.ocr_status || 'pendiente')}</span>`}</div>`
        : '<span class="text-xs text-red-300">Sin comprobante</span>';
    const actions = order.status === 'pending' ? `
        <button data-id="${order.id}" data-status="approved" class="status-action rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold hover:bg-emerald-500">Aprobar</button>
        <button data-id="${order.id}" data-status="rejected" class="status-action rounded-xl border border-red-500/40 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/10">Rechazar</button>` :
        order.status === 'approved' ? `<button data-id="${order.id}" data-status="completed" class="status-action rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold hover:bg-sky-500">Marcar completado</button>` : '';

    return `<article class="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
        <div class="flex flex-wrap items-start gap-3">
            <label class="pt-1"><input type="checkbox" class="order-check h-5 w-5" data-id="${order.id}" ${selectedOrderIds.has(order.id) ? 'checked' : ''}></label>
            <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-start justify-between gap-3">
                    <div><div class="text-xs text-slate-500">${new Date(order.created_at).toLocaleString('es-VE')}</div><h3 class="font-black mt-1">${escapeHtml(order.customer_name)}</h3><div class="text-xs text-slate-400 mt-1">${escapeHtml(order.customer_phone)} · ${order.payment_method === 'pago_movil' ? 'Pago Móvil' : 'Transferencia'}</div></div>
                    <div class="text-right">${statusBadge(order.status)}<div class="text-xl font-black text-violet-300 mt-2">Bs. ${formatVes(order.total_ves)}</div><div class="text-[10px] text-slate-500">$${Number(order.total_usd).toFixed(2)} · tasa ${formatVes(order.exchange_rate)}</div></div>
                </div>
                <ul class="border-t border-slate-800 mt-4 pt-4 space-y-1 text-xs text-slate-300">${items}</ul>
                <div class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 mt-4 pt-4">${receiptButton}<div class="flex flex-wrap gap-2">${actions}<button data-delete-id="${order.id}" class="delete-order rounded-xl border border-red-500/40 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/10">Eliminar</button></div></div>
            </div>
        </div>
    </article>`;
}

async function updateOrderStatus(ids, status) {
    if (!ids.length) {
        alert('Selecciona al menos un pedido.');
        return;
    }
    ordersStatus.textContent = 'Actualizando pedidos...';
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const { error } = await supabaseClient.from('orders').update({
        status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: sessionData.session?.user?.id || null
    }).in('id', ids);
    if (error) {
        ordersStatus.textContent = 'No se pudieron actualizar los pedidos.';
        console.error(error);
        return;
    }
    selectedOrderIds.clear();
    await loadOrders();
}

async function deleteOrders(ids) {
    if (!ids.length) {
        alert('Selecciona al menos un pedido.');
        return;
    }
    if (!confirm(`¿Eliminar ${ids.length} pedido${ids.length === 1 ? '' : 's'} definitivamente?`)) return;

    ordersStatus.textContent = 'Eliminando pedidos...';
    const receipts = orders.filter(order => ids.includes(order.id))
        .flatMap(order => (order.payment_receipts || []).map(receipt => receipt.storage_path));

    const { error } = await supabaseClient.from('orders').delete().in('id', ids);
    if (error) {
        ordersStatus.textContent = 'No se pudieron eliminar los pedidos.';
        console.error(error);
        return;
    }

    if (receipts.length) {
        const storageCleanup = supabaseClient.storage.from('payment-receipts').remove(receipts);
        const timeout = new Promise(resolve => setTimeout(() => resolve({ error: new Error('Tiempo de espera agotado al borrar archivos.') }), 10000));
        const { error: storageError } = await Promise.race([storageCleanup, timeout]);
        if (storageError) {
            console.error('El pedido se eliminó, pero no se pudo borrar el comprobante:', storageError);
            ordersStatus.textContent = 'Pedido eliminado. Algunos archivos del comprobante requieren limpieza manual.';
        }
    }
    selectedOrderIds.clear();
    await loadOrders();
}

async function exportReceipts() {
    if (!window.JSZip) {
        ordersStatus.textContent = 'No se pudo cargar el exportador ZIP.';
        return;
    }
    const { data: receipts, error } = await supabaseClient.from('payment_receipts')
        .select('order_id, storage_path, original_name');
    if (error) {
        ordersStatus.textContent = 'No se pudieron consultar los comprobantes.';
        console.error(error);
        return;
    }
    if (!receipts?.length) {
        alert('No hay comprobantes para exportar.');
        return;
    }

    ordersStatus.textContent = 'Preparando archivo ZIP...';
    const zip = new JSZip();
    let exported = 0;
    for (const receipt of receipts) {
        const { data, error: signedError } = await supabaseClient.storage.from('payment-receipts')
            .createSignedUrl(receipt.storage_path, 300);
        if (signedError) {
            console.error(signedError);
            continue;
        }
        const response = await fetch(data.signedUrl);
        if (!response.ok) continue;
        zip.file(`${receipt.order_id}-${receipt.original_name}`, await response.blob());
        exported++;
    }
    if (!exported) {
        ordersStatus.textContent = 'No se pudo descargar ningún comprobante.';
        return;
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `comprobantes-${new Date().toISOString().slice(0, 10)}.zip`;
    link.click();
    URL.revokeObjectURL(url);
    ordersStatus.textContent = `${exported} comprobante${exported === 1 ? '' : 's'} exportado${exported === 1 ? '' : 's'}.`;
}

document.getElementById('login-form').addEventListener('submit', async event => {
    event.preventDefault();
    loginStatus.textContent = 'Iniciando sesión...';
    try {
        const { error } = await supabaseClient.auth.signInWithPassword({
            email: document.getElementById('login-email').value,
            password: document.getElementById('login-password').value
        });
        if (error) throw error;
        loginStatus.textContent = '';
        showOrders();
    } catch (error) {
        console.error('Error de inicio de sesión:', error);
        loginStatus.textContent = error.message || 'No se pudo iniciar sesión.';
    }
});

logoutButton.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    showLogin();
});

document.getElementById('refresh-orders').addEventListener('click', loadOrders);
document.getElementById('export-receipts').addEventListener('click', exportReceipts);
document.getElementById('bulk-approve').addEventListener('click', () => updateOrderStatus([...selectedOrderIds], 'approved'));
document.getElementById('bulk-reject').addEventListener('click', () => updateOrderStatus([...selectedOrderIds], 'rejected'));
document.getElementById('bulk-delete').addEventListener('click', () => deleteOrders([...selectedOrderIds]));
statusFilter.addEventListener('change', renderOrders);
[searchFilter, dateFromFilter, dateToFilter, paymentMethodFilter, receiptFilter, sortFilter].forEach(filter => {
    filter.addEventListener('input', renderOrders);
    filter.addEventListener('change', renderOrders);
});
document.getElementById('clear-filters').addEventListener('click', () => {
    searchFilter.value = '';
    dateFromFilter.value = '';
    dateToFilter.value = '';
    paymentMethodFilter.value = 'all';
    statusFilter.value = 'all';
    receiptFilter.value = 'all';
    sortFilter.value = 'newest';
    renderOrders();
});
selectAll.addEventListener('change', () => {
    visibleOrders().forEach(order => {
        if (selectAll.checked) selectedOrderIds.add(order.id);
        else selectedOrderIds.delete(order.id);
    });
    renderCounters();
    renderOrders();
});
themeToggle.addEventListener('click', toggleAdminTheme);

ordersList.addEventListener('change', event => {
    if (!event.target.classList.contains('order-check')) return;
    if (event.target.checked) selectedOrderIds.add(event.target.dataset.id);
    else selectedOrderIds.delete(event.target.dataset.id);
    renderCounters();
    renderOrders();
});

ordersList.addEventListener('click', async event => {
    const statusButton = event.target.closest('.status-action');
    const deleteButton = event.target.closest('.delete-order');
    const receiptButton = event.target.closest('.receipt-link');
    if (statusButton) await updateOrderStatus([statusButton.dataset.id], statusButton.dataset.status);
    if (deleteButton) await deleteOrders([deleteButton.dataset.deleteId]);
    if (!receiptButton) return;
    const { data, error } = await supabaseClient.storage.from('payment-receipts')
        .createSignedUrl(receiptButton.dataset.path, 300);
    if (error) {
        ordersStatus.textContent = 'No se pudo abrir el comprobante.';
        console.error(error);
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
