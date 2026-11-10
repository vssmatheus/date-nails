/* Date Nails — painel da dona do studio */
(() => {
  const { sb, $, $$, esc, brl, dur, iso, parse, addDays, cap, longDate, shortDate, toMin, fromMin, DOW, DOW_S, STATUS, maskPhone, normPhone, wa, fillTpl, toast } = DN;
  const S = { user: null, studio: null, sub: null, active: true, platform: {}, services: [], today: iso(new Date()), date: iso(new Date()),
    bookings: [], blocks: [], pending: [], msgs: {}, finMonth: iso(new Date()).slice(0, 7), finFilter: 'todos', finance: [] };
  const SITE = new URL('../', location.href).href.replace(/\/$/, '');
  const publicUrl = () => `${SITE}/${S.studio.slug}`;
  const publicUrlSafe = () => `${SITE}/agendar/?s=${S.studio.slug}`;
  const chk = ({ data, error }) => {
    if (error) {
      if (/JWT|expired/i.test(error.message)) { showAuth(); throw new Error('Sua sessão expirou. Entre novamente.'); }
      throw Object.assign(new Error(error.message), { status: error.code === 'RA409' ? 409 : 400 });
    }
    return data;
  };
  const rpc = async (fn, args) => chk(await sb.rpc(fn, args));
  const nb = b => ({ ...b, start: b.start_at, end: b.end_at });
  const money = v => Math.round(parseFloat(String(v).replace(/\s|R\$/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) * 100) || 0;
  const moneyIn = c => ((+c || 0) / 100).toFixed(2).replace('.', ',');

  if (!sb) { document.body.innerHTML = '<p style="padding:30px;font-family:sans-serif">Configure o Supabase no arquivo config.js.</p>'; return; }

  // ---------------- Modal ----------------
  function openModal(title, html) { $('#modalTitle').textContent = title; $('#modalBody').innerHTML = html; $('#modal').hidden = false; document.body.style.overflow = 'hidden'; }
  function closeModal() { $('#modal').hidden = true; document.body.style.overflow = ''; }
  $('#modal').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });
  function confirmTap(btn, label = 'Toque de novo para confirmar') {
    if (btn.dataset.armed) return true;
    btn.dataset.armed = '1'; const old = btn.textContent; btn.textContent = label;
    setTimeout(() => { delete btn.dataset.armed; btn.textContent = old; }, 3000);
    return false;
  }

  // ---------------- Autenticação ----------------
  function screen(id) { ['auth', 'onboard', 'app'].forEach(x => { $('#' + x).hidden = x !== id; }); }
  function showAuth(tab = 'login') {
    screen('auth');
    $$('#authTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    $('#loginForm').hidden = tab !== 'login'; $('#signupForm').hidden = tab !== 'signup'; $('#resetForm').hidden = tab !== 'reset';
    $('#authTabs').hidden = tab === 'reset';
  }
  $$('#authTabs .tab').forEach(t => t.addEventListener('click', () => showAuth(t.dataset.tab)));
  if (new URLSearchParams(location.search).get('cadastro') !== null) showAuth('signup');

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const { error } = await sb.auth.signInWithPassword({ email: $('#lEmail').value.trim(), password: $('#lPw').value });
    if (error) return toast(/Invalid login/i.test(error.message) ? 'E-mail ou senha incorretos.' : /confirm/i.test(error.message) ? 'Confirme seu e-mail pelo link que enviamos.' : error.message, true);
    boot();
  });
  $('#signupForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#signupBtn'); btn.disabled = true;
    const { data, error } = await sb.auth.signUp({ email: $('#sEmail').value.trim(), password: $('#sPw').value, options: { emailRedirectTo: location.href.split('?')[0] } });
    btn.disabled = false;
    if (error) return toast(/registered/i.test(error.message) ? 'Este e-mail já tem conta. Use "Entrar".' : error.message, true);
    if (!data.session) { toast('Enviamos um link de confirmação para o seu e-mail.'); showAuth('login'); $('#lEmail').value = $('#sEmail').value; return; }
    boot();
  });
  $('#forgotBtn').addEventListener('click', async () => {
    const email = $('#lEmail').value.trim();
    if (!email) return toast('Digite seu e-mail no campo acima.', true);
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('?')[0].split('#')[0] });
    toast(error ? error.message : 'Enviamos um link para redefinir sua senha.', !!error);
  });
  $('#resetForm').addEventListener('submit', async e => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: $('#rPw').value });
    if (error) return toast(error.message, true);
    toast('Senha alterada!'); boot();
  });
  sb.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') showAuth('reset'); });
  const logout = async () => { await sb.auth.signOut(); location.reload(); };
  document.addEventListener('click', e => { if (e.target.closest('[data-logout]')) logout(); });

  // ---------------- Primeiro acesso ----------------
  const slugify = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  let slugTouched = false;
  $('#slugPrefix').textContent = SITE.replace(/^https?:\/\//, '') + '/';
  $('#oName').addEventListener('input', () => { if (!slugTouched) $('#oSlug').value = slugify($('#oName').value); });
  $('#oSlug').addEventListener('input', () => { slugTouched = true; $('#oSlug').value = slugify($('#oSlug').value); });
  $('#oWa').addEventListener('input', e => { e.target.value = maskPhone(e.target.value); });
  $('#onboardForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await rpc('dn_create_studio', { p_name: $('#oName').value.trim(), p_slug: $('#oSlug').value, p_whatsapp: $('#oWa').value, p_segment: $('#oSeg').value });
      toast('Agenda criada! 💅'); boot('aparencia');
    } catch (err) { toast(err.message, true); }
  });

  // ---------------- Navegação ----------------
  function view(name) {
    S.view = name;
    if (name !== 'assinatura' && S.studio && !S.active) renderSubBanner();
    $$('.nav-item[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    $$('.view').forEach(v => v.classList.toggle('active', v.dataset.view === name));
    $('#fab').hidden = name !== 'agenda';
    window.scrollTo(0, 0);
    ({ clientes: loadClients, financeiro: loadFinance, servicos: renderServices, folgas: loadBlocks, aparencia: fillLook, whatsapp: loadWhatsApp, ajustes: fillSettings, assinatura: loadPlan, agenda: loadAgenda })[name]?.();
    history.replaceState(null, '', '#' + name);
  }
  $$('.nav-item[data-view]').forEach(b => b.addEventListener('click', () => view(b.dataset.view)));
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (S.studio && h && h !== S.view && $(`.view[data-view="${h}"]`)) view(h); });
  $('[data-more]').addEventListener('click', () => {
    const items = [['folgas', 'Folgas e bloqueios', '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>'],
      ['aparencia', 'Aparência (logo e cores)', '<circle cx="12" cy="12" r="8.5"/><circle cx="8.5" cy="10" r="1.3"/><circle cx="12" cy="7.5" r="1.3"/><circle cx="15.5" cy="10" r="1.3"/>'],
      ['whatsapp', 'WhatsApp automático', '<path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/>'],
      ['ajustes', 'Ajustes e horários', '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'],
      ['assinatura', 'Assinatura', '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10.5h18"/>']];
    openModal('Mais opções', `<div class="sheet-list">
      ${items.map(([v, l, p]) => `<button data-goview="${v}"><svg viewBox="0 0 24 24">${p}</svg>${l}</button>`).join('')}
      <a href="${publicUrlSafe()}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>Ver minha página</a>
      ${S.isSuper ? `<a href="../saas/"><svg viewBox="0 0 24 24"><path d="M3 12h18M12 3v18"/></svg>Painel da plataforma</a>` : ''}
      <button data-logout><svg viewBox="0 0 24 24"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/></svg>Sair</button></div>`);
  });
  document.addEventListener('click', e => { const g = e.target.closest('[data-goview]'); if (g) { closeModal(); view(g.dataset.goview); } });

  // ---------------- Assinatura: faixa e bloqueio ----------------
  function daysLeft(ts) { return Math.ceil((new Date(ts) - new Date()) / 86400000); }
  function renderSubBanner() {
    const sub = S.sub, b = $('#subBanner');
    b.hidden = true; b.className = 'sub-banner';
    $('.paywall')?.remove();
    if (!sub) return;
    if (!S.active && S.view === 'assinatura') {
      b.hidden = false; b.classList.add('bad'); b.innerHTML = '<span>Sua agenda está pausada para as clientes até o pagamento ser confirmado.</span>'; return;
    }
    if (!S.active && S.view !== 'assinatura') {
      const pw = document.createElement('div'); pw.className = 'paywall';
      pw.innerHTML = `<div class="paywall-card"><span class="auth-word script">${esc(S.platform.saas_name || 'Date Nails')}</span>
        <h2 class="serif">${sub.status === 'trial' ? 'Seu teste grátis terminou' : 'Sua assinatura venceu'}</h2>
        <p>Sua página de agendamento está pausada para as clientes. Assine para continuar recebendo agendamentos. Seus dados estão guardados.</p>
        <button class="btn btn-primary btn-block" data-goview="assinatura" id="payNowBtn">Assinar agora · ${brl(S.platform.plan_price)}/mês</button>
        <button class="link-btn" data-logout>Sair</button></div>`;
      document.body.appendChild(pw);
      return;
    }
    if (sub.status === 'trial') {
      const d = daysLeft(sub.trial_ends_at);
      b.hidden = false; b.classList.toggle('warn', d <= 3);
      b.innerHTML = `<span>Teste grátis: ${d <= 0 ? 'termina hoje' : d === 1 ? 'falta 1 dia' : `faltam ${d} dias`}.</span><button class="btn btn-sm btn-primary" data-goview="assinatura">Assinar</button>`;
    } else if (sub.paid_until && daysLeft(sub.paid_until) <= 5) {
      const d = daysLeft(sub.paid_until);
      b.hidden = false; b.classList.add('warn');
      b.innerHTML = `<span>Sua assinatura vence em ${d <= 0 ? 'hoje' : d === 1 ? '1 dia' : d + ' dias'}.</span><button class="btn btn-sm btn-primary" data-goview="assinatura">Renovar</button>`;
    }
  }
  document.addEventListener('click', e => { if (e.target.closest('#payNowBtn')) $('.paywall')?.remove(); });

  // ---------------- Agenda ----------------
  const weekStart = d => { const x = parse(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x); };

  async function loadAgenda() {
    const ws = weekStart(S.date), we = addDays(ws, 6);
    const from = [ws, S.today].sort()[0];
    const to = [we, addDays(S.today, 7)].sort().pop();
    const sid = S.studio.id;
    const [b, bl, pe, st] = await Promise.all([
      sb.from('dn_bookings').select('*').eq('studio_id', sid).gte('date', from).lte('date', to).order('date').order('start_at'),
      sb.from('dn_blocks').select('*').eq('studio_id', sid).gte('date', from).lte('date', to).order('date').order('start_at'),
      sb.from('dn_bookings').select('id,date,start_at,client_name').eq('studio_id', sid).eq('status', 'pendente').gte('date', S.today).order('date').order('start_at'),
      sb.rpc('dn_admin_stats', { p_studio: sid, p_from: S.date.slice(0, 8) + '01', p_to: lastDay(S.date) })
    ]);
    S.bookings = chk(b).map(nb); S.blocks = chk(bl).map(nb); S.pending = chk(pe); S.stats = chk(st);
    const ids = S.bookings.map(x => x.id);
    S.msgs = {};
    if (ids.length) {
      const m = chk(await sb.from('dn_messages').select('booking_id,kind,status,send_after,sent_at').in('booking_id', ids));
      m.forEach(x => { (S.msgs[x.booking_id] ||= []).push(x); });
    }
    renderAgenda();
  }
  const lastDay = d => { const x = parse(d.slice(0, 8) + '01'); x.setMonth(x.getMonth() + 1); x.setDate(0); return iso(x); };

  function renderAgenda() {
    const d = S.date, s = S.studio;
    const isToday = d === S.today;
    $('#agendaTitle').textContent = isToday ? 'Hoje' : d === addDays(S.today, 1) ? 'Amanhã' : d === addDays(S.today, -1) ? 'Ontem' : cap(parse(d).toLocaleDateString('pt-BR', { weekday: 'long' }));
    $('#agendaKicker').textContent = parse(d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    $('#datePick').value = d;

    const ws = weekStart(d);
    $('#week').innerHTML = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(ws, i), dt = parse(day);
      const n = S.bookings.filter(b => b.date === day && b.status !== 'cancelado').length;
      const closed = !s.hours[dt.getDay()];
      return `<button class="wday ${day === d ? 'sel' : ''} ${day === S.today ? 'today' : ''} ${closed ? 'closed' : ''}" data-day="${day}">
        <span class="dw">${DOW_S[dt.getDay()]}</span><span class="dn">${dt.getDate()}</span><span class="cnt">${n || (closed ? '—' : '·')}</span></button>`;
    }).join('');

    const pend = S.pending;
    $('#pendingBanner').hidden = !pend.length;
    if (pend.length) $('#pendingBanner').innerHTML = `<span>${pend.length === 1 ? '1 agendamento aguarda' : `${pend.length} agendamentos aguardam`} sua confirmação</span>
      <button class="btn btn-sm btn-primary" data-jump="${pend[0].date}">Ver ${pend[0].date === d ? '' : shortDate(pend[0].date)}</button>`;

    const day = S.bookings.filter(b => b.date === d);
    const live = day.filter(b => !['cancelado', 'faltou'].includes(b.status));
    const st = S.stats.by_status || {};
    const done = st.concluido?.t || 0, planned = (st.confirmado?.t || 0) + (st.pendente?.t || 0) + done;
    $('#kpis').innerHTML = `
      <div class="kpi"><b>${live.length}</b><span>atendimentos no dia</span></div>
      <div class="kpi"><b>${brl(live.reduce((a, b) => a + +b.total, 0)).replace(',00', '')}</b><span>previsto no dia</span></div>
      <div class="kpi"><b>${brl(done).replace(',00', '')}</b><span>recebido no mês</span></div>
      <div class="kpi"><b>${brl(planned).replace(',00', '')}</b><span>agendado no mês</span></div>`;

    const blocks = S.blocks.filter(b => b.date === d);
    const hours = s.hours[parse(d).getDay()];
    const items = [...day.map(b => ({ t: b.start, b })), ...blocks.map(x => ({ t: x.start || '00:00', blk: x }))].sort((a, b) => a.t.localeCompare(b.t));
    if (!items.length) {
      $('#timeline').innerHTML = `<div class="empty"><strong>${hours ? 'Agenda livre' : 'Dia de folga'}</strong>${hours ? `Atendimento das ${hours[0]} às ${hours[1]}. Toque em + para encaixar alguém.` : 'O studio não abre neste dia.'}</div>`;
    } else {
      let html = '', last = hours ? toMin(hours[0]) : null;
      items.forEach(it => {
        if (it.blk) { html += `<div class="block-row">⦸ ${it.blk.start ? `${it.blk.start}–${it.blk.end}` : 'Dia inteiro'} bloqueado${it.blk.reason ? ` · ${esc(it.blk.reason)}` : ''}</div>`; return; }
        const b = it.b;
        if (b.status !== 'cancelado' && last !== null && toMin(b.start) - last >= 60) html += `<div class="free-gap">${dur(toMin(b.start) - last)} livre</div>`;
        html += bookingCard(b);
        if (b.status !== 'cancelado') last = Math.max(last ?? 0, toMin(b.end));
      });
      $('#timeline').innerHTML = html;
    }

    // próximos 7 dias
    const now = new Date();
    const up = S.bookings.filter(b => ['pendente', 'confirmado'].includes(b.status) && new Date(`${b.date}T${b.end}:00`) > now && b.date <= addDays(S.today, 7)).slice(0, 8);
    $('#upcomingList').innerHTML = up.length ? up.map(b => {
      const dt = parse(b.date);
      return `<button class="up-row" data-bk="${b.id}"><span class="up-date"><span>${DOW_S[dt.getDay()]}</span><b>${dt.getDate()}</b></span>
        <span class="up-main"><b>${b.start} · ${esc(b.client_name)}</b><span>${esc(b.services.map(x => x.name).join(' + '))}</span></span>
        <span class="pill st-${b.status}">${STATUS[b.status]}</span></button>`;
    }).join('') : '<p class="hint">Nenhum horário nos próximos 7 dias.</p>';

    // lembretes manuais (só sem WhatsApp automático)
    const tm = addDays(S.today, 1);
    const tml = S.bookings.filter(b => b.date === tm && ['pendente', 'confirmado'].includes(b.status));
    const auto = s.wa_status === 'conectado' && s.wa_send_reminder;
    $('#tomorrowBox').hidden = auto || !tml.length;
    $('#tomorrowList').innerHTML = tml.map(b => `
      <div class="tm-row"><div class="who"><b>${b.start} · ${esc(b.client_name)}</b><span>${esc(b.services.map(x => x.name).join(' + '))}</span></div>
      <a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="${wa(b.client_phone, fillTpl(s.tpl_reminder, b, s, { antecedencia: 'pouco tempo', link: clientLink(b) }))}">Lembrar</a></div>`).join('');
  }
  const clientLink = b => `${SITE}/minha-agenda/?s=${S.studio.slug}&t=${b.access_token}`;

  function bookingCard(b) {
    const ms = S.msgs[b.id] || [];
    const conf = ms.find(m => m.kind === 'confirmacao');
    const flag = conf ? (conf.status === 'enviado' ? '✓ WhatsApp enviado' : conf.status === 'erro' ? '⚠ WhatsApp falhou' : conf.status === 'pendente' || conf.status === 'enviando' ? '… enviando WhatsApp' : '') : '';
    return `<button class="bk st-${b.status} is-${b.status}" data-bk="${b.id}">
      <div class="bk-time"><b>${b.start}</b><span>${b.end}</span></div>
      <div class="bk-body"><div class="bk-name">${esc(b.client_name)}</div><div class="bk-svc">${esc(b.services.map(x => x.name).join(' + '))}</div>${flag ? `<div class="wa-flag">${flag}</div>` : ''}</div>
      <div class="bk-right"><span class="v">${brl(b.total)}</span><span class="pill">${STATUS[b.status]}</span>${b.status === 'concluido' && !b.payment_method ? '<span class="wa-flag" style="color:var(--warn)">informar pagamento</span>' : ''}</div>
    </button>`;
  }

  function openBooking(id) {
    const b = S.bookings.find(x => +x.id === +id); if (!b) return;
    const s = S.studio, auto = s.wa_status === 'conectado';
    const ms = (S.msgs[b.id] || []).map(m => `<span>${m.kind === 'confirmacao' ? 'Confirmação' : m.kind === 'lembrete' ? 'Lembrete' : 'Mensagem'}: <b>${m.status === 'enviado' ? 'enviada ✓' : m.status === 'pendente' ? (m.kind === 'lembrete' ? 'agendada para ' + new Date(m.send_after).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'na fila') : m.status}</b></span>`).join('');
    const send = (tpl, label, cls = 'btn-ghost') => auto
      ? `<button class="btn ${cls} btn-sm" data-send="${b.id}" data-tpl="${tpl}">${label}</button>`
      : `<a class="btn ${cls} btn-sm" target="_blank" rel="noopener" href="${wa(b.client_phone, fillTpl(s[tpl], b, s, { link: clientLink(b), antecedencia: 'pouco tempo', agendar: publicUrl() }))}">${label}</a>`;
    openModal(b.client_name, `
      <div class="detail st-${b.status}">
        <span class="pill">${STATUS[b.status]}</span>
        <div class="when">${longDate(b.date)} · ${b.start}–${b.end}</div>
        <dl>
          <dt>Serviços</dt><dd>${esc(b.services.map(x => x.name).join(' + '))}</dd>
          <dt>Valor</dt><dd>${brl(b.total)}${b.payment_method ? ` · ${esc(b.payment_method)}` : ''}</dd>
          <dt>WhatsApp</dt><dd><a href="${wa(b.client_phone)}" target="_blank" rel="noopener">${maskPhone(b.client_phone)}</a></dd>
          <dt>Código</dt><dd>${esc(b.code)} · ${b.source === 'online' ? 'pelo site' : 'manual'}</dd>
          ${b.notes ? `<dt>Obs.</dt><dd>${esc(b.notes)}</dd>` : ''}
        </dl>
        ${ms ? `<div class="msg-mini">${ms}</div>` : ''}
      </div>
      <p class="actions-label">WhatsApp ${auto ? '(envio automático pelo número do studio)' : ''}</p>
      <div class="btn-row">${send('tpl_confirm', 'Enviar confirmação', 'btn-wa')}${send('tpl_reminder', 'Lembrete')}${send('tpl_thanks', 'Agradecer')}</div>
      <p class="actions-label">Status</p>
      <div class="btn-row">
        ${b.status !== 'confirmado' && b.status !== 'concluido' ? `<button class="btn btn-ghost btn-sm" data-status="confirmado" data-id="${b.id}">Confirmar</button>` : ''}
        ${b.status !== 'concluido' ? `<button class="btn btn-primary btn-sm" data-conclude="${b.id}">Concluir ✓</button>` : `<button class="btn btn-ghost btn-sm" data-status="confirmado" data-id="${b.id}">Desfazer conclusão</button>`}
        ${b.status !== 'faltou' ? `<button class="btn btn-ghost btn-sm" data-status="faltou" data-id="${b.id}">${b.status === 'concluido' ? 'Não veio (faltou)' : 'Faltou'}</button>` : ''}
        ${b.status !== 'cancelado' ? `<button class="btn btn-ghost btn-sm" data-status="cancelado" data-id="${b.id}">Cancelar</button>` : ''}
      </div>
      <div id="concludeBox" ${b.status === 'concluido' && !b.payment_method ? '' : 'hidden'}>
        <p class="actions-label">${b.status === 'concluido' ? (b.auto_completed ? 'Concluído automaticamente ao fim do horário · como ela pagou?' : 'Como ela pagou?') : 'Forma de pagamento'}</p>
        <div class="btn-row">${['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito'].map(m => `<button class="btn btn-ghost btn-sm" data-pay="${m}" data-id="${b.id}">${m}</button>`).join('')}</div>
      </div>
      <p class="actions-label">Remarcar / ajustar valor</p>
      <div class="form-grid">
        <div class="field"><label>Nova data</label><input type="date" id="rsDate" value="${b.date}"></div>
        <div class="field"><label>Valor cobrado (R$)</label><input id="rsTotal" inputmode="decimal" value="${moneyIn(b.total)}"></div>
      </div>
      <div class="slot-pick" id="rsSlots"></div>
      <div class="btn-row"><button class="btn btn-primary btn-sm" id="rsSave" data-id="${b.id}">Salvar alterações</button></div>
      <button class="danger-link" data-del="${b.id}">Excluir agendamento</button>`);
    const loadRs = async () => {
      const slots = await rpc('dn_slots_for', { p_studio: S.studio.id, p_date: $('#rsDate').value, p_duration: b.duration, p_ignore: b.id, p_admin: true }) || [];
      const cur = $('#rsDate').value === b.date ? b.start : null;
      $('#rsSlots').innerHTML = slots.length ? slots.map(t => `<button type="button" class="${t === cur ? 'on' : ''}" data-t="${t}">${t}</button>`).join('') : '<p class="hint">Sem horários livres nesse dia.</p>';
    };
    $('#rsDate').addEventListener('change', loadRs); loadRs();
    $('#rsSlots').addEventListener('click', e => { const t = e.target.closest('[data-t]'); if (!t) return; $$('#rsSlots button').forEach(x => x.classList.toggle('on', x === t)); });
    $('#rsSave').addEventListener('click', async () => {
      const on = $('#rsSlots .on');
      const upd = { total: money($('#rsTotal').value) };
      if (on && (on.dataset.t !== b.start || $('#rsDate').value !== b.date)) {
        upd.date = $('#rsDate').value; upd.start_at = on.dataset.t; upd.end_at = fromMin(toMin(on.dataset.t) + b.duration);
      }
      try { chk(await sb.from('dn_bookings').update(upd).eq('id', b.id)); toast('Salvo!'); closeModal(); if (upd.date) S.date = upd.date; loadAgenda(); } catch (e) { toast(e.message, true); }
    });
  }

  async function setStatus(id, status, extra = {}) {
    try { chk(await sb.from('dn_bookings').update({ status, ...extra }).eq('id', id)); toast(`Marcado como ${STATUS[status].toLowerCase()}`); closeModal(); loadAgenda(); }
    catch (e) { toast(e.message, true); }
  }

  async function sendNow(id, tpl) {
    const b = S.bookings.find(x => +x.id === +id), s = S.studio;
    const body = fillTpl(s[tpl], b, s, { link: clientLink(b), antecedencia: s.wa_reminder_minutes >= 60 ? `${s.wa_reminder_minutes / 60} hora(s)` : `${s.wa_reminder_minutes} minutos`, agendar: publicUrl() });
    try {
      chk(await sb.from('dn_messages').insert({ studio_id: s.id, booking_id: b.id, kind: 'manual', to_phone: b.client_phone, body }));
      toast('Mensagem na fila. Sai em até 1 minuto.');
      if (tpl === 'tpl_confirm' && b.status === 'pendente') setStatus(b.id, 'confirmado');
    } catch (e) { toast(e.message, true); }
  }

  function newBooking() {
    const active = S.services.filter(s => s.active);
    openModal('Novo agendamento', `
      <p class="actions-label" style="margin-top:0">Serviços</p>
      <div class="chk-list">${active.map(s => `<label class="chk"><input type="checkbox" value="${s.id}" data-d="${s.duration}"><span>${esc(s.name)}</span><span>${dur(+s.duration)}</span></label>`).join('')}</div>
      <div class="form-grid">
        <div class="field"><label>Data</label><input type="date" id="nbDate" value="${S.date}"></div>
        <div class="field"><label>Encaixe em horário específico</label><input type="time" id="nbForce"></div>
      </div>
      <div class="slot-pick" id="nbSlots"><p class="hint">Escolha os serviços para ver os horários.</p></div>
      <div class="field"><label>Nome da cliente</label><input id="nbName" list="clientNames" autocomplete="off"></div>
      <datalist id="clientNames"></datalist>
      <div class="field"><label>WhatsApp</label><input id="nbPhone" inputmode="tel" placeholder="(11) 99999-9999"></div>
      <div class="field"><label>Observações</label><textarea id="nbNotes"></textarea></div>
      <button class="btn btn-primary btn-block" id="nbSave">Agendar</button>`);
    const sel = () => $$('.chk-list input:checked');
    const load = async () => {
      const d = sel().reduce((a, i) => a + +i.dataset.d, 0);
      if (!d) { $('#nbSlots').innerHTML = '<p class="hint">Escolha os serviços para ver os horários.</p>'; return; }
      const slots = await rpc('dn_slots_for', { p_studio: S.studio.id, p_date: $('#nbDate').value, p_duration: d, p_ignore: null, p_admin: true }) || [];
      $('#nbSlots').innerHTML = slots.length ? slots.map(t => `<button type="button" data-t="${t}">${t}</button>`).join('') : '<p class="hint">Sem horários livres. Use o campo "encaixe" para forçar um horário.</p>';
    };
    $$('.chk-list input').forEach(i => i.addEventListener('change', load));
    $('#nbDate').addEventListener('change', load);
    $('#nbSlots').addEventListener('click', e => { const t = e.target.closest('[data-t]'); if (!t) return; $$('#nbSlots button').forEach(x => x.classList.toggle('on', x === t)); $('#nbForce').value = ''; });
    $('#nbPhone').addEventListener('input', e => { e.target.value = maskPhone(e.target.value); });
    rpc('dn_admin_clients', { p_studio: S.studio.id }).then(clients => {
      S.clients = clients || [];
      $('#clientNames').innerHTML = S.clients.map(c => `<option value="${esc(c.name)}">${maskPhone(c.phone)}</option>`).join('');
    }).catch(() => {});
    $('#nbName').addEventListener('change', () => { const c = (S.clients || []).find(c => c.name === $('#nbName').value); if (c && !$('#nbPhone').value) $('#nbPhone').value = maskPhone(c.phone); });
    $('#nbSave').addEventListener('click', async () => {
      const services = sel().map(i => +i.value), force = $('#nbForce').value, start = force || $('#nbSlots .on')?.dataset.t;
      if (!services.length) return toast('Escolha ao menos um serviço.', true);
      if (!start) return toast('Escolha um horário.', true);
      try {
        await rpc('dn_admin_book', { p_studio: S.studio.id, p_services: services, p_date: $('#nbDate').value, p_start: start, p_name: $('#nbName').value, p_phone: $('#nbPhone').value, p_notes: $('#nbNotes').value, p_force: !!force });
        toast('Agendado!'); closeModal(); S.date = $('#nbDate').value; loadAgenda();
      } catch (e) { toast(e.message, true); }
    });
  }

  document.addEventListener('click', async e => {
    const t = e.target;
    const wd = t.closest('[data-day]'); if (wd) { S.date = wd.dataset.day; loadAgenda(); return; }
    const j = t.closest('[data-jump]'); if (j) { S.date = j.dataset.jump; loadAgenda(); return; }
    const bk = t.closest('[data-bk]'); if (bk) { openBooking(bk.dataset.bk); return; }
    const st = t.closest('[data-status]'); if (st) { setStatus(+st.dataset.id, st.dataset.status); return; }
    const cc = t.closest('[data-conclude]'); if (cc) { $('#concludeBox').hidden = false; $('#concludeBox').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    const pay = t.closest('[data-pay]'); if (pay) { setStatus(+pay.dataset.id, 'concluido', { payment_method: pay.dataset.pay }); return; }
    const sn = t.closest('[data-send]'); if (sn) { sendNow(sn.dataset.send, sn.dataset.tpl); return; }
    const del = t.closest('[data-del]');
    if (del && confirmTap(del)) { try { chk(await sb.from('dn_bookings').delete().eq('id', +del.dataset.del)); toast('Excluído.'); closeModal(); loadAgenda(); } catch (err) { toast(err.message, true); } }
  });
  $('#prevDay').addEventListener('click', () => { S.date = addDays(S.date, -1); loadAgenda(); });
  $('#nextDay').addEventListener('click', () => { S.date = addDays(S.date, 1); loadAgenda(); });
  $('#todayBtn').addEventListener('click', () => { S.date = S.today; loadAgenda(); });
  $('#datePick').addEventListener('change', e => { if (e.target.value) { S.date = e.target.value; loadAgenda(); } });
  $('#fab').addEventListener('click', newBooking);

  // ---------------- Clientes ----------------
  async function loadClients() {
    const [clients, stats] = await Promise.all([rpc('dn_admin_clients', { p_studio: S.studio.id }), rpc('dn_admin_stats', { p_studio: S.studio.id, p_from: S.today.slice(0, 8) + '01', p_to: lastDay(S.today) })]);
    S.clients = clients || [];
    const by = stats.by_status, top = Object.entries(stats.top_services || {})[0];
    $('#monthStats').innerHTML = `
      <div class="kpi"><b>${S.clients.length}</b><span>clientes no total</span></div>
      <div class="kpi"><b>${by.concluido?.n || 0}</b><span>atendidas no mês</span></div>
      <div class="kpi"><b>${by.faltou?.n || 0}</b><span>faltas no mês</span></div>
      <div class="kpi"><b style="font-size:1.05rem">${top ? esc(top[0]) : '—'}</b><span>serviço mais pedido</span></div>`;
    renderClients();
  }
  function renderClients() {
    const q = $('#clientSearch').value.toLowerCase().replace(/[()\-\s]/g, '');
    const list = (S.clients || []).filter(c => !q || c.name.toLowerCase().replace(/\s/g, '').includes(q) || c.phone.includes(q));
    $('#clientList').innerHTML = list.length ? list.map(c => `
      <div class="row"><div class="row-main"><b>${esc(c.name)}</b>
        <span>${maskPhone(c.phone)} · ${c.visits} ${+c.visits === 1 ? 'agendamento' : 'agendamentos'} · ${brl(c.spent)}${+c.noshows ? ` · ${c.noshows} falta(s)` : ''}</span>
        <span style="display:block">${c.next_visit ? `Próximo: ${shortDate(c.next_visit)} ${c.next_visit.slice(11)}` : c.last_visit ? `Última visita: ${shortDate(c.last_visit)}` : ''}</span></div>
        <div class="row-side"><a class="btn btn-wa btn-sm" href="${wa(c.phone, `Oi, ${c.name.split(' ')[0]}! `)}" target="_blank" rel="noopener">WhatsApp</a></div></div>`).join('')
      : `<div class="empty"><strong>Nenhuma cliente ainda</strong>Elas aparecem aqui assim que agendarem.</div>`;
  }
  $('#clientSearch').addEventListener('input', renderClients);
  const csv = (rows, name) => {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + rows.map(r => r.map(q).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = name; a.click();
  };
  $('#exportBtn').addEventListener('click', async () => {
    const rows = chk(await sb.from('dn_bookings').select('*').eq('studio_id', S.studio.id).order('date').order('start_at'));
    csv([['Data', 'Início', 'Fim', 'Cliente', 'WhatsApp', 'Serviços', 'Valor (R$)', 'Status', 'Pagamento', 'Origem', 'Obs'],
      ...rows.map(b => [b.date, b.start_at, b.end_at, b.client_name, b.client_phone, b.services.map(x => x.name).join(' + '), moneyIn(b.total), STATUS[b.status], b.payment_method, b.source, b.notes])],
      `agendamentos-${S.today}.csv`);
  });

  // ---------------- Financeiro ----------------
  const CAT_IN = ['Atendimentos', 'Venda de produtos', 'Sinal / adiantamento', 'Outros'];
  const CAT_OUT = ['Materiais e produtos', 'Aluguel', 'Energia e água', 'Internet e telefone', 'Marketing', 'Taxas e impostos', 'Equipamentos', 'Cursos', 'Retirada pessoal', 'Outros'];
  const METHODS = ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Transferência', 'Boleto'];
  const monthLabel = m => cap(new Date(+m.slice(0, 4), +m.slice(5) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
  const shiftMonth = (m, n) => { const d = new Date(+m.slice(0, 4), +m.slice(5) - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

  async function loadFinance() {
    const m = S.finMonth, from = m + '-01', to = lastDay(from);
    $('#finMonth').textContent = monthLabel(m);
    const [f, b] = await Promise.all([
      sb.from('dn_finance').select('*').eq('studio_id', S.studio.id).gte('date', from).lte('date', to).order('date', { ascending: false }).order('id', { ascending: false }),
      sb.from('dn_bookings').select('total,status').eq('studio_id', S.studio.id).gte('date', from).lte('date', to).in('status', ['pendente', 'confirmado'])
    ]);
    S.finance = chk(f);
    const toReceive = chk(b).reduce((a, x) => a + x.total, 0);
    const ins = S.finance.filter(x => x.kind === 'entrada'), outs = S.finance.filter(x => x.kind === 'saida');
    const tIn = ins.reduce((a, x) => a + x.amount, 0), tOut = outs.reduce((a, x) => a + x.amount, 0);
    const atend = ins.filter(x => x.booking_id).length;
    $('#finKpis').innerHTML = `
      <div class="kpi in"><b>${brl(tIn)}</b><span>entradas</span></div>
      <div class="kpi out"><b>${brl(tOut)}</b><span>saídas</span></div>
      <div class="kpi"><b>${brl(tIn - tOut)}</b><span>saldo do mês</span></div>
      <div class="kpi"><b>${brl(toReceive)}</b><span>a receber (agendados)</span></div>`;
    const bars = (list, cls) => {
      const by = {}; list.forEach(x => { by[x.category || 'Outros'] = (by[x.category || 'Outros'] || 0) + x.amount; });
      const max = Math.max(1, ...Object.values(by));
      const rows = Object.entries(by).sort((a, b) => b[1] - a[1]);
      return rows.length ? rows.map(([k, v]) => `<div class="bar-row ${cls}"><span>${esc(k)}</span><b>${brl(v)}</b><div class="bar"><i style="width:${Math.max(3, v / max * 100)}%"></i></div></div>`).join('') : '<p class="hint">Nada lançado neste mês.</p>';
    };
    $('#finIn').innerHTML = bars(ins, 'in') + (atend ? `<p class="hint">${atend} atendimento(s) concluído(s) · ticket médio ${brl(Math.round(ins.filter(x => x.booking_id).reduce((a, x) => a + x.amount, 0) / atend))}</p>` : '');
    $('#finOut').innerHTML = bars(outs, 'out');
    $('#printHead').innerHTML = `<h1 class="serif">${esc(S.studio.name)} — Relatório financeiro</h1><p>${monthLabel(m)} · gerado em ${new Date().toLocaleDateString('pt-BR')}</p>`;
    renderFinList();
  }
  function renderFinList() {
    const list = S.finance.filter(x => S.finFilter === 'todos' || x.kind === S.finFilter);
    $('#finList').innerHTML = list.length ? list.map(x => `
      <div class="fin-row" data-fin="${x.id}"><span class="d">${shortDate(x.date)}</span>
        <div><b>${esc(x.description || x.category)}</b><span class="c">${esc(x.category)}${x.method ? ` · ${esc(x.method)}` : ''}${x.booking_id ? ' · automático' : ''}</span></div>
        <span class="v ${x.kind === 'entrada' ? 'in' : 'out'}">${x.kind === 'entrada' ? '+' : '−'} ${brl(x.amount)}</span></div>`).join('')
      : `<div class="empty"><strong>Sem lançamentos</strong>Atendimentos concluídos entram aqui sozinhos. Lance também suas despesas.</div>`;
  }
  function editFinance(kind, id) {
    const x = id ? S.finance.find(f => +f.id === +id) : { kind, category: kind === 'entrada' ? 'Venda de produtos' : 'Materiais e produtos', description: '', amount: 0, date: S.finMonth === S.today.slice(0, 7) ? S.today : S.finMonth + '-01', method: 'Pix' };
    const cats = x.kind === 'entrada' ? CAT_IN : CAT_OUT;
    openModal(id ? 'Editar lançamento' : x.kind === 'entrada' ? 'Nova entrada' : 'Nova saída', `
      <form id="finForm">
        <div class="field"><label>Descrição</label><input name="description" value="${esc(x.description)}" placeholder="${x.kind === 'entrada' ? 'Ex.: venda de óleo de cutícula' : 'Ex.: compra de gel e lixas'}"></div>
        <div class="form-grid">
          <div class="field"><label>Valor (R$)</label><input name="amount" inputmode="decimal" required value="${x.amount ? moneyIn(x.amount) : ''}" placeholder="0,00"></div>
          <div class="field"><label>Data</label><input name="date" type="date" required value="${x.date}"></div>
          <div class="field"><label>Categoria</label><input name="category" list="finCats" value="${esc(x.category)}"><datalist id="finCats">${cats.map(c => `<option value="${c}">`).join('')}</datalist></div>
          <div class="field"><label>Forma</label><select name="method">${['', ...METHODS].map(m => `<option ${m === x.method ? 'selected' : ''} value="${m}">${m || '—'}</option>`).join('')}</select></div>
        </div>
        ${x.booking_id ? '<p class="hint">Lançado automaticamente ao concluir um atendimento.</p>' : ''}
        <button class="btn btn-primary btn-block" type="submit">Salvar</button>
        ${id ? `<button type="button" class="danger-link" id="finDel">Excluir lançamento</button>` : ''}
      </form>`);
    $('#finForm').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target, row = { kind: x.kind, description: f.description.value.trim(), amount: money(f.amount.value), date: f.date.value, category: f.category.value.trim() || 'Outros', method: f.method.value };
      if (!row.amount) return toast('Informe o valor.', true);
      try {
        if (id) chk(await sb.from('dn_finance').update(row).eq('id', id));
        else chk(await sb.from('dn_finance').insert({ ...row, studio_id: S.studio.id }));
        toast('Lançamento salvo!'); closeModal(); S.finMonth = row.date.slice(0, 7); loadFinance();
      } catch (err) { toast(err.message, true); }
    });
    $('#finDel')?.addEventListener('click', async ev => { if (!confirmTap(ev.target)) return; chk(await sb.from('dn_finance').delete().eq('id', id)); toast('Excluído.'); closeModal(); loadFinance(); });
  }
  $('#finPrev').addEventListener('click', () => { S.finMonth = shiftMonth(S.finMonth, -1); loadFinance(); });
  $('#finNext').addEventListener('click', () => { S.finMonth = shiftMonth(S.finMonth, 1); loadFinance(); });
  $('#finFilter').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; S.finFilter = b.dataset.f; $$('#finFilter button').forEach(x => x.classList.toggle('on', x === b)); renderFinList(); });
  document.addEventListener('click', e => {
    const n = e.target.closest('[data-fin-new]'); if (n) return editFinance(n.dataset.finNew);
    const r = e.target.closest('[data-fin]'); if (r) return editFinance(null, r.dataset.fin);
  });
  $('#finPrint').addEventListener('click', () => window.print());
  $('#finCsv').addEventListener('click', () => csv([['Data', 'Tipo', 'Categoria', 'Descrição', 'Forma', 'Valor (R$)'],
    ...S.finance.map(x => [x.date, x.kind === 'entrada' ? 'Entrada' : 'Saída', x.category, x.description, x.method, (x.kind === 'saida' ? '-' : '') + moneyIn(x.amount)])],
    `financeiro-${S.finMonth}.csv`));

  // ---------------- Serviços ----------------
  async function upload(file, prefix) {
    if (!file) return null;
    if (file.size > 4 * 1024 * 1024) throw new Error('Imagem muito grande (máx. 4 MB).');
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error('Use JPG, PNG ou WEBP.');
    const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
    const path = `${S.studio.id}/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    chk(await sb.storage.from('dn-media').upload(path, file, { contentType: file.type, cacheControl: '31536000' }));
    return sb.storage.from('dn-media').getPublicUrl(path).data.publicUrl;
  }
  const loadServices = async () => { S.services = chk(await sb.from('dn_services').select('*').eq('studio_id', S.studio.id).order('sort').order('id')); };
  function renderServices() {
    $('#serviceList').innerHTML = S.services.length ? S.services.map(s => `
      <button class="svc-card ${s.active ? '' : 'inactive'}" data-edit-svc="${s.id}">
        <span class="ph">${s.photo ? `<img src="${esc(s.photo)}" alt="" loading="lazy">` : '<span class="drop"></span>'}</span>
        <span class="bd"><b>${esc(s.name)}</b><span>${brl(s.price)} · ${dur(+s.duration)}${s.category ? ` · ${esc(s.category)}` : ''}${s.active ? '' : ' · oculto'}</span></span>
      </button>`).join('') : `<div class="empty"><strong>Sem serviços</strong>Cadastre o primeiro.</div>`;
  }
  function editService(id) {
    const s = S.services.find(x => +x.id === +id) || { name: '', description: '', category: '', price: 0, duration: 60, photo: '', active: true, sort: S.services.length };
    const cats = [...new Set(S.services.map(x => x.category).filter(Boolean))];
    openModal(s.id ? 'Editar serviço' : 'Novo serviço', `
      <form id="svcForm">
        <div class="photo-pick">
          <span class="thumb" id="svcThumb">${s.photo ? `<img src="${esc(s.photo)}" alt="">` : '<span class="drop"></span>'}</span>
          <div class="btn-row"><label class="btn btn-ghost btn-sm">Foto do serviço<input type="file" accept="image/jpeg,image/png,image/webp" id="svcFile" hidden></label>
          ${s.photo ? '<button type="button" class="btn btn-ghost btn-sm" id="svcNoPhoto">Remover</button>' : ''}</div>
        </div>
        <input type="hidden" name="photo" value="${esc(s.photo)}">
        <div class="field"><label>Nome</label><input name="name" required value="${esc(s.name)}"></div>
        <div class="field"><label>Descrição</label><textarea name="description" rows="2">${esc(s.description)}</textarea></div>
        <div class="form-grid">
          <div class="field"><label>Preço (R$)</label><input name="price" inputmode="decimal" value="${moneyIn(s.price)}"></div>
          <div class="field"><label>Duração (min)</label><input name="duration" type="number" min="5" step="5" value="${s.duration}"></div>
          <div class="field"><label>Categoria</label><input name="category" list="catList" value="${esc(s.category)}"><datalist id="catList">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
          <div class="field"><label>Ordem</label><input name="sort" type="number" value="${s.sort}"></div>
        </div>
        <label class="chk" style="margin-bottom:16px"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}><span>Aparece na página de agendamento</span></label>
        <button class="btn btn-primary btn-block" type="submit">Salvar</button>
        ${s.id ? `<button type="button" class="danger-link" data-del-svc="${s.id}">Excluir serviço</button>` : ''}
      </form>`);
    const f = $('#svcForm');
    $('#svcFile').addEventListener('change', async e => {
      try { toast('Enviando foto…'); const url = await upload(e.target.files[0], 'servico'); f.photo.value = url; $('#svcThumb').innerHTML = `<img src="${esc(url)}" alt="">`; toast('Foto enviada!'); }
      catch (err) { toast(err.message, true); }
    });
    $('#svcNoPhoto')?.addEventListener('click', () => { f.photo.value = ''; $('#svcThumb').innerHTML = '<span class="drop"></span>'; });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const row = { name: f.name.value.trim(), description: f.description.value.trim(), category: f.category.value.trim(), price: money(f.price.value),
        duration: Math.max(5, +f.duration.value || 60), sort: +f.sort.value || 0, active: f.active.checked, photo: f.photo.value };
      if (!row.name) return toast('Dê um nome ao serviço.', true);
      try {
        if (s.id) chk(await sb.from('dn_services').update(row).eq('id', s.id));
        else chk(await sb.from('dn_services').insert({ ...row, studio_id: S.studio.id }));
        await loadServices(); closeModal(); renderServices(); toast('Serviço salvo!');
      } catch (err) { toast(err.message, true); }
    });
  }
  $('#newService').addEventListener('click', () => editService(null));
  document.addEventListener('click', async e => {
    const ed = e.target.closest('[data-edit-svc]'); if (ed) return editService(ed.dataset.editSvc);
    const dl = e.target.closest('[data-del-svc]');
    if (dl && confirmTap(dl)) { try { chk(await sb.from('dn_services').delete().eq('id', +dl.dataset.delSvc)); await loadServices(); closeModal(); renderServices(); toast('Serviço excluído.'); } catch (err) { toast(err.message, true); } }
  });

  // ---------------- Folgas ----------------
  async function loadBlocks() {
    const blocks = chk(await sb.from('dn_blocks').select('*').eq('studio_id', S.studio.id).gte('date', S.today).order('date').order('start_at'));
    $('#blockList').innerHTML = blocks.length ? blocks.map(b => `
      <div class="row"><div class="row-main"><b>${longDate(b.date)}</b><span>${b.start_at ? `${b.start_at} às ${b.end_at}` : 'Dia inteiro'}${b.reason ? ` · ${esc(b.reason)}` : ''}</span></div>
      <div class="row-side"><button class="btn btn-ghost btn-sm" data-del-block="${b.id}">Remover</button></div></div>`).join('')
      : `<div class="empty"><strong>Nenhum bloqueio</strong>Use para folgas, cursos, feriados ou horários diferentes.</div>`;
  }
  $('#blockForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    if ((f.start.value || f.end.value) && (!f.start.value || !f.end.value || f.end.value <= f.start.value)) return toast('Intervalo inválido.', true);
    const rows = []; let d = f.date.value;
    do { rows.push({ studio_id: S.studio.id, date: d, start_at: f.start.value || '', end_at: f.end.value || '', reason: f.reason.value }); d = addDays(d, 1); }
    while (f.until.value && d <= f.until.value && rows.length < 60);
    try { chk(await sb.from('dn_blocks').insert(rows)); f.reset(); toast('Bloqueado!'); loadBlocks(); } catch (err) { toast(err.message, true); }
  });
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-del-block]');
    if (b) { chk(await sb.from('dn_blocks').delete().eq('id', +b.dataset.delBlock)); loadBlocks(); toast('Removido.'); }
  });

  // ---------------- Aparência ----------------
  const look = {};
  function fillLook() {
    const s = S.studio, f = $('#lookForm');
    Object.assign(look, { logo_url: s.logo_url, theme: s.theme, name_style: s.name_style });
    f.name.value = s.name; f.segment.value = s.segment; f.tagline.value = s.tagline; f.show_name.checked = s.show_name;
    $('#previewLink').href = publicUrlSafe();
    $('#themes').innerHTML = Object.entries(DN_THEMES).map(([k, t]) => `
      <button type="button" class="theme-opt" data-theme="${k}" aria-pressed="${k === look.theme}">
        <span class="sw"><i style="background:${t.bg}"></i><i style="background:${t.a300}"></i><i style="background:${t.a500}"></i><i style="background:${t.deep}"></i></span>${t.label}</button>`).join('');
    renderLook();
  }
  function renderLook() {
    const f = $('#lookForm'), t = DN_THEMES[look.theme] || DN_THEMES.rosa;
    $('#logoBox').innerHTML = look.logo_url ? `<img src="${esc(look.logo_url)}" alt="">` : 'Sem logo';
    $('#logoRemove').hidden = !look.logo_url;
    $$('#nameStyle button').forEach(b => b.classList.toggle('on', b.dataset.v === look.name_style));
    $$('.theme-opt').forEach(b => b.setAttribute('aria-pressed', b.dataset.theme === look.theme));
    const showName = f.show_name.checked || !look.logo_url;
    $('#preview').innerHTML = `
      <div class="pv-brand" style="background:${t.a300};color:${t.onSoft}">
        <div class="pv-top"><span class="pv-mark" style="background:${t.paper};color:${t.a500}">${look.logo_url ? `<img src="${esc(look.logo_url)}" alt="">` : '<svg viewBox="0 0 40 40"><path d="M20 4c5.5 7.4 11 13.2 11 20a11 11 0 0 1-22 0C9 17.2 14.5 11.4 20 4Z" fill="currentColor"/></svg>'}</span><span style="font-size:.7rem;font-weight:700">Meus agendamentos</span></div>
        ${look.logo_url ? `<img class="pv-logo" src="${esc(look.logo_url)}" alt="">` : ''}
        ${showName ? `<p class="pv-name ${look.name_style}">${esc(f.name.value || 'Seu studio')}</p>` : ''}
        <div class="pv-seg" style="color:${t.deep === t.onSoft ? t.ink : t.deep}">${esc(f.segment.value)}</div>
        <div class="pv-tag">${esc(f.tagline.value)}</div>
        <span class="pv-cta" style="background:${t.paper};color:${t.a500}">AGENDE AGORA</span>
      </div>
      <div class="pv-body" style="background:${t.bg};color:${t.ink}">
        <p class="pv-h" style="color:${t.deep}">O que vamos fazer <span style="color:${t.a500}">hoje?</span></p>
        ${S.services.slice(0, 2).map((s, i) => `<div class="pv-card" style="background:${t.paper}"><span class="pv-ph" style="background:${s.photo ? `url('${esc(s.photo)}') center/cover` : i ? t.a300 : t.b200}"></span><div><b style="color:${t.deep}">${esc(s.name)}</b><span style="color:${t.deep}">${brl(s.price)}</span></div></div>`).join('')}
        <div class="pv-days"><i style="background:${t.paper}"></i><i style="background:${t.a500}"></i><i style="background:${t.paper}"></i><i style="background:${t.paper}"></i></div>
      </div>`;
  }
  $('#lookForm').addEventListener('input', renderLook);
  $('#themes').addEventListener('click', e => { const b = e.target.closest('[data-theme]'); if (!b) return; look.theme = b.dataset.theme; renderLook(); });
  $('#nameStyle').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; look.name_style = b.dataset.v; renderLook(); });
  $('#logoFile').addEventListener('change', async e => {
    try { toast('Enviando logo…'); look.logo_url = await upload(e.target.files[0], 'logo'); renderLook(); toast('Logo enviada! Clique em Salvar.'); }
    catch (err) { toast(err.message, true); }
    e.target.value = '';
  });
  $('#logoRemove').addEventListener('click', () => { look.logo_url = ''; renderLook(); });
  $('#lookForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const upd = { name: f.name.value.trim(), segment: f.segment.value.trim(), tagline: f.tagline.value.trim(), show_name: f.show_name.checked,
      logo_url: look.logo_url, theme: look.theme, name_style: look.name_style };
    if (!upd.name) return toast('Informe o nome do studio.', true);
    try { await saveStudio(upd); applyStudioLook(); toast('Aparência salva!'); } catch (err) { toast(err.message, true); }
  });
  async function saveStudio(upd) {
    const row = chk(await sb.from('dn_studios').update(upd).eq('id', S.studio.id).select().single());
    S.studio = row;
  }
  function applyStudioLook() {
    const s = S.studio;
    dnApplyTheme(s.theme);
    try { localStorage.setItem('dn-panel-theme', s.theme); localStorage.setItem('dn-theme-' + s.slug, s.theme); } catch {}
    $('#navName').textContent = s.name;
    $('#navName').className = 'nav-word' + (s.name_style === 'sans' ? ' sans' : '');
    $('#navMark').innerHTML = s.logo_url ? `<img src="${esc(s.logo_url)}" alt="">` : '<svg viewBox="0 0 40 40"><path d="M20 4c5.5 7.4 11 13.2 11 20a11 11 0 0 1-22 0C9 17.2 14.5 11.4 20 4Z" fill="currentColor"/></svg>';
    document.title = `Painel · ${s.name}`;
  }

  // ---------------- WhatsApp ----------------
  let qrTimer = null;
  async function callWa(action) {
    const { data, error } = await sb.functions.invoke('whatsapp-connect', { body: { action } });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); msg = j.error || msg; } catch {}
      throw new Error(/Failed to send|not found|404/i.test(msg) ? 'O servidor de WhatsApp ainda não foi configurado. Veja o guia em LEIA-ME.' : msg);
    }
    return data;
  }
  function renderWaCard(extra = '') {
    const s = S.studio, on = s.wa_status === 'conectado', waiting = s.wa_status === 'aguardando';
    $('#waCard').innerHTML = `
      <div class="wa-head"><span class="wa-dot ${on ? 'on' : waiting ? 'wait' : ''}"></span>
        <div><b>${on ? 'WhatsApp conectado' : waiting ? 'Aguardando leitura do QR Code' : 'WhatsApp desconectado'}</b>
        <span>${on ? 'Confirmações e lembretes saem automaticamente pelo número do studio.' : 'Conecte o WhatsApp do studio para enviar confirmações e lembretes automáticos.'}</span></div></div>
      ${extra}
      <div class="btn-row">
        ${on ? `<button class="btn btn-ghost btn-sm" id="waTest">Enviar teste para mim</button><button class="btn btn-ghost btn-sm" id="waOff">Desconectar</button>`
             : `<button class="btn btn-wa btn-sm" id="waOn">Conectar WhatsApp</button>`}
        <button class="btn btn-ghost btn-sm" id="waCheck">Verificar status</button>
      </div>`;
  }
  async function loadWhatsApp() {
    const s = S.studio, f = $('#waForm');
    f.wa_send_confirm.checked = s.wa_send_confirm; f.wa_send_reminder.checked = s.wa_send_reminder; f.wa_reminder_minutes.value = s.wa_reminder_minutes;
    ['tpl_confirm', 'tpl_reminder', 'tpl_thanks', 'tpl_booking'].forEach(k => { f[k].value = s[k]; });
    renderWaCard(); loadMsgs();
  }
  async function loadMsgs() {
    const rows = chk(await sb.from('dn_messages').select('*').eq('studio_id', S.studio.id).order('created_at', { ascending: false }).limit(30));
    const K = { confirmacao: 'Confirmação', lembrete: 'Lembrete', manual: 'Manual', teste: 'Teste' };
    $('#msgList').innerHTML = rows.length ? rows.map(m => `<div class="msg-row"><span class="k">${K[m.kind]}</span>
      <span class="t">${maskPhone(m.to_phone)} · ${esc(m.body.split('\n')[0])}</span>
      <span class="s ${m.status}" title="${esc(m.last_error)}">${m.status === 'pendente' && new Date(m.send_after) > new Date() ? 'agendada ' + new Date(m.send_after).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : m.status}</span></div>`).join('')
      : '<p class="hint">Nenhuma mensagem ainda.</p>';
  }
  async function refreshWa(silent) {
    try {
      const r = await callWa('status');
      S.studio.wa_status = r.status;
      if (r.status === 'conectado') { clearInterval(qrTimer); qrTimer = null; renderWaCard(); if (!silent) toast('WhatsApp conectado! 🎉'); }
      else if (!qrTimer) renderWaCard();
    } catch (e) { if (!silent) toast(e.message, true); }
  }
  document.addEventListener('click', async e => {
    const id = e.target.id;
    if (id === 'waOn') {
      e.target.disabled = true;
      try {
        const r = await callWa('connect');
        if (r.status === 'conectado') { S.studio.wa_status = 'conectado'; renderWaCard(); return; }
        S.studio.wa_status = 'aguardando';
        renderWaCard(`<div class="qr-box">${r.qr ? `<img src="${r.qr.startsWith('data:') ? r.qr : 'data:image/png;base64,' + r.qr}" alt="QR Code">` : ''}
          <p>No celular do studio: WhatsApp › Configurações › Dispositivos conectados › Conectar dispositivo, e aponte para este código.</p>
          ${r.pairingCode ? `<p>Ou use o código: <b>${esc(r.pairingCode)}</b></p>` : ''}</div>`);
        clearInterval(qrTimer); qrTimer = setInterval(() => refreshWa(true), 4000);
        setTimeout(() => { if (qrTimer) { clearInterval(qrTimer); qrTimer = null; refreshWa(true); } }, 120000);
      } catch (err) { toast(err.message, true); e.target.disabled = false; }
    }
    if (id === 'waOff') { if (!confirmTap(e.target)) return; try { await callWa('logout'); S.studio.wa_status = 'desconectado'; renderWaCard(); toast('Desconectado.'); } catch (err) { toast(err.message, true); } }
    if (id === 'waCheck') refreshWa(false);
    if (id === 'waTest') {
      try {
        chk(await sb.from('dn_messages').insert({ studio_id: S.studio.id, kind: 'teste', to_phone: S.studio.whatsapp, body: `Teste do ${S.platform.saas_name || 'Date Nails'} ✅ Se você recebeu esta mensagem, os envios automáticos estão funcionando.` }));
        toast('Teste na fila. Chega em até 1 minuto.'); setTimeout(loadMsgs, 1500);
      } catch (err) { toast(err.message, true); }
    }
  });
  $('#msgRefresh').addEventListener('click', loadMsgs);
  $('#waForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    try {
      await saveStudio({ wa_send_confirm: f.wa_send_confirm.checked, wa_send_reminder: f.wa_send_reminder.checked, wa_reminder_minutes: +f.wa_reminder_minutes.value,
        tpl_confirm: f.tpl_confirm.value, tpl_reminder: f.tpl_reminder.value, tpl_thanks: f.tpl_thanks.value, tpl_booking: f.tpl_booking.value });
      toast('Salvo!');
    } catch (err) { toast(err.message, true); }
  });

  // ---------------- Ajustes ----------------
  function fillSettings() {
    const s = S.studio, f = $('#settingsForm');
    ['instagram', 'address', 'maps_url', 'policy', 'deposit_text'].forEach(k => { f[k].value = s[k] ?? ''; });
    f.whatsapp.value = maskPhone(s.whatsapp || '');
    f.step.value = s.step; f.min_advance_hours.value = s.min_advance_hours; f.max_days_ahead.value = s.max_days_ahead; f.cancel_min_hours.value = s.cancel_min_hours;
    f.auto_confirm.value = s.auto_confirm ? '1' : '0';
    f.break_start.value = s.break_time?.[0] || ''; f.break_end.value = s.break_time?.[1] || '';
    $('#publicLink').value = publicUrl(); $('#openLink').href = publicUrlSafe();
    $('#clientAreaLink').href = `${SITE}/minha-agenda/?s=${s.slug}`; $('#clientAreaLink').textContent = `${SITE.replace(/^https?:\/\//, '')}/minha-agenda/?s=${s.slug}`;
    $('#accountEmail').textContent = `Conta: ${S.user.email}`;
    $('#hoursEditor').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(i => {
      const h = s.hours[i];
      return `<div class="hour-row ${h ? '' : 'off'}" data-dow="${i}"><label class="day-l">${DOW[i]}</label>
        <label class="switch"><input type="checkbox" ${h ? 'checked' : ''} aria-label="Abre na ${DOW[i]}"><span></span></label>
        <input type="time" class="input" value="${h ? h[0] : '09:00'}" aria-label="Abre às"><input type="time" class="input" value="${h ? h[1] : '18:00'}" aria-label="Fecha às"></div>`;
    }).join('');
    $$('#hoursEditor .switch input').forEach(c => c.addEventListener('change', () => c.closest('.hour-row').classList.toggle('off', !c.checked)));
  }
  $('#settingsForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, hours = {};
    $$('#hoursEditor .hour-row').forEach(r => { const [a, b] = $$('input[type=time]', r).map(i => i.value); hours[r.dataset.dow] = $('.switch input', r).checked && a && b ? [a, b] : null; });
    try {
      await saveStudio({ hours, break_time: [f.break_start.value, f.break_end.value], whatsapp: normPhone(f.whatsapp.value), instagram: f.instagram.value.replace(/^@/, '').trim(),
        address: f.address.value.trim(), maps_url: f.maps_url.value.trim(), policy: f.policy.value, deposit_text: f.deposit_text.value,
        step: +f.step.value, min_advance_hours: +f.min_advance_hours.value, max_days_ahead: +f.max_days_ahead.value, cancel_min_hours: +f.cancel_min_hours.value, auto_confirm: f.auto_confirm.value === '1' });
      toast('Ajustes salvos!');
    } catch (err) { toast(err.message, true); }
  });
  $('#copyLink').addEventListener('click', async () => { try { await navigator.clipboard.writeText(publicUrl()); toast('Link copiado!'); } catch { $('#publicLink').select(); } });
  $('#pwForm').addEventListener('submit', async e => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: $('#newPw').value });
    toast(error ? error.message : 'Senha alterada!', !!error); if (!error) $('#newPw').value = '';
  });

  // ---------------- Assinatura ----------------
  let payTimer = null;
  async function loadPlan() {
    const me = await rpc('dn_my_studio');
    S.sub = me.subscription; S.active = me.active; S.platform = me.platform;
    const sub = S.sub, p = S.platform;
    const until = sub.status === 'trial' ? sub.trial_ends_at : sub.paid_until;
    const label = !S.active ? (sub.status === 'trial' ? 'Teste grátis encerrado' : 'Assinatura vencida')
      : sub.status === 'trial' ? `Teste grátis até ${new Date(until).toLocaleDateString('pt-BR')}` : `Ativa até ${new Date(until).toLocaleDateString('pt-BR')}`;
    $('#planCard').innerHTML = `
      <div class="plan-status"><span class="wa-dot ${S.active ? 'on' : ''}"></span><div><b>${label}</b><span class="hint">${esc(p.plan_name)}</span></div></div>
      <div class="plan-price">${brl(p.plan_price)} <small>/ mês</small></div>
      <ul class="plan-feats"><li>Agendamentos ilimitados</li><li>Página com sua logo e suas cores</li><li>Confirmação e lembrete automáticos no WhatsApp</li><li>Controle financeiro e relatórios</li><li>Área da cliente</li></ul>
      <div class="btn-row"><button class="btn btn-primary" id="payBtn">${S.active && sub.status === 'ativa' ? 'Renovar' : 'Assinar'} com PicPay · ${brl(p.plan_price)}</button></div>
      <p class="hint">Pague com Pix, cartão ou saldo PicPay. Cada pagamento libera 30 dias, somados ao período atual.${p.support_whatsapp ? ` Dúvidas? <a href="${wa(p.support_whatsapp)}" target="_blank" rel="noopener">Fale com o suporte</a>.` : ''}</p>
      <div id="payBox"></div>`;
    const pays = chk(await sb.from('dn_payments').select('*').eq('studio_id', S.studio.id).order('created_at', { ascending: false }).limit(12));
    $('#payList').innerHTML = pays.length ? pays.map(x => `<div class="fin-row"><span class="d">${shortDate(x.created_at)}</span><div><b>${brl(x.amount)} · ${x.days} dias</b><span class="c">PicPay · ${x.status}</span></div>
      ${x.status === 'pendente' && x.payment_url ? `<a class="btn btn-ghost btn-sm" href="${esc(x.payment_url)}" target="_blank" rel="noopener">Pagar</a>` : `<span class="v ${x.status === 'pago' ? 'in' : ''}">${x.status === 'pago' ? 'Pago ✓' : x.status}</span>`}</div>`).join('')
      : '<p class="hint">Nenhum pagamento ainda.</p>';
    renderSubBanner();
  }
  document.addEventListener('click', e => {
    if (e.target.id !== 'payBtn') return;
    let saved = {}; try { saved = JSON.parse(localStorage.getItem('dn-buyer') || '{}'); } catch {}
    openModal('Pagamento com PicPay', `
      <form id="buyerForm">
        <p class="hint" style="margin-top:0">O PicPay pede o nome e o CPF (ou CNPJ) de quem paga. Usamos só para gerar a cobrança.</p>
        <div class="field"><label>Nome completo</label><input name="buyer_name" required value="${esc(saved.name || '')}" autocomplete="name"></div>
        <div class="field"><label>CPF ou CNPJ</label><input name="document" required inputmode="numeric" value="${esc(saved.doc || '')}"></div>
        <button class="btn btn-primary btn-block" type="submit" id="buyerGo">Gerar pagamento de ${brl(S.platform.plan_price)}</button>
      </form>`);
    $('#buyerForm').addEventListener('submit', async ev => {
      ev.preventDefault();
      const f = ev.target, btn = $('#buyerGo'); btn.disabled = true;
      try { localStorage.setItem('dn-buyer', JSON.stringify({ name: f.buyer_name.value, doc: f.document.value })); } catch {}
      try {
        const { data, error } = await sb.functions.invoke('billing', { body: { action: 'create', buyer_name: f.buyer_name.value, document: f.document.value, return_url: location.href.split('#')[0] + '#assinatura' } });
        if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch {} throw new Error(/Failed to send|404/i.test(m) ? 'Pagamento ainda não configurado. Fale com o suporte.' : m); }
        closeModal();
        $('#payBox').innerHTML = `<div class="pending-banner"><span>Abrimos o PicPay em outra aba. Assim que o pagamento for confirmado, sua assinatura é liberada aqui automaticamente.</span>
          <a class="btn btn-sm btn-primary" href="${esc(data.payment_url)}" target="_blank" rel="noopener">Abrir pagamento</a></div>`;
        window.open(data.payment_url, '_blank', 'noopener');
        clearInterval(payTimer);
        let n = 0;
        payTimer = setInterval(async () => {
          if (++n > 60) return clearInterval(payTimer);
          const { data: st } = await sb.functions.invoke('billing', { body: { action: 'check', reference_id: data.reference_id } });
          if (st?.status === 'pago') { clearInterval(payTimer); toast('Pagamento confirmado! Obrigada 💖'); S.active = true; loadPlan(); }
        }, 8000);
      } catch (err) { toast(err.message, true); btn.disabled = false; }
    });
  });

  // ---------------- Início ----------------
  async function boot(goTo) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return showAuth(new URLSearchParams(location.search).has('cadastro') ? 'signup' : 'login');
    S.user = session.user;
    const me = await rpc('dn_my_studio').catch(e => { toast(e.message, true); return null; });
    if (!me) {
      screen('onboard');
      sb.from('dn_platform').select('trial_days').single().then(({ data }) => { if (data) $('#onboardForm .auth-sub').textContent = `Vamos criar a agenda do seu studio. Você tem ${data.trial_days} dias grátis.`; });
      return;
    }
    S.studio = me.studio; S.sub = me.subscription; S.active = me.active; S.platform = me.platform; S.isSuper = me.is_superadmin;
    $('#saasLink').hidden = !S.isSuper;
    $('#publicLinkNav').href = publicUrlSafe();
    applyStudioLook();
    await loadServices();
    screen('app');
    renderSubBanner();
    const h = goTo || location.hash.slice(1);
    if (['clientes', 'financeiro', 'servicos', 'folgas', 'aparencia', 'whatsapp', 'ajustes', 'assinatura'].includes(h)) view(h); else view('agenda');
    if (S.studio.wa_status !== 'desconectado') refreshWa(true);
  }
  sb.from('dn_platform').select('trial_days').single().then(({ data }) => { if (data) $('#trialHint').textContent = `${data.trial_days} dias grátis, sem cartão.`; });
  boot();
})();
