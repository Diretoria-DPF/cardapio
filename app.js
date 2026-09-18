/* ============================================================================
   app.js — Plataforma Comercial Segura (v28 — Versão Integral & Consolidada)
   ============================================================================ */

// URL OFICIAL DA SUA API NO VERCEL:
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
            e.key === 'PrintScreen' ||
            (e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) ||
            (e.ctrlKey && ['U', 'u', 'S', 's', 'P', 'p'].includes(e.key)) ||
            (e.metaKey && e.altKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key))
        ) {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === 'PrintScreen') {
                try { navigator.clipboard.writeText(''); } catch (err) {}
                exibirToast("Captura de tela bloqueada nesta plataforma.", "error");
            }
            return false;
        }
    });

    window.addEventListener('blur', () => {
        const cortina = document.getElementById('cortina-privacidade');
        if (cortina) cortina.classList.remove('hidden');
    });

    window.addEventListener('focus', () => {
        const cortina = document.getElementById('cortina-privacidade');
        if (cortina) cortina.classList.add('hidden');
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
        pararAutoRefreshEsteira();
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
                iniciarAutoRefreshEsteira();
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
        const res = await resp.json();

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
    pararAutoRefreshEsteira();

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
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
                ...(opcoesExtras.headers || {})
            },
            signal: controladorAborto.signal
        });
    } finally {
        clearTimeout(temporizador);
    }
}
/* ─── FIM: fetchComTimeout ───────────────────────────────────── */

/* ─── INÍCIO: executarRequisicaoAPI ──────────────────────────── */
async function executarRequisicaoAPI(acao, dadosExtras = {}, tentarRefresh = true, tentativa = 1) {
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
            body: JSON.stringify(corpo)
        });

        const textoResposta = await resposta.text();
        let json;
        try {
            json = JSON.parse(textoResposta);
        } catch (erroParse) {
            return { sucesso: false, erroTransitorio: true, mensagem: "Servidor ocupado. Aguarde um instante..." };
        }

        // Bloqueio de manutenção amigável
        if (!json.sucesso && json.codigo === 'SISTEMA_BLOQUEADO') {
            if (estadoSessao.papel === 'adm') {
                return json;
            }

            if (estadoSessao.papel === 'membro') {
                let avisoManutencao = document.getElementById('aviso-manutencao-membro');
                if (!avisoManutencao) {
                    avisoManutencao = document.createElement('div');
                    avisoManutencao.id = 'aviso-manutencao-membro';
                    avisoManutencao.style.cssText = `
                        position: fixed;
                        inset: 0;
                        background: rgba(15, 23, 42, 0.96);
                        z-index: 99999;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        padding: 24px;
                        text-align: center;
                        color: #ffffff;
                        backdrop-filter: blur(8px);
                    `;
                    avisoManutencao.innerHTML = `
                        <div style="font-size: 3.5rem; margin-bottom: 14px;">🛡️</div>
                        <h2 style="font-size: 1.4rem; font-weight: 700; margin-bottom: 8px;">Plataforma Fechada</h2>
                        <p style="color: #94a3b8; max-width: 360px; line-height: 1.5; font-size: 0.9rem; margin-bottom: 22px;">
                            Estamos realizando ajustes operacionais no sistema. Em breve estaremos de volta!
                        </p>
                        <button type="button" class="btn btn-primary btn-sm" onclick="location.reload()">
                            Atualizar Página
                        </button>
                    `;
                    document.body.appendChild(avisoManutencao);
                }
            } else {
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
        if (tentativa === 1) {
            await new Promise(r => setTimeout(r, 1200));
            return executarRequisicaoAPI(acao, dadosExtras, tentarRefresh, 2);
        }
        console.warn("[API] Oscilação de rede:", erroRede);
        return { sucesso: false, erroRede: true, mensagem: "Sem conexão momentânea com o servidor." };
    }
}
/* ─── FIM: executarRequisicaoAPI ─────────────────────────────── */

/* ─── INÍCIO: tentarRenovarSessao ────────────────────────────── */
async function tentarRenovarSessao(refreshToken) {
    try {
        const resposta = await fetchComTimeout(URL_BACKEND_APPS_SCRIPT, 15000, {
            method: 'POST',
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
   7. VITRINE & SELETOR DE QUANTIDADE (+ / -)
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
            catalogoFiltrado = resultado.produtos;
            renderizarVitrine();
            CacheLoja.salvar('produtos_' + estadoSessao.papel, catalogoProdutos);
        }
    } catch (erro) {
        console.warn("[Vitrine] Erro na sincronização:", erro);
    }
}
/* ─── FIM: sincronizarProdutosServidor ───────────────────────── */

/* ─── INÍCIO: renderizarVitrine ──────────────────────────────── */
function renderizarVitrine() {
    const grid = document.getElementById('produtos-container');
    if (!grid) return;
    grid.innerHTML = '';

    if (!catalogoProdutos || catalogoProdutos.length === 0) {
        grid.innerHTML = `<div class="empty-state"><strong>Nenhum produto disponível no momento.</strong></div>`;
        return;
    }

    catalogoProdutos.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';

        const itemNaCesta = cestaCompras.find(i => String(i.id) === String(p.id));
        const quantidadeAtual = itemNaCesta ? itemNaCesta.quantidade : 0;

        card.innerHTML = `
            <img class="product-thumb" src="${p.foto || 'https://via.placeholder.com/300x200?text=Sem+Foto'}" alt="${escaparHtml(p.nome)}" loading="lazy">
            <div class="product-details">
                <h3 class="product-name">${escaparHtml(p.nome)}</h3>
                <p class="product-price">${fmtPreco(p.preco)}</p>
            </div>
        `;

        const body = card.querySelector('.product-details');

        if (estadoSessao.papel === 'membro') {
            const controleQtd = document.createElement('div');
            controleQtd.className = 'card-qty-control';

            const btnMenos = document.createElement('button');
            btnMenos.type = 'button';
            btnMenos.className = 'btn-qty';
            btnMenos.textContent = '-';
            btnMenos.onclick = () => alterarQuantidadeProdutoCard(p, -1);

            const displayQtd = document.createElement('span');
            displayQtd.className = 'qty-display';
            displayQtd.id = `qty-card-${p.id}`;
            displayQtd.textContent = quantidadeAtual;

            const btnMais = document.createElement('button');
            btnMais.type = 'button';
            btnMais.className = 'btn-qty';
            btnMais.textContent = '+';
            btnMais.onclick = () => alterarQuantidadeProdutoCard(p, 1);

            controleQtd.append(btnMenos, displayQtd, btnMais);
            body.appendChild(controleQtd);
        } else if (estadoSessao.papel === 'adm') {
            const painelAdm = document.createElement('div');
            painelAdm.className = 'adm-visib-controls';

            const selectVisib = document.createElement('select');
            selectVisib.innerHTML = `
                <option value="publico" ${p.visibilidade === 'publico' ? 'selected' : ''}>Público</option>
                <option value="registrado" ${p.visibilidade === 'registrado' ? 'selected' : ''}>Membro</option>
                <option value="adm" ${p.visibilidade === 'adm' ? 'selected' : ''}>Oculto ADM</option>
            `;
            selectVisib.onchange = () => alterarVisibilidadeProdutoAdm(p.id, selectVisib.value);

            painelAdm.appendChild(selectVisib);
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
            aviso.textContent = 'Aprovados podem adicionar itens.';
            body.appendChild(aviso);
        }

        grid.appendChild(card);
    });
}
/* ─── FIM: renderizarVitrine ─────────────────────────────────── */

