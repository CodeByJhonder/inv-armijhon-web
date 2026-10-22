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
    if (Number.isFinite(contentLength) && contentLength > 11 * 1024 * 1024) {
        return json({ error: 'La solicitud supera el tamaño permitido.' }, 413);
    }

    try {
        const form = await request.formData();
        // Hidden honeypot for basic bot filtering; give bots a generic success response.
        if (cleanText(form.get('website'), 200)) return json({ ok: true });

        const ally = cleanText(form.get('ally'), 120);
        const salesDate = cleanText(form.get('sales_date'), 10);
        const customerAddress = cleanText(form.get('customer_address'), 240);
        const customerPostalCode = cleanText(form.get('customer_postal_code'), 20);
        const customerEmail = cleanText(form.get('customer_email'), 160).toLowerCase();
        const customerPhone = cleanText(form.get('customer_phone'), 40);
        const licenseGrade = cleanText(form.get('license_grade'), 40);
        const economicActivity = cleanText(form.get('economic_activity'), 20);
        const cylindersText = cleanText(form.get('vehicle_cylinders'), 2);
        const amountText = cleanText(form.get('amount_charged'), 20).replace(',', '.');
        const paymentMethod = cleanText(form.get('payment_method'), 80);
        const consent = form.get('consent') === 'on';
        const cylinders = Number(cylindersText);
        const amountCharged = Number(amountText);

        const parsedSalesDate = /^\d{4}-\d{2}-\d{2}$/.test(salesDate) ? new Date(`${salesDate}T00:00:00.000Z`) : null;
        const validSalesDate = parsedSalesDate && !Number.isNaN(parsedSalesDate.getTime())
            && parsedSalesDate.toISOString().slice(0, 10) === salesDate;
        if (!consent) return json({ error: 'Debes aceptar el uso de estos datos para gestionar la solicitud.' }, 400);
        if (!/^[+\d()\s.-]{7,40}$/.test(customerPhone)
            || !validSalesDate
            || !customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)
            || !customerAddress || !customerPostalCode || !licenseGrade
            || !['independiente', 'empleado', 'socio'].includes(economicActivity)
            || !Number.isInteger(cylinders) || cylinders < 1 || cylinders > 32
            || !Number.isFinite(amountCharged) || amountCharged <= 0 || amountCharged > 999999999999
            || !paymentMethod) {
            return json({ error: 'Revisa los datos del módulo de ventas; el teléfono, fecha, actividad, cilindros y monto deben ser válidos.' }, 400);
        }

        const identityPhoto = form.get('identity_photo');
        const circulationPhoto = form.get('circulation_card_photo');
        const allowedTypes = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']]);
        if (!(identityPhoto instanceof File) || !(circulationPhoto instanceof File)
            || identityPhoto.size <= 0 || circulationPhoto.size <= 0
            || identityPhoto.size > 5 * 1024 * 1024 || circulationPhoto.size > 5 * 1024 * 1024
            || !allowedTypes.has(identityPhoto.type) || !allowedTypes.has(circulationPhoto.type)) {
            return json({ error: 'Adjunta una foto de la cédula y otra del carnet de circulación. Cada imagen debe ser JPG, PNG o WebP y pesar máximo 5 MB.' }, 400);
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!supabaseUrl || !serviceRoleKey) throw new Error('Falta configurar el acceso seguro a Supabase.');
        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false }
        });

        const caseId = crypto.randomUUID();
        const uploadPrivatePhoto = async (file: File, kind: string) => {
            const extension = allowedTypes.get(file.type)!;
            const path = `${caseId}/${kind}-${crypto.randomUUID()}.${extension}`;
            const { error } = await supabase.storage.from('insurance-documents').upload(
                path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false }
            );
            if (error) throw error;
            return {
                path,
                name: cleanText(file.name, 160).replace(/[\\/\r\n]/g, '_') || `${kind}.${extension}`
            };
        };

        let identityDocument: { path: string; name: string } | null = null;
        let circulationDocument: { path: string; name: string } | null = null;
        try {
            identityDocument = await uploadPrivatePhoto(identityPhoto, 'cedula');
            circulationDocument = await uploadPrivatePhoto(circulationPhoto, 'carnet-circulacion');
        } catch (error) {
            const paths = [identityDocument?.path, circulationDocument?.path].filter(Boolean) as string[];
            if (paths.length) await supabase.storage.from('insurance-documents').remove(paths);
            console.error('No se pudieron guardar las fotos de la solicitud:', error);
            return json({ error: 'No se pudieron guardar las fotos. Intenta nuevamente.' }, 500);
        }

        const { error: insertError } = await supabase.from('insurance_cases').insert({
            id: caseId,
            source: 'web',
            status: 'new',
            sales_location: 'Elorza, Apure',
            ally: ally || null,
            sales_date: salesDate,
            customer_address: customerAddress,
            customer_postal_code: customerPostalCode,
            customer_phone: customerPhone,
            customer_email: customerEmail || null,
            license_grade: licenseGrade,
            economic_activity: economicActivity,
            vehicle_cylinders: cylinders,
            amount_charged: amountCharged,
            payment_method: paymentMethod,
            identity_photo_path: identityDocument.path,
            identity_photo_name: identityDocument.name,
            circulation_card_photo_path: circulationDocument.path,
            circulation_card_photo_name: circulationDocument.name
        });
        if (insertError) {
            await supabase.storage.from('insurance-documents').remove([identityDocument.path, circulationDocument.path]);
            console.error('No se pudo crear la solicitud de seguro:', insertError);
            return json({ error: 'No se pudo registrar la solicitud. Intenta nuevamente.' }, 500);
        }

        return json({ ok: true, id: caseId });
    } catch (error) {
        console.error('Error procesando solicitud de seguro:', error);
        return json({ error: 'No se pudo procesar la solicitud. Revisa los datos e intenta nuevamente.' }, 400);
    }
});
