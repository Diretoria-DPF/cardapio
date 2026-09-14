/* ============================================================================
   app.js — Plataforma Comercial Segura (v13 — Blindagem de Sessão e HMAC UTF-8)
   ============================================================================
   CORREÇÕES E BLINDAGEM:
     • Assinatura HMAC com serialização compatível com UTF-8 estrito no backend.
     • Auto-expiração e bloqueio imediato caso o link temporário vença no servidor.
     • Bloqueio contra atalhos de inspeção DevTools (F12, Ctrl+Shift+I/J/C, Ctrl+U)
       e desativação do menu de contexto com botão direito.
     • Higienização de mensagens contra injeção maliciosa e script injection.
     • Demarcação padronizada de INÍCIO e FIM em todas as funções.
   ============================================================================ */

// URL OFICIAL DA SUA API NO GOOGLE APPS SCRIPT:
const URL_BACKEND_APPS_SCRIPT = "https://script.google.com/macros/s/AKfycbyXUcaPSpe5nXhicDVcZlq7Lm_KF7sp63y6VrPychDsfF7ffsrSVGaSBriV5DSWn6rQ/exec";

/* ═══════════════════════════════════════════════════════════════
   0. FINGERPRINT, HMAC E BLINDAGEM DE INSPEÇÃO
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
    try { localStorage.setItem('plataforma_fingerprint', fp); } catch(e) {}
    return fp;
}
/* ─── FIM: gerarFingerprint ─────────────────────────────────── */

const FINGERPRINT = gerarFingerprint();

/* ─── INÍCIO: assinarHmac ────────────────────────────────────── */
/**
 * Gera a assinatura HMAC-SHA256 no cliente usando TextEncoder (UTF-8).
 * Assegura conformidade de caracteres acentuados com o Apps Script.
 */
async function assinarHmac(acao, payload, ts) {
    const hmacKey = sessionStorage.getItem('plataforma_hmac_key');
    if (!hmacKey) return null;

    const bodyAssinado = JSON.stringify({ acao, payload, ts });
    const enc = new TextEncoder();

    try {
        const key = await crypto.subtle.importKey(
            'raw',
            enc.encode(hmacKey),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        const assinatura = await crypto.subtle.sign('HMAC', key, enc.encode(bodyAssinado));
        return [...new Uint8Array(assinatura)]
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    } catch (e) {
        console.warn('[HMAC] Falha ao assinar requisição:', e);
        return null;
    }
}
/* ─── FIM: assinarHmac ───────────────────────────────────────── */

/* ─── INÍCIO: ativarBlindagemDevTools ────────────────────────── */
/**
 * Dificulta acesso acidental ou inspeção básica via atalhos e botão direito.
 */
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

/* ═══════════════════════════════════════════════════════════════
   1. FUNÇÕES AUXILIARES (HELPERS)
   ═══════════════════════════════════════════════════════════════ */

/* ─── INÍCIO: escaparHtml ────────────────────────────────────── */
function escaparHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, caractere => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[caractere]));
}
/* ─── FIM: escaparHtml ───────────────────────────────────────── */

/* ─── INÍCIO: fmtPreco ───────────────────────────────────────── */
function fmtPreco(valor) {
    const numero = typeof valor === 'number' ? valor : parseFloat(String(valor).replace(',', '.'));
    return `R$ ${(isNaN(numero) ? 0 : numero).toFixed(2).replace('.', ',')}`;
}
/* ─── FIM: fmtPreco ─────────────────────────────────────────── */

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
   2. CACHE LOCAL
   ═══════════════════════════════════════════════════════════════ */
const CacheLoja = {
    salvar(chave, dados) {
        try {
            localStorage.setItem('cache_' + chave, JSON.stringify({ dados, hora: Date.now() }));
        } catch (erro) {
            console.warn("[Cache] Limite de armazenamento local excedido:", erro);
        }
    },
    obter(chave) {
        try {
            const item = localStorage.getItem('cache_' + chave);
            return item ? JSON.parse(item).dados : null;
        } catch {
            return null;
        }
    },
    limpar(chave) {
        localStorage.removeItem('cache_' + chave);
    }
};

/* ═══════════════════════════════════════════════════════════════
   3. ESTADO GLOBAL DA APLICAÇÃO
   ═══════════════════════════════════════════════════════════════ */
const estadoSessao = {
    papel: 'visitante',
    token: null,
    nomeUsuario: 'Visitante'
};

let cestaCompras = [];
let catalogoProdutos = [];
let catalogoFiltrado = [];
let fotoBase64Temporaria = "";
let identificadorEmTentativa = "";
let pedidoChatAberto = null;