/* ─── INÍCIO: alterarQuantidadeProdutoCard ───────────────────── */
function alterarQuantidadeProdutoCard(produto, delta) {
    const item = cestaCompras.find(i => String(i.id) === String(produto.id));

    if (item) {
        item.quantidade += delta;
        if (item.quantidade <= 0) {
            cestaCompras = cestaCompras.filter(i => String(i.id) !== String(produto.id));
        }
    } else if (delta > 0) {
        cestaCompras.push({
            id: produto.id,
            nome: produto.nome,
            preco: Number(produto.preco),
            quantidade: 1
        });
    }

    const display = document.getElementById(`qty-card-${produto.id}`);
    const itemAtualizado = cestaCompras.find(i => String(i.id) === String(produto.id));
    if (display) display.textContent = itemAtualizado ? itemAtualizado.quantidade : 0;

    const totalItens = cestaCompras.reduce((acc, i) => acc + i.quantidade, 0);
    atualizarBadgeCarrinho(totalItens);
    atualizarBarraFlutuanteSacola();
}
/* ─── FIM: alterarQuantidadeProdutoCard ───────────────────────── */

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
            bar.onclick = () => navegarPara('carrinho');
            bar.innerHTML = `
                <div class="floating-cart-bar__left">
                    <span class="floating-cart-bar__count" id="float-cart-count">0 itens</span>
                    <span class="floating-cart-bar__total" id="float-cart-total">R$ 0,00</span>
                </div>
                <div class="floating-cart-bar__cta">
                    Ver Carrinho ➔
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
        lista.innerHTML = `<div class="empty-state"><strong>Seu carrinho está vazio.</strong>Adicione itens pelo catálogo.</div>`;
        const totalEl = document.getElementById('carrinho-total-valor');
        if (totalEl) totalEl.textContent = 'R$ 0,00';
        atualizarBadgeCarrinho(0);
        atualizarBarraFlutuanteSacola();
        return;
    }

    cestaCompras.forEach(item => {
        const subtotal = item.preco * item.quantidade;
        valorTotal += subtotal;

        const cardItem = document.createElement('div');
        cardItem.className = 'cart-item-clean';

        cardItem.innerHTML = `
            <div style="flex:1;">
                <strong>${escaparHtml(item.nome)}</strong>
                <div style="color:var(--cor-texto-suave);font-size:0.8rem;">Unitário: ${fmtPreco(item.preco)}</div>
                <strong style="color:var(--cor-sucesso-escura);">${fmtPreco(subtotal)}</strong>
            </div>
            
            <div style="display:flex;align-items:center;">
                <div class="card-qty-control" style="margin:0;">
                    <button type="button" class="btn-qty" onclick="modificarQtdCarrinho('${item.id}', -1)">-</button>
                    <span class="qty-display">${item.quantidade}</span>
                    <button type="button" class="btn-qty" onclick="modificarQtdCarrinho('${item.id}', 1)">+</button>
                </div>
                <button type="button" class="btn-lixeira" title="Remover item" onclick="solicitarRemocaoItemCarrinho('${item.id}', '${escaparHtml(item.nome)}')">
                    🗑️
                </button>
            </div>
        `;
        lista.appendChild(cardItem);
    });

    const totalEl = document.getElementById('carrinho-total-valor');
    if (totalEl) totalEl.textContent = fmtPreco(valorTotal);
}
/* ─── FIM: renderizarCarrinho ─────────────────────────────────── */

/* ─── INÍCIO: modificarQtdCarrinho ───────────────────────────── */
function modificarQtdCarrinho(idProduto, delta) {
    const item = cestaCompras.find(i => String(i.id) === String(idProduto));
    if (!item) return;

    if (item.quantidade + delta <= 0) {
        solicitarRemocaoItemCarrinho(item.id, item.nome);
    } else {
        item.quantidade += delta;
        renderizarCarrinho();
        renderizarVitrine();
        atualizarBarraFlutuanteSacola();
    }
}
/* ─── FIM: modificarQtdCarrinho ───────────────────────────────── */

/* ─── INÍCIO: solicitarRemocaoItemCarrinho ───────────────────── */
function solicitarRemocaoItemCarrinho(idProduto, nomeProduto) {
    abrirConfirmacao(
        "Remover do Carrinho",
        `Deseja realmente retirar "${nomeProduto}" do seu pedido?`,
        () => {
            cestaCompras = cestaCompras.filter(i => String(i.id) !== String(idProduto));
            renderizarCarrinho();
            renderizarVitrine();
            atualizarBarraFlutuanteSacola();
            exibirToast("Item removido do carrinho.", "info");
        }
    );
}
/* ─── FIM: solicitarRemocaoItemCarrinho ───────────────────────── */

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
        exibirToast(`Pedido gerado com sucesso!`, "success");
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
   9. MEUS PEDIDOS, COMPROVANTE WHATSAPP & FLUXO 3 ETAPAS
   ═══════════════════════════════════════════════════════════════ */

/* ─── INÍCIO: carregarMeusPedidos ────────────────────────────── */
async function carregarMeusPedidos() {
    const container = document.getElementById('meus-pedidos-container');
    if (!container) return;
    container.innerHTML = '<div class="loading-slot">Carregando pedidos...</div>';

    const resposta = await executarRequisicaoAPI("listar_meus_pedidos");
    container.innerHTML = '';

    if (!resposta.sucesso || !resposta.pedidos || resposta.pedidos.length === 0) {
        container.innerHTML = `<div class="empty-state"><strong>Nenhum pedido em andamento.</strong></div>`;
        return;
    }

    estadoSessao.pedidosRecentes = resposta.pedidos;

    resposta.pedidos.forEach(pedido => {
        const cartao = document.createElement('div');
        cartao.className = 'card';
        const st = String(pedido.status || '').toLowerCase();

        // 3 Etapas: 1. Pagamento, 2. Em Preparação, 3. Pedido Pronto
        const s1Concluido = ['solicitados', 'viagem', 'concluido'].includes(st);
        const s2Concluido = ['viagem', 'concluido'].includes(st);
        const s3Concluido = st === 'concluido';

        cartao.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <h4>Pedido #${escaparHtml(pedido.id)}</h4>
                <strong style="color:var(--cor-sucesso-escura);">${fmtPreco(pedido.total)}</strong>
            </div>

            <div class="order-stepper-clean">
                <div class="step-item ${s1Concluido ? 'concluido' : (st === 'analise' ? 'ativo' : '')}">
                    <div class="step-circulo">${s1Concluido ? '✓' : '1'}</div>
                    <span>Pagamento</span>
                </div>
                <div class="step-item ${s2Concluido ? 'concluido' : (st === 'solicitados' ? 'ativo' : '')}">
                    <div class="step-circulo">${s2Concluido ? '✓' : '2'}</div>
                    <span>Em Preparação</span>
                </div>
                <div class="step-item ${s3Concluido ? 'concluido' : (st === 'viagem' ? 'ativo' : '')}">
                    <div class="step-circulo">${s3Concluido ? '✓' : '3'}</div>
                    <span>Pedido Pronto</span>
                </div>
            </div>

            <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
                ${st === 'analise' ? `<button type="button" class="btn btn-success btn-sm" onclick="abrirCobrancaPedido('${pedido.id}')">💳 Pagar PIX</button>` : ''}
                <button type="button" class="btn btn-whatsapp btn-sm btn-block" onclick="enviarComprovanteWhatsApp('${pedido.id}')">
                    📲 Enviar Comprovante no WhatsApp
                </button>
            </div>
        `;
        container.appendChild(cartao);
    });
}
/* ─── FIM: carregarMeusPedidos ───────────────────────────────── */

