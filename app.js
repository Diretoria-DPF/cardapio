/* ============================================================================
   app.js — Plataforma Comercial Segura (v23 — Correção de Modais, Exclusão & Kill Switch)
   ============================================================================ */

// URL OFICIAL DA SUA API NO GOOGLE APPS SCRIPT:
const URL_BACKEND_APPS_SCRIPT = "https://lojasegura-backend.vercel.app";
/* ═══════════════════════════════════════════════════════════════
   0. FINGERPRINT, DEVTOOLS, ÁUDIO & VISIBILIDADE
   ═══════════════════════════════════════════════════════════════ */

/* ─── INÍCIO: gerarFingerprint ───────────────────────────────── */
function gerarFingerprint() {
    let fp = localStorage.getItem('plataforma_fingerprint');
    if (fp) return fp;

    const dados = [
        navigator.userAgent || '',
        navigator.language || '',
        screen.width + 'x' + screen.height,
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || 0
    ].join('|');

    let hash = 0;
    for (let i = 0; i < dados.length; i++) {
        hash = ((hash << 5) - hash) + dados.charCodeAt(i);
        hash |= 0;
    }
    fp = 'fp_' + Math.abs(hash).toString(36);
    try { localStorage.setItem('plataforma_fingerprint', fp); } catch (e) {}
    return fp;
}
/* ─── FIM: gerarFingerprint ─────────────────────────────────── */

const FINGERPRINT = gerarFingerprint();

/* ─── INÍCIO: ativarBlindagemDevTools ────────────────────────── */
function ativarBlindagemDevTools() {
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('keydown', e => {
        if (
            e.key === 'F12' ||
            (e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) ||
            (e.ctrlKey && ['U', 'u'].includes(e.key)) ||
            (e.metaKey && e.altKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key))
        ) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    });
}
/* ─── FIM: ativarBlindagemDevTools ──────────────────────────── */

/* ─── INÍCIO: tocarSomNotificacao ───────────────────────────── */
function tocarSomNotificacao(tipo = 'mensagem') {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();

        if (tipo === 'pedido') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, ctx.currentTime);
            osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.18, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.35);
        } else {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(784.00, ctx.currentTime);
            gain.gain.setValueAtTime(0.14, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.22);
        }
    } catch (e) {}
}
/* ─── FIM: tocarSomNotificacao ───────────────────────────────── */

/* ─── INÍCIO: Monitor de Visibilidade ────────────────────────── */
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        pararAutoRefreshChat();
        desligarAutoRefreshAdm();
        pararAutoRefreshEsteira(); // Adicionar aqui
    } else {
        if (pedidoChatAberto) {
            renderizarChat(true);
            iniciarAutoRefreshChat();
        }
        if (estadoSessao.papel === 'adm') {
            ligarAutoRefreshAdm();
            const painelEsteira = document.getElementById('view-pedidos-adm');
            if (painelEsteira && painelEsteira.classList.contains('active')) {
                carregarPedidosAdm(true);
                iniciarAutoRefreshEsteira(); // Retoma ao focar na janela
            }
        }
    }
});
/* ─── FIM: Monitor de Visibilidade ───────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   1. MODO ESCURO (DARK MODE)
   ═══════════════════════════════════════════════════════════════ */

/* ─── INÍCIO: alternarModoEscuro ─────────────────────────────── */
function alternarModoEscuro() {
    const escuroAtivo = document.documentElement.getAttribute('data-theme') === 'dark';
    const novoTema = escuroAtivo ? 'light' : 'dark';
    aplicarTema(novoTema);
    try { localStorage.setItem('plataforma_tema', novoTema); } catch (e) {}
}
/* ─── FIM: alternarModoEscuro ─────────────────────────────────── */

/* ─── INÍCIO: aplicarTema ────────────────────────────────────── */
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
/* ─── FIM: aplicarTema ───────────────────────────────────────── */

/* ─── INÍCIO: inicializarTema ────────────────────────────────── */
function inicializarTema() {
    const temaSalvo = localStorage.getItem('plataforma_tema') || 'light';
    aplicarTema(temaSalvo);
}
/* ─── FIM: inicializarTema ───────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   2. FUNÇÕES AUXILIARES (HELPERS)
   ═══════════════════════════════════════════════════════════════ */

/* ─── INÍCIO: escaparHtml ────────────────────────────────────── */
function escaparHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
/* ─── FIM: escaparHtml ───────────────────────────────────────── */

/* ─── INÍCIO: fmtPreco ───────────────────────────────────────── */
function fmtPreco(valor) {
    const numero = typeof valor === 'number' ? valor : parseFloat(String(valor).replace(',', '.'));
    return `R$ ${(isNaN(numero) ? 0 : numero).toFixed(2).replace('.', ',')}`;
}
/* ─── FIM: fmtPreco ─────────────────────────────────────────── */

/* ─── INÍCIO: extrairApenasDigitos ───────────────────────────── */
function extrairApenasDigitos(valor) {
    return String(valor || '').replace(/\D/g, '');
}
/* ─── FIM: extrairApenasDigitos ─────────────────────────────── */

/* ─── INÍCIO: mostrarLoader ──────────────────────────────────── */
function mostrarLoader(texto = 'Carregando...') {
    const elementoTexto = document.getElementById('loader-text');
    const elementoOverlay = document.getElementById('loader-overlay');
    if (elementoTexto) elementoTexto.textContent = texto;
    if (elementoOverlay) elementoOverlay.classList.remove('hidden');
}
/* ─── FIM: mostrarLoader ─────────────────────────────────────── */

/* ─── INÍCIO: esconderLoader ─────────────────────────────────── */
function esconderLoader() {
    const elementoOverlay = document.getElementById('loader-overlay');
    if (elementoOverlay) elementoOverlay.classList.add('hidden');
}
/* ─── FIM: esconderLoader ─────────────────────────────────────── */

/* ─── INÍCIO: botaoCarregando ────────────────────────────────── */
function botaoCarregando(idBotao, carregando = true) {
    const botao = document.getElementById(idBotao);
    if (!botao) return;
    botao.disabled = carregando;
    botao.classList.toggle('loading', carregando);
}
/* ─── FIM: botaoCarregando ───────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   3. CACHE LOCAL E ESTADO GLOBAL
   ═══════════════════════════════════════════════════════════════ */
const CacheLoja = {
    salvar(chave, dados) {
        try {
            localStorage.setItem('cache_' + chave, JSON.stringify({ dados, hora: Date.now() }));
        } catch (e) {}
    },
    obter(chave) {
        try {
            const item = localStorage.getItem('cache_' + chave);
            return item ? JSON.parse(item).dados : null;
        } catch (e) {
            return null;
        }
    },
    limpar(chave) {
        localStorage.removeItem('cache_' + chave);
    }
};

const estadoSessao = {
    papel: 'visitante',
    token: null,
    refreshToken: null,
    nomeUsuario: 'Visitante',
    pedidosRecentes: []
};

let cestaCompras = [];
let catalogoProdutos = [];
let catalogoFiltrado = [];
let fotoBase64Temporaria = "";
let identificadorEmTentativa = "";
let pedidoChatAberto = null;
let categoriaAtiva = "todos";
let totalMensagensChatAnterior = 0;
let totalPedidosAnaliseAnterior = 0;

let _linkAutorizadoValido = false;
let _timerSilencioso = null;
let _segundosRestantesLink = 0;
let _timerPainelAdm = null;
let _timerChat = null;
let _timerEsteiraAdm = null;

/* ═══════════════════════════════════════════════════════════════
   4. INICIALIZAÇÃO E COMUNICAÇÃO HTTP
   ═══════════════════════════════════════════════════════════════ */

/* ─── INÍCIO: DOMContentLoaded ───────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
    ativarBlindagemDevTools();
    inicializarTema();
    restaurarSessaoLocal();
    await verificarTokenUrl();
    atualizarInterfaceSessao();
    assegurarElementosAuxiliares();

    if (_linkAutorizadoValido || estadoSessao.papel !== 'visitante') {
        const cache = CacheLoja.obter('produtos_' + estadoSessao.papel);
        if (cache && cache.length > 0) {
            catalogoProdutos = cache;
            catalogoFiltrado = cache;
            renderizarVitrine();
        }
        await sincronizarProdutosServidor();
    }

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

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') fecharUserDropdown();
    });
});
/* ─── FIM: DOMContentLoaded ─────────────────────────────────── */

