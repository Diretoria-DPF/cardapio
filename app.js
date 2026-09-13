/* ============================================================================
   app.js — Plataforma Comercial Segura (v2 melhorada)
   Principais correções:
     • XSS: todas as strings do servidor passam por escaparHtml()
     • Preços: fmtPreco() aceita number OU string
     • Loading global + estado "loading" nos botões (evita duplo clique)
     • Chat real com modal (ações chat_enviar / chat_listar)
     • Confirmação genérica antes de logout
     • Timeout e retry no fetch
     • Busca/filtro client-side na vitrine
     • Token da URL é salvo na sessão após validação
     • Comentário agora envia nome do autor
   MANTÉM as mesmas ações do Code.gs (exceto chat, ver nota no fim).
   ============================================================================ */

// ⚠️ COLE A SUA URL DO WEB APP AQUI:
const URL_BACKEND_APPS_SCRIPT = "https://script.google.com/macros/s/AKfycbwKauAHD750szLBBLDflruitYtNZwLgYYGOLzIHUCLCUCAcQzyrPouTFQBKwGDzYUpP/exec";

// ============================================================================
// 1. HELPERS DE SEGURANÇA E FORMATAÇÃO
// ============================================================================

/** Escapa caracteres perigosos para inserção segura em innerHTML.
 *  SEMPRE use ao interpolar dados que vieram do servidor/usuário. */
function escaparHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

/** Formata qualquer valor como moeda BRL.
 *  Aceita number (99.9) ou string ("99,90" / "99.90"). */
function fmtPreco(v) {
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return `R$ ${(isNaN(n) ? 0 : n).toFixed(2).replace('.', ',')}`;
}

/** Mostra o loader global (bloqueia interação durante requisições longas). */
function mostrarLoader(texto = 'Carregando...') {
    document.getElementById('loader-text').textContent = texto;
    document.getElementById('loader-overlay').classList.remove('hidden');
}
function esconderLoader() {
    document.getElementById('loader-overlay').classList.add('hidden');
}

/** Ativa estado "loading" em um botão (desabilita + spinner). */
function botaoCarregando(id, carregando = true) {
    const b = document.getElementById(id);
    if (!b) return;
    b.disabled = carregando;
    b.classList.toggle('loading', carregando);
}

// ============================================================================
// 2. CACHE LOCAL (resposta instantânea)
// ============================================================================
const CacheLoja = {
    salvar(chave, dados) {
        try {
            localStorage.setItem('cache_' + chave, JSON.stringify({ dados, hora: Date.now() }));
        } catch (e) { console.warn("Cache cheio:", e); }
    },
    obter(chave) {
        try {
            const item = localStorage.getItem('cache_' + chave);
            return item ? JSON.parse(item).dados : null;
        } catch { return null; }
    },
    limpar(chave) {
        localStorage.removeItem('cache_' + chave);
    }
};

// ============================================================================
// 3. ESTADO GLOBAL
// ============================================================================
const estadoSessao = {
    papel: 'visitante',       // visitante | membro | entregador | adm
    token: null,
    nomeUsuario: 'Visitante'
};

let cestaCompras = [];
let catalogoProdutos = [];
let catalogoFiltrado = [];     // [NOVO] produtos após o filtro
let fotoBase64Temporaria = "";
let identificadorEmTentativa = "";
let pedidoChatAberto = null;   // [NOVO] id do pedido no modal de chat

// ============================================================================
// 4. INICIALIZAÇÃO
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    await verificarTokenUrl();          // [corrigido] agora salva o token
    restaurarSessaoLocal();
    atualizarInterfaceSessao();

    // resposta instantânea a partir do cache
    const produtosEmCache = CacheLoja.obter('produtos_' + estadoSessao.papel);
    if (produtosEmCache && produtosEmCache.length > 0) {
        catalogoProdutos = produtosEmCache;
        catalogoFiltrado = produtosEmCache;
        renderizarVitrine();
    }
    // sincronização em segundo plano
    await sincronizarProdutosServidor();
});

/** Devolve a URL base da plataforma (sem querystring). */
function obterUrlBasePlataforma() {
    return window.location.href.split('?')[0];
}