/* ─── INÍCIO: enviarComprovanteWhatsApp ──────────────────────── */
function enviarComprovanteWhatsApp(idPedido) {
    const pedido = (estadoSessao.pedidosRecentes || []).find(p => String(p.id) === String(idPedido));
    
    let listaItens = "";
    if (pedido && pedido.itensJson) {
        try {
            const arr = typeof pedido.itensJson === 'string' ? JSON.parse(pedido.itensJson) : pedido.itensJson;
            if (Array.isArray(arr)) {
                listaItens = arr.map(i => `${i.quantidade}x ${i.nome}`).join(', ');
            }
        } catch (e) {}
    }

    const texto = 
`*COMPROVANTE DE PAGAMENTO*
-------------------------------
*Pedido:* ${listaItens || idPedido}
*Cliente:* ${estadoSessao.nomeUsuario}
*Valor Total:* ${fmtPreco(pedido ? pedido.total : 0)}
*Forma de Pagto:* PIX
-------------------------------
Envio em anexo o meu comprovante de pagamento para liberação do pedido!`;

    const urlWa = `https://wa.me/5574998048300?text=${encodeURIComponent(texto)}`;
    window.open(urlWa, '_blank');
}
/* ─── FIM: enviarComprovanteWhatsApp ────────────────────────── */