/* ─── INÍCIO: assegurarElementosAuxiliares ────────────────────── */
function assegurarElementosAuxiliares() {
    if (!document.getElementById('btn-flutuante-ajuda')) {
        const fab = document.createElement('button');
        fab.type = 'button';
        fab.id = 'btn-flutuante-ajuda';
        fab.className = 'floating-help-btn';
        fab.setAttribute('data-action', 'abrir-assistente');
        fab.setAttribute('aria-label', 'Atendente Virtual e Ajuda');
        fab.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>Ajuda</span>
        `;
        document.body.appendChild(fab);
    }

    if (!document.getElementById('modal-lightbox')) {
        const lb = document.createElement('div');
        lb.id = 'modal-lightbox';
        lb.className = 'lightbox-modal';
        lb.innerHTML = `
            <button type="button" class="lightbox-modal__close" id="lightbox-fechar" aria-label="Fechar">&times;</button>
            <img class="lightbox-modal__img" id="lightbox-img" src="" alt="Imagem ampliada">
        `;
        document.body.appendChild(lb);
    }
}
/* ─── FIM: assegurarElementosAuxiliares ──────────────────────── */

/* ─── INÍCIO: obterUrlBasePlataforma ─────────────────────────── */
function obterUrlBasePlataforma() {
    return window.location.href.split('?')[0];
}
/* ─── FIM: obterUrlBasePlataforma ─────────────────────────────── */

/* ─── INÍCIO: verificarTokenUrl ──────────────────────────────── */
async function verificarTokenUrl() {
    if (estadoSessao.token && estadoSessao.papel !== 'visitante') {
        _linkAutorizadoValido = true;
        pararTemporizadorSilencioso();
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const tokenAcesso = params.get('token') || sessionStorage.getItem('plataforma_link_token');

    if (!tokenAcesso) {
        _linkAutorizadoValido = false;
        return;
    }

    mostrarLoader('Validando link temporário...');
    try {
        const url = `${URL_BACKEND_APPS_SCRIPT}?acao=validar_link&tokenAcesso=${encodeURIComponent(tokenAcesso)}`;
        const resp = await fetchComTimeout(url, 15000);
        const res  = await resp.json();

        if (res.valido) {
            _linkAutorizadoValido = true;
            sessionStorage.setItem('plataforma_link_token', tokenAcesso);
            const segundos = res.segundosRestantes || (15 * 60);
            iniciarTemporizadorSilencioso(segundos);
        } else {
            _linkAutorizadoValido = false;
            sessionStorage.removeItem('plataforma_link_token');
            exibirToast(res.mensagem || "O link temporário terminou.", "error");
        }
    } catch (e) {
        _linkAutorizadoValido = false;
    } finally {
        esconderLoader();
    }
}
/* ─── FIM: verificarTokenUrl ─────────────────────────────────── */

/* ─── INÍCIO: iniciarTemporizadorSilencioso ──────────────────── */
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
           pararAutoRefreshEsteira();
           pararTemporizadorSilencioso();
            exibirToast("O seu período de acesso terminou. Solicite um novo link.", "info");
            executarLimpezaTotalESaida();
        }
    }, 1000);
}
/* ─── FIM: iniciarTemporizadorSilencioso ──────────────────────── */

/* ─── INÍCIO: pararTemporizadorSilencioso ────────────────────── */
function pararTemporizadorSilencioso() {
    if (_timerSilencioso) {
        clearInterval(_timerSilencioso);
        _timerSilencioso = null;
    }
}
/* ─── FIM: pararTemporizadorSilencioso ────────────────────────── */

/* ─── INÍCIO: executarLimpezaTotalESaida ─────────────────────── */
function executarLimpezaTotalESaida(silencioso = false) {
    pararTemporizadorSilencioso();
    pararAutoRefreshChat();
    desligarAutoRefreshAdm();

    const fp = localStorage.getItem('plataforma_fingerprint');
    const tema = localStorage.getItem('plataforma_tema');

    try {
        localStorage.removeItem('plataforma_sessao');
        sessionStorage.clear();
    } catch (e) {}

    if (fp) { try { localStorage.setItem('plataforma_fingerprint', fp); } catch (e) {} }
    if (tema) { try { localStorage.setItem('plataforma_tema', tema); } catch (e) {} }

    estadoSessao.papel        = 'visitante';
    estadoSessao.token        = null;
    estadoSessao.refreshToken = null;
    estadoSessao.nomeUsuario  = 'Visitante';
    cestaCompras              = [];
    _linkAutorizadoValido     = false;

    atualizarBarraFlutuanteSacola();
    const urlLimpa = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, urlLimpa);

    if (!silencioso) {
        exibirToast("Sessão finalizada com sucesso.", "info");
    }
    atualizarInterfaceSessao();
}
/* ─── FIM: executarLimpezaTotalESaida ─────────────────────────── */

/* ─── INÍCIO: fetchComTimeout ────────────────────────────────── */
async function fetchComTimeout(url, limiteTempoMs = 25000, opcoesExtras = {}) {
    const controladorAborto = new AbortController();
    const temporizador = setTimeout(() => controladorAborto.abort(), limiteTempoMs);

    try {
        return await fetch(url, {
            mode: 'cors',
            redirect: 'follow',
            cache: 'no-cache',
            ...opcoesExtras,
            signal: controladorAborto.signal
        });
    } finally {
        clearTimeout(temporizador);
    }
}
/* ─── FIM: fetchComTimeout ───────────────────────────────────── */

/* ─── INÍCIO: executarRequisicaoAPI ──────────────────────────── */
async function executarRequisicaoAPI(acao, dadosExtras = {}, tentarRefresh = true) {
    try {
        const payload = dadosExtras;
        const corpo = {
            acao,
            payload,
            fingerprint: FINGERPRINT
        };

        if (estadoSessao.token) {
            corpo.token = estadoSessao.token;
        } else {
            const linkToken = sessionStorage.getItem('plataforma_link_token');
            if (linkToken) corpo.token = linkToken;
        }

        const resposta = await fetchComTimeout(URL_BACKEND_APPS_SCRIPT, 25000, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(corpo)
        });

        const textoResposta = await resposta.text();
        let json;
        try {
            json = JSON.parse(textoResposta);
        } catch (erroParse) {
            return { sucesso: false, erroTransitorio: true, mensagem: "Servidor ocupado. Aguarde um instante..." };
        }

        if (!json.sucesso && json.codigo === 'SISTEMA_BLOQUEADO') {
            exibirToast(json.mensagem || "Plataforma em manutenção.", "error");
            if (estadoSessao.papel !== 'adm') {
                navegarPara('bloqueado');
            }
            return json;
        }

        if (!json.sucesso && json.codigo === 'LINK_EXPIRED') {
            if (estadoSessao.papel === 'visitante') {
                exibirToast(json.mensagem || "O link temporário expirou.", "error");
                executarLimpezaTotalESaida(true);
            }
            return json;
        }

        if (!json.sucesso && json.codigo === 'SESSION_EXPIRED') {
            if (tentarRefresh) {
                const rt = estadoSessao.refreshToken || sessionStorage.getItem('plataforma_refresh_token');
                if (rt) {
                    const ok = await tentarRenovarSessao(rt);
                    if (ok) {
                        return executarRequisicaoAPI(acao, dadosExtras, false);
                    }
                }
            }
            exibirToast("Sua sessão foi encerrada. Entre novamente.", "info");
            executarLogout();
            return { sucesso: false, mensagem: "Sessão expirada." };
        }

        return json;

    } catch (erroRede) {
        console.warn("[API] Oscilação de rede transitória:", erroRede);
        return { sucesso: false, erroRede: true, mensagem: "Sem conexão momentânea com o servidor." };
    }
}
/* ─── FIM: executarRequisicaoAPI ─────────────────────────────── */

/* ─── INÍCIO: tentarRenovarSessao ────────────────────────────── */
async function tentarRenovarSessao(refreshToken) {
    try {
        const resposta = await fetchComTimeout(URL_BACKEND_APPS_SCRIPT, 15000, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                acao: 'refresh',
                payload: { refreshToken },
                fingerprint: FINGERPRINT
            })
        });
        const json = await resposta.json();

        if (json.sucesso && json.token) {
            estadoSessao.token = json.token;
            if (json.refreshToken) estadoSessao.refreshToken = json.refreshToken;
            localStorage.setItem('plataforma_sessao', JSON.stringify(estadoSessao));
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}
/* ─── FIM: tentarRenovarSessao ───────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   5. CONTROLE GLOBAL DE ACESSO (KILL SWITCH ADM)
   ═══════════════════════════════════════════════════════════════ */

/* ─── INÍCIO: alternarModoAcessoSistema ──────────────────────── */
async function alternarModoAcessoSistema(novoModo) {
    if (estadoSessao.papel !== 'adm') return;

    mostrarLoader("Alterando modo de usabilidade...");
    const res = await executarRequisicaoAPI("alterar_modo_acesso", { novoModo });
    esconderLoader();

    if (res.sucesso) {
        exibirToast(res.mensagem, "success");
        atualizarVisualModoAcesso(res.modo);
    } else {
        exibirToast(res.mensagem || "Não foi possível alterar o modo.", "error");
    }
}
/* ─── FIM: alternarModoAcessoSistema ─────────────────────────── */

/* ─── INÍCIO: consultarStatusAcessoSistema ───────────────────── */
async function consultarStatusAcessoSistema() {
    if (estadoSessao.papel !== 'adm') return;
    const res = await executarRequisicaoAPI("obter_status_sistema");
    if (res.sucesso && res.modoAcesso) {
        atualizarVisualModoAcesso(res.modoAcesso);
    }
}
/* ─── FIM: consultarStatusAcessoSistema ───────────────────────── */

/* ─── INÍCIO: atualizarVisualModoAcesso ──────────────────────── */
function atualizarVisualModoAcesso(modo) {
    const badge = document.getElementById('badge-modo-acesso-adm');
    const btnLockdown = document.getElementById('btn-lockdown-adm');
    const btnPadrao = document.getElementById('btn-padrao-adm');

    if (!badge) return;

    if (modo === 'APENAS_ADM') {
        badge.textContent = "BLOQUEADO (APENAS ADM)";
        badge.className = "badge badge-adm";
        if (btnLockdown) btnLockdown.classList.add('hidden');
        if (btnPadrao) btnPadrao.classList.remove('hidden');
    } else {
        badge.textContent = "LIBERADO (PADRÃO)";
        badge.className = "badge badge-membro";
        if (btnLockdown) btnLockdown.classList.remove('hidden');
        if (btnPadrao) btnPadrao.classList.add('hidden');
    }
}
/* ─── FIM: atualizarVisualModoAcesso ─────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   6. LIGHTBOX (ZOOM DE FOTOS EM TELA CHEIA)
   ═══════════════════════════════════════════════════════════════ */

/* ─── INÍCIO: abrirLightboxFoto ──────────────────────────────── */
function abrirLightboxFoto(src, alt) {
    const modal = document.getElementById('modal-lightbox');
    const img = document.getElementById('lightbox-img');
    if (!modal || !img) return;

    img.src = src;
    img.alt = alt || 'Produto ampliado';
    modal.classList.add('active');
}
/* ─── FIM: abrirLightboxFoto ─────────────────────────────────── */

/* ─── INÍCIO: fecharLightbox ─────────────────────────────────── */
function fecharLightbox() {
    const modal = document.getElementById('modal-lightbox');
    if (modal) modal.classList.remove('active');
}
/* ─── FIM: fecharLightbox ─────────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   7. VITRINE, CHIPS, COMPRA RÁPIDA E BARRA FLUTUANTE
   ═══════════════════════════════════════════════════════════════ */

/* ─── INÍCIO: sincronizarProdutosServidor ────────────────────── */
async function sincronizarProdutosServidor() {
    let url = `${URL_BACKEND_APPS_SCRIPT}?acao=listar_produtos`;
    if (estadoSessao.token) {
        url += `&token=${encodeURIComponent(estadoSessao.token)}`;
    } else {
        const linkToken = sessionStorage.getItem('plataforma_link_token');
        if (linkToken) url += `&token=${encodeURIComponent(linkToken)}`;
    }

    try {
        const resposta = await fetchComTimeout(url, 20000);
        const resultado = await resposta.json();
        if (resultado.sucesso && Array.isArray(resultado.produtos)) {
            catalogoProdutos = resultado.produtos;
            aplicarFiltroVitrine();
            CacheLoja.salvar('produtos_' + estadoSessao.papel, catalogoProdutos);
        }
    } catch (erro) {
        console.warn("[Vitrine] Erro na sincronização:", erro);
    }
}
/* ─── FIM: sincronizarProdutosServidor ───────────────────────── */

/* ─── INÍCIO: selecionarCategoriaChip ───────────────────────── */
function selecionarCategoriaChip(categoria, elementoChip) {
    categoriaAtiva = categoria || "todos";

    document.querySelectorAll('.chip').forEach(c => {
        c.classList.remove('active');
        c.setAttribute('aria-selected', 'false');
    });

    if (elementoChip) {
        elementoChip.classList.add('active');
        elementoChip.setAttribute('aria-selected', 'true');
    }

    aplicarFiltroVitrine();
}
/* ─── FIM: selecionarCategoriaChip ───────────────────────────── */

/* ─── INÍCIO: aplicarFiltroVitrine ──────────────────────────── */
function aplicarFiltroVitrine(termoManual = null) {
    const inputFiltro = document.getElementById('filtro-produtos');
    const termo = (termoManual !== null ? termoManual : (inputFiltro ? inputFiltro.value : '')).trim().toLowerCase();

    let resultado = catalogoProdutos;

    if (termo) {
        resultado = resultado.filter(p => String(p.nome || '').toLowerCase().includes(termo));
    }

    if (categoriaAtiva === 'mais-vendidos') {
        resultado = resultado.filter((p, index) => {
            const nomeMinusculo = String(p.nome || '').toLowerCase();
            return p.categoria === 'mais-vendidos' || p.maisVendido === true || nomeMinusculo.includes('mais') || (index % 2 === 0);
        });
    } else if (categoriaAtiva === 'destaque') {
        resultado = resultado.filter((p, index) => {
            const nomeMinusculo = String(p.nome || '').toLowerCase();
            return p.categoria === 'destaque' || p.destaque === true || nomeMinusculo.includes('destaque') || (index % 2 !== 0);
        });
    }

    catalogoFiltrado = resultado;
    renderizarVitrine();
}
/* ─── FIM: aplicarFiltroVitrine ─────────────────────────────── */

/* ─── INÍCIO: renderizarVitrine ──────────────────────────────── */
function renderizarVitrine() {
    const grid = document.getElementById('produtos-container');
    if (!grid) return;
    grid.innerHTML = '';

    if (!catalogoFiltrado || catalogoFiltrado.length === 0) {
        const termo = document.getElementById('filtro-produtos')?.value.trim();
        grid.innerHTML = `
            <div class="empty-state">
                <strong>${termo ? 'Nenhum produto encontrado' : 'Vitrine vazia'}</strong>
                ${termo ? `Nada corresponde a "${escaparHtml(termo)}".` : 'Aguarde novos produtos da administração.'}
            </div>`;
        return;
    }

    catalogoFiltrado.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';

        const img = document.createElement('img');
        img.className = 'product-thumb';
        img.src = p.foto || 'https://via.placeholder.com/300x200?text=Sem+Foto';
        img.alt = p.nome || 'Produto';
        img.loading = 'lazy';
        img.title = 'Toque duas vezes para ampliar a foto';

        const body = document.createElement('div');
        body.className = 'product-details';

        const t = document.createElement('h3');
        t.className = 'product-name';
        t.textContent = p.nome || 'Sem nome';

        const pr = document.createElement('p');
        pr.className = 'product-price';
        pr.textContent = fmtPreco(p.preco);

        body.append(t, pr);

        if (estadoSessao.papel === 'membro' || estadoSessao.papel === 'entregador') {
            const grupoAcoes = document.createElement('div');
            grupoAcoes.className = 'card-actions-group';

            const btnComprar = document.createElement('button');
            btnComprar.type = 'button';
            btnComprar.className = 'btn btn-comprar-agora btn-block btn-sm';
            btnComprar.textContent = '⚡ Comprar Agora';
            btnComprar.onclick = () => comprarProdutoDireto(p.id);

            const btnCesta = document.createElement('button');
            btnCesta.type = 'button';
            btnCesta.className = 'btn btn-primary btn-block btn-sm';
            btnCesta.textContent = '+ Cesta';
            btnCesta.onclick = (e) => adicionarAoCarrinho(p, e.currentTarget);

            grupoAcoes.append(btnComprar, btnCesta);
            body.appendChild(grupoAcoes);
        } else if (estadoSessao.papel === 'adm') {
            const painelAdm = document.createElement('div');
            painelAdm.className = 'adm-visib-controls';

            const tag = document.createElement('span');
            tag.style.fontWeight = 'bold';
            tag.style.color = p.visibilidade === 'adm' ? '#dc2626' : (p.visibilidade === 'registrado' ? '#2563eb' : '#16a34a');
            tag.textContent = `[${String(p.visibilidade).toUpperCase()}]`;

            const selectVisib = document.createElement('select');
            selectVisib.innerHTML = `
                <option value="publico" ${p.visibilidade === 'publico' ? 'selected' : ''}>Público</option>
                <option value="registrado" ${p.visibilidade === 'registrado' ? 'selected' : ''}>Membro</option>
                <option value="adm" ${p.visibilidade === 'adm' ? 'selected' : ''}>Oculto ADM</option>
            `;
            selectVisib.onchange = () => alterarVisibilidadeProdutoAdm(p.id, selectVisib.value);

            painelAdm.append(tag, selectVisib);
            body.appendChild(painelAdm);

            const btnExcluir = document.createElement('button');
            btnExcluir.className = 'btn btn-danger-outline btn-block btn-sm';
            btnExcluir.style.marginTop = '6px';
            btnExcluir.textContent = '🗑️ Excluir Produto';
            btnExcluir.onclick = () => confirmarExclusaoProdutoAdm(p.id, p.nome);
            body.appendChild(btnExcluir);
        } else {
            const aviso = document.createElement('small');
            aviso.className = 'visitor-note';
            aviso.textContent = 'Cadastre-se ou entre para comprar.';
            body.appendChild(aviso);
        }

        card.append(img, body);
        grid.appendChild(card);
    });
}
/* ─── FIM: renderizarVitrine ─────────────────────────────────── */

/* ─── INÍCIO: comprarProdutoDireto ───────────────────────────── */
function comprarProdutoDireto(idProduto) {
    const prod = catalogoProdutos.find(p => String(p.id) === String(idProduto));
    if (!prod) return;

    cestaCompras = [{
        id: prod.id,
        nome: prod.nome,
        preco: typeof prod.preco === 'number' ? prod.preco : parseFloat(String(prod.preco).replace(',', '.')),
        quantidade: 1
    }];

    atualizarBadgeCarrinho(1);
    atualizarBarraFlutuanteSacola();
    navegarPara('carrinho');
}
/* ─── FIM: comprarProdutoDireto ───────────────────────────────── */

/* ─── INÍCIO: adicionarAoCarrinho ────────────────────────────── */
function adicionarAoCarrinho(produto, btnElemento = null) {
    const itemExistente = cestaCompras.find(item => item.id === produto.id);
    if (itemExistente) {
        itemExistente.quantidade += 1;
    } else {
        cestaCompras.push({
            id: produto.id,
            nome: produto.nome,
            preco: typeof produto.preco === 'number'
                ? produto.preco
                : parseFloat(String(produto.preco).replace(',', '.')),
            quantidade: 1
        });
    }

    const totalItens = cestaCompras.reduce((acc, i) => acc + i.quantidade, 0);
    atualizarBadgeCarrinho(totalItens);
    atualizarBarraFlutuanteSacola();

    if (btnElemento) {
        const textoOriginal = btnElemento.textContent;
        btnElemento.textContent = '✓ Salvo';
        btnElemento.classList.add('btn-adicionado');
        btnElemento.disabled = true;

        setTimeout(() => {
            btnElemento.textContent = textoOriginal;
            btnElemento.classList.remove('btn-adicionado');
            btnElemento.disabled = false;
        }, 1100);
    } else {
        exibirToast(`${produto.nome} adicionado à cesta.`, "info");
    }

    ['cart-counter', 'header-cart-count'].forEach(idBadge => {
        const badge = document.getElementById(idBadge);
        if (badge) {
            badge.classList.remove('badge-bounce');
            void badge.offsetWidth;
            badge.classList.add('badge-bounce');
        }
    });
}
/* ─── FIM: adicionarAoCarrinho ───────────────────────────────── */

/* ─── INÍCIO: atualizarBarraFlutuanteSacola ──────────────────── */
function atualizarBarraFlutuanteSacola() {
    let bar = document.getElementById('floating-cart-bar');
    const totalItens = cestaCompras.reduce((acc, i) => acc + i.quantidade, 0);
    const totalValor = cestaCompras.reduce((acc, i) => acc + (i.preco * i.quantidade), 0);

    if (totalItens > 0 && estadoSessao.papel === 'membro') {
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'floating-cart-bar';
            bar.className = 'floating-cart-bar';
            bar.innerHTML = `
                <div class="floating-cart-bar__left">
                    <span class="floating-cart-bar__count" id="float-cart-count">0 itens</span>
                    <span class="floating-cart-bar__total" id="float-cart-total">R$ 0,00</span>
                </div>
                <div class="floating-cart-bar__cta">
                    Ver Sacola ➔
                </div>
            `;
            document.body.appendChild(bar);
        }
        const countEl = document.getElementById('float-cart-count');
        const totalEl = document.getElementById('float-cart-total');
        if (countEl) countEl.textContent = `${totalItens} ${totalItens === 1 ? 'item' : 'itens'}`;
        if (totalEl) totalEl.textContent = fmtPreco(totalValor);
        bar.classList.remove('hidden');
    } else if (bar) {
        bar.classList.add('hidden');
    }
}
/* ─── FIM: atualizarBarraFlutuanteSacola ──────────────────────── */

/* ─── INÍCIO: renderizarCarrinho ─────────────────────────────── */
function renderizarCarrinho() {
    const lista = document.getElementById('carrinho-itens-lista');
    if (!lista) return;
    lista.innerHTML = '';
    let valorTotal = 0;

    if (cestaCompras.length === 0) {
        lista.innerHTML = `<div class="empty-state">
            <strong>Sua cesta está vazia</strong>
            Adicione itens da vitrine.
        </div>`;
        const totalEl = document.getElementById('carrinho-total-valor');
        if (totalEl) totalEl.textContent = 'R$ 0,00';
        atualizarBadgeCarrinho(0);
        atualizarBarraFlutuanteSacola();
        return;
    }

    cestaCompras.forEach(item => {
        const subtotal = item.preco * item.quantidade;
        valorTotal += subtotal;

        const linha = document.createElement('div');
        linha.className = 'cart-item-row';

        const descricao = document.createElement('span');
        descricao.textContent = item.nome;
        descricao.style.flex = '1';
        descricao.style.minWidth = '0';
        descricao.style.overflow = 'hidden';
        descricao.style.textOverflow = 'ellipsis';
        descricao.style.whiteSpace = 'nowrap';

        const campoQuantidade = document.createElement('input');
        campoQuantidade.type = 'number';
        campoQuantidade.min = 1;
        campoQuantidade.value = item.quantidade;
        campoQuantidade.style.cssText = 'width:56px;padding:4px 6px;text-align:center;';
        campoQuantidade.onchange = () => {
            item.quantidade = Math.max(1, Number(campoQuantidade.value) || 1);
            renderizarCarrinho();
        };

        const precoTexto = document.createElement('strong');
        precoTexto.textContent = fmtPreco(subtotal);
        precoTexto.style.minWidth = '70px';
        precoTexto.style.textAlign = 'right';

        const botaoRemover = document.createElement('button');
        botaoRemover.className = 'btn btn-danger-outline btn-sm';
        botaoRemover.textContent = '✕';
        botaoRemover.title = 'Remover item';
        botaoRemover.onclick = () => {
            cestaCompras = cestaCompras.filter(el => el.id !== item.id);
            renderizarCarrinho();
        };

        linha.append(descricao, campoQuantidade, precoTexto, botaoRemover);
        lista.appendChild(linha);
    });

    const totalEl = document.getElementById('carrinho-total-valor');
    if (totalEl) totalEl.textContent = fmtPreco(valorTotal);

    const totalItens = cestaCompras.reduce((acc, i) => acc + i.quantidade, 0);
    atualizarBadgeCarrinho(totalItens);
    atualizarBarraFlutuanteSacola();
}
/* ─── FIM: renderizarCarrinho ─────────────────────────────────── */

/* ─── INÍCIO: tratarCriacaoPedido ────────────────────────────── */
async function tratarCriacaoPedido() {
    if (cestaCompras.length === 0) {
        return exibirToast("A sua cesta está vazia.", "error");
    }

    botaoCarregando('btn-confirmar-pedido', true);
    mostrarLoader("Processando pedido seguro...");

    const metodo = document.getElementById('metodo-pagamento').value;

    const resposta = await executarRequisicaoAPI("criar_pedido", {
        itens: cestaCompras.map(item => ({ id: item.id, quantidade: item.quantidade })),
        metodoPagamento: metodo
    });

    esconderLoader();
    botaoCarregando('btn-confirmar-pedido', false);

    if (resposta.sucesso) {
        exibirToast(`Pedido ${resposta.idPedido} gerado com sucesso!`, "success");
        tocarSomNotificacao('pedido');

        const metodoEscolhido = metodo;
        cestaCompras = [];
        atualizarBadgeCarrinho(0);
        atualizarBarraFlutuanteSacola();

        navegarPara('meus-pedidos');
        abrirCobrancaPedido(resposta.idPedido, metodoEscolhido);
    } else {
        exibirToast(resposta.mensagem || "Não foi possível gerar o pedido.", "error");
    }
}
/* ─── FIM: tratarCriacaoPedido ───────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   8. GESTÃO DO CATÁLOGO E EXCLUSÕES (ADM)
   ═══════════════════════════════════════════════════════════════ */

/* ─── INÍCIO: alterarVisibilidadeProdutoAdm ──────────────────── */
async function alterarVisibilidadeProdutoAdm(idProduto, novaVisib) {
    mostrarLoader("Alterando visibilidade...");
    const res = await executarRequisicaoAPI("alterar_visibilidade_produto", {
        idProduto: idProduto,
        novaVisibilidade: novaVisib
    });
    esconderLoader();

    if (res.sucesso) {
        exibirToast(res.mensagem || "Visibilidade atualizada!", "success");
        CacheLoja.limpar('produtos_adm');
        CacheLoja.limpar('produtos_membro');
        CacheLoja.limpar('produtos_visitante');
        await sincronizarProdutosServidor();
    } else {
        exibirToast(res.mensagem || "Erro ao alterar visibilidade.", "error");
    }
}
/* ─── FIM: alterarVisibilidadeProdutoAdm ──────────────────────── */

/* ─── INÍCIO: Ciclo de Auto-Refresh da Esteira (ADM) ────────── */
function iniciarAutoRefreshEsteira() {
    pararAutoRefreshEsteira();
    if (estadoSessao.papel !== 'adm') return;

    _timerEsteiraAdm = setInterval(async () => {
        if (estadoSessao.papel !== 'adm' || document.hidden) return;
        const painelEsteira = document.getElementById('view-pedidos-adm');
        if (painelEsteira && painelEsteira.classList.contains('active')) {
            await carregarPedidosAdm(true); // Executa no modo silencioso
        } else {
            pararAutoRefreshEsteira();
        }
    }, 8000); // Consulta a cada 8 segundos
}

function pararAutoRefreshEsteira() {
    if (_timerEsteiraAdm) {
        clearInterval(_timerEsteiraAdm);
        _timerEsteiraAdm = null;
    }
}
/* ─── FIM: Ciclo de Auto-Refresh da Esteira (ADM) ───────────── */

/* ─── INÍCIO: carregarPedidosAdm ─────────────────────────────── */
/* ─── INÍCIO: carregarPedidosAdm ─────────────────────────────── */
async function carregarPedidosAdm(silencioso = false) {
    const colunaAnalise     = document.getElementById('pipe-analise');
    const colunaSolicitados = document.getElementById('pipe-solicitados');
    const colunaViagem      = document.getElementById('pipe-viagem');
    const colunaConcluido   = document.getElementById('pipe-concluido');

    // Só exibe os esqueletos de carregamento se for a abertura inicial da tela
    if (!silencioso) {
        [colunaAnalise, colunaSolicitados, colunaViagem, colunaConcluido].forEach(coluna => {
            if (coluna) coluna.innerHTML = '<div class="loading-slot">…</div>';
        });
    }

    const resposta = await executarRequisicaoAPI("listar_pedidos_adm");
    if (!resposta.sucesso || !Array.isArray(resposta.pedidos)) return;

    if (colunaAnalise)     colunaAnalise.innerHTML = '';
    if (colunaSolicitados) colunaSolicitados.innerHTML = '';
    if (colunaViagem)      colunaViagem.innerHTML = '';
    if (colunaConcluido)   colunaConcluido.innerHTML = '';

    const emAnalise = resposta.pedidos.filter(p => String(p.status).toLowerCase() === 'analise').length;
    if (totalPedidosAnaliseAnterior > 0 && emAnalise > totalPedidosAnaliseAnterior) {
        tocarSomNotificacao('pedido');
    }
    totalPedidosAnaliseAnterior = emAnalise;

    resposta.pedidos.forEach(pedido => {
        const divCartao = document.createElement('div');
        divCartao.className = 'pipeline-order-card';
        if (pedido.temPerguntaPendente) {
            divCartao.classList.add('card-pergunta-ativa');
        }

        const badgePergunta = pedido.temPerguntaPendente
            ? `<span class="badge-duvida-pendente" title="Cliente aguardando resposta">❓ Nova Mensagem</span>`
            : '';

        divCartao.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <small><strong>${escaparHtml(pedido.id)}</strong></small>
                ${badgePergunta}
            </div>
            <small style="font-weight:700;color:var(--cor-sucesso);">${fmtPreco(pedido.total)}</small><br>
            <small style="color:var(--cor-texto-suave);">Forma: ${escaparHtml(pedido.metodo || 'PIX')}</small>
        `;

        const painelBotoes = document.createElement('div');
        painelBotoes.style.cssText = 'display:flex;gap:4px;margin-top:8px;';

        if (pedido.status !== 'concluido') {
            const botaoAvancar = document.createElement('button');
            botaoAvancar.className = 'btn btn-primary btn-sm';
            botaoAvancar.textContent = 'Avançar';
            botaoAvancar.onclick = () => avancarStatusAdm(pedido.id, pedido.status);
            painelBotoes.appendChild(botaoAvancar);
        }

        const botaoChatAdm = document.createElement('button');
        botaoChatAdm.className = pedido.temPerguntaPendente ? 'btn btn-aviso btn-sm pulse-chat' : 'btn btn-outline-dark btn-sm';
        botaoChatAdm.innerHTML = pedido.temPerguntaPendente ? '💬 ❓' : '💬';
        botaoChatAdm.title = pedido.temPerguntaPendente ? 'Mensagem do cliente aguardando resposta' : 'Abrir Chat';
        botaoChatAdm.onclick = () => abrirChatPedido(pedido.id);
        painelBotoes.appendChild(botaoChatAdm);

        divCartao.appendChild(painelBotoes);

        if (pedido.status === 'analise'     && colunaAnalise)     colunaAnalise.appendChild(divCartao);
        if (pedido.status === 'solicitados' && colunaSolicitados) colunaSolicitados.appendChild(divCartao);
        if (pedido.status === 'viagem'      && colunaViagem)      colunaViagem.appendChild(divCartao);
        if (pedido.status === 'concluido'   && colunaConcluido)   colunaConcluido.appendChild(divCartao);
    });

    [[colunaAnalise], [colunaSolicitados], [colunaViagem], [colunaConcluido]].forEach(([coluna]) => {
        if (coluna && !coluna.children.length) {
            coluna.innerHTML = `<div class="loading-slot" style="font-size:.75rem;">Sem pedidos</div>`;
        }
    });
}
/* ─── FIM: carregarPedidosAdm ─────────────────────────────────── */

