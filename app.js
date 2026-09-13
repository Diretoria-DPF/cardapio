/* ==========================================================================
   ESTADO GLOBAL DA APLICAÇÃO (CLIENT-SIDE)
   ========================================================================== */
// Perfis suportados: 'visitante', 'membro', 'adm'
let perfilAtual = 'visitante'; 

// Carrinho de compras local
let carrinho = [];

// Base de dados simulada na memória (sincronizável com backend)
let produtos = [
    { id: 'p1', nome: 'Produto Aberto 1', preco: 49.90, visibilidade: 'publico', foto: 'https://via.placeholder.com/300x200?text=Produto+Publico' },
    { id: 'p2', nome: 'Produto Aberto 2', preco: 89.00, visibilidade: 'publico', foto: 'https://via.placeholder.com/300x200?text=Produto+Publico' },
    { id: 'p3', nome: 'Item Especial para Membros', preco: 150.00, visibilidade: 'registrado', foto: 'https://via.placeholder.com/300x200?text=Exclusivo+Membros' }
];

let pedidos = [];
let comentarios = [];
let solicitacoesCadastro = [];

/* ==========================================================================
   INICIALIZAÇÃO DA APLICAÇÃO
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    // Carrega a vitrine inicial de acordo com o nível do visitante
    renderizarVitrine();
    atualizarPermissoesInterface();
});

/* ==========================================================================
   FUNÇÃO DE HIGIENIZAÇÃO DE TEXTO (PREVENÇÃO DE XSS)
   ========================================================================== */
function sanitizarTexto(texto) {
    const elemento = document.createElement('div');
    elemento.textContent = texto; // Converte scripts maliciosos em texto plano
    return elemento.innerHTML;
}

/* ==========================================================================
   RENDERIZAÇÃO DA VITRINE DE PRODUTOS
   ========================================================================== */
function renderizarVitrine() {
    const grid = document.getElementById('produtos-grid');
    grid.innerHTML = ''; // Limpa a listagem atual

    produtos.forEach(produto => {
        // Regra de Negócio: Visitantes só veem produtos públicos
        if (perfilAtual === 'visitante' && produto.visibilidade !== 'publico') {
            return; // Pula a exibição deste item
        }

        // Constrói o card do produto
        const card = document.createElement('div');
        card.className = 'card-item';
        card.innerHTML = `
            <img src="${sanitizarTexto(produto.foto)}" alt="${sanitizarTexto(produto.nome)}" class="card-img">
            <div class="card-body">
                <div>
                    <h3 class="card-title">${sanitizarTexto(produto.nome)}</h3>
                    <p class="card-price">R$ ${produto.preco.toFixed(2)}</p>
                </div>
                ${perfilAtual !== 'visitante' 
                    ? `<button class="btn-primary" onclick="adicionarAoCarrinho('${produto.id}')">Adicionar à Cesta</button>`
                    : `<small style="color: #6b7280;">Cadastre-se para comprar</small>`}
            </div>
        `;
        grid.appendChild(card);
    });
}

/* ==========================================================================
   CONTROLE DE ACESSO E PERMISSÕES NA INTERFACE
   ========================================================================== */
function atualizarPermissoesInterface() {
    const badge = document.getElementById('role-badge');
    const tabCarrinho = document.getElementById('tab-carrinho');
    const tabPedidos = document.getElementById('tab-pedidos');
    const tabAdm = document.getElementById('tab-adm');

    // Atualiza o texto do distintivo de status
    badge.textContent = perfilAtual.toUpperCase();
    badge.className = `badge badge-${perfilAtual}`;

    // Exibe ou oculta abas de acordo com a hierarquia
    if (perfilAtual === 'visitante') {
        tabCarrinho.style.display = 'none';
        tabPedidos.style.display = 'none';
        tabAdm.style.display = 'none';
    } else if (perfilAtual === 'membro') {
        tabCarrinho.style.display = 'inline-block';
        tabPedidos.style.display = 'inline-block';
        tabAdm.style.display = 'none';
    } else if (perfilAtual === 'adm') {
        tabCarrinho.style.display = 'inline-block';
        tabPedidos.style.display = 'inline-block';
        tabAdm.style.display = 'inline-block';
    }

    renderizarVitrine();
}

/* ==========================================================================
   MUDANÇA DE ABAS DE VISUALIZAÇÃO
   ========================================================================== */
function trocarAba(nomeAba) {
    // Remove classe ativa de todas as abas e seções
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));

    // Ativa a aba e seção escolhidas
    document.getElementById(`view-${nomeAba}`).classList.add('active');
    
    // Atualiza conteúdos específicos se necessário
    if (nomeAba === 'carrinho') renderizarCarrinho();
    if (nomeAba === 'adm') renderizarPainelAdm();
    if (nomeAba === 'pedidos') renderizarMeusPedidos();
}

