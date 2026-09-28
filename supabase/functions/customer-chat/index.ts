import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ApplicationServer,
  exportApplicationServerKey,
  importVapidKeys,
  PushMessageError,
  Urgency,
} from "jsr:@negrel/webpush@0.5.0";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

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
let pushServerPromise: Promise<{ server: ApplicationServer; publicKey: string }> | undefined;

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

async function getPushServer(): Promise<{ server: ApplicationServer; publicKey: string }> {
  if (!pushServerPromise) {
    pushServerPromise = (async () => {
      const keysValue = Deno.env.get("VAPID_KEYS");
      const contactInformation = Deno.env.get("VAPID_SUBJECT");
      if (!keysValue || !contactInformation) {
        throw new Error("Configura VAPID_KEYS y VAPID_SUBJECT para activar las notificaciones.");
      }
      if (!contactInformation.startsWith("mailto:") && !contactInformation.startsWith("https://")) {
        throw new Error("VAPID_SUBJECT debe ser una dirección mailto: o una URL HTTPS.");
      }
      const vapidKeys = await importVapidKeys(JSON.parse(keysValue));
      const server = await ApplicationServer.new({ contactInformation, vapidKeys });
      return { server, publicKey: await exportApplicationServerKey(vapidKeys) };
    })();
  }

  try {
    return await pushServerPromise;
  } catch (error) {
    pushServerPromise = undefined;
    throw error;
  }
}

async function requireAdmin(request: Request): Promise<string | null> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const { data, error } = await adminClient.auth.getUser(authorization.slice(7));
  if (error || !data.user) return null;
  const { data: admin, error: adminError } = await adminClient
    .from("chat_admins")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (adminError) throw adminError;
  return admin ? data.user.id : null;
}

function isAllowedPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && (host === "fcm.googleapis.com"
        || host === "push.services.mozilla.com"
        || host.endsWith(".push.services.mozilla.com")
        || host === "push.apple.com"
        || host.endsWith(".push.apple.com")
        || host === "notify.windows.com"
        || host.endsWith(".notify.windows.com"));
  } catch {
    return false;
  }
}

function validPushSubscription(value: unknown): value is {
  endpoint: string;
  keys: { p256dh: string; auth: string };
} {
  const subscription = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  return Boolean(
    subscription
      && isAllowedPushEndpoint(subscription.endpoint)
      && typeof subscription.keys?.p256dh === "string"
      && /^[A-Za-z0-9_-]{16,200}$/.test(subscription.keys.p256dh)
      && typeof subscription.keys?.auth === "string"
      && /^[A-Za-z0-9_-]{16,200}$/.test(subscription.keys.auth),
  );
}

async function sendChatPush(sender: "admin" | "customer", conversationId: string): Promise<void> {
  const audience = sender === "customer" ? "admin" : "customer";
  let query = adminClient
    .from("chat_push_subscriptions")
    .select("id, endpoint, p256dh, auth, admin_user_id")
    .eq("audience", audience);
  if (audience === "customer") query = query.eq("conversation_id", conversationId);
  const { data: subscriptions, error } = await query;
  if (error) throw error;
  if (!subscriptions?.length) return;

  let subscriptionsToNotify = subscriptions;
  if (audience === "admin") {
    const { data: admins, error: adminsError } = await adminClient
      .from("chat_admins")
      .select("user_id");
    if (adminsError) throw adminsError;
    const authorizedAdminIds = new Set((admins ?? []).map(admin => admin.user_id));
    subscriptionsToNotify = subscriptions.filter(subscription =>
      authorizedAdminIds.has(subscription.admin_user_id)
    );
    if (!subscriptionsToNotify.length) return;
  }

  const { server } = await getPushServer();
  const payload = JSON.stringify({
    title: sender === "customer" ? "Nuevo mensaje en atención al cliente" : "Nueva respuesta de atención al cliente",
    body: sender === "customer" ? "Hay un nuevo mensaje para responder." : "Tienes una nueva respuesta en tu chat.",
    url: sender === "customer" ? `admin.html#chat/${conversationId}` : "index.html#support-chat",
    tag: `chat-${conversationId}`
  });

  await Promise.all(subscriptionsToNotify.map(async subscription => {
    try {
      await server.subscribe({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth }
      }).pushTextMessage(payload, { urgency: Urgency.High, ttl: 86400 });
    } catch (error) {
      if (error instanceof PushMessageError && (error.isGone() || error.response.status === 404)) {
        const { error: deleteError } = await adminClient
          .from("chat_push_subscriptions")
          .delete()
          .eq("id", subscription.id);
        if (deleteError) console.error("No se pudo eliminar una suscripción push vencida:", deleteError);
      } else {
        console.error("No se pudo enviar una notificación push:", error);
      }
    }
  }));
}

