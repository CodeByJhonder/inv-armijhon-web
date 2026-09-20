import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
});

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

        const { error: receiptError } = await supabase.from('payment_receipts').insert({
            order_id: orderId,
            storage_path: storagePath,
            original_name: String(receipt.name).slice(0, 180),
            mime_type: receipt.type,
            file_size: binary.byteLength
        });
        if (receiptError) return json({ error: 'No se pudo registrar el comprobante.' }, 500);

        return json({ orderId, status: 'pending' }, 201);
    } catch {
        return json({ error: 'Solicitud inválida.' }, 400);
    }
});