/* ─── INÍCIO: confirmarExclusaoProdutoAdm ────────────────────── */
function confirmarExclusaoProdutoAdm(idProduto, nomeProduto) {
    abrirConfirmacao(
        "Excluir Produto",
        `Deseja realmente excluir permanentemente "${escaparHtml(nomeProduto)}"? Esta ação não poderá ser desfeita.`,
        () => excluirProdutoAdm(idProduto)
    );
}
/* ─── FIM: confirmarExclusaoProdutoAdm ────────────────────────── */

/* ─── INÍCIO: excluirProdutoAdm ──────────────────────────────── */
async function excluirProdutoAdm(idProduto) {
    mostrarLoader("Excluindo produto...");
    const res = await executarRequisicaoAPI("excluir_produto", { idProduto });
    esconderLoader();

    if (res.sucesso) {
        exibirToast(res.mensagem || "Produto excluído com sucesso!", "success");
        CacheLoja.limpar('produtos_adm');
        CacheLoja.limpar('produtos_membro');
        CacheLoja.limpar('produtos_visitante');
        await sincronizarProdutosServidor();
    } else {
        exibirToast(res.mensagem || "Não foi possível excluir o produto.", "error");
    }
}
/* ─── FIM: excluirProdutoAdm ─────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   9. ATENDENTE VIRTUAL & DÚVIDAS
   ═══════════════════════════════════════════════════════════════ */

const BASE_CONHECIMENTO = {
    visitante: {
        saudacao: "Olá! Sou o assistente da LojaSegura. Como posso te orientar hoje?",
        duvidas: [
            {
                pergunta: "Como consigo um link de acesso?",
                resposta: "Os links de acesso temporário são concedidos exclusivamente pela administração via WhatsApp. Clique no botão de WhatsApp na tela inicial para falar direto com o atendente."
            },
            {
                pergunta: "Como solicitar meu cadastro?",
                resposta: "Basta clicar em 'Solicitar Cadastro' na tela de bloqueio e preencher seu nome, telefone WhatsApp e senha. O administrador fará a liberação em instantes."
            },
            {
                pergunta: "A plataforma é segura?",
                resposta: "Sim. Todas as transações utilizam criptografia segura de ponta a ponta, com autenticação determinística para proteção de dados."
            }
        ]
    },
    membro: {
        saudacao: "Olá, membro! Em que posso ajudar com seus pedidos ou pagamentos?",
        duvidas: [
            {
                pergunta: "Como pagar via PIX?",
                resposta: "Na tela do pedido, toque em 'Pagar / Ver Cobrança', copie o código com um toque no botão verde e cole na área 'PIX Copia e Cola' do aplicativo do seu banco."
            },
            {
                pergunta: "Como funciona a entrega?",
                resposta: "Assim que o pagamento é identificado, nosso atendente entra em contato pelo chat do próprio pedido e o status muda na esteira para 'Em Viagem'."
            },
            {
                pergunta: "Como falar com o atendente humano?",
                resposta: "Você pode abrir o chat dentro de qualquer pedido ativo ou mandar uma sugestão/mensagem direta na nossa Central de Ajuda."
            }
        ]
    }
};

