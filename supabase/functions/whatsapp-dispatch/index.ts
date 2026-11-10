// Date Nails — envia as mensagens da fila (chamada a cada minuto pelo pg_cron)
// Segredos: EVOLUTION_URL (endereço do gateway), EVOLUTION_API_KEY
// Também "acorda" o gateway a cada minuto, para hospedagens gratuitas que dormem sem tráfego.
import { createClient } from "npm:@supabase/supabase-js@2";

const EVO = (Deno.env.get("EVOLUTION_URL") || "").replace(/\/$/, "");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async () => {
  if (!EVO || !EVO_KEY) return json({ skipped: "gateway de WhatsApp não configurado" });
  // mantém o gateway acordado (e dá tempo de ele reconectar se estava dormindo)
  let alive = false;
  try { const h = await fetch(`${EVO}/health`, { signal: AbortSignal.timeout(50000) }); alive = h.ok; } catch { alive = false; }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (!alive) return json({ alive: false });
  const { data: msgs, error } = await admin.rpc("dn_claim_messages", { p_limit: 40 });
  if (error) return json({ error: error.message }, 500);

  let sent = 0, failed = 0;
  for (const m of msgs || []) {
    if (!m.wa_instance || m.wa_status === "desconectado") {
      await admin.rpc("dn_finish_message", { p_id: m.id, p_ok: false, p_error: "WhatsApp do studio desconectado" });
      failed++; continue;
    }
    try {
      const r = await fetch(`${EVO}/message/sendText/${m.wa_instance}`, {
        method: "POST",
        headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ number: m.to_phone, text: m.body }),
        signal: AbortSignal.timeout(30000),
      });
      const body = await r.text();
      await admin.rpc("dn_finish_message", { p_id: m.id, p_ok: r.ok, p_error: r.ok ? "" : `${r.status} ${body.slice(0, 300)}` });
      r.ok ? sent++ : failed++;
    } catch (e) {
      await admin.rpc("dn_finish_message", { p_id: m.id, p_ok: false, p_error: (e as Error).message });
      failed++;
    }
    await new Promise((res) => setTimeout(res, 800)); // ritmo humano, evita bloqueio
  }
  return json({ alive, sent, failed });
});
