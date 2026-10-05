const config = window.SUPABASE_CONFIG || {};
const loginStatus = document.getElementById('login-status');
if (!window.supabase || !config.url || !config.publishableKey) {
    loginStatus.textContent = 'No se pudo cargar la conexión con Supabase. Revisa tu conexión a internet.';
    throw new Error('Supabase no está disponible o falta la configuración pública.');
}

const supabaseClient = window.supabase.createClient(config.url, config.publishableKey);
const loginView = document.getElementById('login-view');
const ordersView = document.getElementById('orders-view');
const adminNavigation = document.getElementById('admin-navigation');
const adminPageButtons = [...adminNavigation.querySelectorAll('[data-admin-page]')];
const adminPageViews = [...ordersView.querySelectorAll('[data-admin-page-view]')];
const ordersList = document.getElementById('orders-list');
const ordersStatus = document.getElementById('orders-status');
const orderDetailsDialog = document.getElementById('order-details-dialog');
const orderDetailsSubtitle = document.getElementById('order-details-subtitle');
const orderDetailsCustomer = document.getElementById('order-details-customer');
const orderDetailsItems = document.getElementById('order-details-items');
const orderDetailsReceipt = document.getElementById('order-details-receipt');
let orderDetailsRequest = 0;
const bulkActionDialog = document.getElementById('bulk-action-dialog');
let pendingBulkAction = null;
const inventoryList = document.getElementById('inventory-list');
const inventoryStatus = document.getElementById('inventory-status');
const inventorySearch = document.getElementById('inventory-search');
const filterLowStockButton = document.getElementById('filter-low-stock');
const stockHistoryDialog = document.getElementById('stock-history-dialog');
const stockHistoryProduct = document.getElementById('stock-history-product');
const stockHistoryStatus = document.getElementById('stock-history-status');
const stockHistoryList = document.getElementById('stock-history-list');
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
let inventoryProducts = [];
let ordersLoaded = false;
let inventoryLoaded = false;
let showLowStockOnly = false;
let dashboardOrdersMessage = 'Cargando pedidos…';
let dashboardInventoryMessage = 'Cargando inventario…';
let selectedOrderIds = new Set();
let ordersChannel;
let chatChannel;
let chatRefreshTimer;
let adminChatConversations = [];
let selectedChatId = null;
let adminChatFilter = 'all';
let chatMessagesRequest = 0;
let adminChatSelectedFiles = [];
const chatConversationList = document.getElementById('chat-conversation-list');
const adminChatMessages = document.getElementById('admin-chat-messages');
const adminChatReplyForm = document.getElementById('admin-chat-reply-form');
const chatsStatus = document.getElementById('chats-status');
const adminChatPushButton = document.getElementById('admin-chat-push-toggle');
const adminChatPushStatus = document.getElementById('admin-chat-push-status');

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
    if (chatChannel) {
        supabaseClient.removeChannel(chatChannel);
        chatChannel = null;
    }
    if (chatRefreshTimer) {
        clearTimeout(chatRefreshTimer);
        chatRefreshTimer = null;
    }
}

function showOrders() {
    loginView.classList.add('hidden');
    ordersView.classList.remove('hidden');
    showAdminPage('dashboard');
    logoutButton.classList.remove('hidden');
    loadOrders();
    loadAdminInventory();
    subscribeToOrders();
    loadAdminChats();
    subscribeToAdminChats();
    refreshAdminChatPushControl();
}

function showAdminPage(page) {
    adminPageViews.forEach(view => {
        view.classList.toggle('hidden', view.id !== `admin-page-${page}`);
    });

    adminPageButtons.forEach(button => {
        const isActive = button.dataset.adminPage === page;
        button.classList.toggle('bg-violet-500/15', isActive);
        button.classList.toggle('text-violet-200', isActive);
        button.classList.toggle('text-slate-400', !isActive);
        button.classList.toggle('hover:bg-violet-500/20', isActive);
        button.classList.toggle('hover:bg-slate-800', !isActive);
        button.classList.toggle('hover:text-white', !isActive);
        button.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
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

async function invokeAdminChat(action, extra = {}) {
    const { data, error } = await supabaseClient.functions.invoke('customer-chat', {
        body: { action, ...extra }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
}

function scheduleAdminChatRefresh() {
    if (chatRefreshTimer) clearTimeout(chatRefreshTimer);
    chatRefreshTimer = setTimeout(async () => {
        chatRefreshTimer = null;
        await loadAdminChats();
    }, 250);
}

function subscribeToAdminChats() {
    if (chatChannel) return;
    chatChannel = supabaseClient.channel('admin-chat-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations' }, scheduleAdminChatRefresh)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, scheduleAdminChatRefresh)
        .subscribe(status => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                chatsStatus.textContent = 'El chat en tiempo real no está disponible. Usa “Actualizar chats” para consultar manualmente.';
            }
        });
}

function renderAdminChatConversations() {
    const counts = {
        all: adminChatConversations.length,
        'needs-reply': adminChatConversations.filter(conversation =>
            conversation.status === 'open' && conversation.last_message_sender === 'customer').length,
        attended: adminChatConversations.filter(conversation =>
            conversation.status === 'open' && conversation.last_message_sender === 'admin').length,
        closed: adminChatConversations.filter(conversation => conversation.status === 'closed').length
    };
    document.getElementById('chat-count').textContent = counts[adminChatFilter];
    document.getElementById('chat-filter-count-all').textContent = counts.all;
    document.getElementById('chat-filter-count-needs-reply').textContent = counts['needs-reply'];
    document.getElementById('chat-filter-count-attended').textContent = counts.attended;
    document.getElementById('chat-filter-count-closed').textContent = counts.closed;
    document.querySelectorAll('[data-chat-filter]').forEach(button => {
        const active = button.dataset.chatFilter === adminChatFilter;
        button.setAttribute('aria-pressed', String(active));
        button.classList.toggle('border-violet-400/40', active);
        button.classList.toggle('bg-violet-500/15', active);
        button.classList.toggle('text-violet-200', active);
        button.classList.toggle('border-slate-700', !active);
        button.classList.toggle('text-slate-400', !active);
    });

    chatConversationList.replaceChildren();
    const filteredConversations = adminChatConversations
        .filter(conversation => {
            if (adminChatFilter === 'needs-reply') {
                return conversation.status === 'open' && conversation.last_message_sender === 'customer';
            }
            if (adminChatFilter === 'attended') {
                return conversation.status === 'open' && conversation.last_message_sender === 'admin';
            }
            if (adminChatFilter === 'closed') return conversation.status === 'closed';
            return true;
        })
        .sort((a, b) => {
            const aNeedsReply = a.status === 'open' && a.last_message_sender === 'customer';
            const bNeedsReply = b.status === 'open' && b.last_message_sender === 'customer';
            if (aNeedsReply !== bNeedsReply) return aNeedsReply ? -1 : 1;
            return new Date(b.last_message_at) - new Date(a.last_message_at);
        });

    if (!filteredConversations.length) {
        const empty = document.createElement('p');
        empty.className = 'p-5 text-xs text-slate-500';
        empty.textContent = adminChatConversations.length
            ? {
                'needs-reply': 'No hay conversaciones esperando respuesta.',
                attended: 'No hay conversaciones abiertas con respuesta de la tienda.',
                closed: 'No hay conversaciones cerradas.'
            }[adminChatFilter]
            : 'Aún no hay conversaciones.';
        chatConversationList.append(empty);
        return;
    }

    filteredConversations.forEach(conversation => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.chatId = conversation.id;
        const needsReply = conversation.status === 'open' && conversation.last_message_sender === 'customer';
        button.className = `block w-full border-l-2 px-4 py-4 text-left transition hover:bg-slate-800 ${needsReply ? 'border-amber-400 bg-amber-500/5' : 'border-transparent'} ${selectedChatId === conversation.id ? 'bg-violet-500/10' : ''}`;
        const top = document.createElement('div');
        top.className = 'flex items-start justify-between gap-3';
        const name = document.createElement('span');
        name.className = 'truncate text-sm font-black text-slate-100';
        name.textContent = conversation.customer_name;
        const right = document.createElement('span');
        right.className = 'flex shrink-0 items-center gap-2';
        const date = document.createElement('time');
        date.className = 'text-[9px] text-slate-500';
        date.dateTime = conversation.last_message_at;
        date.textContent = new Date(conversation.last_message_at).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' });
        right.append(date);
        if (Number(conversation.admin_unread) > 0) {
            const unread = document.createElement('span');
            unread.className = 'grid h-5 min-w-5 place-items-center rounded-full bg-violet-500 px-1 text-[9px] font-black text-white';
            unread.textContent = Number(conversation.admin_unread) > 99 ? '99+' : Number(conversation.admin_unread);
            right.append(unread);
        }
        top.append(name, right);
        const phone = document.createElement('p');
        phone.className = 'mt-1 text-[10px] text-slate-500';
        phone.textContent = conversation.customer_phone;
        const preview = document.createElement('p');
        preview.className = 'mt-2 truncate text-xs text-slate-400';
        preview.textContent = conversation.last_message_preview || 'Conversación iniciada';
        const state = document.createElement('span');
        state.className = `mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black uppercase ${needsReply ? 'bg-amber-400/15 text-amber-200' : conversation.status === 'closed' ? 'bg-slate-700/70 text-slate-300' : 'bg-emerald-500/10 text-emerald-300'}`;
        state.textContent = needsReply
            ? 'Espera respuesta'
            : conversation.status === 'closed' ? 'Cerrada' : conversation.last_message_sender === 'admin' ? 'Atendida' : 'Sin mensajes';
        button.append(top, phone, preview, state);
        chatConversationList.append(button);
    });
}

