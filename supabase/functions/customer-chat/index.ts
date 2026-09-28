import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const serviceUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!serviceUrl || !serviceRoleKey) {
  throw new Error("Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
}

const adminClient = createClient(serviceUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function validSessionToken(token: unknown): token is string {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
}

function validConversationId(id: unknown): id is string {
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

async function requireAdmin(request: Request): Promise<boolean> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const { data, error } = await adminClient.auth.getUser(authorization.slice(7));
  if (error || !data.user) return false;
  const { data: admin, error: adminError } = await adminClient
    .from("chat_admins")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (adminError) throw adminError;
  return Boolean(admin);
}

async function requireConversation(id: unknown, token: unknown) {
  if (!validConversationId(id) || !validSessionToken(token)) {
    return { conversation: null, error: "La sesión del chat no es válida." };
  }
  const tokenHash = await hashToken(token);
  const { data, error } = await adminClient
    .from("chat_conversations")
    .select("id, status, customer_unread")
    .eq("id", id)
    .eq("session_token_hash", tokenHash)
    .maybeSingle();
  if (error) throw error;
  return { conversation: data, error: data ? null : "No se encontró esta conversación en este dispositivo." };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") return jsonResponse({ error: "Método no permitido." }, 405);

  try {
    const payload = await request.json();
    const action = payload?.action;

    if (action === "start") {
      const name = typeof payload.name === "string" ? payload.name.trim() : "";
      const phone = typeof payload.phone === "string" ? payload.phone.trim() : "";
      const token = payload.sessionToken;
      if (name.length < 2 || name.length > 80) {
        return jsonResponse({ error: "Escribe un nombre de 2 a 80 caracteres." }, 400);
      }
      if (!/^[+\d().\-\s]{7,30}$/.test(phone) || phone.replace(/\D/g, "").length < 7) {
        return jsonResponse({ error: "Escribe un teléfono válido para identificar tu conversación." }, 400);
      }
      if (!validSessionToken(token)) return jsonResponse({ error: "No se pudo iniciar una sesión segura." }, 400);
      const { data, error } = await adminClient
        .from("chat_conversations")
        .insert({ customer_name: name, customer_phone: phone, session_token_hash: await hashToken(token) })
        .select("id, customer_name, customer_phone, status, created_at, last_message_at, last_message_preview, admin_unread, customer_unread")
        .single();
      if (error) throw error;
      return jsonResponse({ conversation: data });
    }

    if (action === "admin_list" || action === "admin_messages" || action === "admin_reply") {
      if (!await requireAdmin(request)) return jsonResponse({ error: "Se requiere una sesión administrativa." }, 401);
      if (action === "admin_list") {
        const { data, error } = await adminClient
          .from("chat_conversations")
          .select("id, customer_name, customer_phone, status, created_at, last_message_at, last_message_preview, admin_unread, customer_unread")
          .order("last_message_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        return jsonResponse({ conversations: data ?? [] });
      }

      const conversationId = payload.conversationId;
      if (!validConversationId(conversationId)) {
        return jsonResponse({ error: "La conversación no es válida." }, 400);
      }

      if (action === "admin_messages") {
        const { data, error } = await adminClient
          .from("chat_messages")
          .select("id, conversation_id, sender, body, created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        const { data: conversation, error: conversationError } = await adminClient
          .from("chat_conversations")
          .select("admin_unread")
          .eq("id", conversationId)
          .maybeSingle();
        if (conversationError) throw conversationError;
        if (conversation?.admin_unread > 0) {
          const { error: readError } = await adminClient
            .from("chat_conversations")
            .update({ admin_unread: 0 })
            .eq("id", conversationId);
          if (readError) throw readError;
        }
        return jsonResponse({ messages: (data ?? []).reverse() });
      }

      const body = typeof payload.body === "string" ? payload.body.trim() : "";
      if (!body || body.length > 1500) return jsonResponse({ error: "El mensaje debe tener entre 1 y 1500 caracteres." }, 400);
      const { data: conversation, error: conversationError } = await adminClient
        .from("chat_conversations")
        .select("id, status")
        .eq("id", conversationId)
        .maybeSingle();
      if (conversationError) throw conversationError;
      if (!conversation || conversation.status !== "open") return jsonResponse({ error: "Esta conversación no está disponible." }, 404);
      const { data, error } = await adminClient
        .from("chat_messages")
        .insert({ conversation_id: conversationId, sender: "admin", body })
        .select("id, conversation_id, sender, body, created_at")
        .single();
      if (error) throw error;
      return jsonResponse({ message: data });
    }

    if (action === "client_list" || action === "client_send") {
      const { conversation, error: sessionError } = await requireConversation(payload.conversationId, payload.sessionToken);
      if (sessionError || !conversation) return jsonResponse({ error: sessionError }, 403);
      if (conversation.status !== "open") return jsonResponse({ error: "Esta conversación fue cerrada." }, 409);

      if (action === "client_list") {
        const { data, error } = await adminClient
          .from("chat_messages")
          .select("id, conversation_id, sender, body, created_at")
          .eq("conversation_id", conversation.id)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        if (conversation.customer_unread > 0) {
          const { error: readError } = await adminClient
            .from("chat_conversations")
            .update({ customer_unread: 0 })
            .eq("id", conversation.id);
          if (readError) throw readError;
        }
        return jsonResponse({ messages: (data ?? []).reverse() });
      }

      const body = typeof payload.body === "string" ? payload.body.trim() : "";
      if (!body || body.length > 1500) return jsonResponse({ error: "El mensaje debe tener entre 1 y 1500 caracteres." }, 400);
      const { data: recentMessages, error: recentError } = await adminClient
        .from("chat_messages")
        .select("created_at")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (recentError) throw recentError;
      if (recentMessages?.[0] && Date.now() - new Date(recentMessages[0].created_at).getTime() < 700) {
        return jsonResponse({ error: "Espera un momento antes de enviar otro mensaje." }, 429);
      }
      const { data, error } = await adminClient
        .from("chat_messages")
        .insert({ conversation_id: conversation.id, sender: "customer", body })
        .select("id, conversation_id, sender, body, created_at")
        .single();
      if (error) throw error;
      return jsonResponse({ message: data });
    }

    return jsonResponse({ error: "Acción no reconocida." }, 400);
  } catch (error) {
    console.error("Error en customer-chat:", error);
    return jsonResponse({ error: "No se pudo procesar el chat. Intenta de nuevo." }, 500);
  }
});