function scheduleChatPush(sender: "admin" | "customer", conversationId: string): void {
  EdgeRuntime.waitUntil(sendChatPush(sender, conversationId).catch(error => {
    console.error("Error preparando notificaciones del chat:", error);
  }));
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

    if (action === "push_public_key") {
      try {
        const { publicKey } = await getPushServer();
        return jsonResponse({ publicKey });
      } catch (error) {
        console.error("Las notificaciones push todavía no están configuradas:", error);
        return jsonResponse({ error: "Las notificaciones todavía no están configuradas en el servidor." }, 503);
      }
    }

    if (action === "push_subscribe" || action === "push_unsubscribe") {
      const audience = payload.audience;
      let adminUserId: string | null = null;
      let conversationId: string | null = null;
      if (audience === "admin") {
        adminUserId = await requireAdmin(request);
        if (!adminUserId) return jsonResponse({ error: "Se requiere una sesión administrativa autorizada." }, 401);
      } else if (audience === "customer") {
        const session = await requireConversation(payload.conversationId, payload.sessionToken);
        if (session.error || !session.conversation) return jsonResponse({ error: session.error }, 403);
        if (session.conversation.status !== "open") return jsonResponse({ error: "Esta conversación fue cerrada." }, 409);
        conversationId = session.conversation.id;
      } else {
        return jsonResponse({ error: "El tipo de suscripción no es válido." }, 400);
      }

      if (action === "push_subscribe") {
        if (!validPushSubscription(payload.subscription)) {
          return jsonResponse({ error: "La suscripción del navegador no es válida o no usa un servicio push compatible." }, 400);
        }
        const { error } = await adminClient.from("chat_push_subscriptions").upsert({
          endpoint: payload.subscription.endpoint,
          p256dh: payload.subscription.keys.p256dh,
          auth: payload.subscription.keys.auth,
          audience,
          admin_user_id: adminUserId,
          conversation_id: conversationId
        }, { onConflict: "endpoint" });
        if (error) throw error;
        return jsonResponse({ ok: true });
      }

      if (!isAllowedPushEndpoint(payload.endpoint)) {
        return jsonResponse({ error: "El endpoint de notificación no es válido." }, 400);
      }
      let deleteQuery = adminClient
        .from("chat_push_subscriptions")
        .delete()
        .eq("endpoint", payload.endpoint)
        .eq("audience", audience);
      deleteQuery = audience === "admin"
        ? deleteQuery.eq("admin_user_id", adminUserId)
        : deleteQuery.eq("conversation_id", conversationId);
      const { error } = await deleteQuery;
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

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
      const adminUserId = await requireAdmin(request);
      if (!adminUserId) return jsonResponse({ error: "Se requiere una sesión administrativa autorizada." }, 401);
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
      scheduleChatPush("admin", conversationId);
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
      scheduleChatPush("customer", conversation.id);
      return jsonResponse({ message: data });
    }

    return jsonResponse({ error: "Acción no reconocida." }, 400);
  } catch (error) {
    console.error("Error en customer-chat:", error);
    return jsonResponse({ error: "No se pudo procesar el chat. Intenta de nuevo." }, 500);
  }
});
