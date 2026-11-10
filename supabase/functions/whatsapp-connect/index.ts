// Date Nails — conecta o WhatsApp do studio (Evolution API) e consulta o status
// Segredos: EVOLUTION_URL, EVOLUTION_API_KEY
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...cors, "Content-Type": "application/json" } });

const EVO = (Deno.env.get("EVOLUTION_URL") || "").replace(/\/$/, "");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";

async function evo(path: string, method = "GET", body?: unknown) {
  const r = await fetch(`${EVO}${path}`, {
    method, headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data: any = null; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data };
}
const mapState = (s?: string) => s === "open" ? "conectado" : s === "connecting" ? "aguardando" : "desconectado";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!EVO || !EVO_KEY) return json({ error: "O servidor de WhatsApp ainda não foi configurado (EVOLUTION_URL / EVOLUTION_API_KEY)." }, 503);
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "Faça login novamente." }, 401);
    const { data: studio } = await admin.from("dn_studios").select("id, wa_instance, wa_status").eq("owner_id", user.id).single();
    if (!studio) return json({ error: "Studio não encontrado." }, 404);

    const { action } = await req.json().catch(() => ({ action: "status" }));
    const name = studio.wa_instance || `dn-${studio.id.slice(0, 8)}`;
    const save = (fields: Record<string, unknown>) => admin.from("dn_studios").update(fields).eq("id", studio.id);

    if (action === "status") {
      if (!studio.wa_instance) return json({ status: "desconectado" });
      const r = await evo(`/instance/connectionState/${name}`);
      const status = r.ok ? mapState(r.data?.instance?.state ?? r.data?.state) : "desconectado";
      if (status !== studio.wa_status) await save({ wa_status: status });
      return json({ status });
    }

    if (action === "connect") {
      let qr = "", pairingCode = "";
      const state = await evo(`/instance/connectionState/${name}`);
      if (state.ok && (state.data?.instance?.state ?? state.data?.state) === "open") {
        await save({ wa_instance: name, wa_status: "conectado" });
        return json({ status: "conectado" });
      }
      if (!state.ok) {
        const c = await evo("/instance/create", "POST", { instanceName: name, integration: "WHATSAPP-BAILEYS", qrcode: true });
        if (!c.ok && c.status !== 403 && c.status !== 409) return json({ error: "Não foi possível criar a conexão no servidor de WhatsApp.", detail: c.data }, 502);
        qr = c.data?.qrcode?.base64 || ""; pairingCode = c.data?.qrcode?.pairingCode || "";
      }
      if (!qr) {
        const r = await evo(`/instance/connect/${name}`);
        qr = r.data?.base64 || r.data?.qrcode?.base64 || ""; pairingCode = r.data?.pairingCode || pairingCode;
      }
      await save({ wa_instance: name, wa_status: "aguardando" });
      return json({ status: "aguardando", qr, pairingCode });
    }

    if (action === "logout") {
      if (studio.wa_instance) { await evo(`/instance/logout/${name}`, "DELETE"); }
      await save({ wa_status: "desconectado" });
      return json({ status: "desconectado" });
    }
    return json({ error: "Ação inválida." }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
