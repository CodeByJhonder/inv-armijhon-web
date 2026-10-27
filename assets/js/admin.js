const config = window.SUPABASE_CONFIG || {};
const loginStatus = document.getElementById('login-status');
if (!window.supabase || !config.url || !config.publishableKey) {
    loginStatus.textContent = 'No se pudo cargar la conexión con Supabase. Revisa tu conexión a internet.';
    throw new Error('Supabase no está disponible o falta la configuración pública.');
}

const supabaseClient = window.supabase.createClient(config.url, config.publishableKey);
const PRODUCT_IMAGE_BUCKET = 'product-images';
const PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
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
const addProductForm = document.getElementById('add-product-form');
const addProductFormStatus = document.getElementById('add-product-form-status');
const newProductCategory = document.getElementById('new-product-category');
const newProductCategoryCustomWrap = document.getElementById('new-product-category-custom-wrap');
const newProductCategoryCustom = document.getElementById('new-product-category-custom');
const inventorySearch = document.getElementById('inventory-search');
const filterLowStockButton = document.getElementById('filter-low-stock');
const localSaleForm = document.getElementById('local-sale-form');
const localSaleLines = document.getElementById('local-sale-lines');
const localSaleCurrency = document.getElementById('local-sale-currency');
const localSaleDate = document.getElementById('local-sale-date');
const localSaleFormStatus = document.getElementById('local-sale-form-status');
const localSalesStatus = document.getElementById('local-sales-status');
const localSalesList = document.getElementById('local-sales-list');
const insuranceCasesList = document.getElementById('insurance-cases-list');
const insuranceCasesStatus = document.getElementById('insurance-cases-status');
const insuranceManualForm = document.getElementById('insurance-manual-form');
let insuranceCases = [];
const INSURANCE_DOCUMENT_BUCKET = 'insurance-documents';
const insuranceStatuses = {
    new: 'Nueva solicitud',
    documents_pending: 'Documentos pendientes',
    in_review: 'En revisión',
    quoted: 'Cotizada',
    sold: 'Póliza vendida',
    renewal_due: 'Renovación próxima',
    closed: 'Cerrada',
    cancelled: 'Cancelada'
};
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
const productCatalogImageOverrides = {
    p41: 'img/carpeta-amarilla.webp',
    p42: 'img/carpeta-marron.jpg',
    p43: 'img/cartulina-escolar-pequena.jpg',
    p44: 'img/cuadernos-pequenos.jpg',
    p45: 'img/boligrafo-crisvi-color-negro.webp',
    p46: 'img/sobre-manila-tamano-oficio.jpg',
    p47: 'img/hoja-examen-tamano-oficio.webp'
};
let inventoryProducts = [];
let localSales = [];
let localSaleServices = [];
const selectedLocalSaleIds = new Set();
let ordersLoaded = false;
let inventoryLoaded = false;
let localSaleVesBaseRate = Number(window.PAYMENT_CONFIG?.exchangeRates?.VES || window.PAYMENT_CONFIG?.exchangeRate) || 849.564;
const localSaleVesAdjustment = Number.isFinite(Number(window.PAYMENT_CONFIG?.vesRateAdjustment)) && Number(window.PAYMENT_CONFIG?.vesRateAdjustment) >= 0
    ? Number(window.PAYMENT_CONFIG.vesRateAdjustment)
    : 30;
let localSaleVesRateUpdatedAt = '';
let localSaleVesRateStatus = 'Usando tasa de respaldo configurada';
let localSaleVesRateRefreshTimer = null;
const inventoryUnitPricesUsd = {
    p1: 11.28, p2: 9.66, p3: 11.28, p4: 1.18, p5: 10, p6: 9.99, p7: 0.97, p8: 4.51,
    p9: 1.18, p10: 0.48, p11: 0.97, p12: 0.97, p13: 0.81, p14: 1.18, p15: 11.28,
    p16: 0.32, p17: 0.64, p18: 4.83, p19: 1.61, p20: 1.18, p21: 0.64, p22: 0.64,
    p23: 0.64, p24: 0.32, p25: 0.97, p26: 0.64, p27: 0.64, p28: 0.48, p29: 0.64,
    p30: 0.64, p31: 0.48, p32: 2.07, p33: 4.55, p34: 1.30, p35: 1.95, p36: 0.44,
    p37: 0.43, p38: 10, p39: 0.62, p40: 0.60, p48: 0.63
};
let promotionSummaryRequest = 0;
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

function renderInventoryValuation() {
    const totalUsd = inventoryLoaded
        ? inventoryProducts.reduce((total, product) => total + product.stock * (Number.isFinite(product.price_usd) ? product.price_usd : inventoryUnitPricesUsd[product.product_id] || 0), 0)
        : null;
    const totalCop = inventoryLoaded
        ? inventoryProducts.reduce((total, product) => total + product.stock * (Number.isFinite(product.price_cop) ? product.price_cop : 0), 0)
        : null;
    document.querySelectorAll('[data-inventory-total-usd]').forEach(element => {
        element.textContent = totalUsd === null
            ? 'Cargando…'
            : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalUsd);
    });
    document.querySelectorAll('[data-inventory-total-cop]').forEach(element => {
        element.textContent = totalCop === null
            ? 'Cargando…'
            : new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(totalCop);
    });
}

