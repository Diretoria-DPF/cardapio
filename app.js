/**
 * ============================================================================
 * APP.JS - LÓGICA DE INTERFACE, NAVEGAÇÃO E REGRAS DE NEGÓCIO ATUALIZADAS
 * ============================================================================
 */

// URL DA SUA API GOOGLE APPS SCRIPT (TERMINADA EM /exec)
const URL_BACKEND_APPS_SCRIPT = "https://script.google.com/macros/s/AKfycbwKauAHD750szLBBLDflruitYtNZwLgYYGOLzIHUCLCUCAcQzyrPouTFQBKwGDzYUpP/exec";

const estadoSessao = {
    papel: 'visitante',          // 'visitante' | 'membro' | 'adm'
    token: null,
    nomeUsuario: 'Visitante'
};

let cestaCompras = [];
let catalogoProdutos = [];
let identificadorEmTentativa = ""; // Armazena o identificador caso precise de desbloqueio

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verifica se a página foi aberta com um Link Temporário com Token
    await verificarTokenUrl();

    // 2. Restaura a sessão anterior do usuário se existir
    restaurarSessaoLocal();

    // 3. Atualiza as abas visíveis de acordo com o perfil
    atualizarInterfaceSessao();

    // 4. Carrega os produtos da vitrine
    await carregarProdutosServidor();
});

/**
 * VERIFICAÇÃO DO LINK TEMPORÁRIO COM TOKEN NA URL (?token=XYZ)
 */
async function verificarTokenUrl() {
  const parametros = new URLSearchParams(window.location.search);
  const tokenAcesso = parametros.get('token');

  if (tokenAcesso) {
    exibirToast("Validando token temporário de acesso...", "info");
    try {
      const resp = await fetch(`${URL_BACKEND_APPS_SCRIPT}?acao=validar_link&tokenAcesso=${encodeURIComponent(tokenAcesso)}`);
      const res = await resp.json();

      if (res.valido) {
        exibirToast("Link temporário autorizado!", "success");
      } else {
        exibirToast(res.mensagem || "Link temporário expirado ou inválido.", "error");
      }
    } catch (e) {
      console.error(e);
    }
  }
}

/**
 * FUNÇÃO CENTRAL DE COMUNICAÇÃO COM O BACKEND
 */
async function executarRequisicaoAPI(acao, dadosExtras = {}) {
    if (URL_BACKEND_APPS_SCRIPT.includes("SEU_ID_DO_SCRIPT_AQUI")) {
        exibirToast("Configure a URL do backend no topo do app.js.", "error");
        return { sucesso: false };
    }

    try {
        const resposta = await fetch(URL_BACKEND_APPS_SCRIPT, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ acao: acao, ...dadosExtras })
        });
        return await resposta.json();
    } catch (erro) {
        console.error("Erro API:", erro);
        exibirToast("Falha de comunicação com o servidor.", "error");
        return { sucesso: false };
    }
}

/**
 * GESTÃO DAS ABAS CONFORME O PAPEL (VISITANTE, MEMBRO, ADM)
 */
function atualizarInterfaceSessao() {
    const badge = document.getElementById('role-badge');
    const anonBox = document.getElementById('anon-buttons');
    const authBox = document.getElementById('auth-buttons');
    const userLabel = document.getElementById('user-display-name');

    // Abas de Membros
    const tabCarrinho = document.getElementById('tab-btn-carrinho');
    const tabMeusPedidos = document.getElementById('tab-btn-meus-pedidos');

    // Abas de ADM
    const tabNovoProduto = document.getElementById('tab-btn-novo-produto');
    const tabPedidosAdm = document.getElementById('tab-btn-pedidos-adm');
    const tabAdm = document.getElementById('tab-btn-adm');

    badge.textContent = estadoSessao.papel.toUpperCase();
    badge.className = `badge badge-${estadoSessao.papel}`;

    if (estadoSessao.papel === 'visitante') {
        anonBox.style.display = 'flex';
        authBox.style.display = 'none';

        tabCarrinho.style.display = 'none';
        tabMeusPedidos.style.display = 'none';
        tabNovoProduto.style.display = 'none';
        tabPedidosAdm.style.display = 'none';
        tabAdm.style.display = 'none';
    } else if (estadoSessao.papel === 'membro') {
        anonBox.style.display = 'none';
        authBox.style.display = 'flex';
        userLabel.textContent = `Olá, ${estadoSessao.nomeUsuario}`;

        // Membro tem cesta e meus pedidos
        tabCarrinho.style.display = 'inline-block';
        tabMeusPedidos.style.display = 'inline-block';

        // Oculta abas de ADM
        tabNovoProduto.style.display = 'none';
        tabPedidosAdm.style.display = 'none';
        tabAdm.style.display = 'none';
    } else if (estadoSessao.papel === 'adm') {
        anonBox.style.display = 'none';
        authBox.style.display = 'flex';
        userLabel.textContent = `ADM: ${estadoSessao.nomeUsuario}`;

        // ADM NÃO TEM CESTA DE COMPRAS
        tabCarrinho.style.display = 'none';
        tabMeusPedidos.style.display = 'none';

        // ADM TEM ABAS DEDICADAS
        tabNovoProduto.style.display = 'inline-block';
        tabPedidosAdm.style.display = 'inline-block';
        tabAdm.style.display = 'inline-block';
    }
}

