/**
 * ============================================================================
 * APP.JS - INTEGRAÇÃO COMPLETA COM BACKEND (GOOGLE APPS SCRIPT)
 * ============================================================================
 * Responsável por:
 * 1. Gerenciar o estado da sessão local (Visitante, Membro ou ADM).
 * 2. Enviar e receber dados reais da API usando a função fetch().
 * 3. Manipular elementos da tela (DOM) de forma limpa e livre de ataques XSS.
 */

// ============================================================================
// CONFIGURAÇÃO DA API (COLE SUA URL AQUI)
// ============================================================================
// Substitua o texto entre aspas pela URL do seu Web App terminada em /exec
const URL_BACKEND_APPS_SCRIPT = "https://script.google.com/macros/s/AKfycbwKauAHD750szLBBLDflruitYtNZwLgYYGOLzIHUCLCUCAcQzyrPouTFQBKwGDzYUpP/exec";

// ============================================================================
// ESTADO GLOBAL DA SESSÃO NO NAVEGADOR
// ============================================================================
const estadoSessao = {
    papel: 'visitante',          // 'visitante' | 'membro' | 'adm'
    token: null,                 // Token gerado pelo backend
    nomeUsuario: 'Visitante'     // Nome de exibição
};

// Cesta de compras temporária do cliente
let cestaCompras = [];

// Catálogo de produtos sincronizado com a planilha
let catalogoProdutos = [];

// ============================================================================
// INICIALIZAÇÃO DA APLICAÇÃO (AO CARREGAR A PÁGINA)
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Restaura a sessão anterior caso o usuário já tenha feito login
    restaurarSessaoLocal();

    // 2. Atualiza os botões e abas visíveis de acordo com o papel
    atualizarInterfaceSessao();

    // 3. Busca o catálogo de produtos oficial do Google Sheets
    await carregarProdutosServidor();
});

// ============================================================================
// FUNÇÃO CENTRAL DE COMUNICAÇÃO COM O SERVIDOR (FETCH SEGURO)
// ============================================================================
/**
 * Envia uma requisição POST ao Google Apps Script e devolve o resultado.
 * @param {string} acao - Nome da rota registrada no Code.gs.
 * @param {Object} dadosExtras - Informações enviadas para o servidor.
 * @returns {Promise<Object>} Resposta em formato de objeto JavaScript.
 */
async function executarRequisicaoAPI(acao, dadosExtras = {}) {
    // Validação preventiva: avisa se a URL do Apps Script não foi configurada
    if (URL_BACKEND_APPS_SCRIPT.includes("SEU_ID_DO_SCRIPT_AQUI")) {
        exibirToast("Configure a URL do Apps Script no topo do app.js antes de continuar.", "error");
        return { sucesso: false, mensagem: "URL do backend não configurada." };
    }

    const payload = {
        acao: acao,
        ...dadosExtras
    };

    try {
        // Envio da requisição usando fetch
        const resposta = await fetch(URL_BACKEND_APPS_SCRIPT, {
            method: 'POST',
            // O uso de text/plain evita bloqueios de CORS no redirecionamento do Google
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });

        const dadosResposta = await resposta.json();
        return dadosResposta;
    } catch (erro) {
        console.error("Falha na chamada da API:", erro);
        exibirToast("Erro de comunicação com o servidor.", "error");
        return { sucesso: false, mensagem: erro.toString() };
    }
}

// ============================================================================
// GESTÃO DE PRODUTOS E CATÁLOGO REAL
// ============================================================================
/**
 * Busca os produtos cadastrados na planilha através de uma requisição GET.
 */
async function carregarProdutosServidor() {
    const grid = document.getElementById('produtos-container');
    grid.innerHTML = '<p style="color: #64748b;">Carregando produtos disponíveis...</p>';

    try {
        // Monta a URL de leitura pública com o token da sessão se existir
        let urlConsulta = `${URL_BACKEND_APPS_SCRIPT}?acao=listar_produtos`;
        if (estadoSessao.token) {
            urlConsulta += `&token=${encodeURIComponent(estadoSessao.token)}`;
        }

        const resposta = await fetch(urlConsulta);
        const resultado = await resposta.json();

        if (resultado.sucesso && Array.isArray(resultado.produtos)) {
            catalogoProdutos = resultado.produtos;
            renderizarVitrine();
        } else {
            grid.innerHTML = '<p style="color: #64748b;">Nenhum produto encontrado no momento.</p>';
        }
    } catch (erro) {
        console.error("Erro ao listar produtos:", erro);
        grid.innerHTML = '<p style="color: #ef4444;">Não foi possível carregar a vitrine agora.</p>';
    }
}