async function loadAdminChats() {
    chatsStatus.textContent = 'Cargando conversaciones...';
    try {
        const data = await invokeAdminChat('admin_list');
        adminChatConversations = data.conversations || [];
        const linkedChatId = window.location.hash.match(/^#chat\/([0-9a-f-]{36})$/i)?.[1];
        if (linkedChatId && adminChatConversations.some(item => item.id === linkedChatId)) {
            if (selectedChatId !== linkedChatId) {
                adminChatSelectedFiles.length = 0;
                renderAdminChatSelectedFiles();
            }
            selectedChatId = linkedChatId;
        }
        if (selectedChatId && !adminChatConversations.some(item => item.id === selectedChatId)) selectedChatId = null;
        renderAdminChatConversations();
        chatsStatus.textContent = '';
        if (selectedChatId) {
            const active = adminChatConversations.find(item => item.id === selectedChatId);
            if (active) {
                updateAdminChatHeader(active);
                await loadAdminChatMessages(selectedChatId);
            }
        }
    } catch (error) {
        chatsStatus.textContent = error.message || 'No se pudieron cargar las conversaciones.';
        console.error('Error cargando conversaciones de chat:', error);
    }
}

async function refreshAdminChatPushControl() {
    const compatibility = window.ChatPush.getCompatibility();
    if (!compatibility.supported) {
        adminChatPushButton.disabled = true;
        adminChatPushStatus.textContent = compatibility.reason;
        adminChatPushStatus.classList.remove('hidden');
        return;
    }

    adminChatPushButton.disabled = true;
    try {
        await window.ChatPush.prepare(supabaseClient);
        const subscription = await window.ChatPush.getExistingSubscription();
        adminChatPushButton.innerHTML = subscription
            ? '<i class="fa-solid fa-bell-slash mr-2"></i>Desactivar avisos'
            : '<i class="fa-regular fa-bell mr-2"></i>Activar avisos';
        adminChatPushButton.disabled = false;
        adminChatPushStatus.textContent = Notification.permission === 'denied'
            ? 'El permiso está bloqueado. Habilítalo en los ajustes del navegador.'
            : 'Recibe avisos de mensajes nuevos aunque el panel esté cerrado.';
        adminChatPushStatus.classList.remove('hidden');
    } catch (error) {
        adminChatPushStatus.textContent = error.message || 'No se pudieron preparar las notificaciones.';
        adminChatPushStatus.classList.remove('hidden');
        adminChatPushButton.disabled = true;
    }
}

async function toggleAdminChatPush() {
    if (adminChatPushButton.disabled) return;
    adminChatPushButton.disabled = true;
    adminChatPushStatus.textContent = 'Actualizando la preferencia de notificaciones...';
    adminChatPushStatus.classList.remove('hidden');
    try {
        const subscription = await window.ChatPush.getExistingSubscription();
        if (subscription) {
            await window.ChatPush.disable({ client: supabaseClient, audience: 'admin' });
            adminChatPushStatus.textContent = 'Notificaciones desactivadas para este navegador.';
        } else {
            await window.ChatPush.enable({ client: supabaseClient, audience: 'admin' });
            adminChatPushStatus.textContent = 'Notificaciones activadas para este navegador.';
        }
        await refreshAdminChatPushControl();
    } catch (error) {
        adminChatPushStatus.textContent = error.message || 'No se pudo actualizar la notificación.';
        adminChatPushStatus.classList.remove('hidden');
    } finally {
        adminChatPushButton.disabled = false;
    }
}

async function openAdminChatFromHash() {
    const chatId = window.location.hash.match(/^#chat\/([0-9a-f-]{36})$/i)?.[1];
    if (!chatId) return;
    if (!adminChatConversations.some(item => item.id === chatId)) await loadAdminChats();
    const conversation = adminChatConversations.find(item => item.id === chatId);
    if (!conversation) return;
    selectedChatId = conversation.id;
    renderAdminChatConversations();
    updateAdminChatHeader(conversation);
    await loadAdminChatMessages(conversation.id);
}

function updateAdminChatHeader(conversation) {
    document.getElementById('chat-thread-title').textContent = conversation.customer_name;
    document.getElementById('chat-thread-subtitle').textContent = `${conversation.customer_phone} · ${conversation.status === 'open' ? 'Chat activo' : 'Conversación cerrada'}`;
    adminChatReplyForm.classList.toggle('hidden', conversation.status !== 'open');
    adminChatReplyForm.classList.toggle('flex', conversation.status === 'open');
    document.getElementById('admin-chat-close-conversation').classList.toggle('hidden', conversation.status !== 'open');
    document.getElementById('admin-chat-closed-notice').classList.toggle('hidden', conversation.status !== 'closed');
    document.getElementById('admin-chat-selected-files').classList.toggle('hidden', conversation.status !== 'open' || !adminChatSelectedFiles.length);
}

async function loadAdminChatMessages(conversationId) {
    const requestId = ++chatMessagesRequest;
    try {
        const data = await invokeAdminChat('admin_messages', { conversationId });
        if (requestId !== chatMessagesRequest || conversationId !== selectedChatId) return;
        adminChatMessages.replaceChildren();
        if (!data.messages?.length) {
            const empty = document.createElement('p');
            empty.className = 'm-auto max-w-xs text-center text-xs text-slate-500';
            empty.textContent = 'Envía un saludo para iniciar la conversación.';
            adminChatMessages.append(empty);
        } else {
            data.messages.forEach(message => {
                const row = document.createElement('div');
                row.className = `flex ${message.sender === 'admin' ? 'justify-end' : 'justify-start'}`;
                const bubble = document.createElement('div');
                bubble.className = `max-w-[85%] rounded-2xl px-3 py-2 ${message.sender === 'admin' ? 'rounded-br-md bg-violet-600 text-white' : 'rounded-bl-md bg-slate-800 text-slate-100'}`;
                if (message.body) {
                    const body = document.createElement('p');
                    body.className = 'whitespace-pre-wrap break-words text-xs leading-relaxed';
                    body.textContent = message.body;
                    bubble.append(body);
                }
                window.ChatAttachments.renderAttachments(bubble, message.attachments);
                const time = document.createElement('time');
                time.className = 'mt-1 block text-right text-[9px] opacity-60';
                time.dateTime = message.created_at;
                time.textContent = new Date(message.created_at).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });
                bubble.append(time);
                row.append(bubble);
                adminChatMessages.append(row);
            });
        }
        adminChatMessages.scrollTop = adminChatMessages.scrollHeight;
    } catch (error) {
        if (requestId === chatMessagesRequest) {
            chatsStatus.textContent = error.message || 'No se pudieron cargar los mensajes de esta conversación.';
            console.error('Error cargando mensajes del chat:', error);
        }
    }
}