function navegarPara(nomeAba) {
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-panel').forEach(v => v.classList.remove('active'));

    const btn = document.getElementById(`tab-btn-${nomeAba}`);
    const painel = document.getElementById(`view-${nomeAba}`);

    if (btn && painel) {
        btn.classList.add('active');
        painel.classList.add('active');
    }

    if (nomeAba === 'vitrine') carregarProdutosServidor();
    if (nomeAba === 'carrinho') renderizarCarrinho();
    if (nomeAba === 'meus-pedidos') carregarMeusPedidos();
    if (nomeAba === 'pedidos-adm') carregarPedidosAdm();
    if (nomeAba === 'adm') carregarPainelCentralAdm();
}

/**
 * CADASTRO COM SENHA CRIPTOGRAFADA
 */
async function tratarSolicitacaoCadastro(e) {
    e.preventDefault();

    const nome = document.getElementById('cad-nome').value.trim();
    const telefone = document.getElementById('cad-telefone').value.trim();
    const senha = document.getElementById('cad-senha').value;
    const senhaConf = document.getElementById('cad-senha-conf').value;
    const twitter = document.getElementById('cad-twitter').value.trim();
    const telegram = document.getElementById('cad-telegram').value.trim();

    if (senha !== senhaConf) {
        exibirToast("As senhas digitadas não coincidem.", "error");
        return;
    }

    exibirToast("Enviando solicitação com senha criptografada...", "info");

    const res = await executarRequisicaoAPI("solicitar_cadastro", {
        nome: nome,
        telefone: telefone,
        senha: senha,
        twitter: twitter,
        telegram: telegram
    });

    if (res.sucesso) {
        exibirToast(res.mensagem, "success");
        document.getElementById('form-registro').reset();
        fecharModal('modal-cadastro');
    } else {
        exibirToast(res.mensagem || "Erro ao registrar.", "error");
    }
}

/**
 * LOGIN COM TRATAMENTO DE RATE LIMIT
 */
async function tratarLogin(e) {
    e.preventDefault();

    const usuario = document.getElementById('login-usuario').value.trim();
    const senha = document.getElementById('login-senha').value;
    identificadorEmTentativa = usuario;

    exibirToast("Autenticando...", "info");

    const res = await executarRequisicaoAPI("login", {
        identificador: usuario,
        senha: senha
    });

    if (res.sucesso) {
        estadoSessao.papel = res.papel;
        estadoSessao.token = res.token;
        estadoSessao.nomeUsuario = res.nome;

        localStorage.setItem('plataforma_sessao', JSON.stringify(estadoSessao));
        document.getElementById('form-login').reset();
        document.getElementById('box-desbloqueio-conta').style.display = 'none';
        fecharModal('modal-login');
        atualizarInterfaceSessao();
        await carregarProdutosServidor();

        exibirToast(`Bem-vindo, ${res.nome}!`, "success");
    } else {
        exibirToast(res.mensagem, "error");

        // Se atingiu o bloqueio de 6 tentativas, exibe o botão de pedir liberação
        if (res.requerLiberacaoAdm) {
            document.getElementById('box-desbloqueio-conta').style.display = 'block';
            if (res.solicitouDesbloqueio) {
                document.getElementById('btn-solicitar-desbloqueio').disabled = true;
                document.getElementById('btn-solicitar-desbloqueio').textContent = "Solicitação já enviada ao ADM";
            }
        }
    }
}