/* ==========================================================================
   GESTÃO DO CARRINHO DE COMPRAS
   ========================================================================== */
function adicionarAoCarrinho(idProduto) {
    const produto = produtos.find(p => p.id === idProduto);
    if (!produto) return;

    const itemExistente = carrinho.find(item => item.id === idProduto);
    if (itemExistente) {
        itemExistente.quantidade += 1;
    } else {
        carrinho.push({ ...produto, quantidade: 1 });
    }

    atualizarContadorCarrinho();
    alert(`${produto.nome} adicionado à cesta!`);
}

function atualizarContadorCarrinho() {
    const totalItens = carrinho.reduce((acc, item) => acc + item.quantidade, 0);
    document.getElementById('cart-count').textContent = totalItens;
}

function renderizarCarrinho() {
    const container = document.getElementById('itens-carrinho');
    container.innerHTML = '';
    let total = 0;

    carrinho.forEach(item => {
        const subtotal = item.preco * item.quantidade;
        total += subtotal;

        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.padding = '10px 0';
        row.style.borderBottom = '1px solid #eee';
        row.innerHTML = `
            <span>${sanitizarTexto(item.nome)} (x${item.quantidade})</span>
            <span>R$ ${subtotal.toFixed(2)}</span>
        `;
        container.appendChild(row);
    });

    document.getElementById('cart-total').textContent = `R$ ${total.toFixed(2)}`;
}

/* ==========================================================================
   CRIAÇÃO DE PEDIDO COM CHAT TEMPORÁRIO E ID ÚNICO
   ========================================================================== */
function finalizarPedido() {
    if (carrinho.length === 0) {
        alert('Sua cesta está vazia!');
        return;
    }

    const metodo = document.getElementById('select-pagamento').value;
    const pedidoId = 'PED-' + Date.now(); // Identificador anti-duplicidade

    const novoPedido = {
        id: pedidoId,
        itens: [...carrinho],
        metodoPagamento: metodo,
        status: 'analise', // 'analise', 'solicitados', 'viagem', 'concluido'
        chatAtivo: true,
        data: new Date().toLocaleTimeString()
    };

    pedidos.push(novoPedido);
    carrinho = []; // Esvazia o carrinho
    atualizarContadorCarrinho();

    alert(`Pedido ${pedidoId} gerado com sucesso! Escolha o pagamento via ${metodo}.`);
    trocarAba('pedidos');
}

/* ==========================================================================
   RENDERIZAÇÃO DOS PEDIDOS DO USUÁRIO
   ========================================================================== */
function renderizarMeusPedidos() {
    const container = document.getElementById('lista-pedidos-usuario');
    container.innerHTML = '';

    if (pedidos.length === 0) {
        container.innerHTML = '<p>Você ainda não possui pedidos em andamento.</p>';
        return;
    }

    pedidos.forEach(p => {
        const card = document.createElement('div');
        card.style.background = '#fff';
        card.style.padding = '15px';
        card.style.marginBottom = '15px';
        card.style.borderRadius = '6px';
        card.innerHTML = `
            <h4>Pedido: ${p.id}</h4>
            <p>Status atual: <strong>${p.status.toUpperCase()}</strong></p>
            <p>Forma de Pagamento: ${p.metodoPagamento}</p>
            ${p.chatAtivo ? `
                <div style="margin-top:10px; padding: 10px; background: #eef2ff; border-radius: 4px;">
                    <p><strong>Chat com a Central / Entregador (Temporário):</strong></p>
                    <small>Este chat ficará disponível enquanto a entrega estiver ativa.</small>
                    <input type="text" placeholder="Escreva uma mensagem sobre a entrega..." style="margin-top:5px;">
                    <button class="btn-secondary" onclick="alert('Mensagem enviada com sucesso!')">Enviar</button>
                </div>
            ` : '<p><em>Chat temporário encerrado.</em></p>'}
        `;
        container.appendChild(card);
    });
}

/* ==========================================================================
   AUTENTICAÇÃO E MODAL
   ========================================================================== */
function alternarTelaLogin() {
    document.getElementById('modal-auth').classList.add('active');
}

function fecharModalAuth() {
    document.getElementById('modal-auth').classList.remove('active');
}

function acessarComToken(event) {
    event.preventDefault();
    const token = document.getElementById('login-token').value;

    // Demonstração local de validação de token
    if (token === 'admin123') {
        perfilAtual = 'adm';
        alert('Bem-vindo, Administrador!');
    } else if (token === 'membro123') {
        perfilAtual = 'membro';
        alert('Bem-vindo, Membro!');
    } else {
        alert('Token inválido ou expirado.');
        return;
    }

    fecharModalAuth();
    atualizarPermissoesInterface();
}