let _linkAutorizadoValido = false;
let _timerSilencioso = null;
let _segundosRestantesLink = 0;
let _timerPainelAdm = null;
let _timerChat = null;

/* ═══════════════════════════════════════════════════════════════
   4. INICIALIZAÇÃO E COMUNICAÇÃO HTTP
   ═══════════════════════════════════════════════════════════════ */

/* ─── INÍCIO: DOMContentLoaded ───────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
    ativarBlindagemDevTools();
    restaurarSessaoLocal();
    await verificarTokenUrl();
    atualizarInterfaceSessao();

    if (_linkAutorizadoValido || estadoSessao.papel !== 'visitante') {
        const produtosEmCache = CacheLoja.obter('produtos_' + estadoSessao.papel);
        if (produtosEmCache && produtosEmCache.length > 0) {
            catalogoProdutos = produtosEmCache;
            catalogoFiltrado = produtosEmCache;
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
        if (!e.target.closest('.user-menu')) {
            fecharUserDropdown();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
            fecharUserDropdown();
        }
    });
});
/* ─── FIM: DOMContentLoaded ─────────────────────────────────── */

/* ─── INÍCIO: obterUrlBasePlataforma ─────────────────────────── */
function obterUrlBasePlataforma() {
    return window.location.href.split('?')[0];
}
/* ─── FIM: obterUrlBasePlataforma ─────────────────────────────── */

/* ─── INÍCIO: verificarTokenUrl ──────────────────────────────── */
/**
 * Valida o link diretamente contra o backend em toda carga ou recarga da página.
 * Se expirado, impede persistência e tranca a tela imediatamente.
 */
async function verificarTokenUrl() {
    const params = new URLSearchParams(window.location.search);
    const tokenAcesso = params.get('token') || sessionStorage.getItem('plataforma_link_token');

    // Usuário autenticado com sessão própria não depende do link de visitante
    if (estadoSessao.token && estadoSessao.papel !== 'visitante') {
        _linkAutorizadoValido = true;
        return;
    }

    if (!tokenAcesso) {
        _linkAutorizadoValido = false;
        return;
    }

    mostrarLoader('Validando autorização de acesso...');
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
            exibirToast(res.mensagem || "O período do link de acesso terminou.", "error");
            executarLimpezaTotalESaida(true);
        }
    } catch (e) {
        console.error("[Token] Falha ao verificar:", e);
        _linkAutorizadoValido = false;
    } finally {
        esconderLoader();
    }
}
/* ─── FIM: verificarTokenUrl ─────────────────────────────────── */