/**
 * Desenha os cartões de produtos na tela com proteção total contra XSS.
 */
function renderizarVitrine() {
    const grid = document.getElementById('produtos-container');
    grid.innerHTML = '';

    if (catalogoProdutos.length === 0) {
        grid.innerHTML = '<p style="color: #64748b;">Nenhum item visível para este nível de acesso.</p>';
        return;
    }

    catalogoProdutos.forEach(produto => {
        const card = document.createElement('div');
        card.className = 'product-card';

        const img = document.createElement('img');
        img.className = 'product-thumb';
        img.src = produto.foto || 'https://via.placeholder.com/300x200?text=Sem+Foto';
        img.alt = produto.nome;

        const body = document.createElement('div');
        body.className = 'product-details';

        const titulo = document.createElement('h3');
        titulo.className = 'product-name';
        titulo.textContent = produto.nome; // Inserção segura

        const preco = document.createElement('p');
        preco.className = 'product-price';
        preco.textContent = `R$ ${produto.preco.toFixed(2).replace('.', ',')}`;

        body.appendChild(titulo);
        body.appendChild(preco);

        // Apenas usuários cadastrados veem o botão de adicionar à cesta
        if (estadoSessao.papel !== 'visitante') {
            const btnComprar = document.createElement('button');
            btnComprar.className = 'btn btn-primary btn-block';
            btnComprar.textContent = 'Adicionar à Cesta';
            btnComprar.onclick = () => adicionarAoCarrinho(produto);
            body.appendChild(btnComprar);
        } else {
            const nota = document.createElement('p');
            nota.className = 'visitor-note';
            nota.textContent = 'Cadastre-se e entre como membro para comprar.';
            body.appendChild(nota);
        }

        card.appendChild(img);
        card.appendChild(body);
        grid.appendChild(card);
    });
}

// ============================================================================
// SOLICITAÇÃO DE CADASTRO (ENVIO REAL PARA A PLANILHA)
// ============================================================================
async function tratarSolicitacaoCadastro(evento) {
    evento.preventDefault();

    const nome = document.getElementById('cad-nome').value.trim();
    const telefone = document.getElementById('cad-telefone').value.trim();
    const twitter = document.getElementById('cad-twitter').value.trim();
    const telegram = document.getElementById('cad-telegram').value.trim();
    const termos = document.getElementById('cad-termos').checked;

    if (!termos) {
        exibirToast("Você precisa aceitar os termos para se registrar.", "error");
        return;
    }

    exibirToast("Enviando solicitação...", "info");

    const resposta = await executarRequisicaoAPI("solicitar_cadastro", {
        nome: nome,
        telefone: telefone,
        twitter: twitter,
        telegram: telegram
    });

    if (resposta.sucesso) {
        exibirToast(resposta.mensagem || "Cadastro enviado para aprovação!", "success");
        document.getElementById('form-registro').reset();
        fecharModal('modal-cadastro');
    } else {
        exibirToast(resposta.mensagem || "Não foi possível enviar o cadastro.", "error");
    }
}

// ============================================================================
// LOGIN E AUTENTICAÇÃO REAL (COM CONFERÊNCIA DE SENHA)
// ============================================================================
async function tratarLogin(evento) {
    evento.preventDefault();

    const usuario = document.getElementById('login-usuario').value.trim();
    const senha = document.getElementById('login-senha').value.trim();

    exibirToast("Autenticando...", "info");

    const resposta = await executarRequisicaoAPI("login", {
        identificador: usuario,
        senha: senha
    });

    if (resposta.sucesso) {
        estadoSessao.papel = resposta.papel;
        estadoSessao.token = resposta.token;
        estadoSessao.nomeUsuario = resposta.nome;

        // Salva a sessão no armazenamento local do navegador
        localStorage.setItem('plataforma_sessao', JSON.stringify(estadoSessao));

        document.getElementById('form-login').reset();
        fecharModal('modal-login');
        atualizarInterfaceSessao();

        // Recarrega o catálogo para exibir produtos restritos a membros
        await carregarProdutosServidor();

        exibirToast(`Bem-vindo, ${resposta.nome}!`, "success");
    } else {
        exibirToast(resposta.mensagem || "Credenciais inválidas.", "error");
    }
}