async function loadOrders() {
    ordersStatus.textContent = 'Cargando pedidos...';
    dashboardOrdersMessage = 'Actualizando pedidos…';
    renderAdminDashboard();
    const { data, error } = await supabaseClient
        .from('orders')
        .select('*, order_items(*), payment_receipts(*)')
        .order('created_at', { ascending: false });

    if (error) {
        ordersStatus.textContent = 'No se pudieron cargar los pedidos.';
        dashboardOrdersMessage = 'No se pudieron cargar los pedidos.';
        renderAdminDashboard();
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
    ordersLoaded = true;
    dashboardOrdersMessage = `${orders.length} pedido${orders.length === 1 ? '' : 's'} en total`;
    const currentIds = new Set(orders.map(order => order.id));
    selectedOrderIds = new Set([...selectedOrderIds].filter(id => currentIds.has(id)));
    ordersSummary.textContent = `${orders.length} pedido${orders.length === 1 ? '' : 's'} · ${visibleOrders().length} visible${visibleOrders().length === 1 ? '' : 's'}`;
    renderCounters();
    renderAdminDashboard();
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
    ['bulk-approve', 'bulk-reject', 'bulk-delete'].forEach(id => {
        document.getElementById(id).disabled = selectedOrderIds.size === 0;
    });
}

function renderAdminDashboard() {
    document.getElementById('dashboard-orders-note').textContent = dashboardOrdersMessage;
    document.getElementById('dashboard-inventory-note').textContent = dashboardInventoryMessage;

    if (ordersLoaded) {
        const approvedOrders = orders.filter(order => order.status === 'approved');
        document.getElementById('dashboard-pending-count').textContent =
            orders.filter(order => order.status === 'pending').length;
        document.getElementById('dashboard-approved-count').textContent = approvedOrders.length;
        document.getElementById('dashboard-approved-total').textContent =
            `Total aprobado: ${formatVes(approvedOrders.reduce((total, order) => total + Number(order.total_ves || 0), 0))} VES`;
        renderDashboardReport();
    }

    if (inventoryLoaded) {
        const lowStockProducts = inventoryProducts.filter(product => product.stock <= product.min_stock).length;
        const outOfStockProducts = inventoryProducts.filter(product => product.stock <= 0).length;
        document.getElementById('dashboard-low-stock-count').textContent = lowStockProducts;
        dashboardInventoryMessage = `${outOfStockProducts} agotados · ${inventoryProducts.length} productos registrados`;
        document.getElementById('dashboard-inventory-note').textContent = dashboardInventoryMessage;
    }
}

function getDashboardReportOrders() {
    const period = document.getElementById('dashboard-period').value;
    if (period === 'all') return orders;
    const days = Number(period);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - days + 1);
    return orders.filter(order => {
        const createdAt = new Date(order.created_at);
        return createdAt >= start && createdAt <= new Date();
    });
}

function getDashboardTrendBuckets(reportOrders) {
    const now = new Date();
    const period = document.getElementById('dashboard-period').value;
    const buckets = [];
    if (period === '7') {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - 6);
        for (let offset = 0; offset < 7; offset++) {
            const bucketStart = new Date(start);
            bucketStart.setDate(start.getDate() + offset);
            const bucketEnd = new Date(bucketStart);
            bucketEnd.setDate(bucketEnd.getDate() + 1);
            buckets.push({
                start: bucketStart,
                end: bucketEnd,
                label: bucketStart.toLocaleDateString('es-VE', { weekday: 'short' }).replace('.', ''),
                revenue: 0
            });
        }
        document.getElementById('dashboard-chart-unit').textContent = 'Por día · VES';
    } else if (period === 'all') {
        const firstMonth = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        for (let offset = 0; offset < 12; offset++) {
            const bucketStart = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + offset, 1);
            buckets.push({
                start: bucketStart,
                end: new Date(bucketStart.getFullYear(), bucketStart.getMonth() + 1, 1),
                label: bucketStart.toLocaleDateString('es-VE', { month: 'short' }).replace('.', ''),
                revenue: 0
            });
        }
        document.getElementById('dashboard-chart-unit').textContent = 'Últimos 12 meses · VES';
    } else {
        const days = Number(period);
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - days + 1);
        const bucketCount = Math.ceil(days / 7);
        for (let offset = 0; offset < bucketCount; offset++) {
            const bucketStart = new Date(start);
            bucketStart.setDate(start.getDate() + offset * 7);
            const bucketEnd = new Date(bucketStart);
            bucketEnd.setDate(bucketEnd.getDate() + 7);
            buckets.push({
                start: bucketStart,
                end: bucketEnd,
                label: `${bucketStart.getDate()}/${bucketStart.getMonth() + 1}`,
                revenue: 0
            });
        }
        document.getElementById('dashboard-chart-unit').textContent = 'Por semana · VES';
    }

    reportOrders
        .filter(order => ['approved', 'completed'].includes(order.status))
        .forEach(order => {
            const createdAt = new Date(order.created_at);
            const bucket = buckets.find(item => createdAt >= item.start && createdAt < item.end);
            if (bucket) bucket.revenue += Number(order.total_ves || 0);
        });
    return buckets;
}

function renderDashboardReport() {
    const reportOrders = getDashboardReportOrders();
    const paidOrders = reportOrders.filter(order => ['approved', 'completed'].includes(order.status));
    const totalVes = paidOrders.reduce((total, order) => total + Number(order.total_ves || 0), 0);
    const totalUsd = paidOrders.reduce((total, order) => total + Number(order.total_usd || 0), 0);
    const averageVes = paidOrders.length ? totalVes / paidOrders.length : 0;
    const averageUsd = paidOrders.length ? totalUsd / paidOrders.length : 0;
    const period = document.getElementById('dashboard-period').value;
    const periodLabel = period === 'all'
        ? 'Todo el historial disponible'
        : `Últimos ${period} días`;

    document.getElementById('dashboard-report-period').textContent = `${periodLabel} · ${reportOrders.length} pedido${reportOrders.length === 1 ? '' : 's'}`;
    document.getElementById('dashboard-period-orders').textContent = reportOrders.length;
    document.getElementById('dashboard-period-sales-count').textContent = paidOrders.length;
    document.getElementById('dashboard-period-revenue').textContent = `${formatVes(totalVes)} VES`;
    document.getElementById('dashboard-period-revenue-usd').textContent = `$${totalUsd.toFixed(2)} USD`;
    document.getElementById('dashboard-period-average').textContent = `${formatVes(averageVes)} VES`;
    document.getElementById('dashboard-period-average').title = `$${averageUsd.toFixed(2)} USD`;

    renderDashboardSalesChart(getDashboardTrendBuckets(reportOrders));
    renderDashboardTopProducts(paidOrders);
}