async function enviarPedidoDesbloqueio() {
    if (!identificadorEmTentativa) return;
    exibirToast("Enviando pedido de desbloqueio...", "info");

    const res = await executarRequisicaoAPI("pedir_desbloqueio", {
        identificador: identificadorEmTentativa
    });

    if (res.sucesso) {
        exibirToast(res.mensagem, "success");
        const btn = document.getElementById('btn-solicitar-desbloqueio');
        btn.disabled = true;
        btn.textContent = "Solicitação enviada. Aguarde o ADM.";
    } else {
        exibirToast(res.mensagem, "error");
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
    exibirToast("Sessão encerrada.", "info");
}

function restaurarSessaoLocal() {
    const salva = localStorage.getItem('plataforma_sessao');
    if (salva) {
        try {
            const d = JSON.parse(salva);
            estadoSessao.papel = d.papel || 'visitante';
            estadoSessao.token = d.token || null;
            estadoSessao.nomeUsuario = d.nomeUsuario || 'Visitante';
        } catch (e) {
            localStorage.removeItem('plataforma_sessao');
        }
    }
}

/**
 * VITRINE DE PRODUTOS
 */
async function carregarProdutosServidor() {
    const grid = document.getElementById('produtos-container');
    grid.innerHTML = '<p style="color: #64748b;">Carregando vitrine...</p>';

    let url = `${URL_BACKEND_APPS_SCRIPT}?acao=listar_produtos`;
    if (estadoSessao.token) url += `&token=${encodeURIComponent(estadoSessao.token)}`;

    try {
        const resp = await fetch(url);
        const res = await resp.json();
        if (res.sucesso && Array.isArray(res.produtos)) {
            catalogoProdutos = res.produtos;
            renderizarVitrine();
        }
    } catch (e) {
        grid.innerHTML = '<p style="color: #ef4444;">Erro ao carregar catálogo.</p>';
    }
}

function renderizarVitrine() {
    const grid = document.getElementById('produtos-container');
    grid.innerHTML = '';

    catalogoProdutos.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';

        const img = document.createElement('img');
        img.className = 'product-thumb';
        img.src = p.foto;
        img.alt = p.nome;

        const body = document.createElement('div');
        body.className = 'product-details';

        const t = document.createElement('h3');
        t.className = 'product-name';
        t.textContent = p.nome;

        const pr = document.createElement('p');
        pr.className = 'product-price';
        pr.textContent = `R$ ${p.preco.toFixed(2).replace('.', ',')}`;

        body.appendChild(t);
        body.appendChild(pr);

        if (estadoSessao.papel === 'membro') {
            const btn = document.createElement('button');
            btn.className = 'btn btn-primary btn-block';
            btn.textContent = 'Adicionar à Cesta';
            btn.onclick = () => adicionarAoCarrinho(p);
            body.appendChild(btn);
        } else if (estadoSessao.papel === 'adm') {
            const aviso = document.createElement('small');
            aviso.style.color = '#ef4444';
            aviso.textContent = `Item ${p.visibilidade.toUpperCase()}`;
            body.appendChild(aviso);
        } else {
            const aviso = document.createElement('small');
            aviso.className = 'visitor-note';
            aviso.textContent = 'Cadastre-se para comprar';
            body.appendChild(aviso);
        }

        card.appendChild(img);
        card.appendChild(body);
        grid.appendChild(card);
    });
}

/**
 * CARRINHO E CRIAÇÃO DE PEDIDOS (EXCLUSIVO MEMBRO)
 */
function adicionarAoCarrinho(p) {
    const it = cestaCompras.find(i => i.id === p.id);
    if (it) it.quantidade += 1;
    else cestaCompras.push({ id: p.id, nome: p.nome, preco: p.preco, quantidade: 1 });

    const total = cestaCompras.reduce((acc, i) => acc + i.quantidade, 0);
    document.getElementById('cart-counter').textContent = total;
    exibirToast(`${p.nome} colocado na cesta.`, "info");
}