/* ─── INÍCIO: iniciarTemporizadorSilencioso ──────────────────── */
function iniciarTemporizadorSilencioso(segundosTotais) {
    pararTemporizadorSilencioso();
    _segundosRestantesLink = segundosTotais;

    _timerSilencioso = setInterval(() => {
        _segundosRestantesLink--;

        if (_segundosRestantesLink <= 0) {
            pararTemporizadorSilencioso();
            exibirToast("O seu período de acesso terminou. Solicite um novo link ao administrador.", "info");
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

    try {
        localStorage.clear();
        sessionStorage.clear();
    } catch (e) {}

    if (fp) { try { localStorage.setItem('plataforma_fingerprint', fp); } catch(e) {} }

    document.cookie.split(";").forEach(c => {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });

    estadoSessao.papel       = 'visitante';
    estadoSessao.token       = null;
    estadoSessao.nomeUsuario = 'Visitante';
    cestaCompras             = [];
    _linkAutorizadoValido    = false;

    const urlLimpa = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, urlLimpa);

    if (!silencioso) {
        exibirToast("Sessão finalizada. Todos os dados foram reiniciados.", "info");
    }

    atualizarInterfaceSessao();
}
/* ─── FIM: executarLimpezaTotalESaida ─────────────────────────── */

/* ─── INÍCIO: fetchComTimeout ────────────────────────────────── */
async function fetchComTimeout(url, limiteTempoMs = 25000, opcoesExtras = {}) {
    const controladorAborto = new AbortController();
    const temporizador = setTimeout(() => controladorAborto.abort(), limiteTempoMs);

    const configuracao = {
        mode: 'cors',
        redirect: 'follow',
        cache: 'no-cache',
        ...opcoesExtras,
        signal: controladorAborto.signal
    };

    try {
        return await fetch(url, configuracao);
    } finally {
        clearTimeout(temporizador);
    }
}
/* ─── FIM: fetchComTimeout ───────────────────────────────────── */

/* ─── INÍCIO: executarRequisicaoAPI ──────────────────────────── */
async function executarRequisicaoAPI(acao, dadosExtras = {}, tentarRefresh = true) {
    try {
        const ts = Date.now();
        const payload = dadosExtras;

        const corpo = {
            acao,
            payload,
            ts,
            fingerprint: FINGERPRINT
        };

        if (estadoSessao.token) {
            corpo.token = estadoSessao.token;
            try {
                const hmac = await assinarHmac(acao, payload, ts);
                if (hmac) corpo.hmac = hmac;
            } catch (e) {}
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
            console.error("[API] Resposta não-JSON:", textoResposta.substring(0, 300));
            return { sucesso: false, mensagem: "Resposta inesperada do servidor." };
        }

        if (!json.sucesso && json.codigo === 'LINK_EXPIRED') {
            exibirToast(json.mensagem || "O link temporário expirou.", "error");
            executarLimpezaTotalESaida(true);
            return json;
        }

        if (!json.sucesso && json.codigo === 'SESSION_EXPIRED' && tentarRefresh) {
            const rt = sessionStorage.getItem('plataforma_refresh_token');
            if (rt) {
                const ok = await tentarRenovarSessao(rt);
                if (ok) {
                    return executarRequisicaoAPI(acao, dadosExtras, false);
                }
                exibirToast("Sua sessão expirou. Faça login novamente.", "error");
                executarLogout();
                return { sucesso: false, mensagem: "Sessão expirada." };
            }
        }

        return json;

    } catch (erroRede) {
        console.error("[API] Falha de comunicação:", erroRede);
        const semInternet = !navigator.onLine;
        exibirToast(
            semInternet ? "Sem conexão à internet." : "Falha na comunicação com o servidor.",
            "error"
        );
        return { sucesso: false, mensagem: erroRede.toString() };
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
                ts: Date.now(),
                fingerprint: FINGERPRINT
            })
        });
        const json = await resposta.json();

        if (json.sucesso && json.token) {
            estadoSessao.token = json.token;
            sessionStorage.setItem('plataforma_hmac_key', json.hmacKey);
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
   5. UPLOAD DE FOTOS E GIFS
   ═══════════════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════════════
   6. VITRINE DE PRODUTOS E GESTÃO DO CATÁLOGO (ADM)
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
            CacheLoja.salvar('produtos_' + estadoSessao.papel, catalogoProdutos);
            renderizarVitrine();
        }
    } catch (erro) {
        console.warn("[Vitrine] Erro na sincronização:", erro);
    }
}
/* ─── FIM: sincronizarProdutosServidor ───────────────────────── */

/* ─── INÍCIO: aplicarFiltroVitrine ──────────────────────────── */
function aplicarFiltroVitrine(termoManual = null) {
    const inputFiltro = document.getElementById('filtro-produtos');
    const termo = (termoManual !== null ? termoManual : (inputFiltro ? inputFiltro.value : '')).trim().toLowerCase();

    catalogoFiltrado = termo
        ? catalogoProdutos.filter(produto => String(produto.nome || '').toLowerCase().includes(termo))
        : catalogoProdutos;

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
            const btn = document.createElement('button');
            btn.className = 'btn btn-primary btn-block';
            btn.textContent = 'Adicionar à Cesta';
            btn.onclick = () => adicionarAoCarrinho(p);
            body.appendChild(btn);
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
        await sincronizarProdutosServidor();
    } else {
        exibirToast(res.mensagem || "Não foi possível excluir o produto.", "error");
    }
}
/* ─── FIM: excluirProdutoAdm ─────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   7. CENTRAL DE DÚVIDAS (FAQ) E SUGESTÕES
   ═══════════════════════════════════════════════════════════════ */

let listaDuvidasFaq = [
    {
        pergunta: "Como funciona a retirada e entrega do produto?",
        resposta: "Após a confirmação do pagamento, um chat exclusivo é aberto no seu pedido com todas as orientações de retirada ou envio pelo entregador."
    },
    {
        pergunta: "Quais são as formas de pagamento aceitas?",
        resposta: "Aceitamos PIX com confirmação dinâmica imediata, Cartão de Crédito e Criptomoedas (Bitcoin, Ethereum e Tether USDT)."
    },
    {
        pergunta: "Quanto tempo dura o chat temporário do pedido?",
        resposta: "O chat temporário permanece ativo enquanto a entrega estiver em andamento. Ao ser concluído pelo Administrador, o canal é finalizado com segurança."
    }
];

/* ─── INÍCIO: carregarFaqMemoria ─────────────────────────────── */
function carregarFaqMemoria() {
    const salvo = localStorage.getItem('loja_faq_dados');
    if (salvo) {
        try { listaDuvidasFaq = JSON.parse(salvo); } catch(e) {}
    }
}
/* ─── FIM: carregarFaqMemoria ─────────────────────────────────── */
carregarFaqMemoria();

