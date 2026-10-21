import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
});

const cleanText = (value: FormDataEntryValue | null, maxLength: number) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';

Deno.serve(async request => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > 5.5 * 1024 * 1024) {
        return json({ error: 'La solicitud supera el tamaño permitido.' }, 413);
    }

    try {
        const form = await request.formData();
        // Hidden honeypot for basic bot filtering; give bots a generic success response.
        if (cleanText(form.get('website'), 200)) return json({ ok: true });

        const customerName = cleanText(form.get('customerName'), 120);
        const customerDocument = cleanText(form.get('customerDocument'), 40);
        const customerPhone = cleanText(form.get('customerPhone'), 40);
        const customerEmail = cleanText(form.get('customerEmail'), 160).toLowerCase();
        const vehicleMake = cleanText(form.get('vehicleMake'), 80);
        const vehicleModel = cleanText(form.get('vehicleModel'), 100);
        const vehicleYearText = cleanText(form.get('vehicleYear'), 4);
        const vehiclePlate = cleanText(form.get('vehiclePlate'), 16).toUpperCase();
        const vehicleSerial = cleanText(form.get('vehicleSerial'), 80);
        const requestNotes = cleanText(form.get('requestNotes'), 1000);
        const consent = form.get('consent') === 'on';
        const vehicleYear = vehicleYearText ? Number(vehicleYearText) : null;

        if (!consent) return json({ error: 'Debes aceptar el uso de estos datos para gestionar la solicitud.' }, 400);
        if (customerName.length < 2 || !/^[+\d()\s.-]{7,40}$/.test(customerPhone)
            || vehicleMake.length < 1 || vehicleModel.length < 1
            || !/^[A-Z0-9 -]{4,16}$/.test(vehiclePlate)
            || (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))
            || (vehicleYear !== null && (!Number.isInteger(vehicleYear) || vehicleYear < 1900 || vehicleYear > new Date().getFullYear() + 1))) {
            return json({ error: 'Revisa el nombre, teléfono y los datos obligatorios del vehículo.' }, 400);
        }

        const document = form.get('document');
        let file: File | null = document instanceof File && document.size > 0 ? document : null;
        const allowedTypes = new Map([
            ['application/pdf', 'pdf'], ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']
        ]);
        if (file && (!allowedTypes.has(file.type) || file.size > 5 * 1024 * 1024)) {
            return json({ error: 'Adjunta un PDF o imagen (JPG, PNG o WebP) de máximo 5 MB.' }, 400);
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!supabaseUrl || !serviceRoleKey) throw new Error('Falta configurar el acceso seguro a Supabase.');
        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false }
        });

        const caseId = crypto.randomUUID();
        let documentPath: string | null = null;
        let documentName: string | null = null;
        if (file) {
            const extension = allowedTypes.get(file.type)!;
            documentPath = `${caseId}/${crypto.randomUUID()}.${extension}`;
            documentName = cleanText(file.name, 160).replace(/[\\/\r\n]/g, '_') || `documento.${extension}`;
            const { error } = await supabase.storage.from('insurance-documents').upload(
                documentPath, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false }
            );
            if (error) return json({ error: 'No se pudo guardar el documento. Intenta nuevamente.' }, 500);
        }

        const { error: insertError } = await supabase.from('insurance_cases').insert({
            id: caseId,
            source: 'web',
            status: file ? 'new' : 'documents_pending',
            customer_name: customerName,
            customer_document: customerDocument || null,
            customer_phone: customerPhone,
            customer_email: customerEmail || null,
            vehicle_make: vehicleMake,
            vehicle_model: vehicleModel,
            vehicle_year: vehicleYear,
            vehicle_plate: vehiclePlate,
            vehicle_serial: vehicleSerial || null,
            request_notes: requestNotes || null,
            document_path: documentPath,
            document_name: documentName
        });
        if (insertError) {
            if (documentPath) await supabase.storage.from('insurance-documents').remove([documentPath]);
            console.error('No se pudo crear la solicitud de seguro:', insertError);
            return json({ error: 'No se pudo registrar la solicitud. Intenta nuevamente.' }, 500);
        }

        return json({ ok: true, id: caseId });
    } catch (error) {
        console.error('Error procesando solicitud de seguro:', error);
        return json({ error: 'No se pudo procesar la solicitud. Revisa los datos e intenta nuevamente.' }, 400);
    }
});