/* ─── INÍCIO: abrirCobrancaPedido ────────────────────────────── */
async function abrirCobrancaPedido(idPedido, metodo) {
    mostrarLoader("Gerando chave PIX...");
    const resposta = await executarRequisicaoAPI("gerar_pagamento", { idPedido, metodo: metodo || "PIX" });
    esconderLoader();

    if (!resposta.sucesso) return exibirToast(resposta.mensagem || "Erro na cobrança.", "error");

    const cobranca = resposta.cobranca;
    const caixa = document.createElement('div');
    caixa.style.cssText = 'text-align:center;padding:10px;';

    const imgQr = document.createElement('img');
    imgQr.src = cobranca.qrCodeUrl;
    imgQr.style.cssText = 'width:190px;height:190px;margin:0 auto 10px;display:block;border-radius:8px;';

    const inputPix = document.createElement('input');
    inputPix.type = 'text';
    inputPix.id = 'pix-copia-cola';
    inputPix.value = cobranca.pixCopiaECola;
    inputPix.readOnly = true;
    inputPix.style.cssText = 'font-size:.75rem;margin-bottom:8px;text-align:center;width:100%;';

    const btnCopiar = document.createElement('button');
    btnCopiar.className = 'btn btn-primary btn-block';
    btnCopiar.textContent = '📋 Copiar Código PIX';
    btnCopiar.onclick = (e) => copiarPixCopiaECola(e.currentTarget);

    caixa.append(imgQr, inputPix, btnCopiar);

    abrirConfirmacaoElemento(`Pagamento do Pedido #${estadoSessao.nomeUsuario}`, caixa, () => {
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
        if (estadoSessao.papel === 'adm') {
            await carregarPedidosAdm(true);
        }
    } else {
        exibirToast(resposta.mensagem || "Falha ao enviar mensagem.", "error");
    }
}
/* ─── FIM: enviarMensagemChat ─────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   10. PAINEL CENTRAL, LOTE E RELATÓRIO PDF (ADM)
   ═══════════════════════════════════════════════════════════════ */

/* ─── INÍCIO: carregarPainelCentralAdm ───────────────────────── */
async function carregarPainelCentralAdm() {
    if (estadoSessao.papel !== 'adm') return;

    await consultarStatusAcessoSistema();

    // 1. Cadastros Pendentes
    const divSolicitacoes = document.getElementById('adm-solicitacoes-lista');
    if (divSolicitacoes) divSolicitacoes.innerHTML = '<div class="loading-slot">Procurando novos cadastros...</div>';

    const respostaSolic = await executarRequisicaoAPI("listar_solicitacoes_adm");
    const totalPendentes = (respostaSolic.sucesso && Array.isArray(respostaSolic.solicitacoes)) ? respostaSolic.solicitacoes.length : 0;
    atualizarBadgePendentesAdm(totalPendentes);

    if (divSolicitacoes) {
        divSolicitacoes.innerHTML = '';
        if (totalPendentes > 0) {
            respostaSolic.solicitacoes.forEach(solicitacao => {
                const linha = document.createElement('div');
                linha.style.cssText = 'padding:10px 0;border-bottom:1px solid var(--cor-borda);display:flex;align-items:flex-start;gap:10px;';

                const info = document.createElement('div');
                info.style.flex = '1';
                info.innerHTML = `
                    <p><strong>${escaparHtml(solicitacao.nome)}</strong> (WhatsApp: ${escaparHtml(solicitacao.telefone)})</p>
                    <p style="font-size:.78rem;color:var(--cor-texto-suave);">
                        Idade: <strong>${solicitacao.idade || '18+'}</strong> anos | Indicado por: <strong>${escaparHtml(solicitacao.indicadoPor || '-')}</strong> (${escaparHtml(solicitacao.indicadoTel || '-')})
                    </p>
                `;

                const botaoAprovar = document.createElement('button');
                botaoAprovar.className = 'btn btn-success btn-sm';
                botaoAprovar.style.marginTop = '4px';
                botaoAprovar.textContent = 'Aprovar';
                botaoAprovar.onclick = () => aprovarMembroAdm(solicitacao.id);

                linha.append(info, botaoAprovar);
                divSolicitacoes.appendChild(linha);
            });
        } else {
            divSolicitacoes.innerHTML = '<div class="loading-slot">Nenhuma solicitação pendente.</div>';
        }
    }

    // 2. Métricas Gerais
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
}
/* ─── FIM: carregarPainelCentralAdm ─────────────────────────── */

/* ─── INÍCIO: alternarGavetaAdm ──────────────────────────────── */
function alternarGavetaAdm(tipo) {
    const dMembros = document.getElementById('drawer-membros');
    const dBloq = document.getElementById('drawer-bloqueados');
    const bMembros = document.getElementById('btn-toggle-membros-drawer');
    const bBloq = document.getElementById('btn-toggle-bloqueados-drawer');

    if (!dMembros || !dBloq) return;

    if (tipo === 'membros') {
        dBloq.classList.add('hidden');
        if (bBloq) bBloq.classList.remove('ativo');
        dMembros.classList.toggle('hidden');
        if (bMembros) bMembros.classList.toggle('ativo');
        if (!dMembros.classList.contains('hidden')) carregarListaMembrosGaveta();
    } else {
        dMembros.classList.add('hidden');
        if (bMembros) bMembros.classList.remove('ativo');
        dBloq.classList.toggle('hidden');
        if (bBloq) bBloq.classList.toggle('ativo');
        if (!dBloq.classList.contains('hidden')) carregarListaBloqueadosGaveta();
    }
}
/* ─── FIM: alternarGavetaAdm ─────────────────────────────────── */

/* ─── INÍCIO: carregarListaMembrosGaveta ─────────────────────── */
async function carregarListaMembrosGaveta() {
    const cont = document.getElementById('adm-membros-gaveta-lista');
    if (!cont) return;
    cont.innerHTML = '<div class="loading-slot">Carregando membros...</div>';

    const res = await executarRequisicaoAPI("listar_usuarios_adm");
    cont.innerHTML = '';

    if (res.sucesso && Array.isArray(res.usuarios) && res.usuarios.length > 0) {
        let html = '<table class="tabela-metricas"><thead><tr><th>Nome</th><th>WhatsApp</th><th>Idade</th><th>Ações</th></tr></thead><tbody>';
        res.usuarios.forEach(u => {
            html += `<tr>
                <td><strong>${escaparHtml(u.primeiroNome)}</strong></td>
                <td>${escaparHtml(u.telefone)}</td>
                <td>${u.idade || '-'} anos</td>
                <td>
                    <button class="btn btn-danger-outline btn-sm" style="padding:2px 6px;" onclick="bloquearUsuarioComMotivo('${u.id}', '${escaparHtml(u.primeiroNome)}')">🔒 Bloquear</button>
                    <button class="btn btn-ghost btn-sm" style="padding:2px 6px;color:var(--cor-perigo);" onclick="excluirUsuarioMembro('${u.id}')">🗑️</button>
                </td>
            </tr>`;
        });
        html += '</tbody></table>';
        cont.innerHTML = html;
    } else {
        cont.innerHTML = '<div class="loading-slot">Nenhum membro registrado.</div>';
    }
}
/* ─── FIM: carregarListaMembrosGaveta ───────────────────────── */

/* ─── INÍCIO: bloquearUsuarioComMotivo ───────────────────────── */
async function bloquearUsuarioComMotivo(idUsuario, nome) {
    const motivo = prompt(`Digite o motivo do bloqueio para ${nome}:`);
    if (!motivo || !motivo.trim()) return;

    mostrarLoader("Bloqueando usuário...");
    const res = await executarRequisicaoAPI("bloquear_usuario_motivo_adm", {
        identificador: idUsuario,
        motivo: motivo.trim()
    });
    esconderLoader();

    if (res.sucesso) {
        exibirToast("Usuário bloqueado com sucesso!", "success");
        carregarListaMembrosGaveta();
        carregarListaBloqueadosGaveta();
    } else {
        exibirToast(res.mensagem || "Erro ao bloquear.", "error");
    }
}
/* ─── FIM: bloquearUsuarioComMotivo ─────────────────────────── */

/* ─── INÍCIO: excluirUsuarioMembro ───────────────────────────── */
async function excluirUsuarioMembro(idUsuario) {
    if (!confirm("Deseja realmente excluir permanentemente este usuário da plataforma?")) return;
    mostrarLoader("Excluindo conta...");
    const res = await executarRequisicaoAPI("excluir_usuario_adm", { idUsuario });
    esconderLoader();

    if (res.sucesso) {
        exibirToast("Usuário removido da plataforma!", "success");
        carregarListaMembrosGaveta();
    }
}
/* ─── FIM: excluirUsuarioMembro ───────────────────────────── */

/* ─── INÍCIO: carregarListaBloqueadosGaveta ─────────────────── */
async function carregarListaBloqueadosGaveta() {
    const cont = document.getElementById('adm-bloqueados-gaveta-lista');
    const badgeCount = document.getElementById('cont-bloqueados-badge');
    if (!cont) return;

    const res = await executarRequisicaoAPI("listar_bloqueados_adm");
    cont.innerHTML = '';

    if (res.sucesso && Array.isArray(res.contas)) {
        if (badgeCount) badgeCount.textContent = res.contas.length;
        if (res.contas.length === 0) {
            cont.innerHTML = '<div class="loading-slot">Nenhum usuário bloqueado no momento.</div>';
            return;
        }

        res.contas.forEach(c => {
            const linha = document.createElement('div');
            linha.style.cssText = 'padding:8px 0;border-bottom:1px solid var(--cor-borda);display:flex;justify-content:space-between;align-items:center;';
            linha.innerHTML = `
                <div>
                    <strong style="color:var(--cor-perigo);">${escaparHtml(c.identificador)}</strong>
                    <br><small style="color:var(--cor-texto-suave);">Motivo: ${escaparHtml(c.motivo || 'Bloqueio administrativo')}</small>
                </div>
                <button class="btn btn-primary btn-sm" onclick="liberarContaUsuarioAdm('${c.identificador}')">Desbloquear</button>
            `;
            cont.appendChild(linha);
        });
    }
}
/* ─── FIM: carregarListaBloqueadosGaveta ─────────────────────── */

/* ─── INÍCIO: gerarRelatorioPdfVendas ────────────────────────── */
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
                    <div class="titulo-empresa">Fechamento Diário</div>
                    <div class="subtitulo">Relatório de Vendas e Saída de Itens</div>
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
                <span>Relatório para conferência administrativa.</span>
                <span>Uso interno</span>
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
    mostrarLoader("Liberando conta...");
    const resposta = await executarRequisicaoAPI("liberar_conta_adm", { identificador });
    esconderLoader();
    if (resposta.sucesso) {
        exibirToast(resposta.mensagem || "Conta liberada com sucesso.", "success");
        carregarListaBloqueadosGaveta();
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

/* ─── INÍCIO: consultarPendentesAdm ──────────────────────────── */
async function consultarPendentesAdm() {
    if (estadoSessao.papel !== 'adm') return;
    try {
        const resposta = await executarRequisicaoAPI("listar_solicitacoes_adm");
        const total = (resposta.sucesso && Array.isArray(resposta.solicitacoes)) ? resposta.solicitacoes.length : 0;
        atualizarBadgePendentesAdm(total);
    } catch (e) {}
}
/* ─── FIM: consultarPendentesAdm ─────────────────────────────── */

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
   11. ESTEIRA DE PEDIDOS / COMANDAS RETRÁTEIS (ADM)
   ═══════════════════════════════════════════════════════════════ */

/* ─── INÍCIO: iniciarAutoRefreshEsteira ──────────────────────── */
function iniciarAutoRefreshEsteira() {
    pararAutoRefreshEsteira();
    if (estadoSessao.papel !== 'adm') return;

    _timerEsteiraAdm = setInterval(async () => {
        if (estadoSessao.papel !== 'adm' || document.hidden) return;
        const painelEsteira = document.getElementById('view-pedidos-adm');
        if (painelEsteira && painelEsteira.classList.contains('active')) {
            await carregarPedidosAdm(true);
        } else {
            pararAutoRefreshEsteira();
        }
    }, 8000);
}
/* ─── FIM: iniciarAutoRefreshEsteira ────────────────────────── */

/* ─── INÍCIO: pararAutoRefreshEsteira ────────────────────────── */
function pararAutoRefreshEsteira() {
    if (_timerEsteiraAdm) {
        clearInterval(_timerEsteiraAdm);
        _timerEsteiraAdm = null;
    }
}
/* ─── FIM: pararAutoRefreshEsteira ──────────────────────────── */

/* ─── INÍCIO: carregarPedidosAdm ─────────────────────────────── */
async function carregarPedidosAdm(silencioso = false) {
    const colAnalise = document.getElementById('pipe-analise');
    const colSolic   = document.getElementById('pipe-solicitados');
    const colConc    = document.getElementById('pipe-concluido');

    if (!silencioso) {
        [colAnalise, colSolic, colConc].forEach(c => { if (c) c.innerHTML = '<div class="loading-slot">…</div>'; });
    }

    const res = await executarRequisicaoAPI("listar_pedidos_adm");
    if (!res.sucesso || !Array.isArray(res.pedidos)) return;

    [colAnalise, colSolic, colConc].forEach(c => { if (c) c.innerHTML = ''; });

    const emAnalise = res.pedidos.filter(p => String(p.status).toLowerCase() === 'analise').length;
    if (totalPedidosAnaliseAnterior > 0 && emAnalise > totalPedidosAnaliseAnterior) {
        tocarSomNotificacao('pedido');
    }
    totalPedidosAnaliseAnterior = emAnalise;

    const pedidosOrdenados = res.pedidos
        .filter(p => p.status !== 'arquivado')
        .sort((a, b) => new Date(a.criadoEm) - new Date(b.criadoEm));

    pedidosOrdenados.forEach(p => {
        const horaFormatada = p.criadoEm ? new Date(p.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';

        const comanda = document.createElement('div');
        comanda.className = `comanda-card comanda-${p.status}`;

        let itensTexto = '';
        try {
            const its = typeof p.itensJson === 'string' ? JSON.parse(p.itensJson) : p.itensJson;
            if (Array.isArray(its)) itensTexto = its.map(i => `${i.quantidade}x ${i.nome}`).join(', ');
        } catch(e) {}

        const badgeIcones = {
            analise: '⏳ 1. Pagamento',
            solicitados: '👩‍🍳 2. Em Preparação',
            concluido: '✅ 3. Pedido Pronto'
        };

        if (p.status === 'concluido') {
            comanda.innerHTML = `
                <div class="comanda-header" onclick="this.parentElement.classList.toggle('expandida')">
                    <div>
                        <strong>#${escaparHtml(p.id)}</strong> 
                        <span style="color:var(--cor-sucesso-escura);font-weight:700;margin-left:6px;">${fmtPreco(p.total)}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <small style="color:var(--cor-texto-suave);">${horaFormatada}</small>
                        <span class="badge-etapa badge-etapa-concluido">✅</span>
                    </div>
                </div>
                <div class="comanda-body">
                    <p><strong>Forma:</strong> ${escaparHtml(p.metodo || 'PIX')}</p>
                    <p style="color:var(--cor-texto-suave);margin:4px 0;"><strong>Itens:</strong> ${escaparHtml(itensTexto || 'Sem itens')}</p>
                    <div style="display:flex;gap:6px;margin-top:8px;">
                        <button type="button" class="btn btn-danger-outline btn-sm" onclick="cancelarExcluirPedidoAdm('${p.id}')">🗑️ Excluir</button>
                    </div>
                </div>
            `;
        } else {
            comanda.innerHTML = `
                <div class="comanda-header" onclick="this.parentElement.classList.toggle('expandida')">
                    <div>
                        <strong>#${escaparHtml(p.id)}</strong> <small style="color:var(--cor-texto-suave);">(${horaFormatada})</small>
                    </div>
                    <div>
                        <span class="badge-etapa badge-etapa-${p.status}">${badgeIcones[p.status] || p.status}</span>
                    </div>
                </div>
                <div class="comanda-body">
                    <p><strong>Total:</strong> ${fmtPreco(p.total)} | Forma: ${escaparHtml(p.metodo || 'PIX')}</p>
                    <p style="color:var(--cor-texto-suave);margin:4px 0;"><strong>Itens:</strong> ${escaparHtml(itensTexto || 'Sem itens')}</p>
                    <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
                        <button type="button" class="btn btn-primary btn-sm" onclick="avancarStatusAdm('${p.id}', '${p.status}')">Avançar ➔</button>
                        <button type="button" class="btn btn-danger-outline btn-sm" onclick="cancelarExcluirPedidoAdm('${p.id}')">Cancelar Pedido</button>
                    </div>
                </div>
            `;
        }

        if (p.status === 'analise'     && colAnalise) colAnalise.appendChild(comanda);
        if (p.status === 'solicitados' && colSolic)   colSolic.appendChild(comanda);
        if (p.status === 'concluido'   && colConc)    colConc.appendChild(comanda);
    });

    [[colAnalise], [colSolic], [colConc]].forEach(([c]) => {
        if (c && !c.children.length) c.innerHTML = `<div class="loading-slot" style="font-size:.75rem;">Sem comandas</div>`;
    });
}
/* ─── FIM: carregarPedidosAdm ─────────────────────────────────── */

/* ─── INÍCIO: cancelarExcluirPedidoAdm ───────────────────────── */
function cancelarExcluirPedidoAdm(idPedido) {
    abrirConfirmacao(
        "Cancelar Pedido",
        `Deseja realmente excluir e cancelar permanentemente o Pedido #${idPedido}?`,
        async () => {
            mostrarLoader("Cancelando pedido...");
            const res = await executarRequisicaoAPI("cancelar_pedido_adm", { idPedido });
            esconderLoader();
            if (res.sucesso) {
                exibirToast(res.mensagem, "success");
                await carregarPedidosAdm(true);
            } else {
                exibirToast(res.mensagem || "Erro ao cancelar pedido.", "error");
            }
        }
    );
}
/* ─── FIM: cancelarExcluirPedidoAdm ─────────────────────────── */

/* ─── INÍCIO: limparConcluidosAdm ────────────────────────────── */
function limparConcluidosAdm() {
    abrirConfirmacao(
        "Limpar Concluídos",
        "Deseja limpar as comandas concluídas da visualização da esteira? O faturamento continuará registrado nas métricas.",
        async () => {
            mostrarLoader("Limpando comandas...");
            const res = await executarRequisicaoAPI("limpar_pedidos_concluidos_adm");
            esconderLoader();
            if (res.sucesso) {
                exibirToast(res.mensagem, "success");
                await carregarPedidosAdm(true);
            }
        }
    );
}
/* ─── FIM: limparConcluidosAdm ──────────────────────────────── */

/* ─── INÍCIO: avancarStatusAdm ───────────────────────────────── */
async function avancarStatusAdm(idPedido, statusAtual) {
    let proximoStatus = 'solicitados';
    if (statusAtual === 'solicitados') proximoStatus = 'concluido';

    const resposta = await executarRequisicaoAPI("atualizar_status_pedido", {
        idPedido: idPedido,
        novoStatus: proximoStatus
    });

    if (resposta.sucesso) {
        exibirToast("Comanda atualizada com sucesso!", "success");
        await carregarPedidosAdm(true);
    } else {
        exibirToast(resposta.mensagem || "Erro ao atualizar status.", "error");
    }
}
/* ─── FIM: avancarStatusAdm ──────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   12. LINKS TEMPORÁRIOS, FOTOS E CADASTRO DE PRODUTOS
   ═══════════════════════════════════════════════════════════════ */

/* ─── INÍCIO: gerarLinkTemporarioAdm ─────────────────────────── */
async function gerarLinkTemporarioAdm() {
    const selectDuracao = document.getElementById('select-duracao-link');
    let minutosFinais = parseInt(selectDuracao?.value, 10) || 15;

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

    if (imgPreview) imgPreview.src = origemBase64;
    if (containerPreview) containerPreview.classList.remove('hidden');
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
    const fotoFinal    = fotoBase64Temporaria || "https://via.placeholder.com/300x200?text=Sem+Foto";

    if (!nome || isNaN(preco) || preco <= 0) {
        return exibirToast("Preencha nome e preço válidos.", "error");
    }

    botaoCarregando('btn-salvar-produto', true);
    mostrarLoader("Salvando produto no catálogo...");

    const resposta = await executarRequisicaoAPI("cadastrar_produto", {
        produto: { nome, preco, foto: fotoFinal, visibilidade }
    });

    esconderLoader();
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
   13. AUTENTICAÇÃO, CADASTRO COM INDICAÇÃO E CONTROLE DE SESSÃO
   ═══════════════════════════════════════════════════════════════ */

/* ─── INÍCIO: tratarSolicitacaoCadastro ──────────────────────── */
async function tratarSolicitacaoCadastro(evento) {
    if (evento && evento.preventDefault) evento.preventDefault();

    const nome = document.getElementById('cad-nome').value.trim();
    const telefone = extrairApenasDigitos(document.getElementById('cad-telefone').value);
    const idade = parseInt(document.getElementById('cad-idade').value, 10);
    const indicadoPorNome = document.getElementById('cad-indicado-nome').value.trim();
    const indicadoPorTelefone = extrairApenasDigitos(document.getElementById('cad-indicado-telefone').value);
    const senha = document.getElementById('cad-senha').value;
    const senhaConf = document.getElementById('cad-senha-conf').value;

    if (telefone.length < 10) return exibirToast("Informe seu WhatsApp completo com DDD.", "error");
    if (isNaN(idade) || idade < 18) return exibirToast("Apenas maiores de 18 anos.", "error");
    if (!indicadoPorNome || indicadoPorTelefone.length < 10) return exibirToast("Informe quem indicou você e o WhatsApp dele.", "error");
    if (senha !== senhaConf) return exibirToast("As senhas digitadas não conferem.", "error");
    if (senha.length < 6) return exibirToast("A senha deve ter no mínimo 6 dígitos.", "error");

    botaoCarregando('btn-enviar-cadastro', true);
    mostrarLoader("Enviando solicitação de cadastro...");

    const resposta = await executarRequisicaoAPI("solicitar_cadastro", {
        nome,
        telefone,
        idade,
        indicadoPorNome,
        indicadoPorTelefone,
        senha
    });

    esconderLoader();
    botaoCarregando('btn-enviar-cadastro', false);

    if (resposta.sucesso) {
        exibirToast("Cadastro enviado! Você será avisado no WhatsApp assim que aprovado.", "success");
        document.getElementById('form-registro').reset();
        fecharModal('modal-instrucoes-cadastro');
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
        fecharModal('modal-login');
        atualizarInterfaceSessao();

        CacheLoja.limpar('produtos_visitante');
        await sincronizarProdutosServidor();
        exibirToast(resposta.mensagem || `Bem-vindo(a), ${resposta.nome}!`, "success");
    } else {
        exibirToast(resposta.mensagem || "Credenciais inválidas.", "error");
    }
}
/* ─── FIM: tratarLogin ───────────────────────────────────────── */

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
   14. CONTROLE VISUAL E NAVEGAÇÃO
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

    if (badge) {
        badge.textContent = estadoSessao.papel.toUpperCase();
        badge.className   = `badge badge-${estadoSessao.papel}`;
    }
    if (userLabel) {
        userLabel.textContent = estadoSessao.nomeUsuario || 'Olá';
    }
    atualizarAvatarUsuario();

    aplicarNavPorPapel(estadoSessao.papel);

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

    if (nomeAba !== 'pedidos-adm') {
        pararAutoRefreshEsteira();
    }

    if (nomeAba === 'vitrine')      sincronizarProdutosServidor();
    if (nomeAba === 'carrinho')     renderizarCarrinho();
    if (nomeAba === 'meus-pedidos') carregarMeusPedidos();
    if (nomeAba === 'pedidos-adm') {
        carregarPedidosAdm();
        iniciarAutoRefreshEsteira();
    }
    if (nomeAba === 'adm') {
        carregarPainelCentralAdm();
        consultarPendentesAdm();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
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
   15. MODAIS & CONFIRMAÇÃO
   ═══════════════════════════════════════════════════════════════ */

/* ─── INÍCIO: abrirModal ─────────────────────────────────────── */
function abrirModal(idModal) {
    const modal = document.getElementById(idModal);
    if (modal) modal.classList.add('active');
}
/* ─── FIM: abrirModal ─────────────────────────────────────────── */

/* ─── INÍCIO: fecharModal ────────────────────────────────────── */
function fecharModal(idModal) {
    const modal = document.getElementById(idModal);
    if (modal) modal.classList.remove('active');
    if (idModal === 'modal-chat') pararAutoRefreshChat();
}
/* ─── FIM: fecharModal ────────────────────────────────────────── */

let _callbackConfirmacao = null;

/* ─── INÍCIO: abrirConfirmacao ───────────────────────────────── */
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
            const cb = _callbackConfirmacao;
            fecharConfirmacao();
            if (typeof cb === 'function') cb();
        };
    }

    abrirModal('modal-confirmar');
}
/* ─── FIM: abrirConfirmacao ─────────────────────────────────── */

/* ─── INÍCIO: abrirConfirmacaoElemento ───────────────────────── */
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
            const cb = _callbackConfirmacao;
            fecharConfirmacao();
            if (typeof cb === 'function') cb();
        };
    }

    abrirModal('modal-confirmar');
}
/* ─── FIM: abrirConfirmacaoElemento ─────────────────────────── */