/* ─── INÍCIO: abrirCentralDuvidas ────────────────────────────── */
function abrirCentralDuvidas() {
    if (estadoSessao.papel === 'visitante') {
        exibirToast("A Central de Dúvidas e Sugestões é exclusiva para membros.", "info");
        abrirModal('modal-login');
        return;
    }

    renderizarListaFaq();

    const editorAdm = document.getElementById('adm-editor-faq-area');
    if (editorAdm) {
        if (estadoSessao.papel === 'adm') {
            editorAdm.classList.remove('hidden');
        } else {
            editorAdm.classList.add('hidden');
        }
    }

    abrirModal('modal-duvidas-central');
}
/* ─── FIM: abrirCentralDuvidas ───────────────────────────────── */

/* ─── INÍCIO: renderizarListaFaq ─────────────────────────────── */
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
/* ─── FIM: renderizarListaFaq ─────────────────────────────────── */

/* ─── INÍCIO: tratarEnvioSugestao ────────────────────────────── */
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
/* ─── FIM: tratarEnvioSugestao ───────────────────────────────── */

/* ─── INÍCIO: tratarEnvioComentario ──────────────────────────── */
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
/* ─── FIM: tratarEnvioComentario ─────────────────────────────── */

/* ─── INÍCIO: tratarAdicionarFaq ─────────────────────────────── */
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
/* ─── FIM: tratarAdicionarFaq ─────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   8. SOLICITAÇÃO DE CADASTRO
   ═══════════════════════════════════════════════════════════════ */

/* ─── INÍCIO: tratarSolicitacaoCadastro ──────────────────────── */
async function tratarSolicitacaoCadastro(evento) {
    if (evento && evento.preventDefault) evento.preventDefault();

    const nome      = document.getElementById('cad-nome').value.trim();
    const telefone  = document.getElementById('cad-telefone').value.trim();
    const senha     = document.getElementById('cad-senha').value;
    const senhaConf = document.getElementById('cad-senha-conf').value;
    const twitter   = document.getElementById('cad-twitter').value.trim();
    const telegram  = document.getElementById('cad-telegram').value.trim();

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

/* ═══════════════════════════════════════════════════════════════
   9. AUTENTICAÇÃO E CONTROLE DE SESSÃO
   ═══════════════════════════════════════════════════════════════ */

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
        estadoSessao.papel       = resposta.papel;
        estadoSessao.token       = resposta.token;
        estadoSessao.nomeUsuario = resposta.nome;

        if (resposta.refreshToken) sessionStorage.setItem('plataforma_refresh_token', resposta.refreshToken);
        if (resposta.hmacKey)      sessionStorage.setItem('plataforma_hmac_key', resposta.hmacKey);

        _linkAutorizadoValido = true;

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
        mostrarLoader("Encerrando sessão e revogando link...");
        try {
            await executarRequisicaoAPI("invalidar_link", { tokenAcesso: tokenLink });
        } catch (erro) {}
    } else {
        mostrarLoader("Encerrando sessão...");
    }

    pararTemporizadorSilencioso();
    pararAutoRefreshChat();
    desligarAutoRefreshAdm();

    const fp = localStorage.getItem('plataforma_fingerprint');

    try {
        localStorage.clear();
        sessionStorage.clear();
    } catch (erro) {}

    if (fp) { try { localStorage.setItem('plataforma_fingerprint', fp); } catch(e) {} }

    try {
        document.cookie.split(";").forEach(c => {
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
    } catch (erro) {}

    estadoSessao.papel       = 'visitante';
    estadoSessao.token       = null;
    estadoSessao.nomeUsuario = 'Visitante';
    cestaCompras             = [];
    catalogoProdutos         = [];
    catalogoFiltrado         = [];
    _linkAutorizadoValido    = false;

    const urlLimpa = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, urlLimpa);

    esconderLoader();
    window.location.replace(urlLimpa);
}
/* ─── FIM: executarLogout ─────────────────────────────────────── */

/* ─── INÍCIO: restaurarSessaoLocal ───────────────────────────── */
function restaurarSessaoLocal() {
    const dadosSalvos = localStorage.getItem('plataforma_sessao');
    if (!dadosSalvos) return;
    try {
        const sessao = JSON.parse(dadosSalvos);
        estadoSessao.papel       = sessao.papel || 'visitante';
        estadoSessao.token       = sessao.token || null;
        estadoSessao.nomeUsuario = sessao.nomeUsuario || 'Visitante';

        if (estadoSessao.papel !== 'visitante') {
            _linkAutorizadoValido = true;
        }
    } catch {
        localStorage.removeItem('plataforma_sessao');
    }
}
/* ─── FIM: restaurarSessaoLocal ───────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   10. CONTROLE VISUAL E PERMISSÕES DE TELA
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
}
/* ─── FIM: atualizarInterfaceSessao ───────────────────────────── */

