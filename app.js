/**
 * ============================================================================
 * APP.JS - ALTA VELOCIDADE (CACHE LOCAL), UPLOAD DE FOTOS E CORREÇÕES
 * ============================================================================
 */

// COLE A SUA URL DO WEB APP AQUI:
const URL_BACKEND_APPS_SCRIPT = "https://script.google.com/macros/s/AKfycbwKauAHD750szLBBLDflruitYtNZwLgYYGOLzIHUCLCUCAcQzyrPouTFQBKwGDzYUpP/exec";

// ============================================================================
// 1. SISTEMA DE MEMÓRIA EM CACHE (RESPOSTA INSTANTÂNEA)
// ============================================================================
const CacheLoja = {
    salvar: (chave, dados) => {
        try {
            localStorage.setItem('cache_' + chave, JSON.stringify({
                dados: dados,
                hora: Date.now()
            }));
        } catch (e) {
            console.warn("Espaço de cache excedido:", e);
        }
    },
    obter: (chave) => {
        try {
            const item = localStorage.getItem('cache_' + chave);
            if (!item) return null;
            return JSON.parse(item).dados;
        } catch (e) {
            return null;
        }
    }
};

const estadoSessao = {
    papel: 'visitante',
    token: null,
    nomeUsuario: 'Visitante'
};

let cestaCompras = [];
let catalogoProdutos = [];
let fotoBase64Temporaria = "";
let identificadorEmTentativa = "";

// ============================================================================
// INICIALIZAÇÃO DA PLATAFORMA
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    verificarTokenUrl();
    restaurarSessaoLocal();
    atualizarInterfaceSessao();

    // 1. Carregamento Ultra-rápido: lê do cache imediatamente
    const produtosEmCache = CacheLoja.obter('produtos_' + estadoSessao.papel);
    if (produtosEmCache && produtosEmCache.length > 0) {
        catalogoProdutos = produtosEmCache;
        renderizarVitrine();
    }

    // 2. Sincroniza em segundo plano com a folha de cálculo
    await sincronizarProdutosServidor();
});

/**
 * RESOLUÇÃO DO LINK TEMPORÁRIO (CORRIGIDO PARA LOCAL E GITHUB)
 */
function obterUrlBasePlataforma() {
    // Se for arquivo local file://, devolve o caminho limpo
    let url = window.location.href.split('?')[0];
    return url;
}

async function verificarTokenUrl() {
    const parametros = new URLSearchParams(window.location.search);
    const tokenAcesso = parametros.get('token');

    if (tokenAcesso) {
        exibirToast("Validando token temporário...", "info");
        try {
            const resp = await fetch(`${URL_BACKEND_APPS_SCRIPT}?acao=validar_link&tokenAcesso=${encodeURIComponent(tokenAcesso)}`);
            const res = await resp.json();
            if (res.valido) {
                exibirToast("Acesso temporário concedido pelo Administrador!", "success");
            } else {
                exibirToast(res.mensagem || "Link temporário expirado.", "error");
            }
        } catch (e) {
            console.error(e);
        }
    }
}

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
        console.error("Erro na API:", erro);
        exibirToast("Falha na comunicação com o servidor.", "error");
        return { sucesso: false };
    }
}

// ============================================================================
// PROCESSADOR DE UPLOAD DE FOTOGRAFIA OU GIF LOCAL (COMPRESSÃO NO NAVEGADOR)
// ============================================================================
function processarUploadImagem(evento) {
    const ficheiro = evento.target.files[0];
    if (!ficheiro) return;

    // Se for GIF animado, lemos diretamente sem compressão de canvas para não perder animação
    if (ficheiro.type === "image/gif") {
        if (ficheiro.size > 200 * 1024) { // limite de 200KB para GIFs
            exibirToast("O GIF é muito pesado. Escolha um arquivo de até 200KB.", "error");
            evento.target.value = "";
            return;
        }

        const leitor = new FileReader();
        leitor.onload = function (e) {
            fotoBase64Temporaria = e.target.result;
            exibirPreviewImagem(fotoBase64Temporaria);
        };
        leitor.readAsDataURL(ficheiro);
        return;
    }

    // Para fotos comuns (JPG, PNG, WebP), redimensionamos via Canvas para <35KB
    const leitor = new FileReader();
    leitor.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            const canvas = document.createElement('canvas');
            const MAX_LARGURA = 350;
            const MAX_ALTURA = 350;
            let largura = img.width;
            let altura = img.height;

            if (largura > altura) {
                if (largura > MAX_LARGURA) {
                    altura *= MAX_LARGURA / largura;
                    largura = MAX_LARGURA;
                }
            } else {
                if (altura > MAX_ALTURA) {
                    largura *= MAX_ALTURA / altura;
                    altura = MAX_ALTURA;
                }
            }

            canvas.width = largura;
            canvas.height = altura;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, largura, altura);

            // Gera JPEG otimizado
            fotoBase64Temporaria = canvas.toDataURL('image/jpeg', 0.7);
            exibirPreviewImagem(fotoBase64Temporaria);
        };
        img.src = e.target.result;
    };
    leitor.readAsDataURL(ficheiro);
}

