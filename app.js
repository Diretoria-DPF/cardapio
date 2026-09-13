/* ============================================================================
   app.js — Plataforma Comercial Segura (v6 Definitiva e Consolidada)
   ============================================================================
   RECURSOS CONSOLIDADOS:
     • Acesso restrito: vitrine só abre com link temporário do ADM ou login ADM.
     • Temporizador 100% invisível em background (sem ansiedade para o cliente).
     • Limpeza total (purge): apaga cookies, localStorage e tranca a tela ao expirar.
     • Emissão de links com 10, 15, 30 min ou tempo personalizado (ADM).
     • Vitrine limpa: visibilidade controlada exclusivamente pelo Administrador.
     • Central de Dúvidas e Sugestões privada para membros e editável pelo ADM.
     • Pagamentos integrados (QR Code PIX dinâmico, Criptomoedas e Cartão).
     • Chat temporário por pedido com atualização a cada 5s.
     • Auto-refresh e badge no Painel ADM a cada 20s.
     • Total conformidade com CSP e bindings.js. 
   ============================================================================ */

// URL OFICIAL DA SUA API NO GOOGLE APPS SCRIPT:
const URL_BACKEND_APPS_SCRIPT = "https://script.google.com/macros/s/AKfycbw3a-97OX8Vz35xJsaKqrpps6H9yXROTCIcWykpwVlAiJP2gqDTK7sa2CyoQ8D0TgaK/exec";

// ============================================================================
// 1. FUNÇÕES AUXILIARES (HELPERS)
// ============================================================================

/** Higieniza texto para inserção segura no DOM, prevenindo ataques XSS. */
function escaparHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, caractere => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[caractere]));
}

/** Formata números no padrão monetário brasileiro (R$). */
function fmtPreco(valor) {
    const numero = typeof valor === 'number' ? valor : parseFloat(String(valor).replace(',', '.'));
    return `R$ ${(isNaN(numero) ? 0 : numero).toFixed(2).replace('.', ',')}`;
}

/** Exibe o indicador de carregamento global. */
function mostrarLoader(texto = 'Carregando...') {
    const elementoTexto = document.getElementById('loader-text');
    const elementoOverlay = document.getElementById('loader-overlay');
    if (elementoTexto) elementoTexto.textContent = texto;
    if (elementoOverlay) elementoOverlay.classList.remove('hidden');
}

/** Oculta o indicador de carregamento global. */
function esconderLoader() {
    const elementoOverlay = document.getElementById('loader-overlay');
    if (elementoOverlay) elementoOverlay.classList.add('hidden');
}

/** Alterna o estado visual e bloqueio de botões de ação. */
function botaoCarregando(idBotao, carregando = true) {
    const botao = document.getElementById(idBotao);
    if (!botao) return;
    botao.disabled = carregando;
    botao.classList.toggle('loading', carregando);
}

// ============================================================================
// 2. MEMÓRIA EM CACHE LOCAL (RESPOSTA INSTANTÂNEA)
// ============================================================================
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

// ============================================================================
// 3. ESTADO GLOBAL DA APLICAÇÃO
// ============================================================================
const estadoSessao = {
    papel: 'visitante',          // 'visitante' | 'membro' | 'entregador' | 'adm'
    token: null,
    nomeUsuario: 'Visitante'
};

let cestaCompras = [];
let catalogoProdutos = [];
let catalogoFiltrado = [];
let fotoBase64Temporaria = "";
let identificadorEmTentativa = "";
let pedidoChatAberto = null;

// Controle de acesso exclusivo por link
let _linkAutorizadoValido = false;

// Timers de segundo plano
let _timerSilencioso = null;
let _segundosRestantesLink = 0;
let _timerPainelAdm = null;
let _timerChat = null;

// ============================================================================
// 4. INICIALIZAÇÃO, REDE BLINDADA E ACESSO EXCLUSIVO
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    restaurarSessaoLocal();
    await verificarTokenUrl();
    atualizarInterfaceSessao();

    // Se estiver liberado (via link ou login de ADM), carrega os produtos
    if (_linkAutorizadoValido || estadoSessao.papel === 'adm') {
        const produtosEmCache = CacheLoja.obter('produtos_' + estadoSessao.papel);
        if (produtosEmCache && produtosEmCache.length > 0) {
            catalogoProdutos = produtosEmCache;
            catalogoFiltrado = produtosEmCache;
            renderizarVitrine();
        }
        await sincronizarProdutosServidor();
    }
});

function obterUrlBasePlataforma() {
    return window.location.href.split('?')[0];
}

/**
 * Validação do Token na URL e controle de entrada restrita
 */