function renderDashboardSalesChart(buckets) {
    const chart = document.getElementById('dashboard-sales-chart');
    const maximum = Math.max(...buckets.map(bucket => bucket.revenue), 0);
    if (!maximum) {
        chart.innerHTML = '<p class="py-8 text-center text-xs text-slate-500">No hay ventas aprobadas en este período.</p>';
        return;
    }

    chart.innerHTML = `<div class="grid h-40 items-end gap-1.5" style="grid-template-columns:repeat(${buckets.length},minmax(0,1fr))">${buckets.map(bucket => {
        const height = bucket.revenue ? Math.max(5, Math.round(bucket.revenue / maximum * 100)) : 0;
        const label = `${bucket.label}: ${formatVes(bucket.revenue)} VES`;
        return `<div class="flex h-full min-w-0 flex-col items-center justify-end gap-2" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
            <span class="w-full truncate text-center text-[8px] text-slate-500">${bucket.revenue ? formatVes(bucket.revenue) : ''}</span>
            <span class="w-full max-w-10 rounded-t-md bg-violet-400/80 transition-all" style="height:${height}%;min-height:${bucket.revenue ? '4px' : '0'}"></span>
            <span class="w-full truncate text-center text-[9px] text-slate-400">${escapeHtml(bucket.label)}</span>
        </div>`;
    }).join('')}</div>`;
}

function renderDashboardTopProducts(paidOrders) {
    const list = document.getElementById('dashboard-top-products');
    const totals = new Map();
    paidOrders.forEach(order => {
        (order.order_items || []).forEach(item => {
            const name = String(item.product_name || 'Producto');
            const current = totals.get(name) || { quantity: 0, revenueUsd: 0 };
            current.quantity += Number(item.quantity || 0);
            current.revenueUsd += Number(item.line_total_usd || 0);
            totals.set(name, current);
        });
    });

    const topProducts = [...totals.entries()]
        .map(([name, values]) => ({ name, ...values }))
        .sort((a, b) => b.quantity - a.quantity || b.revenueUsd - a.revenueUsd)
        .slice(0, 5);
    if (!topProducts.length) {
        list.innerHTML = '<li class="text-xs text-slate-500">No hay productos vendidos en este período.</li>';
        return;
    }

    const maximum = topProducts[0].quantity;
    list.innerHTML = topProducts.map((product, index) => {
        const width = Math.max(4, Math.round(product.quantity / maximum * 100));
        return `<li>
            <div class="flex items-center justify-between gap-3 text-[10px]">
                <span class="min-w-0 truncate text-slate-200">${index + 1}. ${escapeHtml(product.name)}</span>
                <strong class="shrink-0 text-violet-200">${product.quantity} u.</strong>
            </div>
            <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800"><span class="block h-full rounded-full bg-violet-400" style="width:${width}%"></span></div>
        </li>`;
    }).join('');
}

