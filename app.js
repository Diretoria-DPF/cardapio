/* ============================================================================
   app.js — Plataforma Comercial Segura (v4 Consolidado)
   ============================================================================
   MELHORIAS DESTA VERSÃO:
     • Integração com Payments.gs (botão para exibir QR Code PIX e Cripto).
     • Correção do alinhamento das bolhas do chat temporário (esquerda vs. direita).
     • Auto-refresh suave do chat aberto a cada 5 segundos.
     • Compatibilidade total com bindings.js (alias exibirConfirmacao / abrirConfirmacao).
     • Auto-refresh do painel ADM e badge vermelho de solicitações pendentes.
     • Cache-first instantâneo e filtros de pesquisa em tempo real.
   ============================================================================ */

// URL OFICIAL DA SUA API NO GOOGLE APPS SCRIPT:
const URL_BACKEND_APPS_SCRIPT = "https://script.google.com/macros/s/AKfycbw3a-97OX8Vz35xJsaKqrpps6H9yXROTCIcWykpwVlAiJP2gqDTK7sa2CyoQ8D0TgaK/exec";

// ============================================================================
// 1. FUNÇÕES AUXILIARES (HELPERS)
// ============================================================================

/** Higieniza valores para exibição segura no HTML. */
function escaparHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

/** Formata valores numéricos no padrão monetário brasileiro (R$). */
function fmtPreco(v) {
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return `R$ ${(isNaN(n) ? 0 : n).toFixed(2).replace('.', ',')}`;
}

/** Controla o overlay de carregamento global. */
function mostrarLoader(texto = 'Carregando...') {
    const txt = document.getElementById('loader-text');
    const overlay = document.getElementById('loader-overlay');
    if (txt) txt.textContent = texto;
    if (overlay) overlay.classList.remove('hidden');
}

function esconderLoader() {
    const overlay = document.getElementById('loader-overlay');
    if (overlay) overlay.classList.add('hidden');
}

/** Aplica estado de carregamento a botões de ação. */
function botaoCarregando(id, carregando = true) {
    const b = document.getElementById(id);
    if (!b) return;
    b.disabled = carregando;
    b.classList.toggle('loading', carregando);
}

// ============================================================================
// 2. MEMÓRIA EM CACHE LOCAL (RESPOSTA INSTANTÂNEA)
// ============================================================================
const CacheLoja = {
    salvar(chave, dados) {
        try { localStorage.setItem('cache_' + chave, JSON.stringify({ dados, hora: Date.now() })); }
        catch (e) { console.warn("Cache cheio:", e); }
    },
    obter(chave) {
        try {
            const item = localStorage.getItem('cache_' + chave);
            return item ? JSON.parse(item).dados : null;
        } catch { return null; }
    },
    limpar(chave) { localStorage.removeItem('cache_' + chave); }
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

// Timers para atualizações em segundo plano
let _timerPainelAdm = null;
let _timerChat = null;

// ============================================================================
// 4. INICIALIZAÇÃO DA PLATAFORMA
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    await verificarTokenUrl();
    restaurarSessaoLocal();
    atualizarInterfaceSessao();

    // 1. Carregamento ultra-rápido via cache local
    const produtosEmCache = CacheLoja.obter('produtos_' + estadoSessao.papel);
    if (produtosEmCache && produtosEmCache.length > 0) {
        catalogoProdutos = produtosEmCache;
        catalogoFiltrado = produtosEmCache;
        renderizarVitrine();
    }

    // 2. Sincronização em segundo plano com a planilha
    await sincronizarProdutosServidor();
});

function obterUrlBasePlataforma() {
    return window.location.href.split('?')[0];
}

async function verificarTokenUrl() {
    const params = new URLSearchParams(window.location.search);
    const tokenAcesso = params.get('token');
    if (!tokenAcesso) return;

    mostrarLoader('Validando link temporário...');
    try {
        const url = `${URL_BACKEND_APPS_SCRIPT}?acao=validar_link&tokenAcesso=${encodeURIComponent(tokenAcesso)}`;
        const resp = await fetchComTimeout(url, 15000);
        const res  = await resp.json();

        if (res.valido) {
            estadoSessao.token = tokenAcesso;
            exibirToast("Acesso temporário concedido!", "success");
        } else {
            exibirToast(res.mensagem || "Link temporário expirado.", "error");
        }
    } catch (e) {
        console.error(e);
        exibirToast("Falha ao validar token temporário.", "error");
    } finally {
        esconderLoader();
    }
}

async function fetchComTimeout(url, ms = 20000, opcoes = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
        return await fetch(url, { ...opcoes, signal: ctrl.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function executarRequisicaoAPI(acao, dadosExtras = {}) {
    try {
        const resp = await fetchComTimeout(URL_BACKEND_APPS_SCRIPT, 25000, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ acao, ...dadosExtras })
        });
        return await resp.json();
    } catch (erro) {
        console.error("Erro na API:", erro);
        const offline = !navigator.onLine;
        exibirToast(offline ? "Sem conexão à internet." : "Falha na comunicação com o servidor.", "error");
        return { sucesso: false };
    }
}

// ============================================================================
// 5. UPLOAD DE FOTOGRAFIA OU GIF LOCAL
// ============================================================================
function processarUploadImagem(evento) {
    const ficheiro = evento.target.files[0];
    if (!ficheiro) return;

    // Se for GIF animado, preserva os frames com limite de tamanho
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

    // Para fotos comuns (JPG, PNG), comprime via Canvas para <35KB
    const leitor = new FileReader();
    leitor.onload = e => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX = 350;
            let { width: w, height: h } = img;
            if (w > h && w > MAX) { h *= MAX / w; w = MAX; }
            else if (h >= w && h > MAX) { w *= MAX / h; h = MAX; }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            fotoBase64Temporaria = canvas.toDataURL('image/jpeg', 0.7);
            exibirPreviewImagem(fotoBase64Temporaria);
        };
        img.src = e.target.result;
    };
    leitor.readAsDataURL(ficheiro);
}