function renderizarCarrinho() {
    const lista = document.getElementById('carrinho-itens-lista');
    lista.innerHTML = '';
    let tot = 0;

    if (cestaCompras.length === 0) {
        lista.innerHTML = '<p style="color: #64748b;">Sua cesta está vazia.</p>';
        document.getElementById('carrinho-total-valor').textContent = 'R$ 0,00';
        return;
    }

    cestaCompras.forEach(i => {
        const sub = i.preco * i.quantidade;
        tot += sub;
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.padding = '8px 0';
        row.innerHTML = `<span>${i.nome} (x${i.quantidade})</span><strong>R$ ${sub.toFixed(2).replace('.', ',')}</strong>`;
        lista.appendChild(row);
    });

    document.getElementById('carrinho-total-valor').textContent = `R$ ${tot.toFixed(2).replace('.', ',')}`;
}

async function tratarCriacaoPedido() {
    if (cestaCompras.length === 0) return;
    const metodo = document.getElementById('metodo-pagamento').value;
    exibirToast("Registrando pedido seguro...", "info");

    const res = await executarRequisicaoAPI("criar_pedido", {
        tokenMembro: estadoSessao.token,
        itens: cestaCompras.map(i => ({ id: i.id, quantidade: i.quantidade })),
        metodoPagamento: metodo
    });

    if (res.sucesso) {
        exibirToast(`Pedido ${res.idPedido} criado!`, "success");
        cestaCompras = [];
        document.getElementById('cart-counter').textContent = "0";
        navegarPara('meus-pedidos');
    } else {
        exibirToast(res.mensagem || "Erro ao pedir.", "error");
    }
}

/**
 * MEUS PEDIDOS (MEMBRO)
 */
async function carregarMeusPedidos() {
    const box = document.getElementById('meus-pedidos-container');
    box.innerHTML = '<p style="color: #64748b;">Buscando seus pedidos...</p>';

    const res = await executarRequisicaoAPI("listar_meus_pedidos", { tokenMembro: estadoSessao.token });
    box.innerHTML = '';

    if (!res.sucesso || !res.pedidos || res.pedidos.length === 0) {
        box.innerHTML = '<p style="color: #64748b;">Nenhum pedido encontrado.</p>';
        return;
    }

    res.pedidos.forEach(p => {
        const card = document.createElement('div');
        card.className = 'adm-card';
        card.innerHTML = `
            <h4>Pedido: ${p.id}</h4>
            <p>Status: <strong>${p.status.toUpperCase()}</strong> | Total: <strong>R$ ${p.total.toFixed(2).replace('.', ',')}</strong></p>
            <p>Forma: ${p.metodo}</p>
            ${p.chatAtivo ? `
                <div style="margin-top: 10px; background: #f1f5f9; padding: 10px; border-radius: 6px;">
                    <small>Chat temporário sobre a entrega:</small>
                    <input type="text" placeholder="Digite uma dúvida..." style="margin-top: 5px;">
                    <button class="btn btn-primary" onclick="exibirToast('Mensagem enviada no chat!', 'success')">Enviar</button>
                </div>
            ` : '<p><small style="color: #94a3b8;">Chat temporário encerrado.</small></p>'}
        `;
        box.appendChild(card);
    });
}

/**
 * CADASTRAR NOVO PRODUTO NA VITRINE (EXCLUSIVO ADM)
 */
async function tratarCadastroProduto(e) {
    e.preventDefault();

    const nome = document.getElementById('adm-prod-nome').value.trim();
    const preco = parseFloat(document.getElementById('adm-prod-preco').value);
    const foto = document.getElementById('adm-prod-foto').value.trim();
    const visibilidade = document.getElementById('adm-prod-visibilidade').value;

    exibirToast("Cadastrando produto...", "info");

    const res = await executarRequisicaoAPI("cadastrar_produto", {
        tokenAdm: estadoSessao.token,
        produto: { nome, preco, foto, visibilidade }
    });

    if (res.sucesso) {
        exibirToast("Produto adicionado ao catálogo!", "success");
        document.getElementById('form-novo-produto').reset();
        await carregarProdutosServidor();
    } else {
        exibirToast(res.mensagem, "error");
    }
}

/**
 * ESTEIRA GERAL DE PEDIDOS (EXCLUSIVO ADM)
 */