/* ─── INÍCIO: fecharConfirmacao ─────────────────────────────── */
function fecharConfirmacao() {
    fecharModal('modal-confirmar');
    _callbackConfirmacao = null;
}
/* ─── FIM: fecharConfirmacao ─────────────────────────────────── */

/* ─── INÍCIO: exibirToast ────────────────────────────────────── */
function exibirToast(mensagem, tipo = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.textContent = mensagem;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}
/* ─── FIM: exibirToast ───────────────────────────────────────── */

/* ─── INÍCIO: Listener Overlay Modais ────────────────────────── */
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', evento => {
        if (evento.target === overlay) {
            overlay.classList.remove('active');
            if (overlay.id === 'modal-chat') pararAutoRefreshChat();
        }
    });
});
/* ─── FIM: Listener Overlay Modais ──────────────────────────── */

/* ─── INÍCIO: Interceptador do Botão Voltar (Mobile / Android) ── */
window.addEventListener('popstate', () => {
    const modaisAbertos = document.querySelectorAll('.modal-overlay.active, .lightbox-modal.active');
    if (modaisAbertos.length > 0) {
        modaisAbertos.forEach(m => {
            if (m.id === 'modal-lightbox') fecharLightbox();
            else fecharModal(m.id);
        });
        fecharConfirmacao();
        return;
    }

    const abaAtual = document.querySelector('.view-panel.active');
    if (abaAtual && abaAtual.id !== 'view-vitrine' && abaAtual.id !== 'view-bloqueado') {
        navegarPara('vitrine');
    }
});