function exibirPreviewImagem(src) {
    const box = document.getElementById('preview-container');
    const img = document.getElementById('img-preview');
    img.src = src;
    box.style.display = 'flex';
    document.getElementById('adm-prod-foto-url').value = ""; // Limpa campo de URL
}

function removerFotoCarregada() {
    fotoBase64Temporaria = "";
    document.getElementById('preview-container').style.display = 'none';
    document.getElementById('adm-prod-arquivo').value = "";
    document.getElementById('img-preview').src = "";
}

// ============================================================================
// CATÁLOGO COM CACHE-FIRST
// ============================================================================
async function sincronizarProdutosServidor() {
    let url = `${URL_BACKEND_APPS_SCRIPT}?acao=listar_produtos`;
    if (estadoSessao.token) url += `&token=${encodeURIComponent(estadoSessao.token)}`;

    try {
        const resp = await fetch(url);
        const res = await resp.json();

        if (res.sucesso && Array.isArray(res.produtos)) {
            catalogoProdutos = res.produtos;
            // Salva na memória do telemóvel/computador
            CacheLoja.salvar('produtos_' + estadoSessao.papel, catalogoProdutos);
            renderizarVitrine();
        }
    } catch (e) {
        console.warn("Modo offline ou falha de rede:", e);
    }
}

function renderizarVitrine() {
    const grid = document.getElementById('produtos-container');
    grid.innerHTML = '';

    if (catalogoProdutos.length === 0) {
        grid.innerHTML = '<p style="color: #64748b;">Nenhum produto visível no momento.</p>';
        return;
    }

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
            aviso.textContent = `Visibilidade: ${p.visibilidade.toUpperCase()}`;
            body.appendChild(aviso);
        } else {
            const aviso = document.createElement('small');
            aviso.className = 'visitor-note';
            aviso.textContent = 'Acesso exclusivo para membros.';
            body.appendChild(aviso);
        }

        card.appendChild(img);
        card.appendChild(body);
        grid.appendChild(card);
    });
}