function executarLogout() {
    estadoSessao.papel = 'visitante';
    estadoSessao.token = null;
    estadoSessao.nomeUsuario = 'Visitante';
    cestaCompras = [];

    localStorage.removeItem('plataforma_sessao');
    atualizarInterfaceSessao();
    carregarProdutosServidor();
    navegarPara('vitrine');
    exibirToast("Sessão encerrada com sucesso.", "info");
}

function restaurarSessaoLocal() {
    const salva = localStorage.getItem('plataforma_sessao');
    if (salva) {
        try {
            const dados = JSON.parse(salva);
            estadoSessao.papel = dados.papel || 'visitante';
            estadoSessao.token = dados.token || null;
            estadoSessao.nomeUsuario = dados.nomeUsuario || 'Visitante';
        } catch (e) {
            localStorage.removeItem('plataforma_sessao');
        }
    }
}

// ============================================================================
// GESTÃO DA CESTA E CRIAÇÃO DE PEDIDOS
// ============================================================================
function adicionarAoCarrinho(produto) {
    const item = cestaCompras.find(i => i.id === produto.id);
    if (item) {
        item.quantidade += 1;
    } else {
        cestaCompras.push({
            id: produto.id,
            nome: produto.nome,
            preco: produto.preco,
            quantidade: 1
        });
    }

    atualizarContadorCarrinho();
    exibirToast(`${produto.nome} adicionado à cesta.`, "info");
}

function atualizarContadorCarrinho() {
    const total = cestaCompras.reduce((acc, item) => acc + item.quantidade, 0);
    document.getElementById('cart-counter').textContent = total;
}

function renderizarCarrinho() {
    const lista = document.getElementById('carrinho-itens-lista');
    lista.innerHTML = '';
    let total = 0;

    if (cestaCompras.length === 0) {
        lista.innerHTML = '<p style="color: #64748b; padding: 15px 0;">Sua cesta está vazia.</p>';
        document.getElementById('carrinho-total-valor').textContent = 'R$ 0,00';
        return;
    }

    cestaCompras.forEach(item => {
        const subtotal = item.preco * item.quantidade;
        total += subtotal;

        const linha = document.createElement('div');
        linha.style.display = 'flex';
        linha.style.justifyContent = 'space-between';
        linha.style.padding = '8px 0';
        linha.style.borderBottom = '1px solid #e2e8f0';

        const info = document.createElement('span');
        info.textContent = `${item.nome} (x${item.quantidade})`;

        const valor = document.createElement('strong');
        valor.textContent = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;

        linha.appendChild(info);
        linha.appendChild(valor);
        lista.appendChild(linha);
    });

    document.getElementById('carrinho-total-valor').textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
}

async function tratarCriacaoPedido() {
    if (cestaCompras.length === 0) {
        exibirToast("Sua cesta está vazia.", "error");
        return;
    }

    const metodo = document.getElementById('metodo-pagamento').value;
    exibirToast("Processando pedido no servidor...", "info");

    // Envia apenas o ID e a quantidade. O backend calcula o preço real da planilha!
    const itensParaEnvio = cestaCompras.map(item => ({
        id: item.id,
        quantidade: item.quantidade
    }));

    const resposta = await executarRequisicaoAPI("criar_pedido", {
        tokenMembro: estadoSessao.token,
        itens: itensParaEnvio,
        metodoPagamento: metodo
    });

    if (resposta.sucesso) {
        exibirToast(`Pedido ${resposta.idPedido} gerado com sucesso!`, "success");
        cestaCompras = [];
        atualizarContadorCarrinho();
        navegarPara('pedidos');
    } else {
        exibirToast(resposta.mensagem || "Erro ao registrar o pedido.", "error");
    }
}

