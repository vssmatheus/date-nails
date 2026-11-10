// Date Nails — gateway de WhatsApp (Baileys)
// - Uma sessão por studio (instância), conectada lendo QR Code.
// - As chaves da sessão ficam no Supabase (tabela dn_wa_auth), então o servidor pode
//   reiniciar ou "dormir" sem perder a conexão: ao voltar, reconecta sozinho.
// - Rotas compatíveis com a Evolution API (as Edge Functions não precisam mudar).
//
// Variáveis de ambiente:
//   API_KEY                    senha que as Edge Functions enviam no header "apikey"
//   SUPABASE_URL               https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  chave service_role (fica só aqui, nunca no site)
//   PORT                       (a hospedagem define)
import http from 'node:http';
import makeWASocket, { initAuthCreds, BufferJSON, DisconnectReason, Browsers, fetchLatestBaileysVersion, proto, makeCacheableSignalKeyStore } from 'baileys';
import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import pino from 'pino';

const { API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const PORT = +process.env.PORT || 8080;
if (!API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Defina API_KEY, SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const log = pino({ level: process.env.LOG_LEVEL || 'warn' });
const NAME_RE = /^[a-zA-Z0-9_-]{3,60}$/;

// ---------------- Sessão salva no Supabase ----------------
const enc = v => JSON.parse(JSON.stringify(v, BufferJSON.replacer));
const dec = v => (v == null ? null : JSON.parse(JSON.stringify(v), BufferJSON.reviver));

async function supabaseAuthState(instance) {
  const { data: row } = await sb.from('dn_wa_auth').select('value').eq('instance', instance).eq('key', 'creds').maybeSingle();
  const creds = dec(row?.value) || initAuthCreds();
  const write = async rows => {
    if (!rows.length) return;
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb.from('dn_wa_auth').upsert(rows.slice(i, i + 200).map(r => ({ instance, key: r.key, value: enc(r.value), updated_at: new Date().toISOString() })));
      if (error) log.error({ error }, 'erro ao salvar sessão');
    }
  };
  const remove = async keys => { if (keys.length) await sb.from('dn_wa_auth').delete().eq('instance', instance).in('key', keys); };
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const out = {};
          if (!ids.length) return out;
          const keys = ids.map(id => `${type}-${id}`);
          const { data } = await sb.from('dn_wa_auth').select('key,value').eq('instance', instance).in('key', keys);
          for (const r of data || []) {
            let v = dec(r.value);
            if (type === 'app-state-sync-key' && v) v = proto.Message.AppStateSyncKeyData.fromObject(v);
            out[r.key.slice(type.length + 1)] = v;
          }
          return out;
        },
        set: async data => {
          const up = [], del = [];
          for (const cat in data) for (const id in data[cat]) {
            const v = data[cat][id];
            (v ? up.push({ key: `${cat}-${id}`, value: v }) : del.push(`${cat}-${id}`));
          }
          await Promise.all([write(up), remove(del)]);
        }
      }
    },
    saveCreds: () => write([{ key: 'creds', value: creds }]),
    clear: () => sb.from('dn_wa_auth').delete().eq('instance', instance)
  };
}

// ---------------- Gerência das sessões ----------------
const sessions = new Map(); // nome -> { sock, state: 'open'|'connecting'|'close', qr, auth, retries }
let waVersion = null;

async function start(name) {
  const cur = sessions.get(name);
  if (cur && cur.state !== 'close') return cur;
  const auth = await supabaseAuthState(name);
  if (!waVersion) { try { waVersion = (await fetchLatestBaileysVersion()).version; } catch { waVersion = undefined; } }
  const s = { state: 'connecting', qr: '', auth, retries: cur?.retries || 0 };
  sessions.set(name, s);
  const sock = makeWASocket({
    version: waVersion,
    auth: { creds: auth.state.creds, keys: makeCacheableSignalKeyStore(auth.state.keys, log) },
    browser: Browsers.appropriate('Date Nails'),
    logger: log,
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    generateHighQualityLinkPreview: false,
  });
  s.sock = sock;
  sock.ev.on('creds.update', auth.saveCreds);
  sock.ev.on('connection.update', async u => {
    if (u.qr) s.qr = await QRCode.toDataURL(u.qr, { margin: 1, width: 320 });
    if (u.connection === 'open') { s.state = 'open'; s.qr = ''; s.retries = 0; console.log(`[${name}] conectado`); }
    if (u.connection === 'close') {
      const code = u.lastDisconnect?.error?.output?.statusCode;
      s.state = 'close';
      if (code === DisconnectReason.loggedOut || code === DisconnectReason.forbidden) {
        console.log(`[${name}] desconectado pelo celular — limpando sessão`);
        await auth.clear(); sessions.delete(name); return;
      }
      if (s.manualStop) return;
      s.retries++;
      const wait = Math.min(60000, 2000 * s.retries);
      console.log(`[${name}] conexão caiu (${code}); tentando de novo em ${wait / 1000}s`);
      setTimeout(() => start(name).catch(e => console.error(e)), wait);
    }
  });
  return s;
}