/* ─── INÍCIO: abrirAssistenteVirtual ─────────────────────────── */
function abrirAssistenteVirtual() {
    const papel = estadoSessao.papel === 'visitante' ? 'visitante' : 'membro';
    const dados = BASE_CONHECIMENTO[papel];

    const container = document.createElement('div');
    container.style.cssText = 'text-align:left;padding:4px 0;';

    const saudacao = document.createElement('p');
    saudacao.style.cssText = 'font-size:0.9rem;color:var(--cor-texto);margin-bottom:12px;font-weight:600;';
    saudacao.textContent = dados.saudacao;

    const boxPerguntas = document.createElement('div');
    boxPerguntas.className = 'assistant-quick-box';

    dados.duvidas.forEach(d => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'assistant-quick-chip';
        chip.textContent = d.pergunta;
        chip.onclick = () => {
            exibirRespostaAssistente(d.pergunta, d.resposta);
        };
        boxPerguntas.appendChild(chip);
    });

    const respostaArea = document.createElement('div');
    respostaArea.id = 'assistant-resposta-area';
    respostaArea.style.cssText = 'margin-top:12px;font-size:0.85rem;line-height:1.45;color:var(--cor-texto-suave);';

    container.append(saudacao, boxPerguntas, respostaArea);

    abrirConfirmacaoElemento("Atendente Virtual", container, () => {});
    const btnOk = document.getElementById('confirmar-btn-ok');
    if (btnOk) btnOk.textContent = "Fechar";
}
/* ─── FIM: abrirAssistenteVirtual ─────────────────────────────── */

/* ─── INÍCIO: exibirRespostaAssistente ───────────────────────── */
function exibirRespostaAssistente(pergunta, resposta) {
    const area = document.getElementById('assistant-resposta-area');
    if (!area) return;

    area.innerHTML = `
        <div style="background:var(--cor-fundo-elevado);padding:10px 12px;border-radius:8px;border:1px solid var(--cor-borda);">
            <strong style="color:var(--cor-primaria);display:block;margin-bottom:4px;">${escaparHtml(pergunta)}</strong>
            <span>${escaparHtml(resposta)}</span>
        </div>
    `;
}
/* ─── FIM: exibirRespostaAssistente ───────────────────── */

/* ─── INÍCIO: responderDuvidaRapida ──────────────────────────── */
function responderDuvidaRapida(chave) {
    abrirAssistenteVirtual();
}
/* ─── FIM: responderDuvidaRapida ─────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   10. MEUS PEDIDOS, COMPARTILHAMENTO & CHAT
   ═══════════════════════════════════════════════════════════════ */

