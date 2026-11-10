/* Date Nails — temas de cor
   Todos seguem a mesma lógica da identidade original:
   fundo suave + tom médio (painel) + cor de destaque + tom profundo (títulos e botões). */
(function () {
  const T = {
    rosa:     { label: 'Rosa',            bg: '#fff1f1', paper: '#ffffff', b50: '#fff6f6', b100: '#ffe3e5', b200: '#ffc2c4', a300: '#ff97a3', a500: '#ff6375', deep: '#a93636', ink: '#3b2a2c', muted: '#727272', line: '#f6dcdc', onA: '#fff', onSoft: '#fff', onDeep: '#fff' },
    nude:     { label: 'Nude',            bg: '#faf3ee', paper: '#ffffff', b50: '#fcf8f5', b100: '#f3e3d9', b200: '#e8cdbd', a300: '#d4a68f', a500: '#c0806a', deep: '#6e4535', ink: '#3a2a24', muted: '#76706c', line: '#eedfd5', onA: '#fff', onSoft: '#fff', onDeep: '#fff' },
    pessego:  { label: 'Pêssego',         bg: '#fff4ee', paper: '#ffffff', b50: '#fff9f5', b100: '#ffe5d8', b200: '#ffcbb3', a300: '#ffb08c', a500: '#ff8a5c', deep: '#a3462a', ink: '#3d2a23', muted: '#77706c', line: '#f6e0d4', onA: '#fff', onSoft: '#fff', onDeep: '#fff' },
    laranja:  { label: 'Laranja',         bg: '#fff2ea', paper: '#ffffff', b50: '#fff7f2', b100: '#ffe2d1', b200: '#ffc6a6', a300: '#ffa877', a500: '#ff7a3d', deep: '#a8431a', ink: '#3d2a22', muted: '#77706c', line: '#f6dccd', onA: '#fff', onSoft: '#fff', onDeep: '#fff' },
    amarelo:  { label: 'Amarelo',         bg: '#fff8e6', paper: '#ffffff', b50: '#fffbf0', b100: '#fff0c2', b200: '#ffe08a', a300: '#ffd05c', a500: '#f2b200', deep: '#8a5a00', ink: '#3a2e12', muted: '#75705f', line: '#f3e6c0', onA: '#3a2e12', onSoft: '#5a3d00', onDeep: '#fff' },
    vermelho: { label: 'Vermelho',        bg: '#fff0ef', paper: '#ffffff', b50: '#fff6f5', b100: '#ffdcd9', b200: '#ffb9b3', a300: '#ff8c83', a500: '#e5413a', deep: '#8e1f1a', ink: '#3b2524', muted: '#74706f', line: '#f5d6d3', onA: '#fff', onSoft: '#fff', onDeep: '#fff' },
    verde:    { label: 'Verde',           bg: '#edf8f1', paper: '#ffffff', b50: '#f4fbf7', b100: '#d6f0e0', b200: '#b2e2c5', a300: '#7fcca0', a500: '#2ea86a', deep: '#1c6b45', ink: '#1f332a', muted: '#66726c', line: '#d3eadc', onA: '#fff', onSoft: '#123d28', onDeep: '#fff' },
    menta:    { label: 'Menta',           bg: '#ecfaf6', paper: '#ffffff', b50: '#f4fcfa', b100: '#d3f3ea', b200: '#a9e7d6', a300: '#6fd3bd', a500: '#1fb393', deep: '#126b58', ink: '#1c332d', muted: '#66726f', line: '#d0ece4', onA: '#fff', onSoft: '#0d4236', onDeep: '#fff' },
    turquesa: { label: 'Turquesa',        bg: '#ebf8fb', paper: '#ffffff', b50: '#f3fbfd', b100: '#d2eff6', b200: '#a7def0', a300: '#6cc9dd', a500: '#1aa3c2', deep: '#0d5f73', ink: '#1b3038', muted: '#647178', line: '#cfe8ef', onA: '#fff', onSoft: '#0a3e4b', onDeep: '#fff' },
    azul:     { label: 'Azul',            bg: '#eef4ff', paper: '#ffffff', b50: '#f5f9ff', b100: '#dde9ff', b200: '#bcd4ff', a300: '#8db6ff', a500: '#4c86f0', deep: '#1f4e96', ink: '#1f2a3d', muted: '#6b7280', line: '#dbe5f5', onA: '#fff', onSoft: '#fff', onDeep: '#fff' },
    roxo:     { label: 'Roxo',            bg: '#f4f0ff', paper: '#ffffff', b50: '#f9f7ff', b100: '#e6ddff', b200: '#cdbbff', a300: '#a98bff', a500: '#7c4dff', deep: '#4a2a9a', ink: '#2b2440', muted: '#6e6a7a', line: '#e2dcf5', onA: '#fff', onSoft: '#fff', onDeep: '#fff' },
    lilas:    { label: 'Lilás',           bg: '#f9f2fd', paper: '#ffffff', b50: '#fcf8fe', b100: '#f0dff9', b200: '#e2c2f2', a300: '#cd9be6', a500: '#a865cf', deep: '#6a3a8a', ink: '#33263b', muted: '#736a78', line: '#ecdcf3', onA: '#fff', onSoft: '#fff', onDeep: '#fff' },
    dourado:  { label: 'Dourado e preto', dark: true, bg: '#121110', paper: '#1c1a17', b50: '#22201c', b100: '#2b2720', b200: '#3a3326', a300: '#c9a24a', a500: '#dcb763', deep: '#f0d690', ink: '#f3ecdf', muted: '#a69d8c', line: '#332e26', onA: '#1a1408', onSoft: '#1a1408', onDeep: '#1a1408' },
    grafite:  { label: 'Cinza escuro',    dark: true, bg: '#1d1f23', paper: '#272a2f', b50: '#2c2f35', b100: '#33373e', b200: '#444952', a300: '#ff97a3', a500: '#ff7a8a', deep: '#ffc2c8', ink: '#eef0f3', muted: '#a3a8b0', line: '#383c43', onA: '#2a0f14', onSoft: '#2a0f14', onDeep: '#2a0f14' },
    noite:    { label: 'Modo noite',      dark: true, bg: '#15121a', paper: '#201b27', b50: '#241f2c', b100: '#2c2535', b200: '#3b3147', a300: '#b48cff', a500: '#c7a6ff', deep: '#e3d4ff', ink: '#f1edf7', muted: '#a49cb2', line: '#312a3b', onA: '#1b1326', onSoft: '#1b1326', onDeep: '#1b1326' }
  };

  function apply(key) {
    const t = T[key] || T.rosa;
    const r = document.documentElement.style;
    const set = (k, v) => r.setProperty(k, v);
    set('--cream', t.bg); set('--white', t.paper); set('--paper', t.paper);
    set('--blush-50', t.b50); set('--blush-100', t.b100); set('--blush-200', t.b200);
    set('--rose-300', t.a300); set('--rose-500', t.a500); set('--rose-600', t.a500); set('--rose-700', t.deep);
    set('--plum', t.deep); set('--ink', t.ink); set('--plum-70', t.muted); set('--line', t.line);
    set('--on-accent', t.onA); set('--on-soft', t.onSoft); set('--on-deep', t.onDeep);
    set('--shadow', t.dark ? '0 1px 2px rgba(0,0,0,.3), 0 10px 30px -14px rgba(0,0,0,.6)' : `0 1px 2px ${t.deep}0d, 0 10px 30px -14px ${t.a500}59`);
    document.documentElement.dataset.theme = key in T ? key : 'rosa';
    document.documentElement.classList.toggle('is-dark', !!t.dark);
    let m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
    m.content = t.a300;
  }
  window.DN_THEMES = T;
  window.dnApplyTheme = apply;
})();