function exibirPreviewImagem(src) {
    document.getElementById('img-preview').src = src;
    document.getElementById('preview-container').classList.remove('hidden');
    document.getElementById('adm-prod-foto-url').value = "";
}

function removerFotoCarregada() {
    fotoBase64Temporaria = "";
    document.getElementById('preview-container').classList.add('hidden');
    document.getElementById('adm-prod-arquivo').value = "";
    document.getElementById('img-preview').src = "";
}

// ============================================================================
// 6. VITRINE DE PRODUTOS E BUSCA COM DEBOUNCE
// ============================================================================
async function sincronizarProdutosServidor() {
    let url = `${URL_BACKEND_APPS_SCRIPT}?acao=listar_produtos`;
    if (estadoSessao.token) url += `&token=${encodeURIComponent(estadoSessao.token)}`;

    try {
        const resp = await fetchComTimeout(url, 20000);
        const res  = await resp.json();
        if (res.sucesso && Array.isArray(res.produtos)) {
            catalogoProdutos = res.produtos;
            catalogoFiltrado = res.produtos;
            CacheLoja.salvar('produtos_' + estadoSessao.papel, catalogoProdutos);
            renderizarVitrine();
        }
    } catch (e) { console.warn("Modo offline ou falha temporária:", e); }
}

function aplicarFiltroVitrine(termoManual = null) {
    const input = document.getElementById('filtro-produtos');
    const termo = (termoManual !== null ? termoManual : (input ? input.value : '')).trim().toLowerCase();

    catalogoFiltrado = termo
        ? catalogoProdutos.filter(p => String(p.nome || '').toLowerCase().includes(termo))
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

        if (estadoSessao.papel === 'membro' || estadoSessao.papel === 'entregador') {
            const btn = document.createElement('button');
            btn.className = 'btn btn-primary btn-block';
            btn.textContent = 'Adicionar à Cesta';
            btn.onclick = () => adicionarAoCarrinho(p);
            body.appendChild(btn);
        } else if (estadoSessao.papel === 'adm') {
            const aviso = document.createElement('small');
            aviso.style.color = '#ef4444';
            aviso.textContent = `Visibilidade: ${String(p.visibilidade || '').toUpperCase()}`;
            body.appendChild(aviso);
        } else {
            const aviso = document.createElement('small');
            aviso.className = 'visitor-note';
            aviso.textContent = 'Acesso exclusivo para membros.';
            body.appendChild(aviso);
        }

        card.append(img, body);
        grid.appendChild(card);
    });
}

// ============================================================================
// 7. CADASTRO DE NOVO MEMBRO
// ============================================================================
async function tratarSolicitacaoCadastro(e) {
    if (e && e.preventDefault) e.preventDefault();

    const nome      = document.getElementById('cad-nome').value.trim();
    const telefone  = document.getElementById('cad-telefone').value.trim();
    const senha     = document.getElementById('cad-senha').value;
    const senhaConf = document.getElementById('cad-senha-conf').value;
    const twitter   = document.getElementById('cad-twitter').value.trim();
    const telegram  = document.getElementById('cad-telegram').value.trim();

    if (senha !== senhaConf) return exibirToast("As senhas digitadas não coincidem.", "error");
    if (senha.length < 6)    return exibirToast("A senha deve ter no mínimo 6 caracteres.", "error");

    botaoCarregando('btn-enviar-cadastro', true);
    exibirToast("A enviar solicitação...", "info");

    const res = await executarRequisicaoAPI("solicitar_cadastro", {
        nome, telefone, senha, twitter, telegram
    });

    botaoCarregando('btn-enviar-cadastro', false);

    if (res.sucesso) {
        exibirToast(res.mensagem || "Solicitação enviada com sucesso!", "success");
        document.getElementById('form-registro').reset();
        fecharModal('modal-cadastro');
    } else {
        exibirToast(res.mensagem || "Erro ao registrar solicitação.", "error");
    }
}

// ============================================================================
// 8. AUTENTICAÇÃO (LOGIN / LOGOUT / DESBLOQUEIO)
// ============================================================================
async function tratarLogin(e) {
    if (e && e.preventDefault) e.preventDefault();
    const usuario = document.getElementById('login-usuario').value.trim();
    const senha   = document.getElementById('login-senha').value;
    identificadorEmTentativa = usuario;

    botaoCarregando('btn-entrar', true);
    exibirToast("A autenticar...", "info");

    const res = await executarRequisicaoAPI("login", { identificador: usuario, senha });

    botaoCarregando('btn-entrar', false);

    if (res.sucesso) {
        estadoSessao.papel       = res.papel;
        estadoSessao.token       = res.token;
        estadoSessao.nomeUsuario = res.nome;

        localStorage.setItem('plataforma_sessao', JSON.stringify(estadoSessao));
        document.getElementById('form-login').reset();
        document.getElementById('box-desbloqueio-conta').classList.add('hidden');
        fecharModal('modal-login');
        atualizarInterfaceSessao();
        CacheLoja.limpar('produtos_visitante');
        await sincronizarProdutosServidor();
        exibirToast(`Bem-vindo, ${res.nome}!`, "success");
    } else {
        exibirToast(res.mensagem || "Credenciais inválidas.", "error");
        if (res.requerLiberacaoAdm) {
            document.getElementById('box-desbloqueio-conta').classList.remove('hidden');
        }
    }
}

async function enviarPedidoDesbloqueio() {
    if (!identificadorEmTentativa) return;
    const res = await executarRequisicaoAPI("pedir_desbloqueio", { identificador: identificadorEmTentativa });
    if (res.sucesso) {
        exibirToast(res.mensagem || "Pedido de liberação enviado.", "success");
        const btn = document.getElementById('btn-solicitar-desbloqueio');
        if (btn) btn.disabled = true;
    }
}

