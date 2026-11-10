// Date Nails — assinatura via PicPay (API E-commerce)
// Segredos: PICPAY_TOKEN (x-picpay-token) e PICPAY_SELLER_TOKEN (x-seller-token)
// Ações: create (dona logada), check (dona logada), webhook (PicPay → POST ?action=webhook)
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...cors, "Content-Type": "application/json" } });
const PICPAY = "https://appws.picpay.com/ecommerce/public";
const TOKEN = Deno.env.get("PICPAY_TOKEN") || "";
const SELLER = Deno.env.get("PICPAY_SELLER_TOKEN") || "";
const URL_SB = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function picpayStatus(ref: string) {
  const r = await fetch(`${PICPAY}/payments/${encodeURIComponent(ref)}/status`, { headers: { "x-picpay-token": TOKEN } });
  return r.ok ? await r.json() : null;
}
const PAID = ["paid", "completed"];

async function settle(ref: string) {
  const st = await picpayStatus(ref);
  if (st && PAID.includes(String(st.status))) {
    await admin.rpc("dn_apply_payment", { p_reference: ref, p_raw: st });
    return "pago";
  }
  if (st && ["refunded", "chargeback"].includes(String(st.status))) await admin.from("dn_payments").update({ status: "estornado", raw: st }).eq("reference_id", ref);
  if (st && st.status === "expired") await admin.from("dn_payments").update({ status: "expirado" }).eq("reference_id", ref);
  return st?.status || "desconhecido";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const qs = new URL(req.url).searchParams;
  try {
    // ---------- notificação do PicPay ----------
    if (qs.get("action") === "webhook") {
      if (!SELLER || req.headers.get("x-seller-token") !== SELLER) return json({ error: "forbidden" }, 403);
      const body = await req.json().catch(() => ({}));
      if (body.referenceId) await settle(String(body.referenceId));
      return json({ ok: true });
    }

    if (!TOKEN) return json({ error: "Pagamento ainda não configurado (PICPAY_TOKEN)." }, 503);
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json({ error: "Faça login novamente." }, 401);
    const { data: studio } = await admin.from("dn_studios").select("id, name, whatsapp").eq("owner_id", user.id).single();
    if (!studio) return json({ error: "Studio não encontrado." }, 404);
    const body = await req.json().catch(() => ({}));

    if (body.action === "check") {
      const { data: p } = await admin.from("dn_payments").select("reference_id, status").eq("reference_id", body.reference_id).eq("studio_id", studio.id).single();
      if (!p) return json({ error: "Pagamento não encontrado." }, 404);
      if (p.status === "pago") return json({ status: "pago" });
      return json({ status: await settle(p.reference_id) === "pago" ? "pago" : "pendente" });
    }

    if (body.action === "create") {
      const doc = String(body.document || "").replace(/\D/g, "");
      if (doc.length !== 11 && doc.length !== 14) return json({ error: "Informe um CPF ou CNPJ válido." }, 400);
      const fullName = String(body.buyer_name || studio.name).trim();
      const [firstName, ...rest] = fullName.split(/\s+/);
      const { data: pf } = await admin.from("dn_platform").select("plan_price, saas_name").eq("id", 1).single();
      const amount = pf?.plan_price ?? 3990;
      const ref = `dn-${studio.id.slice(0, 8)}-${Date.now()}`;
      const phone = String(studio.whatsapp || "").replace(/^55/, "");
      const r = await fetch(`${PICPAY}/payments`, {
        method: "POST",
        headers: { "x-picpay-token": TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceId: ref,
          callbackUrl: `${URL_SB}/functions/v1/billing?action=webhook`,
          returnUrl: body.return_url || undefined,
          value: amount / 100,
          expiresAt: new Date(Date.now() + 3 * 86400000).toISOString(),
          buyer: {
            firstName: firstName || "Cliente", lastName: rest.join(" ") || (pf?.saas_name ?? "Date Nails"),
            document: doc.length === 11 ? doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5"),
            email: user.email,
            phone: phone ? `+55 ${phone.slice(0, 2)} ${phone.slice(2)}` : undefined,
          },
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.paymentUrl) return json({ error: data.message || "O PicPay recusou a cobrança. Confira os dados.", detail: data }, 502);
      await admin.from("dn_payments").insert({
        studio_id: studio.id, reference_id: ref, amount, payment_url: data.paymentUrl, qrcode: data.qrcode?.base64 || "", days: 30, raw: data,
      });
      return json({ reference_id: ref, payment_url: data.paymentUrl, qrcode: data.qrcode?.base64 || "" });
    }
    return json({ error: "Ação inválida." }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