// ============================================================================
// SOLICITAÇÃO DE CADASTRO COM ATUALIZAÇÃO DO ADM
// ============================================================================
async function tratarSolicitacaoCadastro(e) {
    e.preventDefault();

    const nome = document.getElementById('cad-nome').value.trim();
    const telefone = document.getElementById('cad-telefone').value.trim();
    const senha = document.getElementById('cad-senha').value;
    const senhaConf = document.getElementById('cad-senha-conf').value;
    const twitter = document.getElementById('cad-twitter').value.trim();
    const telegram = document.getElementById('cad-telegram').value.trim();

    if (senha !== senhaConf) {
        exibirToast("As senhas não coincidem.", "error");
        return;
    }

    exibirToast("A enviar solicitação...", "info");

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

// ============================================================================
// GERADOR DE LINK TEMPORÁRIO (TOTALMENTE CORRIGIDO)
// ============================================================================
async function gerarLinkTemporarioAdm() {
    const minutos = document.getElementById('select-duracao-link').value;
    exibirToast("A gerar link com token...", "info");

    const res = await executarRequisicaoAPI("gerar_link_temporario", {
        tokenAdm: estadoSessao.token,
        duracaoMinutos: minutos
    });

    if (res.sucesso) {
        const urlBase = obterUrlBasePlataforma();
        const linkCompleto = `${urlBase}?token=${res.token}`;

        const campo = document.getElementById('campo-link-gerado');
        campo.value = linkCompleto;
        document.getElementById('area-link-gerado').style.display = 'block';

        exibirToast("Link temporário gerado com sucesso!", "success");
    } else {
        exibirToast(res.mensagem || "Falha ao gerar o link.", "error");
    }
}

function copiarLinkGerado() {
    const campo = document.getElementById('campo-link-gerado');
    campo.select();
    navigator.clipboard.writeText(campo.value).then(() => {
        exibirToast("Link copiado para a área de transferência!", "success");
    }).catch(() => {
        // Fallback para navegadores antigos
        document.execCommand("copy");
        exibirToast("Link copiado!", "success");
    });
}

// ============================================================================
// CADASTRO DE NOVO PRODUTO (FOTO DO DISPOSITIVO OU URL)
// ============================================================================
async function tratarCadastroProduto(e) {
    e.preventDefault();

    const nome = document.getElementById('adm-prod-nome').value.trim();
    const preco = parseFloat(document.getElementById('adm-prod-preco').value);
    const visibilidade = document.getElementById('adm-prod-visibilidade').value;
    const urlFoto = document.getElementById('adm-prod-foto-url').value.trim();

    // Prioriza o upload local; se não houver, usa o link digitado
    const fotoFinal = fotoBase64Temporaria || urlFoto || "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400";

    const btn = document.getElementById('btn-salvar-produto');
    btn.disabled = true;
    btn.textContent = "A gravar produto...";
    exibirToast("A guardar produto...", "info");

    const res = await executarRequisicaoAPI("cadastrar_produto", {
        tokenAdm: estadoSessao.token,
        produto: {
            nome: nome,
            preco: preco,
            foto: fotoFinal,
            visibilidade: visibilidade
        }
    });

    btn.disabled = false;
    btn.textContent = "Gravar Produto no Catálogo";

    if (res.sucesso) {
        exibirToast("Produto adicionado com sucesso!", "success");
        document.getElementById('form-novo-produto').reset();
        removerFotoCarregada();
        await sincronizarProdutosServidor();
    } else {
        exibirToast(res.mensagem || "Erro ao salvar.", "error");
    }
}

// ============================================================================
// PAINEL CENTRAL DO ADM: LEITURA GARANTIDA DE SOLICITAÇÕES
// ============================================================================
async function carregarPainelCentralAdm() {
    if (estadoSessao.papel !== 'adm') return;

    const divSolic = document.getElementById('adm-solicitacoes-lista');
    divSolic.innerHTML = '<p style="color: #64748b;">A procurar novos cadastros...</p>';

    // 1. Carrega Solicitações de Novos Membros
    const resSolic = await executarRequisicaoAPI("listar_solicitacoes_adm", { tokenAdm: estadoSessao.token });
    divSolic.innerHTML = '';

    if (resSolic.sucesso && Array.isArray(resSolic.solicitacoes) && resSolic.solicitacoes.length > 0) {
        resSolic.solicitacoes.forEach(s => {
            const row = document.createElement('div');
            row.style.padding = '10px 0';
            row.style.borderBottom = '1px solid #e2e8f0';
            row.innerHTML = `
                <p><strong>${s.nome}</strong> (Login: ${s.telefone}) | Telegram: ${s.telegram}</p>
                <button class="btn btn-success btn-sm" style="margin-top: 5px;" onclick="aprovarMembroAdm('${s.id}')">Aprovar Membro</button>
            `;
            divSolic.appendChild(row);
        });
    } else {
        divSolic.innerHTML = '<p style="color: #64748b; font-size: 0.85rem;">Nenhuma solicitação pendente no momento.</p>';
    }

    // 2. Carrega Métricas de Vendas
    const resMetricas = await executarRequisicaoAPI("obter_metricas_vendas", { tokenAdm: estadoSessao.token });
    if (resMetricas.sucesso) {
        document.getElementById('metric-faturamento').textContent = `R$ ${resMetricas.faturamentoTotal.toFixed(2).replace('.', ',')}`;
        document.getElementById('metric-pedidos').textContent = resMetricas.totalPedidos;

        const divTabela = document.getElementById('tabela-metricas-produtos');
        if (resMetricas.itensDetalhados.length === 0) {
            divTabela.innerHTML = '<p style="color: #64748b; font-size: 0.8rem;">Sem vendas registadas ainda.</p>';
        } else {
            let html = '<table class="tabela-metricas"><thead><tr><th>Produto</th><th>Qtd</th></tr></thead><tbody>';
            resMetricas.itensDetalhados.forEach(it => {
                html += `<tr><td>${it.nome}</td><td><strong>${it.quantidadeVendida} un</strong></td></tr>`;
            });
            html += '</tbody></table>';
            divTabela.innerHTML = html;
        }
    }

    // 3. Contas Bloqueadas
    const resBloq = await executarRequisicaoAPI("listar_bloqueados_adm", { tokenAdm: estadoSessao.token });
    const divBloq = document.getElementById('adm-bloqueados-lista');
    divBloq.innerHTML = '';
    if (resBloq.sucesso && resBloq.contas.length > 0) {
        resBloq.contas.forEach(b => {
            const row = document.createElement('div');
            row.style.padding = '6px 0';
            row.innerHTML = `
                <p style="color: #b91c1c;"><strong>${b.identificador}</strong> (${b.erros} falhas)</p>
                <button class="btn btn-primary btn-sm" onclick="liberarContaUsuarioAdm('${b.identificador}')">Liberar Conta</button>
            `;
            divBloq.appendChild(row);
        });
    } else {
        divBloq.innerHTML = '<p style="color: #64748b; font-size: 0.8rem;">Nenhuma conta bloqueada.</p>';
    }

    // 4. Comentários
    const resComent = await executarRequisicaoAPI("listar_comentarios_adm", { tokenAdm: estadoSessao.token });
    const divCom = document.getElementById('adm-comentarios-lista');
    divCom.innerHTML = '';
    if (resComent.sucesso && resComent.comentarios.length > 0) {
        resComent.comentarios.forEach(c => {
            const p = document.createElement('p');
            p.style.fontSize = '0.8rem';
            p.textContent = `[${new Date(c.data).toLocaleTimeString()}] ${c.texto}`;
            divCom.appendChild(p);
        });
    } else {
        divCom.innerHTML = '<p style="color: #64748b; font-size: 0.8rem;">Sem mensagens.</p>';
    }
}

async function aprovarMembroAdm(idSolicitacao) {
    exibirToast("A aprovar membro...", "info");
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

async function liberarContaUsuarioAdm(id) {
    const res = await executarRequisicaoAPI("liberar_conta_adm", { tokenAdm: estadoSessao.token, identificador: id });
    if (res.sucesso) {
        exibirToast(res.mensagem, "success");
        await carregarPainelCentralAdm();
    }
}

// ============================================================================
// NAVEGAÇÃO, AUTENTICAÇÃO E PEDIDOS
// ============================================================================
function navegarPara(nomeAba) {
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-panel').forEach(v => v.classList.remove('active'));

    const btn = document.getElementById(`tab-btn-${nomeAba}`);
    const painel = document.getElementById(`view-${nomeAba}`);

    if (btn && painel) {
        btn.classList.add('active');
        painel.classList.add('active');
    }

    if (nomeAba === 'vitrine') sincronizarProdutosServidor();
    if (nomeAba === 'carrinho') renderizarCarrinho();
    if (nomeAba === 'meus-pedidos') carregarMeusPedidos();
    if (nomeAba === 'pedidos-adm') carregarPedidosAdm();
    if (nomeAba === 'adm') carregarPainelCentralAdm();
}

function atualizarInterfaceSessao() {
    const badge = document.getElementById('role-badge');
    const anonBox = document.getElementById('anon-buttons');
    const authBox = document.getElementById('auth-buttons');
    const userLabel = document.getElementById('user-display-name');

    const tabCarrinho = document.getElementById('tab-btn-carrinho');
    const tabMeusPedidos = document.getElementById('tab-btn-meus-pedidos');
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
        tabCarrinho.style.display = 'inline-block';
        tabMeusPedidos.style.display = 'inline-block';
        tabNovoProduto.style.display = 'none';
        tabPedidosAdm.style.display = 'none';
        tabAdm.style.display = 'none';
    } else if (estadoSessao.papel === 'adm') {
        anonBox.style.display = 'none';
        authBox.style.display = 'flex';
        userLabel.textContent = `ADM: ${estadoSessao.nomeUsuario}`;
        tabCarrinho.style.display = 'none';
        tabMeusPedidos.style.display = 'none';
        tabNovoProduto.style.display = 'inline-block';
        tabPedidosAdm.style.display = 'inline-block';
        tabAdm.style.display = 'inline-block';
    }
}

async function tratarLogin(e) {
    e.preventDefault();
    const usuario = document.getElementById('login-usuario').value.trim();
    const senha = document.getElementById('login-senha').value;
    identificadorEmTentativa = usuario;

    exibirToast("A autenticar...", "info");
    const res = await executarRequisicaoAPI("login", { identificador: usuario, senha: senha });

    if (res.sucesso) {
        estadoSessao.papel = res.papel;
        estadoSessao.token = res.token;
        estadoSessao.nomeUsuario = res.nome;

        localStorage.setItem('plataforma_sessao', JSON.stringify(estadoSessao));
        document.getElementById('form-login').reset();
        document.getElementById('box-desbloqueio-conta').style.display = 'none';
        fecharModal('modal-login');
        atualizarInterfaceSessao();
        await sincronizarProdutosServidor();
        exibirToast(`Bem-vindo, ${res.nome}!`, "success");
    } else {
        exibirToast(res.mensagem, "error");
        if (res.requerLiberacaoAdm) {
            document.getElementById('box-desbloqueio-conta').style.display = 'block';
        }
    }
}

async function enviarPedidoDesbloqueio() {
    if (!identificadorEmTentativa) return;
    const res = await executarRequisicaoAPI("pedir_desbloqueio", { identificador: identificadorEmTentativa });
    if (res.sucesso) {
        exibirToast(res.mensagem, "success");
        document.getElementById('btn-solicitar-desbloqueio').disabled = true;
    }
}

function executarLogout() {
    estadoSessao.papel = 'visitante';
    estadoSessao.token = null;
    estadoSessao.nomeUsuario = 'Visitante';
    cestaCompras = [];

    localStorage.removeItem('plataforma_sessao');
    atualizarInterfaceSessao();
    sincronizarProdutosServidor();
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

function adicionarAoCarrinho(p) {
    const it = cestaCompras.find(i => i.id === p.id);
    if (it) it.quantidade += 1;
    else cestaCompras.push({ id: p.id, nome: p.nome, preco: p.preco, quantidade: 1 });

    const total = cestaCompras.reduce((acc, i) => acc + i.quantidade, 0);
    document.getElementById('cart-counter').textContent = total;
    exibirToast(`${p.nome} adicionado à cesta.`, "info");
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
    exibirToast("A processar pedido seguro...", "info");

    const res = await executarRequisicaoAPI("criar_pedido", {
        tokenMembro: estadoSessao.token,
        itens: cestaCompras.map(i => ({ id: i.id, quantidade: i.quantidade })),
        metodoPagamento: metodo
    });

    if (res.sucesso) {
        exibirToast(`Pedido ${res.idPedido} gerado!`, "success");
        cestaCompras = [];
        document.getElementById('cart-counter').textContent = "0";
        navegarPara('meus-pedidos');
    } else {
        exibirToast(res.mensagem || "Erro ao pedir.", "error");
    }
}

async function carregarMeusPedidos() {
    const box = document.getElementById('meus-pedidos-container');
    box.innerHTML = '<p style="color: #64748b;">A carregar os seus pedidos...</p>';

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
                    <input type="text" placeholder="Escreva uma mensagem..." style="margin-top: 5px;">
                    <button class="btn btn-primary btn-sm" onclick="exibirToast('Mensagem enviada no chat!', 'success')">Enviar</button>
                </div>
            ` : '<p><small style="color: #94a3b8;">Chat temporário encerrado.</small></p>'}
        `;
        box.appendChild(card);
    });
}

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
                btn.className = 'btn btn-primary btn-sm';
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

async function tratarEnvioComentario(e) {
    e.preventDefault();
    const c = document.getElementById('campo-comentario');
    const msg = c.value.trim();
    if (!msg) return;

    const res = await executarRequisicaoAPI("enviar_comentario", { mensagem: msg });
    if (res.sucesso) {
        exibirToast("Mensagem enviada com sucesso!", "success");
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