function confirmarLogout() {
    abrirConfirmacao("Sair da conta", "Deseja realmente encerrar a sessão?", executarLogout);
}

function executarLogout() {
    estadoSessao.papel = 'visitante';
    estadoSessao.token = null;
    estadoSessao.nomeUsuario = 'Visitante';
    cestaCompras = [];
    const cartCont = document.getElementById('cart-counter');
    if (cartCont) cartCont.textContent = "0";

    localStorage.removeItem('plataforma_sessao');
    desligarAutoRefreshAdm();
    atualizarBadgePendentesAdm(0);
    pararAutoRefreshChat();

    atualizarInterfaceSessao();
    CacheLoja.limpar('produtos_membro');
    CacheLoja.limpar('produtos_adm');
    sincronizarProdutosServidor();
    navegarPara('vitrine');
    exibirToast("Sessão encerrada com sucesso.", "info");
}

function restaurarSessaoLocal() {
    const salva = localStorage.getItem('plataforma_sessao');
    if (!salva) return;
    try {
        const d = JSON.parse(salva);
        estadoSessao.papel       = d.papel || 'visitante';
        estadoSessao.token       = d.token || null;
        estadoSessao.nomeUsuario = d.nomeUsuario || 'Visitante';
    } catch {
        localStorage.removeItem('plataforma_sessao');
    }
}

// ============================================================================
// 9. CONTROLO VISUAL POR PAPEL
// ============================================================================
function atualizarInterfaceSessao() {
    const badge   = document.getElementById('role-badge');
    const anonBox = document.getElementById('anon-buttons');
    const authBox = document.getElementById('auth-buttons');
    const userLbl = document.getElementById('user-display-name');

    const tabCarrinho    = document.getElementById('tab-btn-carrinho');
    const tabMeusPedidos = document.getElementById('tab-btn-meus-pedidos');
    const tabNovoProduto = document.getElementById('tab-btn-novo-produto');
    const tabPedidosAdm  = document.getElementById('tab-btn-pedidos-adm');
    const tabAdm         = document.getElementById('tab-btn-adm');

    if (badge) {
        badge.textContent = estadoSessao.papel.toUpperCase();
        badge.className   = `badge badge-${estadoSessao.papel}`;
    }

    const esconder = el => el && el.classList.add('hidden');
    const mostrar  = el => el && el.classList.remove('hidden');

    [tabCarrinho, tabMeusPedidos, tabNovoProduto, tabPedidosAdm, tabAdm].forEach(esconder);

    if (estadoSessao.papel === 'visitante') {
        mostrar(anonBox); esconder(authBox);
    } else if (estadoSessao.papel === 'membro') {
        esconder(anonBox); mostrar(authBox);
        if (userLbl) userLbl.textContent = `Olá, ${estadoSessao.nomeUsuario}`;
        mostrar(tabCarrinho); mostrar(tabMeusPedidos);
    } else if (estadoSessao.papel === 'entregador') {
        esconder(anonBox); mostrar(authBox);
        if (userLbl) userLbl.textContent = `Entregador: ${estadoSessao.nomeUsuario}`;
        mostrar(tabMeusPedidos); mostrar(tabPedidosAdm);
    } else if (estadoSessao.papel === 'adm') {
        esconder(anonBox); mostrar(authBox);
        if (userLbl) userLbl.textContent = `ADM: ${estadoSessao.nomeUsuario}`;
        mostrar(tabNovoProduto); mostrar(tabPedidosAdm); mostrar(tabAdm);
    }

    if (estadoSessao.papel === 'adm') {
        ligarAutoRefreshAdm();
    } else {
        desligarAutoRefreshAdm();
        atualizarBadgePendentesAdm(0);
    }
}