const abrirModalOriginal = window.abrirModal || abrirModal;
window.abrirModal = function(idModal) {
    history.pushState({ modalAberto: idModal }, '');
    abrirModalOriginal(idModal);
};
/* ─── FIM: Interceptador do Botão Voltar (Mobile / Android) ──── */

/* ═══════════════════════════════════════════════════════════════
   16. EXPORTAÇÕES GLOBAIS (LIGAÇÃO COM BINDINGS & DOM)
   ═══════════════════════════════════════════════════════════════ */
window.abrirModal                          = abrirModal;
window.fecharModal                         = fecharModal;
window.abrirConfirmacao                    = abrirConfirmacao;
window.exibirConfirmacao                   = abrirConfirmacao;
window.fecharConfirmacao                   = fecharConfirmacao;
window.confirmarLogout                     = confirmarLogout;
window.executarLogout                      = executarLogout;
window.navegarPara                         = navegarPara;
window.tratarCriacaoPedido                 = tratarCriacaoPedido;
window.removerFotoCarregada                = removerFotoCarregada;
window.gerarLinkTemporarioAdm              = gerarLinkTemporarioAdm;
window.copiarLinkGerado                    = copiarLinkGerado;
window.carregarPainelCentralAdm            = carregarPainelCentralAdm;
window.tratarSolicitacaoCadastro           = tratarSolicitacaoCadastro;
window.tratarLogin                         = tratarLogin;
window.tratarCadastroProduto               = tratarCadastroProduto;
window.processarUploadImagem               = processarUploadImagem;
window.copiarPixCopiaECola                 = copiarPixCopiaECola;
window.executarLimpezaTotalESaida          = executarLimpezaTotalESaida;
window.confirmarExclusaoProdutoAdm         = confirmarExclusaoProdutoAdm;
window.excluirProdutoAdm                   = excluirProdutoAdm;
window.aplicarNavPorPapel                  = aplicarNavPorPapel;
window.atualizarAvatarUsuario              = atualizarAvatarUsuario;
window.toggleUserDropdown                  = toggleUserDropdown;
window.fecharUserDropdown                  = fecharUserDropdown;
window.atualizarBadgeCarrinho              = atualizarBadgeCarrinho;