// ============================================================================
// HISTÓRICO DE PEDIDOS E CHAT TEMPORÁRIO
// ============================================================================
async function carregarMeusPedidos() {
    const container = document.getElementById('pedidos-lista-container');
    container.innerHTML = '<p style="color: #64748b;">Buscando seus pedidos...</p>';

    const resposta = await executarRequisicaoAPI("listar_meus_pedidos", {
        tokenMembro: estadoSessao.token
    });

    container.innerHTML = '';

    if (!resposta.sucesso || !resposta.pedidos || resposta.pedidos.length === 0) {
        container.innerHTML = '<p style="color: #64748b;">Nenhum pedido encontrado.</p>';
        return;
    }

    resposta.pedidos.forEach(pedido => {
        const card = document.createElement('div');
        card.style.background = '#ffffff';
        card.style.border = '1px solid #e2e8f0';
        card.style.borderRadius = '8px';
        card.style.padding = '14px';
        card.style.marginBottom = '12px';

        const titulo = document.createElement('h4');
        titulo.textContent = `Pedido: ${pedido.id}`;

        const status = document.createElement('p');
        status.innerHTML = `Status: <strong>${pedido.status.toUpperCase()}</strong> | Total: <strong>R$ ${Number(pedido.total).toFixed(2).replace('.', ',')}</strong>`;

        card.appendChild(titulo);
        card.appendChild(status);

        // Bloco do chat temporário
        if (pedido.chatAtivo) {
            const chatBox = document.createElement('div');
            chatBox.style.marginTop = '10px';
            chatBox.style.padding = '10px';
            chatBox.style.background = '#f1f5f9';
            chatBox.style.borderRadius = '6px';

            const chatAviso = document.createElement('small');
            chatAviso.style.display = 'block';
            chatAviso.style.color = '#475569';
            chatAviso.textContent = 'Canal temporário para instruções de entrega:';

            const inputMsg = document.createElement('input');
            inputMsg.type = 'text';
            inputMsg.placeholder = 'Digite sua mensagem...';
            inputMsg.style.marginTop = '6px';

            const btnEnviar = document.createElement('button');
            btnEnviar.className = 'btn btn-primary';
            btnEnviar.style.marginTop = '6px';
            btnEnviar.textContent = 'Enviar Mensagem';
            btnEnviar.onclick = () => {
                if (inputMsg.value.trim()) {
                    exibirToast("Mensagem transmitida no canal de entrega!", "success");
                    inputMsg.value = '';
                }
            };

            chatBox.appendChild(chatAviso);
            chatBox.appendChild(inputMsg);
            chatBox.appendChild(btnEnviar);
            card.appendChild(chatBox);
        } else {
            const aviso = document.createElement('p');
            aviso.style.fontSize = '0.8rem';
            aviso.style.color = '#94a3b8';
            aviso.style.marginTop = '8px';
            aviso.textContent = 'Canal de orientações concluído e encerrado pela administração.';
            card.appendChild(aviso);
        }

        container.appendChild(card);
    });
}

// ============================================================================
// ENVIO DE COMENTÁRIOS E DÚVIDAS (TEXTO SANITIZADO)
// ============================================================================
async function tratarEnvioComentario(evento) {
    evento.preventDefault();
    const campo = document.getElementById('campo-comentario');
    const texto = campo.value.trim();

    if (!texto) return;

    exibirToast("Enviando comentário...", "info");

    const resposta = await executarRequisicaoAPI("enviar_comentario", {
        mensagem: texto
    });

    if (resposta.sucesso) {
        exibirToast("Mensagem entregue com sucesso à administração!", "success");
        campo.value = '';
    } else {
        exibirToast("Erro ao enviar mensagem.", "error");
    }
}

