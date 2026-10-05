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

function validVisitorToken(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function hashVisitorToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Método no permitido." }, 405);

  try {
    const payload = await request.json();
    if (!payload || typeof payload !== "object" || !validVisitorToken(payload.visitorToken)) {
      return jsonResponse({ error: "No se pudo validar esta visita a la promoción." }, 400);
    }
    const visitorHash = await hashVisitorToken(payload.visitorToken);

    if (payload.action === "visit") {
      const { data, error } = await adminClient.rpc("register_launch_promo_visit", {
        p_visitor_hash: visitorHash,
      });
      if (error) throw error;
      return jsonResponse({ promotion: data });
    }

    if (payload.action === "decision") {
      if (!["accepted", "rejected"].includes(payload.decision)) {
        return jsonResponse({ error: "La respuesta a la oferta no es válida." }, 400);
      }
      const { data, error } = await adminClient.rpc("decide_launch_promo", {
        p_visitor_hash: visitorHash,
        p_decision: payload.decision,
      });
      if (error) {
        if (error.code === "23505") return jsonResponse({ error: "Ya se registró una respuesta distinta para esta oferta." }, 409);
        if (error.code === "P0002") return jsonResponse({ error: "Esta oferta ya no está disponible para esta visita." }, 404);
        throw error;
      }
      return jsonResponse({ promotion: data });
    }

    return jsonResponse({ error: "Acción de promoción no reconocida." }, 400);
  } catch (error) {
    console.error("Error en launch-promotion:", error);
    return jsonResponse({ error: "No se pudo consultar la promoción. Intenta nuevamente." }, 500);
  }
});