function registrarUsuario(event) {
    event.preventDefault();
    const nome = document.getElementById('reg-nome').value;
    const numero = document.getElementById('reg-numero').value;
    const twitter = document.getElementById('reg-twitter').value;
    const telegram = document.getElementById('reg-telegram').value;

    solicitacoesCadastro.push({ nome, numero, twitter, telegram, id: Date.now() });

    alert('Solicitação de cadastro recebida! Aguarde aprovação da administração.');
    fecharModalAuth();
}

/* ==========================================================================
   ENVIO DE COMENTÁRIOS SEGUROS
   ========================================================================== */
function enviarComentario(event) {
    event.preventDefault();
    const texto = document.getElementById('texto-comentario').value;
    comentarios.push({ texto: sanitizarTexto(texto), data: new Date().toLocaleTimeString() });
    document.getElementById('texto-comentario').value = '';
    alert('Comentário enviado com sucesso para a administração.');
}

/* ==========================================================================
   FUNÇÕES DO PAINEL ADMINISTRATIVO
   ========================================================================== */
function renderizarPainelAdm() {
    // 1. Renderiza solicitações de cadastro
    const divCadastros = document.getElementById('adm-cadastros-lista');
    divCadastros.innerHTML = '';
    solicitacoesCadastro.forEach(s => {
        const item = document.createElement('div');
        item.style.padding = '8px 0';
        item.innerHTML = `
            <strong>${sanitizarTexto(s.nome)}</strong> (${sanitizarTexto(s.numero)}) - Tel: ${sanitizarTexto(s.telegram)}
            <button class="btn-secondary" onclick="aprovarMembro(${s.id})">Aprovar como Membro</button>
        `;
        divCadastros.appendChild(item);
    });

    // 2. Renderiza pipeline de pedidos
    const colAnalise = document.getElementById('col-analise');
    const colSolicitados = document.getElementById('col-solicitados');
    const colViagem = document.getElementById('col-viagem');
    const colConcluido = document.getElementById('col-concluido');

    colAnalise.innerHTML = '';
    colSolicitados.innerHTML = '';
    colViagem.innerHTML = '';
    colConcluido.innerHTML = '';

    pedidos.forEach(p => {
        const el = document.createElement('div');
        el.style.background = '#fff';
        el.style.padding = '6px';
        el.style.marginBottom = '6px';
        el.style.borderRadius = '4px';
        el.innerHTML = `
            <small><strong>${p.id}</strong></small><br>
            <button onclick="mudarStatusPedido('${p.id}')" style="font-size: 0.7rem; padding: 2px 4px; margin-top: 4px;">Avançar Fase</button>
        `;
        if (p.status === 'analise') colAnalise.appendChild(el);
        if (p.status === 'solicitados') colSolicitados.appendChild(el);
        if (p.status === 'viagem') colViagem.appendChild(el);
        if (p.status === 'concluido') colConcluido.appendChild(el);
    });

    // 3. Renderiza comentários
    const divComentarios = document.getElementById('adm-comentarios-lista');
    divComentarios.innerHTML = '';
    comentarios.forEach(c => {
        const el = document.createElement('p');
        el.innerHTML = `<small>[${c.data}]</small> ${c.texto}`;
        divComentarios.appendChild(el);
    });
}

function aprovarMembro(idSolicitacao) {
    solicitacoesCadastro = solicitacoesCadastro.filter(s => s.id !== idSolicitacao);
    alert('Usuário promovido a Membro com sucesso!');
    renderizarPainelAdm();
}

function mudarStatusPedido(idPedido) {
    const pedido = pedidos.find(p => p.id === idPedido);
    if (!pedido) return;

    if (pedido.status === 'analise') pedido.status = 'solicitados';
    else if (pedido.status === 'solicitados') pedido.status = 'viagem';
    else if (pedido.status === 'viagem') {
        pedido.status = 'concluido';
        pedido.chatAtivo = false; // Encerra o chat temporário
    }
    renderizarPainelAdm();
}

function cadastrarProduto(event) {
    event.preventDefault();
    const nome = document.getElementById('novo-prod-nome').value;
    const preco = parseFloat(document.getElementById('novo-prod-preco').value);
    const foto = document.getElementById('novo-prod-foto').value;
    const visibilidade = document.getElementById('novo-prod-visibilidade').value;

    produtos.push({ id: 'p-' + Date.now(), nome, preco, foto, visibilidade });
    alert('Produto inserido com sucesso na vitrine!');
    document.getElementById('form-novo-produto').reset();
    renderizarVitrine();
}