/** Valida o token da URL (se houver) e o guarda na sessão. */
async function verificarTokenUrl() {
    const params = new URLSearchParams(window.location.search);
    const tokenAcesso = params.get('token');
    if (!tokenAcesso) return;

    mostrarLoader('Validando token...');
    try {
        const url = `${URL_BACKEND_APPS_SCRIPT}?acao=validar_link&tokenAcesso=${encodeURIComponent(tokenAcesso)}`;
        const resp = await fetchComTimeout(url, 15000);
        const res  = await resp.json();

        if (res.valido) {
            // [corrigido] guarda o token para futuras requisições
            estadoSessao.token = tokenAcesso;
            exibirToast("Acesso temporário concedido!", "success");
        } else {
            exibirToast(res.mensagem || "Link temporário expirado.", "error");
        }
    } catch (e) {
        console.error(e);
        exibirToast("Falha ao validar token.", "error");
    } finally {
        esconderLoader();
    }
}

/** Wrapper de fetch com timeout para evitar travamentos. */
async function fetchComTimeout(url, ms = 20000, opcoes = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
        return await fetch(url, { ...opcoes, signal: ctrl.signal });
    } finally {
        clearTimeout(timer);
    }
}

/** Executa uma ação POST no Apps Script e devolve o JSON. */
async function executarRequisicaoAPI(acao, dadosExtras = {}) {
    if (URL_BACKEND_APPS_SCRIPT.includes("SEU_ID_DO_SCRIPT_AQUI")) {
        exibirToast("Configure a URL do backend no topo do app.js.", "error");
        return { sucesso: false };
    }
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
// 5. UPLOAD DE IMAGEM (compressão no navegador)
// ============================================================================
function processarUploadImagem(evento) {
    const ficheiro = evento.target.files[0];
    if (!ficheiro) return;

    // GIF: mantém animação (limite de 200 KB)
    if (ficheiro.type === "image/gif") {
        if (ficheiro.size > 200 * 1024) {
            exibirToast("O GIF é muito pesado. Máx: 200KB.", "error");
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

    // Outros formatos: redimensiona via canvas para ~35 KB
    const leitor = new FileReader();
    leitor.onload = e => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX = 350;
            let { width: w, height: h } = img;

            if (w > h && w > MAX) { h *= MAX / w; w = MAX; }
            else if (h >= w && h > MAX) { w *= MAX / h; h = MAX; }

            canvas.width = w;
            canvas.height = h;
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
// 6. VITRINE + FILTRO
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
    } catch (e) {
        console.warn("Modo offline ou falha de rede:", e);
    }
}

/** Filtra a vitrine conforme o texto digitado na busca. */
function aplicarFiltroVitrine() {
    const termo = document.getElementById('filtro-produtos').value.trim().toLowerCase();
    catalogoFiltrado = termo
        ? catalogoProdutos.filter(p => String(p.nome || '').toLowerCase().includes(termo))
        : catalogoProdutos;
    renderizarVitrine();
}

function renderizarVitrine() {
    const grid = document.getElementById('produtos-container');
    grid.innerHTML = '';

    // [NOVO] estado vazio bonito
    if (!catalogoFiltrado || catalogoFiltrado.length === 0) {
        const termo = document.getElementById('filtro-produtos')?.value.trim();
        grid.innerHTML = `
            <div class="empty-state">
                <strong>${termo ? 'Nenhum produto encontrado' : 'Vitrine vazia'}</strong>
                ${termo ? `Nada corresponde a "${escaparHtml(termo)}".` : 'Aguarde novos produtos.'}
            </div>`;
        return;
    }

    catalogoFiltrado.forEach(p => {
        const card  = document.createElement('div');
        card.className = 'product-card';

        const img = document.createElement('img');
        img.className = 'product-thumb';
        img.src = p.foto || '';
        img.alt = p.nome || 'Produto';
        img.loading = 'lazy';

        const body = document.createElement('div');
        body.className = 'product-details';

        const t = document.createElement('h3');
        t.className = 'product-name';
        t.textContent = p.nome || 'Sem nome';

        const pr = document.createElement('p');
        pr.className = 'product-price';
        pr.textContent = fmtPreco(p.preco);   // [corrigido] aceita string ou number

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
// 7. CADASTRO
// ============================================================================
async function tratarSolicitacaoCadastro(e) {
    e.preventDefault();

    const nome     = document.getElementById('cad-nome').value.trim();
    const telefone = document.getElementById('cad-telefone').value.trim();
    const senha    = document.getElementById('cad-senha').value;
    const senhaConf= document.getElementById('cad-senha-conf').value;
    const twitter  = document.getElementById('cad-twitter').value.trim();
    const telegram = document.getElementById('cad-telegram').value.trim();

    if (senha !== senhaConf) return exibirToast("As senhas não coincidem.", "error");
    if (senha.length < 6)    return exibirToast("Senha muito curta.", "error");

    botaoCarregando('btn-enviar-cadastro', true);
    exibirToast("A enviar solicitação...", "info");

    const res = await executarRequisicaoAPI("solicitar_cadastro", {
        nome, telefone, senha, twitter, telegram
    });

    botaoCarregando('btn-enviar-cadastro', false);

    if (res.sucesso) {
        exibirToast(res.mensagem || "Solicitação enviada!", "success");
        document.getElementById('form-registro').reset();
        fecharModal('modal-cadastro');
    } else {
        exibirToast(res.mensagem || "Erro ao registrar.", "error");
    }
}

// ============================================================================
// 8. LOGIN / LOGOUT
// ============================================================================
async function tratarLogin(e) {
    e.preventDefault();
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
        CacheLoja.limpar('produtos_visitante');   // evita cache cruzado
        await sincronizarProdutosServidor();
        exibirToast(`Bem-vindo, ${res.nome}!`, "success");
    } else {
        exibirToast(res.mensagem || "Falha no login.", "error");
        if (res.requerLiberacaoAdm) {
            document.getElementById('box-desbloqueio-conta').classList.remove('hidden');
        }
    }
}

async function enviarPedidoDesbloqueio() {
    if (!identificadorEmTentativa) return;
    const res = await executarRequisicaoAPI("pedir_desbloqueio", { identificador: identificadorEmTentativa });
    if (res.sucesso) {
        exibirToast(res.mensagem || "Pedido enviado.", "success");
        document.getElementById('btn-solicitar-desbloqueio').disabled = true;
    }
}

/** [NOVO] Pede confirmação antes de sair. */
function confirmarLogout() {
    abrirConfirmacao(
        "Sair da conta",
        "Deseja realmente encerrar a sessão?",
        executarLogout
    );
}

function executarLogout() {
    estadoSessao.papel = 'visitante';
    estadoSessao.token = null;
    estadoSessao.nomeUsuario = 'Visitante';
    cestaCompras = [];
    document.getElementById('cart-counter').textContent = "0";
    localStorage.removeItem('plataforma_sessao');
    atualizarInterfaceSessao();
    CacheLoja.limpar('produtos_membro');
    CacheLoja.limpar('produtos_adm');
    sincronizarProdutosServidor();
    navegarPara('vitrine');
    exibirToast("Sessão encerrada.", "info");
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
// 9. INTERFACE POR PAPEL
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

    badge.textContent = estadoSessao.papel.toUpperCase();
    badge.className   = `badge badge-${estadoSessao.papel}`;

    const esconder = el => el.classList.add('hidden');
    const mostrar  = el => el.classList.remove('hidden');

    // esconde tudo primeiro, liga o que interessa
    [tabCarrinho, tabMeusPedidos, tabNovoProduto, tabPedidosAdm, tabAdm].forEach(esconder);

    if (estadoSessao.papel === 'visitante') {
        mostrar(anonBox); esconder(authBox);
    } else if (estadoSessao.papel === 'membro') {
        esconder(anonBox); mostrar(authBox);
        userLbl.textContent = `Olá, ${estadoSessao.nomeUsuario}`;
        mostrar(tabCarrinho); mostrar(tabMeusPedidos);
    } else if (estadoSessao.papel === 'entregador') {
        esconder(anonBox); mostrar(authBox);
        userLbl.textContent = `Entregador: ${estadoSessao.nomeUsuario}`;
        mostrar(tabMeusPedidos);
        mostrar(tabPedidosAdm);
    } else if (estadoSessao.papel === 'adm') {
        esconder(anonBox); mostrar(authBox);
        userLbl.textContent = `ADM: ${estadoSessao.nomeUsuario}`;
        mostrar(tabNovoProduto); mostrar(tabPedidosAdm); mostrar(tabAdm);
    }
}

// ============================================================================
// 10. NAVEGAÇÃO
// ============================================================================
function navegarPara(nomeAba) {
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-panel').forEach(v => v.classList.remove('active'));

    const btn   = document.getElementById(`tab-btn-${nomeAba}`);
    const painel= document.getElementById(`view-${nomeAba}`);

    if (btn && painel) {
        btn.classList.add('active');
        painel.classList.add('active');
    }

    if (nomeAba === 'vitrine')      sincronizarProdutosServidor();
    if (nomeAba === 'carrinho')     renderizarCarrinho();
    if (nomeAba === 'meus-pedidos') carregarMeusPedidos();
    if (nomeAba === 'pedidos-adm')  carregarPedidosAdm();
    if (nomeAba === 'adm')          carregarPainelCentralAdm();
}

// ============================================================================
// 11. CARRINHO
// ============================================================================
function adicionarAoCarrinho(p) {
    const it = cestaCompras.find(i => i.id === p.id);
    if (it) it.quantidade += 1;
    else cestaCompras.push({
        id: p.id, nome: p.nome,
        preco: typeof p.preco === 'number' ? p.preco : parseFloat(String(p.preco).replace(',', '.')),
        quantidade: 1
    });

    const total = cestaCompras.reduce((a, i) => a + i.quantidade, 0);
    document.getElementById('cart-counter').textContent = total;
    exibirToast(`${p.nome} adicionado à cesta.`, "info");
}

function renderizarCarrinho() {
    const lista = document.getElementById('carrinho-itens-lista');
    lista.innerHTML = '';
    let total = 0;

    if (cestaCompras.length === 0) {
        lista.innerHTML = `
            <div class="empty-state">
                <strong>Sua cesta está vazia</strong>
                Adicione produtos da vitrine.
            </div>`;
        document.getElementById('carrinho-total-valor').textContent = 'R$ 0,00';
        return;
    }

    cestaCompras.forEach(i => {
        const sub = i.preco * i.quantidade;
        total += sub;

        const row = document.createElement('div');
        row.className = 'cart-item-row';
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid #e2e8f0;';

        // descrição do item
        const desc = document.createElement('span');
        desc.textContent = `${i.nome} (x${i.quantidade})`;

        // quantidade ajustável (mínimo 1)
        const qtd = document.createElement('input');
        qtd.type = 'number'; qtd.min = 1; qtd.value = i.quantidade;
        qtd.style.cssText = 'width:64px;padding:4px 6px;';
        qtd.onchange = () => {
            i.quantidade = Math.max(1, Number(qtd.value) || 1);
            renderizarCarrinho();
            document.getElementById('cart-counter').textContent =
                cestaCompras.reduce((a, x) => a + x.quantidade, 0);
        };

        // subtotal formatado
        const valor = document.createElement('strong');
        valor.textContent = fmtPreco(sub);

        // remover
        const rem = document.createElement('button');
        rem.className = 'btn btn-danger-outline btn-sm';
        rem.textContent = '✕';
        rem.title = 'Remover item';
        rem.onclick = () => {
            cestaCompras = cestaCompras.filter(x => x.id !== i.id);
            renderizarCarrinho();
            document.getElementById('cart-counter').textContent =
                cestaCompras.reduce((a, x) => a + x.quantidade, 0);
        };

        row.append(desc, qtd, valor, rem);
        lista.appendChild(row);
    });

    document.getElementById('carrinho-total-valor').textContent = fmtPreco(total);
}

async function tratarCriacaoPedido() {
    if (cestaCompras.length === 0) return exibirToast("Cesta vazia.", "error");

    // [NOVO] evita duplo clique
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

    if (res.sucesso) {
        exibirToast(`Pedido ${res.idPedido} gerado!`, "success");
        cestaCompras = [];
        document.getElementById('cart-counter').textContent = "0";
        navegarPara('meus-pedidos');
    } else {
        exibirToast(res.mensagem || "Erro ao pedir.", "error");
    }
}

// ============================================================================
// 12. MEUS PEDIDOS + CHAT
// ============================================================================
async function carregarMeusPedidos() {
    const box = document.getElementById('meus-pedidos-container');
    box.innerHTML = '<div class="loading-slot">Carregando os seus pedidos...</div>';

    const res = await executarRequisicaoAPI("listar_meus_pedidos", { tokenMembro: estadoSessao.token });
    box.innerHTML = '';

    if (!res.sucesso || !res.pedidos || res.pedidos.length === 0) {
        box.innerHTML = `
            <div class="empty-state">
                <strong>Nenhum pedido ainda</strong>
                Quando criar um pedido, ele aparece aqui.
            </div>`;
        return;
    }

    res.pedidos.forEach(p => {
        const card = document.createElement('div');
        card.className = 'adm-card';

        // ⚠️ tudo escapado — evita XSS vindo do Sheets
        card.innerHTML = `
            <h4>Pedido: ${escaparHtml(p.id)}</h4>
            <p>Status: <strong>${escaparHtml(String(p.status).toUpperCase())}</strong>
               | Total: <strong>${fmtPreco(p.total)}</strong></p>
            <p>Forma: ${escaparHtml(p.metodo || '-')}</p>
        `;

        if (p.chatAtivo) {
            const btn = document.createElement('button');
            btn.className = 'btn btn-primary btn-sm';
            btn.textContent = '💬 Abrir chat';
            btn.onclick = () => abrirChatPedido(p.id);
            card.appendChild(btn);
        } else {
            const s = document.createElement('small');
            s.style.color = '#94a3b8';
            s.textContent = 'Chat temporário encerrado.';
            card.appendChild(s);
        }

        box.appendChild(card);
    });
}

/** [NOVO] Abre o modal de chat para um pedido. */
async function abrirChatPedido(pedidoId) {
    pedidoChatAberto = pedidoId;
    document.getElementById('chat-pedido-id').textContent = '#' + pedidoId;
    document.getElementById('chat-mensagens').innerHTML =
        '<div class="loading-slot">Carregando mensagens...</div>';
    abrirModal('modal-chat');
    await renderizarChat();
}

/** [NOVO] Carrega e desenha as mensagens do chat atual. */
async function renderizarChat() {
    if (!pedidoChatAberto) return;
    const box = document.getElementById('chat-mensagens');

    const res = await executarRequisicaoAPI("chat_listar", {
        tokenMembro: estadoSessao.token,
        idPedido: pedidoChatAberto
    });

    box.innerHTML = '';

    if (!res.sucesso || !res.mensagens || res.mensagens.length === 0) {
        box.innerHTML = '<div class="loading-slot">Sem mensagens ainda.</div>';
        return;
    }

    res.mensagens.forEach(m => {
        const div = document.createElement('div');
        // considera "out" quando a mensagem é do usuário logado
        const ehMinha = (m.autorId && m.autorId === estadoSessao.token) ||
                        (m.autor === estadoSessao.nomeUsuario);
        div.className = 'chat-msg ' + (ehMinha ? 'chat-msg--out' : 'chat-msg--in');

        const txt = document.createElement('span');
        txt.textContent = m.texto || '';

        const meta = document.createElement('span');
        meta.className = 'meta';
        meta.textContent = m.autorNome || (ehMinha ? 'Você' : 'ADM');

        div.append(txt, meta);
        box.appendChild(div);
    });

    box.scrollTop = box.scrollHeight;
}

/** [NOVO] Envia uma mensagem no chat do pedido atual. */
async function enviarMensagemChat() {
    const input = document.getElementById('chat-input');
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
// 13. PAINEL ADM
// ============================================================================
async function carregarPainelCentralAdm() {
    if (estadoSessao.papel !== 'adm') return;

    // -- 1. solicitações de cadastro --
    const divSolic = document.getElementById('adm-solicitacoes-lista');
    divSolic.innerHTML = '<div class="loading-slot">Procurando novos cadastros...</div>';

    const resSolic = await executarRequisicaoAPI("listar_solicitacoes_adm", { tokenAdm: estadoSessao.token });
    divSolic.innerHTML = '';

    if (resSolic.sucesso && Array.isArray(resSolic.solicitacoes) && resSolic.solicitacoes.length > 0) {
        resSolic.solicitacoes.forEach(s => {
            const row = document.createElement('div');
            row.style.cssText = 'padding:10px 0;border-bottom:1px solid #e2e8f0;';

            // ⚠️ dados escapados
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

    // -- 2. métricas --
    const resMetricas = await executarRequisicaoAPI("obter_metricas_vendas", { tokenAdm: estadoSessao.token });
    if (resMetricas.sucesso) {
        document.getElementById('metric-faturamento').textContent =
            fmtPreco(resMetricas.faturamentoTotal || 0);
        document.getElementById('metric-pedidos').textContent =
            resMetricas.totalPedidos || 0;

        const divTabela = document.getElementById('tabela-metricas-produtos');
        if (!resMetricas.itensDetalhados || resMetricas.itensDetalhados.length === 0) {
            divTabela.innerHTML = '<div class="loading-slot">Sem vendas registadas.</div>';
        } else {
            let html = '<table class="tabela-metricas"><thead><tr><th>Produto</th><th>Qtd</th></tr></thead><tbody>';
            resMetricas.itensDetalhados.forEach(it => {
                html += `<tr><td>${escaparHtml(it.nome)}</td><td><strong>${Number(it.quantidadeVendida)||0} un</strong></td></tr>`;
            });
            html += '</tbody></table>';
            divTabela.innerHTML = html;
        }
    }

    // -- 3. contas bloqueadas --
    const resBloq = await executarRequisicaoAPI("listar_bloqueados_adm", { tokenAdm: estadoSessao.token });
    const divBloq = document.getElementById('adm-bloqueados-lista');
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

    // -- 4. comentários --
    const resComent = await executarRequisicaoAPI("listar_comentarios_adm", { tokenAdm: estadoSessao.token });
    const divCom = document.getElementById('adm-comentarios-lista');
    divCom.innerHTML = '';
    if (resComent.sucesso && Array.isArray(resComent.comentarios) && resComent.comentarios.length > 0) {
        resComent.comentarios.forEach(c => {
            const p = document.createElement('p');
            p.style.cssText = 'font-size:.8rem;padding:6px 0;border-bottom:1px solid #e2e8f0;';
            // [corrigido] nome e texto escapados
            const quando = c.data ? new Date(c.data).toLocaleString() : '';
            p.innerHTML = `<strong>${escaparHtml(c.nome || 'Anônimo')}</strong> <small style="color:#94a3b8;">${escaparHtml(quando)}</small><br>${escaparHtml(c.texto || '')}`;
            divCom.appendChild(p);
        });
    } else {
        divCom.innerHTML = '<div class="loading-slot">Sem mensagens.</div>';
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
        exibirToast(res.mensagem || "Membro aprovado!", "success");
        await carregarPainelCentralAdm();
    } else {
        exibirToast(res.mensagem || "Erro ao aprovar.", "error");
    }
}

async function liberarContaUsuarioAdm(id) {
    const res = await executarRequisicaoAPI("liberar_conta_adm", {
        tokenAdm: estadoSessao.token, identificador: id
    });
    if (res.sucesso) {
        exibirToast(res.mensagem || "Conta liberada.", "success");
        await carregarPainelCentralAdm();
    }
}

// ============================================================================
// 14. PIPELINE DE PEDIDOS (ADM)
// ============================================================================
async function carregarPedidosAdm() {
    const cA = document.getElementById('pipe-analise');
    const cS = document.getElementById('pipe-solicitados');
    const cV = document.getElementById('pipe-viagem');
    const cC = document.getElementById('pipe-concluido');

    [cA, cS, cV, cC].forEach(c => c.innerHTML = '<div class="loading-slot">…</div>');

    const res = await executarRequisicaoAPI("listar_pedidos_adm", { tokenAdm: estadoSessao.token });

    cA.innerHTML = cS.innerHTML = cV.innerHTML = cC.innerHTML = '';

    if (res.sucesso && Array.isArray(res.pedidos)) {
        res.pedidos.forEach(p => {
            const div = document.createElement('div');
            div.style.cssText = 'background:#fff;padding:6px;margin-bottom:6px;border-radius:4px;border:1px solid #cbd5e1;';

            // ⚠️ id e total escapados/formatados
            div.innerHTML = `
                <small><strong>${escaparHtml(p.id)}</strong></small><br>
                <small>${fmtPreco(p.total)}</small>
            `;

            if (p.status !== 'concluido') {
                const btn = document.createElement('button');
                btn.className = 'btn btn-primary btn-sm';
                btn.style.marginTop = '4px';
                btn.textContent = 'Avançar Fase';
                btn.onclick = () => avancarStatusAdm(p.id, p.status);
                div.appendChild(btn);
            }

            if (p.status === 'analise')      cA.appendChild(div);
            if (p.status === 'solicitados')  cS.appendChild(div);
            if (p.status === 'viagem')       cV.appendChild(div);
            if (p.status === 'concluido')    cC.appendChild(div);
        });
    }

    // estados vazios
    [[cA, 'Em análise'], [cS, 'Solicitados'], [cV, 'Em viagem'], [cC, 'Concluídos']]
        .forEach(([col, nome]) => {
            if (!col.children.length) {
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
        exibirToast("Status atualizado!", "success");
        await carregarPedidosAdm();
    } else {
        exibirToast(res.mensagem || "Erro ao atualizar.", "error");
    }
}

// ============================================================================
// 15. COMENTÁRIOS
// ============================================================================
async function tratarEnvioComentario(e) {
    e.preventDefault();
    const nome = document.getElementById('campo-comentario-nome').value.trim();
    const msg  = document.getElementById('campo-comentario').value.trim();
    if (!msg) return;

    const res = await executarRequisicaoAPI("enviar_comentario", {
        nome,           // [NOVO] envia o nome do autor
        mensagem: msg
    });

    if (res.sucesso) {
        exibirToast("Mensagem enviada!", "success");
        document.getElementById('campo-comentario').value = '';
    } else {
        exibirToast(res.mensagem || "Erro ao enviar.", "error");
    }
}

// ============================================================================
// 16. LINK TEMPORÁRIO
// ============================================================================
async function gerarLinkTemporarioAdm() {
    const minutos = document.getElementById('select-duracao-link').value;
    mostrarLoader("Gerando link...");

    const res = await executarRequisicaoAPI("gerar_link_temporario", {
        tokenAdm: estadoSessao.token,
        duracaoMinutos: minutos
    });
    esconderLoader();

    if (res.sucesso) {
        const linkCompleto = `${obterUrlBasePlataforma()}?token=${res.token}`;
        document.getElementById('campo-link-gerado').value = linkCompleto;
        document.getElementById('area-link-gerado').classList.remove('hidden');
        exibirToast("Link gerado!", "success");
    } else {
        exibirToast(res.mensagem || "Falha ao gerar link.", "error");
    }
}

function copiarLinkGerado() {
    const campo = document.getElementById('campo-link-gerado');
    campo.select();
    navigator.clipboard.writeText(campo.value)
        .then(() => exibirToast("Link copiado!", "success"))
        .catch(() => {
            document.execCommand("copy");
            exibirToast("Link copiado!", "success");
        });
}

// ============================================================================
// 17. CADASTRO DE PRODUTO
// ============================================================================
async function tratarCadastroProduto(e) {
    e.preventDefault();

    const nome     = document.getElementById('adm-prod-nome').value.trim();
    const preco    = parseFloat(document.getElementById('adm-prod-preco').value);
    const visib    = document.getElementById('adm-prod-visibilidade').value;
    const urlFoto  = document.getElementById('adm-prod-foto-url').value.trim();
    const fotoFinal= fotoBase64Temporaria || urlFoto ||
                     "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400";

    if (!nome || !preco || preco <= 0) {
        return exibirToast("Preencha nome e preço válidos.", "error");
    }

    botaoCarregando('btn-salvar-produto', true);
    exibirToast("A guardar produto...", "info");

    const res = await executarRequisicaoAPI("cadastrar_produto", {
        tokenAdm: estadoSessao.token,
        produto: { nome, preco, foto: fotoFinal, visibilidade: visib }
    });

    botaoCarregando('btn-salvar-produto', false);

    if (res.sucesso) {
        exibirToast("Produto adicionado!", "success");
        document.getElementById('form-novo-produto').reset();
        removerFotoCarregada();
        await sincronizarProdutosServidor();
    } else {
        exibirToast(res.mensagem || "Erro ao salvar.", "error");
    }
}

// ============================================================================
// 18. MODAIS / TOASTS
// ============================================================================
function abrirModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('active');
}
function fecharModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('active');
}

/** [NOVO] Modal de confirmação genérico. */
let _callbackConfirmacao = null;
function abrirConfirmacao(titulo, mensagem, callback) {
    document.getElementById('confirmar-titulo').textContent = titulo;
    document.getElementById('confirmar-mensagem').textContent = mensagem;
    _callbackConfirmacao = callback;

    const btnOk = document.getElementById('confirmar-btn-ok');
    // substitui o handler anterior sem acumular listeners
    btnOk.onclick = () => {
        fecharConfirmacao();
        if (typeof _callbackConfirmacao === 'function') _callbackConfirmacao();
    };

    abrirModal('modal-confirmar');
}
function fecharConfirmacao() {
    fecharModal('modal-confirmar');
    _callbackConfirmacao = null;
}

function exibirToast(msg, tipo = 'info') {
    const cont = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast toast-${tipo}`;
    t.textContent = msg;
    cont.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

// fecha modais ao clicar no backdrop
document.querySelectorAll('.modal-overlay').forEach(ov => {
    ov.addEventListener('click', e => {
        if (e.target === ov) ov.classList.remove('active');
    });
});