async function verificarTokenUrl() {
    const params = new URLSearchParams(window.location.search);
    const tokenAcesso = params.get('token');

    // Se não há token na URL:
    if (!tokenAcesso) {
        // Se for o ADM já logado, tem passe livre
        if (estadoSessao.papel === 'adm') {
            _linkAutorizadoValido = true;
            return;
        }
        // Caso contrário, bloqueia a loja
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
            estadoSessao.token = tokenAcesso;

            // Inicia a contagem regressiva 100% silenciosa nos bastidores
            const segundos = res.segundosRestantes || (15 * 60);
            iniciarTemporizadorSilencioso(segundos);
        } else {
            _linkAutorizadoValido = false;
            exibirToast(res.mensagem || "Este link de acesso expirou.", "error");
            executarLimpezaTotalESaida(true);
        }
    } catch (e) {
        console.error("[Token] Erro ao validar:", e);
        _linkAutorizadoValido = false;
    } finally {
        esconderLoader();
    }
}

/**
 * Temporizador totalmente invisível (sem relógio na tela)
 */
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

function pararTemporizadorSilencioso() {
    if (_timerSilencioso) {
        clearInterval(_timerSilencioso);
        _timerSilencioso = null;
    }
}

/**
 * Limpeza Completa (Purge): apaga cookies, storage e tranca a tela
 */
function executarLimpezaTotalESaida(silencioso = false) {
    pararTemporizadorSilencioso();
    pararAutoRefreshChat();
    desligarAutoRefreshAdm();

    // 1. Limpa todas as memórias locais
    try {
        localStorage.clear();
        sessionStorage.clear();
    } catch (e) {
        console.warn("Storage limpo:", e);
    }

    // 2. Elimina todos os cookies do domínio
    document.cookie.split(";").forEach(c => {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });

    // 3. Reinicia variáveis de estado
    estadoSessao.papel = 'visitante';
    estadoSessao.token = null;
    estadoSessao.nomeUsuario = 'Visitante';
    cestaCompras = [];
    _linkAutorizadoValido = false;

    // 4. Remove o parâmetro ?token=... da barra de endereços
    const urlLimpa = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, urlLimpa);

    if (!silencioso) {
        exibirToast("Sessão finalizada. Todos os dados foram reiniciados.", "info");
    }

    // Atualiza a tela: tranca na tela de bloqueio
    atualizarInterfaceSessao();
}

/**
 * Comunicação fetch com timeout, redirects e modo CORS
 */
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

async function executarRequisicaoAPI(acao, dadosExtras = {}) {
    try {
        const corpoEnvio = JSON.stringify({ acao, ...dadosExtras });

        const resposta = await fetchComTimeout(URL_BACKEND_APPS_SCRIPT, 25000, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: corpoEnvio
        });

        const textoResposta = await resposta.text();

        try {
            return JSON.parse(textoResposta);
        } catch (erroParse) {
            console.error("[API] Resposta não-JSON:", textoResposta);
            return { sucesso: false, mensagem: "Resposta inesperada do servidor." };
        }
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

// ============================================================================
// 5. UPLOAD DE FOTOS E GIFS DO DISPOSITIVO
// ============================================================================
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

function exibirPreviewImagem(origemBase64) {
    const imgPreview = document.getElementById('img-preview');
    const containerPreview = document.getElementById('preview-container');
    const inputUrl = document.getElementById('adm-prod-foto-url');

    if (imgPreview) imgPreview.src = origemBase64;
    if (containerPreview) containerPreview.classList.remove('hidden');
    if (inputUrl) inputUrl.value = "";
}

function removerFotoCarregada() {
    fotoBase64Temporaria = "";
    const containerPreview = document.getElementById('preview-container');
    const inputArquivo = document.getElementById('adm-prod-arquivo');
    const imgPreview = document.getElementById('img-preview');

    if (containerPreview) containerPreview.classList.add('hidden');
    if (inputArquivo) inputArquivo.value = "";
    if (imgPreview) imgPreview.src = "";
}

// ============================================================================
// 6. VITRINE DE PRODUTOS E BUSCA EM TEMPO REAL
// ============================================================================
async function sincronizarProdutosServidor() {
    let url = `${URL_BACKEND_APPS_SCRIPT}?acao=listar_produtos`;
    if (estadoSessao.token) {
        url += `&token=${encodeURIComponent(estadoSessao.token)}`;
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
        console.warn("[Vitrine] Modo offline ou aguardando rede:", erro);
    }
}

function aplicarFiltroVitrine(termoManual = null) {
    const inputFiltro = document.getElementById('filtro-produtos');
    const termo = (termoManual !== null ? termoManual : (inputFiltro ? inputFiltro.value : '')).trim().toLowerCase();

    catalogoFiltrado = termo
        ? catalogoProdutos.filter(produto => String(produto.nome || '').toLowerCase().includes(termo))
        : catalogoProdutos;

    renderizarVitrine();
}

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

        // 1. Membros e Entregadores têm acesso à compra (SEM RÓTULOS DE PÚBLICO/MEMBRO)
        if (estadoSessao.papel === 'membro' || estadoSessao.papel === 'entregador') {
            const btn = document.createElement('button');
            btn.className = 'btn btn-primary btn-block';
            btn.textContent = 'Adicionar à Cesta';
            btn.onclick = () => adicionarAoCarrinho(p);
            body.appendChild(btn);
        }
        // 2. Administrador: Vê o CONTROLE DE VISIBILIDADE dinâmico
        else if (estadoSessao.papel === 'adm') {
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
        }
        // 3. Visitante com link ativo: Vê nota discreta (SEM rótulos de público/membro)
        else {
            const aviso = document.createElement('small');
            aviso.className = 'visitor-note';
            aviso.textContent = 'Cadastre-se para comprar.';
            body.appendChild(aviso);
        }

        card.append(img, body);
        grid.appendChild(card);
    });
}