async function carregarPedidosAdm() {
    const res = await executarRequisicaoAPI("listar_pedidos_adm", { tokenAdm: estadoSessao.token });

    const cAnalise = document.getElementById('pipe-analise');
    const cSolic = document.getElementById('pipe-solicitados');
    const cViagem = document.getElementById('pipe-viagem');
    const cConc = document.getElementById('pipe-concluido');

    cAnalise.innerHTML = '';
    cSolic.innerHTML = '';
    cViagem.innerHTML = '';
    cConc.innerHTML = '';

    if (res.sucesso && Array.isArray(res.pedidos)) {
        res.pedidos.forEach(p => {
            const div = document.createElement('div');
            div.style.background = '#fff';
            div.style.padding = '6px';
            div.style.marginBottom = '6px';
            div.style.borderRadius = '4px';
            div.style.border = '1px solid #cbd5e1';

            div.innerHTML = `<small><strong>${p.id}</strong></small><br><small>R$ ${p.total.toFixed(2)}</small>`;

            if (p.status !== 'concluido') {
                const btn = document.createElement('button');
                btn.className = 'btn btn-primary';
                btn.style.fontSize = '0.65rem';
                btn.style.padding = '2px 6px';
                btn.style.marginTop = '4px';
                btn.textContent = 'Avançar Fase';
                btn.onclick = () => avancarStatusAdm(p.id, p.status);
                div.appendChild(btn);
            }

            if (p.status === 'analise') cAnalise.appendChild(div);
            if (p.status === 'solicitados') cSolic.appendChild(div);
            if (p.status === 'viagem') cViagem.appendChild(div);
            if (p.status === 'concluido') cConc.appendChild(div);
        });
    }
}

async function avancarStatusAdm(id, statusAtual) {
    let prox = 'solicitados';
    if (statusAtual === 'solicitados') prox = 'viagem';
    if (statusAtual === 'viagem') prox = 'concluido';

    exibirToast(`Avançando status para ${prox}...`, "info");
    const res = await executarRequisicaoAPI("atualizar_status_pedido", {
        tokenAdm: estadoSessao.token,
        idPedido: id,
        novoStatus: prox
    });

    if (res.sucesso) {
        exibirToast("Status atualizado com sucesso!", "success");
        await carregarPedidosAdm();
    }
}

/**
 * PAINEL CENTRAL DO ADM: MÉTRICAS, LINKS COM TOKEN E LIBERAÇÕES
 */
async function carregarPainelCentralAdm() {
    if (estadoSessao.papel !== 'adm') return;

    // 1. Carrega Métricas de Vendas
    const resMetricas = await executarRequisicaoAPI("obter_metricas_vendas", { tokenAdm: estadoSessao.token });
    if (resMetricas.sucesso) {
        document.getElementById('metric-faturamento').textContent = `R$ ${resMetricas.faturamentoTotal.toFixed(2).replace('.', ',')}`;
        document.getElementById('metric-pedidos').textContent = resMetricas.totalPedidos;

        const divTabela = document.getElementById('tabela-metricas-produtos');
        if (resMetricas.itensDetalhados.length === 0) {
            divTabela.innerHTML = '<p style="color: #64748b; font-size: 0.8rem;">Nenhum item vendido ainda.</p>';
        } else {
            let html = '<table class="tabela-metricas"><thead><tr><th>Produto</th><th>Qtd Vendida</th></tr></thead><tbody>';
            resMetricas.itensDetalhados.forEach(it => {
                html += `<tr><td>${it.nome}</td><td><strong>${it.quantidadeVendida} un</strong></td></tr>`;
            });
            html += '</tbody></table>';
            divTabela.innerHTML = html;
        }
    }

    // 2. Carrega Solicitações de Novos Membros
    const resSolic = await executarRequisicaoAPI("listar_solicitacoes_adm", { tokenAdm: estadoSessao.token });
    const divSolic = document.getElementById('adm-solicitacoes-lista');
    divSolic.innerHTML = '';

    if (resSolic.sucesso && resSolic.solicitacoes.length > 0) {
        resSolic.solicitacoes.forEach(s => {
            const row = document.createElement('div');
            row.style.padding = '8px 0';
            row.style.borderBottom = '1px solid #e2e8f0';
            row.innerHTML = `
                <p><strong>${s.nome}</strong> (${s.telefone}) - Telegram: ${s.telegram}</p>
                <button class="btn btn-success" style="font-size: 0.75rem; padding: 4px 8px; margin-top: 4px;" onclick="aprovarMembroAdm('${s.id}')">Aprovar Cadastro</button>
            `;
            divSolic.appendChild(row);
        });
    } else {
        divSolic.innerHTML = '<p style="color: #64748b; font-size: 0.8rem;">Nenhuma solicitação pendente.</p>';
    }

    // 3. Carrega Contas Bloqueadas Aguardando Liberação
    const resBloq = await executarRequisicaoAPI("listar_bloqueados_adm", { tokenAdm: estadoSessao.token });
    const divBloq = document.getElementById('adm-bloqueados-lista');
    divBloq.innerHTML = '';

    if (resBloq.sucesso && resBloq.contas.length > 0) {
        resBloq.contas.forEach(b => {
            const row = document.createElement('div');
            row.style.padding = '8px 0';
            row.style.borderBottom = '1px solid #e2e8f0';
            row.innerHTML = `
                <p style="color: #b91c1c;"><strong>${b.identificador}</strong> (Erros registrados: ${b.erros})</p>
                <button class="btn btn-primary" style="font-size: 0.75rem; padding: 4px 8px; margin-top: 4px;" onclick="liberarContaUsuarioAdm('${b.identificador}')">Liberar Conta</button>
            `;
            divBloq.appendChild(row);
        });
    } else {
        divBloq.innerHTML = '<p style="color: #64748b; font-size: 0.8rem;">Nenhuma conta bloqueada aguardando aprovação.</p>';
    }

    // 4. Carrega Comentários
    const resComent = await executarRequisicaoAPI("listar_comentarios_adm", { tokenAdm: estadoSessao.token });
    const divCom = document.getElementById('adm-comentarios-lista');
    divCom.innerHTML = '';
    if (resComent.sucesso && resComent.comentarios.length > 0) {
        resComent.comentarios.forEach(c => {
            const p = document.createElement('p');
            p.style.fontSize = '0.8rem';
            p.style.padding = '4px 0';
            p.textContent = `[${new Date(c.data).toLocaleTimeString()}] ${c.texto}`;
            divCom.appendChild(p);
        });
    } else {
        divCom.innerHTML = '<p style="color: #64748b; font-size: 0.8rem;">Nenhum comentário recebido.</p>';
    }
}