// Funções de acessibilidade e controle administrativo
window.alternarModoEscuro                  = alternarModoEscuro;
window.abrirLightboxFoto                   = abrirLightboxFoto;
window.fecharLightbox                      = fecharLightbox;
window.gerarRelatorioPdfVendas             = gerarRelatorioPdfVendas;
window.tocarSomNotificacao                 = tocarSomNotificacao;
window.alternarModoAcessoSistema           = alternarModoAcessoSistema;
window.cancelarExcluirPedidoAdm            = cancelarExcluirPedidoAdm;
window.limparConcluidosAdm                 = limparConcluidosAdm;

// Funções de vitrine e carrinho simplificado
window.alterarQuantidadeProdutoCard        = alterarQuantidadeProdutoCard;
window.modificarQtdCarrinho                = modificarQtdCarrinho;
window.solicitarRemocaoItemCarrinho        = solicitarRemocaoItemCarrinho;
window.enviarComprovanteWhatsApp           = enviarComprovanteWhatsApp;

// Funções de comandas e gavetas
window.carregarPedidosAdm                  = carregarPedidosAdm;
window.avancarStatusAdm                    = avancarStatusAdm;
window.iniciarAutoRefreshEsteira           = iniciarAutoRefreshEsteira;
window.pararAutoRefreshEsteira             = pararAutoRefreshEsteira;
window.alternarGavetaAdm                   = alternarGavetaAdm;
window.carregarListaMembrosGaveta          = carregarListaMembrosGaveta;
window.bloquearUsuarioComMotivo            = bloquearUsuarioComMotivo;
window.excluirUsuarioMembro                = excluirUsuarioMembro;
window.carregarListaBloqueadosGaveta       = carregarListaBloqueadosGaveta;
window.liberarContaUsuarioAdm              = liberarContaUsuarioAdm;
