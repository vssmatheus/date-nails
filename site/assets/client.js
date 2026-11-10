/* Date Nails — área da cliente */
(() => {
  const { $, esc, brl, longDate, toast, rpc, maskPhone, wa, STATUS } = DN;
  const qs = new URLSearchParams(location.search);
  const SLUG = (qs.get('s') || '').toLowerCase();
  let token = qs.get('t');
  let studio = null;
  let creds = null;

  const ics = b => {
    const f = (d, t) => d.replace(/-/g, '') + 'T' + t.replace(':', '') + '00';
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DateNails//PT-BR', 'BEGIN:VEVENT',
      `UID:${b.code}@datenails`, `DTSTART;TZID=America/Sao_Paulo:${f(b.date, b.start)}`, `DTEND;TZID=America/Sao_Paulo:${f(b.date, b.end)}`,
      `SUMMARY:${studio.name} — ${b.services.map(x => x.name).join(' + ')}`, `LOCATION:${(studio.address || '').replace(/,/g, '\\,')}`,
      'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Lembrete', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'));
  };

  function card(b, past) {
    return `<article class="bk st-${b.status} ${past ? 'past' : ''}">
      <div class="bk-top">
        <div><div class="bk-when">${longDate(b.date)}</div><div class="bk-time">${b.start} – ${b.end}</div></div>
        <span class="pill">${STATUS[b.status]}</span>
      </div>
      <div class="bk-svc">${b.services.map(x => esc(x.name)).join(' + ')} · <strong>${brl(b.total)}</strong> · código ${esc(b.code)}</div>
      ${past ? '' : `<div class="bk-actions">
        ${['pendente', 'confirmado'].includes(b.status) ? `<a class="btn btn-ghost btn-sm" href="${ics(b)}" download="agendamento.ics">Adicionar à agenda</a>` : ''}
        ${studio.whatsapp ? `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${wa(studio.whatsapp, `Oi! Sobre meu horário de ${longDate(b.date)} às ${b.start} (código ${b.code}).`)}">Falar com o studio</a>` : ''}
        ${b.can_cancel ? `<button class="btn btn-ghost btn-sm danger" data-cancel="${b.token}">Cancelar</button>` : ''}
      </div>`}
    </article>`;
  }

  function render(list) {
    const now = new Date();
    const isPast = b => new Date(`${b.date}T${b.end}:00`) < now || ['concluido', 'faltou', 'cancelado'].includes(b.status);
    const next = list.filter(b => !isPast(b)).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const past = list.filter(isPast);
    if (!list.length) {
      $('#results').innerHTML = `<div class="empty"><strong>Nenhum agendamento encontrado</strong>Confira se o nome e o WhatsApp são os mesmos usados ao agendar.</div>`;
      return;
    }
    const hi = list[0].client_name.split(' ')[0];
    $('#results').innerHTML = `
      <p class="c-section">Olá, ${esc(hi)}! ${next.length ? 'Seus próximos horários' : 'Nenhum horário marcado'}</p>
      ${next.map(b => card(b)).join('') || `<div class="empty"><strong>Que tal agendar?</strong><a class="btn btn-primary" href="${studioUrl()}" style="margin-top:10px">Novo agendamento</a></div>`}
      ${past.length ? `<p class="c-section">Histórico</p>${past.slice(0, 20).map(b => card(b, true)).join('')}` : ''}
      <div class="c-switch"><button type="button" id="other">Ver de outro número</button></div>`;
  }

  const studioUrl = () => `../agendar/?s=${encodeURIComponent(SLUG)}`;

  async function load() {
    $('#results').innerHTML = '<div class="empty"><div class="spinner" style="margin:auto"></div></div>';
    try {
      const r = await rpc('dn_client_bookings', token ? { p_slug: SLUG, p_token: token } : { p_slug: SLUG, p_name: creds.name, p_phone: creds.phone });
      if (r.error) { $('#results').innerHTML = `<div class="empty"><strong>Ops</strong>${esc(r.error)}</div>`; $('#lookup').hidden = false; return; }
      $('#lookup').hidden = true;
      render(r.bookings || []);
    } catch (e) { $('#results').innerHTML = ''; toast(e.message, true); $('#lookup').hidden = false; }
  }

  $('#cPhone').addEventListener('input', e => { e.target.value = maskPhone(e.target.value); });
  $('#lookup').addEventListener('submit', e => {
    e.preventDefault();
    creds = { name: $('#cName').value.trim(), phone: $('#cPhone').value.replace(/\D/g, '') };
    if (creds.name.length < 2 || creds.phone.length < 10) return toast('Informe seu nome e WhatsApp com DDD.', true);
    try { localStorage.setItem('dn_cliente', JSON.stringify(creds)); } catch {}
    token = null; load();
  });
  document.addEventListener('click', async e => {
    if (e.target.id === 'other') { token = null; history.replaceState(null, '', `?s=${SLUG}`); $('#results').innerHTML = ''; $('#lookup').hidden = false; return; }
    const c = e.target.closest('[data-cancel]');
    if (c) {
      if (!c.dataset.armed) { c.dataset.armed = 1; c.textContent = 'Toque de novo para cancelar'; setTimeout(() => { delete c.dataset.armed; c.textContent = 'Cancelar'; }, 3500); return; }
      try { await rpc('dn_client_cancel', { p_token: c.dataset.cancel }); toast('Agendamento cancelado.'); load(); } catch (err) { toast(err.message, true); }
    }
  });

  (async () => {
    if (!SLUG) { $('#results').innerHTML = `<div class="empty"><strong>Link incompleto</strong>Abra pelo link que o studio te enviou.</div>`; return; }
    try {
      const d = await rpc('dn_public_studio', { p_slug: SLUG });
      if (d.error) { $('#results').innerHTML = `<div class="empty"><strong>Studio não encontrado</strong></div>`; return; }
      studio = d.studio;
      dnApplyTheme(studio.theme);
      document.title = `Meus agendamentos · ${studio.name}`;
      $('#studioName').textContent = studio.name;
      $('#studioName').className = 'c-name ' + (studio.name_style === 'sans' ? 'sans' : '');
      if (studio.logo_url) $('#mark').innerHTML = `<img src="${esc(studio.logo_url)}" alt="">`;
      $('#brandLink').href = studioUrl(); $('#newBtn').href = studioUrl();
      if (token) return load();
      try {
        const saved = JSON.parse(localStorage.getItem('dn_cliente') || 'null');
        if (saved) { $('#cName').value = saved.name || ''; $('#cPhone').value = maskPhone(saved.phone || ''); }
      } catch {}
      $('#lookup').hidden = false;
    } catch (e) { toast(e.message, true); }
  })();
})();
