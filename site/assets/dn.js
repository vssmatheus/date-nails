/* Date Nails — utilidades compartilhadas (público, cliente, painel) */
(function () {
  const CFG = window.DN_CONFIG || {};
  const configured = CFG.SUPABASE_URL && !/SEU-PROJETO/.test(CFG.SUPABASE_URL) && window.supabase;
  const sb = configured ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { persistSession: !!CFG.persistSession, storageKey: 'dn-auth' }
  }) : null;

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = c => ((+c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dur = m => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m} min`);
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const longDate = s => cap(parse(s).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }));
  const shortDate = s => parse(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
  const fromMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const DOW = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const DOW_S = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const STATUS = { pendente: 'Pendente', confirmado: 'Confirmado', concluido: 'Concluído', faltou: 'Faltou', cancelado: 'Cancelado' };
  const SWATCH = ['var(--blush-200)', 'var(--rose-300)', 'var(--rose-500)', 'var(--rose-700)'];

  const maskPhone = v => {
    let d = String(v || '').replace(/\D/g, '');
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
    d = d.slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };
  const normPhone = p => { let d = String(p || '').replace(/\D/g, ''); if (d.length === 10 || d.length === 11) d = '55' + d; return d; };
  const wa = (phone, text = '') => `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

  function fillTpl(tpl, b, studio, extra = {}) {
    const map = Object.assign({
      nome: (b.client_name || '').split(' ')[0], servicos: (b.services || []).map(x => x.name).join(' + '),
      data: longDate(b.date), hora: b.start || b.start_at, valor: brl(b.total), codigo: b.code,
      studio: studio.name, endereco: studio.address || ''
    }, extra);
    return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
  }

  let toastT;
  function toast(msg, error = false) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.toggle('error', error); t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3800);
  }

  async function rpc(fn, args) {
    if (!sb) throw new Error('Configure o Supabase no arquivo config.js.');
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw Object.assign(new Error(error.message || 'Erro inesperado'), { status: error.code === 'RA409' ? 409 : 400, code: error.code });
    return data;
  }

  // raiz do site (funciona em domínio próprio ou em subpasta)
  const ROOT = (() => { const s = document.currentScript && document.currentScript.src; return s ? s.replace(/assets\/dn\.js.*$/, '') : '/'; })();

  window.DN = { sb, CFG, $, $$, esc, brl, dur, pad, iso, parse, addDays, cap, longDate, shortDate, toMin, fromMin, DOW, DOW_S, STATUS, SWATCH,
    maskPhone, normPhone, wa, fillTpl, toast, rpc, ROOT };
})();
