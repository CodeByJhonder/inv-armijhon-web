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
            receipt
        } = payload;

        if (!customerName || !customerPhone || !['pago_movil', 'transferencia'].includes(paymentMethod)) {
            return json({ error: 'Datos del cliente o método de pago inválido.' }, 400);
        }
        if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
            return json({ error: 'El pedido no contiene productos válidos.' }, 400);
        }
        if (!receipt?.base64 || !receipt?.name || !receipt?.type || receipt.base64.length > 7_000_000) {
            return json({ error: 'El comprobante es obligatorio y no debe superar 5 MB.' }, 400);
        }
        if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(receipt.type)) {
            return json({ error: 'Formato de comprobante no permitido.' }, 400);
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );
        const orderId = crypto.randomUUID();
        const extension = receipt.name.split('.').pop()?.toLowerCase() || 'bin';
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
            exchange_rate: Number(exchangeRate),
            total_usd: Number(totalUsd),
            total_ves: Number(totalVes),
            status: 'pending'
        });
        if (orderError) return json({ error: 'No se pudo crear el pedido.' }, 500);

        const itemRows = items.map((item: any) => ({
            order_id: orderId,
            product_id: String(item.id).slice(0, 80),
            product_name: String(item.name).slice(0, 160),
            quantity: Math.max(1, Number(item.quantity)),
            unit_price_usd: Number(item.unitPriceUsd),
            line_total_usd: Number(item.lineTotalUsd)
        }));
        const { error: itemsError } = await supabase.from('order_items').insert(itemRows);
        if (itemsError) return json({ error: 'No se pudieron guardar los productos.' }, 500);

        const { data: receiptRow, error: receiptError } = await supabase.from('payment_receipts').insert({
            order_id: orderId,
            storage_path: storagePath,
            original_name: String(receipt.name).slice(0, 180),
            mime_type: receipt.type,
            file_size: binary.byteLength
        }).select('id').single();
        if (receiptError) return json({ error: 'No se pudo registrar el comprobante.' }, 500);

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