async function aprovarMembroAdm(idSolicitacao) {
    exibirToast("Aprovando membro...", "info");
    const res = await executarRequisicaoAPI("aprovar_cadastro", {
        tokenAdm: estadoSessao.token,
        idSolicitacao: idSolicitacao
    });

    if (res.sucesso) {
        exibirToast(res.mensagem, "success");
        await carregarPainelCentralAdm();
    } else {
        exibirToast(res.mensagem, "error");
    }
}

async function liberarContaUsuarioAdm(identificador) {
    exibirToast("Liberando conta do usuário...", "info");
    const res = await executarRequisicaoAPI("liberar_conta_adm", {
        tokenAdm: estadoSessao.token,
        identificador: identificador
    });

    if (res.sucesso) {
        exibirToast(res.mensagem, "success");
        await carregarPainelCentralAdm();
    } else {
        exibirToast(res.mensagem, "error");
    }
}

/**
 * GERADOR DE LINK TEMPORÁRIO COM TOKEN PELO ADM
 */
async function gerarLinkTemporarioAdm() {
    const minutos = document.getElementById('select-duracao-link').value;
    exibirToast("Emitindo link temporário...", "info");

    const res = await executarRequisicaoAPI("gerar_link_temporario", {
        tokenAdm: estadoSessao.token,
        duracaoMinutos: minutos
    });

    if (res.sucesso) {
        const linkCompleto = `${window.location.origin}${window.location.pathname}?token=${res.token}`;
        const campo = document.getElementById('campo-link-gerado');
        campo.value = linkCompleto;
        document.getElementById('area-link-gerado').style.display = 'block';
        exibirToast(res.mensagem, "success");
    } else {
        exibirToast(res.mensagem, "error");
    }
}

/**
 * COMENTÁRIOS E FEEDBACK SEGURO
 */
async function tratarEnvioComentario(e) {
    e.preventDefault();
    const c = document.getElementById('campo-comentario');
    const msg = c.value.trim();
    if (!msg) return;

    exibirToast("Enviando mensagem...", "info");
    const res = await executarRequisicaoAPI("enviar_comentario", { mensagem: msg });
    if (res.sucesso) {
        exibirToast(res.mensagem, "success");
        c.value = '';
    }
}

function abrirModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('active');
}

function fecharModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('active');
}

function exibirToast(msg, tipo = 'info') {
    const cont = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast toast-${tipo}`;
    t.textContent = msg;
    cont.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}
