import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
});

const extractReference = (text: string) => {
    const normalizedText = text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\r/g, '');
    const operationLabel = /operaci(?:on|en)|operation/i;
    const invalidLabels = /identificacion|cedula|documento/i;
    const lines = normalizedText.split('\n').map(line => line.trim()).filter(Boolean);

    for (let index = 0; index < lines.length; index++) {
        if (!operationLabel.test(lines[index])) continue;

        const sameLine = lines[index].match(/operaci(?:on|en)\D{0,24}([0-9][0-9 -]{5,20})/i);
        if (sameLine) return sameLine[1].replace(/\D/g, '');

        for (const nextLine of lines.slice(index + 1, index + 4)) {
            if (invalidLabels.test(nextLine)) continue;
            const number = nextLine.match(/\b([0-9][0-9 -]{5,20})\b/);
            if (number) return number[1].replace(/\D/g, '');
        }
    }

    return null;
};

const runOcr = async (apiKey: string, base64: string, mimeType: string) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
        const response = await fetch('https://api.ocr.space/parse/image', {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                apikey: apiKey,
                base64Image: `data:${mimeType};base64,${base64}`,
                language: 'spa',
                isOverlayRequired: 'false',
                detectOrientation: 'true',
                scale: 'true',
                OCREngine: '2'
            })
        });
        if (!response.ok) throw new Error(`OCR HTTP ${response.status}`);
        const result = await response.json();
        if (result.IsErroredOnProcessing) throw new Error(result.ErrorMessage || 'OCR rechazó el archivo.');
        const text = (result.ParsedResults || []).map((item: { ParsedText?: string }) => item.ParsedText || '').join('\n').trim();
        return { text, reference: extractReference(text), confidence: null };
    } finally {
        clearTimeout(timeout);
    }
};