/** Permite ao Administrador trocar a visibilidade do produto na hora */
async function alterarVisibilidadeProdutoAdm(idProduto, novaVisib) {
    mostrarLoader("Alterando visibilidade...");
    const res = await executarRequisicaoAPI("alterar_visibilidade_produto", {
        tokenAdm: estadoSessao.token,
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

// ============================================================================
// 7. CENTRAL DE DÚVIDAS RÁPIDAS (FAQ) E SUGESTÕES EXCLUSIVAS
// ============================================================================

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

function carregarFaqMemoria() {
    const salvo = localStorage.getItem('loja_faq_dados');
    if (salvo) {
        try { listaDuvidasFaq = JSON.parse(salvo); } catch(e) {}
    }
}
carregarFaqMemoria();

function abrirCentralDuvidas() {
    // Apenas Membros e ADM têm acesso às dúvidas e sugestões
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

        // Se for ADM, dá a opção de excluir a pergunta
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

// ============================================================================
// 8. SOLICITAÇÃO DE CADASTRO
// ============================================================================
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

// ============================================================================
// 9. AUTENTICAÇÃO (LOGIN / LOGOUT / DESBLOQUEIO)
// ============================================================================
async function tratarLogin(evento) {
    if (evento && evento.preventDefault) evento.preventDefault();

    const usuario = document.getElementById('login-usuario').value.trim();
    const senha   = document.getElementById('login-senha').value;
    identificadorEmTentativa = usuario;

    botaoCarregando('btn-entrar', true);
    exibirToast("A autenticar...", "info");

    const resposta = await executarRequisicaoAPI("login", { identificador: usuario, senha });

    botaoCarregando('btn-entrar', false);

    if (resposta.sucesso) {
        estadoSessao.papel       = resposta.papel;
        estadoSessao.token       = resposta.token;
        estadoSessao.nomeUsuario = resposta.nome;

        // Se for o Administrador, ele tem passe livre permanente
        if (resposta.papel === 'adm') {
            _linkAutorizadoValido = true;
        }

        localStorage.setItem('plataforma_sessao', JSON.stringify(estadoSessao));
        document.getElementById('form-login').reset();
        document.getElementById('box-desbloqueio-conta').classList.add('hidden');
        fecharModal('modal-login');
        atualizarInterfaceSessao();

        CacheLoja.limpar('produtos_visitante');
        await sincronizarProdutosServidor();
        exibirToast(`Bem-vindo, ${resposta.nome}!`, "success");
    } else {
        exibirToast(resposta.mensagem || "Credenciais inválidas.", "error");
        if (resposta.requerLiberacaoAdm) {
            document.getElementById('box-desbloqueio-conta').classList.remove('hidden');
        }
    }
}

async function enviarPedidoDesbloqueio() {
    if (!identificadorEmTentativa) return;
    const resposta = await executarRequisicaoAPI("pedir_desbloqueio", { identificador: identificadorEmTentativa });
    if (resposta.sucesso) {
        exibirToast(resposta.mensagem || "Pedido de liberação enviado com sucesso.", "success");
        const btn = document.getElementById('btn-solicitar-desbloqueio');
        if (btn) btn.disabled = true;
    }
}

function confirmarLogout() {
    abrirConfirmacao("Sair da conta", "Deseja realmente encerrar a sessão?", executarLogout);
}

/**
 * LOGOUT COMPLETO:
 *   1. Invalida o link temporário no servidor (se houver um na URL).
 *   2. Limpa sessão, cookies, cache local e todos os timers.
 *   3. Remove o ?token= da URL.
 *   4. Recarrega a página → mostra a tela de bloqueio 🔒.
 *      O usuário PRECISA de um novo link para voltar.
 */
async function executarLogout() {
    // ─── 1. Captura o token do link ANTES de qualquer limpeza ──
    const params = new URLSearchParams(window.location.search);
    const tokenLink = params.get('token');

    // ─── 2. Invalida no servidor + feedback visual ─────────────
    if (tokenLink) {
        mostrarLoader("Encerrando sessão e revogando link...");
        try {
            await executarRequisicaoAPI("invalidar_link", { tokenAcesso: tokenLink });
        } catch (erro) {
            console.warn("[Logout] Não foi possível invalidar o link:", erro);
        }
    } else {
        mostrarLoader("Encerrando sessão...");
    }

    // ─── 3. Para TODOS os timers em segundo plano ──────────────
    pararTemporizadorSilencioso();
    pararAutoRefreshChat();
    desligarAutoRefreshAdm();

    // ─── 4. Limpa storages locais ──────────────────────────────
    try {
        localStorage.clear();
        sessionStorage.clear();
    } catch (erro) {
        console.warn("[Logout] Erro ao limpar storage:", erro);
    }

    // ─── 5. Elimina cookies do domínio ─────────────────────────
    try {
        document.cookie.split(";").forEach(c => {
            document.cookie = c.replace(/^ +/, "")
                .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
    } catch (erro) {
        console.warn("[Logout] Erro ao limpar cookies:", erro);
    }

    // ─── 6. Reinicia variáveis de estado ───────────────────────
    estadoSessao.papel       = 'visitante';
    estadoSessao.token       = null;
    estadoSessao.nomeUsuario = 'Visitante';
    cestaCompras             = [];
    catalogoProdutos         = [];
    catalogoFiltrado         = [];
    _linkAutorizadoValido    = false;

    // ─── 7. Remove ?token=... da barra de endereços ────────────
    const urlLimpa = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, urlLimpa);

    esconderLoader();

    // ─── 8. Recarrega do zero → cai na tela de bloqueio ────────
    //   Usa replace() para o usuário não conseguir voltar com "Back"
    //   e reencontrar o token antigo.
    window.location.replace(urlLimpa);
}

function restaurarSessaoLocal() {
    const dadosSalvos = localStorage.getItem('plataforma_sessao');
    if (!dadosSalvos) return;
    try {
        const sessao = JSON.parse(dadosSalvos);
        estadoSessao.papel       = sessao.papel || 'visitante';
        estadoSessao.token       = sessao.token || null;
        estadoSessao.nomeUsuario = sessao.nomeUsuario || 'Visitante';

        if (estadoSessao.papel === 'adm') {
            _linkAutorizadoValido = true;
        }
    } catch {
        localStorage.removeItem('plataforma_sessao');
    }
}

// ============================================================================
// 10. CONTROLO VISUAL: BLOQUEIO SEM LINK VS LOJA LIBERADA
// ============================================================================
function atualizarInterfaceSessao() {
    const badge          = document.getElementById('role-badge');
    const anonBox        = document.getElementById('anon-buttons');
    const authBox        = document.getElementById('auth-buttons');
    const userLabel      = document.getElementById('user-display-name');
    const navBar         = document.getElementById('app-nav-bar');

    const tabCarrinho    = document.getElementById('tab-btn-carrinho');
    const tabMeusPedidos = document.getElementById('tab-btn-meus-pedidos');
    const tabNovoProduto = document.getElementById('tab-btn-novo-produto');
    const tabPedidosAdm  = document.getElementById('tab-btn-pedidos-adm');
    const tabAdm         = document.getElementById('tab-btn-adm');

    const viewBloqueado  = document.getElementById('view-bloqueado');

    if (badge) {
        badge.textContent = estadoSessao.papel.toUpperCase();
        badge.className   = `badge badge-${estadoSessao.papel}`;
    }

    const esconder = elemento => elemento && elemento.classList.add('hidden');
    const mostrar  = elemento => elemento && elemento.classList.remove('hidden');

    [tabCarrinho, tabMeusPedidos, tabNovoProduto, tabPedidosAdm, tabAdm].forEach(esconder);

    // ─── REGRA DE OURO: BLOQUEIA SE NÃO POSSUIR LINK E NÃO FOR ADM ───
    if (!_linkAutorizadoValido && estadoSessao.papel !== 'adm') {
        esconder(navBar);

        // Esconde TODOS os painéis (remove 'active' também, não só adiciona 'hidden')
        document.querySelectorAll('.view-panel').forEach(painel => {
            painel.classList.add('hidden');
            painel.classList.remove('active');
        });

        // ⚠️ CORREÇÃO: a tela de bloqueio precisa ficar ATIVA também
        if (viewBloqueado) {
            viewBloqueado.classList.remove('hidden');
            viewBloqueado.classList.add('active');
        }

        mostrar(anonBox);
        esconder(authBox);
        return;
    }

    // ─── ESTAMOS LIBERADOS (link válido ou ADM logado) ──────────────
    mostrar(navBar);

    // Esconde a tela de bloqueio por completo
    if (viewBloqueado) {
        viewBloqueado.classList.add('hidden');
        viewBloqueado.classList.remove('active');
    }

    if (estadoSessao.papel === 'visitante') {
        mostrar(anonBox); esconder(authBox);
    } else if (estadoSessao.papel === 'membro') {
        esconder(anonBox); mostrar(authBox);
        if (userLabel) userLabel.textContent = `Olá, ${estadoSessao.nomeUsuario}`;
        mostrar(tabCarrinho); mostrar(tabMeusPedidos);
    } else if (estadoSessao.papel === 'entregador') {
        esconder(anonBox); mostrar(authBox);
        if (userLabel) userLabel.textContent = `Entregador: ${estadoSessao.nomeUsuario}`;
        mostrar(tabMeusPedidos); mostrar(tabPedidosAdm);
    } else if (estadoSessao.papel === 'adm') {
        esconder(anonBox); mostrar(authBox);
        if (userLabel) userLabel.textContent = `ADM: ${estadoSessao.nomeUsuario}`;
        mostrar(tabNovoProduto); mostrar(tabPedidosAdm); mostrar(tabAdm);
    }

    // ⚠️ CORREÇÃO CRÍTICA: garante que SEMPRE haja um painel visível
    // (evita "tela em branco" mesmo se o painel atual ficou com .hidden)
    const algumPainelVisivel = document.querySelector('.view-panel.active:not(.hidden)');
    if (!algumPainelVisivel) {
        navegarPara('vitrine');
    }

    if (estadoSessao.papel === 'adm') {
        ligarAutoRefreshAdm();
    } else {
        desligarAutoRefreshAdm();
        atualizarBadgePendentesAdm(0);
    }
}
// ============================================================================
// 11. NAVEGAÇÃO ENTRE TELAS
// ============================================================================
function navegarPara(nomeAba) {
    document.querySelectorAll('.nav-tab').forEach(botao => botao.classList.remove('active'));
    document.querySelectorAll('.view-panel').forEach(painel => painel.classList.remove('active'));

    const botaoAtivo  = document.getElementById(`tab-btn-${nomeAba}`);
    const painelAtivo = document.getElementById(`view-${nomeAba}`);

    if (botaoAtivo && painelAtivo) {
        botaoAtivo.classList.add('active');
        // ⚠️ CORREÇÃO: remove 'hidden' ANTES de adicionar 'active'
        painelAtivo.classList.remove('hidden');
        painelAtivo.classList.add('active');
    }

    if (nomeAba === 'vitrine')      sincronizarProdutosServidor();
    if (nomeAba === 'carrinho')     renderizarCarrinho();
    if (nomeAba === 'meus-pedidos') carregarMeusPedidos();
    if (nomeAba === 'pedidos-adm')  carregarPedidosAdm();
    if (nomeAba === 'adm') {
        carregarPainelCentralAdm();
        consultarPendentesAdm();
    }
}
// ============================================================================
// 12. CESTA DE COMPRAS E CRIAÇÃO DE PEDIDOS
// ============================================================================
function adicionarAoCarrinho(produto) {
    const itemExistente = cestaCompras.find(item => item.id === produto.id);
    if (itemExistente) {
        itemExistente.quantidade += 1;
    } else {
        cestaCompras.push({
            id: produto.id,
            nome: produto.nome,
            preco: typeof produto.preco === 'number' ? produto.preco : parseFloat(String(produto.preco).replace(',', '.')),
            quantidade: 1
        });
    }

    const totalItens = cestaCompras.reduce((acumulador, item) => acumulador + item.quantidade, 0);
    const contador = document.getElementById('cart-counter');
    if (contador) contador.textContent = totalItens;
    exibirToast(`${produto.nome} adicionado à cesta.`, "info");
}

function renderizarCarrinho() {
    const lista = document.getElementById('carrinho-itens-lista');
    if (!lista) return;
    lista.innerHTML = '';
    let valorTotal = 0;

    if (cestaCompras.length === 0) {
        lista.innerHTML = `<div class="empty-state"><strong>Sua cesta está vazia</strong>Adicione itens da vitrine.</div>`;
        document.getElementById('carrinho-total-valor').textContent = 'R$ 0,00';
        return;
    }

    cestaCompras.forEach(item => {
        const subtotal = item.preco * item.quantidade;
        valorTotal += subtotal;

        const linha = document.createElement('div');
        linha.className = 'cart-item-row';
        linha.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid #e2e8f0;';

        const descricao = document.createElement('span');
        descricao.textContent = `${item.nome} (x${item.quantidade})`;

        const campoQuantidade = document.createElement('input');
        campoQuantidade.type = 'number';
        campoQuantidade.min = 1;
        campoQuantidade.value = item.quantidade;
        campoQuantidade.style.cssText = 'width:64px;padding:4px 6px;';
        campoQuantidade.onchange = () => {
            item.quantidade = Math.max(1, Number(campoQuantidade.value) || 1);
            renderizarCarrinho();
            const contador = document.getElementById('cart-counter');
            if (contador) contador.textContent = cestaCompras.reduce((acc, el) => acc + el.quantidade, 0);
        };

        const precoTexto = document.createElement('strong');
        precoTexto.textContent = fmtPreco(subtotal);

        const botaoRemover = document.createElement('button');
        botaoRemover.className = 'btn btn-danger-outline btn-sm';
        botaoRemover.textContent = '✕';
        botaoRemover.title = 'Remover item';
        botaoRemover.onclick = () => {
            cestaCompras = cestaCompras.filter(el => el.id !== item.id);
            renderizarCarrinho();
            const contador = document.getElementById('cart-counter');
            if (contador) contador.textContent = cestaCompras.reduce((acc, el) => acc + el.quantidade, 0);
        };

        linha.append(descricao, campoQuantidade, precoTexto, botaoRemover);
        lista.appendChild(linha);
    });

    document.getElementById('carrinho-total-valor').textContent = fmtPreco(valorTotal);
}

async function tratarCriacaoPedido() {
    if (cestaCompras.length === 0) {
        return exibirToast("A sua cesta está vazia.", "error");
    }

    botaoCarregando('btn-confirmar-pedido', true);
    mostrarLoader("Processando pedido seguro...");

    const metodo = document.getElementById('metodo-pagamento').value;

    const resposta = await executarRequisicaoAPI("criar_pedido", {
        tokenMembro: estadoSessao.token,
        itens: cestaCompras.map(item => ({ id: item.id, quantidade: item.quantidade })),
        metodoPagamento: metodo
    });

    esconderLoader();
    botaoCarregando('btn-confirmar-pedido', false);

    // FLUXO NORMAL: Pedido gerado
    if (resposta.sucesso) {
        exibirToast(`Pedido ${resposta.idPedido} gerado com sucesso!`, "success");

        const metodoEscolhido = metodo;
        cestaCompras = [];
        const contador = document.getElementById('cart-counter');
        if (contador) contador.textContent = "0";

        navegarPara('meus-pedidos');
        abrirCobrancaPedido(resposta.idPedido, metodoEscolhido);
    }
    // FLUXO DE CONTINGÊNCIA: Falha no servidor ou bloqueio de conta
    else {
        exibirToast(resposta.mensagem || "Não foi possível gerar o pedido automaticamente.", "error");
        exibirContingenciaSuporteAdm(resposta.mensagem, metodo);
    }
}

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
                Pode contactar o Administrador agora mesmo para que ele regularize a sua conta ou envie a chave/link de pagamento manual.
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

// ============================================================================
// 13. MEUS PEDIDOS, PAGAMENTO SEGURO E CHAT TEMPORÁRIO
// ============================================================================
async function carregarMeusPedidos() {
    const container = document.getElementById('meus-pedidos-container');
    if (!container) return;
    container.innerHTML = '<div class="loading-slot">Carregando os seus pedidos...</div>';

    const resposta = await executarRequisicaoAPI("listar_meus_pedidos", { tokenMembro: estadoSessao.token });
    container.innerHTML = '';

    if (!resposta.sucesso || !resposta.pedidos || resposta.pedidos.length === 0) {
        container.innerHTML = `<div class="empty-state"><strong>Nenhum pedido ainda</strong>Quando criar um pedido, ele aparece aqui.</div>`;
        return;
    }

    resposta.pedidos.forEach(pedido => {
        const cartao = document.createElement('div');
        cartao.className = 'adm-card';
        const statusMinusculo = String(pedido.status).toLowerCase();

        cartao.innerHTML = `
            <h4>Pedido: ${escaparHtml(pedido.id)}</h4>
            <p>Status: <strong class="status-tag status-${escaparHtml(statusMinusculo)}">${escaparHtml(statusMinusculo.toUpperCase())}</strong>
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

async function abrirCobrancaPedido(idPedido, metodo) {
    mostrarLoader("Gerando instruções de pagamento...");
    const resposta = await executarRequisicaoAPI("gerar_pagamento", {
        tokenMembro: estadoSessao.token,
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

// ─── CHAT TEMPORÁRIO COM POLLING CONTÍNUO ───────────────────
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

function iniciarAutoRefreshChat() {
    pararAutoRefreshChat();
    _timerChat = setInterval(async () => {
        if (!pedidoChatAberto) return pararAutoRefreshChat();
        await renderizarChat(true);
    }, 5000);
}

function pararAutoRefreshChat() {
    if (_timerChat) {
        clearInterval(_timerChat);
        _timerChat = null;
    }
}

async function renderizarChat(silencioso = false) {
    if (!pedidoChatAberto) return;
    const caixaMensagens = document.getElementById('chat-mensagens');
    if (!caixaMensagens) return;

    const resposta = await executarRequisicaoAPI("chat_listar", {
        tokenMembro: estadoSessao.token,
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

async function enviarMensagemChat() {
    const inputTexto = document.getElementById('chat-input');
    if (!inputTexto) return;
    const texto = inputTexto.value.trim();
    if (!texto) return;

    botaoCarregando('btn-chat-enviar', true);
    const resposta = await executarRequisicaoAPI("chat_enviar", {
        tokenMembro: estadoSessao.token,
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

// ============================================================================
// 14. PAINEL CENTRAL ADMINISTRATIVO (APROVAÇÃO, MÉTRICAS E DESBLOQUEIOS)
// ============================================================================
async function carregarPainelCentralAdm() {
    if (estadoSessao.papel !== 'adm') return;

    // 1. Solicitações de novos membros
    const divSolicitacoes = document.getElementById('adm-solicitacoes-lista');
    if (divSolicitacoes) divSolicitacoes.innerHTML = '<div class="loading-slot">Procurando novos cadastros...</div>';

    const respostaSolic = await executarRequisicaoAPI("listar_solicitacoes_adm", { tokenAdm: estadoSessao.token });
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

    // 2. Métricas de vendas consolidadas
    const respostaMetricas = await executarRequisicaoAPI("obter_metricas_vendas", { tokenAdm: estadoSessao.token });
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

    // 3. Contas bloqueadas com pedido de liberação
    const respostaBloqueados = await executarRequisicaoAPI("listar_bloqueados_adm", { tokenAdm: estadoSessao.token });
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

    // 4. Comentários recebidos
    const respostaComentarios = await executarRequisicaoAPI("listar_comentarios_adm", { tokenAdm: estadoSessao.token });
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

async function aprovarMembroAdm(idSolicitacao) {
    mostrarLoader("Aprovando membro...");
    const resposta = await executarRequisicaoAPI("aprovar_cadastro", {
        tokenAdm: estadoSessao.token,
        idSolicitacao
    });
    esconderLoader();

    if (resposta.sucesso) {
        exibirToast(resposta.mensagem || "Membro aprovado com sucesso!", "success");
        await carregarPainelCentralAdm();
        await consultarPendentesAdm();
    } else {
        exibirToast(resposta.mensagem || "Erro ao aprovar membro.", "error");
    }
}

async function liberarContaUsuarioAdm(identificador) {
    const resposta = await executarRequisicaoAPI("liberar_conta_adm", {
        tokenAdm: estadoSessao.token,
        identificador: identificador
    });
    if (resposta.sucesso) {
        exibirToast(resposta.mensagem || "Conta liberada com sucesso.", "success");
        await carregarPainelCentralAdm();
    }
}

// ─── BADGE E AUTO-REFRESH DO PAINEL ADM ─────────────────────
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

async function consultarPendentesAdm() {
    if (estadoSessao.papel !== 'adm') return;
    try {
        const resposta = await executarRequisicaoAPI("listar_solicitacoes_adm", { tokenAdm: estadoSessao.token });
        const total = (resposta.sucesso && Array.isArray(resposta.solicitacoes)) ? resposta.solicitacoes.length : 0;
        atualizarBadgePendentesAdm(total);
    } catch {
        /* Silencioso para não interromper navegação */
    }
}

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

function desligarAutoRefreshAdm() {
    if (_timerPainelAdm) {
        clearInterval(_timerPainelAdm);
        _timerPainelAdm = null;
    }
}

// ============================================================================
// 15. ESTEIRA DE PEDIDOS (ADM)
// ============================================================================
async function carregarPedidosAdm() {
    const colunaAnalise     = document.getElementById('pipe-analise');
    const colunaSolicitados = document.getElementById('pipe-solicitados');
    const colunaViagem      = document.getElementById('pipe-viagem');
    const colunaConcluido   = document.getElementById('pipe-concluido');

    [colunaAnalise, colunaSolicitados, colunaViagem, colunaConcluido].forEach(coluna => {
        if (coluna) coluna.innerHTML = '<div class="loading-slot">…</div>';
    });

    const resposta = await executarRequisicaoAPI("listar_pedidos_adm", { tokenAdm: estadoSessao.token });
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

    [[colunaAnalise, 'Em análise'], [colunaSolicitados, 'Solicitados'], [colunaViagem, 'Em viagem'], [colunaConcluido, 'Concluídos']].forEach(([coluna]) => {
        if (coluna && !coluna.children.length) {
            coluna.innerHTML = `<div class="loading-slot" style="font-size:.75rem;">Sem pedidos</div>`;
        }
    });
}

async function avancarStatusAdm(idPedido, statusAtual) {
    let proximoStatus = 'solicitados';
    if (statusAtual === 'solicitados') proximoStatus = 'viagem';
    if (statusAtual === 'viagem')      proximoStatus = 'concluido';

    const resposta = await executarRequisicaoAPI("atualizar_status_pedido", {
        tokenAdm: estadoSessao.token,
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

// ============================================================================
// 16. LINK TEMPORÁRIO COM TEMPO FLEXÍVEL (10, 15, 30 OU PERSONALIZADO)
// ============================================================================
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
        tokenAdm: estadoSessao.token,
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

// ============================================================================
// 17. CADASTRO DE NOVO PRODUTO (ADM)
// ============================================================================
async function tratarCadastroProduto(evento) {
    if (evento && evento.preventDefault) evento.preventDefault();

    const nome         = document.getElementById('adm-prod-nome').value.trim();
    const preco        = parseFloat(document.getElementById('adm-prod-preco').value);
    const visibilidade = document.getElementById('adm-prod-visibilidade').value;
    const urlFoto      = document.getElementById('adm-prod-foto-url').value.trim();
    const fotoFinal    = fotoBase64Temporaria || urlFoto || "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400";

    if (!nome || !preco || preco <= 0) {
        return exibirToast("Preencha nome e preço válidos.", "error");
    }

    botaoCarregando('btn-salvar-produto', true);
    exibirToast("A guardar produto na planilha...", "info");

    const resposta = await executarRequisicaoAPI("cadastrar_produto", {
        tokenAdm: estadoSessao.token,
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

// ============================================================================
// 18. MODAIS, DIÁLOGOS DE CONFIRMAÇÃO E NOTIFICAÇÕES
// ============================================================================
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

// Fechamento de modais ao clicar no fundo escuro
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', evento => {
        if (evento.target === overlay) {
            overlay.classList.remove('active');
            if (overlay.id === 'modal-chat') pararAutoRefreshChat();
        }
    });
});

// ============================================================================
// 19. EXPORTAÇÃO GLOBAL DE ALIASES (LIGAÇÃO COM O BINDINGS.JS)
// ============================================================================
window.abrirModal                 = abrirModal;
window.fecharModal                = fecharModal;
window.abrirConfirmacao           = abrirConfirmacao;
window.exibirConfirmacao          = abrirConfirmacao;
window.fecharConfirmacao          = fecharConfirmacao;
window.confirmarLogout            = confirmarLogout;
window.executarLogout             = executarLogout;
window.enviarPedidoDesbloqueio    = enviarPedidoDesbloqueio;
window.navegarPara                = navegarPara;
window.tratarCriacaoPedido        = tratarCriacaoPedido;
window.removerFotoCarregada       = removerFotoCarregada;
window.gerarLinkTemporarioAdm     = gerarLinkTemporarioAdm;
window.copiarLinkGerado           = copiarLinkGerado;
window.carregarPainelCentralAdm   = carregarPainelCentralAdm;
window.enviarMensagemChat         = enviarMensagemChat;
window.tratarEnvioMensagemChat    = enviarMensagemChat;
window.abrirChatPedido            = abrirChatPedido;
window.tratarSolicitacaoCadastro  = tratarSolicitacaoCadastro;
window.tratarLogin                = tratarLogin;
window.tratarCadastroProduto      = tratarCadastroProduto;
window.aplicarFiltroVitrine       = aplicarFiltroVitrine;
window.filtrarVitrineEmTempoReal  = aplicarFiltroVitrine;
window.processarUploadImagem      = processarUploadImagem;
window.copiarPixCopiaECola        = copiarPixCopiaECola;
window.abrirCentralDuvidas        = abrirCentralDuvidas;
window.tratarEnvioSugestao        = tratarEnvioSugestao;
window.tratarAdicionarFaq         = tratarAdicionarFaq;
window.executarLimpezaTotalESaida = executarLimpezaTotalESaida;