async function waitFor(name, cond, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const s = sessions.get(name); if (s && cond(s)) return s; await new Promise(r => setTimeout(r, 300)); }
  return sessions.get(name);
}

// número do Brasil: o WhatsApp de alguns números antigos não tem o 9 — perguntamos ao próprio WhatsApp
async function resolveJid(sock, number) {
  const digits = String(number).replace(/\D/g, '');
  const tries = [digits];
  if (digits.startsWith('55') && digits.length === 13) tries.push(digits.slice(0, 4) + digits.slice(5));
  if (digits.startsWith('55') && digits.length === 12) tries.push(digits.slice(0, 4) + '9' + digits.slice(4));
  for (const n of tries) {
    try { const [r] = await sock.onWhatsApp(n); if (r?.exists) return r.jid; } catch {}
  }
  return null;
}

// ao ligar, reconecta todas as sessões salvas
async function restoreAll() {
  const { data } = await sb.from('dn_wa_auth').select('instance').eq('key', 'creds');
  for (const r of data || []) { start(r.instance).catch(e => console.error(e)); await new Promise(r => setTimeout(r, 800)); }
  console.log(`sessões restauradas: ${(data || []).length}`);
}

// ---------------- HTTP ----------------
const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = req => new Promise(r => { let b = ''; req.on('data', c => (b += c)); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const parts = url.pathname.split('/').filter(Boolean);
  try {
    if (url.pathname === '/' || url.pathname === '/health') {
      return send(res, 200, { ok: true, service: 'date-nails-whatsapp', sessions: [...sessions.values()].filter(s => s.state === 'open').length });
    }
    if (req.headers.apikey !== API_KEY) return send(res, 401, { error: 'unauthorized' });

    // POST /instance/create {instanceName}
    if (req.method === 'POST' && url.pathname === '/instance/create') {
      const { instanceName } = await readBody(req);
      if (!NAME_RE.test(instanceName || '')) return send(res, 400, { error: 'nome inválido' });
      await start(instanceName);
      const s = await waitFor(instanceName, s => s.qr || s.state === 'open', 15000);
      return send(res, 201, { instance: { instanceName, state: s?.state }, qrcode: { base64: s?.qr || '' } });
    }
    const name = parts[2];
    if (parts[0] === 'instance' && name && !NAME_RE.test(name)) return send(res, 400, { error: 'nome inválido' });

    // GET /instance/connect/:name  → QR Code
    if (req.method === 'GET' && parts[0] === 'instance' && parts[1] === 'connect') {
      let s = sessions.get(name);
      if (!s || s.state === 'close') s = await start(name);
      s = await waitFor(name, s => s.qr || s.state === 'open', 15000);
      return send(res, 200, { base64: s?.qr || '', state: s?.state });
    }
    // GET /instance/connectionState/:name
    if (req.method === 'GET' && parts[0] === 'instance' && parts[1] === 'connectionState') {
      let s = sessions.get(name);
      if (!s) {
        // servidor acabou de reiniciar: se a sessão está salva, reconecta
        const { data } = await sb.from('dn_wa_auth').select('key').eq('instance', name).eq('key', 'creds').maybeSingle();
        if (!data) return send(res, 404, { error: 'instância não encontrada' });
        s = await start(name);
        s = await waitFor(name, x => x.state === 'open', 8000);
      }
      return send(res, 200, { instance: { instanceName: name, state: s.state } });
    }
    // DELETE /instance/logout/:name
    if (req.method === 'DELETE' && parts[0] === 'instance' && parts[1] === 'logout') {
      const s = sessions.get(name);
      if (s) { s.manualStop = true; try { await s.sock.logout(); } catch {} try { s.sock.end(); } catch {} await s.auth.clear(); sessions.delete(name); }
      else await sb.from('dn_wa_auth').delete().eq('instance', name);
      return send(res, 200, { status: 'SUCCESS' });
    }
    // POST /message/sendText/:name {number, text}
    if (req.method === 'POST' && parts[0] === 'message' && parts[1] === 'sendText') {
      const iname = parts[2];
      const s = sessions.get(iname);
      if (!s || s.state !== 'open') return send(res, 409, { error: 'Connection Closed — instância não conectada' });
      const { number, text } = await readBody(req);
      if (!number || !text) return send(res, 400, { error: 'number e text são obrigatórios' });
      const jid = await resolveJid(s.sock, number);
      if (!jid) return send(res, 404, { error: 'número não tem WhatsApp', number });
      const r = await s.sock.sendMessage(jid, { text: String(text).slice(0, 4000) });
      return send(res, 201, { key: r?.key, status: 'PENDING' });
    }
    return send(res, 404, { error: 'rota não encontrada' });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: e.message });
  }
}).listen(PORT, () => { console.log(`Date Nails WhatsApp na porta ${PORT}`); restoreAll().catch(e => console.error(e)); });

process.on('unhandledRejection', e => console.error('unhandled', e));
