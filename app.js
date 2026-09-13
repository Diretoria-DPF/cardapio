/* ==========================================================================
   APP.JS - CAMADA DE INTERFACE, ESTADO LOCAL E SEGURANÇA NO CLIENTE
   ========================================================================== */

/**
 * Estado global da sessão na interface.
 * O papel real e os dados sensíveis sempre serão validados no Backend (Google Apps Script).
 */
const estadoSessao = {
    papel: 'visitante',          // Opções: 'visitante', 'membro', 'adm'
    token: null,                 // Token de sessão retornado pelo backend
    nomeUsuario: 'Visitante'     // Nome exibido na interface
};

// Cesta de compras local mantida pelo navegador do membro
let cestaCompras = [];

// Catálogo base para demonstração visual inicial (será alimentado pelo backend na Fase 2)
let catalogoProdutos = [
    { id: 'PROD-001', nome: 'Produto de Acesso Aberto', preco: 49.90, visibilidade: 'publico', foto: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400' },
    { id: 'PROD-002', nome: 'Item Promocional Comum', preco: 89.90, visibilidade: 'publico', foto: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400' },
    { id: 'PROD-003', nome: 'Item Exclusivo para Membros', preco: 199.00, visibilidade: 'registrado', foto: 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=400' }
];

// Fila simulada de cadastros pendentes para visualização do Administrador
let filaCadastros = [];

// Lista simulada de pedidos
let listaPedidos = [];

// Lista de comentários recebidos
let listaComentarios = [];

/* ==========================================================================
   INICIALIZAÇÃO E PERSISTÊNCIA DA SESSÃO
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    // Recupera a sessão do armazenamento local do navegador se já logado
    const sessaoSalva = localStorage.getItem('plataforma_sessao');
    if (sessaoSalva) {
        try {
            const dados = JSON.parse(sessaoSalva);
            estadoSessao.papel = dados.papel || 'visitante';
            estadoSessao.token = dados.token || null;
            estadoSessao.nomeUsuario = dados.nomeUsuario || 'Visitante';
        } catch (e) {
            console.error('Falha ao restaurar sessão local:', e);
            localStorage.removeItem('plataforma_sessao');
        }
    }

    atualizarInterfaceSessao();
    renderizarVitrine();
});

/* ==========================================================================
   FUNÇÃO DIDÁTICA: NOTIFICAÇÕES VISUAIS FLUTUANTES (TOASTS)
   ========================================================================== */
/**
 * Exibe uma mensagem flutuante sem interromper a navegação do usuário.
 * @param {string} mensagem - Texto a ser exibido.
 * @param {'success'|'error'|'info'} tipo - Estilo visual da notificação.
 */
function exibirToast(mensagem, tipo = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.textContent = mensagem; // Sanitização garantida: textContent não interpreta HTML

    container.appendChild(toast);

    // Remove automaticamente a notificação após 3,5 segundos
    setTimeout(() => {
        toast.remove();
    }, 3500);
}

/* ==========================================================================
   CONTROLE DE MODAIS (LOGIN E CADASTRO SEPARADOS)
   ========================================================================== */
function abrirModal(idModal) {
    const modal = document.getElementById(idModal);
    if (modal) modal.classList.add('active');
}

function fecharModal(idModal) {
    const modal = document.getElementById(idModal);
    if (modal) modal.classList.remove('active');
}

/* ==========================================================================
   NAVEGAÇÃO ENTRE TELAS (ABAS)
   ========================================================================== */
function navegarPara(nomeAba) {
    document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.view-panel').forEach(view => view.classList.remove('active'));

    const botao = document.getElementById(`tab-btn-${nomeAba}`);
    const tela = document.getElementById(`view-${nomeAba}`);

    if (botao && tela) {
        botao.classList.add('active');
        tela.classList.add('active');
    }

    if (nomeAba === 'carrinho') renderizarCarrinho();
    if (nomeAba === 'pedidos') renderizarMeusPedidos();
    if (nomeAba === 'adm') renderizarPainelAdm();
}

/* ==========================================================================
   ATUALIZAÇÃO DE INTERFACE SEGUNDO O PAPEL (VISITANTE, MEMBRO, ADM)
   ========================================================================== */
function atualizarInterfaceSessao() {
    const badge = document.getElementById('role-badge');
    const containerAnon = document.getElementById('anon-buttons');
    const containerAuth = document.getElementById('auth-buttons');
    const labelUsuario = document.getElementById('user-display-name');

    const tabCarrinho = document.getElementById('tab-btn-carrinho');
    const tabPedidos = document.getElementById('tab-btn-pedidos');
    const tabAdm = document.getElementById('tab-btn-adm');

    badge.textContent = estadoSessao.papel.toUpperCase();
    badge.className = `badge badge-${estadoSessao.papel}`;

    if (estadoSessao.papel === 'visitante') {
        containerAnon.style.display = 'flex';
        containerAuth.style.display = 'none';
        tabCarrinho.style.display = 'none';
        tabPedidos.style.display = 'none';
        tabAdm.style.display = 'none';
    } else {
        containerAnon.style.display = 'none';
        containerAuth.style.display = 'flex';
        labelUsuario.textContent = `Olá, ${estadoSessao.nomeUsuario}`;

        tabCarrinho.style.display = 'inline-block';
        tabPedidos.style.display = 'inline-block';
        tabAdm.style.display = estadoSessao.papel === 'adm' ? 'inline-block' : 'none';
    }

    renderizarVitrine();
}

/* ==========================================================================
   RENDERIZAÇÃO DA VITRINE (COM CONSTRUÇÃO SEGURA DO DOM)
   ========================================================================== */
function renderizarVitrine() {
    const grid = document.getElementById('produtos-container');
    grid.innerHTML = ''; // Limpa conteúdo anterior

    catalogoProdutos.forEach(produto => {
        // Regra: Visitante não visualiza produtos restritos para membros
        if (estadoSessao.papel === 'visitante' && produto.visibilidade !== 'publico') {
            return;
        }

        // Construção segura: Criação nó a nó sem usar innerHTML diretamente em dados dinâmicos
        const card = document.createElement('div');
        card.className = 'product-card';

        const img = document.createElement('img');
        img.className = 'product-thumb';
        img.src = produto.foto;
        img.alt = produto.nome;

        const body = document.createElement('div');
        body.className = 'product-details';

        const titulo = document.createElement('h3');
        titulo.className = 'product-name';
        titulo.textContent = produto.nome;

        const preco = document.createElement('p');
        preco.className = 'product-price';
        preco.textContent = `R$ ${produto.preco.toFixed(2).replace('.', ',')}`;

        body.appendChild(titulo);
        body.appendChild(preco);

        if (estadoSessao.papel !== 'visitante') {
            const btnComprar = document.createElement('button');
            btnComprar.className = 'btn btn-primary btn-block';
            btnComprar.textContent = 'Adicionar à Cesta';
            btnComprar.onclick = () => adicionarAoCarrinho(produto);
            body.appendChild(btnComprar);
        } else {
            const nota = document.createElement('p');
            nota.className = 'visitor-note';
            nota.textContent = 'Cadastre-se e entre como membro para realizar compras.';
            body.appendChild(nota);
        }

        card.appendChild(img);
        card.appendChild(body);
        grid.appendChild(card);
    });
}

/* ==========================================================================
   SOLICITAÇÃO DE CADASTRO (FORMULÁRIO DEDICADO)
   ========================================================================== */
function tratarSolicitacaoCadastro(evento) {
    evento.preventDefault();

    const nome = document.getElementById('cad-nome').value.trim();
    const telefone = document.getElementById('cad-telefone').value.trim();
    const twitter = document.getElementById('cad-twitter').value.trim();
    const telegram = document.getElementById('cad-telegram').value.trim();
    const termosAceitos = document.getElementById('cad-termos').checked;

    if (!termosAceitos) {
        exibirToast('É necessário aceitar os termos de uso para solicitar cadastro.', 'error');
        return;
    }

    // Guarda a solicitação na fila (posteriormente enviada ao Apps Script)
    filaCadastros.push({
        id: 'SOLIC-' + Date.now(),
        nome: nome,
        telefone: telefone,
        twitter: twitter,
        telegram: telegram,
        data: new Date().toLocaleString('pt-BR')
    });

    document.getElementById('form-registro').reset();
    fecharModal('modal-cadastro');
    exibirToast('Solicitação de cadastro enviada com sucesso! Aguarde a aprovação.', 'success');
}

/* ==========================================================================
   LOGIN SEPARADO (MEMBRO E ADMINISTRADOR)
   ========================================================================== */
function tratarLogin(evento) {
    evento.preventDefault();

    const usuario = document.getElementById('login-usuario').value.trim();
    const senha = document.getElementById('login-senha').value.trim();

    // Demonstração local antes da conexão completa com o backend
    if (usuario === 'admin' && senha === 'admin123') {
        estadoSessao.papel = 'adm';
        estadoSessao.token = 'TOKEN-ADM-LOCAL';
        estadoSessao.nomeUsuario = 'Administrador';
    } else if (usuario.length > 0 && senha === '123456') {
        estadoSessao.papel = 'membro';
        estadoSessao.token = 'TOKEN-MEMBRO-LOCAL';
        estadoSessao.nomeUsuario = usuario;
    } else {
        exibirToast('Credenciais inválidas. Verifique os dados.', 'error');
        return;
    }

    // Grava no armazenamento local do navegador
    localStorage.setItem('plataforma_sessao', JSON.stringify(estadoSessao));

    document.getElementById('form-login').reset();
    fecharModal('modal-login');
    atualizarInterfaceSessao();
    exibirToast(`Bem-vindo, ${estadoSessao.nomeUsuario}!`, 'success');
}

function executarLogout() {
    estadoSessao.papel = 'visitante';
    estadoSessao.token = null;
    estadoSessao.nomeUsuario = 'Visitante';
    cestaCompras = [];

    localStorage.removeItem('plataforma_sessao');
    atualizarInterfaceSessao();
    navegarPara('vitrine');
    exibirToast('Sessão encerrada com sucesso.', 'info');
}

/* ==========================================================================
   GESTOR DA CESTA DE COMPRAS
   ========================================================================== */
function adicionarAoCarrinho(produto) {
    const itemExistente = cestaCompras.find(i => i.id === produto.id);

    if (itemExistente) {
        itemExistente.quantidade += 1;
    } else {
        // Armazena apenas a referência localmente (o preço final é congelado e conferido no Backend)
        cestaCompras.push({
            id: produto.id,
            nome: produto.nome,
            preco: produto.preco,
            quantidade: 1
        });
    }

    atualizarContadorCarrinho();
    exibirToast(`${produto.nome} adicionado à cesta.`, 'info');
}

function atualizarContadorCarrinho() {
    const totalItens = cestaCompras.reduce((total, item) => total + item.quantidade, 0);
    document.getElementById('cart-counter').textContent = totalItens;
}

function renderizarCarrinho() {
    const lista = document.getElementById('carrinho-itens-lista');
    lista.innerHTML = '';
    let total = 0;

    if (cestaCompras.length === 0) {
        lista.innerHTML = '<p style="color: #64748b; padding: 20px 0;">Sua cesta está vazia no momento.</p>';
        document.getElementById('carrinho-total-valor').textContent = 'R$ 0,00';
        return;
    }

    cestaCompras.forEach((item, index) => {
        const subtotal = item.preco * item.quantidade;
        total += subtotal;

        const linha = document.createElement('div');
        linha.style.display = 'flex';
        linha.style.justifyContent = 'space-between';
        linha.style.alignItems = 'center';
        linha.style.padding = '8px 0';
        linha.style.borderBottom = '1px solid #e2e8f0';

        const info = document.createElement('span');
        info.textContent = `${item.nome} (${item.quantidade}x)`;

        const valor = document.createElement('strong');
        valor.textContent = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;

        linha.appendChild(info);
        linha.appendChild(valor);
        lista.appendChild(linha);
    });

    document.getElementById('carrinho-total-valor').textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
}

/* ==========================================================================
   CRIAÇÃO DE PEDIDO COM CHAT TEMPORÁRIO
   ========================================================================== */
function tratarCriacaoPedido() {
    if (cestaCompras.length === 0) {
        exibirToast('Adicione produtos antes de gerar um pedido.', 'error');
        return;
    }

    const metodo = document.getElementById('metodo-pagamento').value;
    const novoPedido = {
        id: 'PED-' + Date.now(),
        itens: [...cestaCompras],
        metodo: metodo,
        status: 'analise', // 'analise' -> 'solicitados' -> 'viagem' -> 'concluido'
        chatAtivo: true,
        data: new Date().toLocaleTimeString('pt-BR')
    };

    listaPedidos.push(novoPedido);
    cestaCompras = [];
    atualizarContadorCarrinho();

    exibirToast(`Pedido ${novoPedido.id} criado com sucesso via ${metodo}!`, 'success');
    navegarPara('pedidos');
}

/* ==========================================================================
   RENDERIZAÇÃO DOS PEDIDOS DO MEMBRO
   ========================================================================== */
function renderizarMeusPedidos() {
    const container = document.getElementById('pedidos-lista-container');
    container.innerHTML = '';

    if (listaPedidos.length === 0) {
        container.innerHTML = '<p style="color: #64748b;">Nenhum pedido ativo no momento.</p>';
        return;
    }

    listaPedidos.forEach(pedido => {
        const card = document.createElement('div');
        card.style.background = '#ffffff';
        card.style.border = '1px solid #e2e8f0';
        card.style.borderRadius = '8px';
        card.style.padding = '14px';
        card.style.marginBottom = '12px';

        const idTexto = document.createElement('h4');
        idTexto.textContent = `Identificador: ${pedido.id}`;

        const statusTexto = document.createElement('p');
        statusTexto.textContent = `Status: ${pedido.status.toUpperCase()} | Forma: ${pedido.metodo}`;

        card.appendChild(idTexto);
        card.appendChild(statusTexto);

        // Bloco de chat temporário
        if (pedido.chatAtivo) {
            const chatBox = document.createElement('div');
            chatBox.style.marginTop = '10px';
            chatBox.style.padding = '10px';
            chatBox.style.background = '#f1f5f9';
            chatBox.style.borderRadius = '6px';

            const chatAviso = document.createElement('small');
            chatAviso.style.display = 'block';
            chatAviso.style.color = '#475569';
            chatAviso.textContent = 'Canal temporário de instruções e orientações sobre a entrega:';

            const inputMsg = document.createElement('input');
            inputMsg.type = 'text';
            inputMsg.placeholder = 'Digite uma dúvida sobre a entrega...';
            inputMsg.style.marginTop = '6px';

            const btnEnviarMsg = document.createElement('button');
            btnEnviarMsg.className = 'btn btn-primary';
            btnEnviarMsg.style.marginTop = '6px';
            btnEnviarMsg.textContent = 'Enviar Mensagem';
            btnEnviarMsg.onclick = () => {
                if (inputMsg.value.trim().length > 0) {
                    exibirToast('Mensagem enviada com sucesso no chat temporário!', 'success');
                    inputMsg.value = '';
                }
            };

            chatBox.appendChild(chatAviso);
            chatBox.appendChild(inputMsg);
            chatBox.appendChild(btnEnviarMsg);
            card.appendChild(chatBox);
        } else {
            const chatFechado = document.createElement('p');
            chatFechado.style.fontSize = '0.8rem';
            chatFechado.style.color = '#94a3b8';
            chatFechado.style.marginTop = '8px';
            chatFechado.textContent = 'Este canal temporário foi concluído e encerrado pela administração.';
            card.appendChild(chatFechado);
        }

        container.appendChild(card);
    });
}

/* ==========================================================================
   ENVIO DE COMENTÁRIOS / DÚVIDAS
   ========================================================================== */
function tratarEnvioComentario(evento) {
    evento.preventDefault();
    const campo = document.getElementById('campo-comentario');
    const texto = campo.value.trim();

    if (texto.length > 0) {
        listaComentarios.push({
            texto: texto,
            data: new Date().toLocaleTimeString('pt-BR')
        });
        campo.value = '';
        exibirToast('Mensagem enviada com sucesso para a moderação!', 'success');
    }
}

/* ==========================================================================
   PAINEL DE CONTROLE ADMINISTRATIVO (APENAS ADM)
   ========================================================================== */
function renderizarPainelAdm() {
    // 1. Renderiza solicitações de cadastro pendentes
    const listaSolicitacoes = document.getElementById('adm-solicitacoes-lista');
    listaSolicitacoes.innerHTML = '';

    if (filaCadastros.length === 0) {
        listaSolicitacoes.innerHTML = '<p style="color: #64748b; font-size: 0.85rem;">Nenhuma solicitação pendente.</p>';
    } else {
        filaCadastros.forEach(solic => {
            const linha = document.createElement('div');
            linha.style.padding = '8px 0';
            linha.style.borderBottom = '1px solid #e2e8f0';

            const texto = document.createElement('p');
            texto.textContent = `${solic.nome} | Tel: ${solic.telefone} | Telegram: ${solic.telegram || 'N/A'}`;

            const btnAprovar = document.createElement('button');
            btnAprovar.className = 'btn btn-success';
            btnAprovar.style.fontSize = '0.75rem';
            btnAprovar.style.marginTop = '4px';
            btnAprovar.textContent = 'Aprovar como Membro';
            btnAprovar.onclick = () => {
                filaCadastros = filaCadastros.filter(s => s.id !== solic.id);
                exibirToast(`Usuário ${solic.nome} aprovado com sucesso!`, 'success');
                renderizarPainelAdm();
            };

            linha.appendChild(texto);
            linha.appendChild(btnAprovar);
            listaSolicitacoes.appendChild(linha);
        });
    }

    // 2. Renderiza esteira de pedidos
    const colAnalise = document.getElementById('pipe-analise');
    const colSolicitados = document.getElementById('pipe-solicitados');
    const colViagem = document.getElementById('pipe-viagem');
    const colConcluido = document.getElementById('pipe-concluido');

    colAnalise.innerHTML = '';
    colSolicitados.innerHTML = '';
    colViagem.innerHTML = '';
    colConcluido.innerHTML = '';

    listaPedidos.forEach(pedido => {
        const item = document.createElement('div');
        item.style.background = '#ffffff';
        item.style.border = '1px solid #cbd5e1';
        item.style.borderRadius = '4px';
        item.style.padding = '6px';
        item.style.marginBottom = '6px';

        const idSpan = document.createElement('strong');
        idSpan.style.fontSize = '0.75rem';
        idSpan.textContent = pedido.id;

        const btnAvancar = document.createElement('button');
        btnAvancar.className = 'btn btn-primary';
        btnAvancar.style.fontSize = '0.65rem';
        btnAvancar.style.padding = '2px 6px';
        btnAvancar.style.marginTop = '4px';
        btnAvancar.style.display = 'block';
        btnAvancar.textContent = 'Avançar Fase';
        btnAvancar.onclick = () => avancarStatusPedido(pedido.id);

        item.appendChild(idSpan);
        if (pedido.status !== 'concluido') {
            item.appendChild(btnAvancar);
        }

        if (pedido.status === 'analise') colAnalise.appendChild(item);
        if (pedido.status === 'solicitados') colSolicitados.appendChild(item);
        if (pedido.status === 'viagem') colViagem.appendChild(item);
        if (pedido.status === 'concluido') colConcluido.appendChild(item);
    });

    // 3. Renderiza comentários
    const listaComents = document.getElementById('adm-comentarios-lista');
    listaComents.innerHTML = '';
    if (listaComentarios.length === 0) {
        listaComents.innerHTML = '<p style="color: #64748b; font-size: 0.85rem;">Nenhuma mensagem recebida.</p>';
    } else {
        listaComentarios.forEach(c => {
            const p = document.createElement('p');
            p.style.fontSize = '0.85rem';
            p.style.padding = '4px 0';
            p.textContent = `[${c.data}] ${c.texto}`;
            listaComents.appendChild(p);
        });
    }
}

function avancarStatusPedido(idPedido) {
    const pedido = listaPedidos.find(p => p.id === idPedido);
    if (!pedido) return;

    if (pedido.status === 'analise') {
        pedido.status = 'solicitados';
        exibirToast(`Pedido ${idPedido} movido para Solicitados.`, 'info');
    } else if (pedido.status === 'solicitados') {
        pedido.status = 'viagem';
        exibirToast(`Pedido ${idPedido} despachado em viagem.`, 'info');
    } else if (pedido.status === 'viagem') {
        pedido.status = 'concluido';
        pedido.chatAtivo = false; // Regra: o chat temporário se encerra com a conclusão
        exibirToast(`Pedido ${idPedido} concluído e chat finalizado.`, 'success');
    }

    renderizarPainelAdm();
}

function tratarCadastroProduto(evento) {
    evento.preventDefault();

    const nome = document.getElementById('adm-prod-nome').value.trim();
    const preco = parseFloat(document.getElementById('adm-prod-preco').value);
    const foto = document.getElementById('adm-prod-foto').value.trim();
    const visibilidade = document.getElementById('adm-prod-visibilidade').value;

    catalogoProdutos.push({
        id: 'PROD-' + Date.now(),
        nome: nome,
        preco: preco,
        foto: foto,
        visibilidade: visibilidade
    });

    document.getElementById('form-novo-produto').reset();
    exibirToast('Produto adicionado ao catálogo com sucesso!', 'success');
    renderizarVitrine();
}