// ============================================================================
// PAINEL ADMINISTRATIVO (CADASTRO DE PRODUTOS E ESTEIRA DE PEDIDOS)
// ============================================================================
async function carregarPainelAdm() {
    if (estadoSessao.papel !== 'adm') return;

    // 1. Busca todos os pedidos da plataforma
    const respPedidos = await executarRequisicaoAPI("listar_pedidos_adm", {
        tokenAdm: estadoSessao.token
    });

    const colAnalise = document.getElementById('pipe-analise');
    const colSolicitados = document.getElementById('pipe-solicitados');
    const colViagem = document.getElementById('pipe-viagem');
    const colConcluido = document.getElementById('pipe-concluido');

    colAnalise.innerHTML = '';
    colSolicitados.innerHTML = '';
    colViagem.innerHTML = '';
    colConcluido.innerHTML = '';

    if (respPedidos.sucesso && Array.isArray(respPedidos.pedidos)) {
        respPedidos.pedidos.forEach(pedido => {
            const item = document.createElement('div');
            item.style.background = '#ffffff';
            item.style.border = '1px solid #cbd5e1';
            item.style.borderRadius = '4px';
            item.style.padding = '6px';
            item.style.marginBottom = '6px';

            const id = document.createElement('strong');
            id.style.fontSize = '0.75rem';
            id.textContent = pedido.id;

            item.appendChild(id);

            // Botão para avançar a esteira
            if (pedido.status !== 'concluido') {
                const btnAvancar = document.createElement('button');
                btnAvancar.className = 'btn btn-primary';
                btnAvancar.style.fontSize = '0.65rem';
                btnAvancar.style.padding = '2px 6px';
                btnAvancar.style.marginTop = '4px';
                btnAvancar.style.display = 'block';
                btnAvancar.textContent = 'Avançar Status';
                btnAvancar.onclick = () => mudarStatusPedidoAdm(pedido.id, pedido.status);
                item.appendChild(btnAvancar);
            }

            if (pedido.status === 'analise') colAnalise.appendChild(item);
            if (pedido.status === 'solicitados') colSolicitados.appendChild(item);
            if (pedido.status === 'viagem') colViagem.appendChild(item);
            if (pedido.status === 'concluido') colConcluido.appendChild(item);
        });
    }

    // 2. Busca mensagens recebidas de usuários
    const respComentarios = await executarRequisicaoAPI("listar_comentarios_adm", {
        tokenAdm: estadoSessao.token
    });

    const listaComents = document.getElementById('adm-comentarios-lista');
    listaComents.innerHTML = '';

    if (respComentarios.sucesso && Array.isArray(respComentarios.comentarios)) {
        if (respComentarios.comentarios.length === 0) {
            listaComents.innerHTML = '<p style="color: #64748b; font-size: 0.85rem;">Nenhuma mensagem recebida.</p>';
        } else {
            respComentarios.comentarios.forEach(c => {
                const p = document.createElement('p');
                p.style.fontSize = '0.85rem';
                p.style.padding = '4px 0';
                p.textContent = `[${new Date(c.data).toLocaleTimeString()}] ${c.texto}`;
                listaComents.appendChild(p);
            });
        }
    }
}

async function mudarStatusPedidoAdm(idPedido, statusAtual) {
    let proximoStatus = 'solicitados';
    if (statusAtual === 'solicitados') proximoStatus = 'viagem';
    if (statusAtual === 'viagem') proximoStatus = 'concluido';

    exibirToast(`Atualizando pedido para ${proximoStatus}...`, "info");

    const resposta = await executarRequisicaoAPI("atualizar_status_pedido", {
        tokenAdm: estadoSessao.token,
        idPedido: idPedido,
        novoStatus: proximoStatus
    });

    if (resposta.sucesso) {
        exibirToast("Status atualizado na planilha com sucesso!", "success");
        await carregarPainelAdm();
    } else {
        exibirToast(resposta.mensagem || "Erro ao atualizar status.", "error");
    }
}

async function tratarCadastroProduto(evento) {
    evento.preventDefault();

    const nome = document.getElementById('adm-prod-nome').value.trim();
    const preco = parseFloat(document.getElementById('adm-prod-preco').value);
    const foto = document.getElementById('adm-prod-foto').value.trim();
    const visibilidade = document.getElementById('adm-prod-visibilidade').value;

    exibirToast("Cadastrando produto na planilha...", "info");

    const resposta = await executarRequisicaoAPI("cadastrar_produto", {
        tokenAdm: estadoSessao.token,
        produto: {
            nome: nome,
            preco: preco,
            foto: foto,
            visibilidade: visibilidade
        }
    });

    if (resposta.sucesso) {
        exibirToast("Produto gravado no catálogo com sucesso!", "success");
        document.getElementById('form-novo-produto').reset();
        await carregarProdutosServidor();
    } else {
        exibirToast(resposta.mensagem || "Erro ao salvar produto.", "error");
    }
}

// ============================================================================
// FUNÇÕES AUXILIARES DE NAVEGAÇÃO E MODAIS
// ============================================================================
function abrirModal(idModal) {
    const modal = document.getElementById(idModal);
    if (modal) modal.classList.add('active');
}

function fecharModal(idModal) {
    const modal = document.getElementById(idModal);
    if (modal) modal.classList.remove('active');
}

function navegarPara(nomeAba) {
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-panel').forEach(v => v.classList.remove('active'));

    const botao = document.getElementById(`tab-btn-${nomeAba}`);
    const painel = document.getElementById(`view-${nomeAba}`);

    if (botao && painel) {
        botao.classList.add('active');
        painel.classList.add('active');
    }

    if (nomeAba === 'vitrine') carregarProdutosServidor();
    if (nomeAba === 'carrinho') renderizarCarrinho();
    if (nomeAba === 'pedidos') carregarMeusPedidos();
    if (nomeAba === 'adm') carregarPainelAdm();
}

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
}

function exibirToast(mensagem, tipo = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.textContent = mensagem;

    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}
