const { url, publishableKey } = window.SUPABASE_CONFIG || {};

if (!url || !publishableKey || !window.supabase) {
    console.warn('Supabase no está configurado todavía.');
} else {
    window.supabaseClient = window.supabase.createClient(url, publishableKey);
}