// ============================================================================
// 10. NAVEGAÇÃO ENTRE TELAS
// ============================================================================
function navegarPara(nomeAba) {
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-panel').forEach(v => v.classList.remove('active'));

    const btn    = document.getElementById(`tab-btn-${nomeAba}`);
    const painel = document.getElementById(`view-${nomeAba}`);

    if (btn && painel) {
        btn.classList.add('active');
        painel.classList.add('active');
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
// 11. CESTA DE COMPRAS E CRIAÇÃO DE PEDIDOS
// ============================================================================
function adicionarAoCarrinho(p) {
    const it = cestaCompras.find(i => i.id === p.id);
    if (it) it.quantidade += 1;
    else cestaCompras.push({
        id: p.id,
        nome: p.nome,
        preco: typeof p.preco === 'number' ? p.preco : parseFloat(String(p.preco).replace(',', '.')),
        quantidade: 1
    });

    const total = cestaCompras.reduce((a, i) => a + i.quantidade, 0);
    const cartCont = document.getElementById('cart-counter');
    if (cartCont) cartCont.textContent = total;
    exibirToast(`${p.nome} colocado na cesta.`, "info");
}

function renderizarCarrinho() {
    const lista = document.getElementById('carrinho-itens-lista');
    if (!lista) return;
    lista.innerHTML = '';
    let total = 0;

    if (cestaCompras.length === 0) {
        lista.innerHTML = `<div class="empty-state"><strong>Sua cesta está vazia</strong>Adicione itens da vitrine.</div>`;
        document.getElementById('carrinho-total-valor').textContent = 'R$ 0,00';
        return;
    }

    cestaCompras.forEach(i => {
        const sub = i.preco * i.quantidade;
        total += sub;

        const row = document.createElement('div');
        row.className = 'cart-item-row';
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid #e2e8f0;';

        const desc = document.createElement('span');
        desc.textContent = `${i.nome} (x${i.quantidade})`;

        const qtd = document.createElement('input');
        qtd.type = 'number'; qtd.min = 1; qtd.value = i.quantidade;
        qtd.style.cssText = 'width:64px;padding:4px 6px;';
        qtd.onchange = () => {
            i.quantidade = Math.max(1, Number(qtd.value) || 1);
            renderizarCarrinho();
            const c = document.getElementById('cart-counter');
            if (c) c.textContent = cestaCompras.reduce((a, x) => a + x.quantidade, 0);
        };

        const valor = document.createElement('strong');
        valor.textContent = fmtPreco(sub);

        const rem = document.createElement('button');
        rem.className = 'btn btn-danger-outline btn-sm';
        rem.textContent = '✕';
        rem.title = 'Remover item';
        rem.onclick = () => {
            cestaCompras = cestaCompras.filter(x => x.id !== i.id);
            renderizarCarrinho();
            const c = document.getElementById('cart-counter');
            if (c) c.textContent = cestaCompras.reduce((a, x) => a + x.quantidade, 0);
        };

        row.append(desc, qtd, valor, rem);
        lista.appendChild(row);
    });

    document.getElementById('carrinho-total-valor').textContent = fmtPreco(total);
}

// ============================================================================
// CRIAÇÃO DE PEDIDO COM GERAÇÃO AUTOMÁTICA E FALLBACK DE SUPORTE AO VIVO
// ============================================================================

async function tratarCriacaoPedido() {
    if (cestaCompras.length === 0) {
        return exibirToast("A sua cesta está vazia.", "error");
    }

    botaoCarregando('btn-confirmar-pedido', true);
    mostrarLoader("Processando pedido seguro...");

    const metodo = document.getElementById('metodo-pagamento').value;

    const res = await executarRequisicaoAPI("criar_pedido", {
        tokenMembro: estadoSessao.token,
        itens: cestaCompras.map(i => ({ id: i.id, quantidade: i.quantidade })),
        metodoPagamento: metodo
    });

    esconderLoader();
    botaoCarregando('btn-confirmar-pedido', false);

    // FLUXO PRINCIPAL: Sucesso na criação do pedido
    if (res.sucesso) {
        exibirToast(`Pedido ${res.idPedido} gerado com sucesso!`, "success");
        
        // Guarda uma cópia do método antes de esvaziar
        const metodoEscolhido = metodo;
        cestaCompras = [];
        const c = document.getElementById('cart-counter');
        if (c) c.textContent = "0";

        // Redireciona para Meus Pedidos e abre imediatamente a cobrança automática
        navegarPara('meus-pedidos');
        abrirCobrancaPedido(res.idPedido, metodoEscolhido);
    } 
    // FLUXO DE CONTINGÊNCIA: Falha no servidor, instabilidade ou conta inativa
    else {
        exibirToast(res.mensagem || "Não foi possível gerar o pedido automaticamente.", "error");
        
        // Aciona o Fallback: Abre janela para o cliente falar com o Administrador
        exibirContingenciaSuporteAdm(res.mensagem, metodo);
    }
}

/**
 * MODAL DE CONTINGÊNCIA: Permite ao cliente solicitar auxílio manual ao Administrador
 */
function exibirContingenciaSuporteAdm(motivoErro, metodoEscolhido) {
    const itensDescricao = cestaCompras.map(i => `${i.nome} (x${i.quantidade})`).join(', ');
    const totalEstimado = document.getElementById('carrinho-total-valor')?.textContent || "R$ 0,00";

    const corpoMensagem = `
        <div style="text-align:left;font-size:0.9rem;color:#334155;">
            <p style="color:#b91c1c;font-weight:600;margin-bottom:8px;">
                ⚠️ Não foi possível concluir o pedido de forma automática:
            </p>
            <p style="background:#fef2f2;padding:8px;border-radius:6px;border:1px solid #fca5a5;font-size:0.8rem;margin-bottom:12px;">
                ${escaparHtml(motivoErro || "Instabilidade temporária na ligação ao servidor.")}
            </p>
            <p style="margin-bottom:6px;">
                <strong>O que deseja fazer?</strong> Pode acionar o Administrador agora mesmo para que ele regularize a sua conta ou envie a chave/link de pagamento de forma manual.
            </p>
            <p style="font-size:0.8rem;color:#64748b;margin-bottom:12px;">
                <strong>Resumo da sua Cesta:</strong> ${escaparHtml(itensDescricao)}<br>
                <strong>Total:</strong> ${escaparHtml(totalEstimado)} | <strong>Forma:</strong> ${escaparHtml(metodoEscolhido)}
            </p>
        </div>
    `;

    abrirConfirmacao(
        "Suporte com o Administrador",
        corpoMensagem,
        async () => {
            // Ao clicar em "Sim", envia uma mensagem direta para a aba de Comentários do ADM
            mostrarLoader("A contactar o Administrador...");
            const textoMensagem = `[SOLICITAÇÃO MANUAL DE PAGAMENTO] O utilizador ${estadoSessao.nomeUsuario} tentou comprar [${itensDescricao}] no valor de ${totalEstimado} via ${metodoEscolhido}, mas encontrou o erro: "${motivoErro}". Por favor, enviar link manual.`;
            
            await executarRequisicaoAPI("enviar_comentario", {
                nome: estadoSessao.nomeUsuario,
                mensagem: textoMensagem
            });

            esconderLoader();
            exibirToast("O Administrador foi notificado! Ele entrará em contacto para fornecer o link.", "success");
        }
    );

    // Ajusta o texto do botão de confirmação para ficar intuitivo
    const btnSim = document.getElementById('confirmar-btn-ok');
    if (btnSim) btnSim.textContent = "Chamar Administrador";
}

// ============================================================================
// 12. MEUS PEDIDOS, PAGAMENTO E CHAT TEMPORÁRIO
// ============================================================================
async function carregarMeusPedidos() {
    const box = document.getElementById('meus-pedidos-container');
    if (!box) return;
    box.innerHTML = '<div class="loading-slot">Carregando os seus pedidos...</div>';

    const res = await executarRequisicaoAPI("listar_meus_pedidos", { tokenMembro: estadoSessao.token });
    box.innerHTML = '';

    if (!res.sucesso || !res.pedidos || res.pedidos.length === 0) {
        box.innerHTML = `<div class="empty-state"><strong>Nenhum pedido ainda</strong>Quando criar um pedido, ele aparece aqui.</div>`;
        return;
    }

    res.pedidos.forEach(p => {
        const card = document.createElement('div');
        card.className = 'adm-card';
        const st = String(p.status).toLowerCase();

        card.innerHTML = `
            <h4>Pedido: ${escaparHtml(p.id)}</h4>
            <p>Status: <strong class="status-tag status-${escaparHtml(st)}">${escaparHtml(st.toUpperCase())}</strong>
               | Total: <strong>${fmtPreco(p.total)}</strong></p>
            <p>Forma de Pagamento: <strong>${escaparHtml(p.metodo || 'PIX')}</strong></p>
        `;

        const acoes = document.createElement('div');
        acoes.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;';

        // Botão de Pagamento se o pedido estiver em análise
        if (st === 'analise') {
            const btnPagar = document.createElement('button');
            btnPagar.className = 'btn btn-success btn-sm';
            btnPagar.textContent = '💳 Pagar / Ver Cobrança';
            btnPagar.onclick = () => abrirCobrancaPedido(p.id, p.metodo);
            acoes.appendChild(btnPagar);
        }

        // Botão de Chat Temporário
        if (p.chatAtivo) {
            const btnChat = document.createElement('button');
            btnChat.className = 'btn btn-primary btn-sm';
            btnChat.textContent = '💬 Abrir Chat';
            btnChat.onclick = () => abrirChatPedido(p.id);
            acoes.appendChild(btnChat);
        } else {
            const aviso = document.createElement('small');
            aviso.style.color = '#94a3b8';
            aviso.textContent = 'Chat temporário encerrado.';
            acoes.appendChild(aviso);
        }

        card.appendChild(acoes);
        box.appendChild(card);
    });
}

/** Consulta o Payments.gs e exibe os dados para pagamento */
async function abrirCobrancaPedido(idPedido, metodo) {
    mostrarLoader("Gerando instruções de pagamento...");
    const res = await executarRequisicaoAPI("gerar_pagamento", {
        tokenMembro: estadoSessao.token,
        idPedido: idPedido,
        metodo: metodo || "PIX"
    });
    esconderLoader();

    if (!res.sucesso) {
        return exibirToast(res.mensagem || "Não foi possível gerar a cobrança.", "error");
    }

    if (res.jaPago) {
        return exibirToast("Este pedido já foi pago e está em entrega!", "success");
    }

    const cob = res.cobranca;
    let htmlCorpo = `<div style="text-align:center;padding:10px;">`;

    if (cob.tipo === "PIX") {
        htmlCorpo += `
            <img src="${escaparHtml(cob.qrCodeUrl)}" alt="QR Code PIX" style="width:200px;height:200px;margin-bottom:12px;border:1px solid #cbd5e1;border-radius:8px;">
            <p style="font-size:.85rem;color:#475569;margin-bottom:8px;">${escaparHtml(cob.instrucoes)}</p>
            <input type="text" id="pix-copia-cola" value="${escaparHtml(cob.pixCopiaECola)}" readonly style="font-size:.75rem;margin-bottom:8px;text-align:center;" onclick="this.select()">
            <button type="button" class="btn btn-primary btn-block" onclick="copiarPixCopiaECola()">📋 Copiar Código PIX</button>
        `;
    } else if (cob.tipo === "CRIPTO") {
        htmlCorpo += `
            <img src="${escaparHtml(cob.qrCodeUrl)}" alt="QR Code Cripto" style="width:180px;height:180px;margin-bottom:10px;border-radius:8px;">
            <p><strong>Valor a transferir:</strong> ${escaparHtml(cob.quantidadeEstimada)} ${escaparHtml(cob.moeda)}</p>
            <p style="font-size:.75rem;color:#64748b;word-break:break-all;margin:6px 0;"><strong>Carteira:</strong><br>${escaparHtml(cob.carteiraDestino)}</p>
            <button type="button" class="btn btn-primary btn-block" onclick="navigator.clipboard.writeText('${escaparHtml(cob.carteiraDestino)}');exibirToast('Carteira copiada!','success');">📋 Copiar Endereço da Carteira</button>
        `;
    } else if (cob.tipo === "CARTAO") {
        htmlCorpo += `
            <p style="margin-bottom:12px;">${escaparHtml(cob.instrucoes)}</p>
            <a href="${escaparHtml(cob.urlCheckout)}" target="_blank" class="btn btn-success btn-block" style="text-decoration:none;display:block;">🔒 Ir para Pagamento Seguro</a>
        `;
    }

    htmlCorpo += `</div>`;

    abrirConfirmacao(`Pagamento Pedido #${idPedido}`, htmlCorpo, () => {
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

// ─── CHAT TEMPORÁRIO COM POLLING A CADA 5s ──────────────────
async function abrirChatPedido(pedidoId) {
    pedidoChatAberto = pedidoId;
    const tit = document.getElementById('chat-pedido-id');
    const box = document.getElementById('chat-mensagens');
    if (tit) tit.textContent = '#' + pedidoId;
    if (box) box.innerHTML = '<div class="loading-slot">Carregando mensagens...</div>';

    abrirModal('modal-chat');
    await renderizarChat();
    iniciarAutoRefreshChat();
}

function iniciarAutoRefreshChat() {
    pararAutoRefreshChat();
    _timerChat = setInterval(async () => {
        if (!pedidoChatAberto) return pararAutoRefreshChat();
        await renderizarChat(true); // renderiza silenciosamente sem scroll travado
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
    const box = document.getElementById('chat-mensagens');
    if (!box) return;

    const res = await executarRequisicaoAPI("chat_listar", {
        tokenMembro: estadoSessao.token,
        idPedido: pedidoChatAberto
    });

    if (!res.sucesso || !res.mensagens || res.mensagens.length === 0) {
        if (!silencioso) box.innerHTML = '<div class="loading-slot">Sem mensagens ainda.</div>';
        return;
    }

    const estavaNoFim = (box.scrollHeight - box.scrollTop) <= (box.clientHeight + 50);
    box.innerHTML = '';

    res.mensagens.forEach(m => {
        const div = document.createElement('div');
        // Alinhamento correto: mensagem do próprio usuário à direita, de terceiros à esquerda
        const ehMinha = (m.autorNome === estadoSessao.nomeUsuario) ||
                        (estadoSessao.papel === 'adm' && m.autorNome === 'Administração');

        div.className = 'chat-msg ' + (ehMinha ? 'chat-msg--out' : 'chat-msg--in');

        const txt = document.createElement('span');
        txt.textContent = m.texto || '';

        const meta = document.createElement('span');
        meta.className = 'meta';
        meta.textContent = m.autorNome || (ehMinha ? 'Você' : 'Atendimento');

        div.append(txt, meta);
        box.appendChild(div);
    });

    if (estavaNoFim || !silencioso) {
        box.scrollTop = box.scrollHeight;
    }
}

async function enviarMensagemChat() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const texto = input.value.trim();
    if (!texto) return;

    botaoCarregando('btn-chat-enviar', true);
    const res = await executarRequisicaoAPI("chat_enviar", {
        tokenMembro: estadoSessao.token,
        idPedido: pedidoChatAberto,
        autorNome: estadoSessao.nomeUsuario,
        texto
    });
    botaoCarregando('btn-chat-enviar', false);

    if (res.sucesso) {
        input.value = '';
        await renderizarChat();
    } else {
        exibirToast(res.mensagem || "Falha ao enviar mensagem.", "error");
    }
}

// ============================================================================
// 13. PAINEL ADMINISTRATIVO (APROVAÇÃO, MÉTRICAS E DESBLOQUEIOS)
// ============================================================================
async function carregarPainelCentralAdm() {
    if (estadoSessao.papel !== 'adm') return;

    // 1. Lista de solicitações de novos membros
    const divSolic = document.getElementById('adm-solicitacoes-lista');
    if (divSolic) divSolic.innerHTML = '<div class="loading-slot">Procurando novos cadastros...</div>';

    const resSolic = await executarRequisicaoAPI("listar_solicitacoes_adm", { tokenAdm: estadoSessao.token });
    const pendentes = (resSolic.sucesso && Array.isArray(resSolic.solicitacoes)) ? resSolic.solicitacoes.length : 0;

    atualizarBadgePendentesAdm(pendentes);

    if (divSolic) {
        divSolic.innerHTML = '';
        if (pendentes > 0) {
            resSolic.solicitacoes.forEach(s => {
                const row = document.createElement('div');
                row.style.cssText = 'padding:10px 0;border-bottom:1px solid #e2e8f0;';

                row.innerHTML = `
                    <p><strong>${escaparHtml(s.nome)}</strong> (Login: ${escaparHtml(s.telefone)})</p>
                    <p style="font-size:.78rem;color:#64748b;">
                        Twitter: ${escaparHtml(s.twitter || '-')} | Telegram: ${escaparHtml(s.telegram || '-')}
                    </p>
                `;

                const btn = document.createElement('button');
                btn.className = 'btn btn-success btn-sm';
                btn.style.marginTop = '5px';
                btn.textContent = 'Aprovar Membro';
                btn.onclick = () => aprovarMembroAdm(s.id);
                row.appendChild(btn);

                divSolic.appendChild(row);
            });
        } else {
            divSolic.innerHTML = '<div class="loading-slot">Nenhuma solicitação pendente.</div>';
        }
    }

    // 2. Métricas de vendas consolidadas
    const resMetricas = await executarRequisicaoAPI("obter_metricas_vendas", { tokenAdm: estadoSessao.token });
    if (resMetricas.sucesso) {
        const fatEl = document.getElementById('metric-faturamento');
        const pedEl = document.getElementById('metric-pedidos');
        if (fatEl) fatEl.textContent = fmtPreco(resMetricas.faturamentoTotal || 0);
        if (pedEl) pedEl.textContent = resMetricas.totalPedidos || 0;

        const divTabela = document.getElementById('tabela-metricas-produtos');
        if (divTabela) {
            if (!resMetricas.itensDetalhados || resMetricas.itensDetalhados.length === 0) {
                divTabela.innerHTML = '<div class="loading-slot">Sem vendas registadas ainda.</div>';
            } else {
                let html = '<table class="tabela-metricas"><thead><tr><th>Produto</th><th>Qtd</th></tr></thead><tbody>';
                resMetricas.itensDetalhados.forEach(it => {
                    html += `<tr><td>${escaparHtml(it.nome)}</td><td><strong>${Number(it.quantidadeVendida)||0} un</strong></td></tr>`;
                });
                html += '</tbody></table>';
                divTabela.innerHTML = html;
            }
        }
    }

    // 3. Contas bloqueadas com pedido de liberação
    const resBloq = await executarRequisicaoAPI("listar_bloqueados_adm", { tokenAdm: estadoSessao.token });
    const divBloq = document.getElementById('adm-bloqueados-lista');
    if (divBloq) {
        divBloq.innerHTML = '';
        if (resBloq.sucesso && Array.isArray(resBloq.contas) && resBloq.contas.length > 0) {
            resBloq.contas.forEach(b => {
                const row = document.createElement('div');
                row.style.padding = '6px 0';
                row.innerHTML = `<p style="color:#b91c1c;"><strong>${escaparHtml(b.identificador)}</strong> (${Number(b.erros)||0} falhas)</p>`;
                const btn = document.createElement('button');
                btn.className = 'btn btn-primary btn-sm';
                btn.textContent = 'Liberar Conta';
                btn.onclick = () => liberarContaUsuarioAdm(b.identificador);
                row.appendChild(btn);
                divBloq.appendChild(row);
            });
        } else {
            divBloq.innerHTML = '<div class="loading-slot">Nenhuma conta bloqueada.</div>';
        }
    }

    // 4. Comentários recebidos
    const resComent = await executarRequisicaoAPI("listar_comentarios_adm", { tokenAdm: estadoSessao.token });
    const divCom = document.getElementById('adm-comentarios-lista');
    if (divCom) {
        divCom.innerHTML = '';
        if (resComent.sucesso && Array.isArray(resComent.comentarios) && resComent.comentarios.length > 0) {
            resComent.comentarios.forEach(c => {
                const p = document.createElement('p');
                p.style.cssText = 'font-size:.8rem;padding:6px 0;border-bottom:1px solid #e2e8f0;';
                const quando = c.data ? new Date(c.data).toLocaleString() : '';
                p.innerHTML = `<strong>${escaparHtml(c.nome || 'Anônimo')}</strong> <small style="color:#94a3b8;">${escaparHtml(quando)}</small><br>${escaparHtml(c.texto || '')}`;
                divCom.appendChild(p);
            });
        } else {
            divCom.innerHTML = '<div class="loading-slot">Sem mensagens.</div>';
        }
    }
}

async function aprovarMembroAdm(idSolicitacao) {
    mostrarLoader("Aprovando membro...");
    const res = await executarRequisicaoAPI("aprovar_cadastro", {
        tokenAdm: estadoSessao.token,
        idSolicitacao
    });
    esconderLoader();

    if (res.sucesso) {
        exibirToast(res.mensagem || "Membro aprovado com sucesso!", "success");
        await carregarPainelCentralAdm();
        await consultarPendentesAdm();
    } else {
        exibirToast(res.mensagem || "Erro ao aprovar membro.", "error");
    }
}

async function liberarContaUsuarioAdm(id) {
    const res = await executarRequisicaoAPI("liberar_conta_adm", {
        tokenAdm: estadoSessao.token, identificador: id
    });
    if (res.sucesso) {
        exibirToast(res.mensagem || "Conta liberada com sucesso.", "success");
        await carregarPainelCentralAdm();
    }
}

// ─── BADGE E AUTO-REFRESH DO PAINEL ADM ─────────────────────
function atualizarBadgePendentesAdm(qtd) {
    const btnAdm = document.getElementById('tab-btn-adm');
    if (!btnAdm) return;

    const antigo = btnAdm.querySelector('.badge-pendentes');
    if (antigo) antigo.remove();

    if (qtd > 0) {
        const span = document.createElement('span');
        span.className = 'badge-pendentes';
        span.textContent = qtd;
        span.style.cssText =
            'display:inline-block;min-width:18px;margin-left:6px;padding:0 5px;' +
            'background:#ef4444;color:#fff;border-radius:999px;font-size:.7rem;' +
            'font-weight:700;text-align:center;line-height:18px;';
        btnAdm.appendChild(span);
    }
}

async function consultarPendentesAdm() {
    if (estadoSessao.papel !== 'adm') return;
    try {
        const res = await executarRequisicaoAPI("listar_solicitacoes_adm", { tokenAdm: estadoSessao.token });
        const qtd = (res.sucesso && Array.isArray(res.solicitacoes)) ? res.solicitacoes.length : 0;
        atualizarBadgePendentesAdm(qtd);
    } catch { /* silencioso */ }
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
// 14. ESTEIRA DE PEDIDOS (ADM)
// ============================================================================
async function carregarPedidosAdm() {
    const cA = document.getElementById('pipe-analise');
    const cS = document.getElementById('pipe-solicitados');
    const cV = document.getElementById('pipe-viagem');
    const cC = document.getElementById('pipe-concluido');

    [cA, cS, cV, cC].forEach(c => { if (c) c.innerHTML = '<div class="loading-slot">…</div>'; });

    const res = await executarRequisicaoAPI("listar_pedidos_adm", { tokenAdm: estadoSessao.token });
    if (cA) cA.innerHTML = '';
    if (cS) cS.innerHTML = '';
    if (cV) cV.innerHTML = '';
    if (cC) cC.innerHTML = '';

    if (res.sucesso && Array.isArray(res.pedidos)) {
        res.pedidos.forEach(p => {
            const div = document.createElement('div');
            div.style.cssText = 'background:#fff;padding:8px;margin-bottom:8px;border-radius:6px;border:1px solid #cbd5e1;';

            div.innerHTML = `
                <small><strong>${escaparHtml(p.id)}</strong></small><br>
                <small>${fmtPreco(p.total)}</small><br>
                <small style="color:#64748b;">Forma: ${escaparHtml(p.metodo || 'PIX')}</small>
            `;

            const acoes = document.createElement('div');
            acoes.style.cssText = 'display:flex;gap:4px;margin-top:6px;';

            // Botão para avançar status
            if (p.status !== 'concluido') {
                const btn = document.createElement('button');
                btn.className = 'btn btn-primary btn-sm';
                btn.textContent = 'Avançar Fase';
                btn.onclick = () => avancarStatusAdm(p.id, p.status);
                acoes.appendChild(btn);
            }

            // Administrador também pode abrir o chat do pedido
            const btnChatAdm = document.createElement('button');
            btnChatAdm.className = 'btn btn-outline-dark btn-sm';
            btnChatAdm.textContent = '💬';
            btnChatAdm.title = 'Abrir Chat';
            btnChatAdm.onclick = () => abrirChatPedido(p.id);
            acoes.appendChild(btnChatAdm);

            div.appendChild(acoes);

            if (p.status === 'analise' && cA)      cA.appendChild(div);
            if (p.status === 'solicitados' && cS)  cS.appendChild(div);
            if (p.status === 'viagem' && cV)       cV.appendChild(div);
            if (p.status === 'concluido' && cC)    cC.appendChild(div);
        });
    }

    [[cA, 'Em análise'], [cS, 'Solicitados'], [cV, 'Em viagem'], [cC, 'Concluídos']].forEach(([col]) => {
        if (col && !col.children.length) {
            col.innerHTML = `<div class="loading-slot" style="font-size:.75rem;">Sem pedidos</div>`;
        }
    });
}

async function avancarStatusAdm(id, statusAtual) {
    let prox = 'solicitados';
    if (statusAtual === 'solicitados') prox = 'viagem';
    if (statusAtual === 'viagem')      prox = 'concluido';

    const res = await executarRequisicaoAPI("atualizar_status_pedido", {
        tokenAdm: estadoSessao.token, idPedido: id, novoStatus: prox
    });

    if (res.sucesso) {
        exibirToast("Status do pedido atualizado!", "success");
        await carregarPedidosAdm();
    } else {
        exibirToast(res.mensagem || "Erro ao atualizar status.", "error");
    }
}

// ============================================================================
// 15. COMENTÁRIOS E DÚVIDAS
// ============================================================================
async function tratarEnvioComentario(e) {
    if (e && e.preventDefault) e.preventDefault();
    const nome = document.getElementById('campo-comentario-nome').value.trim();
    const msg  = document.getElementById('campo-comentario').value.trim();
    if (!msg) return;

    const res = await executarRequisicaoAPI("enviar_comentario", { nome, mensagem: msg });

    if (res.sucesso) {
        exibirToast("Mensagem enviada com sucesso!", "success");
        document.getElementById('campo-comentario').value = '';
    } else {
        exibirToast(res.mensagem || "Erro ao enviar mensagem.", "error");
    }
}

// ============================================================================
// 16. LINK TEMPORÁRIO COM TOKEN (ADM)
// ============================================================================
async function gerarLinkTemporarioAdm() {
    const minutos = document.getElementById('select-duracao-link').value;
    mostrarLoader("Gerando link com token...");

    const res = await executarRequisicaoAPI("gerar_link_temporario", {
        tokenAdm: estadoSessao.token,
        duracaoMinutos: minutos
    });
    esconderLoader();

    if (res.sucesso) {
        const linkCompleto = `${obterUrlBasePlataforma()}?token=${res.token}`;
        document.getElementById('campo-link-gerado').value = linkCompleto;
        document.getElementById('area-link-gerado').classList.remove('hidden');
        exibirToast("Link temporário gerado com sucesso!", "success");
    } else {
        exibirToast(res.mensagem || "Falha ao gerar o link.", "error");
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
// 17. CADASTRO DE PRODUTO (ADM)
// ============================================================================
async function tratarCadastroProduto(e) {
    if (e && e.preventDefault) e.preventDefault();

    const nome      = document.getElementById('adm-prod-nome').value.trim();
    const preco     = parseFloat(document.getElementById('adm-prod-preco').value);
    const visib     = document.getElementById('adm-prod-visibilidade').value;
    const urlFoto   = document.getElementById('adm-prod-foto-url').value.trim();
    const fotoFinal = fotoBase64Temporaria || urlFoto || "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400";

    if (!nome || !preco || preco <= 0) {
        return exibirToast("Preencha nome e preço válidos.", "error");
    }

    botaoCarregando('btn-salvar-produto', true);
    exibirToast("A guardar produto na planilha...", "info");

    const res = await executarRequisicaoAPI("cadastrar_produto", {
        tokenAdm: estadoSessao.token,
        produto: { nome, preco, foto: fotoFinal, visibilidade: visib }
    });

    botaoCarregando('btn-salvar-produto', false);

    if (res.sucesso) {
        exibirToast("Produto adicionado ao catálogo!", "success");
        document.getElementById('form-novo-produto').reset();
        removerFotoCarregada();
        await sincronizarProdutosServidor();
    } else {
        exibirToast(res.mensagem || "Erro ao salvar produto.", "error");
    }
}

// ============================================================================
// 18. MODAIS, DIÁLOGOS DE CONFIRMAÇÃO E NOTIFICAÇÕES
// ============================================================================
function abrirModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('active');
}

function fecharModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('active');
    if (id === 'modal-chat') pararAutoRefreshChat();
}

let _callbackConfirmacao = null;
function abrirConfirmacao(titulo, mensagem, callback) {
    const tit = document.getElementById('confirmar-titulo');
    const msg = document.getElementById('confirmar-mensagem');
    if (tit) tit.textContent = titulo;
    if (msg) {
        if (mensagem.startsWith('<div')) {
            msg.innerHTML = mensagem;
        } else {
            msg.textContent = mensagem;
        }
    }
    _callbackConfirmacao = callback;

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

// Aliases para máxima compatibilidade com bindings.js:
window.abrirConfirmacao  = abrirConfirmacao;
window.exibirConfirmacao = abrirConfirmacao;
window.fecharConfirmacao = fecharConfirmacao;
window.abrirModal        = abrirModal;
window.fecharModal       = fecharModal;
window.enviarMensagemChat= enviarMensagemChat;
window.aplicarFiltroVitrine = aplicarFiltroVitrine;

function exibirToast(msg, tipo = 'info') {
    const cont = document.getElementById('toast-container');
    if (!cont) return;
    const t = document.createElement('div');
    t.className = `toast toast-${tipo}`;
    t.textContent = msg;
    cont.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

// Fechamento de modais ao clicar no fundo escuro
document.querySelectorAll('.modal-overlay').forEach(ov => {
    ov.addEventListener('click', e => {
        if (e.target === ov) {
            ov.classList.remove('active');
            if (ov.id === 'modal-chat') pararAutoRefreshChat();
        }
    });
});