/* ─── INÍCIO: navegarPara ────────────────────────────────────── */
function navegarPara(nomeAba) {
    document.querySelectorAll('.bottom-nav__item').forEach(botao => botao.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(botao => botao.classList.remove('active'));
    document.querySelectorAll('.view-panel').forEach(painel => painel.classList.remove('active'));

    const botaoAtivo  = document.getElementById(`tab-btn-${nomeAba}`);
    const painelAtivo = document.getElementById(`view-${nomeAba}`);

    if (botaoAtivo && painelAtivo) {
        botaoAtivo.classList.add('active');
        painelAtivo.classList.remove('hidden');
        painelAtivo.classList.add('active');
    }

    fecharUserDropdown();

    if (nomeAba === 'vitrine')      sincronizarProdutosServidor();
    if (nomeAba === 'carrinho')     renderizarCarrinho();
    if (nomeAba === 'meus-pedidos') carregarMeusPedidos();
    if (nomeAba === 'pedidos-adm')  carregarPedidosAdm();
    if (nomeAba === 'adm') {
        carregarPainelCentralAdm();
        consultarPendentesAdm();
    }
}
/* ─── FIM: navegarPara ───────────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   11. CESTA DE COMPRAS E PEDIDOS
   ═══════════════════════════════════════════════════════════════ */

/* ─── INÍCIO: adicionarAoCarrinho ────────────────────────────── */
function adicionarAoCarrinho(produto) {
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
    exibirToast(`${produto.nome} adicionado à cesta.`, "info");
}
/* ─── FIM: adicionarAoCarrinho ───────────────────────────────── */

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
        exibirToast(`Pedido ${resposta.idPedido} gerado!`, "success");

        const metodoEscolhido = metodo;
        cestaCompras = [];
        atualizarBadgeCarrinho(0);

        navegarPara('meus-pedidos');
        abrirCobrancaPedido(resposta.idPedido, metodoEscolhido);
    } else {
        exibirToast(resposta.mensagem || "Não foi possível gerar o pedido.", "error");
        exibirContingenciaSuporteAdm(resposta.mensagem, metodo);
    }
}
/* ─── FIM: tratarCriacaoPedido ───────────────────────────────── */