/* ─── INÍCIO: carregarMeusPedidos ────────────────────────────── */
async function carregarMeusPedidos() {
    const container = document.getElementById('meus-pedidos-container');
    if (!container) return;
    container.innerHTML = '<div class="loading-slot">Carregando os seus pedidos...</div>';

    const resposta = await executarRequisicaoAPI("listar_meus_pedidos");
    container.innerHTML = '';

    if (!resposta.sucesso || !resposta.pedidos || resposta.pedidos.length === 0) {
        container.innerHTML = `<div class="empty-state"><strong>Nenhum pedido ainda</strong>Quando criar um pedido, ele aparece aqui.</div>`;
        return;
    }

    estadoSessao.pedidosRecentes = resposta.pedidos;

    resposta.pedidos.forEach(pedido => {
        const cartao = document.createElement('div');
        cartao.className = 'card';
        const statusMinusculo = String(pedido.status || '').toLowerCase();

        const fases = ['analise', 'solicitados', 'viagem', 'concluido'];
        let indiceFaseAtual = fases.indexOf(statusMinusculo);
        if (indiceFaseAtual === -1) indiceFaseAtual = 0;

        let mensagemStatus = "Aguardando confirmação do pagamento.";
        if (statusMinusculo === 'solicitados') mensagemStatus = "Pagamento aprovado! Em separação no estoque.";
        if (statusMinusculo === 'viagem')      mensagemStatus = "Produto a caminho do endereço / pronto para entrega.";
        if (statusMinusculo === 'concluido')   mensagemStatus = "Pedido concluído e entregue!";
        if (statusMinusculo === 'cancelado')   mensagemStatus = "Pedido cancelado.";

        const obterClasseEtapa = (indiceEtapa) => {
            if (statusMinusculo === 'concluido') return 'completed';
            if (indiceEtapa < indiceFaseAtual)   return 'completed';
            if (indiceEtapa === indiceFaseAtual) return 'active';
            return '';
        };

        cartao.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <h4>Pedido: ${escaparHtml(pedido.id)}</h4>
                <strong style="color:var(--cor-sucesso-escura);">${fmtPreco(pedido.total)}</strong>
            </div>
            <p style="font-size:0.8rem;color:var(--cor-texto-suave);margin-top:2px;">
                Forma: <strong>${escaparHtml(pedido.metodo || 'PIX')}</strong>
            </p>

            <div class="order-stepper">
                <div class="order-step ${obterClasseEtapa(0)}">
                    <div class="step-circle">1</div>
                    <span class="step-label">Análise</span>
                </div>
                <div class="order-step ${obterClasseEtapa(1)}">
                    <div class="step-circle">2</div>
                    <span class="step-label">Solicitado</span>
                </div>
                <div class="order-step ${obterClasseEtapa(2)}">
                    <div class="step-circle">3</div>
                    <span class="step-label">Em Viagem</span>
                </div>
                <div class="order-step ${obterClasseEtapa(3)}">
                    <div class="step-circle">✓</div>
                    <span class="step-label">Concluído</span>
                </div>
            </div>

            <div class="order-stepper-msg">
                <span>📍</span>
                <span>${escaparHtml(mensagemStatus)}</span>
            </div>
        `;

        const painelAcoes = document.createElement('div');
        painelAcoes.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;';

        if (statusMinusculo === 'analise') {
            const botaoPagar = document.createElement('button');
            botaoPagar.className = 'btn btn-success btn-sm';
            botaoPagar.textContent = '💳 Pagar / Instruções';
            botaoPagar.onclick = () => abrirCobrancaPedido(pedido.id, pedido.metodo);
            painelAcoes.appendChild(botaoPagar);
        }

        const botaoShare = document.createElement('button');
        botaoShare.className = 'btn btn-outline-dark btn-sm';
        botaoShare.textContent = '📲 Enviar no WhatsApp';
        botaoShare.onclick = () => compartilharPedidoWhatsApp(pedido.id);
        painelAcoes.appendChild(botaoShare);

        if (pedido.chatAtivo) {
            const botaoChat = document.createElement('button');
            botaoChat.className = 'btn btn-primary btn-sm';
            botaoChat.textContent = '💬 Abrir Chat';
            botaoChat.onclick = () => abrirChatPedido(pedido.id);
            painelAcoes.appendChild(botaoChat);
        }

        cartao.appendChild(painelAcoes);
        container.appendChild(cartao);
    });
}
/* ─── FIM: carregarMeusPedidos ───────────────────────────────── */

/* ─── INÍCIO: compartilharPedidoWhatsApp ─────────────────────── */
async function compartilharPedidoWhatsApp(idPedido) {
    const pedido = (estadoSessao.pedidosRecentes || []).find(p => String(p.id) === String(idPedido));
    
    const texto = pedido
        ? `Olá! Gostaria de validar os detalhes do meu Pedido #${pedido.id} no valor de ${fmtPreco(pedido.total)} via ${pedido.metodo} (Status: ${pedido.status.toUpperCase()}). Aguardo orientações!`
        : `Olá! Vim pela LojaSegura e gostaria de falar sobre o Pedido #${idPedido}.`;

    if (navigator.share) {
        try {
            await navigator.share({
                title: `Pedido #${idPedido}`,
                text: texto
            });
            return;
        } catch (e) {}
    }

    const numeroLoja = "5574998048300";
    const urlWa = `https://wa.me/${numeroLoja}?text=${encodeURIComponent(texto)}`;
    window.open(urlWa, '_blank');
}
/* ─── FIM: compartilharPedidoWhatsApp ───────────────────────── */

/* ─── INÍCIO: abrirCobrancaPedido ────────────────────────────── */
async function abrirCobrancaPedido(idPedido, metodo) {
    mostrarLoader("Gerando instruções de pagamento...");
    const resposta = await executarRequisicaoAPI("gerar_pagamento", {
        idPedido: idPedido,
        metodo: metodo || "PIX"
    });
    esconderLoader();

    if (!resposta.sucesso) {
        return exibirToast(resposta.mensagem || "Não foi possível gerar a cobrança.", "error");
    }

    if (resposta.jaPago) {
        return exibirToast("Este pedido já se encontra pago e em fase de entrega!", "success");
    }

    const cobranca = resposta.cobranca;
    const caixaConteudo = document.createElement('div');
    caixaConteudo.style.cssText = 'text-align:center;padding:10px;';

    if (cobranca.tipo === "PIX") {
        const imgQr = document.createElement('img');
        imgQr.src = cobranca.qrCodeUrl;
        imgQr.alt = "QR Code PIX";
        imgQr.style.cssText = 'width:190px;height:190px;margin:0 auto 12px;display:block;border:1px solid var(--cor-borda-forte);border-radius:8px;';

        const instrucoes = document.createElement('p');
        instrucoes.style.cssText = 'font-size:.85rem;color:var(--cor-texto-suave);margin-bottom:8px;';
        instrucoes.textContent = cobranca.instrucoes;

        const inputPix = document.createElement('input');
        inputPix.type = 'text';
        inputPix.id = 'pix-copia-cola';
        inputPix.value = cobranca.pixCopiaECola;
        inputPix.readOnly = true;
        inputPix.style.cssText = 'font-size:.75rem;margin-bottom:8px;text-align:center;width:100%;';
        inputPix.onclick = () => inputPix.select();

        const botaoCopiar = document.createElement('button');
        botaoCopiar.type = 'button';
        botaoCopiar.className = 'btn btn-primary btn-block';
        botaoCopiar.id = 'btn-copiar-pix';
        botaoCopiar.textContent = '📋 Copiar Código PIX';
        botaoCopiar.onclick = (e) => copiarPixCopiaECola(e.currentTarget);

        caixaConteudo.append(imgQr, instrucoes, inputPix, botaoCopiar);

    } else if (cobranca.tipo === "CRIPTO") {
        const imgQr = document.createElement('img');
        imgQr.src = cobranca.qrCodeUrl;
        imgQr.alt = "QR Code Cripto";
        imgQr.style.cssText = 'width:180px;height:180px;margin:0 auto 10px;display:block;border-radius:8px;';

        const valorTexto = document.createElement('p');
        valorTexto.innerHTML = `<strong>Transferir:</strong> ${escaparHtml(cobranca.quantidadeEstimada)} ${escaparHtml(cobranca.moeda)}`;

        const carteiraTexto = document.createElement('p');
        carteiraTexto.style.cssText = 'font-size:.75rem;color:var(--cor-texto-suave);word-break:break-all;margin:6px 0;';
        carteiraTexto.innerHTML = `<strong>Carteira:</strong><br>${escaparHtml(cobranca.carteiraDestino)}`;

        const botaoCopiar = document.createElement('button');
        botaoCopiar.type = 'button';
        botaoCopiar.className = 'btn btn-primary btn-block';
        botaoCopiar.textContent = '📋 Copiar Carteira';
        botaoCopiar.onclick = (e) => {
            navigator.clipboard.writeText(cobranca.carteiraDestino);
            const btn = e.currentTarget;
            const original = btn.textContent;
            btn.textContent = '✓ Carteira Copiada!';
            btn.classList.add('btn-adicionado');
            setTimeout(() => {
                btn.textContent = original;
                btn.classList.remove('btn-adicionado');
            }, 1800);
            exibirToast("Carteira copiada com sucesso!", "success");
        };

        caixaConteudo.append(imgQr, valorTexto, carteiraTexto, botaoCopiar);

    } else if (cobranca.tipo === "CARTAO") {
        const instrucoes = document.createElement('p');
        instrucoes.style.cssText = 'margin-bottom:12px;';
        instrucoes.textContent = cobranca.instrucoes;

        const linkCheckout = document.createElement('a');
        linkCheckout.href = cobranca.urlCheckout;
        linkCheckout.target = '_blank';
        linkCheckout.className = 'btn btn-success btn-block';
        linkCheckout.style.cssText = 'text-decoration:none;display:block;';
        linkCheckout.textContent = '🔒 Ir para Pagamento Seguro';

        caixaConteudo.append(instrucoes, linkCheckout);
    }

    abrirConfirmacaoElemento(`Pagamento Pedido #${idPedido}`, caixaConteudo, () => {
        carregarMeusPedidos();
    });
}
/* ─── FIM: abrirCobrancaPedido ───────────────────────────────── */

/* ─── INÍCIO: copiarPixCopiaECola ────────────────────────────── */
function copiarPixCopiaECola(btnElemento = null) {
    const input = document.getElementById('pix-copia-cola');
    if (!input) return;
    input.select();

    const aplicarFeedback = () => {
        if (btnElemento) {
            const txtOriginal = btnElemento.textContent;
            btnElemento.textContent = '✓ Copiado! Abra o app do seu banco';
            btnElemento.classList.add('btn-adicionado');
            setTimeout(() => {
                btnElemento.textContent = txtOriginal;
                btnElemento.classList.remove('btn-adicionado');
            }, 2200);
        }
        exibirToast("Código PIX copiado com sucesso!", "success");
    };

    navigator.clipboard.writeText(input.value)
        .then(aplicarFeedback)
        .catch(() => {
            document.execCommand('copy');
            aplicarFeedback();
        });
}
/* ─── FIM: copiarPixCopiaECola ───────────────────────────────── */

/* ─── INÍCIO: abrirChatPedido ────────────────────────────────── */
async function abrirChatPedido(pedidoId) {
    pedidoChatAberto = pedidoId;
    totalMensagensChatAnterior = 0;
    const elementoTitulo = document.getElementById('chat-pedido-id');
    const caixaMensagens = document.getElementById('chat-mensagens');

    if (elementoTitulo) elementoTitulo.textContent = '#' + pedidoId;
    if (caixaMensagens) caixaMensagens.innerHTML = '<div class="loading-slot">Carregando mensagens...</div>';

    abrirModal('modal-chat');
    await renderizarChat();
    iniciarAutoRefreshChat();
}
/* ─── FIM: abrirChatPedido ───────────────────────────────────── */

/* ─── INÍCIO: iniciarAutoRefreshChat ─────────────────────────── */
function iniciarAutoRefreshChat() {
    pararAutoRefreshChat();
    _timerChat = setInterval(async () => {
        if (!pedidoChatAberto || document.hidden) return;
        await renderizarChat(true);
    }, 6000);
}
/* ─── FIM: iniciarAutoRefreshChat ─────────────────────────────── */

/* ─── INÍCIO: pararAutoRefreshChat ───────────────────────────── */
function pararAutoRefreshChat() {
    if (_timerChat) {
        clearInterval(_timerChat);
        _timerChat = null;
    }
}
/* ─── FIM: pararAutoRefreshChat ───────────────────────────────── */

/* ─── INÍCIO: renderizarChat ─────────────────────────────────── */
async function renderizarChat(silencioso = false) {
    if (!pedidoChatAberto) return;
    const caixaMensagens = document.getElementById('chat-mensagens');
    if (!caixaMensagens) return;

    const resposta = await executarRequisicaoAPI("chat_listar", {
        idPedido: pedidoChatAberto
    });

    if (!resposta.sucesso || !resposta.mensagens || resposta.mensagens.length === 0) {
        if (!silencioso) caixaMensagens.innerHTML = '<div class="loading-slot">Sem mensagens ainda.</div>';
        return;
    }

    const novas = resposta.mensagens.length;
    if (totalMensagensChatAnterior > 0 && novas > totalMensagensChatAnterior) {
        const ultima = resposta.mensagens[novas - 1];
        if (ultima && ultima.autorNome !== estadoSessao.nomeUsuario) {
            tocarSomNotificacao('mensagem');
        }
    }
    totalMensagensChatAnterior = novas;

    const estavaNoFim = (caixaMensagens.scrollHeight - caixaMensagens.scrollTop) <= (caixaMensagens.clientHeight + 50);
    caixaMensagens.innerHTML = '';

    resposta.mensagens.forEach(mensagem => {
        const bolha = document.createElement('div');
        const ehMinha = (mensagem.autorNome === estadoSessao.nomeUsuario) ||
                        (estadoSessao.papel === 'adm' && mensagem.autorNome === 'Administração');

        bolha.className = 'chat-msg ' + (ehMinha ? 'chat-msg--out' : 'chat-msg--in');

        const texto = document.createElement('span');
        texto.textContent = mensagem.texto || '';

        const meta = document.createElement('span');
        meta.className = 'meta';
        meta.textContent = mensagem.autorNome || (ehMinha ? 'Você' : 'Atendimento');

        bolha.append(texto, meta);
        caixaMensagens.appendChild(bolha);
    });

    if (estavaNoFim || !silencioso) {
        caixaMensagens.scrollTop = caixaMensagens.scrollHeight;
    }
}
/* ─── FIM: renderizarChat ─────────────────────────────────────── */

/* ─── INÍCIO: enviarMensagemChat ─────────────────────────────── */
async function enviarMensagemChat() {
    const inputTexto = document.getElementById('chat-input');
    if (!inputTexto) return;
    const texto = inputTexto.value.trim();
    if (!texto) return;

    botaoCarregando('btn-chat-enviar', true);
    const resposta = await executarRequisicaoAPI("chat_enviar", {
        idPedido: pedidoChatAberto,
        autorNome: estadoSessao.nomeUsuario,
        texto
    });
    botaoCarregando('btn-chat-enviar', false);

    if (resposta.sucesso) {
        inputTexto.value = '';
        await renderizarChat();
    } else {
        exibirToast(resposta.mensagem || "Falha ao enviar mensagem.", "error");
    }
}
/* ─── FIM: enviarMensagemChat ─────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   11. PAINEL CENTRAL, LOTE E RELATÓRIO PDF (ADM)
   ═══════════════════════════════════════════════════════════════ */

/* ─── INÍCIO: carregarPainelCentralAdm ───────────────────────── */
async function carregarPainelCentralAdm() {
    if (estadoSessao.papel !== 'adm') return;

    await consultarStatusAcessoSistema();

    // 1. Cadastros Pendentes
    const divSolicitacoes = document.getElementById('adm-solicitacoes-lista');
    const toolbarLote = document.getElementById('adm-lote-toolbar');
    if (divSolicitacoes) divSolicitacoes.innerHTML = '<div class="loading-slot">Procurando novos cadastros...</div>';

    const respostaSolic = await executarRequisicaoAPI("listar_solicitacoes_adm");
    const totalPendentes = (respostaSolic.sucesso && Array.isArray(respostaSolic.solicitacoes)) ? respostaSolic.solicitacoes.length : 0;
    atualizarBadgePendentesAdm(totalPendentes);

    if (divSolicitacoes) {
        divSolicitacoes.innerHTML = '';
        if (totalPendentes > 0) {
            if (toolbarLote) toolbarLote.classList.remove('hidden');

            respostaSolic.solicitacoes.forEach(solicitacao => {
                const linha = document.createElement('div');
                linha.style.cssText = 'padding:10px 0;border-bottom:1px solid var(--cor-borda);display:flex;align-items:flex-start;gap:10px;';

                const chk = document.createElement('input');
                chk.type = 'checkbox';
                chk.className = 'chk-solicitacao-item';
                chk.value = solicitacao.id;
                chk.style.cssText = 'width:auto;margin-top:4px;';

                const info = document.createElement('div');
                info.style.flex = '1';
                info.innerHTML = `
                    <p><strong>${escaparHtml(solicitacao.nome)}</strong> (Login: ${escaparHtml(solicitacao.telefone)})</p>
                    <p style="font-size:.78rem;color:var(--cor-texto-suave);">
                        Twitter: ${escaparHtml(solicitacao.twitter || '-')} | Telegram: ${escaparHtml(solicitacao.telegram || '-')}
                    </p>
                `;

                const botaoAprovar = document.createElement('button');
                botaoAprovar.className = 'btn btn-success btn-sm';
                botaoAprovar.style.marginTop = '4px';
                botaoAprovar.textContent = 'Aprovar';
                botaoAprovar.onclick = () => aprovarMembroAdm(solicitacao.id);

                linha.append(chk, info, botaoAprovar);
                divSolicitacoes.appendChild(linha);
            });
        } else {
            if (toolbarLote) toolbarLote.classList.add('hidden');
            divSolicitacoes.innerHTML = '<div class="loading-slot">Nenhuma solicitação pendente.</div>';
        }
    }
    atualizarContadorSelecaoLote();

    // 2. Usuários Ativos
    const divUsuarios = document.getElementById('adm-usuarios-lista');
    if (divUsuarios) {
        divUsuarios.innerHTML = '<div class="loading-slot">Carregando usuários ativos...</div>';
        const respostaUsuarios = await executarRequisicaoAPI("listar_usuarios_adm");
        divUsuarios.innerHTML = '';

        if (respostaUsuarios.sucesso && Array.isArray(respostaUsuarios.usuarios) && respostaUsuarios.usuarios.length > 0) {
            let html = '<table class="tabela-metricas"><thead><tr><th>Primeiro Nome</th><th>Login/WhatsApp</th><th>Papel</th></tr></thead><tbody>';
            respostaUsuarios.usuarios.forEach(u => {
                html += `<tr>
                    <td><strong>${escaparHtml(u.primeiroNome)}</strong> <small style="color:var(--cor-texto-suave);">(${escaparHtml(u.nomeCompleto)})</small></td>
                    <td>${escaparHtml(u.telefone)}</td>
                    <td><span class="badge badge-${u.papel}">${escaparHtml(u.papel.toUpperCase())}</span></td>
                </tr>`;
            });
            html += '</tbody></table>';
            divUsuarios.innerHTML = html;
        } else {
            divUsuarios.innerHTML = '<div class="loading-slot">Nenhum usuário ativo registrado no momento.</div>';
        }
    }

    // 3. Métricas Gerais
    const respostaMetricas = await executarRequisicaoAPI("obter_metricas_vendas");
    if (respostaMetricas.sucesso) {
        const elementoFaturamento = document.getElementById('metric-faturamento');
        const elementoPedidos = document.getElementById('metric-pedidos');
        if (elementoFaturamento) elementoFaturamento.textContent = fmtPreco(respostaMetricas.faturamentoTotal || 0);
        if (elementoPedidos) elementoPedidos.textContent = respostaMetricas.totalPedidos || 0;

        const divTabela = document.getElementById('tabela-metricas-produtos');
        if (divTabela) {
            if (!respostaMetricas.itensDetalhados || respostaMetricas.itensDetalhados.length === 0) {
                divTabela.innerHTML = '<div class="loading-slot">Sem vendas registradas ainda.</div>';
            } else {
                let html = '<table class="tabela-metricas"><thead><tr><th>Produto</th><th>Qtd</th></tr></thead><tbody>';
                respostaMetricas.itensDetalhados.forEach(item => {
                    html += `<tr><td>${escaparHtml(item.nome)}</td><td><strong>${Number(item.quantidadeVendida) || 0} un</strong></td></tr>`;
                });
                html += '</tbody></table>';
                divTabela.innerHTML = html;
            }
        }
    }

    // 4. Contas Bloqueadas
    const respostaBloqueados = await executarRequisicaoAPI("listar_bloqueados_adm");
    const divBloqueados = document.getElementById('adm-bloqueados-lista');
    if (divBloqueados) {
        divBloqueados.innerHTML = '';
        if (respostaBloqueados.sucesso && Array.isArray(respostaBloqueados.contas) && respostaBloqueados.contas.length > 0) {
            respostaBloqueados.contas.forEach(conta => {
                const linha = document.createElement('div');
                linha.style.padding = '6px 0';
                linha.innerHTML = `<p style="color:#b91c1c;"><strong>${escaparHtml(conta.identificador)}</strong> (${Number(conta.erros) || 0} falhas)</p>`;

                const botaoLiberar = document.createElement('button');
                botaoLiberar.className = 'btn btn-primary btn-sm';
                botaoLiberar.textContent = 'Liberar Conta';
                botaoLiberar.onclick = () => liberarContaUsuarioAdm(conta.identificador);
                linha.appendChild(botaoLiberar);

                divBloqueados.appendChild(linha);
            });
        } else {
            divBloqueados.innerHTML = '<div class="loading-slot">Nenhuma conta bloqueada.</div>';
        }
    }

    // 5. Mensagens Recebidas
    const respostaComentarios = await executarRequisicaoAPI("listar_comentarios_adm");
    const divComentarios = document.getElementById('adm-comentarios-lista');
    if (divComentarios) {
        divComentarios.innerHTML = '';
        if (respostaComentarios.sucesso && Array.isArray(respostaComentarios.comentarios) && respostaComentarios.comentarios.length > 0) {
            respostaComentarios.comentarios.forEach(comentario => {
                const paragrafo = document.createElement('p');
                paragrafo.style.cssText = 'font-size:.8rem;padding:6px 0;border-bottom:1px solid var(--cor-borda);';
                const dataFormatada = comentario.data ? new Date(comentario.data).toLocaleString() : '';
                paragrafo.innerHTML = `<strong>${escaparHtml(comentario.nome || 'Anônimo')}</strong> <small style="color:var(--cor-texto-suave);">${escaparHtml(dataFormatada)}</small><br>${escaparHtml(comentario.texto || '')}`;
                divComentarios.appendChild(paragrafo);
            });
        } else {
            divComentarios.innerHTML = '<div class="loading-slot">Sem mensagens.</div>';
        }
    }
}
/* ─── FIM: carregarPainelCentralAdm ─────────────────────────── */

/* ─── INÍCIO: atualizarContadorSelecaoLote ───────────────────── */
function atualizarContadorSelecaoLote() {
    const selecionados = document.querySelectorAll('.chk-solicitacao-item:checked');
    const labelContador = document.getElementById('count-selecionados-lote');
    const chkMaster = document.getElementById('chk-selecionar-todos-cadastros');
    const todos = document.querySelectorAll('.chk-solicitacao-item');

    if (labelContador) labelContador.textContent = selecionados.length;
    if (chkMaster && todos.length > 0) {
        chkMaster.checked = (selecionados.length === todos.length);
    }
}
/* ─── FIM: atualizarContadorSelecaoLote ───────────────────────── */

/* ─── INÍCIO: aprovarSolicitacoesSelecionadasLote ─────────────── */
async function aprovarSolicitacoesSelecionadasLote() {
    const selecionados = Array.from(document.querySelectorAll('.chk-solicitacao-item:checked')).map(c => c.value);

    if (selecionados.length === 0) {
        return exibirToast("Selecione pelo menos um cadastro para aprovação.", "info");
    }

    mostrarLoader(`Aprovando ${selecionados.length} membros em lote...`);
    const res = await executarRequisicaoAPI("aprovar_cadastros_lote", {
        idsSolicitacoes: selecionados
    });
    esconderLoader();

    if (res.sucesso) {
        exibirToast(res.mensagem || `${selecionados.length} membros aprovados com sucesso!`, "success");
        await carregarPainelCentralAdm();
    } else {
        exibirToast(res.mensagem || "Erro ao aprovar cadastros em lote.", "error");
    }
}
/* ─── FIM: aprovarSolicitacoesSelecionadasLote ─────────────────── */

/* ─── INÍCIO: gerarRelatorioPdfVendas (Diário) ───────────────── */
async function gerarRelatorioPdfVendas() {
    if (estadoSessao.papel !== 'adm') return;

    mostrarLoader("Gerando relatório diário de vendas...");

    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    const dataRef = `${ano}-${mes}-${dia}`;

    const resposta = await executarRequisicaoAPI("obter_relatorio_diario_adm", { dataRef });
    esconderLoader();

    if (!resposta.sucesso) {
        return exibirToast(resposta.mensagem || "Não foi possível carregar os dados do relatório.", "error");
    }

    imprimirRelatorioAnaliticoIframe(resposta);
}
/* ─── FIM: gerarRelatorioPdfVendas ───────────────────────────── */

/* ─── INÍCIO: imprimirRelatorioAnaliticoIframe ───────────────── */
function imprimirRelatorioAnaliticoIframe(relatorio) {
    const horaEmissao = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    let linhasItens = '';
    if (relatorio.itens && relatorio.itens.length > 0) {
        relatorio.itens.forEach((it, idx) => {
            linhasItens += `
                <tr>
                    <td style="text-align:center;width:40px;">${idx + 1}</td>
                    <td><strong>${escaparHtml(it.nome)}</strong></td>
                    <td style="text-align:center;font-weight:bold;">${it.quantidade} un</td>
                    <td style="text-align:right;">${fmtPreco(it.precoUnitario)}</td>
                    <td style="text-align:right;font-weight:bold;">${fmtPreco(it.totalVendido)}</td>
                </tr>
            `;
        });
    } else {
        linhasItens = `<tr><td colspan="5" style="text-align:center;padding:16px;color:#666;">Nenhum produto vendido nesta data.</td></tr>`;
    }

    let linhasPedidos = '';
    if (relatorio.pedidos && relatorio.pedidos.length > 0) {
        relatorio.pedidos.forEach(ped => {
            linhasPedidos += `
                <tr>
                    <td><strong>#${escaparHtml(ped.id)}</strong></td>
                    <td style="text-align:center;">${escaparHtml(ped.hora)}</td>
                    <td style="text-align:center;">${escaparHtml(ped.metodo)}</td>
                    <td style="text-align:center;"><span class="tag-status">${escaparHtml(ped.status)}</span></td>
                    <td style="text-align:right;font-weight:bold;">${fmtPreco(ped.total)}</td>
                </tr>
            `;
        });
    } else {
        linhasPedidos = `<tr><td colspan="5" style="text-align:center;padding:16px;color:#666;">Nenhum pedido registrado nesta data.</td></tr>`;
    }

    const htmlRelatorio = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Relatorio_Vendas_${relatorio.data.replace(/\//g, '-')}</title>
            <style>
                @page { size: A4; margin: 15mm; }
                * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
                body { margin: 0; padding: 0; color: #0f172a; font-size: 12px; }
                .cabecalho { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
                .titulo-empresa { font-size: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: -0.5px; }
                .subtitulo { font-size: 12px; color: #475569; margin-top: 2px; }
                .meta-emissao { text-align: right; font-size: 11px; color: #475569; }
                
                .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
                .kpi-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; background: #f8fafc; }
                .kpi-rotulo { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
                .kpi-valor { font-size: 18px; font-weight: 800; margin-top: 4px; color: #0f172a; }
                .kpi-valor.destaque { color: #16a34a; }

                .secao-titulo { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin: 16px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11px; }
                th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; font-weight: 700; color: #334155; }
                td { border: 1px solid #e2e8f0; padding: 6px 8px; }
                .tag-status { display: inline-block; padding: 2px 6px; font-size: 9px; font-weight: 700; border-radius: 4px; background: #e2e8f0; }

                .rodape { margin-top: 28px; border-top: 1px dashed #cbd5e1; padding-top: 10px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b; }
            </style>
        </head>
        <body>
            <div class="cabecalho">
                <div>
                    <div class="titulo-empresa">LojaSegura — Fechamento Diário</div>
                    <div class="subtitulo">Relatório Detalhado de Vendas e Saída de Itens</div>
                </div>
                <div class="meta-emissao">
                    <strong>Data:</strong> ${relatorio.data}<br>
                    <strong>Emitido às:</strong> ${horaEmissao}
                </div>
            </div>

            <div class="kpi-grid">
                <div class="kpi-card">
                    <div class="kpi-rotulo">Faturamento Total do Dia</div>
                    <div class="kpi-valor destaque">${fmtPreco(relatorio.faturamento)}</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-rotulo">Pedidos Concluídos / Ativos</div>
                    <div class="kpi-valor">${relatorio.totalPedidos}</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-rotulo">Ticket Médio do Dia</div>
                    <div class="kpi-valor">${fmtPreco(relatorio.ticketMedio)}</div>
                </div>
            </div>

            <div class="secao-titulo">1. Balanço de Produtos Vendidos (Saída de Estoque)</div>
            <table>
                <thead>
                    <tr>
                        <th style="text-align:center;">#</th>
                        <th>Produto</th>
                        <th style="text-align:center;">Qtd Vendida</th>
                        <th style="text-align:right;">Preço Unitário</th>
                        <th style="text-align:right;">Total Faturado</th>
                    </tr>
                </thead>
                <tbody>
                    ${linhasItens}
                </tbody>
            </table>

            <div class="secao-titulo">2. Relação Individual de Pedidos do Dia</div>
            <table>
                <thead>
                    <tr>
                        <th>Cód. Pedido</th>
                        <th style="text-align:center;">Horário</th>
                        <th style="text-align:center;">Pagamento</th>
                        <th style="text-align:center;">Status</th>
                        <th style="text-align:right;">Valor</th>
                    </tr>
                </thead>
                <tbody>
                    ${linhasPedidos}
                </tbody>
            </table>

            <div class="rodape">
                <span>Relatório analítico gerado para conferência administrativa.</span>
                <span>Documento confidencial — Uso interno</span>
            </div>
        </body>
        </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    iframe.contentDocument.open();
    iframe.contentDocument.write(htmlRelatorio);
    iframe.contentDocument.close();

    iframe.contentWindow.focus();
    setTimeout(() => {
        iframe.contentWindow.print();
        setTimeout(() => iframe.remove(), 2000);
    }, 400);
}
/* ─── FIM: imprimirRelatorioAnaliticoIframe ───────────────── */

/* ─── INÍCIO: aprovarMembroAdm ───────────────────────────────── */
async function aprovarMembroAdm(idSolicitacao) {
    mostrarLoader("Aprovando membro...");
    const resposta = await executarRequisicaoAPI("aprovar_cadastro", { idSolicitacao });
    esconderLoader();

    if (resposta.sucesso) {
        exibirToast(resposta.mensagem || "Membro aprovado com sucesso!", "success");
        await carregarPainelCentralAdm();
    } else {
        exibirToast(resposta.mensagem || "Erro ao aprovar membro.", "error");
    }
}
/* ─── FIM: aprovarMembroAdm ───────────────────────────────────── */

/* ─── INÍCIO: liberarContaUsuarioAdm ─────────────────────────── */
async function liberarContaUsuarioAdm(identificador) {
    const resposta = await executarRequisicaoAPI("liberar_conta_adm", { identificador });
    if (resposta.sucesso) {
        exibirToast(resposta.mensagem || "Conta liberada com sucesso.", "success");
        await carregarPainelCentralAdm();
    }
}
/* ─── FIM: liberarContaUsuarioAdm ─────────────────────────────── */

/* ─── INÍCIO: atualizarBadgePendentesAdm ─────────────────────── */
function atualizarBadgePendentesAdm(quantidade) {
    const botaoAdm = document.getElementById('tab-btn-adm');
    if (!botaoAdm) return;

    const badgeAntigo = botaoAdm.querySelector('.badge-pendentes');
    if (badgeAntigo) badgeAntigo.remove();

    if (quantidade > 0) {
        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'badge-pendentes';
        badgeSpan.textContent = quantidade;
        badgeSpan.style.cssText =
            'display:inline-block;min-width:18px;margin-left:6px;padding:0 5px;' +
            'background:#ef4444;color:#fff;border-radius:999px;font-size:.7rem;' +
            'font-weight:700;text-align:center;line-height:18px;';
        botaoAdm.appendChild(badgeSpan);
    }
}
/* ─── FIM: atualizarBadgePendentesAdm ─────────────────────────── */

/* ─── INÍCIO: consultarPendentesAdm ──────────────────── */
async function consultarPendentesAdm() {
    if (estadoSessao.papel !== 'adm') return;
    try {
        const resposta = await executarRequisicaoAPI("listar_solicitacoes_adm");
        const total = (resposta.sucesso && Array.isArray(resposta.solicitacoes)) ? resposta.solicitacoes.length : 0;
        atualizarBadgePendentesAdm(total);
    } catch (e) {}
}
/* ─── FIM: consultarPendentesAdm ─────────────────────── */

/* ─── INÍCIO: ligarAutoRefreshAdm ────────────────────────────── */
function ligarAutoRefreshAdm() {
    desligarAutoRefreshAdm();
    if (estadoSessao.papel !== 'adm') return;
    consultarPendentesAdm();

    _timerPainelAdm = setInterval(() => {
        if (estadoSessao.papel !== 'adm' || document.hidden) return;
        consultarPendentesAdm();
        consultarStatusAcessoSistema();
    }, 25000);
}
/* ─── FIM: ligarAutoRefreshAdm ───────────────────────────────── */

/* ─── INÍCIO: desligarAutoRefreshAdm ─────────────────────────── */
function desligarAutoRefreshAdm() {
    if (_timerPainelAdm) {
        clearInterval(_timerPainelAdm);
        _timerPainelAdm = null;
    }
}
/* ─── FIM: desligarAutoRefreshAdm ─────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   12. PIPELINE DE PEDIDOS COM ALERTA SONORO (ADM)
   ═══════════════════════════════════════════════════════════════ */

/* ─── INÍCIO: carregarPedidosAdm ─────────────────────────────── */
async function carregarPedidosAdm() {
    const colunaAnalise     = document.getElementById('pipe-analise');
    const colunaSolicitados = document.getElementById('pipe-solicitados');
    const colunaViagem      = document.getElementById('pipe-viagem');
    const colunaConcluido   = document.getElementById('pipe-concluido');

    [colunaAnalise, colunaSolicitados, colunaViagem, colunaConcluido].forEach(coluna => {
        if (coluna) coluna.innerHTML = '<div class="loading-slot">…</div>';
    });

    const resposta = await executarRequisicaoAPI("listar_pedidos_adm");
    if (colunaAnalise)     colunaAnalise.innerHTML = '';
    if (colunaSolicitados) colunaSolicitados.innerHTML = '';
    if (colunaViagem)      colunaViagem.innerHTML = '';
    if (colunaConcluido)   colunaConcluido.innerHTML = '';

    if (resposta.sucesso && Array.isArray(resposta.pedidos)) {
        const emAnalise = resposta.pedidos.filter(p => String(p.status).toLowerCase() === 'analise').length;
        if (totalPedidosAnaliseAnterior > 0 && emAnalise > totalPedidosAnaliseAnterior) {
            tocarSomNotificacao('pedido');
        }
        totalPedidosAnaliseAnterior = emAnalise;

        resposta.pedidos.forEach(pedido => {
            const divCartao = document.createElement('div');
            divCartao.style.cssText = 'background:var(--cor-fundo-card);padding:8px;margin-bottom:8px;border-radius:6px;border:1px solid var(--cor-borda);';

            divCartao.innerHTML = `
                <small><strong>${escaparHtml(pedido.id)}</strong></small><br>
                <small>${fmtPreco(pedido.total)}</small><br>
                <small style="color:var(--cor-texto-suave);">Forma: ${escaparHtml(pedido.metodo || 'PIX')}</small>
            `;

            const painelBotoes = document.createElement('div');
            painelBotoes.style.cssText = 'display:flex;gap:4px;margin-top:6px;';

            if (pedido.status !== 'concluido') {
                const botaoAvancar = document.createElement('button');
                botaoAvancar.className = 'btn btn-primary btn-sm';
                botaoAvancar.textContent = 'Avançar';
                botaoAvancar.onclick = () => avancarStatusAdm(pedido.id, pedido.status);
                painelBotoes.appendChild(botaoAvancar);
            }

            const botaoChatAdm = document.createElement('button');
            botaoChatAdm.className = 'btn btn-outline-dark btn-sm';
            botaoChatAdm.textContent = '💬';
            botaoChatAdm.title = 'Abrir Chat';
            botaoChatAdm.onclick = () => abrirChatPedido(pedido.id);
            painelBotoes.appendChild(botaoChatAdm);

            divCartao.appendChild(painelBotoes);

            if (pedido.status === 'analise'     && colunaAnalise)     colunaAnalise.appendChild(divCartao);
            if (pedido.status === 'solicitados' && colunaSolicitados) colunaSolicitados.appendChild(divCartao);
            if (pedido.status === 'viagem'      && colunaViagem)      colunaViagem.appendChild(divCartao);
            if (pedido.status === 'concluido'   && colunaConcluido)   colunaConcluido.appendChild(divCartao);
        });
    }

    [[colunaAnalise], [colunaSolicitados], [colunaViagem], [colunaConcluido]].forEach(([coluna]) => {
        if (coluna && !coluna.children.length) {
            coluna.innerHTML = `<div class="loading-slot" style="font-size:.75rem;">Sem pedidos</div>`;
        }
    });
}
/* ─── FIM: carregarPedidosAdm ─────────────────────────────────── */

/* ─── INÍCIO: avancarStatusAdm ───────────────────────────────── */
async function avancarStatusAdm(idPedido, statusAtual) {
    let proximoStatus = 'solicitados';
    if (statusAtual === 'solicitados') proximoStatus = 'viagem';
    if (statusAtual === 'viagem')      proximoStatus = 'concluido';

    const resposta = await executarRequisicaoAPI("atualizar_status_pedido", {
        idPedido: idPedido,
        novoStatus: proximoStatus
    });

    if (resposta.sucesso) {
        exibirToast("Status do pedido atualizado!", "success");
        await carregarPedidosAdm();
    } else {
        exibirToast(resposta.mensagem || "Erro ao atualizar status.", "error");
    }
}
/* ─── FIM: avancarStatusAdm ──────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   13. LINKS TEMPORÁRIOS, FOTOS E CADASTRO DE PRODUTOS
   ═══════════════════════════════════════════════════════════════ */

/* ─── INÍCIO: gerarLinkTemporarioAdm ─────────────────────────── */
async function gerarLinkTemporarioAdm() {
    const selectDuracao = document.getElementById('select-duracao-link');
    const inputPersonalizado = document.getElementById('input-duracao-personalizada');

    let minutosFinais = 15;

    if (selectDuracao && selectDuracao.value === 'personalizado') {
        minutosFinais = parseInt(inputPersonalizado.value, 10);
        if (isNaN(minutosFinais) || minutosFinais <= 0) {
            return exibirToast("Digite um número de minutos válido maior que zero.", "error");
        }
    } else if (selectDuracao) {
        minutosFinais = parseInt(selectDuracao.value, 10) || 15;
    }

    mostrarLoader(`Gerando link para ${minutosFinais} minutos...`);

    const resposta = await executarRequisicaoAPI("gerar_link_temporario", {
        duracaoMinutos: minutosFinais
    });
    esconderLoader();

    if (resposta.sucesso) {
        const linkCompleto = `${obterUrlBasePlataforma()}?token=${resposta.token}`;
        const campoLink = document.getElementById('campo-link-gerado');
        const areaLink = document.getElementById('area-link-gerado');

        if (campoLink) campoLink.value = linkCompleto;
        if (areaLink) areaLink.classList.remove('hidden');

        exibirToast(`Link exclusivo gerado (${minutosFinais} min)!`, "success");
    } else {
        exibirToast(resposta.mensagem || "Falha ao gerar o link.", "error");
    }
}
/* ─── FIM: gerarLinkTemporarioAdm ─────────────────────────────── */

/* ─── INÍCIO: copiarLinkGerado ───────────────────────────────── */
function copiarLinkGerado() {
    const campo = document.getElementById('campo-link-gerado');
    if (!campo) return;
    campo.select();
    navigator.clipboard.writeText(campo.value)
        .then(() => exibirToast("Link copiado para a área de transferência!", "success"))
        .catch(() => {
            document.execCommand("copy");
            exibirToast("Link copiado!", "success");
        });
}
/* ─── FIM: copiarLinkGerado ───────────────────────────────────── */

/* ─── INÍCIO: processarUploadImagem ─────────────────────────── */
function processarUploadImagem(evento) {
    const ficheiro = evento.target.files[0];
    if (!ficheiro) return;

    if (ficheiro.type === "image/gif") {
        if (ficheiro.size > 200 * 1024) {
            exibirToast("O GIF é muito pesado. Escolha um ficheiro de até 200KB.", "error");
            evento.target.value = "";
            return;
        }
        const leitor = new FileReader();
        leitor.onload = e => {
            fotoBase64Temporaria = e.target.result;
            exibirPreviewImagem(fotoBase64Temporaria);
        };
        leitor.readAsDataURL(ficheiro);
        return;
    }

    const leitor = new FileReader();
    leitor.onload = e => {
        const imagem = new Image();
        imagem.onload = () => {
            const canvas = document.createElement('canvas');
            const LIMITE_MAX = 350;
            let { width: largura, height: altura } = imagem;

            if (largura > altura && largura > LIMITE_MAX) {
                altura *= LIMITE_MAX / largura;
                largura = LIMITE_MAX;
            } else if (altura >= largura && altura > LIMITE_MAX) {
                largura *= LIMITE_MAX / altura;
                altura = LIMITE_MAX;
            }

            canvas.width = largura;
            canvas.height = altura;
            const contexto = canvas.getContext('2d');
            contexto.drawImage(imagem, 0, 0, largura, altura);

            fotoBase64Temporaria = canvas.toDataURL('image/jpeg', 0.7);
            exibirPreviewImagem(fotoBase64Temporaria);
        };
        imagem.src = e.target.result;
    };
    leitor.readAsDataURL(ficheiro);
}
/* ─── FIM: processarUploadImagem ─────────────────────────────── */

/* ─── INÍCIO: exibirPreviewImagem ───────────────────────────── */
function exibirPreviewImagem(origemBase64) {
    const imgPreview = document.getElementById('img-preview');
    const containerPreview = document.getElementById('preview-container');
    const inputUrl = document.getElementById('adm-prod-foto-url');

    if (imgPreview) imgPreview.src = origemBase64;
    if (containerPreview) containerPreview.classList.remove('hidden');
    if (inputUrl) inputUrl.value = "";
}
/* ─── FIM: exibirPreviewImagem ───────────────────────────────── */

/* ─── INÍCIO: removerFotoCarregada ──────────────────────────── */
function removerFotoCarregada() {
    fotoBase64Temporaria = "";
    const containerPreview = document.getElementById('preview-container');
    const inputArquivo = document.getElementById('adm-prod-arquivo');
    const imgPreview = document.getElementById('img-preview');

    if (containerPreview) containerPreview.classList.add('hidden');
    if (inputArquivo) inputArquivo.value = "";
    if (imgPreview) imgPreview.src = "";
}
/* ─── FIM: removerFotoCarregada ─────────────────────────────── */

/* ─── INÍCIO: tratarCadastroProduto ─────────────────────────── */
async function tratarCadastroProduto(evento) {
    if (evento && evento.preventDefault) evento.preventDefault();

    const nome         = document.getElementById('adm-prod-nome').value.trim();
    const precoStr     = String(document.getElementById('adm-prod-preco').value || '').replace(',', '.');
    const preco        = parseFloat(precoStr);
    const visibilidade = document.getElementById('adm-prod-visibilidade').value;
    const urlFoto      = document.getElementById('adm-prod-foto-url').value.trim();
    const fotoFinal    = fotoBase64Temporaria || urlFoto || "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400";

    if (!nome || isNaN(preco) || preco <= 0) {
        return exibirToast("Preencha nome e preço válidos.", "error");
    }

    botaoCarregando('btn-salvar-produto', true);
    exibirToast("A guardar produto...", "info");

    const resposta = await executarRequisicaoAPI("cadastrar_produto", {
        produto: { nome, preco, foto: fotoFinal, visibilidade }
    });

    botaoCarregando('btn-salvar-produto', false);

    if (resposta.sucesso) {
        exibirToast("Produto adicionado ao catálogo!", "success");
        document.getElementById('form-novo-produto').reset();
        removerFotoCarregada();
        CacheLoja.limpar('produtos_adm');
        CacheLoja.limpar('produtos_membro');
        CacheLoja.limpar('produtos_visitante');
        await sincronizarProdutosServidor();
    } else {
        exibirToast(resposta.mensagem || "Erro ao salvar produto.", "error");
    }
}
/* ─── FIM: tratarCadastroProduto ─────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   14. AUTENTICAÇÃO, CADASTRO E CONTROLE DE SESSÃO
   ═══════════════════════════════════════════════════════════════ */

/* ─── INÍCIO: tratarSolicitacaoCadastro ──────────────────────── */
async function tratarSolicitacaoCadastro(evento) {
    if (evento && evento.preventDefault) evento.preventDefault();

    const nome      = document.getElementById('cad-nome').value.trim();
    const telefone  = extrairApenasDigitos(document.getElementById('cad-telefone').value);
    const senha     = document.getElementById('cad-senha').value;
    const senhaConf = document.getElementById('cad-senha-conf').value;
    const twitter   = document.getElementById('cad-twitter').value.trim();
    const telegram  = document.getElementById('cad-telegram').value.trim();

    if (telefone.length < 10) return exibirToast("Informe seu WhatsApp completo com DDD (ex: 74998048300).", "error");
    if (senha !== senhaConf) return exibirToast("As senhas digitadas não coincidem.", "error");
    if (senha.length < 6)    return exibirToast("A senha deve conter no mínimo 6 caracteres.", "error");

    botaoCarregando('btn-enviar-cadastro', true);
    exibirToast("A enviar solicitação...", "info");

    const resposta = await executarRequisicaoAPI("solicitar_cadastro", {
        nome, telefone, senha, twitter, telegram
    });

    botaoCarregando('btn-enviar-cadastro', false);

    if (resposta.sucesso) {
        exibirToast(resposta.mensagem || "Solicitação enviada com sucesso!", "success");
        document.getElementById('form-registro').reset();
        fecharModal('modal-cadastro');
    } else {
        exibirToast(resposta.mensagem || "Erro ao registrar solicitação.", "error");
    }
}
/* ─── FIM: tratarSolicitacaoCadastro ─────────────────────────── */

/* ─── INÍCIO: tratarLogin ────────────────────────────────────── */
async function tratarLogin(evento) {
    if (evento && evento.preventDefault) evento.preventDefault();

    const usuario = document.getElementById('login-usuario').value.trim();
    const senha   = document.getElementById('login-senha').value;
    identificadorEmTentativa = usuario;

    botaoCarregando('btn-entrar', true);

    const resposta = await executarRequisicaoAPI("login", { identificador: usuario, senha });

    botaoCarregando('btn-entrar', false);

    if (resposta.sucesso) {
        estadoSessao.papel        = resposta.papel;
        estadoSessao.token        = resposta.token;
        estadoSessao.refreshToken = resposta.refreshToken;
        estadoSessao.nomeUsuario  = resposta.nome;

        _linkAutorizadoValido = true;
        pararTemporizadorSilencioso();

        localStorage.setItem('plataforma_sessao', JSON.stringify(estadoSessao));

        document.getElementById('form-login').reset();
        document.getElementById('box-desbloqueio-conta').classList.add('hidden');
        fecharModal('modal-login');
        atualizarInterfaceSessao();

        CacheLoja.limpar('produtos_visitante');
        await sincronizarProdutosServidor();
        exibirToast(resposta.mensagem || `Bem-vindo(a), ${resposta.nome}!`, "success");
    } else {
        exibirToast(resposta.mensagem || "Credenciais inválidas.", "error");
        if (resposta.requerLiberacaoAdm) {
            document.getElementById('box-desbloqueio-conta').classList.remove('hidden');
        }
    }
}
/* ─── FIM: tratarLogin ───────────────────────────────────────── */

/* ─── INÍCIO: enviarPedidoDesbloqueio ────────────────────────── */
async function enviarPedidoDesbloqueio() {
    if (!identificadorEmTentativa) return;
    const resposta = await executarRequisicaoAPI("pedir_desbloqueio", { identificador: identificadorEmTentativa });
    if (resposta.sucesso) {
        exibirToast(resposta.mensagem || "Pedido de liberação enviado com sucesso.", "success");
        const btn = document.getElementById('btn-solicitar-desbloqueio');
        if (btn) btn.disabled = true;
    }
}
/* ─── FIM: enviarPedidoDesbloqueio ───────────────────────────── */

/* ─── INÍCIO: confirmarLogout ────────────────────────────────── */
function confirmarLogout() {
    abrirConfirmacao("Sair da conta", "Deseja realmente encerrar a sessão?", executarLogout);
}
/* ─── FIM: confirmarLogout ───────────────────────────────────── */

/* ─── INÍCIO: executarLogout ─────────────────────────────────── */
async function executarLogout() {
    const tokenLink = sessionStorage.getItem('plataforma_link_token');

    if (tokenLink) {
        mostrarLoader("Encerrando sessão...");
        try {
            await executarRequisicaoAPI("invalidar_link", { tokenAcesso: tokenLink });
        } catch (erro) {}
    } else {
        mostrarLoader("Encerrando sessão...");
    }

    executarLimpezaTotalESaida();
    esconderLoader();

    // Redirecionamento forçado para resetar completamente o estado da página
    const urlLimpa = window.location.origin + window.location.pathname;
    window.location.replace(urlLimpa);
}
/* ─── FIM: executarLogout ─────────────────────────────────────── */

/* ─── INÍCIO: restaurarSessaoLocal ───────────────────────────── */
function restaurarSessaoLocal() {
    const dadosSalvos = localStorage.getItem('plataforma_sessao');
    if (!dadosSalvos) return;
    try {
        const sessao = JSON.parse(dadosSalvos);
        estadoSessao.papel        = sessao.papel || 'visitante';
        estadoSessao.token        = sessao.token || null;
        estadoSessao.refreshToken = sessao.refreshToken || null;
        estadoSessao.nomeUsuario  = sessao.nomeUsuario || 'Visitante';

        if (estadoSessao.papel !== 'visitante') {
            _linkAutorizadoValido = true;
        }
    } catch (e) {
        localStorage.removeItem('plataforma_sessao');
    }
}
/* ─── FIM: restaurarSessaoLocal ───────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   15. CONTROLE VISUAL E NAVEGAÇÃO
   ═══════════════════════════════════════════════════════════════ */

/* ─── INÍCIO: atualizarInterfaceSessao ───────────────────────── */
function atualizarInterfaceSessao() {
    const anonBox        = document.getElementById('anon-buttons');
    const authBox        = document.getElementById('auth-buttons');
    const userLabel      = document.getElementById('user-display-name');
    const badge          = document.getElementById('role-badge');
    const navBar         = document.getElementById('app-nav-bar');
    const headerCartBtn  = document.getElementById('header-cart-btn');

    const viewBloqueado  = document.getElementById('view-bloqueado');
    const containerDuvidas = document.getElementById('container-duvidas-discreto');

    if (badge) {
        badge.textContent = estadoSessao.papel.toUpperCase();
        badge.className   = `badge badge-${estadoSessao.papel}`;
    }
    if (userLabel) {
        userLabel.textContent = estadoSessao.nomeUsuario || 'Olá';
    }
    atualizarAvatarUsuario();

    aplicarNavPorPapel(estadoSessao.papel);

    if (containerDuvidas) containerDuvidas.classList.add('hidden');

    if (!_linkAutorizadoValido && estadoSessao.papel === 'visitante') {
        if (navBar) navBar.classList.add('hidden');
        document.querySelectorAll('.view-panel').forEach(painel => {
            painel.classList.add('hidden');
            painel.classList.remove('active');
        });
        if (viewBloqueado) {
            viewBloqueado.classList.remove('hidden');
            viewBloqueado.classList.add('active');
        }
        if (anonBox) anonBox.classList.remove('hidden');
        if (authBox) authBox.classList.add('hidden');
        if (headerCartBtn) headerCartBtn.classList.add('hidden');
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
        if (headerCartBtn) headerCartBtn.classList.add('hidden');
    } else {
        if (anonBox) anonBox.classList.add('hidden');
        if (authBox) authBox.classList.remove('hidden');

        if (headerCartBtn) {
            if (estadoSessao.papel === 'membro') {
                headerCartBtn.classList.remove('hidden');
            } else {
                headerCartBtn.classList.add('hidden');
            }
        }
    }

    if (['membro', 'entregador', 'adm'].includes(estadoSessao.papel)) {
        if (containerDuvidas) containerDuvidas.classList.remove('hidden');
    }

    const algumPainelVisivel = document.querySelector('.view-panel.active:not(.hidden)');
    if (!algumPainelVisivel) navegarPara('vitrine');

    if (estadoSessao.papel === 'adm') {
        ligarAutoRefreshAdm();
    } else {
        desligarAutoRefreshAdm();
        atualizarBadgePendentesAdm(0);
    }

    atualizarBarraFlutuanteSacola();
}
/* ─── FIM: atualizarInterfaceSessao ───────────────────────────── */

/* ─── INÍCIO: navegarPara ────────────────────────────────────── */
function navegarPara(nomeAba) {
    document.querySelectorAll('.bottom-nav__item').forEach(botao => botao.classList.remove('active'));
    document.querySelectorAll('.view-panel').forEach(painel => painel.classList.remove('active'));

    const botaoAtivo  = document.getElementById(`tab-btn-${nomeAba}`);
    const painelAtivo = document.getElementById(`view-${nomeAba}`);

    if (botaoAtivo && painelAtivo) {
        botaoAtivo.classList.add('active');
        painelAtivo.classList.remove('hidden');
        painelAtivo.classList.add('active');
    }

    fecharUserDropdown();

    // Controle de timers entre telas
    if (nomeAba !== 'pedidos-adm') {
        pararAutoRefreshEsteira();
    }

    if (nomeAba === 'vitrine')      sincronizarProdutosServidor();
    if (nomeAba === 'carrinho')     renderizarCarrinho();
    if (nomeAba === 'meus-pedidos') carregarMeusPedidos();
    if (nomeAba === 'pedidos-adm') {
        carregarPedidosAdm();
        iniciarAutoRefreshEsteira(); // Inicia auto-refresh contínuo
    }
    if (nomeAba === 'adm') {
        carregarPainelCentralAdm();
        consultarPendentesAdm();
    }
}
/* ─── FIM: navegarPara ───────────────────────────────────────── */

/* ─── INÍCIO: aplicarNavPorPapel ─────────────────────────────── */
function aplicarNavPorPapel(papel) {
    document.querySelectorAll('.bottom-nav__item').forEach(btn => {
        const roles = (btn.dataset.roles || '').split(',').map(r => r.trim());
        if (roles.includes(papel)) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    });
}
/* ─── FIM: aplicarNavPorPapel ─────────────────────────────────── */

/* ─── INÍCIO: atualizarAvatarUsuario ─────────────────────────── */
function atualizarAvatarUsuario() {
    const alvo = document.getElementById('user-initials');
    if (!alvo) return;

    if (!estadoSessao.nomeUsuario || estadoSessao.papel === 'visitante') {
        alvo.textContent = '?';
        return;
    }

    const partes = String(estadoSessao.nomeUsuario).trim().split(/\s+/);
    let sigla = (partes[0] || '?')[0];
    if (partes.length > 1) sigla += (partes[partes.length - 1] || '')[0];
    alvo.textContent = sigla.toUpperCase();
}
/* ─── FIM: atualizarAvatarUsuario ─────────────────────────────── */

/* ─── INÍCIO: toggleUserDropdown ─────────────────────────────── */
function toggleUserDropdown() {
    const dd  = document.getElementById('user-dropdown');
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
/* ─── FIM: toggleUserDropdown ─────────────────────────────────── */

/* ─── INÍCIO: fecharUserDropdown ─────────────────────────────── */
function fecharUserDropdown() {
    const dd  = document.getElementById('user-dropdown');
    const btn = document.getElementById('user-avatar-btn');
    if (dd) dd.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}
/* ─── FIM: fecharUserDropdown ─────────────────────────────────── */

/* ─── INÍCIO: atualizarBadgeCarrinho ─────────────────────────── */
function atualizarBadgeCarrinho(quantidade) {
    const n = Number(quantidade) || 0;

    const bottom = document.getElementById('cart-counter');
    if (bottom) {
        bottom.textContent = n;
        bottom.dataset.zero = n === 0 ? '1' : '0';
    }

    const header = document.getElementById('header-cart-count');
    if (header) {
        header.textContent = n;
        header.dataset.zero = n === 0 ? '1' : '0';
    }
}
/* ─── FIM: atualizarBadgeCarrinho ─────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   16. CENTRAL DE DÚVIDAS E MODAIS GENÉRICOS
   ═══════════════════════════════════════════════════════════════ */

let listaDuvidasFaq = [
    {
        pergunta: "Como funciona a entrega do pedido?",
        resposta: "Após a confirmação do pagamento, um chat exclusivo é aberto no seu pedido com todas as orientações da rota de entrega."
    },
    {
        pergunta: "Quais são as formas de pagamento aceitas?",
        resposta: "Aceitamos PIX dinâmico com confirmação imediata, Cartão de Crédito e Criptomoedas."
    },
    {
        pergunta: "Quanto tempo dura o chat temporário do pedido?",
        resposta: "Permanece ativo durante toda a entrega. Ao ser concluído pela administração, ele é finalizado com segurança."
    }
];

function carregarFaqMemoria() {
    const salvo = localStorage.getItem('loja_faq_dados');
    if (salvo) {
        try { listaDuvidasFaq = JSON.parse(salvo); } catch (e) {}
    }
}
carregarFaqMemoria();

function abrirCentralDuvidas() {
    if (estadoSessao.papel === 'visitante') {
        exibirToast("A Central de Dúvidas é exclusiva para membros.", "info");
        abrirModal('modal-login');
        return;
    }

    renderizarListaFaq();
    const editorAdm = document.getElementById('adm-editor-faq-area');
    if (editorAdm) {
        editorAdm.classList.toggle('hidden', estadoSessao.papel !== 'adm');
    }

    abrirModal('modal-duvidas-central');
}

function renderizarListaFaq() {
    const container = document.getElementById('lista-faq-perguntas');
    if (!container) return;
    container.innerHTML = '';

    listaDuvidasFaq.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'faq-item';

        const questao = document.createElement('div');
        questao.className = 'faq-question';
        questao.setAttribute('data-action', 'toggle-faq');
        questao.innerHTML = `<span>${escaparHtml(item.pergunta)}</span> <small>▼</small>`;

        const resposta = document.createElement('div');
        resposta.className = 'faq-answer';
        resposta.textContent = item.resposta;

        if (estadoSessao.papel === 'adm') {
            const btnExcluir = document.createElement('button');
            btnExcluir.className = 'btn btn-danger-outline btn-sm';
            btnExcluir.style.cssText = 'margin-top:6px;font-size:0.65rem;padding:2px 6px;';
            btnExcluir.textContent = 'Excluir Dúvida';
            btnExcluir.onclick = (e) => {
                e.stopPropagation();
                listaDuvidasFaq.splice(index, 1);
                localStorage.setItem('loja_faq_dados', JSON.stringify(listaDuvidasFaq));
                renderizarListaFaq();
                exibirToast("Dúvida removida com sucesso.", "info");
            };
            resposta.appendChild(btnExcluir);
        }

        itemDiv.append(questao, resposta);
        container.appendChild(itemDiv);
    });
}

async function tratarEnvioSugestao(e) {
    if (e && e.preventDefault) e.preventDefault();
    const campo = document.getElementById('campo-sugestao-texto');
    const texto = campo ? campo.value.trim() : '';
    if (!texto) return;

    mostrarLoader("A enviar sugestão...");
    const res = await executarRequisicaoAPI("enviar_comentario", {
        nome: `[SUGESTÃO] ${estadoSessao.nomeUsuario}`,
        mensagem: texto
    });
    esconderLoader();

    if (res.sucesso) {
        exibirToast("Sugestão enviada com sucesso à administração!", "success");
        if (campo) campo.value = '';
        fecharModal('modal-duvidas-central');
    } else {
        exibirToast(res.mensagem || "Erro ao enviar sugestão.", "error");
    }
}

async function tratarEnvioComentario(e) {
    if (e && e.preventDefault) e.preventDefault();
    const nomeInput = document.getElementById('comentario-nome');
    const msgInput = document.getElementById('comentario-mensagem');
    const nome = nomeInput ? nomeInput.value.trim() : estadoSessao.nomeUsuario;
    const mensagem = msgInput ? msgInput.value.trim() : '';
    if (!mensagem) return;

    mostrarLoader("Enviando mensagem...");
    const res = await executarRequisicaoAPI("enviar_comentario", { nome, mensagem });
    esconderLoader();

    if (res.sucesso) {
        exibirToast("Mensagem enviada com sucesso!", "success");
        if (msgInput) msgInput.value = '';
    } else {
        exibirToast(res.mensagem || "Erro ao enviar mensagem.", "error");
    }
}

function tratarAdicionarFaq(e) {
    if (e && e.preventDefault) e.preventDefault();
    const inputP = document.getElementById('faq-nova-pergunta');
    const inputR = document.getElementById('faq-nova-resposta');
    const pergunta = inputP ? inputP.value.trim() : '';
    const resposta = inputR ? inputR.value.trim() : '';

    if (!pergunta || !resposta) return;

    listaDuvidasFaq.push({ pergunta, resposta });
    localStorage.setItem('loja_faq_dados', JSON.stringify(listaDuvidasFaq));

    if (inputP) inputP.value = '';
    if (inputR) inputR.value = '';

    renderizarListaFaq();
    exibirToast("Nova dúvida adicionada ao FAQ!", "success");
}

function abrirModal(idModal) {
    const modal = document.getElementById(idModal);
    if (modal) modal.classList.add('active');
}

function fecharModal(idModal) {
    const modal = document.getElementById(idModal);
    if (modal) modal.classList.remove('active');
    if (idModal === 'modal-chat') pararAutoRefreshChat();
}

let _callbackConfirmacao = null;

/* ─── CORREÇÃO CRÍTICA DO CALLBACK DE CONFIRMAÇÃO ──────────── */
function abrirConfirmacao(titulo, mensagemTextoOuHtml, callbackAcao) {
    const elementoTitulo = document.getElementById('confirmar-titulo');
    const elementoMensagem = document.getElementById('confirmar-mensagem');

    if (elementoTitulo) elementoTitulo.textContent = titulo;
    if (elementoMensagem) {
        if (typeof mensagemTextoOuHtml === 'string' && mensagemTextoOuHtml.startsWith('<div')) {
            elementoMensagem.innerHTML = mensagemTextoOuHtml;
        } else {
            elementoMensagem.textContent = mensagemTextoOuHtml;
        }
    }

    _callbackConfirmacao = callbackAcao;

    const btnOk = document.getElementById('confirmar-btn-ok');
    if (btnOk) {
        btnOk.onclick = () => {
            const cb = _callbackConfirmacao; // Salva a referência antes de limpar
            fecharConfirmacao();
            if (typeof cb === 'function') cb();
        };
    }

    abrirModal('modal-confirmar');
}

function abrirConfirmacaoElemento(titulo, elementoDom, callbackAcao) {
    const elementoTitulo = document.getElementById('confirmar-titulo');
    const elementoMensagem = document.getElementById('confirmar-mensagem');

    if (elementoTitulo) elementoTitulo.textContent = titulo;
    if (elementoMensagem) {
        elementoMensagem.innerHTML = '';
        elementoMensagem.appendChild(elementoDom);
    }

    _callbackConfirmacao = callbackAcao;

    const btnOk = document.getElementById('confirmar-btn-ok');
    if (btnOk) {
        btnOk.onclick = () => {
            const cb = _callbackConfirmacao; // Salva a referência antes de limpar
            fecharConfirmacao();
            if (typeof cb === 'function') cb();
        };
    }

    abrirModal('modal-confirmar');
}

function fecharConfirmacao() {
    fecharModal('modal-confirmar');
    _callbackConfirmacao = null;
}

function exibirToast(mensagem, tipo = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.textContent = mensagem;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', evento => {
        if (evento.target === overlay) {
            overlay.classList.remove('active');
            if (overlay.id === 'modal-chat') pararAutoRefreshChat();
        }
    });
});

/* ═══════════════════════════════════════════════════════════════
   17. EXPORTAÇÕES GLOBAIS (LIGAÇÃO COM BINDINGS)
   ═══════════════════════════════════════════════════════════════ */
window.abrirModal                    = abrirModal;
window.fecharModal                   = fecharModal;
window.abrirConfirmacao              = abrirConfirmacao;
window.exibirConfirmacao             = abrirConfirmacao;
window.fecharConfirmacao             = fecharConfirmacao;
window.confirmarLogout               = confirmarLogout;
window.executarLogout                = executarLogout;
window.enviarPedidoDesbloqueio       = enviarPedidoDesbloqueio;
window.navegarPara                   = navegarPara;
window.tratarCriacaoPedido           = tratarCriacaoPedido;
window.removerFotoCarregada          = removerFotoCarregada;
window.gerarLinkTemporarioAdm        = gerarLinkTemporarioAdm;
window.copiarLinkGerado              = copiarLinkGerado;
window.carregarPainelCentralAdm      = carregarPainelCentralAdm;
window.enviarMensagemChat            = enviarMensagemChat;
window.tratarEnvioMensagemChat       = enviarMensagemChat;
window.abrirChatPedido               = abrirChatPedido;
window.tratarSolicitacaoCadastro     = tratarSolicitacaoCadastro;
window.tratarLogin                   = tratarLogin;
window.tratarCadastroProduto         = tratarCadastroProduto;
window.aplicarFiltroVitrine          = aplicarFiltroVitrine;
window.filtrarVitrineEmTempoReal     = aplicarFiltroVitrine;
window.selecionarCategoriaChip       = selecionarCategoriaChip;
window.adicionarAoCarrinho           = adicionarAoCarrinho;
window.processarUploadImagem         = processarUploadImagem;
window.copiarPixCopiaECola           = copiarPixCopiaECola;
window.abrirCentralDuvidas           = abrirCentralDuvidas;
window.tratarEnvioSugestao           = tratarEnvioSugestao;
window.tratarEnvioComentario         = tratarEnvioComentario;
window.tratarAdicionarFaq            = tratarAdicionarFaq;
window.executarLimpezaTotalESaida    = executarLimpezaTotalESaida;
window.confirmarExclusaoProdutoAdm   = confirmarExclusaoProdutoAdm;
window.excluirProdutoAdm             = excluirProdutoAdm;
window.aplicarNavPorPapel            = aplicarNavPorPapel;
window.atualizarAvatarUsuario        = atualizarAvatarUsuario;
window.toggleUserDropdown            = toggleUserDropdown;
window.fecharUserDropdown            = fecharUserDropdown;
window.atualizarBadgeCarrinho        = atualizarBadgeCarrinho;

// Funções de acessibilidade, relatórios e controle de acesso
window.alternarModoEscuro                  = alternarModoEscuro;
window.abrirLightboxFoto                   = abrirLightboxFoto;
window.fecharLightbox                      = fecharLightbox;
window.comprarProdutoDireto                = comprarProdutoDireto;
window.compartilharPedidoWhatsApp          = compartilharPedidoWhatsApp;
window.abrirAssistenteVirtual              = abrirAssistenteVirtual;
window.responderDuvidaRapida               = responderDuvidaRapida;
window.atualizarContadorSelecaoLote        = atualizarContadorSelecaoLote;
window.aprovarSolicitacoesSelecionadasLote = aprovarSolicitacoesSelecionadasLote;
window.gerarRelatorioPdfVendas             = gerarRelatorioPdfVendas;
window.tocarSomNotificacao                 = tocarSomNotificacao;
window.alternarModoAcessoSistema           = alternarModoAcessoSistema;