Deno.serve(async request => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

    try {
        const payload = await request.json();
        const {
            customerName,
            customerPhone,
            paymentMethod,
            exchangeRate,
            totalUsd,
            totalVes,
            items,
            promoToken,
            receipt
        } = payload;

        if (!customerName || !customerPhone || !['pago_movil', 'transferencia'].includes(paymentMethod)) {
            return json({ error: 'Datos del cliente o método de pago inválido.' }, 400);
        }
        if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
            return json({ error: 'El pedido no contiene productos válidos.' }, 400);
        }
        const normalizedItems = items.map((value: unknown) => {
            if (!value || typeof value !== 'object') return null;
            const item = value as Record<string, unknown>;
            const id = typeof item.id === 'string' ? item.id.trim() : '';
            const quantity = Number(item.quantity);
            if (!/^p\d+$/.test(id) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99999) return null;
            const unitPriceUsd = Number(item.unitPriceUsd);
            const lineTotalUsd = Number(item.lineTotalUsd);
            if (!Number.isFinite(unitPriceUsd) || unitPriceUsd <= 0 || !Number.isFinite(lineTotalUsd) || lineTotalUsd < 0) return null;
            return {
                id,
                name: typeof item.name === 'string' ? item.name.slice(0, 160) : '',
                quantity,
                unitPriceUsd,
                lineTotalUsd
            };
        });
        if (normalizedItems.some(item => item === null)) {
            return json({ error: 'El pedido contiene productos o cantidades inválidas.' }, 400);
        }
        const validItems = normalizedItems.filter((item): item is NonNullable<typeof item> => item !== null);
        for (const item of validItems) {
            if (Math.abs(item.lineTotalUsd - item.quantity * item.unitPriceUsd) > 0.01) {
                return json({ error: 'El subtotal de un producto no coincide con su precio y cantidad.' }, 400);
            }
            if (item.id === 'p38' && item.unitPriceUsd !== 5 && item.unitPriceUsd !== 10) {
                return json({ error: 'El precio de la crema corporal no es válido.' }, 400);
            }
            if (item.id !== 'p38' && item.unitPriceUsd === 5 && promoToken) {
                return json({ error: 'La promoción solo puede aplicarse a la crema Ideal+ Citrus Fresh.' }, 400);
            }
        }
        const promoQuantity = validItems
            .filter(item => item.id === 'p38' && item.unitPriceUsd === 5)
            .reduce((quantity, item) => quantity + item.quantity, 0);
        if ((promoQuantity > 0) !== (typeof promoToken === 'string' && promoToken.length > 0)) {
            return json({ error: 'No se pudo validar el descuento de lanzamiento.' }, 400);
        }
        if (promoToken && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(promoToken)) {
            return json({ error: 'La identificación de la promoción no es válida.' }, 400);
        }
        const calculatedTotalUsd = Number(validItems.reduce((sum, item) => sum + item.lineTotalUsd, 0).toFixed(2));
        const submittedTotalUsd = Number(totalUsd);
        const submittedExchangeRate = Number(exchangeRate);
        const submittedTotalVes = Number(totalVes);
        if (!Number.isFinite(submittedTotalUsd) || !Number.isFinite(submittedExchangeRate)
            || submittedExchangeRate <= 0 || submittedExchangeRate > 1_000_000
            || !Number.isFinite(submittedTotalVes)
            || Math.abs(submittedTotalUsd - calculatedTotalUsd) > 0.01
            || Math.abs(submittedTotalVes - Number((calculatedTotalUsd * submittedExchangeRate).toFixed(2))) > 0.02) {
            return json({ error: 'El total del pedido no coincide con sus productos y la tasa indicada.' }, 400);
        }
        if (!receipt?.base64 || !receipt?.name || !receipt?.type || receipt.base64.length > 7_000_000) {
            return json({ error: 'El comprobante es obligatorio y no debe superar 5 MB.' }, 400);
        }
        if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(receipt.type)) {
            return json({ error: 'Formato de comprobante no permitido.' }, 400);
        }

        const serviceUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!serviceUrl || !serviceRoleKey) throw new Error('Falta configurar el acceso seguro a Supabase.');
        const supabase = createClient(serviceUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
        let promoVisitorHash: string | null = null;
        if (promoQuantity > 0) {
            const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(promoToken));
            promoVisitorHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
            const { data: promotion, error: promotionError } = await supabase.rpc('register_launch_promo_visit', {
                p_visitor_hash: promoVisitorHash
            });
            if (promotionError) return json({ error: 'No se pudo validar la oferta. Intenta nuevamente.' }, 500);
            if (!promotion?.eligible || promotion.decision !== 'accepted') {
                return json({ error: 'Esta visita no tiene una oferta aceptada para aplicar el descuento.' }, 409);
            }
        }
        const requestedQuantities = new Map<string, number>();
        validItems.forEach(item => {
            requestedQuantities.set(item.id, (requestedQuantities.get(item.id) || 0) + item.quantity);
        });
        const { data: inventory, error: inventoryError } = await supabase
            .from('product_inventory')
            .select('product_id, product_name, stock')
            .in('product_id', [...requestedQuantities.keys()]);
        if (inventoryError) return json({ error: 'No se pudo verificar la disponibilidad del inventario.' }, 500);
        const availableByProduct = new Map((inventory || []).map(item => [item.product_id, {
            name: item.product_name,
            stock: Number(item.stock)
        }]));
        for (const [productId, requested] of requestedQuantities) {
            const product = availableByProduct.get(productId);
            if (!product || requested > product.stock) {
                return json({
                    error: `Existencias insuficientes para ${product?.name || productId}. Disponibles: ${product?.stock ?? 0}.`
                }, 409);
            }
        }

        const orderId = crypto.randomUUID();
        const extension = receipt.type === 'image/jpeg' ? 'jpg'
            : receipt.type === 'image/png' ? 'png'
                : receipt.type === 'image/webp' ? 'webp' : 'pdf';
        const storagePath = `${orderId}/comprobante.${extension}`;
        const binary = Uint8Array.from(atob(receipt.base64), character => character.charCodeAt(0));
        const { error: uploadError } = await supabase.storage
            .from('payment-receipts')
            .upload(storagePath, binary, { contentType: receipt.type, upsert: false });
        if (uploadError) return json({ error: 'No se pudo guardar el comprobante.' }, 500);

        const { error: orderError } = await supabase.from('orders').insert({
            id: orderId,
            customer_name: String(customerName).trim().slice(0, 120),
            customer_phone: String(customerPhone).trim().slice(0, 40),
            payment_method: paymentMethod,
            exchange_rate: submittedExchangeRate,
            total_usd: calculatedTotalUsd,
            total_ves: Number((calculatedTotalUsd * submittedExchangeRate).toFixed(2)),
            status: 'pending'
        });
        if (orderError) {
            const { error } = await supabase.storage.from('payment-receipts').remove([storagePath]);
            if (error) console.error('No se pudo limpiar el comprobante sin pedido:', error);
            return json({ error: 'No se pudo crear el pedido.' }, 500);
        }

        const cleanupDraftOrder = async () => {
            const { error } = await supabase.from('orders').delete().eq('id', orderId);
            if (error) console.error('No se pudo limpiar el pedido incompleto:', orderId, error);
            const { error: storageError } = await supabase.storage.from('payment-receipts').remove([storagePath]);
            if (storageError) console.error('No se pudo limpiar el comprobante del pedido incompleto:', storageError);
        };
        const itemRows = validItems.map(item => ({
            order_id: orderId,
            product_id: item.id,
            product_name: availableByProduct.get(item.id)?.name || item.name,
            quantity: item.quantity,
            unit_price_usd: item.unitPriceUsd,
            line_total_usd: item.lineTotalUsd
        }));
        const { error: itemsError } = await supabase.from('order_items').insert(itemRows);
        if (itemsError) {
            await cleanupDraftOrder();
            return json({ error: 'No se pudieron guardar los productos.' }, 500);
        }

        if (promoQuantity > 0 && promoVisitorHash) {
            const { data: reservation, error: reservationError } = await supabase.rpc('reserve_launch_promo_redemption', {
                p_visitor_hash: promoVisitorHash,
                p_order_id: orderId,
                p_discounted_quantity: promoQuantity
            });
            if (reservationError) {
                await cleanupDraftOrder();
                if (reservationError.code === '23505') {
                    return json({ error: 'Esta visita ya utilizó o tiene pendiente su única oferta de lanzamiento.' }, 409);
                }
                console.error('No se pudo reservar la unidad promocional:', reservationError);
                return json({ error: 'No se pudo reservar el descuento. Intenta nuevamente.' }, 500);
            }
            if (!reservation?.reserved) {
                await cleanupDraftOrder();
                return json({ error: 'Las unidades con descuento ya fueron reservadas. Puedes enviar el pedido a precio regular de $10.00.' }, 409);
            }
        }

        const { data: receiptRow, error: receiptError } = await supabase.from('payment_receipts').insert({
            order_id: orderId,
            storage_path: storagePath,
            original_name: String(receipt.name).slice(0, 180),
            mime_type: receipt.type,
            file_size: binary.byteLength
        }).select('id').single();
        if (receiptError) {
            await cleanupDraftOrder();
            return json({ error: 'No se pudo registrar el comprobante.' }, 500);
        }

        const ocrApiKey = Deno.env.get('OCR_SPACE_API_KEY');
        if (!ocrApiKey) {
            await supabase.from('payment_receipts').update({ ocr_status: 'skipped' }).eq('id', receiptRow.id);
        } else {
            try {
                const ocr = await runOcr(ocrApiKey, receipt.base64, receipt.type);
                await supabase.from('payment_receipts').update({
                    ocr_status: 'completed',
                    ocr_text: ocr.text || null,
                    reference_number: ocr.reference,
                    ocr_confidence: ocr.confidence
                }).eq('id', receiptRow.id);
            } catch (ocrError) {
                console.error('OCR fallido:', ocrError);
                await supabase.from('payment_receipts').update({ ocr_status: 'failed' }).eq('id', receiptRow.id);
            }
        }

        return json({ orderId, status: 'pending' }, 201);
    } catch {
        return json({ error: 'Solicitud inválida.' }, 400);
    }
});
