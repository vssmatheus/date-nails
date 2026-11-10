/* Date Nails — página pública de agendamento (por studio) */
(() => {
  const { $, $$, esc, brl, dur, parse, longDate, DOW, DOW_S, toast, rpc, maskPhone, wa, fillTpl } = DN;

  // slug: /meu-studio  ou  /agendar/?s=meu-studio
  const qs = new URLSearchParams(location.search);
  const pathSlug = location.pathname.split('/').filter(Boolean).pop() || '';
  const SLUG = (qs.get('s') || (/^(agendar|index\.html)$/.test(pathSlug) ? '' : pathSlug)).toLowerCase();

  const state = { studio: null, services: [], cart: new Set(), cat: 'Todos', date: null, time: null, booking: null };
  const mineUrl = (token) => `minha-agenda/?s=${encodeURIComponent(SLUG)}${token ? `&t=${token}` : ''}`;

  function unavailable(title, text, phone) {
    $('#layout').hidden = true; $('#cartbar').hidden = true;
    $('#unavailable').hidden = false;
    $('#unTitle').textContent = title; $('#unText').textContent = text;
    if (phone) { $('#unWa').href = wa(phone); $('#unWa').hidden = false; }
  }

  // ---------------- Marca ----------------
  function renderBrand() {
    const s = state.studio;
    dnApplyTheme(s.theme);
    try { localStorage.setItem('dn-theme-' + SLUG, s.theme); } catch {}
    document.title = `Agendar · ${s.name}`;
    $('#mineLink').href = mineUrl();
    const name = $('#studioName');
    name.textContent = s.name;
    name.className = 'studio-name ' + (s.name_style === 'sans' ? 'sans' : 'script');
    name.hidden = !s.show_name && !!s.logo_url;
    if (s.logo_url) {
      $('#brandLogo').src = s.logo_url; $('#brandLogo').alt = s.name; $('#brandLogo').hidden = false;
      $('#mark').hidden = true;
    }
    $('#segment').textContent = s.segment || '';
    $('#tagline').textContent = s.tagline || '';
    if (s.instagram) {
      const h = s.instagram.replace(/^@/, '');
      $('#igLink').href = `https://instagram.com/${encodeURIComponent(h)}`;
      $('#igHandle').textContent = '@' + h; $('#igLink').hidden = false;
    }
    const mapUrl = s.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}`;
    const addr = s.address ? `<a href="${esc(mapUrl)}" target="_blank" rel="noopener">${esc(s.address)}</a>` : '—';
    const hours = [1, 2, 3, 4, 5, 6, 0].map(i => {
      const h = s.hours[i];
      return `<div class="hours-row"><span>${DOW[i]}</span><span>${h ? `${h[0]} – ${h[1]}` : 'Fechado'}</span></div>`;
    }).join('');
    $('#address').innerHTML = addr; $('#addressM').innerHTML = addr;
    $('#hoursList').innerHTML = hours; $('#hoursListM').innerHTML = hours;
    $('#policy').textContent = s.policy || ''; $('#policyM').textContent = s.policy || '';
    $$('.policy').forEach(p => { p.hidden = !s.policy; });
    if (s.deposit_text) { $('#deposit').textContent = s.deposit_text; $('#deposit').hidden = false; }
    const pw = document.createElement('p'); pw.className = 'powered';
    pw.innerHTML = `Agenda online por <a href="./" target="_blank" rel="noopener">${esc(DN.CFG.SAAS_NAME || 'Date Nails')}</a>`;
    $('.mobile-info').appendChild(pw);
  }

  // ---------------- Etapa 1: serviços ----------------
  function renderCats() {
    const cats = ['Todos', ...new Set(state.services.map(s => s.category).filter(Boolean))];
    $('#cats').hidden = cats.length <= 2;
    $('#cats').innerHTML = cats.map(c => `<button class="cat" role="tab" type="button" aria-selected="${c === state.cat}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  }
  function renderServices() {
    const list = state.services.filter(s => state.cat === 'Todos' || s.category === state.cat);
    if (!list.length) { $('#services').innerHTML = `<div class="empty"><strong>Nenhum serviço disponível</strong>Volte em breve.</div>`; return; }
    $('#services').innerHTML = list.map((s, i) => `
      <button type="button" class="svc" data-id="${s.id}" aria-pressed="${state.cart.has(+s.id)}">
        <span class="svc-photo">${s.photo ? `<img src="${esc(s.photo)}" alt="" loading="lazy">` : `<span class="drop" style="--c:${DN.SWATCH[i % DN.SWATCH.length]}"></span>`}</span>
        <span class="svc-body">
          <span class="svc-name">${esc(s.name)}</span>
          ${s.description ? `<span class="svc-desc">${esc(s.description)}</span>` : ''}
          <span class="svc-meta"><span class="price">${brl(s.price)}</span><span class="dur">· ${dur(+s.duration)}</span></span>
        </span>
        <span class="svc-check" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      </button>`).join('');
  }
  const selected = () => state.services.filter(s => state.cart.has(+s.id));
  const totals = () => selected().reduce((a, s) => ({ price: a.price + +s.price, duration: a.duration + +s.duration }), { price: 0, duration: 0 });

  function renderCart() {
    const n = state.cart.size, t = totals();
    $('#cartCount').textContent = n === 1 ? '1 serviço' : `${n} serviços`;
    $('#cartMeta').textContent = n ? `${brl(t.price)} · ${dur(t.duration)}` : '';
    $('#toStep2').disabled = !n;
    $('#cartbar').classList.toggle('show', n > 0 && currentStep === 1);
  }

  // ---------------- Navegação ----------------
  let currentStep = 1;
  function go(step) {
    currentStep = step;
    $$('.panel').forEach(p => p.classList.toggle('active', +p.dataset.panel === step));
    $$('.steps li').forEach(li => { const n = +li.dataset.step; li.classList.toggle('active', n === step); li.classList.toggle('done', n < step); });
    $('.steps').hidden = step === 4;
    renderCart();
    const top = $('#agendar').getBoundingClientRect().top + window.scrollY - 10;
    if (window.scrollY > top || step > 1) window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    if (step === 2) loadDays();
    if (step === 3) { renderSummary(); setTimeout(() => $('#name').focus({ preventScroll: true }), 300); }
  }

  // ---------------- Etapa 2: dia e hora ----------------
  async function loadDays() {
    const t = totals();
    $('#durationInfo').textContent = `Seu atendimento leva cerca de ${dur(t.duration)}.`;
    $('#days').innerHTML = '<div class="loading" style="padding:20px"><div class="spinner"></div></div>';
    $('#slots').innerHTML = '';
    try {
      const days = await rpc('dn_availability', { p_slug: SLUG, p_duration: t.duration }) || {};
      const keys = Object.keys(days);
      $('#days').innerHTML = keys.map(d => {
        const dt = parse(d);
        return `<button type="button" class="day" data-date="${d}" ${days[d] ? '' : 'disabled'} aria-pressed="${d === state.date}"
          aria-label="${longDate(d)}${days[d] ? '' : ' — sem horários'}"><span class="dw">${DOW_S[dt.getDay()]}</span><span class="dn">${dt.getDate()}</span><span class="dot"></span></button>`;
      }).join('');
      if (!state.date || !days[state.date]) state.date = keys.find(d => days[d]) || null;
      if (state.date) selectDay(state.date);
      else $('#slots').innerHTML = `<div class="empty"><strong>Agenda cheia por aqui</strong>Chame no WhatsApp que a gente tenta um encaixe.</div>`;
    } catch (e) { toast(e.message, true); }
  }
  async function selectDay(d) {
    state.date = d;
    $$('.day').forEach(b => b.setAttribute('aria-pressed', b.dataset.date === d));
    $(`.day[data-date="${d}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    $('#monthLabel').textContent = DN.cap(parse(d).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(' de ', ' '));
    $('#slots').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
      const slots = await rpc('dn_slots', { p_slug: SLUG, p_date: d, p_duration: totals().duration }) || [];
      if (state.date !== d) return;
      if (!slots.length) { $('#slots').innerHTML = `<div class="empty"><strong>Sem horários neste dia</strong>Tente outra data.</div>`; return; }
      const groups = { Manhã: [], Tarde: [], Noite: [] };
      slots.forEach(s => { const h = +s.slice(0, 2); groups[h < 12 ? 'Manhã' : h < 18 ? 'Tarde' : 'Noite'].push(s); });
      $('#slots').innerHTML = Object.entries(groups).filter(([, v]) => v.length).map(([k, v]) => `
        <div class="slot-group"><h3>${k}</h3><div class="slot-grid">${v.map(s => `<button type="button" class="slot" data-time="${s}">${s}</button>`).join('')}</div></div>`).join('');
    } catch (e) { toast(e.message, true); }
  }

  // ---------------- Etapa 3: dados ----------------
  function renderSummary() {
    const t = totals();
    $('#summary').innerHTML = `
      <div class="sum-when"><span class="d">${longDate(state.date)}</span><span class="t">${state.time}</span></div>
      ${selected().map(s => `<div class="sum-line"><span>${esc(s.name)}</span><span>${brl(s.price)}</span></div>`).join('')}
      <div class="sum-total"><span>Total · ${dur(t.duration)}</span><span>${brl(t.price)}</span></div>`;
  }

  function ics(b) {
    const s = state.studio;
    const f = (d, t) => d.replace(/-/g, '') + 'T' + t.replace(':', '') + '00';
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DateNails//PT-BR', 'BEGIN:VEVENT',
      `UID:${b.code}-${b.id}@datenails`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART;TZID=America/Sao_Paulo:${f(b.date, b.start_at)}`, `DTEND;TZID=America/Sao_Paulo:${f(b.date, b.end_at)}`,
      `SUMMARY:${s.name} — ${b.services.map(x => x.name).join(' + ')}`, `LOCATION:${(s.address || '').replace(/,/g, '\\,')}`,
      'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Lembrete', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(lines.join('\r\n'));
  }

  function renderDone(b) {
    const s = state.studio;
    $('#doneText').innerHTML = s.wa_auto
      ? `Você vai receber a confirmação no seu WhatsApp em instantes, com o link para acompanhar o agendamento.`
      : (b.status === 'confirmado' ? 'Tudo certo! Te esperamos no horário marcado.' : 'Envie a mensagem abaixo pelo WhatsApp para o studio confirmar seu horário.');
    $('#ticket').innerHTML = `
      <div class="code">Código ${esc(b.code)}</div>
      <div class="when">${longDate(b.date)} · ${b.start_at}</div>
      <div class="svcs">${b.services.map(x => esc(x.name)).join(' + ')} — <strong>${brl(b.total)}</strong></div>`;
    $('#mineBtn').href = mineUrl(b.access_token);
    $('#waBtn').href = wa(s.whatsapp, fillTpl(s.tpl_booking, { ...b, start: b.start_at }, s));
    $('#waBtn').hidden = !s.whatsapp;
    $('#waBtnText').textContent = s.wa_auto ? 'Falar com o studio' : 'Enviar confirmação no WhatsApp';
    $('#waBtn').className = 'btn btn-block ' + (s.wa_auto ? 'btn-ghost' : 'btn-wa');
    $('#icsBtn').href = ics(b);
  }

  // ---------------- Eventos ----------------
  document.addEventListener('click', e => {
    const svc = e.target.closest('.svc');
    if (svc) {
      const id = +svc.dataset.id;
      state.cart.has(id) ? state.cart.delete(id) : state.cart.add(id);
      svc.setAttribute('aria-pressed', state.cart.has(id)); state.time = null; renderCart(); return;
    }
    const cat = e.target.closest('.cat'); if (cat) { state.cat = cat.dataset.cat; renderCats(); renderServices(); return; }
    const day = e.target.closest('.day'); if (day && !day.disabled) { selectDay(day.dataset.date); return; }
    const slot = e.target.closest('.slot'); if (slot) { state.time = slot.dataset.time; go(3); return; }
    const back = e.target.closest('[data-go]'); if (back) { go(+back.dataset.go); return; }
  });
  $('#toStep2').addEventListener('click', () => go(2));
  $('#againBtn').addEventListener('click', () => { state.cart.clear(); state.time = null; state.date = null; renderServices(); go(1); });
  $('#phone').addEventListener('input', e => { e.target.value = maskPhone(e.target.value); });
  try {
    const saved = JSON.parse(localStorage.getItem('dn_cliente') || 'null');
    if (saved) { $('#name').value = saved.name || ''; $('#phone').value = maskPhone(saved.phone || ''); }
  } catch {}

  $('#form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#name').value.trim(), phone = $('#phone').value.replace(/\D/g, '');
    if (name.length < 2) { toast('Informe seu nome.', true); $('#name').focus(); return; }
    if (phone.length < 10) { toast('Informe seu WhatsApp com DDD.', true); $('#phone').focus(); return; }
    if (e.target.website.value) return;
    const btn = $('#submitBtn'); btn.disabled = true; btn.textContent = 'Reservando…';
    try {
      const b = await rpc('dn_book', { p_slug: SLUG, p_services: [...state.cart], p_date: state.date, p_start: state.time, p_name: name, p_phone: phone, p_notes: $('#notes').value.trim() });
      try { localStorage.setItem('dn_cliente', JSON.stringify({ name, phone })); } catch {}
      state.booking = b; renderDone(b); go(4);
    } catch (err) {
      toast(err.message, true);
      if (err.status === 409) { state.time = null; go(2); }
    } finally { btn.disabled = false; btn.textContent = 'Confirmar agendamento'; }
  });

  // ---------------- Início ----------------
  (async () => {
    if (!SLUG) { unavailable('Studio não informado', 'Abra o link de agendamento que o studio te enviou.'); return; }
    try {
      const data = await rpc('dn_public_studio', { p_slug: SLUG });
      if (data.error) { unavailable('Studio não encontrado', 'Confira o link de agendamento com o studio.'); return; }
      state.studio = data.studio; state.services = data.services;
      dnApplyTheme(data.studio.theme);
      if (!data.active) { unavailable(data.studio.name, 'A agenda online está temporariamente indisponível. Fale direto com o studio.', data.studio.whatsapp); return; }
      renderBrand(); renderCats(); renderServices(); renderCart();
      const pre = qs.get('servico');
      if (pre && state.services.some(s => +s.id === +pre)) { state.cart.add(+pre); renderServices(); renderCart(); }
    } catch (e) {
      $('#services').innerHTML = `<div class="empty"><strong>Não foi possível carregar</strong>${esc(e.message)}</div>`;
    }
  })();
})();
