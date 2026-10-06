/* ============================================================================
   app.js — Plataforma Comercial Segura (v30.1 — Mobile-First · Laranja Energia)
   ============================================================================
   ARQUITETURA:
     • Estado global único em `estadoSessao`, `cestaCompras`, `catalogoProdutos`.
     • Todas as ações são expostas via `window.*` para o bindings.js chamar.
     • Chamadas HTTP centralizadas em `executarRequisicaoAPI()` com retry.
     • Timers com limpeza automática e pausa em visibilitychange.
     • Splash de momento para feedback premium (abertura, cadastro, pedido).

   SEÇÕES:
     01. Configuração & Constantes
     02. Utilitários Gerais
     03. Cache Local
     04. Estado Global
     05. Splash (inicial + momentos)
     06. Tema (claro / escuro / auto)
     07. HTTP / API
     08. Sessão / Tokens
     09. Navegação
     10. Modais & Confirmação
     11. Toasts / Loader
     12. Lightbox
     13. Autenticação (Login & Cadastro)
     14. Vitrine & Filtros
     15. Favoritos
     16. Carrinho
     17. Agendamento & Horário
     18. PIX
     19. Meus Pedidos
     20. Repetir Pedido
     21. WhatsApp / Comprovante
     22. ADM — Painel Central
     23. ADM — Gavetas (Membros / Bloqueados)
     24. ADM — Esteira
     25. ADM — Produtos
     26. ADM — Link Temporário
     27. ADM — Relatório PDF
     28. Central de Ajuda
     29. Avatar / Dropdown
     30. Logout
     31. Auto-Refresh
     32. Tratamento de Erros Global
     33. Exports Globais
   ============================================================================ */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
     01. CONFIGURAÇÃO & CONSTANTES
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: Constantes ───────────────────────────────────── */
  const URL_BACKEND = 'https://lojasegura-backend.vercel.app';
  const WHATSAPP_SUPORTE = '5574998048300';
  const SPLASH_MIN_MS = 800;
  const TIMEOUT_API = 25000;
  const TIMEOUT_LINK = 15000;
  const VERSAO_APP = 'v30.1';

  const CHAVES = {
    FINGERPRINT: 'loja_fingerprint',
    TEMA: 'loja_tema',
    SESSAO: 'loja_sessao',
    FAVORITOS: 'loja_favoritos_v1',
    CARRINHO: 'loja_carrinho_v1',
    BANNER_REPETIR: 'loja_banner_repetir_oculto',
    LINK_TOKEN: 'plataforma_link_token',
    REFRESH_TOKEN: 'plataforma_refresh_token',
  };

  const CACHE_KEYS = {
    PRODUTOS: (papel) => 'cache_produtos_' + papel,
  };

  const HORARIO_PADRAO = {
    abreHora: 8,
    abreMinuto: 0,
    fechaHora: 22,
    fechaMinuto: 0,
    diasFuncionamento: [0, 1, 2, 3, 4, 5, 6],
    timezone: 'America/Sao_Paulo',
    mensagemFora: 'Estamos fora do horário de atendimento.',
  };
  /* ─── FIM: Constantes ──────────────────────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     02. UTILITÁRIOS GERAIS
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: escaparHtml ──────────────────────────────────── */
  function escaparHtml(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
  /* ─── FIM: escaparHtml ─────────────────────────────────────── */

  /* ─── INÍCIO: fmtPreco ─────────────────────────────────────── */
  function fmtPreco(valor) {
    const n = typeof valor === 'number' ? valor : parseFloat(String(valor || 0).replace(',', '.'));
    return 'R$ ' + (isNaN(n) ? 0 : n).toFixed(2).replace('.', ',');
  }
  /* ─── FIM: fmtPreco ────────────────────────────────────────── */

  /* ─── INÍCIO: extrairApenasDigitos ─────────────────────────── */
  function extrairApenasDigitos(valor) {
    return String(valor || '').replace(/\D/g, '');
  }
  /* ─── FIM: extrairApenasDigitos ────────────────────────────── */

  /* ─── INÍCIO: gerarId ──────────────────────────────────────── */
  function gerarId() {
    return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  /* ─── FIM: gerarId ─────────────────────────────────────────── */

  /* ─── INÍCIO: gerarFingerprint ─────────────────────────────── */
  function gerarFingerprint() {
    try {
      const existente = localStorage.getItem(CHAVES.FINGERPRINT);
      if (existente) return existente;

      const dados = [
        navigator.userAgent || '',
        navigator.language || '',
        (screen.width || 0) + 'x' + (screen.height || 0),
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || 0,
      ].join('|');

      let hash = 0;
      for (let i = 0; i < dados.length; i++) {
        hash = ((hash << 5) - hash) + dados.charCodeAt(i);
        hash |= 0;
      }
      const fp = 'fp_' + Math.abs(hash).toString(36);
      localStorage.setItem(CHAVES.FINGERPRINT, fp);
      return fp;
    } catch (e) {
      return 'fp_' + Math.random().toString(36).slice(2, 12);
    }
  }
  const FINGERPRINT = gerarFingerprint();
  /* ─── FIM: gerarFingerprint ────────────────────────────────── */

  /* ─── INÍCIO: copiarTextoSeguro ────────────────────────────── */
  async function copiarTextoSeguro(texto) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(texto);
        return true;
      }
    } catch (e) { /* fallback */ }

    try {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      ta.setAttribute('readonly', '');
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, texto.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }
  /* ─── FIM: copiarTextoSeguro ───────────────────────────────── */

  /* ─── INÍCIO: formatarHora ─────────────────────────────────── */
  function formatarHora(isoString) {
    if (!isoString) return '--:--';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '--:--';
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '--:--';
    }
  }
  /* ─── FIM: formatarHora ────────────────────────────────────── */

  /* ─── INÍCIO: formatarDataBR ───────────────────────────────── */
  function formatarDataBR(isoString) {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) { return ''; }
  }
  /* ─── FIM: formatarDataBR ──────────────────────────────────── */

  /* ─── INÍCIO: debounce ─────────────────────────────────────── */
  function debounce(fn, ms) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }
  /* ─── FIM: debounce ────────────────────────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     03. CACHE LOCAL
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: CacheLoja ────────────────────────────────────── */
  const CacheLoja = {
    salvar(chave, dados) {
      try {
        localStorage.setItem(chave, JSON.stringify({ dados, hora: Date.now() }));
      } catch (e) {}
    },
    obter(chave) {
      try {
        const item = localStorage.getItem(chave);
        if (!item) return null;
        const parsed = JSON.parse(item);
        return parsed.dados != null ? parsed.dados : null;
      } catch (e) { return null; }
    },
    limpar(chave) {
      try { localStorage.removeItem(chave); } catch (e) {}
    },
  };
  /* ─── FIM: CacheLoja ───────────────────────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     04. ESTADO GLOBAL
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: Estado ───────────────────────────────────────── */
  const estadoSessao = {
    papel: 'visitante',
    token: null,
    refreshToken: null,
    nomeUsuario: 'Visitante',
    telefone: null,
    pedidosRecentes: [],
  };

  let cestaCompras = [];
  let catalogoProdutos = [];
  let catalogoFiltrado = [];
  let categoriaAtiva = 'todos';
  let termoBuscaVitrine = '';
  let favoritosUsuario = [];
  let fotoBase64Temporaria = '';
  let configHorario = { ...HORARIO_PADRAO };
  let duvidasRapidas = {};

  let _linkAutorizadoValido = false;
  let _segundosRestantesLink = 0;
  let _timerSilencioso = null;
  let _timerPainelAdm = null;
  let _timerEsteiraAdm = null;

  let splashInicio = Date.now();
  let splashInicialConcluido = false;

  let _callbackConfirmacao = null;
  /* ─── FIM: Estado ──────────────────────────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     05. SPLASH (INICIAL + MOMENTOS)
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: finalizarSplashInicial ───────────────────────── */
  function finalizarSplashInicial(estadoFinal = 'success', mensagem = null) {
    if (splashInicialConcluido) return;
    splashInicialConcluido = true;

    const splash = document.getElementById('splash-screen');
    if (!splash) return;

    const decorrido = Date.now() - splashInicio;
    const restante = Math.max(0, SPLASH_MIN_MS - decorrido);

    if (estadoFinal !== 'loading') {
      splash.setAttribute('data-state', estadoFinal);
      if (mensagem) {
        const hint = splash.querySelector('.splash-screen__hint');
        if (hint) hint.textContent = mensagem;
      }
    }

    setTimeout(() => {
      splash.classList.add('saindo');
      setTimeout(() => {
        if (splash.parentNode) splash.parentNode.removeChild(splash);
      }, 620);
    }, restante);
  }
  /* ─── FIM: finalizarSplashInicial ──────────────────────────── */

  /* ─── INÍCIO: mostrarMomento ───────────────────────────────── */
  function mostrarMomento(titulo, subtitulo, tipo = 'success', duracao = 2400) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'splash-screen';
      overlay.setAttribute('data-state', tipo);
      overlay.setAttribute('aria-hidden', 'false');

      const iconeSvg = tipo === 'error'
        ? '<path d="M18 6L6 18M6 6l12 12" stroke-width="2.4"/>'
        : tipo === 'info'
          ? '<circle cx="12" cy="12" r="10" stroke-width="2"/><line x1="12" y1="16" x2="12" y2="12" stroke-width="2.4" stroke-linecap="round"/><line x1="12" y1="8" x2="12.01" y2="8" stroke-width="2.4" stroke-linecap="round"/>'
          : '<polyline points="20 6 9 17 4 12" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';

      overlay.innerHTML = `
        <div class="splash-screen__glow"></div>
        <div class="splash-screen__content">
          <div class="splash-screen__logo" aria-hidden="true">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              ${iconeSvg}
            </svg>
          </div>
          <span class="splash-screen__title">${escaparHtml(titulo)}</span>
          ${subtitulo ? `<p class="splash-screen__hint">${escaparHtml(subtitulo)}</p>` : ''}
        </div>
      `;

      document.body.appendChild(overlay);
      document.body.classList.add('no-scroll');

      const fechar = () => {
        overlay.classList.add('saindo');
        document.body.classList.remove('no-scroll');
        setTimeout(() => {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          resolve();
        }, 620);
      };

      overlay.addEventListener('click', fechar);
      overlay.addEventListener('touchstart', fechar, { passive: true });
      setTimeout(fechar, duracao);
    });
  }
  /* ─── FIM: mostrarMomento ──────────────────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     06. TEMA
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: aplicarTema ──────────────────────────────────── */
  function aplicarTema(tema) {
    const iconDark = document.getElementById('theme-icon-dark');
    const iconLight = document.getElementById('theme-icon-light');

    if (tema === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      if (iconDark) iconDark.classList.add('hidden');
      if (iconLight) iconLight.classList.remove('hidden');
    } else {
      document.documentElement.removeAttribute('data-theme');
      if (iconDark) iconDark.classList.remove('hidden');
      if (iconLight) iconLight.classList.add('hidden');
    }
  }
  /* ─── FIM: aplicarTema ─────────────────────────────────────── */

  /* ─── INÍCIO: alternarModoEscuro ───────────────────────────── */
  function alternarModoEscuro() {
    const atual = document.documentElement.getAttribute('data-theme') === 'dark';
    const novo = atual ? 'light' : 'dark';
    aplicarTema(novo);
    try { localStorage.setItem(CHAVES.TEMA, novo); } catch (e) {}
  }
  /* ─── FIM: alternarModoEscuro ──────────────────────────────── */

  /* ─── INÍCIO: inicializarTema ──────────────────────────────── */
  function inicializarTema() {
    let temaSalvo = null;
    try { temaSalvo = localStorage.getItem(CHAVES.TEMA); } catch (e) {}

    if (temaSalvo === 'dark' || temaSalvo === 'light') {
      aplicarTema(temaSalvo);
      return;
    }

    const prefereEscuro = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    aplicarTema(prefereEscuro ? 'dark' : 'light');

    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e) => {
        let salvo = null;
        try { salvo = localStorage.getItem(CHAVES.TEMA); } catch (err) {}
        if (!salvo) aplicarTema(e.matches ? 'dark' : 'light');
      };
      if (mq.addEventListener) mq.addEventListener('change', handler);
      else if (mq.addListener) mq.addListener(handler);
    }
  }
  /* ─── FIM: inicializarTema ─────────────────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     07. HTTP / API
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: fetchComTimeout ──────────────────────────────── */
  async function fetchComTimeout(url, limiteMs = TIMEOUT_API, opcoes = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limiteMs);

    try {
      return await fetch(url, {
        mode: 'cors',
        redirect: 'follow',
        cache: 'no-cache',
        ...opcoes,
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
          ...(opcoes.headers || {}),
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }
  /* ─── FIM: fetchComTimeout ─────────────────────────────────── */

  /* ─── INÍCIO: executarRequisicaoAPI ────────────────────────── */
  async function executarRequisicaoAPI(acao, dadosExtras = {}, tentarRefresh = true, tentativa = 1) {
    try {
      const corpo = {
        acao,
        payload: dadosExtras || {},
        fingerprint: FINGERPRINT,
      };

      if (estadoSessao.token) {
        corpo.token = estadoSessao.token;
      } else {
        let linkToken = null;
        try { linkToken = sessionStorage.getItem(CHAVES.LINK_TOKEN); } catch (e) {}
        if (linkToken) corpo.token = linkToken;
      }

      const resposta = await fetchComTimeout(URL_BACKEND, TIMEOUT_API, {
        method: 'POST',
        body: JSON.stringify(corpo),
      });

      const texto = await resposta.text();
      let json;
      try {
        json = JSON.parse(texto);
      } catch (errParse) {
        return { sucesso: false, erroTransitorio: true, mensagem: 'Servidor ocupado. Aguarde um instante…' };
      }

      if (!json.sucesso && json.codigo === 'SISTEMA_BLOQUEADO') {
        if (estadoSessao.papel === 'adm') return json;
        if (estadoSessao.papel === 'membro') exibirTelaManutencaoMembro();
        else navegarPara('bloqueado');
        return json;
      }

      if (!json.sucesso && json.codigo === 'LINK_EXPIRED') {
        if (estadoSessao.papel === 'visitante') {
          exibirToast(json.mensagem || 'O link temporário expirou.', 'error');
          executarLimpezaTotalESaida(true);
        }
        return json;
      }

      if (!json.sucesso && json.codigo === 'SESSION_EXPIRED') {
        if (tentarRefresh) {
          let rt = estadoSessao.refreshToken;
          if (!rt) {
            try { rt = sessionStorage.getItem(CHAVES.REFRESH_TOKEN); } catch (e) {}
          }
          if (rt) {
            const ok = await tentarRenovarSessao(rt);
            if (ok) return executarRequisicaoAPI(acao, dadosExtras, false, tentativa);
          }
        }
        exibirToast('Sua sessão foi encerrada. Entre novamente.', 'info');
        executarLogout();
        return { sucesso: false, mensagem: 'Sessão expirada.' };
      }

      return json;
    } catch (erroRede) {
      if (tentativa === 1) {
        await new Promise((r) => setTimeout(r, 1200));
        return executarRequisicaoAPI(acao, dadosExtras, tentarRefresh, 2);
      }
      console.warn('[API] Oscilação de rede:', erroRede);
      return { sucesso: false, erroRede: true, mensagem: 'Sem conexão momentânea com o servidor.' };
    }
  }
  /* ─── FIM: executarRequisicaoAPI ───────────────────────────── */

  /* ─── INÍCIO: tentarRenovarSessao ──────────────────────────── */
  async function tentarRenovarSessao(refreshToken) {
    try {
      const resp = await fetchComTimeout(URL_BACKEND, 15000, {
        method: 'POST',
        body: JSON.stringify({
          acao: 'refresh',
          payload: { refreshToken },
          fingerprint: FINGERPRINT,
        }),
      });
      const json = await resp.json();
      if (json.sucesso && json.token) {
        estadoSessao.token = json.token;
        if (json.refreshToken) estadoSessao.refreshToken = json.refreshToken;
        try { localStorage.setItem(CHAVES.SESSAO, JSON.stringify(estadoSessao)); } catch (e) {}
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }
  /* ─── FIM: tentarRenovarSessao ─────────────────────────────── */

  /* ─── INÍCIO: exibirTelaManutencaoMembro ───────────────────── */
  function exibirTelaManutencaoMembro() {
    if (document.getElementById('aviso-manutencao-membro')) return;

    const box = document.createElement('div');
    box.id = 'aviso-manutencao-membro';
    box.style.cssText = `
      position: fixed; inset: 0;
      background: rgba(15, 23, 42, 0.96);
      z-index: 99999; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 24px; text-align: center; color: #fff;
      backdrop-filter: blur(8px);
    `;
    box.innerHTML = `
      <div style="font-size: 3.5rem; margin-bottom: 14px;">🛡️</div>
      <h2 style="font-size: 1.4rem; font-weight: 800; margin-bottom: 8px;">Plataforma Fechada</h2>
      <p style="color: #94a3b8; max-width: 360px; line-height: 1.5; font-size: 0.9rem; margin-bottom: 22px;">
        Estamos realizando ajustes operacionais. Em breve estaremos de volta!
      </p>
      <button type="button" class="btn btn-primary btn-sm" onclick="location.reload()">
        Atualizar Página
      </button>
    `;
    document.body.appendChild(box);
  }
  /* ─── FIM: exibirTelaManutencaoMembro ──────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     08. SESSÃO / TOKENS
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: restaurarSessaoLocal ─────────────────────────── */
  function restaurarSessaoLocal() {
    let salvo = null;
    try { salvo = localStorage.getItem(CHAVES.SESSAO); } catch (e) {}
    if (!salvo) return;

    try {
      const s = JSON.parse(salvo);
      estadoSessao.papel = s.papel || 'visitante';
      estadoSessao.token = s.token || null;
      estadoSessao.refreshToken = s.refreshToken || null;
      estadoSessao.nomeUsuario = s.nomeUsuario || 'Visitante';
      estadoSessao.telefone = s.telefone || null;

      if (estadoSessao.papel !== 'visitante') _linkAutorizadoValido = true;
    } catch (e) {
      try { localStorage.removeItem(CHAVES.SESSAO); } catch (err) {}
    }
  }
  /* ─── FIM: restaurarSessaoLocal ────────────────────────────── */

  /* ─── INÍCIO: verificarTokenUrl ────────────────────────────── */
  async function verificarTokenUrl() {
    if (estadoSessao.token && estadoSessao.papel !== 'visitante') {
      _linkAutorizadoValido = true;
      return;
    }

    let tokenAcesso = null;
    try {
      const params = new URLSearchParams(window.location.search);
      tokenAcesso = params.get('token') || sessionStorage.getItem(CHAVES.LINK_TOKEN);
    } catch (e) {}

    if (!tokenAcesso) {
      _linkAutorizadoValido = false;
      return;
    }

    try {
      const url = URL_BACKEND + '?acao=validar_link&tokenAcesso=' + encodeURIComponent(tokenAcesso);
      const resp = await fetchComTimeout(url, TIMEOUT_LINK);
      const res = await resp.json();

      if (res.valido) {
        _linkAutorizadoValido = true;
        try { sessionStorage.setItem(CHAVES.LINK_TOKEN, tokenAcesso); } catch (e) {}
        iniciarTemporizadorSilencioso(res.segundosRestantes || 15 * 60);
      } else {
        _linkAutorizadoValido = false;
        try { sessionStorage.removeItem(CHAVES.LINK_TOKEN); } catch (e) {}
        exibirToast(res.mensagem || 'O link temporário terminou.', 'error');
      }
    } catch (e) {
      _linkAutorizadoValido = false;
    }
  }
  /* ─── FIM: verificarTokenUrl ───────────────────────────────── */

  /* ─── INÍCIO: iniciarTemporizadorSilencioso ────────────────── */
  function iniciarTemporizadorSilencioso(segundosTotais) {
    pararTemporizadorSilencioso();
    if (estadoSessao.papel !== 'visitante') return;

    _segundosRestantesLink = segundosTotais;
    _timerSilencioso = setInterval(() => {
      if (estadoSessao.papel !== 'visitante') {
        pararTemporizadorSilencioso();
        return;
      }
      _segundosRestantesLink--;
      if (_segundosRestantesLink <= 0) {
        pararTemporizadorSilencioso();
        exibirToast('Seu período de acesso terminou. Solicite um novo link.', 'info');
        executarLimpezaTotalESaida();
      }
    }, 1000);
  }
  /* ─── FIM: iniciarTemporizadorSilencioso ───────────────────── */

  /* ─── INÍCIO: pararTemporizadorSilencioso ──────────────────── */
  function pararTemporizadorSilencioso() {
    if (_timerSilencioso) {
      clearInterval(_timerSilencioso);
      _timerSilencioso = null;
    }
  }
  /* ─── FIM: pararTemporizadorSilencioso ─────────────────────── */

  /* ─── INÍCIO: executarLimpezaTotalESaida ───────────────────── */
  function executarLimpezaTotalESaida(silencioso = false) {
    pararTemporizadorSilencioso();
    desligarAutoRefreshAdm();
    pararAutoRefreshEsteira();

    let fp = null, tema = null;
    try {
      fp = localStorage.getItem(CHAVES.FINGERPRINT);
      tema = localStorage.getItem(CHAVES.TEMA);
      localStorage.removeItem(CHAVES.SESSAO);
      sessionStorage.clear();
      if (fp) localStorage.setItem(CHAVES.FINGERPRINT, fp);
      if (tema) localStorage.setItem(CHAVES.TEMA, tema);
    } catch (e) {}

    estadoSessao.papel = 'visitante';
    estadoSessao.token = null;
    estadoSessao.refreshToken = null;
    estadoSessao.nomeUsuario = 'Visitante';
    estadoSessao.telefone = null;
    estadoSessao.pedidosRecentes = [];
    cestaCompras = [];
    favoritosUsuario = [];
    _linkAutorizadoValido = false;

    atualizarBarraFlutuanteSacola();
    atualizarBadgeCarrinho(0);

    const urlLimpa = window.location.origin + window.location.pathname;
    try { window.history.replaceState({}, document.title, urlLimpa); } catch (e) {}

    if (!silencioso) exibirToast('Sessão finalizada com sucesso.', 'info');
    atualizarInterfaceSessao();
  }
  /* ─── FIM: executarLimpezaTotalESaida ──────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     09. NAVEGAÇÃO
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: navegarPara ──────────────────────────────────── */
  function navegarPara(nomeAba) {
    document.querySelectorAll('.bottom-nav__item').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.view-panel').forEach((p) => {
      p.classList.remove('active');
      p.classList.add('hidden');
    });

    const painel = document.getElementById('view-' + nomeAba);
    if (painel) {
      painel.classList.remove('hidden');
      painel.classList.add('active');
    }

    const botao = document.querySelector('.bottom-nav__item[data-view="' + nomeAba + '"]');
    if (botao) botao.classList.add('active');

    fecharUserDropdown();

    if (nomeAba !== 'pedidos-adm') pararAutoRefreshEsteira();

    if (nomeAba === 'vitrine') sincronizarProdutosServidor();
    if (nomeAba === 'favoritos') renderizarFavoritos();
    if (nomeAba === 'carrinho') renderizarCarrinho();
    if (nomeAba === 'meus-pedidos') carregarMeusPedidos();
    if (nomeAba === 'pedidos-adm') {
      carregarPedidosAdm();
      iniciarAutoRefreshEsteira();
    }
    if (nomeAba === 'adm') carregarPainelCentralAdm();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  /* ─── FIM: navegarPara ─────────────────────────────────────── */

  /* ─── INÍCIO: aplicarNavPorPapel ───────────────────────────── */
  function aplicarNavPorPapel(papel) {
    document.querySelectorAll('.bottom-nav__item').forEach((btn) => {
      const roles = (btn.dataset.roles || '').split(',').map((r) => r.trim());
      if (roles.includes(papel)) btn.classList.remove('hidden');
      else btn.classList.add('hidden');
    });
  }
  /* ─── FIM: aplicarNavPorPapel ──────────────────────────────── */

  /* ─── INÍCIO: atualizarInterfaceSessao ─────────────────────── */
  function atualizarInterfaceSessao() {
    const anonBox = document.getElementById('anon-buttons');
    const authBox = document.getElementById('auth-buttons');
    const userLabel = document.getElementById('user-display-name');
    const badge = document.getElementById('role-badge');
    const navBar = document.getElementById('app-nav-bar');
    const headerCart = document.getElementById('header-cart-btn');
    const viewBloqueado = document.getElementById('view-bloqueado');

    if (badge) {
      badge.textContent = estadoSessao.papel.toUpperCase();
      badge.className = 'badge badge-' + estadoSessao.papel;
    }
    if (userLabel) userLabel.textContent = estadoSessao.nomeUsuario || 'Olá';
    atualizarAvatarUsuario();
    aplicarNavPorPapel(estadoSessao.papel);

    const semAcesso = !_linkAutorizadoValido && estadoSessao.papel === 'visitante';

    if (semAcesso) {
      if (navBar) navBar.classList.add('hidden');
      document.querySelectorAll('.view-panel').forEach((p) => {
        p.classList.add('hidden');
        p.classList.remove('active');
      });
      if (viewBloqueado) {
        viewBloqueado.classList.remove('hidden');
        viewBloqueado.classList.add('active');
      }
      if (anonBox) anonBox.classList.remove('hidden');
      if (authBox) authBox.classList.add('hidden');
      if (headerCart) headerCart.classList.add('hidden');
      fecharUserDropdown();
      atualizarBarraFlutuanteSacola();
      return;
    }

    if (navBar) navBar.classList.remove('hidden');
    if (viewBloqueado) {
      viewBloqueado.classList.add('hidden');
      viewBloqueado.classList.remove('active');
    }

    if (estadoSessao.papel === 'visitante') {
      if (anonBox) anonBox.classList.remove('hidden');
      if (authBox) authBox.classList.add('hidden');
      if (headerCart) headerCart.classList.add('hidden');
    } else {
      if (anonBox) anonBox.classList.add('hidden');
      if (authBox) authBox.classList.remove('hidden');
      if (headerCart) {
        if (estadoSessao.papel === 'membro') headerCart.classList.remove('hidden');
        else headerCart.classList.add('hidden');
      }
    }

    const algumPainelVisivel = document.querySelector('.view-panel.active:not(.hidden)');
    if (!algumPainelVisivel) navegarPara('vitrine');

    if (estadoSessao.papel === 'adm') ligarAutoRefreshAdm();
    else desligarAutoRefreshAdm();

    atualizarBarraFlutuanteSacola();
  }
  /* ─── FIM: atualizarInterfaceSessao ────────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     10. MODAIS & CONFIRMAÇÃO
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: abrirModal ───────────────────────────────────── */
  function abrirModal(idModal) {
    const modal = document.getElementById(idModal);
    if (!modal) return;
    modal.classList.add('active');
    try { history.pushState({ modal: idModal }, ''); } catch (e) {}
  }
  /* ─── FIM: abrirModal ──────────────────────────────────────── */

  /* ─── INÍCIO: fecharModal ──────────────────────────────────── */
  function fecharModal(idModal) {
    const modal = document.getElementById(idModal);
    if (!modal) return;
    modal.classList.remove('active');
  }
  /* ─── FIM: fecharModal ─────────────────────────────────────── */

  /* ─── INÍCIO: abrirConfirmacao ─────────────────────────────── */
  function abrirConfirmacao(titulo, mensagem, callback) {
    const tituloEl = document.getElementById('confirmar-titulo');
    const msgEl = document.getElementById('confirmar-mensagem');
    const btnOk = document.getElementById('confirmar-btn-ok');
    const btnCancelar = document.getElementById('btn-confirmar-cancelar');

    if (tituloEl) tituloEl.textContent = titulo;
    if (msgEl) {
      if (typeof mensagem === 'string' && mensagem.startsWith('<')) msgEl.innerHTML = mensagem;
      else msgEl.textContent = mensagem;
    }

    _callbackConfirmacao = callback;

    if (btnOk) {
      btnOk.onclick = () => {
        const cb = _callbackConfirmacao;
        fecharConfirmacao();
        if (typeof cb === 'function') cb();
      };
    }

    abrirModal('modal-confirmar');
    setTimeout(() => { if (btnCancelar) btnCancelar.focus(); }, 120);
  }
  /* ─── FIM: abrirConfirmacao ────────────────────────────────── */

  /* ─── INÍCIO: abrirConfirmacaoElemento ─────────────────────── */
  function abrirConfirmacaoElemento(titulo, elementoDom, callback) {
    const tituloEl = document.getElementById('confirmar-titulo');
    const msgEl = document.getElementById('confirmar-mensagem');
    const btnOk = document.getElementById('confirmar-btn-ok');

    if (tituloEl) tituloEl.textContent = titulo;
    if (msgEl) {
      msgEl.innerHTML = '';
      msgEl.appendChild(elementoDom);
    }

    _callbackConfirmacao = callback;

    if (btnOk) {
      btnOk.onclick = () => {
        const cb = _callbackConfirmacao;
        fecharConfirmacao();
        if (typeof cb === 'function') cb();
      };
    }

    abrirModal('modal-confirmar');
  }
  /* ─── FIM: abrirConfirmacaoElemento ────────────────────────── */

  /* ─── INÍCIO: fecharConfirmacao ────────────────────────────── */
  function fecharConfirmacao() {
    fecharModal('modal-confirmar');
    _callbackConfirmacao = null;
  }
  /* ─── FIM: fecharConfirmacao ───────────────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     11. TOASTS / LOADER
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: exibirToast ──────────────────────────────────── */
  function exibirToast(mensagem, tipo = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + tipo;
    toast.setAttribute('role', 'alert');
    toast.textContent = mensagem;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s, transform 0.3s';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';
      setTimeout(() => toast.remove(), 350);
    }, 3500);
  }
  /* ─── FIM: exibirToast ─────────────────────────────────────── */

  /* ─── INÍCIO: mostrarLoader ────────────────────────────────── */
  function mostrarLoader(texto = 'Carregando…') {
    const overlay = document.getElementById('loader-overlay');
    const label = document.getElementById('loader-text');
    if (label) label.textContent = texto;
    if (overlay) overlay.classList.remove('hidden');
  }
  /* ─── FIM: mostrarLoader ───────────────────────────────────── */

  /* ─── INÍCIO: esconderLoader ───────────────────────────────── */
  function esconderLoader() {
    const overlay = document.getElementById('loader-overlay');
    if (overlay) overlay.classList.add('hidden');
  }
  /* ─── FIM: esconderLoader ──────────────────────────────────── */

  /* ─── INÍCIO: botaoCarregando ──────────────────────────────── */
  function botaoCarregando(idBotao, carregando = true) {
    const btn = typeof idBotao === 'string' ? document.getElementById(idBotao) : idBotao;
    if (!btn) return;
    btn.disabled = carregando;
    btn.classList.toggle('loading', carregando);
  }
  /* ─── FIM: botaoCarregando ─────────────────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     12. LIGHTBOX
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: abrirLightboxFoto ────────────────────────────── */
  function abrirLightboxFoto(src, alt) {
    const modal = document.getElementById('modal-lightbox');
    const img = document.getElementById('lightbox-img');
    if (!modal || !img) return;
    img.src = src;
    img.alt = alt || 'Produto ampliado';
    modal.classList.add('active');
  }
  /* ─── FIM: abrirLightboxFoto ───────────────────────────────── */

  /* ─── INÍCIO: fecharLightbox ───────────────────────────────── */
  function fecharLightbox() {
    const modal = document.getElementById('modal-lightbox');
    if (modal) modal.classList.remove('active');
  }
  /* ─── FIM: fecharLightbox ──────────────────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     13. AUTENTICAÇÃO (LOGIN & CADASTRO)
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: tratarLogin ──────────────────────────────────── */
async function tratarLogin(evento) {
  if (evento && evento.preventDefault) evento.preventDefault();

  const usuarioEl = document.getElementById('login-usuario');
  const senhaEl = document.getElementById('login-senha');
  if (!usuarioEl || !senhaEl) return;

  const usuarioRaw = usuarioEl.value.trim();
  const usuarioDigitos = extrairApenasDigitos(usuarioRaw);
  const senha = senhaEl.value;

  if (usuarioDigitos.length < 10) {
    exibirToast('Informe seu WhatsApp completo com DDD.', 'error');
    usuarioEl.focus();
    return;
  }
  if (!senha || senha.length < 4) {
    exibirToast('Informe sua senha.', 'error');
    senhaEl.focus();
    return;
  }

  botaoCarregando('btn-entrar', true);

  // ⚠️ Envia TAMBÉM o valor cru, para cobrir backend que armazena formatado
  const payload = {
    identificador: usuarioRaw,              // ex: "(74) 99999-9999"
    identificadorDigitos: usuarioDigitos,   // ex: "74999999999"
    senha,
  };

  console.log('[LOGIN] Payload enviado:', {
    identificador: usuarioRaw,
    identificadorDigitos: usuarioDigitos,
    senhaTamanho: senha.length,
  });

  const resp = await executarRequisicaoAPI('login', payload);

  console.log('[LOGIN] Resposta recebida:', resp);

  botaoCarregando('btn-entrar', false);

  if (!resp.sucesso) {
    exibirToast(resp.mensagem || 'Credenciais inválidas.', 'error');
    return;
    }

    // Sucesso: aplica sessão
    estadoSessao.papel = resp.papel || 'membro';
    estadoSessao.token = resp.token;
    estadoSessao.refreshToken = resp.refreshToken || null;
    estadoSessao.nomeUsuario = resp.nome || 'Membro';
    estadoSessao.telefone = usuarioDigitos;

    _linkAutorizadoValido = true;
    pararTemporizadorSilencioso();

    try { localStorage.setItem(CHAVES.SESSAO, JSON.stringify(estadoSessao)); } catch (e) {}

    // Limpa formulário e fecha modal
    const formLogin = document.getElementById('form-login');
    if (formLogin) formLogin.reset();
    fecharModal('modal-login');

    // Atualiza UI e busca dados
    atualizarInterfaceSessao();
    CacheLoja.limpar(CACHE_KEYS.PRODUTOS('visitante'));
    await sincronizarProdutosServidor();
    await carregarMeusPedidos();

    if (estadoSessao.papel === 'membro') {
      setTimeout(mostrarBannerRepetirPedido, 400);
    }

    // Momento de boas-vindas
    await mostrarMomento(
      'Bem-vindo(a)! 🎉',
      'Olá, ' + resp.nome + '. Bons pedidos!',
      'success',
      1800
    );

    exibirToast('Login realizado com sucesso.', 'success');
  }
  /* ─── FIM: tratarLogin ─────────────────────────────────────── */

  /* ─── INÍCIO: tratarSolicitacaoCadastro ────────────────────── */
  async function tratarSolicitacaoCadastro(evento) {
    if (evento && evento.preventDefault) evento.preventDefault();

    const nomeEl = document.getElementById('cad-nome');
    const telEl = document.getElementById('cad-telefone');
    const idadeEl = document.getElementById('cad-idade');
    const indNomeEl = document.getElementById('cad-indicado-nome');
    const indTelEl = document.getElementById('cad-indicado-telefone');
    const senhaEl = document.getElementById('cad-senha');
    const senhaConfEl = document.getElementById('cad-senha-conf');
    const termosEl = document.getElementById('cad-termos');

    if (!nomeEl || !telEl || !idadeEl || !indNomeEl || !indTelEl || !senhaEl || !senhaConfEl || !termosEl) return;

    const nome = nomeEl.value.trim();
    const telefone = extrairApenasDigitos(telEl.value);
    const idade = parseInt(idadeEl.value, 10);
    const indicadoPorNome = indNomeEl.value.trim();
    const indicadoPorTelefone = extrairApenasDigitos(indTelEl.value);
    const senha = senhaEl.value;
    const senhaConf = senhaConfEl.value;
    const aceitouTermos = termosEl.checked;

    // Validações sequenciais com foco no campo com erro
    if (!nome || nome.length < 3) {
      exibirToast('Informe seu nome completo.', 'error');
      nomeEl.focus();
      return;
    }
    if (telefone.length < 10) {
      exibirToast('WhatsApp incompleto (precisa de DDD).', 'error');
      telEl.focus();
      return;
    }
    if (isNaN(idade) || idade < 18) {
      exibirToast('Apenas maiores de 18 anos.', 'error');
      idadeEl.focus();
      return;
    }
    if (!indicadoPorNome) {
      exibirToast('Informe o nome de quem indicou.', 'error');
      indNomeEl.focus();
      return;
    }
    if (indicadoPorTelefone.length < 10) {
      exibirToast('WhatsApp de quem indicou está incompleto.', 'error');
      indTelEl.focus();
      return;
    }
    if (senha.length < 6) {
      exibirToast('A senha precisa ter no mínimo 6 caracteres.', 'error');
      senhaEl.focus();
      return;
    }
    if (senha !== senhaConf) {
      exibirToast('As senhas digitadas não conferem.', 'error');
      senhaConfEl.focus();
      return;
    }
    if (!aceitouTermos) {
      exibirToast('É necessário aceitar os Termos de Uso.', 'error');
      termosEl.focus();
      return;
    }

    botaoCarregando('btn-enviar-cadastro', true);
    mostrarLoader('Enviando solicitação…');

    const resp = await executarRequisicaoAPI('solicitar_cadastro', {
      nome,
      telefone,
      idade,
      indicadoPorNome,
      indicadoPorTelefone,
      senha,
    });

    esconderLoader();
    botaoCarregando('btn-enviar-cadastro', false);

    if (!resp.sucesso) {
      exibirToast(resp.mensagem || 'Erro ao registrar. Tente novamente.', 'error');
      return;
    }

    // Sucesso: limpa formulário, fecha modal e mostra momento
    const formRegistro = document.getElementById('form-registro');
    if (formRegistro) formRegistro.reset();

    fecharModal('modal-cadastro');

    await mostrarMomento(
      'Cadastro enviado! 💛',
      'Você receberá a confirmação no WhatsApp em até 24h.',
      'success',
      2800
    );

    exibirToast('Fique atento ao WhatsApp!', 'info');
  }
  /* ─── FIM: tratarSolicitacaoCadastro ───────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     14. VITRINE & FILTROS
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: sincronizarProdutosServidor ──────────────────── */
  async function sincronizarProdutosServidor() {
    let url = URL_BACKEND + '?acao=listar_produtos';
    const token = estadoSessao.token || sessionStorage.getItem(CHAVES.LINK_TOKEN);
    if (token) url += '&token=' + encodeURIComponent(token);

    try {
      const resp = await fetchComTimeout(url, 20000);
      const json = await resp.json();
      if (json.sucesso && Array.isArray(json.produtos)) {
        catalogoProdutos = json.produtos;
        aplicarFiltrosVitrine(true);
        CacheLoja.salvar(CACHE_KEYS.PRODUTOS(estadoSessao.papel), catalogoProdutos);
      }
    } catch (e) {
      console.warn('[Vitrine] Sync:', e);
    }
  }
  /* ─── FIM: sincronizarProdutosServidor ─────────────────────── */

  /* ─── INÍCIO: aplicarFiltroVitrine ─────────────────────────── */
  function aplicarFiltroVitrine(termo) {
    termoBuscaVitrine = String(termo || '').toLowerCase().trim();
    aplicarFiltrosVitrine(false);
  }
  /* ─── FIM: aplicarFiltroVitrine ────────────────────────────── */

  /* ─── INÍCIO: selecionarCategoriaChip ──────────────────────── */
  function selecionarCategoriaChip(categoria, elemento) {
    categoriaAtiva = categoria || 'todos';
    document.querySelectorAll('#vitrine-chips .chip').forEach((c) => c.classList.remove('active'));
    if (elemento) elemento.classList.add('active');
    aplicarFiltrosVitrine(false);
  }
  /* ─── FIM: selecionarCategoriaChip ─────────────────────────── */

  /* ─── INÍCIO: aplicarFiltrosVitrine ────────────────────────── */
  function aplicarFiltrosVitrine(semRenderizarChips) {
    catalogoFiltrado = catalogoProdutos.filter((p) => {
      const matchCat = categoriaAtiva === 'todos' || (p.categoria || '').toLowerCase() === categoriaAtiva.toLowerCase();
      const matchTermo = !termoBuscaVitrine || (p.nome || '').toLowerCase().includes(termoBuscaVitrine);
      return matchCat && matchTermo;
    });

    if (!semRenderizarChips) renderizarChipsCategorias();
    renderizarVitrine(catalogoFiltrado, 'produtos-container');
  }
  /* ─── FIM: aplicarFiltrosVitrine ───────────────────────────── */

  /* ─── INÍCIO: renderizarChipsCategorias ────────────────────── */
  function renderizarChipsCategorias() {
    const container = document.getElementById('vitrine-chips');
    if (!container) return;

    const cats = new Set(['todos']);
    catalogoProdutos.forEach((p) => { if (p.categoria) cats.add(p.categoria); });

    const datalist = document.getElementById('lista-categorias');
    if (datalist) {
      datalist.innerHTML = '';
      Array.from(cats).filter((c) => c !== 'todos').forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c;
        datalist.appendChild(opt);
      });
    }

    container.innerHTML = '';
    Array.from(cats).forEach((cat) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (cat === categoriaAtiva ? ' active' : '');
      chip.dataset.action = 'filtrar-categoria';
      chip.dataset.categoria = cat;
      chip.textContent = cat === 'todos' ? 'Todos' : cat;
      container.appendChild(chip);
    });
  }
  /* ─── FIM: renderizarChipsCategorias ───────────────────────── */

  /* ─── INÍCIO: renderizarVitrine ────────────────────────────── */
  function renderizarVitrine(lista, containerId) {
    const grid = document.getElementById(containerId);
    if (!grid) return;
    grid.innerHTML = '';

    if (!lista || lista.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <strong>Nenhum produto por aqui</strong>
          <span>Tente outra busca ou categoria.</span>
        </div>
      `;
      return;
    }

    lista.forEach((p) => {
      const card = criarCardProduto(p);
      if (card && card.nodeType === 1) grid.appendChild(card);
    });
  }
  /* ─── FIM: renderizarVitrine ───────────────────────────────── */

  /* ─── INÍCIO: criarCardProduto ─────────────────────────────── */
  function criarCardProduto(p) {
    const estoque = Number(p.estoque);
    const semEstoque = !isNaN(estoque) && estoque <= 0;
    const comportamento = p.estoque_comportamento || 'esgotado';

    // Se esgotado E ADM escolheu ocultar → não renderiza
    if (semEstoque && comportamento === 'ocultar') return null;

    const card = document.createElement('div');
    card.className = 'product-card' + (semEstoque ? ' esgotado' : '');
    card.dataset.id = p.id;

    const favorito = favoritosUsuario.includes(String(p.id));
    const foto = p.foto || 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23a8a29e" stroke-width="1.4"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>'
    );

    card.innerHTML = `
      <div class="product-card__media">
        ${semEstoque ? '<span class="badge-esgotado">⚠️ Esgotado</span>' : ''}
        <button type="button" class="favorite-btn${favorito ? ' ativo' : ''}"
                data-action="favoritar" data-id="${escaparHtml(p.id)}"
                aria-label="${favorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
          </svg>
        </button>
        <img class="product-thumb" src="${escaparHtml(foto)}" alt="${escaparHtml(p.nome)}" loading="lazy">
      </div>
      <div class="product-details">
        <h3 class="product-name">${escaparHtml(p.nome)}</h3>
        <p class="product-price">${fmtPreco(p.preco)}</p>
      </div>
    `;

    const body = card.querySelector('.product-details');

    if (semEstoque) {
      const btnAgendar = document.createElement('button');
      btnAgendar.type = 'button';
      btnAgendar.className = 'btn-agendar-esgotado';
      btnAgendar.dataset.action = 'agendar-esgotado';
      btnAgendar.dataset.id = p.id;
      btnAgendar.innerHTML = '📅 Agendar Pedido';
      body.appendChild(btnAgendar);
      return card;
    }

    if (estadoSessao.papel === 'membro') {
      const qtd = (cestaCompras.find((i) => String(i.id) === String(p.id)) || {}).quantidade || 0;
      const controles = document.createElement('div');
      controles.className = 'card-qty-control';
      controles.innerHTML = `
        <button type="button" class="btn-qty" aria-label="Diminuir">−</button>
        <span class="qty-display" id="qty-card-${escaparHtml(p.id)}">${qtd}</span>
        <button type="button" class="btn-qty" aria-label="Aumentar">+</button>
      `;
      const btns = controles.querySelectorAll('.btn-qty');
      btns[0].addEventListener('click', () => alterarQuantidadeProdutoCard(p, -1));
      btns[1].addEventListener('click', () => alterarQuantidadeProdutoCard(p, 1));
      body.appendChild(controles);
    } else if (estadoSessao.papel === 'adm') {
      const admBox = document.createElement('div');
      admBox.className = 'adm-visib-controls';
      admBox.innerHTML = `
        <select aria-label="Visibilidade">
          <option value="publico" ${p.visibilidade === 'publico' ? 'selected' : ''}>Público</option>
          <option value="registrado" ${p.visibilidade === 'registrado' ? 'selected' : ''}>Membro</option>
          <option value="adm" ${p.visibilidade === 'adm' ? 'selected' : ''}>Oculto ADM</option>
        </select>
      `;
      admBox.querySelector('select').addEventListener('change', (e) => {
        alterarVisibilidadeProdutoAdm(p.id, e.target.value);
      });
      body.appendChild(admBox);

      const btnExcluir = document.createElement('button');
      btnExcluir.type = 'button';
      btnExcluir.className = 'btn btn-danger-outline btn-sm';
      btnExcluir.style.marginTop = '6px';
      btnExcluir.style.width = '100%';
      btnExcluir.textContent = '🗑️ Excluir';
      btnExcluir.addEventListener('click', () => confirmarExclusaoProdutoAdm(p.id, p.nome));
      body.appendChild(btnExcluir);
    } else {
      const note = document.createElement('small');
      note.className = 'visitor-note';
      note.textContent = 'Entre para adicionar ao carrinho';
      body.appendChild(note);
    }

    return card;
  }
  /* ─── FIM: criarCardProduto ────────────────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     15. FAVORITOS
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: carregarFavoritos ────────────────────────────── */
  function carregarFavoritos() {
    try {
      const salvo = localStorage.getItem(CHAVES.FAVORITOS);
      if (!salvo) { favoritosUsuario = []; return; }
      const parsed = JSON.parse(salvo);
      favoritosUsuario = Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (e) {
      favoritosUsuario = [];
    }
  }
  /* ─── FIM: carregarFavoritos ───────────────────────────────── */

  /* ─── INÍCIO: salvarFavoritos ──────────────────────────────── */
  function salvarFavoritos() {
    try { localStorage.setItem(CHAVES.FAVORITOS, JSON.stringify(favoritosUsuario)); } catch (e) {}
  }
  /* ─── FIM: salvarFavoritos ─────────────────────────────────── */

  /* ─── INÍCIO: alternarFavorito ─────────────────────────────── */
  function alternarFavorito(idProduto) {
    idProduto = String(idProduto);
    const idx = favoritosUsuario.indexOf(idProduto);

    if (idx >= 0) {
      favoritosUsuario.splice(idx, 1);
      exibirToast('Removido dos favoritos.', 'info');
    } else {
      favoritosUsuario.push(idProduto);
      exibirToast('Adicionado aos favoritos ❤️', 'success');
    }

    salvarFavoritos();

    const btns = document.querySelectorAll('.favorite-btn[data-id="' + idProduto + '"]');
    btns.forEach((b) => {
      const ativo = favoritosUsuario.includes(idProduto);
      b.classList.toggle('ativo', ativo);
      b.setAttribute('aria-label', ativo ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
    });

    const viewFav = document.getElementById('view-favoritos');
    if (viewFav && viewFav.classList.contains('active')) renderizarFavoritos();
  }
  /* ─── FIM: alternarFavorito ────────────────────────────────── */

  /* ─── INÍCIO: renderizarFavoritos ──────────────────────────── */
  function renderizarFavoritos() {
    const container = document.getElementById('favoritos-container');
    if (!container) return;
    const favoritos = catalogoProdutos.filter((p) => favoritosUsuario.includes(String(p.id)));
    renderizarVitrine(favoritos, 'favoritos-container');
  }
  /* ─── FIM: renderizarFavoritos ─────────────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     16. CARRINHO
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: carregarCarrinhoLocal ────────────────────────── */
  function carregarCarrinhoLocal() {
    try {
      const salvo = localStorage.getItem(CHAVES.CARRINHO);
      if (!salvo) return;
      const parsed = JSON.parse(salvo);
      if (Array.isArray(parsed)) {
        cestaCompras = parsed;
        const total = cestaCompras.reduce((a, i) => a + (i.quantidade || 0), 0);
        atualizarBadgeCarrinho(total);
        atualizarBarraFlutuanteSacola();
      }
    } catch (e) { cestaCompras = []; }
  }
  /* ─── FIM: carregarCarrinhoLocal ───────────────────────────── */

  /* ─── INÍCIO: salvarCarrinhoLocal ──────────────────────────── */
  function salvarCarrinhoLocal() {
    try { localStorage.setItem(CHAVES.CARRINHO, JSON.stringify(cestaCompras)); } catch (e) {}
  }
  /* ─── FIM: salvarCarrinhoLocal ─────────────────────────────── */

  /* ─── INÍCIO: alterarQuantidadeProdutoCard ─────────────────── */
  function alterarQuantidadeProdutoCard(produto, delta) {
    if (estadoSessao.papel !== 'membro') {
      exibirToast('Faça login para adicionar itens.', 'info');
      return;
    }

    const item = cestaCompras.find((i) => String(i.id) === String(produto.id));

    if (item) {
      item.quantidade += delta;
      if (item.quantidade <= 0) {
        cestaCompras = cestaCompras.filter((i) => String(i.id) !== String(produto.id));
      }
    } else if (delta > 0) {
      cestaCompras.push({
        id: produto.id,
        nome: produto.nome,
        preco: Number(produto.preco),
        quantidade: 1,
        agendado: false,
      });
    }

    const display = document.getElementById('qty-card-' + produto.id);
    const atual = cestaCompras.find((i) => String(i.id) === String(produto.id));
    if (display) display.textContent = atual ? atual.quantidade : 0;

    const total = cestaCompras.reduce((a, i) => a + i.quantidade, 0);
    atualizarBadgeCarrinho(total);
    atualizarBarraFlutuanteSacola();
    salvarCarrinhoLocal();
  }
  /* ─── FIM: alterarQuantidadeProdutoCard ────────────────────── */

  /* ─── INÍCIO: adicionarAoAgendamento ───────────────────────── */
  function adicionarAoAgendamento(idProduto) {
    if (estadoSessao.papel !== 'membro') {
      exibirToast('Faça login para agendar pedidos.', 'info');
      return;
    }

    const produto = catalogoProdutos.find((p) => String(p.id) === String(idProduto));
    if (!produto) return;

    const item = cestaCompras.find((i) => String(i.id) === String(idProduto));
    if (item) {
      item.quantidade += 1;
      item.agendado = true;
    } else {
      cestaCompras.push({
        id: produto.id,
        nome: produto.nome,
        preco: Number(produto.preco),
        quantidade: 1,
        agendado: true,
      });
    }

    exibirToast('Adicionado ao agendamento 📅', 'success');
    const total = cestaCompras.reduce((a, i) => a + i.quantidade, 0);
    atualizarBadgeCarrinho(total);
    atualizarBarraFlutuanteSacola();
    salvarCarrinhoLocal();

    setTimeout(() => navegarPara('carrinho'), 500);
  }
  /* ─── FIM: adicionarAoAgendamento ──────────────────────────── */

  /* ─── INÍCIO: renderizarCarrinho ───────────────────────────── */
  function renderizarCarrinho() {
    const lista = document.getElementById('carrinho-itens-lista');
    if (!lista) return;

    lista.innerHTML = '';
    let total = 0;

    if (cestaCompras.length === 0) {
      lista.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="21" r="1"></circle>
            <circle cx="20" cy="21" r="1"></circle>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
          </svg>
          <strong>Seu carrinho está vazio</strong>
          <span>Adicione produtos pelo catálogo.</span>
        </div>
      `;
      const totalEl = document.getElementById('carrinho-total-valor');
      if (totalEl) totalEl.textContent = 'R$ 0,00';
      atualizarBadgeCarrinho(0);
      atualizarBarraFlutuanteSacola();
      atualizarInfoAgendamento();
      return;
    }

    cestaCompras.forEach((item) => {
      const subtotal = item.preco * item.quantidade;
      total += subtotal;

      const linha = document.createElement('div');
      linha.className = 'cart-item-clean';
      linha.innerHTML = `
        <div style="flex:1;min-width:0;">
          <strong style="display:block;color:var(--cor-texto);">${escaparHtml(item.nome)}</strong>
          ${item.agendado ? '<span class="badge-etapa badge-etapa-analise" style="margin-top:4px;">📅 Agendado</span>' : ''}
          <div style="color:var(--cor-texto-suave);font-size:0.78rem;margin-top:2px;">
            ${fmtPreco(item.preco)} × ${item.quantidade}
          </div>
          <strong style="color:var(--cor-primaria-profunda);font-size:1rem;">${fmtPreco(subtotal)}</strong>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <div class="card-qty-control" style="margin:0;">
            <button type="button" class="btn-qty" data-qtd="menos" aria-label="Diminuir">−</button>
            <span class="qty-display">${item.quantidade}</span>
            <button type="button" class="btn-qty" data-qtd="mais" aria-label="Aumentar">+</button>
          </div>
          <button type="button" class="btn-lixeira" aria-label="Remover" title="Remover">🗑️</button>
        </div>
      `;

      linha.querySelector('[data-qtd="menos"]').addEventListener('click', () => modificarQtdCarrinho(item.id, -1));
      linha.querySelector('[data-qtd="mais"]').addEventListener('click', () => modificarQtdCarrinho(item.id, 1));
      linha.querySelector('.btn-lixeira').addEventListener('click', () => solicitarRemocaoItemCarrinho(item.id, item.nome));

      lista.appendChild(linha);
    });

    const totalEl = document.getElementById('carrinho-total-valor');
    if (totalEl) totalEl.textContent = fmtPreco(total);

    atualizarInfoAgendamento();
  }
  /* ─── FIM: renderizarCarrinho ──────────────────────────────── */

  /* ─── INÍCIO: modificarQtdCarrinho ─────────────────────────── */
  function modificarQtdCarrinho(idProduto, delta) {
    const item = cestaCompras.find((i) => String(i.id) === String(idProduto));
    if (!item) return;

    if (item.quantidade + delta <= 0) {
      solicitarRemocaoItemCarrinho(item.id, item.nome);
      return;
    }

    item.quantidade += delta;
    renderizarCarrinho();
    renderizarVitrine(catalogoFiltrado, 'produtos-container');
    atualizarBarraFlutuanteSacola();
    salvarCarrinhoLocal();
  }
  /* ─── FIM: modificarQtdCarrinho ────────────────────────────── */

  /* ─── INÍCIO: solicitarRemocaoItemCarrinho ─────────────────── */
  function solicitarRemocaoItemCarrinho(idProduto, nomeProduto) {
    abrirConfirmacao(
      'Remover do Carrinho',
      'Deseja realmente retirar "' + nomeProduto + '" do seu pedido?',
      () => {
        cestaCompras = cestaCompras.filter((i) => String(i.id) !== String(idProduto));
        renderizarCarrinho();
        renderizarVitrine(catalogoFiltrado, 'produtos-container');
        atualizarBarraFlutuanteSacola();
        salvarCarrinhoLocal();
        exibirToast('Item removido do carrinho.', 'info');
      }
    );
  }
  /* ─── FIM: solicitarRemocaoItemCarrinho ────────────────────── */

  /* ─── INÍCIO: atualizarBadgeCarrinho ───────────────────────── */
  function atualizarBadgeCarrinho(quantidade) {
    const n = Number(quantidade) || 0;
    const bottom = document.getElementById('cart-counter');
    const header = document.getElementById('header-cart-count');
    if (bottom) {
      bottom.textContent = n;
      bottom.dataset.zero = n === 0 ? '1' : '0';
    }
    if (header) {
      header.textContent = n;
      header.dataset.zero = n === 0 ? '1' : '0';
    }
  }
  /* ─── FIM: atualizarBadgeCarrinho ──────────────────────────── */

  /* ─── INÍCIO: atualizarBarraFlutuanteSacola ────────────────── */
  function atualizarBarraFlutuanteSacola() {
    let bar = document.getElementById('floating-cart-bar');
    const totalItens = cestaCompras.reduce((a, i) => a + i.quantidade, 0);
    const totalValor = cestaCompras.reduce((a, i) => a + (i.preco * i.quantidade), 0);

    if (totalItens > 0 && estadoSessao.papel === 'membro') {
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'floating-cart-bar';
        bar.className = 'floating-cart-bar';
        bar.setAttribute('role', 'button');
        bar.setAttribute('aria-label', 'Ver carrinho');
        bar.innerHTML = `
          <div class="floating-cart-bar__left">
            <span class="floating-cart-bar__count" id="float-cart-count">0 itens</span>
            <span class="floating-cart-bar__total" id="float-cart-total">R$ 0,00</span>
          </div>
          <div class="floating-cart-bar__cta">Ver Carrinho ➔</div>
        `;
        bar.addEventListener('click', () => navegarPara('carrinho'));
        document.body.appendChild(bar);
      }
      const countEl = document.getElementById('float-cart-count');
      const totalEl = document.getElementById('float-cart-total');
      if (countEl) countEl.textContent = totalItens + (totalItens === 1 ? ' item' : ' itens');
      if (totalEl) totalEl.textContent = fmtPreco(totalValor);
      bar.classList.remove('hidden');
    } else if (bar) {
      bar.classList.add('hidden');
    }
  }
  /* ─── FIM: atualizarBarraFlutuanteSacola ───────────────────── */

  /* ═══════════════════════════════════════════════════════════
     17. AGENDAMENTO & HORÁRIO
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: estaAberto ───────────────────────────────────── */
  function estaAberto() {
    try {
      const agora = new Date();
      const dia = agora.getDay();
      const hora = agora.getHours();
      const minuto = agora.getMinutes();

      if (!configHorario.diasFuncionamento.includes(dia)) return false;

      const minutosAgora = hora * 60 + minuto;
      const minutosAbre = configHorario.abreHora * 60 + configHorario.abreMinuto;
      const minutosFecha = configHorario.fechaHora * 60 + configHorario.fechaMinuto;

      return minutosAgora >= minutosAbre && minutosAgora <= minutosFecha;
    } catch (e) {
      return true;
    }
  }
  /* ─── FIM: estaAberto ──────────────────────────────────────── */

  /* ─── INÍCIO: atualizarInfoAgendamento ─────────────────────── */
  function atualizarInfoAgendamento() {
    const info = document.getElementById('agendamento-info');
    const grupoData = document.getElementById('grupo-data-agendamento');
    if (!info) return;

    const temAgendado = cestaCompras.some((i) => i.agendado);
    const aberto = estaAberto();

    if (!aberto || temAgendado) {
      info.classList.remove('hidden');
      const texto = document.getElementById('agendamento-info-texto');
      if (texto) {
        texto.textContent = temAgendado
          ? 'Seu pedido contém itens agendados. Você será notificado quando estiverem disponíveis.'
          : configHorario.mensagemFora + ' Seu pedido será agendado automaticamente para o próximo dia útil.';
      }
      if (grupoData && !aberto) grupoData.hidden = false;
    } else {
      info.classList.add('hidden');
      if (grupoData) grupoData.hidden = true;
    }
  }
  /* ─── FIM: atualizarInfoAgendamento ────────────────────────── */

  /* ─── INÍCIO: carregarHorarioServidor ──────────────────────── */
  async function carregarHorarioServidor() {
    try {
      const res = await executarRequisicaoAPI('obter_horario_funcionamento');
      if (res.sucesso && res.horario) {
        configHorario = { ...HORARIO_PADRAO, ...res.horario };
      }
    } catch (e) {}
    atualizarInfoAgendamento();
  }
  /* ─── FIM: carregarHorarioServidor ─────────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     18. PIX
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: tratarCriacaoPedido ──────────────────────────── */
  async function tratarCriacaoPedido() {
    if (cestaCompras.length === 0) {
      exibirToast('Sua cesta está vazia.', 'error');
      return;
    }

    if (estadoSessao.papel !== 'membro') {
      exibirToast('Faça login para finalizar.', 'info');
      abrirModal('modal-login');
      return;
    }

    const metodoEl = document.getElementById('metodo-pagamento');
    const obsEl = document.getElementById('obs-pedido');
    const metodo = metodoEl ? metodoEl.value : 'PIX';
    const obs = obsEl ? obsEl.value.trim() : '';
    const temAgendado = cestaCompras.some((i) => i.agendado);

    let dataAgendamento = null;
    if (!estaAberto()) {
      const sel = document.getElementById('data-agendamento');
      if (sel && sel.value === 'escolher') {
        const custom = document.getElementById('data-agendamento-custom');
        if (custom && custom.value) dataAgendamento = custom.value;
      } else {
        dataAgendamento = calcularProximoDiaUtil();
      }
    }

    botaoCarregando('btn-confirmar-pedido', true);
    mostrarLoader('Processando pedido seguro…');

    const resp = await executarRequisicaoAPI('criar_pedido', {
      itens: cestaCompras.map((i) => ({
        id: i.id,
        quantidade: i.quantidade,
        agendado: !!i.agendado,
      })),
      metodoPagamento: metodo,
      observacoes: obs,
      agendado: temAgendado || !estaAberto(),
      dataAgendamento,
    });

    esconderLoader();
    botaoCarregando('btn-confirmar-pedido', false);

    if (!resp.sucesso) {
      exibirToast(resp.mensagem || 'Não foi possível gerar o pedido.', 'error');
      return;
    }

    cestaCompras = [];
    atualizarBadgeCarrinho(0);
    atualizarBarraFlutuanteSacola();
    salvarCarrinhoLocal();

    await mostrarMomento(
      'Pedido criado! 🎉',
      'Geramos sua chave PIX. Copie e pague para liberar.',
      'success',
      2200
    );

    navegarPara('meus-pedidos');
    setTimeout(() => abrirCobrancaPedido(resp.idPedido, metodo), 400);
  }
  /* ─── FIM: tratarCriacaoPedido ─────────────────────────────── */

  /* ─── INÍCIO: calcularProximoDiaUtil ───────────────────────── */
  function calcularProximoDiaUtil() {
    const d = new Date();
    for (let i = 1; i <= 7; i++) {
      d.setDate(d.getDate() + 1);
      if (configHorario.diasFuncionamento.includes(d.getDay())) {
        return d.toISOString().split('T')[0];
      }
    }
    return d.toISOString().split('T')[0];
  }
  /* ─── FIM: calcularProximoDiaUtil ──────────────────────────── */

  /* ─── INÍCIO: abrirCobrancaPedido ──────────────────────────── */
  async function abrirCobrancaPedido(idPedido, metodo) {
    mostrarLoader('Gerando chave PIX…');
    const resp = await executarRequisicaoAPI('gerar_pagamento', {
      idPedido,
      metodo: metodo || 'PIX',
    });
    esconderLoader();

    if (!resp.sucesso) {
      exibirToast(resp.mensagem || 'Erro na cobrança.', 'error');
      return;
    }

    const cobranca = resp.cobranca;
    const caixa = document.createElement('div');
    caixa.style.cssText = 'text-align:center;padding:6px;';

    const imgQr = document.createElement('img');
    imgQr.src = cobranca.qrCodeUrl;
    imgQr.alt = 'QR Code PIX';
    imgQr.style.cssText = 'width:200px;height:200px;margin:0 auto 12px;display:block;border-radius:12px;background:#fff;padding:8px;';
    caixa.appendChild(imgQr);

    const label = document.createElement('p');
    label.style.cssText = 'font-size:0.78rem;color:var(--cor-texto-suave);margin-bottom:6px;font-weight:700;';
    label.textContent = 'Código PIX copia e cola:';
    caixa.appendChild(label);

    const inputPix = document.createElement('input');
    inputPix.type = 'text';
    inputPix.id = 'pix-copia-cola';
    inputPix.value = cobranca.pixCopiaECola;
    inputPix.readOnly = true;
    inputPix.style.cssText = 'font-size:0.72rem;margin-bottom:10px;text-align:center;width:100%;font-family:monospace;';
    caixa.appendChild(inputPix);

    const btnCopiar = document.createElement('button');
    btnCopiar.type = 'button';
    btnCopiar.className = 'btn btn-primary btn-block';
    btnCopiar.dataset.action = 'copiar-pix';
    btnCopiar.textContent = '📋 Copiar Código PIX';
    caixa.appendChild(btnCopiar);

    abrirConfirmacaoElemento('💳 Pagamento PIX', caixa, () => {
      carregarMeusPedidos();
    });
  }
  /* ─── FIM: abrirCobrancaPedido ─────────────────────────────── */

  /* ─── INÍCIO: copiarPixCopiaECola ──────────────────────────── */
  async function copiarPixCopiaECola(btnEl) {
    const input = document.getElementById('pix-copia-cola');
    if (!input) return;

    const ok = await copiarTextoSeguro(input.value);

    if (ok && btnEl) {
      const original = btnEl.textContent;
      btnEl.textContent = '✓ Copiado!';
      btnEl.classList.add('btn-adicionado');
      setTimeout(() => {
        btnEl.textContent = original;
        btnEl.classList.remove('btn-adicionado');
      }, 2200);
    }

    if (ok) exibirToast('Código PIX copiado!', 'success');
    else exibirToast('Não foi possível copiar. Selecione manualmente.', 'error');
  }
  /* ─── FIM: copiarPixCopiaECola ─────────────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     19. MEUS PEDIDOS
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: carregarMeusPedidos ──────────────────────────── */
  async function carregarMeusPedidos() {
    const container = document.getElementById('meus-pedidos-container');
    if (!container) return;
    container.innerHTML = '<div class="loading-slot">Carregando pedidos…</div>';

    const resp = await executarRequisicaoAPI('listar_meus_pedidos');
    container.innerHTML = '';

    if (!resp.sucesso || !Array.isArray(resp.pedidos) || resp.pedidos.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          <strong>Nenhum pedido ainda</strong>
          <span>Seus pedidos aparecerão aqui.</span>
        </div>
      `;
      return;
    }

    estadoSessao.pedidosRecentes = resp.pedidos;

    resp.pedidos.forEach((p) => {
      const st = String(p.status || '').toLowerCase();
      const s1 = ['solicitados', 'viagem', 'concluido'].includes(st);
      const s2 = ['viagem', 'concluido'].includes(st);
      const s3 = st === 'concluido';

      const card = document.createElement('div');
      card.className = 'card';

      const itensTexto = extrairItensTexto(p.itensJson);

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <h4 style="margin:0;">Pedido #${escaparHtml(p.id)}</h4>
          <strong style="color:var(--cor-primaria-profunda);font-size:1.1rem;">${fmtPreco(p.total)}</strong>
        </div>
        <p style="font-size:0.78rem;color:var(--cor-texto-suave);margin-top:4px;">
          ${escaparHtml(itensTexto || 'Sem itens')}
        </p>
        ${p.agendado ? '<span class="badge-etapa badge-etapa-analise" style="margin-top:6px;display:inline-block;">📅 Agendado para ' + formatarDataBR(p.dataAgendamento) + '</span>' : ''}
        <div class="order-stepper-clean">
          <div class="step-item ${s1 ? 'concluido' : (st === 'analise' ? 'ativo' : '')}">
            <div class="step-circulo">${s1 ? '✓' : '1'}</div>
            <span>Pagamento</span>
          </div>
          <div class="step-item ${s2 ? 'concluido' : (st === 'solicitados' ? 'ativo' : '')}">
            <div class="step-circulo">${s2 ? '✓' : '2'}</div>
            <span>Preparo</span>
          </div>
          <div class="step-item ${s3 ? 'concluido' : (st === 'viagem' ? 'ativo' : '')}">
            <div class="step-circulo">${s3 ? '✓' : '3'}</div>
            <span>Pronto</span>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
          ${st === 'analise' ? `
            <button type="button" class="btn btn-success btn-sm btn-pix-abrir" data-id="${escaparHtml(p.id)}">
              💳 Pagar PIX
            </button>
          ` : ''}
          <button type="button" class="btn btn-whatsapp btn-sm" style="flex:1;" data-action="enviar-comprovante" data-id="${escaparHtml(p.id)}">
            📲 Enviar Comprovante
          </button>
        </div>
      `;

      const btnPix = card.querySelector('.btn-pix-abrir');
      if (btnPix) {
        btnPix.addEventListener('click', () => abrirCobrancaPedido(p.id, p.metodo));
      }

      container.appendChild(card);
    });
  }
  /* ─── FIM: carregarMeusPedidos ─────────────────────────────── */

  /* ─── INÍCIO: extrairItensTexto ────────────────────────────── */
  function extrairItensTexto(itensJson) {
    if (!itensJson) return '';
    try {
      const arr = typeof itensJson === 'string' ? JSON.parse(itensJson) : itensJson;
      if (!Array.isArray(arr)) return '';
      return arr.map((i) => i.quantidade + 'x ' + i.nome).join(', ');
    } catch (e) {
      return '';
    }
  }
  /* ─── FIM: extrairItensTexto ───────────────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     20. REPETIR PEDIDO
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: mostrarBannerRepetirPedido ───────────────────── */
  function mostrarBannerRepetirPedido() {
    const container = document.getElementById('view-vitrine');
    if (!container) return;

    const antigo = document.getElementById('banner-repetir-pedido');
    if (antigo) antigo.remove();

    try {
      if (localStorage.getItem(CHAVES.BANNER_REPETIR) === '1') return;
    } catch (e) {}

    if (estadoSessao.papel !== 'membro') return;
    if (!estadoSessao.pedidosRecentes || estadoSessao.pedidosRecentes.length === 0) return;

    const ultimo = estadoSessao.pedidosRecentes[0];
    const itens = extrairItensTexto(ultimo.itensJson);

    const banner = document.createElement('div');
    banner.id = 'banner-repetir-pedido';
    banner.className = 'repeat-order-banner';
    banner.innerHTML = `
      <div class="repeat-order-banner__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="1 4 1 10 7 10"></polyline>
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
        </svg>
      </div>
      <div class="repeat-order-banner__info">
        <div class="repeat-order-banner__title">Repetir último pedido?</div>
        <div class="repeat-order-banner__subtitle">${escaparHtml(itens || 'Pedido #' + ultimo.id)}</div>
      </div>
      <button type="button" class="repeat-order-banner__btn" data-action="repetir-pedido" data-id="${escaparHtml(ultimo.id)}">
        Repetir
      </button>
      <button type="button" class="favorite-btn" style="position:static;margin-left:4px;"
              data-action="fechar-banner-repetir"
              aria-label="Fechar banner" title="Não mostrar de novo">×</button>
    `;

    const header = container.querySelector('.screen-header');
    if (header) header.insertAdjacentElement('afterend', banner);
    else container.insertBefore(banner, container.firstChild);
  }
  /* ─── FIM: mostrarBannerRepetirPedido ──────────────────────── */

  /* ─── INÍCIO: repetirUltimoPedido ──────────────────────────── */
  async function repetirUltimoPedido(idPedido) {
    if (estadoSessao.papel !== 'membro') {
      exibirToast('Faça login para repetir.', 'info');
      return;
    }

    const pedido = (estadoSessao.pedidosRecentes || []).find((p) => String(p.id) === String(idPedido))
      || estadoSessao.pedidosRecentes[0];

    if (!pedido) {
      exibirToast('Nenhum pedido para repetir.', 'error');
      return;
    }

    let itensDoPedido = [];
    try {
      const arr = typeof pedido.itensJson === 'string' ? JSON.parse(pedido.itensJson) : pedido.itensJson;
      if (Array.isArray(arr)) itensDoPedido = arr;
    } catch (e) {}

    if (itensDoPedido.length === 0) {
      exibirToast('Não foi possível carregar os itens.', 'error');
      return;
    }

    let adicionados = 0;
    itensDoPedido.forEach((it) => {
      const produto = catalogoProdutos.find((p) => String(p.id) === String(it.id));
      if (!produto) return;

      const existente = cestaCompras.find((c) => String(c.id) === String(it.id));
      if (existente) {
        existente.quantidade += Number(it.quantidade) || 1;
      } else {
        cestaCompras.push({
          id: produto.id,
          nome: produto.nome,
          preco: Number(produto.preco),
          quantidade: Number(it.quantidade) || 1,
          agendado: false,
        });
      }
      adicionados += 1;
    });

    if (adicionados === 0) {
      exibirToast('Os produtos deste pedido não estão mais disponíveis.', 'error');
      return;
    }

    const total = cestaCompras.reduce((a, i) => a + i.quantidade, 0);
    atualizarBadgeCarrinho(total);
    atualizarBarraFlutuanteSacola();
    salvarCarrinhoLocal();

    exibirToast('Itens adicionados ao carrinho!', 'success');
    navegarPara('carrinho');
  }
  /* ─── FIM: repetirUltimoPedido ─────────────────────────────── */

  /* ─── INÍCIO: fecharBannerRepetirPedido ────────────────────── */
  function fecharBannerRepetirPedido() {
    const banner = document.getElementById('banner-repetir-pedido');
    if (banner) banner.remove();
    try { localStorage.setItem(CHAVES.BANNER_REPETIR, '1'); } catch (e) {}
  }
  /* ─── FIM: fecharBannerRepetirPedido ───────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     21. WHATSAPP / COMPROVANTE
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: enviarComprovanteWhatsApp ────────────────────── */
  function enviarComprovanteWhatsApp(idPedido) {
    const pedido = (estadoSessao.pedidosRecentes || []).find((p) => String(p.id) === String(idPedido));
    const itens = pedido ? extrairItensTexto(pedido.itensJson) : idPedido;
    const total = pedido ? fmtPreco(pedido.total) : '—';

    const texto = [
      '*COMPROVANTE DE PAGAMENTO*',
      '───────────────────────',
      '*Pedido:* ' + itens,
      '*Cliente:* ' + estadoSessao.nomeUsuario,
      '*Valor Total:* ' + total,
      '*Forma:* PIX',
      '───────────────────────',
      'Envio em anexo o comprovante para liberação!',
    ].join('\n');

    const url = 'https://wa.me/' + WHATSAPP_SUPORTE + '?text=' + encodeURIComponent(texto);
    window.open(url, '_blank');
  }
  /* ─── FIM: enviarComprovanteWhatsApp ───────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     22. ADM — PAINEL CENTRAL
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: carregarPainelCentralAdm ─────────────────────── */
  async function carregarPainelCentralAdm() {
    if (estadoSessao.papel !== 'adm') return;

    await consultarStatusAcessoSistema();

    const divSolic = document.getElementById('adm-solicitacoes-lista');
    if (divSolic) divSolic.innerHTML = '<div class="loading-slot">Buscando cadastros…</div>';

    const resp = await executarRequisicaoAPI('listar_solicitacoes_adm');
    const pendentes = (resp.sucesso && Array.isArray(resp.solicitacoes)) ? resp.solicitacoes : [];
    atualizarBadgePendentesAdm(pendentes.length);

    if (divSolic) {
      divSolic.innerHTML = '';
      if (pendentes.length === 0) {
        divSolic.innerHTML = '<div class="loading-slot">Nenhuma solicitação pendente.</div>';
      } else {
        pendentes.forEach((s) => {
          const linha = document.createElement('div');
          linha.style.cssText = 'padding:12px 0;border-bottom:1px solid var(--cor-borda);display:flex;align-items:flex-start;gap:10px;';
          linha.innerHTML = `
            <div style="flex:1;min-width:0;">
              <p style="margin:0;"><strong>${escaparHtml(s.nome)}</strong></p>
              <p style="font-size:0.76rem;color:var(--cor-texto-suave);margin:2px 0 0;">
                📱 ${escaparHtml(s.telefone)} · ${s.idade || '18+'} anos
              </p>
              <p style="font-size:0.74rem;color:var(--cor-texto-fraco);margin:2px 0 0;">
                Indicado por: <strong>${escaparHtml(s.indicadoPor || '—')}</strong>
                ${s.indicadoTel ? '(' + escaparHtml(s.indicadoTel) + ')' : ''}
              </p>
            </div>
            <button type="button" class="btn btn-success btn-sm"
                    data-action="aprovar-solicitacao" data-id="${escaparHtml(s.id)}">
              Aprovar
            </button>
          `;
          divSolic.appendChild(linha);
        });
      }
    }

    const respMet = await executarRequisicaoAPI('obter_metricas_vendas');
    if (respMet.sucesso) {
      const elFat = document.getElementById('metric-faturamento');
      const elPed = document.getElementById('metric-pedidos');
      if (elFat) elFat.textContent = fmtPreco(respMet.faturamentoTotal || 0);
      if (elPed) elPed.textContent = respMet.totalPedidos || 0;

      const tabela = document.getElementById('tabela-metricas-produtos');
      if (tabela) {
        const itens = respMet.itensDetalhados || [];
        if (itens.length === 0) {
          tabela.innerHTML = '<div class="loading-slot">Sem vendas registradas.</div>';
        } else {
          let html = '<table class="tabela-metricas"><thead><tr><th>Produto</th><th>Qtd</th></tr></thead><tbody>';
          itens.forEach((it) => {
            html += '<tr><td>' + escaparHtml(it.nome) + '</td><td><strong>' + (Number(it.quantidadeVendida) || 0) + '</strong></td></tr>';
          });
          html += '</tbody></table>';
          tabela.innerHTML = html;
        }
      }
    }
  }
  /* ─── FIM: carregarPainelCentralAdm ────────────────────────── */

  /* ─── INÍCIO: atualizarBadgePendentesAdm ───────────────────── */
  function atualizarBadgePendentesAdm(qtd) {
    const botao = document.querySelector('.bottom-nav__item[data-view="adm"]');
    if (!botao) return;

    botao.querySelectorAll('.badge-pendentes').forEach((b) => b.remove());

    if (qtd > 0) {
      const span = document.createElement('span');
      span.className = 'badge-pendentes';
      span.textContent = qtd;
      span.style.cssText =
        'display:inline-block;min-width:18px;margin-left:6px;padding:0 5px;' +
        'background:var(--cor-primaria);color:#fff;border-radius:999px;' +
        'font-size:.65rem;font-weight:800;text-align:center;line-height:18px;';
      botao.appendChild(span);
    }
  }
  /* ─── FIM: atualizarBadgePendentesAdm ──────────────────────── */

  /* ─── INÍCIO: aprovarMembroAdm ─────────────────────────────── */
  async function aprovarMembroAdm(idSolicitacao) {
    mostrarLoader('Aprovando membro…');
    const resp = await executarRequisicaoAPI('aprovar_cadastro', { idSolicitacao });
    esconderLoader();

    if (resp.sucesso) {
      exibirToast(resp.mensagem || 'Membro aprovado!', 'success');
      await carregarPainelCentralAdm();
    } else {
      exibirToast(resp.mensagem || 'Erro ao aprovar.', 'error');
    }
  }
  /* ─── FIM: aprovarMembroAdm ────────────────────────────────── */

  /* ─── INÍCIO: consultarStatusAcessoSistema ─────────────────── */
  async function consultarStatusAcessoSistema() {
    if (estadoSessao.papel !== 'adm') return;
    const resp = await executarRequisicaoAPI('obter_status_sistema');
    if (resp.sucesso && resp.modoAcesso) atualizarVisualModoAcesso(resp.modoAcesso);
  }
  /* ─── FIM: consultarStatusAcessoSistema ────────────────────── */

  /* ─── INÍCIO: alternarModoAcessoSistema ────────────────────── */
  async function alternarModoAcessoSistema(novoModo) {
    if (estadoSessao.papel !== 'adm') return;
    mostrarLoader('Alterando modo…');
    const resp = await executarRequisicaoAPI('alterar_modo_acesso', { novoModo });
    esconderLoader();

    if (resp.sucesso) {
      exibirToast(resp.mensagem, 'success');
      atualizarVisualModoAcesso(resp.modo);
    } else {
      exibirToast(resp.mensagem || 'Não foi possível alterar.', 'error');
    }
  }
  /* ─── FIM: alternarModoAcessoSistema ───────────────────────── */

  /* ─── INÍCIO: atualizarVisualModoAcesso ────────────────────── */
  function atualizarVisualModoAcesso(modo) {
    const badge = document.getElementById('badge-modo-acesso-adm');
    const btnLock = document.getElementById('btn-lockdown-adm');
    const btnPadrao = document.getElementById('btn-padrao-adm');
    if (!badge) return;

    if (modo === 'APENAS_ADM') {
      badge.textContent = 'BLOQUEADO (APENAS ADM)';
      badge.className = 'badge badge-adm';
      if (btnLock) btnLock.classList.add('hidden');
      if (btnPadrao) btnPadrao.classList.remove('hidden');
    } else {
      badge.textContent = 'LIBERADO (PADRÃO)';
      badge.className = 'badge badge-membro';
      if (btnLock) btnLock.classList.remove('hidden');
      if (btnPadrao) btnPadrao.classList.add('hidden');
    }
  }
  /* ─── FIM: atualizarVisualModoAcesso ───────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     23. ADM — GAVETAS
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: alternarGavetaAdm ────────────────────────────── */
  function alternarGavetaAdm(tipo) {
    const dM = document.getElementById('drawer-membros');
    const dB = document.getElementById('drawer-bloqueados');
    const bM = document.querySelector('[data-gaveta="membros"]');
    const bB = document.querySelector('[data-gaveta="bloqueados"]');
    if (!dM || !dB) return;

    if (tipo === 'membros') {
      dB.classList.add('hidden');
      if (bB) bB.classList.remove('ativo');
      dM.classList.toggle('hidden');
      if (bM) bM.classList.toggle('ativo');
      if (!dM.classList.contains('hidden')) carregarListaMembrosGaveta();
    } else {
      dM.classList.add('hidden');
      if (bM) bM.classList.remove('ativo');
      dB.classList.toggle('hidden');
      if (bB) bB.classList.toggle('ativo');
      if (!dB.classList.contains('hidden')) carregarListaBloqueadosGaveta();
    }
  }
  /* ─── FIM: alternarGavetaAdm ───────────────────────────────── */

  /* ─── INÍCIO: carregarListaMembrosGaveta ───────────────────── */
  async function carregarListaMembrosGaveta() {
    const cont = document.getElementById('adm-membros-gaveta-lista');
    if (!cont) return;
    cont.innerHTML = '<div class="loading-slot">Carregando…</div>';

    const resp = await executarRequisicaoAPI('listar_usuarios_adm');
    cont.innerHTML = '';

    if (resp.sucesso && Array.isArray(resp.usuarios) && resp.usuarios.length > 0) {
      let html = '<table class="tabela-metricas"><thead><tr><th>Nome</th><th>WhatsApp</th><th>Idade</th><th>Ações</th></tr></thead><tbody>';
      resp.usuarios.forEach((u) => {
        html += '<tr>' +
          '<td><strong>' + escaparHtml(u.primeiroNome) + '</strong></td>' +
          '<td>' + escaparHtml(u.telefone) + '</td>' +
          '<td>' + (u.idade || '—') + '</td>' +
          '<td style="white-space:nowrap;">' +
            '<button class="btn btn-danger-outline btn-sm" data-action="bloquear-usuario" data-id="' + escaparHtml(u.id) + '" data-nome="' + escaparHtml(u.primeiroNome) + '">🔒</button> ' +
            '<button class="btn btn-ghost btn-sm" style="color:var(--cor-perigo);" data-action="excluir-usuario" data-id="' + escaparHtml(u.id) + '">🗑️</button>' +
          '</td>' +
        '</tr>';
      });
      html += '</tbody></table>';
      cont.innerHTML = html;
    } else {
      cont.innerHTML = '<div class="loading-slot">Nenhum membro registrado.</div>';
    }
  }
  /* ─── FIM: carregarListaMembrosGaveta ──────────────────────── */

  /* ─── INÍCIO: bloquearUsuarioComMotivo ─────────────────────── */
  async function bloquearUsuarioComMotivo(idUsuario, nome) {
    const motivo = prompt('Motivo do bloqueio para ' + (nome || idUsuario) + ':');
    if (!motivo || !motivo.trim()) return;

    mostrarLoader('Bloqueando…');
    const resp = await executarRequisicaoAPI('bloquear_usuario_motivo_adm', {
      identificador: idUsuario,
      motivo: motivo.trim(),
    });
    esconderLoader();

    if (resp.sucesso) {
      exibirToast('Usuário bloqueado.', 'success');
      carregarListaMembrosGaveta();
      carregarListaBloqueadosGaveta();
    } else {
      exibirToast(resp.mensagem || 'Erro ao bloquear.', 'error');
    }
  }
  /* ─── FIM: bloquearUsuarioComMotivo ────────────────────────── */

  /* ─── INÍCIO: excluirUsuarioMembro ─────────────────────────── */
  async function excluirUsuarioMembro(idUsuario) {
    abrirConfirmacao(
      'Excluir usuário',
      'Deseja realmente excluir permanentemente este usuário?',
      async () => {
        mostrarLoader('Excluindo…');
        const resp = await executarRequisicaoAPI('excluir_usuario_adm', { idUsuario });
        esconderLoader();

        if (resp.sucesso) {
          exibirToast('Usuário removido.', 'success');
          carregarListaMembrosGaveta();
        } else {
          exibirToast(resp.mensagem || 'Erro ao excluir.', 'error');
        }
      }
    );
  }
  /* ─── FIM: excluirUsuarioMembro ────────────────────────────── */

  /* ─── INÍCIO: carregarListaBloqueadosGaveta ────────────────── */
  async function carregarListaBloqueadosGaveta() {
    const cont = document.getElementById('adm-bloqueados-gaveta-lista');
    const badge = document.getElementById('cont-bloqueados-badge');
    if (!cont) return;

    cont.innerHTML = '<div class="loading-slot">Carregando…</div>';
    const resp = await executarRequisicaoAPI('listar_bloqueados_adm');
    cont.innerHTML = '';

    if (resp.sucesso && Array.isArray(resp.contas)) {
      if (badge) badge.textContent = resp.contas.length;

      if (resp.contas.length === 0) {
        cont.innerHTML = '<div class="loading-slot">Nenhum bloqueio registrado.</div>';
        return;
      }

      resp.contas.forEach((c) => {
        const linha = document.createElement('div');
        linha.style.cssText = 'padding:10px 0;border-bottom:1px solid var(--cor-borda);display:flex;justify-content:space-between;align-items:center;gap:8px;';
        linha.innerHTML =
          '<div style="min-width:0;">' +
            '<strong style="color:var(--cor-perigo);">' + escaparHtml(c.identificador) + '</strong><br>' +
            '<small style="color:var(--cor-texto-suave);">Motivo: ' + escaparHtml(c.motivo || 'Administrativo') + '</small>' +
          '</div>' +
          '<button class="btn btn-primary btn-sm" data-action="liberar-usuario" data-id="' + escaparHtml(c.identificador) + '">Desbloquear</button>';
        cont.appendChild(linha);
      });
    }
  }
  /* ─── FIM: carregarListaBloqueadosGaveta ───────────────────── */

  /* ─── INÍCIO: liberarContaUsuarioAdm ───────────────────────── */
  async function liberarContaUsuarioAdm(id) {
    mostrarLoader('Liberando…');
    const resp = await executarRequisicaoAPI('liberar_conta_adm', { identificador: id });
    esconderLoader();

    if (resp.sucesso) {
      exibirToast(resp.mensagem || 'Conta liberada.', 'success');
      carregarListaBloqueadosGaveta();
    } else {
      exibirToast(resp.mensagem || 'Erro.', 'error');
    }
  }
  /* ─── FIM: liberarContaUsuarioAdm ──────────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     24. ADM — ESTEIRA
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: carregarPedidosAdm ───────────────────────────── */
  async function carregarPedidosAdm(silencioso = false) {
    const colA = document.getElementById('pipe-analise');
    const colS = document.getElementById('pipe-solicitados');
    const colC = document.getElementById('pipe-concluido');
    if (!colA || !colS || !colC) return;

    if (!silencioso) {
      [colA, colS, colC].forEach((c) => { c.innerHTML = '<div class="loading-slot">…</div>'; });
    }

    const resp = await executarRequisicaoAPI('listar_pedidos_adm');
    if (!resp.sucesso || !Array.isArray(resp.pedidos)) return;

    [colA, colS, colC].forEach((c) => { c.innerHTML = ''; });

    const ordenados = resp.pedidos
      .filter((p) => p.status !== 'arquivado')
      .sort((a, b) => new Date(a.criadoEm || 0) - new Date(b.criadoEm || 0));

    ordenados.forEach((p) => {
      const hora = formatarHora(p.criadoEm);
      const itens = extrairItensTexto(p.itensJson);

      const comanda = document.createElement('div');
      comanda.className = 'comanda-card comanda-' + p.status;

      if (p.status === 'concluido') {
        comanda.innerHTML =
          '<div class="comanda-header" data-toggle="1">' +
            '<div>' +
              '<strong>#' + escaparHtml(p.id) + '</strong> ' +
              '<span style="color:var(--cor-sucesso-escura);font-weight:800;margin-left:6px;">' + fmtPreco(p.total) + '</span>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
              '<small style="color:var(--cor-texto-suave);">' + hora + '</small>' +
              '<span class="badge-etapa badge-etapa-concluido">✅</span>' +
            '</div>' +
          '</div>' +
          '<div class="comanda-body">' +
            '<p><strong>Forma:</strong> ' + escaparHtml(p.metodo || 'PIX') + '</p>' +
            '<p style="color:var(--cor-texto-suave);margin:4px 0;"><strong>Itens:</strong> ' + escaparHtml(itens || '—') + '</p>' +
            '<div style="display:flex;gap:6px;margin-top:8px;">' +
              '<button type="button" class="btn btn-danger-outline btn-sm" data-action="cancelar-pedido" data-id="' + escaparHtml(p.id) + '">🗑️ Excluir</button>' +
            '</div>' +
          '</div>';
      } else {
        comanda.innerHTML =
          '<div class="comanda-header" data-toggle="1">' +
            '<div>' +
              '<strong>#' + escaparHtml(p.id) + '</strong> ' +
              '<small style="color:var(--cor-texto-suave);">(' + hora + ')</small>' +
            '</div>' +
            '<div>' +
              '<span class="badge-etapa badge-etapa-' + p.status + '">' +
                (p.status === 'analise' ? '⏳ Pagamento' : '👩‍🍳 Preparo') +
              '</span>' +
            '</div>' +
          '</div>' +
          '<div class="comanda-body">' +
            '<p><strong>Total:</strong> ' + fmtPreco(p.total) + ' | ' + escaparHtml(p.metodo || 'PIX') + '</p>' +
            '<p style="color:var(--cor-texto-suave);margin:4px 0;"><strong>Itens:</strong> ' + escaparHtml(itens || '—') + '</p>' +
            '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">' +
              '<button type="button" class="btn btn-primary btn-sm" data-action="avancar-status" data-id="' + escaparHtml(p.id) + '" data-status="' + escaparHtml(p.status) + '">Avançar ➔</button>' +
              '<button type="button" class="btn btn-danger-outline btn-sm" data-action="cancelar-pedido" data-id="' + escaparHtml(p.id) + '">Cancelar</button>' +
            '</div>' +
          '</div>';
      }

      const header = comanda.querySelector('.comanda-header');
      if (header) header.addEventListener('click', () => comanda.classList.toggle('expandida'));

      if (p.status === 'analise') colA.appendChild(comanda);
      else if (p.status === 'solicitados') colS.appendChild(comanda);
      else if (p.status === 'concluido') colC.appendChild(comanda);
    });

    [colA, colS, colC].forEach((c) => {
      if (c && c.children.length === 0) {
        c.innerHTML = '<div class="loading-slot" style="font-size:.76rem;">Vazio</div>';
      }
    });
  }
  /* ─── FIM: carregarPedidosAdm ──────────────────────────────── */

  /* ─── INÍCIO: avancarStatusAdm ─────────────────────────────── */
  async function avancarStatusAdm(idPedido, statusAtual) {
    let proximo = 'solicitados';
    if (statusAtual === 'solicitados') proximo = 'concluido';

    const resp = await executarRequisicaoAPI('atualizar_status_pedido', {
      idPedido,
      novoStatus: proximo,
    });

    if (resp.sucesso) {
      exibirToast('Comanda atualizada!', 'success');
      await carregarPedidosAdm(true);
    } else {
      exibirToast(resp.mensagem || 'Erro ao atualizar.', 'error');
    }
  }
  /* ─── FIM: avancarStatusAdm ────────────────────────────────── */

  /* ─── INÍCIO: cancelarExcluirPedidoAdm ─────────────────────── */
  function cancelarExcluirPedidoAdm(idPedido) {
    abrirConfirmacao(
      'Cancelar Pedido',
      'Excluir permanentemente o Pedido #' + idPedido + '?',
      async () => {
        mostrarLoader('Cancelando…');
        const resp = await executarRequisicaoAPI('cancelar_pedido_adm', { idPedido });
        esconderLoader();

        if (resp.sucesso) {
          exibirToast(resp.mensagem || 'Pedido cancelado.', 'success');
          await carregarPedidosAdm(true);
        } else {
          exibirToast(resp.mensagem || 'Erro ao cancelar.', 'error');
        }
      }
    );
  }
  /* ─── FIM: cancelarExcluirPedidoAdm ────────────────────────── */

  /* ─── INÍCIO: limparConcluidosAdm ──────────────────────────── */
  function limparConcluidosAdm() {
    abrirConfirmacao(
      'Limpar Concluídos',
      'Deseja limpar as comandas concluídas da esteira? O faturamento permanece nas métricas.',
      async () => {
        mostrarLoader('Limpando…');
        const resp = await executarRequisicaoAPI('limpar_pedidos_concluidos_adm');
        esconderLoader();

        if (resp.sucesso) {
          exibirToast(resp.mensagem || 'Comandas limpas.', 'success');
          await carregarPedidosAdm(true);
        }
      }
    );
  }
  /* ─── FIM: limparConcluidosAdm ─────────────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     25. ADM — PRODUTOS
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: processarUploadImagem ────────────────────────── */
  function processarUploadImagem(evento) {
    const arquivo = evento.target.files[0];
    if (!arquivo) return;

    if (arquivo.size > 5 * 1024 * 1024) {
      exibirToast('Imagem muito grande (máx 5MB).', 'error');
      return;
    }

    const leitor = new FileReader();
    leitor.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const LIMITE = 500;
        let { width: w, height: h } = img;

        if (w > h && w > LIMITE) {
          h *= LIMITE / w;
          w = LIMITE;
        } else if (h >= w && h > LIMITE) {
          w *= LIMITE / h;
          h = LIMITE;
        }

        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        fotoBase64Temporaria = canvas.toDataURL('image/jpeg', 0.75);
        exibirPreviewImagem(fotoBase64Temporaria);
      };
      img.src = e.target.result;
    };
    leitor.readAsDataURL(arquivo);
  }
  /* ─── FIM: processarUploadImagem ───────────────────────────── */

  /* ─── INÍCIO: exibirPreviewImagem ──────────────────────────── */
  function exibirPreviewImagem(src) {
    const img = document.getElementById('img-preview');
    const container = document.getElementById('preview-container');
    if (img) img.src = src;
    if (container) container.classList.remove('hidden');
  }
  /* ─── FIM: exibirPreviewImagem ─────────────────────────────── */

  /* ─── INÍCIO: removerFotoCarregada ─────────────────────────── */
  function removerFotoCarregada() {
    fotoBase64Temporaria = '';
    const container = document.getElementById('preview-container');
    const input = document.getElementById('adm-prod-arquivo');
    const img = document.getElementById('img-preview');

    if (container) container.classList.add('hidden');
    if (input) input.value = '';
    if (img) img.src = '';
  }
  /* ─── FIM: removerFotoCarregada ────────────────────────────── */

  /* ─── INÍCIO: tratarCadastroProduto ────────────────────────── */
  async function tratarCadastroProduto(evento) {
    if (evento && evento.preventDefault) evento.preventDefault();

    const nome = document.getElementById('adm-prod-nome').value.trim();
    const precoStr = String(document.getElementById('adm-prod-preco').value || '').replace(',', '.');
    const preco = parseFloat(precoStr);
    const estoque = parseInt(document.getElementById('adm-prod-estoque').value, 10);
    const comportamento = document.getElementById('adm-prod-estoque-comportamento').value;
    const categoria = document.getElementById('adm-prod-categoria').value.trim();
    const visibilidade = document.getElementById('adm-prod-visibilidade').value;
    const urlExterna = document.getElementById('adm-prod-foto-url').value.trim();

    const fotoFinal = fotoBase64Temporaria || urlExterna || '';

    if (!nome || isNaN(preco) || preco <= 0) {
      exibirToast('Preencha nome e preço válidos.', 'error');
      return;
    }

    botaoCarregando('btn-salvar-produto', true);
    mostrarLoader('Salvando produto…');

    const resp = await executarRequisicaoAPI('cadastrar_produto', {
      produto: {
        nome,
        preco,
        estoque: isNaN(estoque) ? 0 : estoque,
        estoque_comportamento: comportamento,
        categoria,
        foto: fotoFinal,
        visibilidade,
      },
    });

    esconderLoader();
    botaoCarregando('btn-salvar-produto', false);

    if (resp.sucesso) {
      exibirToast('Produto publicado!', 'success');
      document.getElementById('form-novo-produto').reset();
      removerFotoCarregada();
      CacheLoja.limpar(CACHE_KEYS.PRODUTOS('adm'));
      CacheLoja.limpar(CACHE_KEYS.PRODUTOS('membro'));
      CacheLoja.limpar(CACHE_KEYS.PRODUTOS('visitante'));
      await sincronizarProdutosServidor();
    } else {
      exibirToast(resp.mensagem || 'Erro ao salvar.', 'error');
    }
  }
  /* ─── FIM: tratarCadastroProduto ───────────────────────────── */

  /* ─── INÍCIO: alterarVisibilidadeProdutoAdm ────────────────── */
  async function alterarVisibilidadeProdutoAdm(idProduto, nova) {
    mostrarLoader('Alterando visibilidade…');
    const resp = await executarRequisicaoAPI('alterar_visibilidade_produto', {
      idProduto,
      novaVisibilidade: nova,
    });
    esconderLoader();

    if (resp.sucesso) {
      exibirToast(resp.mensagem || 'Visibilidade atualizada!', 'success');
      CacheLoja.limpar(CACHE_KEYS.PRODUTOS('adm'));
      CacheLoja.limpar(CACHE_KEYS.PRODUTOS('membro'));
      CacheLoja.limpar(CACHE_KEYS.PRODUTOS('visitante'));
      await sincronizarProdutosServidor();
    } else {
      exibirToast(resp.mensagem || 'Erro.', 'error');
    }
  }
  /* ─── FIM: alterarVisibilidadeProdutoAdm ───────────────────── */

  /* ─── INÍCIO: confirmarExclusaoProdutoAdm ──────────────────── */
  function confirmarExclusaoProdutoAdm(id, nome) {
    abrirConfirmacao(
      'Excluir Produto',
      'Excluir permanentemente "' + nome + '"? Esta ação não pode ser desfeita.',
      () => excluirProdutoAdm(id)
    );
  }
  /* ─── FIM: confirmarExclusaoProdutoAdm ─────────────────────── */

  /* ─── INÍCIO: excluirProdutoAdm ────────────────────────────── */
  async function excluirProdutoAdm(idProduto) {
    mostrarLoader('Excluindo…');
    const resp = await executarRequisicaoAPI('excluir_produto', { idProduto });
    esconderLoader();

    if (resp.sucesso) {
      exibirToast(resp.mensagem || 'Produto excluído.', 'success');
      CacheLoja.limpar(CACHE_KEYS.PRODUTOS('adm'));
      CacheLoja.limpar(CACHE_KEYS.PRODUTOS('membro'));
      CacheLoja.limpar(CACHE_KEYS.PRODUTOS('visitante'));
      await sincronizarProdutosServidor();
    } else {
      exibirToast(resp.mensagem || 'Erro.', 'error');
    }
  }
  /* ─── FIM: excluirProdutoAdm ───────────────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     26. ADM — LINK TEMPORÁRIO
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: gerarLinkTemporarioAdm ───────────────────────── */
  async function gerarLinkTemporarioAdm() {
    const select = document.getElementById('select-duracao-link');
    const minutos = parseInt(select && select.value, 10) || 15;

    mostrarLoader('Gerando link (' + minutos + ' min)…');
    const resp = await executarRequisicaoAPI('gerar_link_temporario', { duracaoMinutos: minutos });
    esconderLoader();

    if (resp.sucesso) {
      const urlBase = window.location.origin + window.location.pathname;
      const link = urlBase + '?token=' + resp.token;
      const campo = document.getElementById('campo-link-gerado');
      const area = document.getElementById('area-link-gerado');

      if (campo) campo.value = link;
      if (area) area.classList.remove('hidden');

      exibirToast('Link gerado (' + minutos + ' min)', 'success');
    } else {
      exibirToast(resp.mensagem || 'Falha ao gerar link.', 'error');
    }
  }
  /* ─── FIM: gerarLinkTemporarioAdm ──────────────────────────── */

  /* ─── INÍCIO: copiarLinkGerado ─────────────────────────────── */
  async function copiarLinkGerado() {
    const campo = document.getElementById('campo-link-gerado');
    if (!campo) return;
    const ok = await copiarTextoSeguro(campo.value);
    if (ok) exibirToast('Link copiado!', 'success');
    else exibirToast('Não foi possível copiar.', 'error');
  }
  /* ─── FIM: copiarLinkGerado ────────────────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     27. ADM — RELATÓRIO PDF
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: gerarRelatorioPdfVendas ──────────────────────── */
  async function gerarRelatorioPdfVendas() {
    if (estadoSessao.papel !== 'adm') return;

    mostrarLoader('Gerando relatório…');
    const hoje = new Date();
    const dataRef = [
      hoje.getFullYear(),
      String(hoje.getMonth() + 1).padStart(2, '0'),
      String(hoje.getDate()).padStart(2, '0'),
    ].join('-');

    const resp = await executarRequisicaoAPI('obter_relatorio_diario_adm', { dataRef });
    esconderLoader();

    if (!resp.sucesso) {
      exibirToast(resp.mensagem || 'Erro ao carregar relatório.', 'error');
      return;
    }

    imprimirRelatorioAnaliticoIframe(resp);
  }
  /* ─── FIM: gerarRelatorioPdfVendas ─────────────────────────── */

  /* ─── INÍCIO: imprimirRelatorioAnaliticoIframe ─────────────── */
  function imprimirRelatorioAnaliticoIframe(rel) {
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const linhasItens = (rel.itens && rel.itens.length > 0)
      ? rel.itens.map((it, i) =>
          '<tr>' +
            '<td style="text-align:center;">' + (i + 1) + '</td>' +
            '<td><strong>' + escaparHtml(it.nome) + '</strong></td>' +
            '<td style="text-align:center;font-weight:bold;">' + it.quantidade + ' un</td>' +
            '<td style="text-align:right;">' + fmtPreco(it.precoUnitario) + '</td>' +
            '<td style="text-align:right;font-weight:bold;">' + fmtPreco(it.totalVendido) + '</td>' +
          '</tr>'
        ).join('')
      : '<tr><td colspan="5" style="text-align:center;padding:16px;color:#666;">Nenhum produto vendido.</td></tr>';

    const linhasPedidos = (rel.pedidos && rel.pedidos.length > 0)
      ? rel.pedidos.map((p) =>
          '<tr>' +
            '<td><strong>#' + escaparHtml(p.id) + '</strong></td>' +
            '<td style="text-align:center;">' + escaparHtml(p.hora) + '</td>' +
            '<td style="text-align:center;">' + escaparHtml(p.metodo) + '</td>' +
            '<td style="text-align:center;"><span class="tag-status">' + escaparHtml(p.status) + '</span></td>' +
            '<td style="text-align:right;font-weight:bold;">' + fmtPreco(p.total) + '</td>' +
          '</tr>'
        ).join('')
      : '<tr><td colspan="5" style="text-align:center;padding:16px;color:#666;">Nenhum pedido registrado.</td></tr>';

    const html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">' +
      '<title>Relatorio_' + rel.data.replace(/\//g, '-') + '</title>' +
      '<style>' +
        '@page { size: A4; margin: 15mm; }' +
        '* { box-sizing: border-box; font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }' +
        'body { margin: 0; color: #0f172a; font-size: 12px; }' +
        '.cabecalho { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; }' +
        '.titulo { font-size: 18px; font-weight: 800; text-transform: uppercase; }' +
        '.sub { font-size: 12px; color: #475569; margin-top: 2px; }' +
        '.meta { text-align: right; font-size: 11px; color: #475569; }' +
        '.kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }' +
        '.kpi { border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; background: #f8fafc; }' +
        '.kpi-rotulo { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; }' +
        '.kpi-valor { font-size: 18px; font-weight: 800; margin-top: 4px; }' +
        '.kpi-valor.destaque { color: #ea580c; }' +
        '.secao { font-size: 13px; font-weight: 700; text-transform: uppercase; margin: 16px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }' +
        'table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11px; }' +
        'th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }' +
        'td { border: 1px solid #e2e8f0; padding: 6px 8px; }' +
        '.tag-status { display: inline-block; padding: 2px 6px; font-size: 9px; font-weight: 700; border-radius: 4px; background: #e2e8f0; }' +
        '.rodape { margin-top: 28px; border-top: 1px dashed #cbd5e1; padding-top: 10px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b; }' +
      '</style></head><body>' +
        '<div class="cabecalho">' +
          '<div><div class="titulo">Fechamento Diário</div><div class="sub">Relatório de Vendas</div></div>' +
          '<div class="meta"><strong>Data:</strong> ' + rel.data + '<br><strong>Emitido:</strong> ' + hora + '</div>' +
        '</div>' +
        '<div class="kpi-grid">' +
          '<div class="kpi"><div class="kpi-rotulo">Faturamento</div><div class="kpi-valor destaque">' + fmtPreco(rel.faturamento) + '</div></div>' +
          '<div class="kpi"><div class="kpi-rotulo">Pedidos</div><div class="kpi-valor">' + rel.totalPedidos + '</div></div>' +
          '<div class="kpi"><div class="kpi-rotulo">Ticket Médio</div><div class="kpi-valor">' + fmtPreco(rel.ticketMedio) + '</div></div>' +
        '</div>' +
        '<div class="secao">1. Produtos Vendidos</div>' +
        '<table><thead><tr><th>#</th><th>Produto</th><th>Qtd</th><th>Preço Unit.</th><th>Total</th></tr></thead>' +
        '<tbody>' + linhasItens + '</tbody></table>' +
        '<div class="secao">2. Pedidos do Dia</div>' +
        '<table><thead><tr><th>Código</th><th>Hora</th><th>Pagto</th><th>Status</th><th>Valor</th></tr></thead>' +
        '<tbody>' + linhasPedidos + '</tbody></table>' +
        '<div class="rodape"><span>Conferência administrativa</span><span>Uso interno</span></div>' +
      '</body></html>';

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => iframe.remove(), 2000);
    }, 400);
  }
  /* ─── FIM: imprimirRelatorioAnaliticoIframe ────────────────── */

  /* ═══════════════════════════════════════════════════════════
     28. CENTRAL DE AJUDA
     ═══════════════════════════════════════════════════════════ */

  const DUVIDAS_PADRAO = {
    'como-pagar': 'Aceitamos PIX (instantâneo), Cartão de Crédito e Cripto (USDT/BTC). Após finalizar o pedido, você recebe a chave PIX para copiar e colar no app do seu banco.',
    'prazo-entrega': 'O prazo médio é de 15 a 30 minutos após a confirmação do pagamento. Você recebe uma notificação no WhatsApp quando estiver pronto.',
    'nao-recebi': 'Se passou mais de 40 minutos do pagamento, envie uma mensagem no WhatsApp com o número do pedido. Vamos verificar imediatamente.',
    'trocar-senha': 'Entre em contato pelo WhatsApp com o número cadastrado. A administração pode redefinir sua senha em minutos.',
  };

  /* ─── INÍCIO: carregarDuvidasServidor ──────────────────────── */
  async function carregarDuvidasServidor() {
    try {
      const resp = await executarRequisicaoAPI('obter_duvidas_rapidas');
      if (resp.sucesso && resp.duvidas && typeof resp.duvidas === 'object') {
        duvidasRapidas = { ...DUVIDAS_PADRAO, ...resp.duvidas };
      } else {
        duvidasRapidas = { ...DUVIDAS_PADRAO };
      }
    } catch (e) {
      duvidasRapidas = { ...DUVIDAS_PADRAO };
    }
  }
  /* ─── FIM: carregarDuvidasServidor ─────────────────────────── */

  /* ─── INÍCIO: responderDuvidaRapida ────────────────────────── */
  function responderDuvidaRapida(tag) {
    const resposta = duvidasRapidas[tag] || 'Não encontrei a resposta. Fale com a gente no WhatsApp!';
    const box = document.getElementById('ajuda-resposta');
    if (box) {
      box.innerHTML = '<strong>💡 ' + escaparHtml(tag.replace(/-/g, ' ')) + '</strong><br><br>' + escaparHtml(resposta);
      box.classList.remove('hidden');
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
  /* ─── FIM: responderDuvidaRapida ───────────────────────────── */

  /* ─── INÍCIO: tratarEnvioSugestao ──────────────────────────── */
  async function tratarEnvioSugestao(evento) {
    if (evento && evento.preventDefault) evento.preventDefault();

    const texto = document.getElementById('sugestao-texto').value.trim();
    if (texto.length < 5) {
      exibirToast('Escreva um pouco mais sobre sua sugestão.', 'error');
      return;
    }

    botaoCarregando('btn-enviar-sugestao', true);
    const resp = await executarRequisicaoAPI('enviar_sugestao', {
      texto,
      nomeUsuario: estadoSessao.nomeUsuario,
    });
    botaoCarregando('btn-enviar-sugestao', false);

    if (resp.sucesso) {
      exibirToast('Sugestão enviada! Obrigado 💛', 'success');
      const form = document.querySelector('form[data-action="enviar-sugestao"]');
      if (form) form.reset();
    } else {
      exibirToast(resp.mensagem || 'Erro ao enviar.', 'error');
    }
  }
  /* ─── FIM: tratarEnvioSugestao ─────────────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     29. AVATAR / DROPDOWN
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: atualizarAvatarUsuario ───────────────────────── */
  function atualizarAvatarUsuario() {
    const el = document.getElementById('user-initials');
    if (!el) return;

    if (!estadoSessao.nomeUsuario || estadoSessao.papel === 'visitante') {
      el.textContent = '?';
      return;
    }

    const partes = String(estadoSessao.nomeUsuario).trim().split(/\s+/);
    let sigla = (partes[0] || '?')[0];
    if (partes.length > 1) sigla += (partes[partes.length - 1] || '')[0];
    el.textContent = sigla.toUpperCase();
  }
  /* ─── FIM: atualizarAvatarUsuario ──────────────────────────── */

  /* ─── INÍCIO: toggleUserDropdown ───────────────────────────── */
  function toggleUserDropdown() {
    const dd = document.getElementById('user-dropdown');
    const btn = document.getElementById('user-avatar-btn');
    if (!dd || !btn) return;

    const aberto = !dd.classList.contains('hidden');
    if (aberto) {
      dd.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
    } else {
      dd.classList.remove('hidden');
      btn.setAttribute('aria-expanded', 'true');
    }
  }
  /* ─── FIM: toggleUserDropdown ──────────────────────────────── */

  /* ─── INÍCIO: fecharUserDropdown ───────────────────────────── */
  function fecharUserDropdown() {
    const dd = document.getElementById('user-dropdown');
    const btn = document.getElementById('user-avatar-btn');
    if (dd) dd.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
  /* ─── FIM: fecharUserDropdown ──────────────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     30. LOGOUT
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: confirmarLogout ──────────────────────────────── */
  function confirmarLogout() {
    abrirConfirmacao('Sair da conta', 'Deseja realmente encerrar a sessão?', executarLogout);
  }
  /* ─── FIM: confirmarLogout ─────────────────────────────────── */

  /* ─── INÍCIO: executarLogout ───────────────────────────────── */
  async function executarLogout() {
    const tokenLink = sessionStorage.getItem(CHAVES.LINK_TOKEN);
    mostrarLoader('Encerrando sessão…');

    if (tokenLink) {
      try { await executarRequisicaoAPI('invalidar_link', { tokenAcesso: tokenLink }); } catch (e) {}
    }

    executarLimpezaTotalESaida(true);
    esconderLoader();

    const urlLimpa = window.location.origin + window.location.pathname;
    window.location.replace(urlLimpa);
  }
  /* ─── FIM: executarLogout ──────────────────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     31. AUTO-REFRESH
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: ligarAutoRefreshAdm ──────────────────────────── */
  function ligarAutoRefreshAdm() {
    desligarAutoRefreshAdm();
    if (estadoSessao.papel !== 'adm') return;

    consultarPendentesAdm();

    _timerPainelAdm = setInterval(() => {
      if (estadoSessao.papel !== 'adm' || document.hidden) return;
      consultarPendentesAdm();
    }, 30000);
  }
  /* ─── FIM: ligarAutoRefreshAdm ─────────────────────────────── */

  /* ─── INÍCIO: desligarAutoRefreshAdm ───────────────────────── */
  function desligarAutoRefreshAdm() {
    if (_timerPainelAdm) {
      clearInterval(_timerPainelAdm);
      _timerPainelAdm = null;
    }
  }
  /* ─── FIM: desligarAutoRefreshAdm ──────────────────────────── */

  /* ─── INÍCIO: consultarPendentesAdm ────────────────────────── */
  async function consultarPendentesAdm() {
    if (estadoSessao.papel !== 'adm') return;
    try {
      const resp = await executarRequisicaoAPI('listar_solicitacoes_adm');
      const total = (resp.sucesso && Array.isArray(resp.solicitacoes)) ? resp.solicitacoes.length : 0;
      atualizarBadgePendentesAdm(total);
    } catch (e) {}
  }
  /* ─── FIM: consultarPendentesAdm ───────────────────────────── */

  /* ─── INÍCIO: iniciarAutoRefreshEsteira ────────────────────── */
  function iniciarAutoRefreshEsteira() {
    pararAutoRefreshEsteira();
    if (estadoSessao.papel !== 'adm') return;

    _timerEsteiraAdm = setInterval(async () => {
      if (estadoSessao.papel !== 'adm' || document.hidden) return;
      const painel = document.getElementById('view-pedidos-adm');
      if (painel && painel.classList.contains('active')) {
        await carregarPedidosAdm(true);
      } else {
        pararAutoRefreshEsteira();
      }
    }, 15000);
  }
  /* ─── FIM: iniciarAutoRefreshEsteira ───────────────────────── */

  /* ─── INÍCIO: pararAutoRefreshEsteira ──────────────────────── */
  function pararAutoRefreshEsteira() {
    if (_timerEsteiraAdm) {
      clearInterval(_timerEsteiraAdm);
      _timerEsteiraAdm = null;
    }
  }
  /* ─── FIM: pararAutoRefreshEsteira ─────────────────────────── */

  /* ─── INÍCIO: aoMudarVisibilidade ──────────────────────────── */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      desligarAutoRefreshAdm();
      pararAutoRefreshEsteira();
    } else {
      if (estadoSessao.papel === 'adm') {
        ligarAutoRefreshAdm();
        const painel = document.getElementById('view-pedidos-adm');
        if (painel && painel.classList.contains('active')) {
          carregarPedidosAdm(true);
          iniciarAutoRefreshEsteira();
        }
      }
    }
  });
  /* ─── FIM: aoMudarVisibilidade ─────────────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     32. TRATAMENTO DE ERROS GLOBAL
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: errorHandlerGlobal ───────────────────────────── */
  window.addEventListener('error', (e) => {
    console.error('[Global Error]', e.error || e.message);
  });

  window.addEventListener('unhandledrejection', (e) => {
    console.error('[Unhandled Rejection]', e.reason);
  });
  /* ─── FIM: errorHandlerGlobal ──────────────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     33. INICIALIZAÇÃO + EXPORTS GLOBAIS
     ═══════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: inicializarAplicacao ─────────────────────────── */
  async function inicializarAplicacao() {
    // 1. Tema antes de qualquer render (evita flash)
    inicializarTema();

    // 2. Restaurar estado local
    restaurarSessaoLocal();
    carregarFavoritos();
    carregarCarrinhoLocal();

    // 3. Validar token da URL (se existir)
    await verificarTokenUrl();

    // 4. Interface inicial
    atualizarInterfaceSessao();

    // 5. Carrega produtos se autorizado
    if (_linkAutorizadoValido || estadoSessao.papel !== 'visitante') {
      const cache = CacheLoja.obter(CACHE_KEYS.PRODUTOS(estadoSessao.papel));
      if (cache && Array.isArray(cache) && cache.length > 0) {
        catalogoProdutos = cache;
        aplicarFiltrosVitrine(true);
      }
      await sincronizarProdutosServidor();
    }

    // 6. Config de horário e dúvidas (assíncronos)
    carregarHorarioServidor();
    carregarDuvidasServidor();

    // 7. Dropdown de usuário
    const avatarBtn = document.getElementById('user-avatar-btn');
    if (avatarBtn) {
      avatarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleUserDropdown();
      });
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.user-menu')) fecharUserDropdown();
    });

    // 8. Banner de repetir pedido
    if (estadoSessao.papel === 'membro') {
      setTimeout(mostrarBannerRepetirPedido, 800);
    }

    // 9. Splash de abertura concluído
    finalizarSplashInicial('success', 'Tudo pronto!');
  }
  /* ─── FIM: inicializarAplicacao ────────────────────────────── */

  /* ─── INÍCIO: Exportações Globais ──────────────────────────── */

  // Utilitários
  window.exibirToast = exibirToast;
  window.mostrarLoader = mostrarLoader;
  window.esconderLoader = esconderLoader;
  window.botaoCarregando = botaoCarregando;

  // Tema
  window.alternarModoEscuro = alternarModoEscuro;

  // Navegação
  window.navegarPara = navegarPara;

  // Modais
  window.abrirModal = abrirModal;
  window.fecharModal = fecharModal;
  window.abrirConfirmacao = abrirConfirmacao;
  window.fecharConfirmacao = fecharConfirmacao;

  // Lightbox
  window.abrirLightboxFoto = abrirLightboxFoto;
  window.fecharLightbox = fecharLightbox;

  // Vitrine
  window.aplicarFiltroVitrine = aplicarFiltroVitrine;
  window.selecionarCategoriaChip = selecionarCategoriaChip;

  // Favoritos
  window.alternarFavorito = alternarFavorito;

  // Carrinho
  window.alterarQuantidadeProdutoCard = alterarQuantidadeProdutoCard;
  window.modificarQtdCarrinho = modificarQtdCarrinho;
  window.solicitarRemocaoItemCarrinho = solicitarRemocaoItemCarrinho;

  // Agendamento
  window.adicionarAoAgendamento = adicionarAoAgendamento;

  // Pedido
  window.tratarCriacaoPedido = tratarCriacaoPedido;
  window.copiarPixCopiaECola = copiarPixCopiaECola;
  window.enviarComprovanteWhatsApp = enviarComprovanteWhatsApp;

  // Repetir
  window.repetirUltimoPedido = repetirUltimoPedido;
  window.fecharBannerRepetirPedido = fecharBannerRepetirPedido;

  // Autenticação
  window.tratarLogin = tratarLogin;
  window.tratarSolicitacaoCadastro = tratarSolicitacaoCadastro;
  window.confirmarLogout = confirmarLogout;
  window.executarLogout = executarLogout;
  window.fecharUserDropdown = fecharUserDropdown;

  // ADM — Painel
  window.carregarPainelCentralAdm = carregarPainelCentralAdm;
  window.alternarModoAcessoSistema = alternarModoAcessoSistema;
  window.gerarLinkTemporarioAdm = gerarLinkTemporarioAdm;
  window.copiarLinkGerado = copiarLinkGerado;
  window.gerarRelatorioPdfVendas = gerarRelatorioPdfVendas;

  // ADM — Gavetas
  window.alternarGavetaAdm = alternarGavetaAdm;
  window.carregarListaMembrosGaveta = carregarListaMembrosGaveta;
  window.carregarListaBloqueadosGaveta = carregarListaBloqueadosGaveta;
  window.bloquearUsuarioComMotivo = bloquearUsuarioComMotivo;
  window.excluirUsuarioMembro = excluirUsuarioMembro;
  window.liberarContaUsuarioAdm = liberarContaUsuarioAdm;
  window.aprovarMembroAdm = aprovarMembroAdm;

  // ADM — Esteira
  window.carregarPedidosAdm = carregarPedidosAdm;
  window.avancarStatusAdm = avancarStatusAdm;
  window.cancelarExcluirPedidoAdm = cancelarExcluirPedidoAdm;
  window.limparConcluidosAdm = limparConcluidosAdm;

  // ADM — Produtos
  window.processarUploadImagem = processarUploadImagem;
  window.removerFotoCarregada = removerFotoCarregada;
  window.tratarCadastroProduto = tratarCadastroProduto;
  window.confirmarExclusaoProdutoAdm = confirmarExclusaoProdutoAdm;
  window.alterarVisibilidadeProdutoAdm = alterarVisibilidadeProdutoAdm;

  // Central de Ajuda
  window.responderDuvidaRapida = responderDuvidaRapida;
  window.tratarEnvioSugestao = tratarEnvioSugestao;

  /* ─── FIM: Exportações Globais ─────────────────────────────── */

  /* ═══════════════════════════════════════════════════════════
     BOOT
     ═══════════════════════════════════════════════════════════ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarAplicacao);
  } else {
    inicializarAplicacao();
  }

})();