async function loadLocalSaleVesRate() {
    const ratesApiUrl = window.PAYMENT_CONFIG?.ratesApiUrl;
    if (!ratesApiUrl) return;
    try {
        const response = await fetch(`${ratesApiUrl}?v=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const rate = Number(data?.rates?.VES);
        if (!Number.isFinite(rate) || rate <= 0) throw new Error('Tasa USD/VES no valida');
        localSaleVesBaseRate = rate;
        localSaleVesRateUpdatedAt = new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
        localSaleVesRateStatus = '';
    } catch (error) {
        console.warn('No se pudo actualizar la tasa USD/VES de ventas locales:', error);
        localSaleVesRateStatus = localSaleVesRateUpdatedAt
            ? 'No se pudo actualizar; se conserva la ultima tasa disponible'
            : 'No se pudo actualizar; se usa la tasa de respaldo configurada';
    }
    updateLocalSaleCurrencyUi();
    updateLocalSaleTotalPreview();
}

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));

const normalizeSearchValue = value => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s-]/g, '');

async function uploadInsuranceDocument(file, caseId, allowPdf = false) {
    if (!file || file.size <= 0 || file.size > 5 * 1024 * 1024) {
        throw new Error('Cada foto debe pesar máximo 5 MB.');
    }
    const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', ...(allowPdf ? { 'application/pdf': 'pdf' } : {}) };
    const extension = extensions[file.type];
    if (!extension) throw new Error(allowPdf ? 'Adjunta un PDF o una imagen JPG, PNG o WebP.' : 'Adjunta una foto JPG, PNG o WebP.');
    const path = `${caseId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabaseClient.storage.from(INSURANCE_DOCUMENT_BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false
    });
    if (error) throw error;
    return { path, name: file.name.replace(/[\\/\r\n]/g, '_').slice(0, 160) || `documento.${extension}` };
}

function setInsuranceDate(input) {
    if (!input) return;
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    input.value = today.toISOString().slice(0, 10);
}

function renderInsuranceCases() {
    if (!insuranceCasesList) return;
    const query = normalizeSearchValue(document.getElementById('insurance-search').value);
    const statusFilterValue = document.getElementById('insurance-status-filter').value;
    const filtered = insuranceCases.filter(item => {
        const searchable = normalizeSearchValue([
            item.ally, item.customer_phone, item.customer_email, item.customer_address,
            item.customer_postal_code, item.license_grade, item.economic_activity,
            item.vehicle_cylinders, item.policy_number,
            item.customer_name, item.vehicle_make, item.vehicle_model, item.vehicle_plate
        ].join(' '));
        return (!query || searchable.includes(query)) && (statusFilterValue === 'all' || item.status === statusFilterValue);
    });

    insuranceCasesList.innerHTML = filtered.length ? filtered.map(item => {
        const statusOptions = Object.entries(insuranceStatuses).map(([value, label]) =>
            `<option value="${value}" ${item.status === value ? 'selected' : ''}>${label}</option>`
        ).join('');
        const sourceLabel = item.source === 'web' ? 'Formulario web' : 'Registro manual';
        const createdAt = new Intl.DateTimeFormat('es-VE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at));
        const photoButton = (field, label, name) => item[field]
            ? `<button type="button" data-insurance-document="${escapeHtml(item.id)}" data-insurance-photo="${field}" class="rounded-lg border border-sky-400/30 px-3 py-2 text-[10px] font-bold text-sky-200 hover:bg-sky-500/10"><i class="fa-solid fa-image mr-1"></i>${label}: ${escapeHtml(name || 'Abrir foto')}</button>`
            : '';
        const legacyDocument = item.document_path
            ? `<button type="button" data-insurance-document="${escapeHtml(item.id)}" data-insurance-photo="document_path" class="rounded-lg border border-sky-400/30 px-3 py-2 text-[10px] font-bold text-sky-200 hover:bg-sky-500/10"><i class="fa-solid fa-file-arrow-down mr-1"></i>${escapeHtml(item.document_name || 'Documento anterior')}</button>`
            : '';
        const title = item.ally || item.customer_name || item.customer_phone || 'Registro de seguro';
        const activityLabels = { independiente: 'Independiente', empleado: 'Empleado', socio: 'Socio' };
        const legacyDetails = item.customer_name || item.customer_document || item.vehicle_make || item.vehicle_model || item.vehicle_plate
            ? `<p class="mb-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-[10px] text-slate-400">Registro anterior: ${escapeHtml(item.customer_name || '')} ${escapeHtml(item.customer_document || '')} · ${escapeHtml([item.vehicle_make, item.vehicle_model, item.vehicle_year, item.vehicle_plate].filter(Boolean).join(' · '))}</p>`
            : '';
        return `<article class="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
            <div class="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3">
                <div class="min-w-0">
                    <p class="text-[9px] font-black uppercase tracking-widest text-emerald-300">${sourceLabel} · ${escapeHtml(createdAt)}</p>
                    <h3 class="mt-1 break-words text-base font-black">${escapeHtml(title)}</h3>
                    <p class="mt-1 text-xs text-slate-400">${escapeHtml(item.sales_location || 'Elorza, Apure')} · ${escapeHtml(item.sales_date || item.created_at?.slice(0, 10) || '')} · ${escapeHtml(item.customer_phone || '')}</p>
                </div>
            </div>
            <dl class="mb-4 grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-slate-950/60 p-3 text-[10px] sm:grid-cols-3">
                <div><dt class="text-slate-500">Dirección</dt><dd class="break-words text-slate-200">${escapeHtml(item.customer_address || '—')}</dd></div>
                <div><dt class="text-slate-500">Código postal</dt><dd class="text-slate-200">${escapeHtml(item.customer_postal_code || '—')}</dd></div>
                <div><dt class="text-slate-500">Correo</dt><dd class="break-all text-slate-200">${escapeHtml(item.customer_email || '—')}</dd></div>
                <div><dt class="text-slate-500">Grado de licencia</dt><dd class="text-slate-200">${escapeHtml(item.license_grade || '—')}</dd></div>
                <div><dt class="text-slate-500">Actividad</dt><dd class="text-slate-200">${activityLabels[item.economic_activity] || '—'}</dd></div>
                <div><dt class="text-slate-500">Cilindros</dt><dd class="text-slate-200">${escapeHtml(item.vehicle_cylinders || '—')}</dd></div>
            </dl>
            ${legacyDetails}
            ${item.request_notes ? `<p class="mb-3 rounded-lg bg-slate-950/60 p-3 text-xs leading-relaxed text-slate-300">${escapeHtml(item.request_notes)}</p>` : ''}
            <div class="mb-4 flex flex-wrap gap-2">${photoButton('identity_photo_path', 'Cédula', item.identity_photo_name)}${photoButton('circulation_card_photo_path', 'Carnet de circulación', item.circulation_card_photo_name)}${photoButton('payment_proof_path', 'Comprobante de pago', item.payment_proof_name)}${legacyDocument}${!item.identity_photo_path && !item.circulation_card_photo_path && !item.payment_proof_path && !item.document_path ? '<span class="text-[10px] text-slate-500">Sin archivos adjuntos</span>' : ''}</div>
            <div class="mb-4 flex flex-wrap gap-2" aria-label="Exportar datos del registro">
                <button type="button" data-insurance-export="${escapeHtml(item.id)}" data-format="pdf" class="rounded-lg border border-rose-400/30 px-3 py-2 text-[10px] font-bold text-rose-200 hover:bg-rose-500/10"><i class="fa-solid fa-file-pdf mr-1"></i>PDF</button>
                <button type="button" data-insurance-export="${escapeHtml(item.id)}" data-format="txt" class="rounded-lg border border-slate-500/40 px-3 py-2 text-[10px] font-bold text-slate-200 hover:bg-slate-500/10"><i class="fa-solid fa-file-lines mr-1"></i>TXT</button>
                <button type="button" data-insurance-export="${escapeHtml(item.id)}" data-format="xlsx" class="rounded-lg border border-emerald-400/30 px-3 py-2 text-[10px] font-bold text-emerald-200 hover:bg-emerald-500/10"><i class="fa-solid fa-file-excel mr-1"></i>Excel</button>
            </div>
            <form class="insurance-case-update space-y-3" data-case-id="${escapeHtml(item.id)}">
                <div class="rounded-xl border border-emerald-500/15 bg-slate-950/40 p-3">
                    <p class="mb-2 text-[9px] font-black uppercase tracking-widest text-emerald-200">Seguimiento de póliza</p>
                    <div class="grid gap-3 sm:grid-cols-2">
                        <label class="text-[10px] font-bold text-slate-400">Estado<select name="status" class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white">${statusOptions}</select></label>
                        <div class="grid grid-cols-[1fr_6rem] gap-2"><label class="text-[10px] font-bold text-slate-400">Cotización<input name="quote_amount" type="number" min="0.01" max="999999999999" step="0.01" value="${escapeHtml(item.quote_amount ?? '')}" class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"></label><label class="text-[10px] font-bold text-slate-400">Moneda<select name="quote_currency" class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white">${['USD','VES','COP'].map(currency => `<option value="${currency}" ${(item.quote_currency || 'USD') === currency ? 'selected' : ''}>${currency}</option>`).join('')}</select></label></div>
                        <label class="text-[10px] font-bold text-slate-400">Empresa aseguradora<input name="insurer" maxlength="120" value="${escapeHtml(item.insurer || '')}" class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"></label>
                        <label class="text-[10px] font-bold text-slate-400">Número de póliza<input name="policy_number" maxlength="100" value="${escapeHtml(item.policy_number || '')}" class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"></label>
                        <label class="text-[10px] font-bold text-slate-400">Vigencia desde<input name="policy_start" type="date" value="${escapeHtml(item.policy_start || '')}" class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"></label>
                        <label class="text-[10px] font-bold text-slate-400">Vigencia hasta<input name="policy_end" type="date" value="${escapeHtml(item.policy_end || '')}" class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"></label>
                        <label class="text-[10px] font-bold text-slate-400 sm:col-span-2">Notas internas<textarea name="admin_notes" maxlength="2000" rows="2" class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white">${escapeHtml(item.admin_notes || '')}</textarea></label>
                    </div>
                </div>
                <button type="submit" class="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-600 disabled:cursor-wait disabled:opacity-50"><i class="fa-solid fa-floppy-disk mr-2"></i>Guardar ficha</button>
            </form>
        </article>`;
    }).join('') : '<p class="rounded-2xl border border-slate-800 p-6 text-center text-sm text-slate-400 xl:col-span-2">No hay solicitudes que coincidan con este filtro.</p>';
}

async function loadInsuranceCases() {
    insuranceCasesStatus.textContent = 'Cargando clientes y pólizas…';
    try {
        const { data, error } = await supabaseClient.from('insurance_cases').select('*').order('created_at', { ascending: false }).limit(500);
        if (error) throw error;
        insuranceCases = data || [];
        renderInsuranceCases();
        insuranceCasesStatus.textContent = `${insuranceCases.length} ficha${insuranceCases.length === 1 ? '' : 's'} de clientes y pólizas.`;
    } catch (error) {
        insuranceCasesStatus.textContent = error.message || 'No se pudieron cargar los registros. Ejecuta la migración de seguros y actualiza el panel.';
        console.error('Error cargando clientes y pólizas:', error);
    }
}

async function registerManualInsuranceCase(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.getElementById('insurance-manual-status');
    const button = form.querySelector('button[type="submit"]');
    const values = new FormData(form);
    const phone = String(values.get('customer_phone') || '').trim();
    const identityPhoto = values.get('identity_photo');
    const circulationPhoto = values.get('circulation_card_photo');
    const paymentProof = values.get('payment_proof');
    if (!phone || !(identityPhoto instanceof File) || !identityPhoto.size || !(circulationPhoto instanceof File) || !circulationPhoto.size || !(paymentProof instanceof File) || !paymentProof.size) {
        status.textContent = 'Completa el teléfono y adjunta las fotos y el comprobante de pago.';
        return;
    }
    button.disabled = true;
    status.textContent = 'Guardando ficha…';
    const uploadedPaths = [];
    try {
        const caseId = crypto.randomUUID();
        const identityDocument = await uploadInsuranceDocument(identityPhoto, caseId);
        uploadedPaths.push(identityDocument.path);
        const circulationDocument = await uploadInsuranceDocument(circulationPhoto, caseId);
        uploadedPaths.push(circulationDocument.path);
        const paymentDocument = await uploadInsuranceDocument(paymentProof, caseId, true);
        uploadedPaths.push(paymentDocument.path);
        const { data: authData, error: authError } = await supabaseClient.auth.getUser();
        if (authError) throw authError;
        if (!authData.user) throw new Error('Inicia sesión de nuevo para guardar la ficha.');
        const { error } = await supabaseClient.from('insurance_cases').insert({
            id: caseId, source: 'admin', status: 'new',
            sales_location: String(values.get('sales_location') || '').trim(),
            ally: String(values.get('ally') || '').trim() || null,
            sales_date: String(values.get('sales_date') || ''),
            customer_address: String(values.get('customer_address') || '').trim(),
            customer_postal_code: String(values.get('customer_postal_code') || '').trim(),
            customer_email: String(values.get('customer_email') || '').trim().toLowerCase() || null,
            customer_phone: phone,
            license_grade: String(values.get('license_grade') || '').trim(),
            economic_activity: String(values.get('economic_activity') || ''),
            vehicle_cylinders: Number(values.get('vehicle_cylinders')),
            identity_photo_path: identityDocument.path,
            identity_photo_name: identityDocument.name,
            circulation_card_photo_path: circulationDocument.path,
            circulation_card_photo_name: circulationDocument.name,
            payment_proof_path: paymentDocument.path,
            payment_proof_name: paymentDocument.name,
            created_by: authData.user.id
        });
        if (error) throw error;
        form.reset();
        setInsuranceDate(form.querySelector('[name="sales_date"]'));
        status.textContent = 'Venta registrada. Ya aparece en el historial.';
        await loadInsuranceCases();
    } catch (error) {
        if (uploadedPaths.length) await supabaseClient.storage.from(INSURANCE_DOCUMENT_BUCKET).remove(uploadedPaths);
        status.textContent = error.message || 'No se pudo guardar la ficha.';
        console.error('Error registrando cliente de seguros:', error);
    } finally {
        button.disabled = false;
    }
}

async function saveInsuranceCase(form) {
    const caseId = form.dataset.caseId;
    const current = insuranceCases.find(item => item.id === caseId);
    if (!current) return;
    const data = new FormData(form);
    const quoteText = String(data.get('quote_amount') || '').trim();
    const quoteAmount = quoteText ? Number(quoteText) : null;
    const policyStart = String(data.get('policy_start') || '') || null;
    const policyEnd = String(data.get('policy_end') || '') || null;
    if (quoteText && (!Number.isFinite(quoteAmount) || quoteAmount <= 0 || quoteAmount > 999999999999)) {
        insuranceCasesStatus.textContent = 'La cotización debe ser mayor que cero y tener un monto válido.';
        return;
    }
    if (policyStart && policyEnd && policyEnd < policyStart) {
        insuranceCasesStatus.textContent = 'La fecha final de la póliza debe ser igual o posterior a la inicial.';
        return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    insuranceCasesStatus.textContent = `Guardando ficha de ${current.customer_name}…`;
    try {
        const payload = {
            status: String(data.get('status') || ''),
            quote_amount: quoteAmount,
            quote_currency: quoteAmount === null ? null : String(data.get('quote_currency') || 'USD'),
            insurer: String(data.get('insurer') || '').trim() || null,
            policy_number: String(data.get('policy_number') || '').trim() || null,
            policy_start: policyStart,
            policy_end: policyEnd,
            admin_notes: String(data.get('admin_notes') || '').trim() || null,
            updated_at: new Date().toISOString()
        };
        const { error } = await supabaseClient.from('insurance_cases').update(payload).eq('id', caseId);
        if (error) throw error;
        await loadInsuranceCases();
        insuranceCasesStatus.textContent = 'Ficha actualizada.';
    } catch (error) {
        insuranceCasesStatus.textContent = error.message || 'No se pudo actualizar la ficha.';
        console.error('Error actualizando ficha de seguros:', error);
    } finally {
        button.disabled = false;
    }
}

function insuranceCaseExportFields(item) {
    const activityLabels = { independiente: 'Independiente', empleado: 'Empleado', socio: 'Socio' };
    return [
        ['Módulo de ventas', item.sales_location || 'Elorza, Apure'],
        ['Aliado', item.ally],
        ['Fecha', item.sales_date || item.created_at?.slice(0, 10)],
        ['Dirección', item.customer_address],
        ['Código postal', item.customer_postal_code],
        ['Correo electrónico', item.customer_email],
        ['Teléfono', item.customer_phone],
        ['Grado de licencia', item.license_grade],
        ['Actividad económica', activityLabels[item.economic_activity] || item.economic_activity],
        ['Cilindros del vehículo', item.vehicle_cylinders],
        ['Estado del trámite', insuranceStatuses[item.status] || item.status],
        ['Empresa aseguradora', item.insurer],
        ['Número de póliza', item.policy_number],
        ['Vigencia desde', item.policy_start],
        ['Vigencia hasta', item.policy_end],
        ['Notas internas', item.admin_notes]
    ].map(([label, value]) => [label, value == null || value === '' ? '—' : String(value)]);
}

async function exportInsuranceCase(caseId, format, button) {
    const item = insuranceCases.find(record => record.id === caseId);
    if (!item) return;
    const fields = insuranceCaseExportFields(item);
    const safeDate = String(item.sales_date || item.created_at?.slice(0, 10) || 'registro').replace(/[^\d-]/g, '');
    const baseName = `inv-armijhon-seguro-${safeDate}-${String(item.id).slice(0, 8)}`;
    button.disabled = true;
    try {
        if (format === 'txt') {
            const text = ['INV. ARMIJHON - REGISTRO DE VENTA DE SEGURO', '', ...fields.map(([label, value]) => `${label}: ${value}`)].join('\r\n');
            downloadLocalSalesFile(new Blob([`\uFEFF${text}`], { type: 'text/plain;charset=utf-8' }), `${baseName}.txt`);
        } else if (format === 'xlsx') {
            if (!window.ExcelJS) throw new Error('No se pudo cargar Excel. Recarga la página e inténtalo de nuevo.');
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'INV. Armijhon';
            const sheet = workbook.addWorksheet('Registro', { views: [{ state: 'frozen', ySplit: 1 }] });
            sheet.columns = [{ key: 'value', width: 64 }];
            sheet.addRows(fields.map(([, value]) => [value]));
            sheet.eachRow(row => { row.alignment = { vertical: 'top', wrapText: true }; });
            const bytes = await workbook.xlsx.writeBuffer();
            downloadLocalSalesFile(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${baseName}.xlsx`);
        } else if (format === 'pdf') {
            if (!window.jspdf?.jsPDF) throw new Error('No se pudo cargar PDF. Recarga la página e inténtalo de nuevo.');
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ unit: 'mm', format: 'a4' });
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(17);
            doc.text('INV. ARMIJHON', 14, 18);
            doc.setFontSize(11);
            doc.text('REGISTRO DE VENTA DE SEGURO', 14, 26);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text(`Generado: ${localSalesFileTimestamp()}`, 14, 32);
            doc.autoTable({
                startY: 38,
                head: [['Campo', 'Dato']],
                body: fields,
                theme: 'striped',
                headStyles: { fillColor: [44, 39, 31], textColor: [247, 243, 234] },
                styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
                columnStyles: { 0: { cellWidth: 52 } },
                didDrawPage: data => {
                    const height = doc.internal.pageSize.getHeight();
                    doc.setFontSize(8);
                    doc.setTextColor(125, 119, 108);
                    doc.text('Registro privado de INV. Armijhon', 14, height - 7);
                    doc.text(`Página ${data.pageNumber}`, doc.internal.pageSize.getWidth() - 28, height - 7);
                }
            });
            doc.save(`${baseName}.pdf`);
        }
    } catch (error) {
        insuranceCasesStatus.textContent = error.message || 'No se pudo exportar el registro.';
    } finally {
        button.disabled = false;
    }
}

async function openInsuranceDocument(caseId, button) {
    const insuranceCase = insuranceCases.find(item => item.id === caseId);
    const path = insuranceCase?.[button.dataset.insurancePhoto];
    if (!path) return;
    const tab = window.open('about:blank', '_blank');
    button.disabled = true;
    try {
        const { data, error } = await supabaseClient.storage.from(INSURANCE_DOCUMENT_BUCKET)
            .createSignedUrl(path, 300);
        if (error) throw error;
        if (tab) tab.location.replace(data.signedUrl);
        else window.location.assign(data.signedUrl);
    } catch (error) {
        if (tab) tab.close();
        insuranceCasesStatus.textContent = error.message || 'No se pudo abrir el documento privado.';
    } finally {
        button.disabled = false;
    }
}

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
    loadAdminProductCategories();
    loadAdminPromotionSummary();
    loadLocalSaleVesRate();
    if (!localSaleVesRateRefreshTimer) localSaleVesRateRefreshTimer = setInterval(loadLocalSaleVesRate, window.PAYMENT_CONFIG?.ratesRefreshMs || 5 * 60 * 1000);
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
            loadAdminPromotionSummary();
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
    renderInventoryValuation();
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
        const lowStockProducts = inventoryProducts.filter(product => !product.coming_soon && product.stock <= product.min_stock).length;
        const outOfStockProducts = inventoryProducts.filter(product => !product.coming_soon && product.stock <= 0).length;
        document.getElementById('dashboard-low-stock-count').textContent = lowStockProducts;
        dashboardInventoryMessage = `${outOfStockProducts} agotados · ${inventoryProducts.length} productos registrados`;
        document.getElementById('dashboard-inventory-note').textContent = dashboardInventoryMessage;
    }
}

async function loadAdminPromotionSummary() {
    const requestId = ++promotionSummaryRequest;
    const units = document.getElementById('dashboard-promo-units-remaining');
    const visitors = document.getElementById('dashboard-promo-visitors');
    const status = document.getElementById('dashboard-promo-status');
    status.textContent = 'Consultando cupos…';

    try {
        const { data, error } = await supabaseClient.rpc('admin_launch_promo_summary');
        if (requestId !== promotionSummaryRequest) return;
        if (error) {
            units.textContent = '—';
            visitors.textContent = 'No se pudo cargar el resumen de la promoción.';
            status.textContent = 'Verifica que launch-promotion-admin-summary.sql esté aplicado en Supabase.';
            console.error('No se pudo cargar el resumen de la promoción:', error);
            return;
        }

        const visitorLimit = Number(data?.visitor_limit);
        const registeredVisitors = Number(data?.registered_visitors);
        const visitorSlotsRemaining = Number(data?.visitor_slots_remaining);
        const discountedUnitLimit = Number(data?.discounted_unit_limit);
        const reservedUnits = Number(data?.reserved_discounted_units);
        const discountedUnitsRemaining = Number(data?.discounted_units_remaining);
        if (![visitorLimit, registeredVisitors, visitorSlotsRemaining, discountedUnitLimit, reservedUnits, discountedUnitsRemaining].every(Number.isSafeInteger)) {
            units.textContent = '—';
            visitors.textContent = 'El resumen recibido no tiene un formato válido.';
            status.textContent = 'Actualiza el panel e inténtalo de nuevo.';
            console.error('Respuesta inválida del resumen de promoción:', data);
            return;
        }

        units.textContent = `${discountedUnitsRemaining} de ${discountedUnitLimit}`;
        visitors.textContent = `${visitorSlotsRemaining} visitas disponibles · ${registeredVisitors} de ${visitorLimit} registradas`;
        status.textContent = `${reservedUnits} unidad${reservedUnits === 1 ? '' : 'es'} reservada${reservedUnits === 1 ? '' : 's'}`;
    } catch (error) {
        units.textContent = '—';
        visitors.textContent = 'No se pudo cargar el resumen de la promoción.';
        status.textContent = 'Revisa tu conexión e inténtalo de nuevo.';
        console.error('Error inesperado cargando el resumen de la promoción:', error);
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
        (order.order_items || []).map(item => `${item.quantity}${item.unit === 'metro' ? ' m' : 'x'} ${item.product_name}`).join('; ')
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
        `<li>${item.quantity}${item.unit === 'metro' ? ' m' : 'x'} ${escapeHtml(item.product_name)} <span class="text-slate-500">($${Number(item.line_total_usd).toFixed(2)})</span></li>`
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
        description.textContent = `${item.quantity}${item.unit === 'metro' ? ' m' : ' ×'} ${item.product_name} · $${Number(item.unit_price_usd).toFixed(2)} ${item.unit === 'metro' ? 'por metro' : 'c/u'}`;
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
    renderInventoryValuation();
    const query = inventorySearch.value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    const filteredProducts = inventoryProducts.filter(product => {
        const searchableText = `${product.product_name} ${product.product_id}`
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLocaleLowerCase('es');
        return searchableText.includes(query)
            && (!showLowStockOnly || (!product.coming_soon && product.stock <= product.min_stock));
    });
    filterLowStockButton.setAttribute('aria-pressed', String(showLowStockOnly));
    filterLowStockButton.querySelector('span').textContent = showLowStockOnly
        ? 'Ver todos los productos'
        : 'Mostrar solo productos por reponer';

    inventoryList.innerHTML = filteredProducts.length ? filteredProducts.map(product => {
        const lowStock = !product.coming_soon && product.stock <= product.min_stock;
        const stockUnit = product.unit === 'metro' ? 'm' : 'unidades';
        const stockLabel = product.stock === 0 ? 'Agotado' : lowStock ? 'Stock bajo · reponer pronto' : `${product.stock} ${stockUnit} disponibles`;
        const unitPriceUsd = Number.isFinite(product.price_usd) ? product.price_usd : inventoryUnitPricesUsd[product.product_id];
        const productTotalUsd = Number.isFinite(unitPriceUsd) ? product.stock * unitPriceUsd : null;
        const productTotalCop = Number.isFinite(product.price_cop)
            ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(product.stock * product.price_cop)
            : 'Precio COP sin configurar';
        return `
            <article class="inventory-product min-w-0 rounded-2xl border ${lowStock ? 'border-amber-500/40 bg-amber-500/5' : 'border-slate-800 bg-slate-900'} p-4" data-product-id="${escapeHtml(product.product_id)}">
                <div class="min-w-0">
                    <div class="flex flex-wrap items-start justify-between gap-2">
                        <h3 class="min-w-0 break-words text-sm font-bold leading-snug text-slate-100">${escapeHtml(product.product_name)}</h3>
                        <button class="edit-product-name-button mt-1 rounded-md px-2 py-1 text-[10px] font-bold text-indigo-300 transition hover:bg-indigo-500/10" type="button" data-product-id="${escapeHtml(product.product_id)}" data-product-name="${escapeHtml(product.product_name)}"><i class="fa-solid fa-pen mr-1" aria-hidden="true"></i>Cambiar nombre</button>
                        ${product.coming_soon ? '<span class="shrink-0 rounded-full bg-violet-500/15 px-2 py-1 text-[9px] font-black uppercase text-violet-200">Próximamente</span>' : lowStock ? '<span class="shrink-0 rounded-full bg-amber-500/15 px-2 py-1 text-[9px] font-black uppercase text-amber-200">Reponer</span>' : ''}
                    </div>
                    <p class="mt-1 text-[11px] leading-snug text-slate-400">Código ${escapeHtml(product.product_id)} · <span class="${product.coming_soon ? 'text-violet-300' : lowStock ? 'text-amber-300' : 'text-emerald-300'}">${product.coming_soon ? 'Sin precio · no disponible para compra' : stockLabel}</span></p>
                </div>
                <div class="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <div>
                        <p class="text-[9px] font-bold uppercase tracking-wide text-slate-500">Total en USD</p>
                        <p class="mt-1 text-sm font-black text-emerald-200">${productTotalUsd === null ? 'Precio no disponible' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(productTotalUsd)}</p>
                    </div>
                    <div>
                        <p class="text-[9px] font-bold uppercase tracking-wide text-slate-500">Total en COP · precio fijo</p>
                        <p class="mt-1 text-sm font-black text-sky-200">${productTotalCop}</p>
                    </div>
                </div>
                <div class="mt-3 flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-2">
                    <img src="${escapeHtml(product.image_url && product.image_url.includes('/product-images/') ? product.image_url : (productCatalogImageOverrides[product.product_id] || product.image_url || ''))}" alt="" class="h-14 w-14 rounded-lg bg-slate-900 object-contain" loading="lazy" onerror="this.classList.add('hidden')">
                    <div class="min-w-0 flex-1">
                        <p class="text-[10px] font-bold text-slate-300">Foto del catalogo</p>
                        <p class="mt-1 text-[10px] text-slate-500">${product.image_url && product.image_url.includes('/product-images/') ? 'Guardada en Supabase' : 'Foto local o generica'}</p>
                    </div>
                    <input class="inventory-product-image-input hidden" type="file" accept="image/jpeg,image/png,image/webp" data-product-id="${escapeHtml(product.product_id)}">
                    <button class="upload-product-image-button rounded-lg border border-sky-500/30 px-3 py-2 text-[10px] font-bold text-sky-200 hover:bg-sky-500/10" type="button" data-product-id="${escapeHtml(product.product_id)}">${product.image_url && product.image_url.includes('/product-images/') ? 'Cambiar foto' : 'Subir foto'}</button>
                </div>
                <form class="inventory-catalog-form mt-3 space-y-2 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3" data-product-id="${escapeHtml(product.product_id)}">
                    <label class="block text-[10px] font-bold text-slate-400" for="catalog-price-${escapeHtml(product.product_id)}">Precio de venta en USD
                        <input id="catalog-price-${escapeHtml(product.product_id)}" name="price" type="number" min="0.01" max="999999.99" step="0.01" value="${product.price_usd ?? ''}" placeholder="Sin precio · Próximamente" class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-violet-400">
                    </label>
                    <label class="block text-[10px] font-bold text-slate-400" for="catalog-price-cop-${escapeHtml(product.product_id)}">Precio fijo de venta en pesos colombianos (COP)
                        <input id="catalog-price-cop-${escapeHtml(product.product_id)}" name="priceCop" type="number" min="1" max="999999999999" step="1" value="${product.price_cop ?? ''}" placeholder="Sin precio COP fijo" class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-sky-400">
                    </label>
                    <p class="text-[10px] leading-relaxed text-slate-500">Sin precio queda como Próximamente; al guardar un precio válido se publica para compra. La imagen está asignada en el catálogo.</p>
                    <button class="w-full rounded-lg border border-violet-400/30 px-3 py-2 text-xs font-bold text-violet-200 transition hover:bg-violet-500/10 disabled:cursor-wait disabled:opacity-50" type="submit">Guardar precios</button>
                </form>
                <form class="inventory-stock-form mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/70 pt-3" data-product-id="${escapeHtml(product.product_id)}">
                    <label class="text-[11px] font-bold text-slate-400" for="stock-${escapeHtml(product.product_id)}">${product.unit === 'metro' ? 'Existencias (metros)' : 'Existencias (unidades)'}</label>
                    <div class="flex shrink-0 items-center gap-2">
                        <input id="stock-${escapeHtml(product.product_id)}" class="inventory-quantity w-[4.5rem] shrink-0 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-center text-sm text-white outline-none focus:border-emerald-400" type="number" min="0" max="99999" step="1" value="${product.stock}" required>
                        <button class="inventory-save whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-50" type="submit">Guardar</button>
                    </div>
                </form>
                <form class="inventory-min-stock-form mt-2 flex flex-wrap items-center justify-between gap-2" data-product-id="${escapeHtml(product.product_id)}">
                    <label class="text-[11px] font-bold text-slate-400" for="min-stock-${escapeHtml(product.product_id)}">${product.unit === 'metro' ? 'Avisarme al llegar a (m)' : 'Avisarme al llegar a'}</label>
                    <div class="flex shrink-0 items-center gap-2">
                        <input id="min-stock-${escapeHtml(product.product_id)}" class="inventory-min-quantity w-[4.5rem] shrink-0 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-center text-sm text-white outline-none focus:border-amber-400" type="number" min="0" max="99999" step="1" value="${product.min_stock}" required>
                        <button class="inventory-min-save whitespace-nowrap rounded-lg border border-amber-500/40 px-3 py-2 text-xs font-bold text-amber-200 transition hover:bg-amber-500/10 disabled:cursor-wait disabled:opacity-50" type="submit">Guardar mínimo</button>
                    </div>
                </form>
                <button class="stock-history-button mt-3 w-full rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 transition hover:bg-slate-800" type="button" data-product-id="${escapeHtml(product.product_id)}">
                    <i class="fa-solid fa-clock-rotate-left mr-2" aria-hidden="true"></i>Ver historial
                </button>
                <button class="archive-product-button mt-2 w-full rounded-lg border border-red-500/40 px-3 py-2 text-xs font-bold text-red-300 transition hover:bg-red-500/10" type="button" data-product-id="${escapeHtml(product.product_id)}" data-product-name="${escapeHtml(product.product_name)}">
                    <i class="fa-solid fa-trash-can mr-2" aria-hidden="true"></i>Eliminar del inventario y catálogo
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
            .select('product_id, product_name, stock, min_stock, category_slug, price_usd, price_cop, description, unit, image_url, coming_soon, is_active')
            .eq('is_active', true)
            .order('product_name');
        if (error) throw error;

        inventoryProducts = (data || []).map(product => ({
            ...product,
            stock: Number(product.stock),
            min_stock: Number(product.min_stock),
            price_usd: product.price_usd === null ? null : Number(product.price_usd),
            price_cop: product.price_cop === null ? null : Number(product.price_cop)
        }));
        inventoryLoaded = true;
        renderLocalSaleProductOptions();
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

function localDateInputValue(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getLocalSaleDraftLines() {
    return [...localSaleLines.querySelectorAll('[data-local-sale-line]')].map(line => ({
        saleType: line.querySelector('.local-sale-line-type').value,
        productId: line.querySelector('.local-sale-line-product').value,
        serviceId: line.querySelector('.local-sale-line-service').value,
        quantity: line.querySelector('.local-sale-line-quantity').value,
        amount: line.querySelector('.local-sale-line-amount').value,
        autoAmount: line.querySelector('.local-sale-line-amount').dataset.autoFilledValue || ''
    }));
}

function renderLocalSaleProductOptions(draftLines = getLocalSaleDraftLines()) {
    if (!draftLines.length) draftLines = [{ saleType: 'product', productId: '', serviceId: '', quantity: '1', amount: '' }];
    const productOptions = inventoryProducts.filter(product => product.is_active !== false).map(product => {
        const unit = product.unit === 'metro' ? 'm' : 'unidades';
        const soon = product.coming_soon ? ' - Proximamente' : '';
        return `<option value="${escapeHtml(product.product_id)}">${escapeHtml(product.product_name)} - ${product.stock} ${unit}${soon}</option>`;
    }).join('');
    const serviceOptions = localSaleServices.map(service => `<option value="${escapeHtml(service.id)}">${escapeHtml(service.name)} (${escapeHtml(service.unit === 'pagina' ? 'por página' : service.unit === 'unidad' ? 'por unidad' : 'por servicio')})</option>`).join('');
    localSaleLines.innerHTML = draftLines.map((line, index) => `
        <div data-local-sale-line class="rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-2">
            <div class="mb-1 flex items-center justify-between">
                <p class="local-sale-line-title text-[9px] font-black uppercase tracking-wide text-slate-500">${line.saleType === 'service' ? 'Servicio' : 'Producto'} ${index + 1}</p>
                <button type="button" data-remove-local-sale-line class="rounded-md px-2 py-1 text-[10px] font-bold text-rose-300 hover:bg-rose-500/10" ${draftLines.length === 1 ? 'disabled' : ''} aria-label="Quitar línea ${index + 1}"><i class="fa-solid fa-trash" aria-hidden="true"></i> Quitar</button>
            </div>
            <div class="local-sale-line-grid">
                <label class="text-[10px] font-bold text-slate-300">Tipo
                    <select class="local-sale-line-type mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white"><option value="product">Producto</option><option value="service">Servicio</option></select>
                </label>
                <label class="local-sale-line-product-wrap text-[10px] font-bold text-slate-300">Producto del inventario
                    <select class="local-sale-line-product mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white outline-none focus:border-emerald-400"><option value="">Selecciona un producto</option>${productOptions}</select>
                </label>
                <label class="local-sale-line-service-wrap hidden text-[10px] font-bold text-slate-300">Servicio
                    <select class="local-sale-line-service mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white outline-none focus:border-emerald-400"><option value="">Selecciona un servicio</option>${serviceOptions}</select>
                </label>
                <label class="text-[10px] font-bold text-slate-300">Cantidad
                    <input class="local-sale-line-quantity mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white outline-none focus:border-emerald-400" type="number" min="1" max="99999" step="1" value="${escapeHtml(line.quantity || '1')}" required>
                </label>
                <label class="local-sale-line-amount-wrap text-[10px] font-bold text-slate-300"><span class="local-sale-line-amount-label"></span>
                    <input class="local-sale-line-amount mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white outline-none focus:border-emerald-400" type="number" min="0.01" max="999999.99" step="0.01" value="${escapeHtml(line.amount)}" data-auto-filled-value="${escapeHtml(line.autoAmount || '')}" placeholder="Ej. 1.30" required>
                </label>
            </div>
            <p class="local-sale-line-reference mt-1 min-h-4 text-[10px] text-slate-400" aria-live="polite"></p>
        </div>`).join('');
    draftLines.forEach((line, index) => {
        const row = localSaleLines.querySelectorAll('[data-local-sale-line]')[index];
        row.querySelector('.local-sale-line-type').value = line.saleType || 'product';
        row.querySelector('.local-sale-line-product').value = line.productId || '';
        row.querySelector('.local-sale-line-service').value = line.serviceId || '';
        const amountInput = row.querySelector('.local-sale-line-amount');
        if (line.autoAmount) amountInput.dataset.autoFilledValue = line.autoAmount;
        updateLocalSaleLineTypeUi(row);
    });
    document.getElementById('add-local-sale-line').disabled = draftLines.length >= 30;
    updateLocalSaleCurrencyUi();
    updateLocalSaleTotalPreview();
}

function updateLocalSaleCurrencyUi() {
    const currency = localSaleCurrency.value;
    const totalLabel = document.getElementById('local-sale-total-label');
    const rateStatus = document.getElementById('local-sale-rate');
    localSaleLines.querySelectorAll('.local-sale-line-amount-label').forEach(label => {
        const row = label.closest('[data-local-sale-line]');
        const type = row.querySelector('.local-sale-line-type').value;
        label.textContent = currency === 'COP'
            ? `Total cobrado por esta ${type === 'service' ? 'línea de servicio' : 'línea de producto'} (COP)`
            : `Precio por ${type === 'service' ? 'unidad de servicio' : 'unidad de producto'} (USD)`;
    });
    localSaleLines.querySelectorAll('.local-sale-line-amount').forEach(input => {
        input.min = currency === 'COP' ? '1' : '0.01';
        input.max = currency === 'COP' ? '999999999999' : '999999.99';
        input.step = currency === 'COP' ? '1' : '0.01';
        input.placeholder = currency === 'COP' ? 'Ej. 26000' : 'Ej. 1.30';
    });
    document.getElementById('local-sale-received-currency-label').textContent = currency;
    const receivedInput = document.getElementById('local-sale-received');
    receivedInput.step = currency === 'COP' ? '1' : '0.01';
    receivedInput.min = '0';
    receivedInput.max = currency === 'COP' ? '999999999999' : '999999999999.99';
    receivedInput.placeholder = currency === 'COP' ? 'Ej. 10000' : currency === 'VES' ? 'Ej. 1000,00' : 'Ej. 10.00';
    const appliedRate = localSaleVesBaseRate + localSaleVesAdjustment;
    const rateText = `Tasa para referencia: Bs. ${formatVes(appliedRate)} por USD (tasa automática + ajuste comercial)`;
    rateStatus.textContent = localSaleVesRateStatus
        ? `${rateText}; ${localSaleVesRateStatus}`
        : `${rateText}${localSaleVesRateUpdatedAt ? `; actualizada ${localSaleVesRateUpdatedAt}` : ''}`;
    rateStatus.classList.remove('hidden');
    if (currency === 'COP') {
        totalLabel.textContent = 'Total cobrado en pesos';
    } else if (currency === 'VES') {
        totalLabel.textContent = 'Total cobrado en bol\u00edvares';
    } else {
        totalLabel.textContent = 'Total cobrado en d\u00f3lares';
    }
}

function updateLocalSaleLineTypeUi(row) {
    const isService = row.querySelector('.local-sale-line-type').value === 'service';
    row.querySelector('.local-sale-line-product-wrap').classList.toggle('hidden', isService);
    row.querySelector('.local-sale-line-service-wrap').classList.toggle('hidden', !isService);
    row.querySelector('.local-sale-line-product').required = !isService;
    row.querySelector('.local-sale-line-service').required = isService;
    row.querySelector('.local-sale-line-title').textContent = `${isService ? 'Servicio' : 'Producto'} ${[...localSaleLines.querySelectorAll('[data-local-sale-line]')].indexOf(row) + 1}`;
}

async function loadLocalSaleServices() {
    const { data, error } = await supabaseClient.rpc('admin_list_local_sale_services');
    if (error) throw error;
    localSaleServices = data || [];
    renderLocalSaleProductOptions();
}

async function createLocalSaleService() {
    const nameInput = document.getElementById('new-local-service-name');
    const status = document.getElementById('local-service-status');
    const button = document.getElementById('save-local-service');
    const name = nameInput.value.trim();
    if (!name) { status.textContent = 'Escribe el nombre del servicio.'; return; }
    const draftLines = getLocalSaleDraftLines();
    if (draftLines.length >= 30 && !draftLines.some(line => line.saleType === 'service' && !line.serviceId)) {
        status.textContent = 'La venta ya tiene el máximo de 30 líneas. Guarda la venta antes de crear otra línea.';
        return;
    }
    button.disabled = true;
    status.textContent = 'Guardando servicio...';
    try {
        const { data, error } = await supabaseClient.rpc('admin_create_local_sale_service', {
            p_name: name,
            p_unit: document.getElementById('new-local-service-unit').value
        });
        if (error) throw error;
        await loadLocalSaleServices();
        const drafts = getLocalSaleDraftLines();
        const emptyService = drafts.find(line => line.saleType === 'service' && !line.serviceId);
        if (emptyService) emptyService.serviceId = data.id;
        else drafts.push({ saleType: 'service', productId: '', serviceId: data.id, quantity: '1', amount: '' });
        renderLocalSaleProductOptions(drafts);
        nameInput.value = '';
        status.textContent = `Servicio “${data.name}” guardado y listo para usar.`;
        document.getElementById('add-local-service-panel').classList.add('hidden');
        document.getElementById('toggle-add-local-service').setAttribute('aria-expanded', 'false');
    } catch (error) {
        console.error('Error creando servicio local:', error);
        status.textContent = error.message || 'No se pudo crear el servicio.';
    } finally { button.disabled = false; }
}

function updateLocalSaleLinePriceFromProduct(line, force = false) {
    if (line.querySelector('.local-sale-line-type').value !== 'product') return;
    const productId = line.querySelector('.local-sale-line-product').value;
    const product = inventoryProducts.find(item => item.product_id === productId);
    const amountInput = line.querySelector('.local-sale-line-amount');
    if (localSaleCurrency.value === 'COP') {
        const previousAutoAmount = amountInput.dataset.autoFilledValue;
        const isStillAutoFilled = previousAutoAmount !== undefined && amountInput.value === previousAutoAmount;
        if (!force && amountInput.value && !isStillAutoFilled) return;
        const quantity = Number(line.querySelector('.local-sale-line-quantity').value);
        const totalCop = product && Number.isSafeInteger(Number(product.price_cop)) && Number.isInteger(quantity) && quantity > 0
            ? Number(product.price_cop) * quantity
            : null;
        if (Number.isSafeInteger(totalCop) && totalCop > 0 && totalCop <= 999999999999) {
            amountInput.value = String(totalCop);
            amountInput.dataset.autoFilledValue = String(totalCop);
        } else {
            amountInput.value = '';
            delete amountInput.dataset.autoFilledValue;
        }
        return;
    }
    amountInput.value = product && product.price_usd !== null
        ? Number(product.price_usd).toFixed(2)
        : '';
    delete amountInput.dataset.autoFilledValue;
}

function handleLocalSaleCurrencyChange() {
    localSaleLines.querySelectorAll('[data-local-sale-line]').forEach(line => {
        const amountInput = line.querySelector('.local-sale-line-amount');
        amountInput.value = '';
        delete amountInput.dataset.autoFilledValue;
        updateLocalSaleLinePriceFromProduct(line, true);
    });
    document.getElementById('local-sale-received').value = '';
    updateLocalSaleCurrencyUi();
    updateLocalSaleTotalPreview();
}

function formatLocalSaleAmount(amount, currency) {
    if (currency === 'VES') return `Bs. ${formatVes(amount)}`;
    return new Intl.NumberFormat(currency === 'COP' ? 'es-CO' : 'en-US', {
        style: 'currency', currency,
        minimumFractionDigits: currency === 'COP' ? 0 : 2,
        maximumFractionDigits: currency === 'COP' ? 0 : 2
    }).format(Number(amount || 0));
}

function getLocalSaleLineUsdReference(line) {
    const quantity = Number(line.querySelector('.local-sale-line-quantity').value);
    if (!Number.isInteger(quantity) || quantity < 1) return null;

    let unitPriceUsd;
    if (localSaleCurrency.value === 'COP') {
        if (line.querySelector('.local-sale-line-type').value !== 'product') return null;
        const productId = line.querySelector('.local-sale-line-product').value;
        const product = inventoryProducts.find(item => item.product_id === productId);
        unitPriceUsd = Number(product?.price_usd);
    } else {
        unitPriceUsd = Number(line.querySelector('.local-sale-line-amount').value);
    }
    if (!Number.isFinite(unitPriceUsd) || unitPriceUsd <= 0) return null;
    return Math.round(unitPriceUsd * quantity * 100) / 100;
}

function updateLocalSaleTotalPreview() {
    const currency = localSaleCurrency.value;
    let total = 0;
    const appliedRate = Number((localSaleVesBaseRate + localSaleVesAdjustment).toFixed(6));
    let referenceUsd = 0;
    let referenceVes = 0;
    let referenceLines = 0;
    let hasCopService = false;
    let hasCopProductWithoutUsdPrice = false;
    const saleLineCount = localSaleLines.querySelectorAll('[data-local-sale-line]').length;
    localSaleLines.querySelectorAll('[data-local-sale-line]').forEach(line => {
        const quantity = Number(line.querySelector('.local-sale-line-quantity').value);
        const amount = Number(line.querySelector('.local-sale-line-amount').value);
        const lineUsdReference = getLocalSaleLineUsdReference(line);
        const reference = line.querySelector('.local-sale-line-reference');
        if (lineUsdReference !== null) {
            const lineVesReference = Math.round(lineUsdReference * appliedRate * 100) / 100;
            referenceUsd += lineUsdReference;
            referenceVes += lineVesReference;
            referenceLines++;
            reference.textContent = `${formatLocalSaleAmount(lineUsdReference, 'USD')} · ${formatLocalSaleAmount(lineVesReference, 'VES')} al cambio aplicado`;
            reference.classList.remove('text-slate-400');
            reference.classList.add('text-emerald-300');
        } else {
            const isCopService = currency === 'COP' && line.querySelector('.local-sale-line-type').value === 'service';
            const selectedProduct = line.querySelector('.local-sale-line-product').value;
            hasCopService ||= isCopService;
            hasCopProductWithoutUsdPrice ||= currency === 'COP' && Boolean(selectedProduct);
            reference.textContent = isCopService
                ? 'Servicio cobrado en COP; no tiene precio USD para calcular referencia.'
                : currency === 'COP' && selectedProduct
                    ? 'Asigna un precio USD en el inventario para mostrar su referencia.'
                    : 'El total en USD y bolívares aparecerá al completar la línea.';
            reference.classList.add('text-slate-400');
            reference.classList.remove('text-emerald-300');
        }
        if (!Number.isFinite(amount) || amount <= 0) return;
        if (currency === 'COP') {
            total += amount;
        } else if (Number.isFinite(quantity) && quantity > 0) {
            const lineTotalUsd = Math.round(amount * 100) / 100 * quantity;
            total += currency === 'VES'
                ? Math.round(lineTotalUsd * appliedRate * 100) / 100
                : lineTotalUsd;
        }
    });
    document.getElementById('local-sale-total').textContent = formatLocalSaleAmount(total, currency);
    const hasAnyReference = referenceLines > 0;
    const hasCompleteReference = hasAnyReference && referenceLines === saleLineCount;
    const referenceSuffix = hasAnyReference && !hasCompleteReference ? ' · parcial' : '';
    document.getElementById('local-sale-total-usd-reference').textContent = hasAnyReference
        ? `${formatLocalSaleAmount(referenceUsd, 'USD')}${referenceSuffix}`
        : '—';
    document.getElementById('local-sale-total-ves-reference').textContent = hasAnyReference
        ? `${formatLocalSaleAmount(referenceVes, 'VES')}${referenceSuffix}`
        : '—';
    const referenceNote = document.getElementById('local-sale-reference-note');
    referenceNote.textContent = currency === 'COP'
        ? `El cobro real se registra en COP. La referencia USD/VES usa el precio USD del inventario${hasCopService ? ' y no incluye servicios cobrados en COP' : ''}${hasCopProductWithoutUsdPrice ? ' ni productos sin precio USD configurado' : ''}.`
        : `Referencias calculadas a partir de los precios en USD ingresados y la tasa aplicada de Bs. ${formatVes(appliedRate)} por USD${referenceLines ? '.' : '. Completa los precios para ver los totales.'}`;
    updateLocalSaleChangePreview(total, currency);
}

function updateLocalSaleChangePreview(total, currency = localSaleCurrency.value) {
    const receivedInput = document.getElementById('local-sale-received');
    const changeOutput = document.getElementById('local-sale-change');
    const received = Number(receivedInput.value);
    if (total <= 0) {
        changeOutput.textContent = 'Completa las líneas de la venta';
        changeOutput.className = 'mt-1 block text-sm font-black text-slate-400';
        return;
    }
    if (!receivedInput.value.trim()) {
        changeOutput.textContent = 'Ingresa el monto recibido';
        changeOutput.className = 'mt-1 block text-sm font-black text-slate-400';
        return;
    }
    if (!Number.isFinite(received) || received < 0 || (currency === 'COP' && !Number.isInteger(received))) {
        changeOutput.textContent = currency === 'COP' ? 'El monto debe ser un entero' : 'Ingresa un monto válido';
        changeOutput.className = 'mt-1 block text-sm font-black text-rose-300';
        return;
    }
    const difference = Math.round((received - total) * 100) / 100;
    if (difference < 0) {
        changeOutput.textContent = `Faltan ${formatLocalSaleAmount(Math.abs(difference), currency)}`;
        changeOutput.className = 'mt-1 block text-sm font-black text-amber-300';
        return;
    }
    changeOutput.textContent = `Vuelto: ${formatLocalSaleAmount(difference, currency)}`;
    changeOutput.className = 'mt-1 block text-sm font-black text-emerald-200';
}

function renderLocalSales() {
    if (!localSalesList) return;
    if (!localSales.length) {
        localSalesList.innerHTML = '<p class="rounded-2xl border border-slate-800 p-6 text-center text-sm text-slate-400 md:col-span-2 2xl:col-span-3">Todavia no hay ventas locales registradas.</p>';
        updateLocalSaleSelectionUi();
        return;
    }
    const groups = new Map();
    localSales.forEach(sale => {
        const key = sale.batch_id || sale.id;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(sale);
    });
    localSalesList.innerHTML = [...groups.values()].map(lines => {
        const date = new Date(`${lines[0].sold_on}T12:00:00`);
        const dateLabel = new Intl.DateTimeFormat('es-VE', { dateStyle: 'medium' }).format(date);
        const createdAt = new Date(lines[0].created_at);
        const timeLabel = Number.isNaN(createdAt.getTime())
            ? ''
            : new Intl.DateTimeFormat('es-VE', {
                hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Caracas'
            }).format(createdAt);
        const totals = {};
        lines.forEach(sale => {
            const currency = sale.currency || 'USD';
            totals[currency] = (totals[currency] || 0) + Number(sale.total_amount ?? sale.total_usd);
        });
        const totalsMarkup = Object.entries(totals).map(([currency, amount]) =>
            `<span class="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-200">${formatLocalSaleAmount(amount, currency)}</span>`
        ).join(' ');
        const lineMarkup = lines.map(sale => {
            const currency = sale.currency || 'USD';
            const amount = formatLocalSaleAmount(sale.total_amount ?? sale.total_usd, currency);
            const isService = sale.sale_type === 'service';
            const unit = sale.unit === 'metro' ? 'm' : sale.unit === 'pagina' ? 'páginas' : sale.unit === 'servicio' ? 'servicios' : 'unidades';
            const unitPrice = sale.unit_price_usd === null || sale.unit_price_usd === undefined
                ? ''
                : `<span class="text-slate-500"> - $${Number(sale.unit_price_usd).toFixed(2)} c/u</span>`;
            const rate = currency === 'VES' && sale.exchange_rate
                ? `<span class="text-slate-500"> - tasa ${formatVes(sale.exchange_rate)}</span>`
                : '';
            return `<li class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 py-2 text-xs"><label class="flex min-w-0 items-start gap-2 text-slate-200"><input type="checkbox" data-local-sale-select="${escapeHtml(sale.id)}" class="mt-0.5 accent-rose-500" ${selectedLocalSaleIds.has(sale.id) ? 'checked' : ''} aria-label="Seleccionar venta de ${escapeHtml(sale.product_name)}"><span class="min-w-0 break-words"><span class="mr-1 rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold uppercase text-sky-200">${isService ? 'Servicio' : 'Producto'}</span>${escapeHtml(sale.product_name)} <span class="text-slate-400">x ${sale.quantity} ${unit}</span>${unitPrice}${rate}</span></label><strong class="shrink-0 text-emerald-200">${amount}</strong></li>`;
        }).join('');
        return `<article class="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div class="flex items-start justify-between gap-3"><div><p class="text-sm font-bold text-white">Venta local - ${dateLabel}</p><p class="mt-1 text-[10px] text-slate-400">${timeLabel ? `Registrada a las ${timeLabel} · ` : ''}${lines.length} línea${lines.length === 1 ? '' : 's'}</p></div><div class="flex flex-wrap justify-end gap-1">${totalsMarkup}</div></div>
            <ul class="mt-3">${lineMarkup}</ul>
        </article>`;
    }).join('');
    updateLocalSaleSelectionUi();
}

function updateLocalSaleSelectionUi() {
    const knownIds = new Set(localSales.map(sale => sale.id));
    selectedLocalSaleIds.forEach(id => { if (!knownIds.has(id)) selectedLocalSaleIds.delete(id); });
    const panel = document.getElementById('local-sales-delete-selection');
    const count = selectedLocalSaleIds.size;
    panel.classList.toggle('hidden', count === 0);
    panel.classList.toggle('flex', count > 0);
    document.getElementById('local-sales-selected-count').textContent = `${count} venta${count === 1 ? '' : 's'} seleccionada${count === 1 ? '' : 's'} (líneas de producto).`;
}

async function deleteLocalSales({ ids = null, from = null, through = null, label }) {
    const prompt = ids
        ? `¿Eliminar ${ids.length} línea${ids.length === 1 ? '' : 's'} de venta seleccionada${ids.length === 1 ? '' : 's'}? El inventario no cambiará.`
        : `¿Eliminar todas las ventas registradas ${label}? El inventario no cambiará.`;
    if (!window.confirm(prompt)) return;

    localSalesStatus.textContent = 'Eliminando registros del historial...';
    try {
        const { data, error } = await supabaseClient.rpc('admin_delete_local_sales', {
            p_sale_ids: ids,
            p_from: from,
            p_through: through
        });
        if (error) throw error;
        if (ids) selectedLocalSaleIds.clear();
        await loadLocalSales();
        localSalesStatus.textContent = `Se eliminaron ${data} registro${Number(data) === 1 ? '' : 's'} del historial. El inventario no fue modificado.`;
    } catch (error) {
        console.error('Error eliminando ventas locales:', error);
        localSalesStatus.textContent = error.message || 'No se pudieron eliminar las ventas.';
    }
}

function localSalesPeriodRange(period) {
    if (period === 'month') {
        const value = document.getElementById('local-sales-delete-month').value;
        if (!/^\d{4}-\d{2}$/.test(value)) return null;
        const [year, month] = value.split('-').map(Number);
        const monthEnd = localDateInputValue(new Date(Date.UTC(year, month, 0, 12)));
        const today = localDateInputValue();
        return { from: `${value}-01`, through: monthEnd > today ? today : monthEnd };
    }
    const value = document.getElementById('local-sales-delete-date').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    if (period === 'day') return { from: value, through: value };
    const [year, month, day] = value.split('-').map(Number);
    const anchor = new Date(Date.UTC(year, month - 1, day, 12));
    const weekday = (anchor.getUTCDay() + 6) % 7;
    const monday = new Date(anchor);
    monday.setUTCDate(anchor.getUTCDate() - weekday);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const today = localDateInputValue();
    const weekEnd = localDateInputValue(sunday);
    return { from: localDateInputValue(monday), through: weekEnd > today ? today : weekEnd };
}

async function deleteLocalSalesPeriod(period) {
    const range = localSalesPeriodRange(period);
    if (!range) {
        localSalesStatus.textContent = period === 'month' ? 'Selecciona un mes válido.' : 'Selecciona una fecha válida.';
        return;
    }
    const labels = { day: `el ${range.from}`, week: `desde el ${range.from} hasta el ${range.through}`, month: `durante ${range.from.slice(0, 7)}` };
    await deleteLocalSales({ ...range, label: labels[period] });
}

function localSalesExportRange() {
    const value = document.getElementById('local-sales-export-date').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > localDateInputValue()) return null;
    const [year, month, day] = value.split('-').map(Number);
    const anchor = new Date(Date.UTC(year, month - 1, day, 12));
    const period = document.getElementById('local-sales-export-period').value;
    let from = value;
    let through = value;
    if (period === 'week') {
        const monday = new Date(anchor);
        monday.setUTCDate(anchor.getUTCDate() - ((anchor.getUTCDay() + 6) % 7));
        const sunday = new Date(monday);
        sunday.setUTCDate(monday.getUTCDate() + 6);
        from = localDateInputValue(monday);
        through = localDateInputValue(sunday);
    } else if (period === 'fortnight') {
        from = `${value.slice(0, 7)}-${day <= 15 ? '01' : '16'}`;
        through = day <= 15
            ? `${value.slice(0, 7)}-15`
            : localDateInputValue(new Date(Date.UTC(year, month, 0, 12)));
    } else if (period === 'month') {
        from = `${value.slice(0, 7)}-01`;
        through = localDateInputValue(new Date(Date.UTC(year, month, 0, 12)));
    } else if (period === 'year') {
        from = `${year}-01-01`;
        through = `${year}-12-31`;
    }
    const today = localDateInputValue();
    if (through > today) through = today;
    const labels = {
        day: 'Día', week: 'Semana (lunes a domingo)',
        fortnight: day <= 15 ? 'Quincena (1 al 15)' : 'Quincena (16 al fin de mes)',
        month: 'Mes', year: 'Año'
    };
    return { from, through, label: labels[period] };
}

function updateLocalSalesExportRange() {
    const range = localSalesExportRange();
    document.getElementById('local-sales-export-range').textContent = range
        ? `${range.label}: ${range.from} al ${range.through}`
        : 'Selecciona una fecha válida que no sea futura.';
}

function markLocalSalesReportStale() {
    document.getElementById('local-sales-export-status').textContent = 'Los filtros cambiaron. Consulta el resumen para actualizar las cifras; al exportar se aplicarán los filtros actuales.';
}

function localSalesReportSummary(sales) {
    const totals = {};
    const tickets = new Set();
    let units = 0;
    let meters = 0;
    let services = 0;
    sales.forEach(sale => {
        const currency = sale.currency || 'USD';
        totals[currency] = (totals[currency] || 0) + Number(sale.total_amount ?? sale.total_usd ?? 0);
        tickets.add(sale.batch_id || sale.id);
        if (sale.sale_type === 'service') services += Number(sale.quantity || 0);
        else if (sale.unit === 'metro') meters += Number(sale.quantity || 0);
        else units += Number(sale.quantity || 0);
    });
    return { totals, tickets: tickets.size, units, meters, services };
}

function localSalesTotalsLabel(totals) {
    const currencies = ['USD', 'VES', 'COP'].filter(currency => totals[currency] !== undefined);
    return currencies.length
        ? currencies.map(currency => formatLocalSaleAmount(totals[currency], currency)).join('   |   ')
        : 'Sin ventas registradas';
}

function localSalesFileTimestamp(date = new Date()) {
    return new Intl.DateTimeFormat('es-VE', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

async function loadLocalSalesReport(range) {
    const { data, error } = await supabaseClient.rpc('admin_export_local_sales', {
        p_from: range.from,
        p_through: range.through
    });
    if (error) throw error;
    return data || [];
}

function applyLocalSalesReportFilters(sales) {
    const currency = document.getElementById('local-sales-report-currency').value;
    const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    const productQuery = normalize(document.getElementById('local-sales-report-product').value.trim());
    return sales.filter(sale => {
        const matchesCurrency = currency === 'all' || (sale.currency || 'USD') === currency;
        const matchesProduct = !productQuery || normalize(sale.product_name).includes(productQuery);
        return matchesCurrency && matchesProduct;
    });
}

function localSalesReportFilterLabel() {
    const currency = document.getElementById('local-sales-report-currency').value;
    const currencyLabel = currency === 'all' ? 'Todas' : currency;
    const product = document.getElementById('local-sales-report-product').value.trim() || 'Todos';
    return `Moneda: ${currencyLabel}   |   Producto o servicio: ${product}`;
}

function renderLocalSalesReport(sales, range) {
    const summary = localSalesReportSummary(sales);
    const summaryCards = [
        ['Ventas', summary.tickets, 'fa-receipt'],
        ['Líneas registradas', sales.length, 'fa-list'],
        ['Unidades vendidas', summary.units, 'fa-boxes-stacked'],
        ['Metros vendidos', summary.meters, 'fa-ruler-horizontal'],
        ['Servicios vendidos', summary.services, 'fa-print'],
        ...Object.entries(summary.totals).map(([currency, amount]) => [
            `Total ${currency}`, formatLocalSaleAmount(amount, currency), currency === 'COP' ? 'fa-coins' : 'fa-money-bill-wave'
        ])
    ];
    document.getElementById('local-sales-report-summary').innerHTML = summaryCards.map(([label, value, icon]) => `
        <article class="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p class="text-[10px] font-bold uppercase tracking-wide text-slate-500"><i class="fa-solid ${icon} mr-1.5 text-violet-300" aria-hidden="true"></i>${escapeHtml(label)}</p>
            <p class="mt-2 break-words text-lg font-black text-white">${escapeHtml(value)}</p>
        </article>`).join('') || '<p class="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-xs text-slate-400 sm:col-span-2 xl:col-span-4">No hay ventas con esos filtros para este período.</p>';

    const products = new Map();
    sales.forEach(sale => {
        const item = products.get(sale.product_name) || { quantity: 0, unit: sale.unit };
        item.quantity += Number(sale.quantity);
        products.set(sale.product_name, item);
    });
    const topProducts = [...products.entries()].sort((a, b) => b[1].quantity - a[1].quantity).slice(0, 5);
    document.getElementById('local-sales-report-top-products').innerHTML = topProducts.length
        ? `<ol class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">${topProducts.map(([name, item], index) => `<li class="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3"><span class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-400/10 text-xs font-black text-amber-200">${index + 1}</span><span class="min-w-0 flex-1"><span class="block break-words font-bold text-slate-200">${escapeHtml(name)}</span><span class="text-[10px] text-slate-500">${item.quantity} ${item.unit === 'metro' ? 'm' : item.unit === 'pagina' ? 'páginas' : item.unit === 'servicio' ? 'servicios' : 'unidades'}</span></span></li>`).join('')}</ol>`
        : 'No hay productos vendidos con esos filtros.';
    document.getElementById('local-sales-export-status').textContent = `${range.label}: ${range.from} al ${range.through}. ${sales.length} líneas coinciden. ${localSalesReportFilterLabel()}.`;
}

async function previewLocalSalesReport() {
    const range = localSalesExportRange();
    const status = document.getElementById('local-sales-export-status');
    if (!range) { status.textContent = 'Selecciona una fecha válida que no sea futura.'; return; }
    const button = document.getElementById('preview-local-sales-report');
    button.disabled = true;
    status.textContent = 'Consultando las ventas del período...';
    try {
        const sales = applyLocalSalesReportFilters(await loadLocalSalesReport(range));
        renderLocalSalesReport(sales, range);
    } catch (error) {
        console.error('Error consultando el reporte de ventas:', error);
        status.textContent = error.message || 'No se pudo consultar el resumen. Verifica la migración de exportaciones.';
    } finally { button.disabled = false; }
}

async function getBrandLogoDataUrl() {
    const response = await fetch('assets/images/logo.png');
    if (!response.ok) throw new Error('No se pudo cargar el logo para el informe.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return `data:image/png;base64,${btoa(binary)}`;
}

function downloadLocalSalesFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function localSalesReportRows(sales) {
    return sales.map((sale, index) => [
        index + 1,
        sale.sold_on,
        `${sale.sale_type === 'service' ? 'Servicio: ' : 'Producto: '}${sale.product_name}`,
        Number(sale.quantity),
        sale.unit === 'metro' ? 'm' : sale.unit === 'pagina' ? 'páginas' : sale.unit === 'servicio' ? 'servicios' : 'unidades',
        sale.currency || 'USD',
        sale.currency === 'COP' ? '' : Number(sale.unit_price_usd ?? 0),
        sale.currency === 'VES' ? Number(sale.exchange_rate ?? 0) : '',
        Number(sale.total_amount ?? sale.total_usd ?? 0)
    ]);
}

async function exportLocalSalesExcel() {
    const range = localSalesExportRange();
    const status = document.getElementById('local-sales-export-status');
    const button = document.getElementById('export-local-sales-excel');
    if (!range) { status.textContent = 'Selecciona una fecha válida que no sea futura.'; return; }
    if (!window.ExcelJS) { status.textContent = 'No se pudo cargar la herramienta de Excel. Recarga la página e inténtalo de nuevo.'; return; }
    button.disabled = true;
    status.textContent = 'Preparando el archivo Excel...';
    try {
        const sales = applyLocalSalesReportFilters(await loadLocalSalesReport(range));
        const summary = localSalesReportSummary(sales);
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'INV. Armijhon';
        workbook.created = new Date();
        const sheet = workbook.addWorksheet('Ventas', { views: [{ state: 'frozen', ySplit: 9 }] });
        sheet.columns = [
            { width: 7 }, { width: 14 }, { width: 38 }, { width: 12 },
            { width: 14 }, { width: 12 }, { width: 20 }, { width: 18 }, { width: 20 }
        ];
        sheet.mergeCells('C1:I2');
        sheet.getCell('C1').value = 'INV. ARMIJHON';
        sheet.getCell('C1').font = { name: 'Aptos Display', size: 24, bold: true, color: { argb: 'FFF7F3EA' } };
        sheet.getCell('C1').alignment = { vertical: 'middle' };
        sheet.getCell('C1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF201D18' } };
        sheet.mergeCells('C3:I3');
        sheet.getCell('C3').value = 'REGISTRO DE VENTAS LOCALES';
        sheet.getCell('C3').font = { size: 13, bold: true, color: { argb: 'FFC69A54' } };
        sheet.getCell('C4').value = 'Período';
        sheet.getCell('D4').value = `${range.label}: ${range.from} al ${range.through}`;
        sheet.mergeCells('D4:I4');
        sheet.getCell('C5').value = 'Generado';
        sheet.getCell('D5').value = localSalesFileTimestamp();
        sheet.mergeCells('D5:I5');
        sheet.getCell('C6').value = 'Ventas';
        sheet.getCell('D6').value = summary.tickets;
        sheet.getCell('E6').value = 'Líneas';
        sheet.getCell('F6').value = sales.length;
        sheet.getCell('G6').value = 'Unidades';
        sheet.getCell('H6').value = summary.units;
        sheet.getCell('I6').value = 'Metros';
        sheet.getCell('I7').value = summary.meters;
        sheet.getCell('C7').value = 'Totales por moneda';
        sheet.getCell('D7').value = localSalesTotalsLabel(summary.totals);
        sheet.mergeCells('D7:H7');
        sheet.getCell('C8').value = 'Filtros';
        sheet.getCell('D8').value = localSalesReportFilterLabel();
        sheet.mergeCells('D8:I8');
        ['C4', 'C5', 'C6', 'E6', 'G6', 'I6', 'C7', 'C8'].forEach(address => {
            sheet.getCell(address).font = { bold: true, color: { argb: 'FF6B5B45' } };
        });
        const logoId = workbook.addImage({ base64: await getBrandLogoDataUrl(), extension: 'png' });
        sheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 130, height: 50 } });
        const table = sheet.addTable({
            name: 'DetalleVentas', ref: 'A9', headerRow: true, totalsRow: false,
            style: { theme: 'TableStyleMedium4', showRowStripes: true },
            columns: ['N.º', 'Fecha', 'Producto o servicio', 'Cantidad', 'Unidad', 'Moneda', 'Precio unitario USD', 'Tasa USD/VES', 'Total cobrado'].map(name => ({ name })),
            rows: localSalesReportRows(sales)
        });
        const amountColumn = 9;
        for (let row = 10; row < 10 + sales.length; row++) {
            sheet.getCell(row, 7).numFmt = '0.00';
            sheet.getCell(row, 8).numFmt = '0.000000';
            const currency = sales[row - 10].currency || 'USD';
            sheet.getCell(row, amountColumn).numFmt = currency === 'COP' ? '#,##0' : currency === 'VES' ? '"Bs. "#,##0.00' : '"$"#,##0.00';
        }
        sheet.getRow(9).height = 30;
        sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
        sheet.headerFooter.oddFooter = '&CINV. Armijhon  •  Página &P de &N';
        const bytes = await workbook.xlsx.writeBuffer();
        const filename = `ventas-inv-armijhon-${range.from}-a-${range.through}.xlsx`;
        downloadLocalSalesFile(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
        status.textContent = `${sales.length} líneas exportadas a Excel.`;
    } catch (error) {
        console.error('Error exportando ventas a Excel:', error);
        status.textContent = error.message || 'No se pudo crear el archivo Excel.';
    } finally { button.disabled = false; }
}

async function exportLocalSalesPdf() {
    const range = localSalesExportRange();
    const status = document.getElementById('local-sales-export-status');
    const button = document.getElementById('export-local-sales-pdf');
    if (!range) { status.textContent = 'Selecciona una fecha válida que no sea futura.'; return; }
    if (!window.jspdf?.jsPDF) { status.textContent = 'No se pudo cargar la herramienta de PDF. Recarga la página e inténtalo de nuevo.'; return; }
    button.disabled = true;
    status.textContent = 'Preparando el archivo PDF...';
    try {
        const sales = applyLocalSalesReportFilters(await loadLocalSalesReport(range));
        const summary = localSalesReportSummary(sales);
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const logo = await getBrandLogoDataUrl();
        doc.addImage(logo, 'PNG', 14, 11, 39, 15);
        doc.setTextColor(32, 29, 24);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(21);
        doc.text('INV. ARMIJHON', 56, 19);
        doc.setTextColor(153, 111, 48);
        doc.setFontSize(11);
        doc.text('REGISTRO DE VENTAS LOCALES', 56, 27);
        doc.setTextColor(80, 76, 68);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`${range.label}: ${range.from} al ${range.through}`, 56, 34);
        doc.text(`Generado: ${localSalesFileTimestamp()}     Ventas: ${summary.tickets}     Líneas: ${sales.length}     Unidades: ${summary.units}     Metros: ${summary.meters}`, 14, 43);
        doc.setFont('helvetica', 'bold');
        doc.text(`Totales por moneda: ${localSalesTotalsLabel(summary.totals)}`, 14, 50);
        doc.setFont('helvetica', 'normal');
        const filterLines = doc.splitTextToSize(`Filtros aplicados: ${localSalesReportFilterLabel()}`, doc.internal.pageSize.getWidth() - 28);
        doc.text(filterLines, 14, 56);
        const rows = sales.map((sale, index) => [
            String(index + 1), sale.sold_on, `${sale.sale_type === 'service' ? 'Servicio: ' : 'Producto: '}${sale.product_name}`,
            `${sale.quantity} ${sale.unit === 'metro' ? 'm' : sale.unit === 'pagina' ? 'páginas' : sale.unit === 'servicio' ? 'servicios' : 'unidades'}`,
            sale.currency === 'COP' ? 'COP' : `${sale.currency || 'USD'}${sale.currency === 'VES' ? ` / tasa ${Number(sale.exchange_rate || 0).toFixed(2)}` : ''}`,
            sale.currency === 'COP' ? '—' : Number(sale.unit_price_usd ?? 0).toFixed(2),
            formatLocalSaleAmount(sale.total_amount ?? sale.total_usd, sale.currency || 'USD')
        ]);
        doc.autoTable({
            startY: 58 + filterLines.length * 4,
            head: [['N.º', 'Fecha', 'Producto o servicio', 'Cantidad', 'Moneda / tasa', 'Precio unitario USD', 'Total cobrado']],
            body: rows.length ? rows : [['—', '—', 'Sin ventas en este período', '—', '—', '—', '—']],
            theme: 'striped',
            headStyles: { fillColor: [44, 39, 31], textColor: [247, 243, 234], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 245, 238] },
            styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.5, textColor: [45, 43, 39] },
            columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 23 }, 2: { cellWidth: 72 }, 3: { cellWidth: 27 }, 4: { cellWidth: 37 }, 5: { cellWidth: 34 }, 6: { cellWidth: 38 } },
            didDrawPage: data => {
                const pageHeight = doc.internal.pageSize.getHeight();
                doc.setFontSize(8);
                doc.setTextColor(125, 119, 108);
                doc.text('Registro de ventas de INV. Armijhon', 14, pageHeight - 7);
                doc.text(`Página ${data.pageNumber}`, doc.internal.pageSize.getWidth() - 28, pageHeight - 7);
            }
        });
        const filename = `ventas-inv-armijhon-${range.from}-a-${range.through}.pdf`;
        doc.save(filename);
        status.textContent = `${sales.length} líneas exportadas a PDF.`;
    } catch (error) {
        console.error('Error exportando ventas a PDF:', error);
        status.textContent = error.message || 'No se pudo crear el archivo PDF.';
    } finally { button.disabled = false; }
}

async function loadLocalSales() {
    localSalesStatus.textContent = 'Cargando ventas locales...';
    try {
        const { data, error } = await supabaseClient.rpc('admin_list_local_sales', { p_limit: 200 });
        if (error) throw error;
        localSales = data || [];
        renderLocalSales();
        localSalesStatus.textContent = `${localSales.length} ventas recientes`;
    } catch (error) {
        console.error('Error cargando ventas locales:', error);
        localSalesStatus.textContent = error.message || 'No se pudieron cargar las ventas locales. Verifica la migracion SQL.';
    }
}

async function registerLocalProductSale(event) {
    event.preventDefault();
    const currency = localSaleCurrency.value;
    const soldOn = localSaleDate.value;
    const items = [...localSaleLines.querySelectorAll('[data-local-sale-line]')].map(line => {
        const saleType = line.querySelector('.local-sale-line-type').value;
        return {
            sale_type: saleType,
            product_id: saleType === 'product' ? line.querySelector('.local-sale-line-product').value : null,
            service_id: saleType === 'service' ? line.querySelector('.local-sale-line-service').value : null,
            quantity: Number(line.querySelector('.local-sale-line-quantity').value),
            amount: Number(line.querySelector('.local-sale-line-amount').value)
        };
    });
    const saveButton = document.getElementById('save-local-sale');
    if (!items.length || items.length > 30) {
        localSaleFormStatus.textContent = 'Agrega entre 1 y 30 líneas a la venta.';
        return;
    }
    for (const [index, item] of items.entries()) {
        if (item.sale_type === 'product' ? !item.product_id : !item.service_id) {
            localSaleFormStatus.textContent = `Selecciona el ${item.sale_type === 'service' ? 'servicio' : 'producto'} de la línea ${index + 1}.`;
            return;
        }
        if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99999) {
            localSaleFormStatus.textContent = `La cantidad de la línea ${index + 1} debe estar entre 1 y 99999.`;
            return;
        }
        if (!Number.isFinite(item.amount) || item.amount <= 0) {
            localSaleFormStatus.textContent = `Indica el monto de la línea ${index + 1}.`;
            return;
        }
        if (currency === 'COP' && (!Number.isInteger(item.amount) || item.amount > 999999999999)) {
            localSaleFormStatus.textContent = `El total COP de la línea ${index + 1} debe ser un numero entero valido.`;
            return;
        }
        if (currency !== 'COP' && item.amount > 999999.99) {
            localSaleFormStatus.textContent = `El precio en USD de la línea ${index + 1} no puede superar 999999.99.`;
            return;
        }
    }
    if (!soldOn || soldOn > localDateInputValue()) {
        localSaleFormStatus.textContent = 'Selecciona una fecha valida que no sea futura.';
        return;
    }

    saveButton.disabled = true;
    localSaleFormStatus.textContent = 'Guardando productos y servicios...';
    try {
        const exchangeRate = currency === 'VES'
            ? Number((localSaleVesBaseRate + localSaleVesAdjustment).toFixed(6))
            : null;
        const { data, error } = await supabaseClient.rpc('admin_record_local_product_sales', {
            p_items: items,
            p_currency: currency,
            p_exchange_rate: exchangeRate,
            p_sold_on: soldOn
        });
        if (error) throw error;

        localSaleForm.reset();
        localSaleDate.value = localDateInputValue();
        localSaleLines.innerHTML = '';
        updateLocalSaleCurrencyUi();
        renderLocalSaleProductOptions([]);
        if (items.some(item => item.sale_type === 'product')) await loadAdminInventory();
        await loadLocalSales();
        const productLines = items.filter(item => item.sale_type === 'product').length;
        localSaleFormStatus.textContent = `Venta guardada: ${data.line_count} líneas (${productLines} producto${productLines === 1 ? '' : 's'} con descuento de stock). Total: ${formatLocalSaleAmount(data.total_amount, data.currency)}.`;
    } catch (error) {
        console.error('Error registrando la venta local:', error);
        localSaleFormStatus.textContent = error.message || 'No se pudo registrar la venta local.';
    } finally {
        saveButton.disabled = false;
    }
}

async function loadAdminProductCategories() {
    try {
        const { data, error } = await supabaseClient
            .from('product_categories')
            .select('slug, name')
            .order('name');
        if (error) throw error;
        newProductCategory.innerHTML = '<option value="">Selecciona una categoría</option>'
            + (data || []).map(category => `<option value="${escapeHtml(category.slug)}">${escapeHtml(category.name)}</option>`).join('')
            + '<option value="__new__">＋ Crear una categoría nueva</option>';
    } catch (error) {
        newProductCategory.innerHTML = '<option value="">No se pudieron cargar las categorías</option>';
        addProductFormStatus.textContent = 'No se cargaron las categorías. Ejecuta la migración del catálogo y vuelve a actualizar.';
        console.error('Error cargando las categorías del catálogo:', error);
    }
}

async function compressProductImage(sourceBlob) {
    if (!sourceBlob || !String(sourceBlob.type || '').startsWith('image/')) {
        throw new Error('Selecciona un archivo de imagen valido.');
    }
    if (sourceBlob.size > PRODUCT_IMAGE_MAX_BYTES) {
        throw new Error('La imagen debe pesar 10 MB o menos.');
    }
    const bitmap = await createImageBitmap(sourceBlob);
    const maxDimension = 1400;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) {
        bitmap.close();
        throw new Error('El navegador no pudo preparar la imagen.');
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    let quality = 0.84;
    let output = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
    while (output && output.size > 1.5 * 1024 * 1024 && quality > 0.55) {
        quality -= 0.1;
        output = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
    }
    if (!output) throw new Error('No se pudo comprimir la imagen. Prueba con otra foto.');
    return output;
}

async function uploadProductImage(productId, source, sourceUrl = null) {
    let originalBlob = source;
    if (sourceUrl) {
        const response = await fetch(sourceUrl);
        if (!response.ok) throw new Error(`No se pudo leer la imagen existente (${response.status}).`);
        originalBlob = await response.blob();
    }
    const optimized = await compressProductImage(originalBlob);
    const storagePath = `${productId}/main.webp`;
    const { error: uploadError } = await supabaseClient.storage.from(PRODUCT_IMAGE_BUCKET).upload(storagePath, optimized, {
        contentType: 'image/webp', cacheControl: '3600', upsert: true
    });
    if (uploadError) throw uploadError;
    const { data: publicData } = supabaseClient.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(storagePath);
    const imageUrl = `${publicData.publicUrl}?v=${Date.now()}`;
    const { error: updateError } = await supabaseClient.rpc('admin_set_inventory_product_image', {
        p_product_id: productId, p_image_url: imageUrl
    });
    if (updateError) throw updateError;
    return { imageUrl, optimizedSize: optimized.size };
}

async function changeInventoryProductImage(productId, fileInput) {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    const product = inventoryProducts.find(item => item.product_id === productId);
    if (!product) return;
    inventoryStatus.textContent = `Optimizando y subiendo la foto de ${product.product_name}...`;
    try {
        await uploadProductImage(productId, file);
        await loadAdminInventory();
        inventoryStatus.textContent = `Foto actualizada para ${product.product_name}.`;
    } catch (error) {
        console.error('Error subiendo la imagen del producto:', error);
        inventoryStatus.textContent = error.message || 'No se pudo guardar la foto. Verifica la migracion y tus permisos.';
    }
}

function legacyImagePath(product) {
    if (product.image_url && product.image_url.includes('/product-images/')) return null;
    const path = productCatalogImageOverrides[product.product_id] || product.image_url || '';
    return typeof path === 'string' && /^(\.\/)?img\//i.test(path) ? path : null;
}

async function migrateLegacyProductImages() {
    const candidates = inventoryProducts.filter(product => legacyImagePath(product));
    if (!candidates.length) {
        inventoryStatus.textContent = 'No hay fotos locales pendientes de pasar a Supabase.';
        return;
    }
    if (!window.confirm(`Se optimizaran y copiaran ${candidates.length} fotos locales al almacenamiento de Supabase. Las fotos originales seguiran en el repositorio como respaldo. Continuar?`)) return;
    const button = document.getElementById('migrate-product-images');
    button.disabled = true;
    let migrated = 0;
    const failures = [];
    try {
        for (const [index, product] of candidates.entries()) {
            inventoryStatus.textContent = `Pasando foto ${index + 1} de ${candidates.length}: ${product.product_name}...`;
            const sourceUrl = new URL(legacyImagePath(product).replace(/^\.\//, ''), document.baseURI);
            try {
                await uploadProductImage(product.product_id, null, sourceUrl.href);
                migrated++;
            } catch (error) {
                failures.push(`${product.product_name}: ${error.message}`);
            }
        }
        await loadAdminInventory();
        inventoryStatus.textContent = failures.length
            ? `Se migraron ${migrated} de ${candidates.length} fotos. Pendientes: ${failures.join('; ')}`
            : `Listo: ${migrated} fotos estan ahora en Supabase Storage.`;
    } finally {
        button.disabled = false;
    }
}

async function addInventoryProduct(event) {
    event.preventDefault();
    const formData = new FormData(addProductForm);
    const category = newProductCategory.value === '__new__'
        ? String(formData.get('customCategory') || '').trim()
        : newProductCategory.selectedOptions[0]?.textContent.trim();
    const saveButton = document.getElementById('save-new-product');
    if (!category) {
        addProductFormStatus.textContent = 'Selecciona o escribe una categoría.';
        return;
    }
    const priceValue = String(formData.get('price') || '').trim();
    const price = priceValue ? Number(priceValue) : null;
    if (priceValue && (!Number.isFinite(price) || price <= 0 || price > 999999.99)) {
        addProductFormStatus.textContent = 'El precio debe ser mayor que cero y no superar 999999.99 USD.';
        return;
    }

    saveButton.disabled = true;
    addProductFormStatus.textContent = price === null ? 'Guardando producto como Próximamente…' : 'Guardando producto…';
    try {
        const { data, error } = await supabaseClient.rpc('admin_add_inventory_product_with_image', {
            p_name: String(formData.get('name') || '').trim(),
            p_category: category,
            p_price_usd: price,
            p_description: String(formData.get('description') || '').trim(),
            p_unit: String(formData.get('unit') || ''),
            p_stock: Number(formData.get('stock')),
            p_image_url: null
        });
        if (error) throw error;
        const imageFile = formData.get('image');
        let imageUploadError = null;
        if (imageFile instanceof File && imageFile.size > 0) {
            addProductFormStatus.textContent = 'Producto guardado. Optimizando y subiendo la foto...';
            try {
                await uploadProductImage(data.product_id, imageFile);
            } catch (uploadError) {
                imageUploadError = uploadError;
                console.error('El producto se guardo, pero fallo la subida de su foto:', uploadError);
            }
        }
        addProductForm.reset();
        newProductCategory.value = '';
        newProductCategoryCustomWrap.classList.add('hidden');
        newProductCategoryCustom.required = false;
        const savedMessage = price === null
            ? `${data.product_name} se guardo como Proximamente. Puedes agregar el precio desde su tarjeta en el inventario.`
            : `${data.product_name} se guardo correctamente y ya esta disponible para el catalogo.`;
        addProductFormStatus.textContent = imageUploadError
            ? `${savedMessage} No se pudo subir la foto: ${imageUploadError.message} Puedes intentarlo desde la tarjeta del producto.`
            : savedMessage;
        await Promise.all([loadAdminInventory(), loadAdminProductCategories()]);
    } catch (error) {
        console.error('Error registrando el producto:', error);
        addProductFormStatus.textContent = error.message || 'No se pudo guardar el producto. Revisa la migración y tus permisos administrativos.';
    } finally {
        saveButton.disabled = false;
    }
}

async function saveInventoryCatalogDetails(form) {
    const productId = form.dataset.productId;
    const product = inventoryProducts.find(item => item.product_id === productId);
    if (!product) {
        inventoryStatus.textContent = 'No se encontró el producto que intentas actualizar.';
        return;
    }

    const formData = new FormData(form);
    const priceValue = String(formData.get('price') || '').trim();
    const price = priceValue ? Number(priceValue) : null;
    const priceCopValue = String(formData.get('priceCop') || '').trim();
    const priceCop = priceCopValue ? Number(priceCopValue) : null;
    if (priceValue && (!Number.isFinite(price) || price <= 0 || price > 999999.99)) {
        inventoryStatus.textContent = 'El precio debe ser mayor que cero y no superar 999999.99 USD.';
        return;
    }
    if (priceCopValue && (!Number.isSafeInteger(priceCop) || priceCop < 1 || priceCop > 999999999999)) {
        inventoryStatus.textContent = 'El precio COP debe ser un número entero entre 1 y 999999999999.';
        return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    inventoryStatus.textContent = `Guardando precios de ${product.product_name}…`;
    try {
        const { error } = await supabaseClient.rpc('admin_update_inventory_catalog_details', {
            p_product_id: productId,
            p_price_usd: price,
            p_price_cop: priceCop,
            p_image_url: product.image_url && product.image_url.includes('/product-images/') ? product.image_url : (productCatalogImageOverrides[productId] || product.image_url || null)
        });
        if (error) throw error;
        await loadAdminInventory();
        inventoryStatus.textContent = price === null
            ? `${product.product_name} permanece como Próximamente.`
            : `${product.product_name} actualizado y publicado en el catálogo.`;
    } catch (error) {
        console.error(`Error guardando los datos de catálogo de ${product.product_name}:`, error);
        inventoryStatus.textContent = error.message || `No se pudieron guardar los datos de ${product.product_name}.`;
    } finally {
        button.disabled = false;
    }
}

async function renameInventoryProduct(button) {
    const productId = button.dataset.productId;
    const currentName = button.dataset.productName || '';
    const requestedName = window.prompt('Escribe el nuevo nombre del producto (máximo 120 caracteres):', currentName);
    if (requestedName === null) return;

    const productName = requestedName.trim();
    if (!productName || productName.length > 120) {
        inventoryStatus.textContent = 'El nombre es obligatorio y debe tener máximo 120 caracteres.';
        return;
    }
    if (productName === currentName) return;

    button.disabled = true;
    inventoryStatus.textContent = 'Actualizando el nombre del producto...';
    try {
        const { data, error } = await supabaseClient.rpc('admin_rename_inventory_product', {
            p_product_id: productId,
            p_product_name: productName
        });
        if (error) throw error;

        const product = inventoryProducts.find(item => item.product_id === productId);
        if (product) product.product_name = data.product_name;
        renderAdminInventory();
        inventoryStatus.textContent = 'Nombre actualizado: ' + data.product_name + '.';
    } catch (error) {
        console.error('Error cambiando el nombre del producto:', error);
        inventoryStatus.textContent = error.message || 'No se pudo cambiar el nombre del producto.';
    } finally {
        button.disabled = false;
    }
}

async function archiveInventoryProduct(productId, productName) {
    const confirmed = window.confirm(
        `¿Eliminar “${productName}” del inventario y del catálogo público? Se ocultará de inmediato. El historial de pedidos y existencias se conservará.`
    );
    if (!confirmed) return;

    inventoryStatus.textContent = `Eliminando ${productName} del inventario...`;
    try {
        const { error } = await supabaseClient.rpc('admin_archive_inventory_product', {
            p_product_id: productId
        });
        if (error) throw error;
        await loadAdminInventory();
        inventoryStatus.textContent = `${productName} se eliminó del inventario y del catálogo.`;
    } catch (error) {
        console.error('Error eliminando el producto del catálogo:', error);
        inventoryStatus.textContent = error.message || 'No se pudo eliminar el producto. Verifica la migración y tus permisos.';
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
        inventoryStatus.textContent = `Inventario actualizado: ${product?.product_name || productId} · ${Number(data)} ${product?.unit === 'metro' ? 'metros' : 'unidades'}.`;
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

function getWhatsAppPhone(phone) {
    const value = String(phone || '').trim();
    let digits = value.replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (value.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? digits : null;
    if (digits.startsWith('58') && digits.length === 12) return digits;
    if (digits.length === 11 && digits.startsWith('0')) return `58${digits.slice(1)}`;
    if (digits.length === 10) return `58${digits}`;
    return null;
}

function getOrderWhatsAppLink(order) {
    const phone = getWhatsAppPhone(order.customer_phone);
    if (!phone) return null;

    const items = (order.order_items || []).map(item =>
        `• ${Number(item.quantity)}${item.unit === 'metro' ? ' m' : ' ×'} ${item.product_name} — $${Number(item.line_total_usd).toFixed(2)}`
    );
    const orderNumber = String(order.id || '').slice(-8).toUpperCase();
    const message = [
        `Hola ${order.customer_name}, te confirmamos que el pago de tu pedido #${orderNumber} fue verificado y el pedido está aprobado.`,
        '',
        'Detalle del pedido:',
        ...items,
        '',
        `Total: $${Number(order.total_usd).toFixed(2)} / Bs. ${formatVes(order.total_ves)}`,
        `Método de pago: ${order.payment_method === 'pago_movil' ? 'Pago Móvil' : 'Transferencia'}`,
        '',
        'Puedes responder por este medio para coordinar los siguientes pasos.',
        'INV. Armijhon'
    ].join('\n');

    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function showApprovalWhatsAppLinks(message, approvedOrders, autoOpenedOrderId = null) {
    ordersStatus.replaceChildren();
    const summary = document.createElement('span');
    summary.textContent = message;
    ordersStatus.append(summary);

    if (!approvedOrders.length) return;

    const list = document.createElement('div');
    list.className = 'mt-2 flex flex-col items-start gap-1';
    approvedOrders.forEach(order => {
        const link = getOrderWhatsAppLink(order);
        const recipient = document.createElement('span');
        recipient.className = 'text-emerald-300';
        recipient.textContent = `${order.customer_name}: `;

        if (!link) {
            recipient.append('no se pudo preparar el enlace; revisa el formato del número registrado.');
        } else {
            const anchor = document.createElement('a');
            anchor.href = link;
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer';
            anchor.className = 'font-bold underline underline-offset-2 hover:text-emerald-200';
            anchor.textContent = autoOpenedOrderId === order.id
                ? 'Abrir WhatsApp si no se abrió automáticamente'
                : 'Abrir chat y revisar mensaje';
            recipient.append(anchor);
        }

        list.append(recipient);
    });
    ordersStatus.append(list);
}

async function updateOrderStatus(ids, status, { autoOpenWhatsApp = false } = {}) {
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
    const telegramSyncFailures = [];
    const approvedOrders = [];
    let updated = 0;
    const singleOrderToNotify = autoOpenWhatsApp && status === 'approved' && eligibleIds.length === 1
        ? orders.find(order => order.id === eligibleIds[0])
        : null;
    const singleOrderWhatsAppLink = singleOrderToNotify ? getOrderWhatsAppLink(singleOrderToNotify) : null;
    let whatsappWindow = null;
    if (singleOrderWhatsAppLink) whatsappWindow = window.open('about:blank', '_blank');
    ordersStatus.textContent = status === 'approved' ? 'Aprobando pedidos y comprobando existencias...' : 'Actualizando pedidos...';

    for (const id of eligibleIds) {
        try {
            const { error } = status === 'approved'
                ? await supabaseClient.rpc('admin_approve_order_with_inventory', { p_order_id: id })
                : await supabaseClient.rpc('admin_set_order_status', { p_order_id: id, p_status: status });
            if (error) throw error;
            updated++;
            if (status === 'approved' || status === 'rejected') {
                try {
                    const { error: telegramError } = await supabaseClient.functions.invoke('telegram-webhook', {
                        body: { action: 'update_status_from_panel', orderId: id, status }
                    });
                    if (telegramError) throw telegramError;
                } catch (error) {
                    const message = typeof error === 'object' && error !== null
                        && 'message' in error && typeof error.message === 'string'
                        ? error.message
                        : 'No se pudo actualizar el mensaje de Telegram.';
                    telegramSyncFailures.push(`Pedido ${id}: ${message}`);
                    console.error(`El pedido ${id} cambió de estado, pero no se pudo sincronizar con Telegram:`, error);
                }
            }
            if (status === 'approved') {
                const approvedOrder = orders.find(order => order.id === id);
                if (approvedOrder) approvedOrders.push(approvedOrder);
            }
        } catch (error) {
            const message = typeof error === 'object' && error !== null
                && 'message' in error && typeof error.message === 'string'
                ? error.message
                : `Pedido ${id}`;
            failures.push(message);
            console.error(`No se pudo actualizar el pedido ${id}:`, error);
        }
    }

    let autoOpenedOrderId = approvedOrders.length === 1 && approvedOrders[0].id === singleOrderToNotify?.id
        && whatsappWindow
        ? approvedOrders[0].id
        : null;
    if (whatsappWindow) {
        if (singleOrderWhatsAppLink && autoOpenedOrderId) {
            try {
                whatsappWindow.location.replace(singleOrderWhatsAppLink);
            } catch (error) {
                console.error('El pedido fue aprobado, pero no se pudo abrir WhatsApp automáticamente:', error);
                autoOpenedOrderId = null;
                whatsappWindow.close();
            }
        } else {
            whatsappWindow.close();
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
    const resultMessage = resultParts.join(' ') || 'No hay pedidos seleccionados para ese cambio de estado.';
    const telegramSyncMessage = telegramSyncFailures.length
        ? ` No se pudo actualizar Telegram para ${telegramSyncFailures.length} pedido${telegramSyncFailures.length === 1 ? '' : 's'}: ${telegramSyncFailures.join(' · ')}`
        : '';
    if (status === 'approved') {
        showApprovalWhatsAppLinks(`${resultMessage}${telegramSyncMessage}`, approvedOrders, autoOpenedOrderId);
    } else {
        ordersStatus.textContent = `${resultMessage}${telegramSyncMessage}`;
    }
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
document.getElementById('refresh-local-sales').addEventListener('click', loadLocalSales);
document.getElementById('local-sales-delete-date').value = localDateInputValue();
document.getElementById('local-sales-delete-date').max = localDateInputValue();
document.getElementById('local-sales-delete-month').value = localDateInputValue().slice(0, 7);
document.getElementById('local-sales-delete-month').max = localDateInputValue().slice(0, 7);
document.getElementById('local-sales-export-date').value = localDateInputValue();
document.getElementById('local-sales-export-date').max = localDateInputValue();
updateLocalSalesExportRange();
document.getElementById('local-sales-export-period').addEventListener('change', () => { updateLocalSalesExportRange(); markLocalSalesReportStale(); });
document.getElementById('local-sales-export-date').addEventListener('change', () => { updateLocalSalesExportRange(); markLocalSalesReportStale(); });
document.getElementById('local-sales-report-currency').addEventListener('change', markLocalSalesReportStale);
document.getElementById('local-sales-report-product').addEventListener('input', markLocalSalesReportStale);
document.getElementById('toggle-add-local-service').addEventListener('click', event => {
    const panel = document.getElementById('add-local-service-panel');
    const isHidden = panel.classList.toggle('hidden');
    event.currentTarget.setAttribute('aria-expanded', String(!isHidden));
    if (!isHidden) document.getElementById('new-local-service-name').focus();
});
document.getElementById('save-local-service').addEventListener('click', createLocalSaleService);
document.getElementById('preview-local-sales-report').addEventListener('click', previewLocalSalesReport);
document.getElementById('export-local-sales-excel').addEventListener('click', exportLocalSalesExcel);
document.getElementById('export-local-sales-pdf').addEventListener('click', exportLocalSalesPdf);
document.querySelectorAll('[data-delete-sales-period]').forEach(button => {
    button.addEventListener('click', () => deleteLocalSalesPeriod(button.dataset.deleteSalesPeriod));
});
document.getElementById('delete-selected-local-sales').addEventListener('click', () => {
    deleteLocalSales({ ids: [...selectedLocalSaleIds], label: '' });
});
localSalesList.addEventListener('change', event => {
    const checkbox = event.target.closest('[data-local-sale-select]');
    if (!checkbox) return;
    if (checkbox.checked) selectedLocalSaleIds.add(checkbox.dataset.localSaleSelect);
    else selectedLocalSaleIds.delete(checkbox.dataset.localSaleSelect);
    updateLocalSaleSelectionUi();
});
localSaleForm.addEventListener('submit', registerLocalProductSale);
localSaleLines.addEventListener('change', event => {
    const line = event.target.closest('[data-local-sale-line]');
    if (line && event.target.matches('.local-sale-line-type')) {
        line.querySelector('.local-sale-line-product').value = '';
        line.querySelector('.local-sale-line-service').value = '';
        const amountInput = line.querySelector('.local-sale-line-amount');
        amountInput.value = '';
        delete amountInput.dataset.autoFilledValue;
        updateLocalSaleLineTypeUi(line);
        updateLocalSaleCurrencyUi();
        updateLocalSaleTotalPreview();
    } else if (line && event.target.matches('.local-sale-line-product')) {
        updateLocalSaleLinePriceFromProduct(line, true);
        updateLocalSaleTotalPreview();
    } else if (line && event.target.matches('.local-sale-line-service')) {
        updateLocalSaleTotalPreview();
    }
});
localSaleLines.addEventListener('input', event => {
    const line = event.target.closest('[data-local-sale-line]');
    if (line && event.target.matches('.local-sale-line-quantity') && localSaleCurrency.value === 'COP') {
        updateLocalSaleLinePriceFromProduct(line);
    }
    updateLocalSaleTotalPreview();
    localSaleFormStatus.textContent = '';
});
document.getElementById('local-sale-received').addEventListener('input', updateLocalSaleTotalPreview);
localSaleLines.addEventListener('click', event => {
    const removeButton = event.target.closest('[data-remove-local-sale-line]');
    if (!removeButton) return;
    const drafts = getLocalSaleDraftLines();
    const line = removeButton.closest('[data-local-sale-line]');
    const index = [...localSaleLines.querySelectorAll('[data-local-sale-line]')].indexOf(line);
    drafts.splice(index, 1);
    renderLocalSaleProductOptions(drafts);
});
document.getElementById('add-local-sale-line').addEventListener('click', () => {
    const drafts = getLocalSaleDraftLines();
    if (drafts.length >= 30) return;
    drafts.push({ saleType: 'product', productId: '', serviceId: '', quantity: '1', amount: '' });
    renderLocalSaleProductOptions(drafts);
});
localSaleCurrency.addEventListener('change', handleLocalSaleCurrencyChange);
localSaleDate.value = localDateInputValue();
renderLocalSaleProductOptions([]);
document.getElementById('migrate-product-images').addEventListener('click', migrateLegacyProductImages);
document.getElementById('toggle-add-product').addEventListener('click', event => {
    const isHidden = addProductForm.classList.toggle('hidden');
    event.currentTarget.setAttribute('aria-expanded', String(!isHidden));
    if (!isHidden) addProductForm.querySelector('[name="name"]').focus();
});
newProductCategory.addEventListener('change', () => {
    const isCustomCategory = newProductCategory.value === '__new__';
    newProductCategoryCustomWrap.classList.toggle('hidden', !isCustomCategory);
    newProductCategoryCustom.required = isCustomCategory;
    if (isCustomCategory) newProductCategoryCustom.focus();
});
addProductForm.addEventListener('submit', addInventoryProduct);
document.getElementById('refresh-dashboard').addEventListener('click', () => {
    Promise.all([loadOrders(), loadAdminInventory(), loadAdminPromotionSummary()]);
});
document.getElementById('dashboard-period').addEventListener('change', renderDashboardReport);
document.getElementById('export-dashboard-report').addEventListener('click', exportDashboardReport);
adminNavigation.addEventListener('click', event => {
    const button = event.target.closest('[data-admin-page]');
    if (!button) return;
    showAdminPage(button.dataset.adminPage);
    if (button.dataset.adminPage === 'local-sales') {
        loadLocalSaleServices().catch(error => {
            console.error('Error cargando el catálogo de servicios locales:', error);
            document.getElementById('local-service-status').textContent = error.message || 'No se pudo cargar el catálogo de servicios.';
        });
    }
    if (button.dataset.adminPage === 'sales-history') loadLocalSales();
    if (button.dataset.adminPage === 'sales-reports') updateLocalSalesExportRange();
    if (button.dataset.adminPage === 'insurance') loadInsuranceCases();
});
document.getElementById('refresh-insurance-cases').addEventListener('click', loadInsuranceCases);
document.getElementById('insurance-search').addEventListener('input', renderInsuranceCases);
document.getElementById('insurance-status-filter').addEventListener('change', renderInsuranceCases);
document.getElementById('toggle-insurance-manual-form').addEventListener('click', event => {
    const isHidden = insuranceManualForm.classList.toggle('hidden');
    event.currentTarget.setAttribute('aria-expanded', String(!isHidden));
    if (!isHidden) {
        setInsuranceDate(insuranceManualForm.querySelector('[name="sales_date"]'));
        insuranceManualForm.querySelector('[name="ally"]').focus();
    }
});
insuranceManualForm.addEventListener('submit', registerManualInsuranceCase);
insuranceCasesList.addEventListener('submit', event => {
    const form = event.target.closest('.insurance-case-update');
    if (!form) return;
    event.preventDefault();
    saveInsuranceCase(form);
});
insuranceCasesList.addEventListener('click', event => {
    const exportButton = event.target.closest('[data-insurance-export]');
    if (exportButton) {
        exportInsuranceCase(exportButton.dataset.insuranceExport, exportButton.dataset.format, exportButton);
        return;
    }
    const button = event.target.closest('[data-insurance-document]');
    if (button) openInsuranceDocument(button.dataset.insuranceDocument, button);
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
inventoryList.addEventListener('change', event => {
    const input = event.target.closest('.inventory-product-image-input');
    if (input) changeInventoryProductImage(input.dataset.productId, input);
});
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
    const form = event.target.closest('.inventory-catalog-form, .inventory-stock-form, .inventory-min-stock-form');
    if (!form) return;
    event.preventDefault();
    if (form.matches('.inventory-catalog-form')) {
        saveInventoryCatalogDetails(form);
    } else if (form.matches('.inventory-min-stock-form')) {
        saveProductMinStock(form);
    } else {
        saveProductStock(form);
    }
});
inventoryList.addEventListener('click', event => {
    const uploadButton = event.target.closest('.upload-product-image-button');
    if (uploadButton) {
        inventoryList.querySelector(`.inventory-product-image-input[data-product-id="${CSS.escape(uploadButton.dataset.productId)}"]`)?.click();
        return;
    }
    const renameButton = event.target.closest('.edit-product-name-button');
    if (renameButton) {
        renameInventoryProduct(renameButton);
        return;
    }
    const archiveButton = event.target.closest('.archive-product-button');
    if (archiveButton) {
        archiveInventoryProduct(archiveButton.dataset.productId, archiveButton.dataset.productName);
        return;
    }
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
    if (statusButton) {
        await updateOrderStatus([statusButton.dataset.id], statusButton.dataset.status, { autoOpenWhatsApp: true });
    }
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