function exportDashboardReport() {
    if (!ordersLoaded) {
        window.alert('Espera a que termine de cargar el reporte.');
        return;
    }
    const reportOrders = getDashboardReportOrders();
    const headers = ['ID', 'Fecha', 'Cliente', 'Telefono', 'Estado', 'Metodo de pago', 'Total USD', 'Total VES', 'Productos'];
    const rows = reportOrders.map(order => [
        order.id,
        new Date(order.created_at).toLocaleString('es-VE'),
        order.customer_name,
        order.customer_phone,
        order.status,
        order.payment_method,
        Number(order.total_usd || 0).toFixed(2),
        Number(order.total_ves || 0).toFixed(2),
        (order.order_items || []).map(item => `${item.quantity}x ${item.product_name}`).join('; ')
    ]);
    const csvValue = value => {
        const text = String(value ?? '');
        const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
        return `"${safeText.replace(/"/g, '""')}"`;
    };
    const csv = `\uFEFF${[headers, ...rows].map(row => row.map(csvValue).join(',')).join('\r\n')}`;
    const blobUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `reporte-pedidos-${document.getElementById('dashboard-period').value}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
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
    const pending = order.status === 'pending';

    return `<article class="rounded-2xl border ${pending ? 'border-amber-400/60 bg-amber-950/20 shadow-lg shadow-amber-950/20' : 'border-slate-800 bg-slate-900 shadow-xl'} p-5">
        <div class="flex flex-wrap items-start gap-3">
            <label class="pt-1"><input type="checkbox" class="order-check h-5 w-5" data-id="${order.id}" ${selectedOrderIds.has(order.id) ? 'checked' : ''}></label>
            <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        ${pending ? '<span class="mb-1 inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-amber-200"><i class="fa-solid fa-bell" aria-hidden="true"></i> Requiere revisión</span>' : ''}
                        <div class="text-xs text-slate-500">${new Date(order.created_at).toLocaleString('es-VE')}</div>
                        <h3 class="mt-1 font-black">${escapeHtml(order.customer_name)}</h3>
                        <div class="mt-1 text-xs text-slate-400">${escapeHtml(order.customer_phone)} · ${order.payment_method === 'pago_movil' ? 'Pago Móvil' : 'Transferencia'}</div>
                    </div>
                    <div class="text-right">${statusBadge(order.status)}<div class="text-xl font-black text-violet-300 mt-2">Bs. ${formatVes(order.total_ves)}</div><div class="text-[10px] text-slate-500">$${Number(order.total_usd).toFixed(2)} · tasa ${formatVes(order.exchange_rate)}</div></div>
                </div>
                <ul class="border-t border-slate-800 mt-4 pt-4 space-y-1 text-xs text-slate-300">${items}</ul>
                <div class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 mt-4 pt-4">
                    <button type="button" data-order-details-id="${escapeHtml(order.id)}" class="order-details-button rounded-xl border border-violet-400/40 px-3 py-2 text-xs font-bold text-violet-200 hover:bg-violet-500/10"><i class="fa-solid fa-eye mr-2" aria-hidden="true"></i>Ver detalles</button>
                    ${receiptButton}
                    <div class="ml-auto flex flex-wrap gap-2">${actions}<button data-delete-id="${escapeHtml(order.id)}" class="delete-order rounded-xl border border-red-500/40 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/10">Eliminar</button></div>
                </div>
            </div>
        </div>
    </article>`;
}

function appendOrderDetail(label, value) {
    const wrapper = document.createElement('div');
    wrapper.className = 'rounded-xl border border-slate-800 bg-slate-950/50 p-3';
    const title = document.createElement('p');
    title.className = 'text-[10px] font-bold uppercase tracking-wide text-slate-500';
    title.textContent = label;
    const content = document.createElement('p');
    content.className = 'mt-1 break-words text-sm font-semibold text-slate-100';
    content.textContent = value;
    wrapper.append(title, content);
    orderDetailsCustomer.append(wrapper);
}

async function openOrderDetails(orderId) {
    const order = orders.find(item => item.id === orderId);
    if (!order) {
        ordersStatus.textContent = 'No se encontró el pedido para mostrar sus detalles.';
        return;
    }

    const requestId = ++orderDetailsRequest;
    const closeButton = document.getElementById('close-order-details');
    orderDetailsSubtitle.textContent = `Pedido ${order.id}`;
    orderDetailsCustomer.replaceChildren();
    orderDetailsItems.replaceChildren();
    orderDetailsReceipt.replaceChildren();

    appendOrderDetail('Cliente', order.customer_name);
    appendOrderDetail('Teléfono', order.customer_phone);
    appendOrderDetail('Recibido', new Date(order.created_at).toLocaleString('es-VE'));
    appendOrderDetail('Estado', { pending: 'Pendiente de revisión', approved: 'Aprobado', rejected: 'Rechazado', completed: 'Completado' }[order.status] || order.status);
    appendOrderDetail('Método de pago', order.payment_method === 'pago_movil' ? 'Pago Móvil' : 'Transferencia');
    const receipt = order.payment_receipts?.[0];
    if (receipt?.reference_number) appendOrderDetail('Referencia de pago', receipt.reference_number);
    if (order.notes) appendOrderDetail('Notas', order.notes);

    const itemsHeading = document.createElement('h4');
    itemsHeading.className = 'mb-3 text-sm font-black';
    itemsHeading.textContent = 'Productos del pedido';
    const itemsList = document.createElement('ul');
    itemsList.className = 'space-y-2';
    (order.order_items || []).forEach(item => {
        const row = document.createElement('li');
        row.className = 'flex flex-wrap justify-between gap-2 rounded-lg bg-slate-950/50 px-3 py-2 text-xs';
        const description = document.createElement('span');
        description.className = 'text-slate-200';
        description.textContent = `${item.quantity} × ${item.product_name} · $${Number(item.unit_price_usd).toFixed(2)} c/u`;
        const total = document.createElement('strong');
        total.className = 'text-slate-300';
        total.textContent = `$${Number(item.line_total_usd).toFixed(2)}`;
        row.append(description, total);
        itemsList.append(row);
    });
    const total = document.createElement('p');
    total.className = 'mt-3 text-right text-sm font-black text-violet-200';
    total.textContent = `Total: Bs. ${formatVes(order.total_ves)} · $${Number(order.total_usd).toFixed(2)}`;
    orderDetailsItems.append(itemsHeading, itemsList, total);

    const receiptHeading = document.createElement('h4');
    receiptHeading.className = 'mb-3 text-sm font-black';
    receiptHeading.textContent = 'Comprobante de pago';
    orderDetailsReceipt.append(receiptHeading);
    const loadingMessage = document.createElement('p');
    loadingMessage.className = 'text-xs text-slate-400';
    loadingMessage.textContent = receipt ? 'Cargando comprobante seguro…' : 'Este pedido no tiene comprobante adjunto.';
    orderDetailsReceipt.append(loadingMessage);

    orderDetailsDialog.classList.remove('hidden');
    orderDetailsDialog.classList.add('flex');
    closeButton.focus();
    if (!receipt) return;

    try {
        const { data, error } = await supabaseClient.storage.from('payment-receipts')
            .createSignedUrl(receipt.storage_path, 300);
        if (error) throw error;
        if (requestId !== orderDetailsRequest || orderDetailsDialog.classList.contains('hidden')) return;

        const preview = receipt.mime_type?.startsWith('image/')
            ? document.createElement('img')
            : receipt.mime_type === 'application/pdf'
                ? document.createElement('iframe')
                : null;
        if (preview) {
            preview.className = 'max-h-[55vh] w-full rounded-xl border border-slate-800 bg-slate-950 object-contain';
            if (preview instanceof HTMLImageElement) {
                preview.alt = `Comprobante de pago de ${order.customer_name}`;
                preview.src = data.signedUrl;
            } else {
                preview.title = `Comprobante de pago de ${order.customer_name}`;
                preview.src = data.signedUrl;
                preview.height = 480;
            }
            orderDetailsReceipt.replaceChildren(receiptHeading, preview);
        }

        const link = document.createElement('a');
        link.className = 'mt-3 inline-flex rounded-lg border border-violet-400/40 px-3 py-2 text-xs font-bold text-violet-200 hover:bg-violet-500/10';
        link.href = data.signedUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Abrir comprobante en otra pestaña';
        orderDetailsReceipt.append(link);
    } catch (error) {
        if (requestId !== orderDetailsRequest) return;
        console.error('Error abriendo el comprobante del pedido:', error);
        loadingMessage.textContent = error.message || 'No se pudo cargar el comprobante.';
        loadingMessage.className = 'text-xs text-red-300';
    }
}

function closeOrderDetails() {
    orderDetailsRequest++;
    orderDetailsDialog.classList.add('hidden');
    orderDetailsDialog.classList.remove('flex');
}

function renderAdminInventory() {
    const query = inventorySearch.value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    const filteredProducts = inventoryProducts.filter(product => {
        const searchableText = `${product.product_name} ${product.product_id}`
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLocaleLowerCase('es');
        return searchableText.includes(query)
            && (!showLowStockOnly || product.stock <= product.min_stock);
    });
    filterLowStockButton.setAttribute('aria-pressed', String(showLowStockOnly));
    filterLowStockButton.querySelector('span').textContent = showLowStockOnly
        ? 'Ver todos los productos'
        : 'Mostrar solo productos por reponer';

    inventoryList.innerHTML = filteredProducts.length ? filteredProducts.map(product => {
        const lowStock = product.stock <= product.min_stock;
        const stockLabel = product.stock === 0 ? 'Agotado' : lowStock ? 'Stock bajo · reponer pronto' : `${product.stock} disponibles`;
        return `
            <article class="inventory-product min-w-0 rounded-2xl border ${lowStock ? 'border-amber-500/40 bg-amber-500/5' : 'border-slate-800 bg-slate-900'} p-4" data-product-id="${escapeHtml(product.product_id)}">
                <div class="min-w-0">
                    <div class="flex flex-wrap items-start justify-between gap-2">
                        <h3 class="min-w-0 break-words text-sm font-bold leading-snug text-slate-100">${escapeHtml(product.product_name)}</h3>
                        ${lowStock ? '<span class="shrink-0 rounded-full bg-amber-500/15 px-2 py-1 text-[9px] font-black uppercase text-amber-200">Reponer</span>' : ''}
                    </div>
                    <p class="mt-1 text-[11px] leading-snug text-slate-400">Código ${escapeHtml(product.product_id)} · <span class="${lowStock ? 'text-amber-300' : 'text-emerald-300'}">${stockLabel}</span></p>
                </div>
                <form class="inventory-stock-form mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/70 pt-3" data-product-id="${escapeHtml(product.product_id)}">
                    <label class="text-[11px] font-bold text-slate-400" for="stock-${escapeHtml(product.product_id)}">Existencias</label>
                    <div class="flex shrink-0 items-center gap-2">
                        <input id="stock-${escapeHtml(product.product_id)}" class="inventory-quantity w-[4.5rem] shrink-0 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-center text-sm text-white outline-none focus:border-emerald-400" type="number" min="0" max="99999" step="1" value="${product.stock}" required>
                        <button class="inventory-save whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-50" type="submit">Guardar</button>
                    </div>
                </form>
                <form class="inventory-min-stock-form mt-2 flex flex-wrap items-center justify-between gap-2" data-product-id="${escapeHtml(product.product_id)}">
                    <label class="text-[11px] font-bold text-slate-400" for="min-stock-${escapeHtml(product.product_id)}">Avisarme al llegar a</label>
                    <div class="flex shrink-0 items-center gap-2">
                        <input id="min-stock-${escapeHtml(product.product_id)}" class="inventory-min-quantity w-[4.5rem] shrink-0 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-center text-sm text-white outline-none focus:border-amber-400" type="number" min="0" max="99999" step="1" value="${product.min_stock}" required>
                        <button class="inventory-min-save whitespace-nowrap rounded-lg border border-amber-500/40 px-3 py-2 text-xs font-bold text-amber-200 transition hover:bg-amber-500/10 disabled:cursor-wait disabled:opacity-50" type="submit">Guardar mínimo</button>
                    </div>
                </form>
                <button class="stock-history-button mt-3 w-full rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 transition hover:bg-slate-800" type="button" data-product-id="${escapeHtml(product.product_id)}">
                    <i class="fa-solid fa-clock-rotate-left mr-2" aria-hidden="true"></i>Ver historial
                </button>
            </article>`;
    }).join('') : `<div class="rounded-2xl border border-slate-800 p-6 text-center text-sm text-slate-400 md:col-span-2 2xl:col-span-3">${inventoryProducts.length ? 'No se encontraron productos con esos filtros.' : 'No hay productos registrados en el inventario.'}</div>`;

    inventoryStatus.textContent = query
        ? `${filteredProducts.length} resultado${filteredProducts.length === 1 ? '' : 's'} de ${inventoryProducts.length} productos${showLowStockOnly ? ' por reponer' : ''}.`
        : showLowStockOnly
            ? `${filteredProducts.length} producto${filteredProducts.length === 1 ? '' : 's'} por reponer de ${inventoryProducts.length}.`
            : `${inventoryProducts.length} productos · los cambios se guardan individualmente.`;
}

async function loadAdminInventory() {
    inventoryStatus.textContent = 'Cargando inventario...';
    dashboardInventoryMessage = 'Actualizando inventario…';
    renderAdminDashboard();
    try {
        const { data, error } = await supabaseClient
            .from('product_inventory')
            .select('product_id, product_name, stock, min_stock')
            .order('product_name');
        if (error) throw error;

        inventoryProducts = (data || []).map(product => ({
            ...product,
            stock: Number(product.stock),
            min_stock: Number(product.min_stock)
        }));
        inventoryLoaded = true;
        renderAdminInventory();
        renderAdminDashboard();
        inventoryStatus.textContent = `${inventoryProducts.length} productos · los cambios se guardan individualmente.`;
    } catch (error) {
        inventoryStatus.textContent = 'No se pudo cargar el inventario. Verifica que ejecutaste la migración SQL.';
        dashboardInventoryMessage = 'No se pudo cargar el inventario.';
        renderAdminDashboard();
        console.error('Error cargando el inventario:', error);
        return;
    }
}

async function saveProductStock(form) {
    const productId = form.dataset.productId;
    const input = form.querySelector('.inventory-quantity');
    const saveButton = form.querySelector('.inventory-save');
    const stock = Number(input.value);

    if (!productId || !Number.isInteger(stock) || stock < 0 || stock > 99999) {
        inventoryStatus.textContent = 'Ingresa una cantidad entera entre 0 y 99999.';
        input.focus();
        return;
    }

    saveButton.disabled = true;
    inventoryStatus.textContent = 'Guardando existencia...';
    try {
        const { data, error } = await supabaseClient.rpc('admin_set_product_stock', {
            p_product_id: productId,
            p_stock: stock
        });
        if (error) throw error;

        const product = inventoryProducts.find(item => item.product_id === productId);
        if (product) product.stock = Number(data);
        renderAdminInventory();
        renderAdminDashboard();
        inventoryStatus.textContent = `Inventario actualizado: ${product?.product_name || productId} · ${Number(data)} unidades.`;
    } catch (error) {
        console.error('Error guardando la existencia:', error);
        inventoryStatus.textContent = error.message || 'No se pudo guardar la existencia.';
    } finally {
        saveButton.disabled = false;
    }
}

async function saveProductMinStock(form) {
    const productId = form.dataset.productId;
    const input = form.querySelector('.inventory-min-quantity');
    const saveButton = form.querySelector('.inventory-min-save');
    const minStock = Number(input.value);

    if (!productId || !Number.isInteger(minStock) || minStock < 0 || minStock > 99999) {
        inventoryStatus.textContent = 'Ingresa un mínimo entero entre 0 y 99999.';
        input.focus();
        return;
    }

    saveButton.disabled = true;
    inventoryStatus.textContent = 'Guardando el mínimo de reposición...';
    try {
        const { data, error } = await supabaseClient.rpc('admin_set_product_min_stock', {
            p_product_id: productId,
            p_min_stock: minStock
        });
        if (error) throw error;

        const product = inventoryProducts.find(item => item.product_id === productId);
        if (product) product.min_stock = Number(data);
        renderAdminInventory();
        renderAdminDashboard();
        inventoryStatus.textContent = `Mínimo actualizado: ${product?.product_name || productId} · ${Number(data)} unidades.`;
    } catch (error) {
        console.error('Error guardando el mínimo de reposición:', error);
        inventoryStatus.textContent = error.message || 'No se pudo guardar el mínimo de reposición.';
    } finally {
        saveButton.disabled = false;
    }
}

async function openStockHistory(productId) {
    const product = inventoryProducts.find(item => item.product_id === productId);
    if (!product) {
        inventoryStatus.textContent = 'No se encontró el producto para consultar su historial.';
        return;
    }

    stockHistoryProduct.textContent = `${product.product_name} · Código ${product.product_id}`;
    stockHistoryStatus.textContent = 'Cargando movimientos...';
    stockHistoryList.replaceChildren();
    stockHistoryDialog.classList.remove('hidden');
    stockHistoryDialog.classList.add('flex');
    document.getElementById('close-stock-history').focus();

    try {
        const { data, error } = await supabaseClient.rpc('admin_get_product_stock_history', {
            p_product_id: productId,
            p_limit: 100
        });
        if (error) throw error;

        const entries = data || [];
        if (!entries.length) {
            stockHistoryStatus.textContent = 'Todavía no hay movimientos registrados para este producto. El historial empieza desde que se aplicó esta migración.';
            return;
        }

        entries.forEach(entry => {
            const item = document.createElement('li');
            item.className = 'rounded-xl border border-slate-800 bg-slate-950/60 p-4';

            const header = document.createElement('div');
            header.className = 'flex flex-wrap items-center justify-between gap-2';
            const change = document.createElement('strong');
            const quantityChange = Number(entry.quantity_change);
            change.className = `text-sm font-black ${quantityChange < 0 ? 'text-red-300' : 'text-emerald-300'}`;
            change.textContent = `${quantityChange > 0 ? '+' : ''}${quantityChange} unidades`;
            const timestamp = document.createElement('time');
            timestamp.className = 'text-[11px] text-slate-400';
            timestamp.dateTime = entry.changed_at;
            timestamp.textContent = new Date(entry.changed_at).toLocaleString('es-VE', {
                dateStyle: 'medium',
                timeStyle: 'short'
            });
            header.append(change, timestamp);

            const details = document.createElement('p');
            details.className = 'mt-2 text-xs text-slate-300';
            details.textContent = `Existencias: ${entry.previous_stock} → ${entry.new_stock}`;
            const source = document.createElement('p');
            source.className = 'mt-1 text-[11px] text-slate-500';
            source.textContent = `${entry.change_source} · ${entry.actor_email || 'Administrador'}`;
            item.append(header, details, source);
            stockHistoryList.append(item);
        });
        stockHistoryStatus.textContent = `${entries.length} movimiento${entries.length === 1 ? '' : 's'} recientes (máximo 100).`;
    } catch (error) {
        console.error('Error cargando el historial de existencias:', error);
        stockHistoryStatus.textContent = error.message || 'No se pudo cargar el historial de existencias.';
    }
}

function closeStockHistory() {
    stockHistoryDialog.classList.add('hidden');
    stockHistoryDialog.classList.remove('flex');
}

async function updateOrderStatus(ids, status) {
    if (!ids.length) {
        alert('Selecciona al menos un pedido.');
        return;
    }
    if (!['approved', 'rejected', 'completed'].includes(status)) {
        ordersStatus.textContent = 'Estado de pedido no permitido.';
        return;
    }

    const expectedStatus = status === 'completed' ? 'approved' : 'pending';
    const eligibleIds = ids.filter(id => orders.some(order => order.id === id && order.status === expectedStatus));
    const skipped = ids.length - eligibleIds.length;
    const failures = [];
    let updated = 0;
    ordersStatus.textContent = status === 'approved' ? 'Aprobando pedidos y comprobando existencias...' : 'Actualizando pedidos...';

    for (const id of eligibleIds) {
        try {
            const { error } = status === 'approved'
                ? await supabaseClient.rpc('admin_approve_order_with_inventory', { p_order_id: id })
                : await supabaseClient.rpc('admin_set_order_status', { p_order_id: id, p_status: status });
            if (error) throw error;
            updated++;
        } catch (error) {
            const message = typeof error === 'object' && error !== null
                && 'message' in error && typeof error.message === 'string'
                ? error.message
                : `Pedido ${id}`;
            failures.push(message);
            console.error(`No se pudo actualizar el pedido ${id}:`, error);
        }
    }

    selectedOrderIds.clear();
    await Promise.all([
        loadOrders(),
        status === 'approved' ? loadAdminInventory() : Promise.resolve()
    ]);
    const resultParts = [];
    const statusLabel = { approved: 'aprobado', rejected: 'rechazado', completed: 'completado' }[status];
    if (updated) {
        const inventoryNote = status === 'approved' ? ' y stock descontado' : '';
        resultParts.push(`${updated} pedido${updated === 1 ? '' : 's'} ${statusLabel}${updated === 1 ? '' : 's'}${inventoryNote}.`);
    }
    if (failures.length) resultParts.push(`${failures.length} ${failures.length === 1 ? 'no se pudo' : 'no se pudieron'} actualizar: ${failures.join(' · ')}`);
    if (skipped) resultParts.push(`${skipped} pedido${skipped === 1 ? '' : 's'} omitido${skipped === 1 ? '' : 's'} por tener un estado distinto.`);
    ordersStatus.textContent = resultParts.join(' ') || 'No hay pedidos seleccionados para ese cambio de estado.';
}

async function deleteOrders(ids, { confirmed = false } = {}) {
    if (!ids.length) {
        alert('Selecciona al menos un pedido.');
        return;
    }
    if (!confirmed && !confirm(`¿Eliminar ${ids.length} pedido${ids.length === 1 ? '' : 's'} definitivamente?`)) return;

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

function openBulkActionConfirmation(action, ids) {
    if (!ids.length) {
        ordersStatus.textContent = 'Selecciona al menos un pedido antes de realizar una acción masiva.';
        return;
    }

    const pendingCount = ids.filter(id => orders.some(order => order.id === id && order.status === 'pending')).length;
    const pendingSummary = `${pendingCount} pendiente${pendingCount === 1 ? '' : 's'} podrá${pendingCount === 1 ? '' : 'n'}`;
    const labels = {
        approved: {
            title: '¿Aprobar pedidos seleccionados?',
            message: 'Se aprobarán los pedidos pendientes seleccionados y se descontarán las existencias correspondientes.',
            button: 'Confirmar aprobación',
            buttonClass: 'bg-emerald-600 hover:bg-emerald-500',
            iconClass: 'bg-emerald-400/15 text-emerald-300',
            summary: `${ids.length} seleccionado${ids.length === 1 ? '' : 's'} · ${pendingSummary} aprobarse.`
        },
        rejected: {
            title: '¿Rechazar pedidos seleccionados?',
            message: 'Se rechazarán los pedidos pendientes seleccionados. Esta acción no descuenta existencias.',
            button: 'Confirmar rechazo',
            buttonClass: 'bg-red-700 hover:bg-red-600',
            iconClass: 'bg-red-400/15 text-red-300',
            summary: `${ids.length} seleccionado${ids.length === 1 ? '' : 's'} · ${pendingSummary} rechazarse.`
        },
        delete: {
            title: '¿Eliminar pedidos seleccionados?',
            message: 'Se eliminarán definitivamente los pedidos seleccionados y se intentará borrar sus comprobantes. No se puede deshacer.',
            button: 'Eliminar definitivamente',
            buttonClass: 'bg-red-700 hover:bg-red-600',
            iconClass: 'bg-red-400/15 text-red-300',
            summary: `${ids.length} pedido${ids.length === 1 ? '' : 's'} seleccionado${ids.length === 1 ? '' : 's'}. Eliminar un pedido aprobado no repone automáticamente el inventario.`
        }
    }[action];

    if (!labels) {
        ordersStatus.textContent = 'Acción masiva no permitida.';
        return;
    }

    pendingBulkAction = { action, ids: [...ids] };
    document.getElementById('bulk-action-title').textContent = labels.title;
    document.getElementById('bulk-action-message').textContent = labels.message;
    document.getElementById('bulk-action-summary').textContent = labels.summary;
    const icon = document.getElementById('bulk-action-icon');
    icon.className = `flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${labels.iconClass}`;
    icon.innerHTML = `<i class="fa-solid ${action === 'approved' ? 'fa-circle-check' : action === 'rejected' ? 'fa-ban' : 'fa-trash'}" aria-hidden="true"></i>`;
    const confirmButton = document.getElementById('bulk-action-confirm');
    confirmButton.textContent = labels.button;
    confirmButton.className = `rounded-xl px-4 py-2 text-xs font-bold text-white ${labels.buttonClass}`;
    bulkActionDialog.classList.remove('hidden');
    bulkActionDialog.classList.add('flex');
    document.getElementById('bulk-action-cancel').focus();
}

function closeBulkActionConfirmation() {
    pendingBulkAction = null;
    bulkActionDialog.classList.add('hidden');
    bulkActionDialog.classList.remove('flex');
}

async function executeConfirmedBulkAction() {
    if (!pendingBulkAction) return;
    const { action, ids } = pendingBulkAction;
    closeBulkActionConfirmation();

    if (action === 'delete') {
        await deleteOrders(ids, { confirmed: true });
        return;
    }
    await updateOrderStatus(ids, action);
}

async function exportReceipts(filtered = false) {
    if (!window.JSZip) {
        ordersStatus.textContent = 'No se pudo cargar el exportador ZIP.';
        return;
    }
    let { data: receipts, error } = await supabaseClient.from('payment_receipts')
        .select('order_id, storage_path, original_name');
    if (error) {
        ordersStatus.textContent = 'No se pudieron consultar los comprobantes.';
        console.error(error);
        return;
    }

    if (filtered) {
        const filteredOrderIds = new Set(visibleOrders().map(order => order.id));
        receipts = (receipts || []).filter(receipt => filteredOrderIds.has(receipt.order_id));
    }

    if (!receipts?.length) {
        alert(filtered
            ? 'No hay comprobantes que coincidan con los filtros actuales.'
            : 'No hay comprobantes para exportar.');
        return;
    }

    ordersStatus.textContent = filtered
        ? `Preparando ${receipts.length} comprobante${receipts.length === 1 ? '' : 's'} filtrado${receipts.length === 1 ? '' : 's'}...`
        : 'Preparando archivo ZIP...';
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
    const suffix = filtered ? 'filtrados' : 'todos';
    link.download = `comprobantes-${suffix}-${new Date().toISOString().slice(0, 10)}.zip`;
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
document.getElementById('refresh-inventory').addEventListener('click', loadAdminInventory);
document.getElementById('refresh-dashboard').addEventListener('click', () => {
    Promise.all([loadOrders(), loadAdminInventory()]);
});
document.getElementById('dashboard-period').addEventListener('change', renderDashboardReport);
document.getElementById('export-dashboard-report').addEventListener('click', exportDashboardReport);
adminNavigation.addEventListener('click', event => {
    const button = event.target.closest('[data-admin-page]');
    if (!button) return;
    showAdminPage(button.dataset.adminPage);
});
ordersView.addEventListener('click', event => {
    const button = event.target.closest('[data-dashboard-page]');
    if (!button) return;

    if (button.dataset.dashboardFilter) {
        statusFilter.value = button.dataset.dashboardFilter;
        renderOrders();
    }
    if (button.dataset.dashboardLowStock === 'true') {
        showLowStockOnly = true;
        renderAdminInventory();
    }
    showAdminPage(button.dataset.dashboardPage);
});
inventorySearch.addEventListener('input', renderAdminInventory);
document.getElementById('close-stock-history').addEventListener('click', closeStockHistory);
stockHistoryDialog.addEventListener('click', event => {
    if (event.target === stockHistoryDialog) closeStockHistory();
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !stockHistoryDialog.classList.contains('hidden')) {
        closeStockHistory();
    }
});
filterLowStockButton.addEventListener('click', () => {
    showLowStockOnly = !showLowStockOnly;
    renderAdminInventory();
});
inventoryList.addEventListener('submit', event => {
    const form = event.target.closest('.inventory-stock-form, .inventory-min-stock-form');
    if (!form) return;
    event.preventDefault();
    if (form.matches('.inventory-min-stock-form')) {
        saveProductMinStock(form);
    } else {
        saveProductStock(form);
    }
});
inventoryList.addEventListener('click', event => {
    const button = event.target.closest('.stock-history-button');
    if (button) openStockHistory(button.dataset.productId);
});
document.getElementById('refresh-chats').addEventListener('click', async () => {
    await loadAdminChats();
});
adminChatPushButton.addEventListener('click', toggleAdminChatPush);
document.getElementById('admin-chat-close-conversation').addEventListener('click', async () => {
    const conversation = adminChatConversations.find(item => item.id === selectedChatId);
    if (!conversation || conversation.status !== 'open') return;
    if (!window.confirm(`¿Finalizar la conversación con ${conversation.customer_name}? El historial se conservará, pero nadie podrá enviar más mensajes en este chat.`)) return;
    const closeButton = document.getElementById('admin-chat-close-conversation');
    closeButton.disabled = true;
    chatsStatus.textContent = 'Finalizando conversación...';
    try {
        await invokeAdminChat('admin_close', { conversationId: conversation.id });
        adminChatSelectedFiles.length = 0;
        renderAdminChatSelectedFiles();
        await loadAdminChats();
        chatsStatus.textContent = 'Conversación finalizada. El historial se conservó.';
    } catch (error) {
        await loadAdminChats();
        chatsStatus.textContent = error.message || 'No se pudo finalizar la conversación.';
        console.error('Error finalizando la conversación:', error);
    } finally {
        closeButton.disabled = false;
    }
});
document.getElementById('export-receipts').addEventListener('click', () => exportReceipts(false));
document.getElementById('export-filtered-receipts').addEventListener('click', () => exportReceipts(true));
document.getElementById('bulk-approve').addEventListener('click', () => openBulkActionConfirmation('approved', [...selectedOrderIds]));
document.getElementById('bulk-reject').addEventListener('click', () => openBulkActionConfirmation('rejected', [...selectedOrderIds]));
document.getElementById('bulk-delete').addEventListener('click', () => openBulkActionConfirmation('delete', [...selectedOrderIds]));
document.getElementById('bulk-action-cancel').addEventListener('click', closeBulkActionConfirmation);
document.getElementById('bulk-action-confirm').addEventListener('click', executeConfirmedBulkAction);
bulkActionDialog.addEventListener('click', event => {
    if (event.target === bulkActionDialog) closeBulkActionConfirmation();
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !bulkActionDialog.classList.contains('hidden')) {
        closeBulkActionConfirmation();
    }
});
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

document.getElementById('chat-conversation-filters').addEventListener('click', event => {
    const button = event.target.closest('[data-chat-filter]');
    if (!button) return;
    adminChatFilter = button.dataset.chatFilter;
    renderAdminChatConversations();
});

chatConversationList.addEventListener('click', async event => {
    const button = event.target.closest('[data-chat-id]');
    if (!button) return;
    if (document.getElementById('admin-chat-send').disabled) {
        chatsStatus.textContent = 'Espera a que termine el envío antes de cambiar de conversación.';
        return;
    }
    if (selectedChatId !== button.dataset.chatId) {
        adminChatSelectedFiles.length = 0;
        renderAdminChatSelectedFiles();
    }
    selectedChatId = button.dataset.chatId;
    const conversation = adminChatConversations.find(item => item.id === selectedChatId);
    if (!conversation) return;
    renderAdminChatConversations();
    updateAdminChatHeader(conversation);
    await loadAdminChatMessages(selectedChatId);
    await loadAdminChats();
});
window.addEventListener('hashchange', openAdminChatFromHash);

const adminChatFileInput = document.getElementById('admin-chat-file-input');
const adminChatCameraInput = document.getElementById('admin-chat-camera-input');
const adminChatSelectedFilesElement = document.getElementById('admin-chat-selected-files');
const adminChatUploadStatus = document.getElementById('admin-chat-upload-status');
function renderAdminChatSelectedFiles() {
    window.ChatAttachments.renderSelectedFiles(adminChatSelectedFilesElement, adminChatSelectedFiles, index => {
        adminChatSelectedFiles.splice(index, 1);
        renderAdminChatSelectedFiles();
    });
}
function addAdminChatFiles(files) {
    const selected = Array.from(files || []);
    const error = window.ChatAttachments.validateFiles(adminChatSelectedFiles, selected);
    if (error) {
        chatsStatus.textContent = error;
        return;
    }
    chatsStatus.textContent = '';
    adminChatSelectedFiles.push(...selected);
    renderAdminChatSelectedFiles();
}
document.getElementById('admin-chat-attach').addEventListener('click', () => adminChatFileInput.click());
document.getElementById('admin-chat-camera').addEventListener('click', () => adminChatCameraInput.click());
[adminChatFileInput, adminChatCameraInput].forEach(input => input.addEventListener('change', () => {
    addAdminChatFiles(input.files);
    input.value = '';
}));

adminChatReplyForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!selectedChatId) return;
    const conversationId = selectedChatId;
    const filesToSend = [...adminChatSelectedFiles];
    const input = document.getElementById('admin-chat-reply');
    const sendButton = document.getElementById('admin-chat-send');
    const body = input.value.trim();
    if ((!body && !filesToSend.length) || sendButton.disabled) return;
    sendButton.disabled = true;
    let uploadedAttachments = [];
    try {
        if (filesToSend.length) {
            adminChatUploadStatus.classList.remove('hidden');
            uploadedAttachments = await window.ChatAttachments.uploadFiles({
                client: supabaseClient,
                audience: 'admin',
                conversationId,
                files: filesToSend,
                onProgress: message => { adminChatUploadStatus.textContent = message; }
            });
        }
        chatsStatus.textContent = 'Enviando respuesta...';
        await invokeAdminChat('admin_reply', { conversationId, body, attachments: uploadedAttachments });
        input.value = '';
        adminChatSelectedFiles.length = 0;
        renderAdminChatSelectedFiles();
        await loadAdminChatMessages(conversationId);
        await loadAdminChats();
        chatsStatus.textContent = '';
    } catch (error) {
        if (uploadedAttachments.length) {
            try {
                await window.ChatAttachments.cleanupFiles({
                    client: supabaseClient,
                    audience: 'admin',
                    conversationId,
                    attachments: uploadedAttachments
                });
            } catch (cleanupError) {
                console.error('No se pudieron limpiar los adjuntos no enviados:', cleanupError);
            }
        }
        chatsStatus.textContent = error.message || 'No se pudo enviar la respuesta.';
        console.error('Error enviando respuesta del chat:', error);
    } finally {
        adminChatUploadStatus.classList.add('hidden');
        sendButton.disabled = false;
        input.focus();
    }
});

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
    const detailsButton = event.target.closest('.order-details-button');
    const receiptButton = event.target.closest('.receipt-link');
    if (detailsButton) {
        await openOrderDetails(detailsButton.dataset.orderDetailsId);
        return;
    }
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

document.getElementById('close-order-details').addEventListener('click', closeOrderDetails);
orderDetailsDialog.addEventListener('click', event => {
    if (event.target === orderDetailsDialog) closeOrderDetails();
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !orderDetailsDialog.classList.contains('hidden')) {
        closeOrderDetails();
    }
});

supabaseClient.auth.getSession()
    .then(({ data }) => data.session ? showOrders() : showLogin())
    .catch(error => {
        console.error('Error comprobando la sesión:', error);
        loginStatus.textContent = error.message || 'No se pudo comprobar la sesión.';
    });

initTheme();