/* ─── INÍCIO: exibirContingenciaSuporteAdm ───────────────────── */
function exibirContingenciaSuporteAdm(motivoErro, metodoEscolhido) {
    const itensDescricao = cestaCompras.map(item => `${item.nome} (x${item.quantidade})`).join(', ');
    const totalEstimado = document.getElementById('carrinho-total-valor')?.textContent || "R$ 0,00";

    const corpoMensagem = `
        <div style="text-align:left;font-size:0.9rem;color:#334155;">
            <p style="color:#b91c1c;font-weight:600;margin-bottom:8px;">
                ⚠️ Não foi possível concluir o pedido de forma automática:
            </p>
            <p style="background:#fef2f2;padding:8px;border-radius:6px;border:1px solid #fca5a5;font-size:0.8rem;margin-bottom:12px;">
                ${escaparHtml(motivoErro || "Instabilidade na ligação com o servidor.")}
            </p>
            <p style="margin-bottom:6px;">
                Pode contactar o Administrador agora mesmo para regularizar sua conta ou obter chave de pagamento manual.
            </p>
            <p style="font-size:0.8rem;color:#64748b;margin-bottom:12px;">
                <strong>Itens:</strong> ${escaparHtml(itensDescricao)}<br>
                <strong>Total:</strong> ${escaparHtml(totalEstimado)} | <strong>Forma:</strong> ${escaparHtml(metodoEscolhido)}
            </p>
        </div>
    `;

    abrirConfirmacao(
        "Suporte com o Administrador",
        corpoMensagem,
        async () => {
            mostrarLoader("A contactar o Administrador...");
            const textoMensagem = `[PEDIDO MANUAL] O utilizador ${estadoSessao.nomeUsuario} tentou pedir [${itensDescricao}] totalizando ${totalEstimado} via ${metodoEscolhido}, com aviso: "${motivoErro}". Por favor, enviar link manual.`;

            await executarRequisicaoAPI("enviar_comentario", {
                nome: estadoSessao.nomeUsuario,
                mensagem: textoMensagem
            });

            esconderLoader();
            exibirToast("O Administrador foi notificado com sucesso!", "success");
        }
    );

    const btnOk = document.getElementById('confirmar-btn-ok');
    if (btnOk) btnOk.textContent = "Chamar Administrador";
}
/* ─── FIM: exibirContingenciaSuporteAdm ───────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   12. MEUS PEDIDOS, PAGAMENTO SEGURO E CHAT
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

    resposta.pedidos.forEach(pedido => {
        const cartao = document.createElement('div');
        cartao.className = 'card';
        const statusMinusculo = String(pedido.status).toLowerCase();

        cartao.innerHTML = `
            <h4>Pedido: ${escaparHtml(pedido.id)}</h4>
            <p>Status: <strong>${escaparHtml(statusMinusculo.toUpperCase())}</strong>
               | Total: <strong>${fmtPreco(pedido.total)}</strong></p>
            <p>Forma de Pagamento: <strong>${escaparHtml(pedido.metodo || 'PIX')}</strong></p>
        `;

        const painelAcoes = document.createElement('div');
        painelAcoes.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;';

        if (statusMinusculo === 'analise') {
            const botaoPagar = document.createElement('button');
            botaoPagar.className = 'btn btn-success btn-sm';
            botaoPagar.textContent = '💳 Pagar / Ver Cobrança';
            botaoPagar.onclick = () => abrirCobrancaPedido(pedido.id, pedido.metodo);
            painelAcoes.appendChild(botaoPagar);
        }

        if (pedido.chatAtivo) {
            const botaoChat = document.createElement('button');
            botaoChat.className = 'btn btn-primary btn-sm';
            botaoChat.textContent = '💬 Abrir Chat';
            botaoChat.onclick = () => abrirChatPedido(pedido.id);
            painelAcoes.appendChild(botaoChat);
        } else {
            const avisoChat = document.createElement('small');
            avisoChat.style.color = '#94a3b8';
            avisoChat.textContent = 'Chat temporário encerrado.';
            painelAcoes.appendChild(avisoChat);
        }

        cartao.appendChild(painelAcoes);
        container.appendChild(cartao);
    });
}
/* ─── FIM: carregarMeusPedidos ───────────────────────────────── */

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
        imgQr.style.cssText = 'width:200px;height:200px;margin-bottom:12px;border:1px solid #cbd5e1;border-radius:8px;';

        const instrucoes = document.createElement('p');
        instrucoes.style.cssText = 'font-size:.85rem;color:#475569;margin-bottom:8px;';
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
        botaoCopiar.textContent = '📋 Copiar Código PIX';
        botaoCopiar.onclick = () => copiarPixCopiaECola();

        caixaConteudo.append(imgQr, instrucoes, inputPix, botaoCopiar);

    } else if (cobranca.tipo === "CRIPTO") {
        const imgQr = document.createElement('img');
        imgQr.src = cobranca.qrCodeUrl;
        imgQr.alt = "QR Code Cripto";
        imgQr.style.cssText = 'width:180px;height:180px;margin-bottom:10px;border-radius:8px;';

        const valorTexto = document.createElement('p');
        valorTexto.innerHTML = `<strong>Transferir:</strong> ${escaparHtml(cobranca.quantidadeEstimada)} ${escaparHtml(cobranca.moeda)}`;

        const carteiraTexto = document.createElement('p');
        carteiraTexto.style.cssText = 'font-size:.75rem;color:#64748b;word-break:break-all;margin:6px 0;';
        carteiraTexto.innerHTML = `<strong>Carteira:</strong><br>${escaparHtml(cobranca.carteiraDestino)}`;

        const botaoCopiar = document.createElement('button');
        botaoCopiar.type = 'button';
        botaoCopiar.className = 'btn btn-primary btn-block';
        botaoCopiar.textContent = '📋 Copiar Endereço da Carteira';
        botaoCopiar.onclick = () => {
            navigator.clipboard.writeText(cobranca.carteiraDestino);
            exibirToast("Carteira copiada para a área de transferência!", "success");
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
function copiarPixCopiaECola() {
    const input = document.getElementById('pix-copia-cola');
    if (!input) return;
    input.select();
    navigator.clipboard.writeText(input.value)
        .then(() => exibirToast("Código PIX copiado com sucesso!", "success"))
        .catch(() => {
            document.execCommand('copy');
            exibirToast("Código PIX copiado!", "success");
        });
}
/* ─── FIM: copiarPixCopiaECola ───────────────────────────────── */

/* ─── INÍCIO: abrirChatPedido ────────────────────────────────── */
async function abrirChatPedido(pedidoId) {
    pedidoChatAberto = pedidoId;
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
        if (!pedidoChatAberto) return pararAutoRefreshChat();
        await renderizarChat(true);
    }, 5000);
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
   13. PAINEL CENTRAL ADMINISTRATIVO E MONITORIA
   ═══════════════════════════════════════════════════════════════ */

/* ─── INÍCIO: carregarPainelCentralAdm ───────────────────────── */
async function carregarPainelCentralAdm() {
    if (estadoSessao.papel !== 'adm') return;

    // 1. Cadastros pendentes de aprovação
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
                linha.style.cssText = 'padding:10px 0;border-bottom:1px solid #e2e8f0;';

                linha.innerHTML = `
                    <p><strong>${escaparHtml(solicitacao.nome)}</strong> (Login: ${escaparHtml(solicitacao.telefone)})</p>
                    <p style="font-size:.78rem;color:#64748b;">
                        Twitter: ${escaparHtml(solicitacao.twitter || '-')} | Telegram: ${escaparHtml(solicitacao.telegram || '-')}
                    </p>
                `;

                const botaoAprovar = document.createElement('button');
                botaoAprovar.className = 'btn btn-success btn-sm';
                botaoAprovar.style.marginTop = '5px';
                botaoAprovar.textContent = 'Aprovar Membro';
                botaoAprovar.onclick = () => aprovarMembroAdm(solicitacao.id);
                linha.appendChild(botaoAprovar);

                divSolicitacoes.appendChild(linha);
            });
        } else {
            divSolicitacoes.innerHTML = '<div class="loading-slot">Nenhuma solicitação pendente.</div>';
        }
    }

    // 2. Usuários Ativos Cadastrados (Primeiro Nome em Destaque)
    const divUsuarios = document.getElementById('adm-usuarios-lista');
    if (divUsuarios) {
        divUsuarios.innerHTML = '<div class="loading-slot">Carregando usuários ativos...</div>';
        const respostaUsuarios = await executarRequisicaoAPI("listar_usuarios_adm");
        divUsuarios.innerHTML = '';

        if (respostaUsuarios.sucesso && Array.isArray(respostaUsuarios.usuarios) && respostaUsuarios.usuarios.length > 0) {
            let html = '<table class="tabela-metricas"><thead><tr><th>Primeiro Nome</th><th>Login/Telefone</th><th>Papel</th></tr></thead><tbody>';
            respostaUsuarios.usuarios.forEach(u => {
                html += `<tr>
                    <td><strong>${escaparHtml(u.primeiroNome)}</strong> <small style="color:#64748b;">(${escaparHtml(u.nomeCompleto)})</small></td>
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

    // 3. Métricas de Vendas
    const respostaMetricas = await executarRequisicaoAPI("obter_metricas_vendas");
    if (respostaMetricas.sucesso) {
        const elementoFaturamento = document.getElementById('metric-faturamento');
        const elementoPedidos = document.getElementById('metric-pedidos');
        if (elementoFaturamento) elementoFaturamento.textContent = fmtPreco(respostaMetricas.faturamentoTotal || 0);
        if (elementoPedidos) elementoPedidos.textContent = respostaMetricas.totalPedidos || 0;

        const divTabela = document.getElementById('tabela-metricas-produtos');
        if (divTabela) {
            if (!respostaMetricas.itensDetalhados || respostaMetricas.itensDetalhados.length === 0) {
                divTabela.innerHTML = '<div class="loading-slot">Sem vendas registadas ainda.</div>';
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

    // 5. Mensagens e Comentários Recebidos
    const respostaComentarios = await executarRequisicaoAPI("listar_comentarios_adm");
    const divComentarios = document.getElementById('adm-comentarios-lista');
    if (divComentarios) {
        divComentarios.innerHTML = '';
        if (respostaComentarios.sucesso && Array.isArray(respostaComentarios.comentarios) && respostaComentarios.comentarios.length > 0) {
            respostaComentarios.comentarios.forEach(comentario => {
                const paragrafo = document.createElement('p');
                paragrafo.style.cssText = 'font-size:.8rem;padding:6px 0;border-bottom:1px solid #e2e8f0;';
                const dataFormatada = comentario.data ? new Date(comentario.data).toLocaleString() : '';
                paragrafo.innerHTML = `<strong>${escaparHtml(comentario.nome || 'Anônimo')}</strong> <small style="color:#94a3b8;">${escaparHtml(dataFormatada)}</small><br>${escaparHtml(comentario.texto || '')}`;
                divComentarios.appendChild(paragrafo);
            });
        } else {
            divComentarios.innerHTML = '<div class="loading-slot">Sem mensagens.</div>';
        }
    }
}
/* ─── FIM: carregarPainelCentralAdm ─────────────────────────── */

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

/* ─── INÍCIO: consultarPendentesAdm ──────────────────────────── */
async function consultarPendentesAdm() {
    if (estadoSessao.papel !== 'adm') return;
    try {
        const resposta = await executarRequisicaoAPI("listar_solicitacoes_adm");
        const total = (resposta.sucesso && Array.isArray(resposta.solicitacoes)) ? resposta.solicitacoes.length : 0;
        atualizarBadgePendentesAdm(total);
    } catch {}
}
/* ─── FIM: consultarPendentesAdm ─────────────────────────────── */

/* ─── INÍCIO: ligarAutoRefreshAdm ────────────────────────────── */
function ligarAutoRefreshAdm() {
    desligarAutoRefreshAdm();
    if (estadoSessao.papel !== 'adm') return;
    consultarPendentesAdm();

    _timerPainelAdm = setInterval(() => {
        if (estadoSessao.papel !== 'adm') {
            desligarAutoRefreshAdm();
            return;
        }
        consultarPendentesAdm();
    }, 20000);
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
   14. ESTEIRA DE PEDIDOS (ADM)
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
        resposta.pedidos.forEach(pedido => {
            const divCartao = document.createElement('div');
            divCartao.style.cssText = 'background:#fff;padding:8px;margin-bottom:8px;border-radius:6px;border:1px solid #cbd5e1;';

            divCartao.innerHTML = `
                <small><strong>${escaparHtml(pedido.id)}</strong></small><br>
                <small>${fmtPreco(pedido.total)}</small><br>
                <small style="color:#64748b;">Forma: ${escaparHtml(pedido.metodo || 'PIX')}</small>
            `;

            const painelBotoes = document.createElement('div');
            painelBotoes.style.cssText = 'display:flex;gap:4px;margin-top:6px;';

            if (pedido.status !== 'concluido') {
                const botaoAvancar = document.createElement('button');
                botaoAvancar.className = 'btn btn-primary btn-sm';
                botaoAvancar.textContent = 'Avançar Fase';
                botaoAvancar.onclick = () => avancarStatusAdm(pedido.id, pedido.status);
                painelBotoes.appendChild(botaoAvancar);
            }

            const botaoChatAdm = document.createElement('button');
            botaoChatAdm.className = 'btn btn-outline-dark btn-sm';
            botaoChatAdm.textContent = '💬';
            botaoChatAdm.title = 'Abrir Chat com o Cliente';
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
   15. GERAÇÃO DE LINKS TEMPORÁRIOS E CADASTRO DE PRODUTOS
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
    exibirToast("A guardar produto na planilha...", "info");

    const resposta = await executarRequisicaoAPI("cadastrar_produto", {
        produto: { nome, preco, foto: fotoFinal, visibilidade }
    });

    botaoCarregando('btn-salvar-produto', false);

    if (resposta.sucesso) {
        exibirToast("Produto adicionado ao catálogo!", "success");
        document.getElementById('form-novo-produto').reset();
        removerFotoCarregada();
        await sincronizarProdutosServidor();
    } else {
        exibirToast(resposta.mensagem || "Erro ao salvar produto.", "error");
    }
}
/* ─── FIM: tratarCadastroProduto ─────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   16. MODAIS, DIÁLOGOS DE CONFIRMAÇÃO E TOASTS
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
/* ─── FIM: fecharModal ───────────────────────────────────────── */

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
            fecharConfirmacao();
            if (typeof _callbackConfirmacao === 'function') _callbackConfirmacao();
        };
    }

    abrirModal('modal-confirmar');
}
/* ─── FIM: abrirConfirmacao ──────────────────────────────────── */

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
            fecharConfirmacao();
            if (typeof _callbackConfirmacao === 'function') _callbackConfirmacao();
        };
    }

    abrirModal('modal-confirmar');
}
/* ─── FIM: abrirConfirmacaoElemento ───────────────────────────── */

/* ─── INÍCIO: fecharConfirmacao ──────────────────────────────── */
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

document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', evento => {
        if (evento.target === overlay) {
            overlay.classList.remove('active');
            if (overlay.id === 'modal-chat') pararAutoRefreshChat();
        }
    });
});

/* ═══════════════════════════════════════════════════════════════
   17. HELPERS DE INTERFACE E NAVEGAÇÃO
   ═══════════════════════════════════════════════════════════════ */

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
   18. EXPORTAÇÕES GLOBAIS (LIGAÇÃO COM BINDINGS)
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
