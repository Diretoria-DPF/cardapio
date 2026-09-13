/* ============================================================================
   app.js — Plataforma Comercial Segura (v7 — FASE 1 integrada)
   ============================================================================
   CORREÇÕES DESTA VERSÃO:
     • enviarPedidoDesbloqueio() declarada (estava faltando)
     • executarLogout preserva o fingerprint antes do localStorage.clear()
     • Removida duplicação de window.executarLogout
     • Comentários sobre a sessão curta + refresh token
   ============================================================================ */

// URL OFICIAL DA API:
const URL_BACKEND_APPS_SCRIPT = "https://script.google.com/macros/s/AKfycbw3a-97OX8Vz35xJsaKqrpps6H9yXROTCIcWykpwVlAiJP2gqDTK7sa2CyoQ8D0TgaK/exec";

/* ═══════════════════════════════════════════════════════════════
   FASE 1 — FINGERPRINT + SESSÃO SEGURA + HMAC + REFRESH
   ═══════════════════════════════════════════════════════════════ */

/** Gera fingerprint estável do dispositivo. */
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

const FINGERPRINT = gerarFingerprint();

/** Gera nonce aleatório. */
function gerarNonce() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/** Assina o body com HMAC-SHA256. */
async function assinarHmac(acao, payload, ts) {
  const hmacKey = sessionStorage.getItem('plataforma_hmac_key');
  if (!hmacKey) return null;

  const bodyAssinado = JSON.stringify({ acao, payload, ts });

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(hmacKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const assinatura = await crypto.subtle.sign('HMAC', key, enc.encode(bodyAssinado));
  return [...new Uint8Array(assinatura)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ═══════════════════════════════════════════════════════════════
   1. HELPERS
   ═══════════════════════════════════════════════════════════════ */

function escaparHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function fmtPreco(valor) {
  const n = typeof valor === 'number' ? valor : parseFloat(String(valor).replace(',', '.'));
  return `R$ ${(isNaN(n) ? 0 : n).toFixed(2).replace('.', ',')}`;
}

function mostrarLoader(texto = 'Carregando...') {
  const t = document.getElementById('loader-text');
  const o = document.getElementById('loader-overlay');
  if (t) t.textContent = texto;
  if (o) o.classList.remove('hidden');
}

function esconderLoader() {
  const o = document.getElementById('loader-overlay');
  if (o) o.classList.add('hidden');
}

function botaoCarregando(id, carregando = true) {
  const b = document.getElementById(id);
  if (!b) return;
  b.disabled = carregando;
  b.classList.toggle('loading', carregando);
}

/* ═══════════════════════════════════════════════════════════════
   2. CACHE LOCAL
   ═══════════════════════════════════════════════════════════════ */
const CacheLoja = {
  salvar(chave, dados) {
    try { localStorage.setItem('cache_' + chave, JSON.stringify({ dados, hora: Date.now() })); }
    catch (e) { console.warn("[Cache] cheio:", e); }
  },
  obter(chave) {
    try {
      const i = localStorage.getItem('cache_' + chave);
      return i ? JSON.parse(i).dados : null;
    } catch { return null; }
  },
  limpar(chave) { localStorage.removeItem('cache_' + chave); }
};

/* ═══════════════════════════════════════════════════════════════
   3. ESTADO GLOBAL
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
   4. INICIALIZAÇÃO
   ═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  restaurarSessaoLocal();
  await verificarTokenUrl();
  atualizarInterfaceSessao();

  if (_linkAutorizadoValido || estadoSessao.papel === 'adm') {
    const c = CacheLoja.obter('produtos_' + estadoSessao.papel);
    if (c && c.length > 0) {
      catalogoProdutos = c; catalogoFiltrado = c;
      renderizarVitrine();
    }
    await sincronizarProdutosServidor();
  }
});

function obterUrlBasePlataforma() {
  return window.location.href.split('?')[0];
}

/* ─── Validação do token na URL ─── */
async function verificarTokenUrl() {
  const token = new URLSearchParams(window.location.search).get('token');

  if (!token) {
    if (estadoSessao.papel === 'adm') { _linkAutorizadoValido = true; return; }
    _linkAutorizadoValido = false;
    return;
  }

  mostrarLoader('Validando autorização...');
  try {
    const url = `${URL_BACKEND_APPS_SCRIPT}?acao=validar_link&tokenAcesso=${encodeURIComponent(token)}`;
    const r = await fetchComTimeout(url, 15000);
    const j = await r.json();

    if (j.valido) {
      _linkAutorizadoValido = true;
      estadoSessao.token = token;
      iniciarTemporizadorSilencioso(j.segundosRestantes || (15 * 60));
    } else {
      _linkAutorizadoValido = false;
      exibirToast(j.mensagem || "Link expirado.", "error");
      executarLimpezaTotalESaida(true);
    }
  } catch (e) {
    console.error("[Token]", e);
    _linkAutorizadoValido = false;
  } finally {
    esconderLoader();
  }
}

function iniciarTemporizadorSilencioso(segundos) {
  pararTemporizadorSilencioso();
  _segundosRestantesLink = segundos;
  _timerSilencioso = setInterval(() => {
    _segundosRestantesLink--;
    if (_segundosRestantesLink <= 0) {
      pararTemporizadorSilencioso();
      exibirToast("Seu período terminou. Solicite novo link.", "info");
      executarLimpezaTotalESaida();
    }
  }, 1000);
}

function pararTemporizadorSilencioso() {
  if (_timerSilencioso) { clearInterval(_timerSilencioso); _timerSilencioso = null; }
}

function executarLimpezaTotalESaida(silencioso = false) {
  pararTemporizadorSilencioso();
  pararAutoRefreshChat();
  desligarAutoRefreshAdm();

  // Preserva o fingerprint
  const fp = localStorage.getItem('plataforma_fingerprint');
  try { localStorage.clear(); sessionStorage.clear(); } catch(e) {}
  if (fp) localStorage.setItem('plataforma_fingerprint', fp);

  try {
    document.cookie.split(";").forEach(c => {
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
  } catch(e) {}

  estadoSessao.papel = 'visitante';
  estadoSessao.token = null;
  estadoSessao.nomeUsuario = 'Visitante';
  cestaCompras = [];
  _linkAutorizadoValido = false;

  const urlLimpa = window.location.origin + window.location.pathname;
  window.history.replaceState({}, document.title, urlLimpa);

  if (!silencioso) exibirToast("Sessão finalizada.", "info");
  atualizarInterfaceSessao();
}

/* ─── Fetch com timeout ─── */
async function fetchComTimeout(url, ms = 25000, opcoes = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  const cfg = { mode: 'cors', redirect: 'follow', cache: 'no-cache', ...opcoes, signal: ctrl.signal };
  try { return await fetch(url, cfg); }
  finally { clearTimeout(t); }
}

/* ─── Requisição API com HMAC + auto-refresh ─── */
async function executarRequisicaoAPI(acao, dadosExtras = {}, tentarRefresh = true) {
  try {
    const ts = Date.now();
    const payload = dadosExtras;
    const corpo = { acao, payload, ts, fingerprint: FINGERPRINT };

    if (estadoSessao.token) {
      corpo.token = estadoSessao.token;
      try { corpo.hmac = await assinarHmac(acao, payload, ts); }
      catch(e) { console.warn('[HMAC]', e); }
    }

    const r = await fetchComTimeout(URL_BACKEND_APPS_SCRIPT, 25000, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(corpo)
    });

    const txt = await r.text();
    let json;
    try { json = JSON.parse(txt); }
    catch { console.error("[API] não-JSON:", txt.substring(0, 200));
            return { sucesso: false, mensagem: "Resposta inesperada." }; }

    // Auto-refresh
    if (!json.sucesso && json.codigo === 'SESSION_EXPIRED' && tentarRefresh) {
      const rt = sessionStorage.getItem('plataforma_refresh_token');
      if (rt) {
        console.log('[Sessão] Renovando...');
        const ok = await tentarRenovarSessao(rt);
        if (ok) return executarRequisicaoAPI(acao, dadosExtras, false);
        exibirToast("Sessão expirou. Faça login novamente.", "error");
        executarLogout();
        return { sucesso: false, mensagem: "Sessão expirada." };
      }
    }
    return json;
  } catch (e) {
    console.error("[API]", e);
    exibirToast(!navigator.onLine ? "Sem internet." : "Falha na comunicação.", "error");
    return { sucesso: false, mensagem: e.toString() };
  }
}

async function tentarRenovarSessao(refreshToken) {
  try {
    const r = await fetchComTimeout(URL_BACKEND_APPS_SCRIPT, 15000, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        acao: 'refresh',
        payload: { refreshToken },
        ts: Date.now(),
        fingerprint: FINGERPRINT
      })
    });
    const j = await r.json();
    if (j.sucesso && j.token) {
      estadoSessao.token = j.token;
      sessionStorage.setItem('plataforma_hmac_key', j.hmacKey);
      localStorage.setItem('plataforma_sessao', JSON.stringify(estadoSessao));
      console.log('[Sessão] Renovada.');
      return true;
    }
    return false;
  } catch (e) { console.error('[Refresh]', e); return false; }
}

/* ═══════════════════════════════════════════════════════════════
   5. UPLOAD
   ═══════════════════════════════════════════════════════════════ */
function processarUploadImagem(evento) {
  const f = evento.target.files[0];
  if (!f) return;

  if (f.type === "image/gif") {
    if (f.size > 200 * 1024) {
      exibirToast("GIF muito pesado (máx 200KB).", "error");
      evento.target.value = "";
      return;
    }
    const l = new FileReader();
    l.onload = e => {
      fotoBase64Temporaria = e.target.result;
      exibirPreviewImagem(fotoBase64Temporaria);
    };
    l.readAsDataURL(f);
    return;
  }

  const l = new FileReader();
  l.onload = e => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const MAX = 350;
      let { width: w, height: h } = img;
      if (w > h && w > MAX) { h *= MAX / w; w = MAX; }
      else if (h >= w && h > MAX) { w *= MAX / h; h = MAX; }
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      fotoBase64Temporaria = c.toDataURL('image/jpeg', 0.7);
      exibirPreviewImagem(fotoBase64Temporaria);
    };
    img.src = e.target.result;
  };
  l.readAsDataURL(f);
}

function exibirPreviewImagem(src) {
  const img = document.getElementById('img-preview');
  const box = document.getElementById('preview-container');
  const url = document.getElementById('adm-prod-foto-url');
  if (img) img.src = src;
  if (box) box.classList.remove('hidden');
  if (url) url.value = "";
}

function removerFotoCarregada() {
  fotoBase64Temporaria = "";
  const box = document.getElementById('preview-container');
  const inp = document.getElementById('adm-prod-arquivo');
  const img = document.getElementById('img-preview');
  if (box) box.classList.add('hidden');
  if (inp) inp.value = "";
  if (img) img.src = "";
}

/* ═══════════════════════════════════════════════════════════════
   6. VITRINE
   ═══════════════════════════════════════════════════════════════ */
async function sincronizarProdutosServidor() {
  let url = `${URL_BACKEND_APPS_SCRIPT}?acao=listar_produtos`;
  if (estadoSessao.token) url += `&token=${encodeURIComponent(estadoSessao.token)}`;

  try {
    const r = await fetchComTimeout(url, 20000);
    const j = await r.json();
    if (j.sucesso && Array.isArray(j.produtos)) {
      catalogoProdutos = j.produtos;
      catalogoFiltrado = j.produtos;
      CacheLoja.salvar('produtos_' + estadoSessao.papel, catalogoProdutos);
      renderizarVitrine();
    }
  } catch (e) { console.warn("[Vitrine]", e); }
}

function aplicarFiltroVitrine(termoManual = null) {
  const inp = document.getElementById('filtro-produtos');
  const termo = (termoManual !== null ? termoManual : (inp ? inp.value : '')).trim().toLowerCase();
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
    grid.innerHTML = `<div class="empty-state">
      <strong>${termo ? 'Nenhum produto encontrado' : 'Vitrine vazia'}</strong>
      ${termo ? `Nada corresponde a "${escaparHtml(termo)}".` : 'Aguarde novos produtos.'}
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
      const box = document.createElement('div');
      box.className = 'adm-visib-controls';

      const tag = document.createElement('span');
      tag.style.fontWeight = 'bold';
      tag.style.color = p.visibilidade === 'adm' ? '#dc2626' :
                        (p.visibilidade === 'registrado' ? '#2563eb' : '#16a34a');
      tag.textContent = `[${String(p.visibilidade).toUpperCase()}]`;

      const sel = document.createElement('select');
      sel.innerHTML = `
        <option value="publico" ${p.visibilidade === 'publico' ? 'selected' : ''}>Público</option>
        <option value="registrado" ${p.visibilidade === 'registrado' ? 'selected' : ''}>Membro</option>
        <option value="adm" ${p.visibilidade === 'adm' ? 'selected' : ''}>Oculto ADM</option>
      `;
      sel.onchange = () => alterarVisibilidadeProdutoAdm(p.id, sel.value);

      box.append(tag, sel);
      body.appendChild(box);
    } else {
      const aviso = document.createElement('small');
      aviso.className = 'visitor-note';
      aviso.textContent = 'Cadastre-se para comprar.';
      body.appendChild(aviso);
    }

    card.append(img, body);
    grid.appendChild(card);
  });
}

async function alterarVisibilidadeProdutoAdm(idProduto, novaVisib) {
  mostrarLoader("Alterando...");
  const r = await executarRequisicaoAPI("alterar_visibilidade_produto", {
    idProduto, novaVisibilidade: novaVisib
  });
  esconderLoader();

  if (r.sucesso) {
    exibirToast(r.mensagem || "Atualizado!", "success");
    await sincronizarProdutosServidor();
  } else {
    exibirToast(r.mensagem || "Erro.", "error");
  }
}

/* ═══════════════════════════════════════════════════════════════
   7. FAQ E SUGESTÕES
   ═══════════════════════════════════════════════════════════════ */
let listaDuvidasFaq = [
  { pergunta: "Como funciona a retirada e entrega?",
    resposta: "Após a confirmação do pagamento, abre-se um chat exclusivo no seu pedido com todas as orientações." },
  { pergunta: "Quais formas de pagamento aceitas?",
    resposta: "PIX, Cartão de Crédito e Criptomoedas (BTC, ETH, USDT)." },
  { pergunta: "Quanto dura o chat do pedido?",
    resposta: "Enquanto a entrega estiver em andamento. Ao ser concluída, é finalizado com segurança." }
];

function carregarFaqMemoria() {
  const s = localStorage.getItem('loja_faq_dados');
  if (s) { try { listaDuvidasFaq = JSON.parse(s); } catch(e) {} }
}
carregarFaqMemoria();

function abrirCentralDuvidas() {
  if (estadoSessao.papel === 'visitante') {
    exibirToast("Exclusivo para membros.", "info");
    abrirModal('modal-login');
    return;
  }
  renderizarListaFaq();

  const ed = document.getElementById('adm-editor-faq-area');
  if (ed) {
    if (estadoSessao.papel === 'adm') ed.classList.remove('hidden');
    else ed.classList.add('hidden');
  }
  abrirModal('modal-duvidas-central');
}

function renderizarListaFaq() {
  const cont = document.getElementById('lista-faq-perguntas');
  if (!cont) return;
  cont.innerHTML = '';

  listaDuvidasFaq.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'faq-item';

    const q = document.createElement('div');
    q.className = 'faq-question';
    q.setAttribute('data-action', 'toggle-faq');
    q.innerHTML = `<span>${escaparHtml(item.pergunta)}</span> <small>▼</small>`;

    const a = document.createElement('div');
    a.className = 'faq-answer';
    a.textContent = item.resposta;

    if (estadoSessao.papel === 'adm') {
      const del = document.createElement('button');
      del.className = 'btn btn-danger-outline btn-sm';
      del.style.cssText = 'margin-top:6px;font-size:0.65rem;padding:2px 6px;';
      del.textContent = 'Excluir Dúvida';
      del.onclick = e => {
        e.stopPropagation();
        listaDuvidasFaq.splice(idx, 1);
        localStorage.setItem('loja_faq_dados', JSON.stringify(listaDuvidasFaq));
        renderizarListaFaq();
        exibirToast("Removida.", "info");
      };
      a.appendChild(del);
    }

    div.append(q, a);
    cont.appendChild(div);
  });
}

async function tratarEnvioSugestao(e) {
  if (e) e.preventDefault();
  const campo = document.getElementById('campo-sugestao-texto');
  const texto = campo ? campo.value.trim() : '';
  if (!texto) return;

  mostrarLoader("Enviando...");
  const r = await executarRequisicaoAPI("enviar_comentario", {
    nome: `[SUGESTÃO] ${estadoSessao.nomeUsuario}`,
    mensagem: texto
  });
  esconderLoader();

  if (r.sucesso) {
    exibirToast("Sugestão enviada!", "success");
    if (campo) campo.value = '';
    fecharModal('modal-duvidas-central');
  } else {
    exibirToast(r.mensagem || "Erro.", "error");
  }
}

function tratarAdicionarFaq(e) {
  if (e) e.preventDefault();
  const p = document.getElementById('faq-nova-pergunta');
  const r = document.getElementById('faq-nova-resposta');
  const pergunta = p ? p.value.trim() : '';
  const resposta = r ? r.value.trim() : '';
  if (!pergunta || !resposta) return;

  listaDuvidasFaq.push({ pergunta, resposta });
  localStorage.setItem('loja_faq_dados', JSON.stringify(listaDuvidasFaq));
  if (p) p.value = '';
  if (r) r.value = '';
  renderizarListaFaq();
  exibirToast("Dúvida adicionada!", "success");
}

/* ═══════════════════════════════════════════════════════════════
   8. CADASTRO
   ═══════════════════════════════════════════════════════════════ */
async function tratarSolicitacaoCadastro(evento) {
  if (evento) evento.preventDefault();

  const nome = document.getElementById('cad-nome').value.trim();
  const telefone = document.getElementById('cad-telefone').value.trim();
  const senha = document.getElementById('cad-senha').value;
  const senhaConf = document.getElementById('cad-senha-conf').value;
  const twitter = document.getElementById('cad-twitter').value.trim();
  const telegram = document.getElementById('cad-telegram').value.trim();

  if (senha !== senhaConf) return exibirToast("Senhas não coincidem.", "error");
  if (senha.length < 6) return exibirToast("Senha muito curta.", "error");

  botaoCarregando('btn-enviar-cadastro', true);

  const r = await executarRequisicaoAPI("solicitar_cadastro", {
    nome, telefone, senha, twitter, telegram
  });

  botaoCarregando('btn-enviar-cadastro', false);

  if (r.sucesso) {
    exibirToast(r.mensagem || "Solicitação enviada!", "success");
    document.getElementById('form-registro').reset();
    fecharModal('modal-cadastro');
  } else {
    exibirToast(r.mensagem || "Erro.", "error");
  }
}

/* ═══════════════════════════════════════════════════════════════
   9. LOGIN / LOGOUT / DESBLOQUEIO
   ═══════════════════════════════════════════════════════════════ */
async function tratarLogin(evento) {
  if (evento) evento.preventDefault();

  const usuario = document.getElementById('login-usuario').value.trim();
  const senha = document.getElementById('login-senha').value;
  identificadorEmTentativa = usuario;

  botaoCarregando('btn-entrar', true);

  const r = await executarRequisicaoAPI("login", { identificador: usuario, senha });

  botaoCarregando('btn-entrar', false);

  if (r.sucesso) {
    estadoSessao.papel = r.papel;
    estadoSessao.token = r.token;
    estadoSessao.nomeUsuario = r.nome;

    // Guarda refresh + hmac
    if (r.refreshToken) sessionStorage.setItem('plataforma_refresh_token', r.refreshToken);
    if (r.hmacKey)      sessionStorage.setItem('plataforma_hmac_key', r.hmacKey);
    localStorage.setItem('plataforma_sessao', JSON.stringify(estadoSessao));

    if (r.papel === 'adm') _linkAutorizadoValido = true;

    document.getElementById('form-login').reset();
    document.getElementById('box-desbloqueio-conta').classList.add('hidden');
    fecharModal('modal-login');
    atualizarInterfaceSessao();

    CacheLoja.limpar('produtos_visitante');
    await sincronizarProdutosServidor();
    exibirToast(`Bem-vindo, ${r.nome}!`, "success");
  } else {
    exibirToast(r.mensagem || "Credenciais inválidas.", "error");
    if (r.requerLiberacaoAdm) {
      document.getElementById('box-desbloqueio-conta').classList.remove('hidden');
    }
  }
}

/* [CORRIGIDO] enviarPedidoDesbloqueio — estava faltando! */
async function enviarPedidoDesbloqueio() {
  if (!identificadorEmTentativa) {
    exibirToast("Faça uma tentativa de login primeiro.", "info");
    return;
  }
  const r = await executarRequisicaoAPI("pedir_desbloqueio", {
    identificador: identificadorEmTentativa
  });
  if (r.sucesso) {
    exibirToast(r.mensagem || "Pedido enviado.", "success");
    const btn = document.getElementById('btn-solicitar-desbloqueio');
    if (btn) btn.disabled = true;
  } else {
    exibirToast(r.mensagem || "Erro.", "error");
  }
}

function confirmarLogout() {
  abrirConfirmacao(
    "Encerrar Sessão",
    "Deseja realmente sair? O link atual será invalidado.",
    executarLogout
  );
}

/**
 * LOGOUT: invalida link no servidor, limpa tudo, recarrega.
 * Preserva o fingerprint do dispositivo.
 */
async function executarLogout() {
  const tokenLink = new URLSearchParams(window.location.search).get('token');

  if (tokenLink) {
    mostrarLoader("Encerrando e revogando link...");
    try { await executarRequisicaoAPI("invalidar_link", { tokenAcesso: tokenLink }); }
    catch(e) { console.warn("[Logout]", e); }
  } else {
    mostrarLoader("Encerrando sessão...");
  }

  pararTemporizadorSilencioso();
  pararAutoRefreshChat();
  desligarAutoRefreshAdm();

  // Preserva fingerprint antes de limpar tudo
  const fp = localStorage.getItem('plataforma_fingerprint');

  try {
    sessionStorage.removeItem('plataforma_refresh_token');
    sessionStorage.removeItem('plataforma_hmac_key');
    localStorage.clear();
    sessionStorage.clear();
  } catch(e) {}

  // Restaura fingerprint
  if (fp) {
    try { localStorage.setItem('plataforma_fingerprint', fp); } catch(e) {}
  }

  try {
    document.cookie.split(";").forEach(c => {
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
  } catch(e) {}

  estadoSessao.papel = 'visitante';
  estadoSessao.token = null;
  estadoSessao.nomeUsuario = 'Visitante';
  cestaCompras = [];
  catalogoProdutos = [];
  catalogoFiltrado = [];
  _linkAutorizadoValido = false;

  const urlLimpa = window.location.origin + window.location.pathname;
  window.history.replaceState({}, document.title, urlLimpa);
  esconderLoader();
  window.location.replace(urlLimpa);
}

function restaurarSessaoLocal() {
  const s = localStorage.getItem('plataforma_sessao');
  if (!s) return;
  try {
    const d = JSON.parse(s);
    estadoSessao.papel = d.papel || 'visitante';
    estadoSessao.token = d.token || null;
    estadoSessao.nomeUsuario = d.nomeUsuario || 'Visitante';
    if (estadoSessao.papel === 'adm') _linkAutorizadoValido = true;
  } catch {
    localStorage.removeItem('plataforma_sessao');
  }
}

/* ═══════════════════════════════════════════════════════════════
   10. INTERFACE POR PAPEL
   ═══════════════════════════════════════════════════════════════ */
function atualizarInterfaceSessao() {
  const badge = document.getElementById('role-badge');
  const anonBox = document.getElementById('anon-buttons');
  const authBox = document.getElementById('auth-buttons');
  const userLabel = document.getElementById('user-display-name');
  const navBar = document.getElementById('app-nav-bar');

  const tabCarrinho = document.getElementById('tab-btn-carrinho');
  const tabMeusPedidos = document.getElementById('tab-btn-meus-pedidos');
  const tabNovoProduto = document.getElementById('tab-btn-novo-produto');
  const tabPedidosAdm = document.getElementById('tab-btn-pedidos-adm');
  const tabAdm = document.getElementById('tab-btn-adm');

  const viewBloqueado = document.getElementById('view-bloqueado');
  const containerDuvidas = document.getElementById('container-duvidas-discreto');

  if (badge) {
    badge.textContent = estadoSessao.papel.toUpperCase();
    badge.className = `badge badge-${estadoSessao.papel}`;
  }

  const esconder = el => el && el.classList.add('hidden');
  const mostrar = el => el && el.classList.remove('hidden');

  [tabCarrinho, tabMeusPedidos, tabNovoProduto, tabPedidosAdm, tabAdm].forEach(esconder);
  esconder(containerDuvidas);

  // Bloqueio
  if (!_linkAutorizadoValido && estadoSessao.papel !== 'adm') {
    esconder(navBar);
    document.querySelectorAll('.view-panel').forEach(p => {
      p.classList.add('hidden');
      p.classList.remove('active');
    });
    if (viewBloqueado) {
      viewBloqueado.classList.remove('hidden');
      viewBloqueado.classList.add('active');
    }
    mostrar(anonBox); esconder(authBox);
    return;
  }

  // Liberado
  mostrar(navBar);
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
    mostrar(containerDuvidas);
  } else if (estadoSessao.papel === 'entregador') {
    esconder(anonBox); mostrar(authBox);
    if (userLabel) userLabel.textContent = `Entregador: ${estadoSessao.nomeUsuario}`;
    mostrar(tabMeusPedidos); mostrar(tabPedidosAdm);
    mostrar(containerDuvidas);
  } else if (estadoSessao.papel === 'adm') {
    esconder(anonBox); mostrar(authBox);
    if (userLabel) userLabel.textContent = `ADM: ${estadoSessao.nomeUsuario}`;
    mostrar(tabNovoProduto); mostrar(tabPedidosAdm); mostrar(tabAdm);
    mostrar(containerDuvidas);
  }

  const algum = document.querySelector('.view-panel.active:not(.hidden)');
  if (!algum) navegarPara('vitrine');

  if (estadoSessao.papel === 'adm') ligarAutoRefreshAdm();
  else { desligarAutoRefreshAdm(); atualizarBadgePendentesAdm(0); }
}

/* ═══════════════════════════════════════════════════════════════
   11. NAVEGAÇÃO
   ═══════════════════════════════════════════════════════════════ */
function navegarPara(nomeAba) {
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));

  const btn = document.getElementById(`tab-btn-${nomeAba}`);
  const painel = document.getElementById(`view-${nomeAba}`);

  if (btn && painel) {
    btn.classList.add('active');
    painel.classList.remove('hidden');
    painel.classList.add('active');
  }

  if (nomeAba === 'vitrine')      sincronizarProdutosServidor();
  if (nomeAba === 'carrinho')     renderizarCarrinho();
  if (nomeAba === 'meus-pedidos') carregarMeusPedidos();
  if (nomeAba === 'pedidos-adm')  carregarPedidosAdm();
  if (nomeAba === 'adm') { carregarPainelCentralAdm(); consultarPendentesAdm(); }
}

/* ═══════════════════════════════════════════════════════════════
   12. CARRINHO
   ═══════════════════════════════════════════════════════════════ */
function adicionarAoCarrinho(produto) {
  const it = cestaCompras.find(i => i.id === produto.id);
  if (it) it.quantidade += 1;
  else cestaCompras.push({
    id: produto.id,
    nome: produto.nome,
    preco: typeof produto.preco === 'number' ? produto.preco : parseFloat(String(produto.preco).replace(',', '.')),
    quantidade: 1
  });

  const total = cestaCompras.reduce((a, i) => a + i.quantidade, 0);
  const c = document.getElementById('cart-counter');
  if (c) c.textContent = total;
  exibirToast(`${produto.nome} adicionado.`, "info");
}

function renderizarCarrinho() {
  const lista = document.getElementById('carrinho-itens-lista');
  if (!lista) return;
  lista.innerHTML = '';
  let total = 0;

  if (cestaCompras.length === 0) {
    lista.innerHTML = `<div class="empty-state"><strong>Cesta vazia</strong>Adicione itens da vitrine.</div>`;
    const el = document.getElementById('carrinho-total-valor');
    if (el) el.textContent = 'R$ 0,00';
    return;
  }

  cestaCompras.forEach(item => {
    const sub = item.preco * item.quantidade;
    total += sub;

    const linha = document.createElement('div');
    linha.className = 'cart-item-row';
    linha.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid #e2e8f0;';

    const desc = document.createElement('span');
    desc.textContent = `${item.nome} (x${item.quantidade})`;

    const qtd = document.createElement('input');
    qtd.type = 'number'; qtd.min = 1; qtd.value = item.quantidade;
    qtd.style.cssText = 'width:64px;padding:4px 6px;';
    qtd.onchange = () => {
      item.quantidade = Math.max(1, Number(qtd.value) || 1);
      renderizarCarrinho();
      const c = document.getElementById('cart-counter');
      if (c) c.textContent = cestaCompras.reduce((a, x) => a + x.quantidade, 0);
    };

    const preco = document.createElement('strong');
    preco.textContent = fmtPreco(sub);

    const rem = document.createElement('button');
    rem.className = 'btn btn-danger-outline btn-sm';
    rem.textContent = '✕';
    rem.title = 'Remover';
    rem.onclick = () => {
      cestaCompras = cestaCompras.filter(x => x.id !== item.id);
      renderizarCarrinho();
      const c = document.getElementById('cart-counter');
      if (c) c.textContent = cestaCompras.reduce((a, x) => a + x.quantidade, 0);
    };

    linha.append(desc, qtd, preco, rem);
    lista.appendChild(linha);
  });

  const el = document.getElementById('carrinho-total-valor');
  if (el) el.textContent = fmtPreco(total);
}

async function tratarCriacaoPedido() {
  if (cestaCompras.length === 0) return exibirToast("Cesta vazia.", "error");

  botaoCarregando('btn-confirmar-pedido', true);
  mostrarLoader("Processando pedido...");

  const metodo = document.getElementById('metodo-pagamento').value;

  const r = await executarRequisicaoAPI("criar_pedido", {
    itens: cestaCompras.map(i => ({ id: i.id, quantidade: i.quantidade })),
    metodoPagamento: metodo
  });

  esconderLoader();
  botaoCarregando('btn-confirmar-pedido', false);

  if (r.sucesso) {
    exibirToast(`Pedido ${r.idPedido} gerado!`, "success");
    const metodoEscolhido = metodo;
    cestaCompras = [];
    const c = document.getElementById('cart-counter');
    if (c) c.textContent = "0";
    navegarPara('meus-pedidos');
    abrirCobrancaPedido(r.idPedido, metodoEscolhido);
  } else {
    exibirToast(r.mensagem || "Erro ao criar pedido.", "error");
    exibirContingenciaSuporteAdm(r.mensagem, metodo);
  }
}

function exibirContingenciaSuporteAdm(motivoErro, metodoEscolhido) {
  const itens = cestaCompras.map(i => `${i.nome} (x${i.quantidade})`).join(', ');
  const total = document.getElementById('carrinho-total-valor')?.textContent || "R$ 0,00";

  const corpo = `
    <div style="text-align:left;font-size:0.9rem;color:#334155;">
      <p style="color:#b91c1c;font-weight:600;margin-bottom:8px;">⚠️ Não foi possível concluir:</p>
      <p style="background:#fef2f2;padding:8px;border-radius:6px;border:1px solid #fca5a5;font-size:0.8rem;margin-bottom:12px;">
        ${escaparHtml(motivoErro || "Instabilidade na ligação.")}
      </p>
      <p>Contacte o Administrador para regularização.</p>
      <p style="font-size:0.8rem;color:#64748b;margin-bottom:12px;">
        <strong>Itens:</strong> ${escaparHtml(itens)}<br>
        <strong>Total:</strong> ${escaparHtml(total)} | <strong>Forma:</strong> ${escaparHtml(metodoEscolhido)}
      </p>
    </div>`;

  abrirConfirmacao("Suporte com o Administrador", corpo, async () => {
    mostrarLoader("Contactando...");
    await executarRequisicaoAPI("enviar_comentario", {
      nome: estadoSessao.nomeUsuario,
      mensagem: `[PEDIDO MANUAL] ${estadoSessao.nomeUsuario} tentou pedir [${itens}] R$ ${total} via ${metodoEscolhido}. Aviso: "${motivoErro}"`
    });
    esconderLoader();
    exibirToast("Administrador notificado!", "success");
  });

  const b = document.getElementById('confirmar-btn-ok');
  if (b) b.textContent = "Chamar Administrador";
}

/* ═══════════════════════════════════════════════════════════════
   13. MEUS PEDIDOS + CHAT
   ═══════════════════════════════════════════════════════════════ */
async function carregarMeusPedidos() {
  const c = document.getElementById('meus-pedidos-container');
  if (!c) return;
  c.innerHTML = '<div class="loading-slot">Carregando pedidos...</div>';

  const r = await executarRequisicaoAPI("listar_meus_pedidos");
  c.innerHTML = '';

  if (!r.sucesso || !r.pedidos || r.pedidos.length === 0) {
    c.innerHTML = `<div class="empty-state"><strong>Nenhum pedido ainda</strong></div>`;
    return;
  }

  r.pedidos.forEach(p => {
    const card = document.createElement('div');
    card.className = 'adm-card';
    const st = String(p.status).toLowerCase();

    card.innerHTML = `
      <h4>Pedido: ${escaparHtml(p.id)}</h4>
      <p>Status: <strong>${escaparHtml(st.toUpperCase())}</strong> | Total: <strong>${fmtPreco(p.total)}</strong></p>
      <p>Forma: <strong>${escaparHtml(p.metodo || 'PIX')}</strong></p>
    `;

    const acoes = document.createElement('div');
    acoes.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;';

    if (st === 'analise') {
      const b = document.createElement('button');
      b.className = 'btn btn-success btn-sm';
      b.textContent = '💳 Pagar';
      b.onclick = () => abrirCobrancaPedido(p.id, p.metodo);
      acoes.appendChild(b);
    }

    if (p.chatAtivo) {
      const b = document.createElement('button');
      b.className = 'btn btn-primary btn-sm';
      b.textContent = '💬 Chat';
      b.onclick = () => abrirChatPedido(p.id);
      acoes.appendChild(b);
    } else {
      const s = document.createElement('small');
      s.style.color = '#94a3b8';
      s.textContent = 'Chat encerrado.';
      acoes.appendChild(s);
    }

    card.appendChild(acoes);
    c.appendChild(card);
  });
}

async function abrirCobrancaPedido(idPedido, metodo) {
  mostrarLoader("Gerando cobrança...");
  const r = await executarRequisicaoAPI("gerar_pagamento", { idPedido, metodo: metodo || "PIX" });
  esconderLoader();

  if (!r.sucesso) return exibirToast(r.mensagem || "Erro.", "error");
  if (r.jaPago) return exibirToast("Já pago!", "success");

  const cb = r.cobranca;
  const box = document.createElement('div');
  box.style.cssText = 'text-align:center;padding:10px;';

  if (cb.tipo === "PIX") {
    const qr = document.createElement('img');
    qr.src = cb.qrCodeUrl; qr.alt = "QR PIX";
    qr.style.cssText = 'width:200px;height:200px;margin-bottom:12px;border:1px solid #cbd5e1;border-radius:8px;';

    const ins = document.createElement('p');
    ins.style.cssText = 'font-size:.85rem;color:#475569;margin-bottom:8px;';
    ins.textContent = cb.instrucoes;

    const inp = document.createElement('input');
    inp.type = 'text'; inp.id = 'pix-copia-cola'; inp.value = cb.pixCopiaECola;
    inp.readOnly = true;
    inp.style.cssText = 'font-size:.75rem;margin-bottom:8px;text-align:center;width:100%;';
    inp.onclick = () => inp.select();

    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn-primary btn-block';
    b.textContent = '📋 Copiar PIX';
    b.onclick = () => copiarPixCopiaECola();

    box.append(qr, ins, inp, b);
  } else if (cb.tipo === "CRIPTO") {
    const qr = document.createElement('img');
    qr.src = cb.qrCodeUrl; qr.alt = "QR Cripto";
    qr.style.cssText = 'width:180px;height:180px;margin-bottom:10px;border-radius:8px;';

    const v = document.createElement('p');
    v.innerHTML = `<strong>Transferir:</strong> ${escaparHtml(cb.quantidadeEstimada)} ${escaparHtml(cb.moeda)}`;

    const w = document.createElement('p');
    w.style.cssText = 'font-size:.75rem;color:#64748b;word-break:break-all;margin:6px 0;';
    w.innerHTML = `<strong>Carteira:</strong><br>${escaparHtml(cb.carteiraDestino)}`;

    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn-primary btn-block';
    b.textContent = '📋 Copiar Carteira';
    b.onclick = () => {
      navigator.clipboard.writeText(cb.carteiraDestino);
      exibirToast("Copiado!", "success");
    };

    box.append(qr, v, w, b);
  } else if (cb.tipo === "CARTAO") {
    const i = document.createElement('p');
    i.style.cssText = 'margin-bottom:12px;';
    i.textContent = cb.instrucoes;

    const a = document.createElement('a');
    a.href = cb.urlCheckout; a.target = '_blank';
    a.className = 'btn btn-success btn-block';
    a.style.cssText = 'text-decoration:none;display:block;';
    a.textContent = '🔒 Pagar com Cartão';

    box.append(i, a);
  }

  abrirConfirmacaoElemento(`Pagamento #${idPedido}`, box, () => carregarMeusPedidos());
}

function copiarPixCopiaECola() {
  const i = document.getElementById('pix-copia-cola');
  if (!i) return;
  i.select();
  navigator.clipboard.writeText(i.value)
    .then(() => exibirToast("PIX copiado!", "success"))
    .catch(() => { document.execCommand('copy'); exibirToast("PIX copiado!", "success"); });
}

/* ─── CHAT ─── */
async function abrirChatPedido(pedidoId) {
  pedidoChatAberto = pedidoId;
  const t = document.getElementById('chat-pedido-id');
  const c = document.getElementById('chat-mensagens');
  if (t) t.textContent = '#' + pedidoId;
  if (c) c.innerHTML = '<div class="loading-slot">Carregando...</div>';
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
  if (_timerChat) { clearInterval(_timerChat); _timerChat = null; }
}

async function renderizarChat(silencioso = false) {
  if (!pedidoChatAberto) return;
  const box = document.getElementById('chat-mensagens');
  if (!box) return;

  const r = await executarRequisicaoAPI("chat_listar", { idPedido: pedidoChatAberto });

  if (!r.sucesso || !r.mensagens || r.mensagens.length === 0) {
    if (!silencioso) box.innerHTML = '<div class="loading-slot">Sem mensagens.</div>';
    return;
  }

  const noFim = (box.scrollHeight - box.scrollTop) <= (box.clientHeight + 50);
  box.innerHTML = '';

  r.mensagens.forEach(m => {
    const b = document.createElement('div');
    const minha = (m.autorNome === estadoSessao.nomeUsuario) ||
                  (estadoSessao.papel === 'adm' && m.autorNome === 'Administração');
    b.className = 'chat-msg ' + (minha ? 'chat-msg--out' : 'chat-msg--in');

    const t = document.createElement('span');
    t.textContent = m.texto || '';

    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = m.autorNome || (minha ? 'Você' : 'Atendimento');

    b.append(t, meta);
    box.appendChild(b);
  });

  if (noFim || !silencioso) box.scrollTop = box.scrollHeight;
}

async function enviarMensagemChat() {
  const i = document.getElementById('chat-input');
  if (!i) return;
  const t = i.value.trim();
  if (!t) return;

  botaoCarregando('btn-chat-enviar', true);
  const r = await executarRequisicaoAPI("chat_enviar", {
    idPedido: pedidoChatAberto,
    autorNome: estadoSessao.nomeUsuario,
    texto: t
  });
  botaoCarregando('btn-chat-enviar', false);

  if (r.sucesso) { i.value = ''; await renderizarChat(); }
  else exibirToast(r.mensagem || "Falha.", "error");
}

/* ═══════════════════════════════════════════════════════════════
   14. PAINEL ADM
   ═══════════════════════════════════════════════════════════════ */
async function carregarPainelCentralAdm() {
  if (estadoSessao.papel !== 'adm') return;

  // 1. Solicitações
  const divS = document.getElementById('adm-solicitacoes-lista');
  if (divS) divS.innerHTML = '<div class="loading-slot">Procurando...</div>';

  const rS = await executarRequisicaoAPI("listar_solicitacoes_adm");
  const total = (rS.sucesso && Array.isArray(rS.solicitacoes)) ? rS.solicitacoes.length : 0;
  atualizarBadgePendentesAdm(total);

  if (divS) {
    divS.innerHTML = '';
    if (total > 0) {
      rS.solicitacoes.forEach(s => {
        const l = document.createElement('div');
        l.style.cssText = 'padding:10px 0;border-bottom:1px solid #e2e8f0;';
        l.innerHTML = `
          <p><strong>${escaparHtml(s.nome)}</strong> (Login: ${escaparHtml(s.telefone)})</p>
          <p style="font-size:.78rem;color:#64748b;">
            Twitter: ${escaparHtml(s.twitter || '-')} | Telegram: ${escaparHtml(s.telegram || '-')}
          </p>
        `;
        const b = document.createElement('button');
        b.className = 'btn btn-success btn-sm';
        b.style.marginTop = '5px';
        b.textContent = 'Aprovar Membro';
        b.onclick = () => aprovarMembroAdm(s.id);
        l.appendChild(b);
        divS.appendChild(l);
      });
    } else {
      divS.innerHTML = '<div class="loading-slot">Nenhuma pendente.</div>';
    }
  }

  // 2. Métricas
  const rM = await executarRequisicaoAPI("obter_metricas_vendas");
  if (rM.sucesso) {
    const f = document.getElementById('metric-faturamento');
    const p = document.getElementById('metric-pedidos');
    if (f) f.textContent = fmtPreco(rM.faturamentoTotal || 0);
    if (p) p.textContent = rM.totalPedidos || 0;

    const dt = document.getElementById('tabela-metricas-produtos');
    if (dt) {
      if (!rM.itensDetalhados || rM.itensDetalhados.length === 0) {
        dt.innerHTML = '<div class="loading-slot">Sem vendas.</div>';
      } else {
        let h = '<table class="tabela-metricas"><thead><tr><th>Produto</th><th>Qtd</th></tr></thead><tbody>';
        rM.itensDetalhados.forEach(it => {
          h += `<tr><td>${escaparHtml(it.nome)}</td><td><strong>${Number(it.quantidadeVendida)||0} un</strong></td></tr>`;
        });
        h += '</tbody></table>';
        dt.innerHTML = h;
      }
    }
  }

  // 3. Bloqueados
  const rB = await executarRequisicaoAPI("listar_bloqueados_adm");
  const db = document.getElementById('adm-bloqueados-lista');
  if (db) {
    db.innerHTML = '';
    if (rB.sucesso && Array.isArray(rB.contas) && rB.contas.length > 0) {
      rB.contas.forEach(b => {
        const l = document.createElement('div');
        l.style.padding = '6px 0';
        l.innerHTML = `<p style="color:#b91c1c;"><strong>${escaparHtml(b.identificador)}</strong> (${Number(b.erros)||0} falhas)</p>`;
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary btn-sm';
        btn.textContent = 'Liberar Conta';
        btn.onclick = () => liberarContaUsuarioAdm(b.identificador);
        l.appendChild(btn);
        db.appendChild(l);
      });
    } else {
      db.innerHTML = '<div class="loading-slot">Nenhuma bloqueada.</div>';
    }
  }

  // 4. Comentários
  const rC = await executarRequisicaoAPI("listar_comentarios_adm");
  const dc = document.getElementById('adm-comentarios-lista');
  if (dc) {
    dc.innerHTML = '';
    if (rC.sucesso && Array.isArray(rC.comentarios) && rC.comentarios.length > 0) {
      rC.comentarios.forEach(c => {
        const p = document.createElement('p');
        p.style.cssText = 'font-size:.8rem;padding:6px 0;border-bottom:1px solid #e2e8f0;';
        const d = c.data ? new Date(c.data).toLocaleString() : '';
        p.innerHTML = `<strong>${escaparHtml(c.nome || 'Anônimo')}</strong> <small style="color:#94a3b8;">${escaparHtml(d)}</small><br>${escaparHtml(c.texto || '')}`;
        dc.appendChild(p);
      });
    } else {
      dc.innerHTML = '<div class="loading-slot">Sem mensagens.</div>';
    }
  }
}

async function aprovarMembroAdm(idSolicitacao) {
  mostrarLoader("Aprovando...");
  const r = await executarRequisicaoAPI("aprovar_cadastro", { idSolicitacao });
  esconderLoader();

  if (r.sucesso) {
    exibirToast(r.mensagem || "Aprovado!", "success");
    await carregarPainelCentralAdm();
    await consultarPendentesAdm();
  } else {
    exibirToast(r.mensagem || "Erro.", "error");
  }
}

async function liberarContaUsuarioAdm(identificador) {
  const r = await executarRequisicaoAPI("liberar_conta_adm", { identificador });
  if (r.sucesso) {
    exibirToast(r.mensagem || "Liberada!", "success");
    await carregarPainelCentralAdm();
  }
}

function atualizarBadgePendentesAdm(qtd) {
  const b = document.getElementById('tab-btn-adm');
  if (!b) return;
  const old = b.querySelector('.badge-pendentes');
  if (old) old.remove();
  if (qtd > 0) {
    const s = document.createElement('span');
    s.className = 'badge-pendentes';
    s.textContent = qtd;
    s.style.cssText = 'display:inline-block;min-width:18px;margin-left:6px;padding:0 5px;background:#ef4444;color:#fff;border-radius:999px;font-size:.7rem;font-weight:700;text-align:center;line-height:18px;';
    b.appendChild(s);
  }
}

async function consultarPendentesAdm() {
  if (estadoSessao.papel !== 'adm') return;
  try {
    const r = await executarRequisicaoAPI("listar_solicitacoes_adm");
    const t = (r.sucesso && Array.isArray(r.solicitacoes)) ? r.solicitacoes.length : 0;
    atualizarBadgePendentesAdm(t);
  } catch {}
}

function ligarAutoRefreshAdm() {
  desligarAutoRefreshAdm();
  if (estadoSessao.papel !== 'adm') return;
  consultarPendentesAdm();
  _timerPainelAdm = setInterval(() => {
    if (estadoSessao.papel !== 'adm') return desligarAutoRefreshAdm();
    consultarPendentesAdm();
  }, 20000);
}

function desligarAutoRefreshAdm() {
  if (_timerPainelAdm) { clearInterval(_timerPainelAdm); _timerPainelAdm = null; }
}

/* ═══════════════════════════════════════════════════════════════
   15. PIPELINE DE PEDIDOS (ADM)
   ═══════════════════════════════════════════════════════════════ */
async function carregarPedidosAdm() {
  const cA = document.getElementById('pipe-analise');
  const cS = document.getElementById('pipe-solicitados');
  const cV = document.getElementById('pipe-viagem');
  const cC = document.getElementById('pipe-concluido');

  [cA, cS, cV, cC].forEach(c => { if (c) c.innerHTML = '<div class="loading-slot">…</div>'; });

  const r = await executarRequisicaoAPI("listar_pedidos_adm");
  [cA, cS, cV, cC].forEach(c => { if (c) c.innerHTML = ''; });

  if (r.sucesso && Array.isArray(r.pedidos)) {
    r.pedidos.forEach(p => {
      const d = document.createElement('div');
      d.style.cssText = 'background:#fff;padding:8px;margin-bottom:8px;border-radius:6px;border:1px solid #cbd5e1;';
      d.innerHTML = `
        <small><strong>${escaparHtml(p.id)}</strong></small><br>
        <small>${fmtPreco(p.total)}</small><br>
        <small style="color:#64748b;">Forma: ${escaparHtml(p.metodo || 'PIX')}</small>
      `;

      const bl = document.createElement('div');
      bl.style.cssText = 'display:flex;gap:4px;margin-top:6px;';

      if (p.status !== 'concluido') {
        const b = document.createElement('button');
        b.className = 'btn btn-primary btn-sm';
        b.textContent = 'Avançar Fase';
        b.onclick = () => avancarStatusAdm(p.id, p.status);
        bl.appendChild(b);
      }

      const bc = document.createElement('button');
      bc.className = 'btn btn-outline-dark btn-sm';
      bc.textContent = '💬';
      bc.title = 'Chat';
      bc.onclick = () => abrirChatPedido(p.id);
      bl.appendChild(bc);

      d.appendChild(bl);

      if (p.status === 'analise'     && cA) cA.appendChild(d);
      if (p.status === 'solicitados' && cS) cS.appendChild(d);
      if (p.status === 'viagem'      && cV) cV.appendChild(d);
      if (p.status === 'concluido'   && cC) cC.appendChild(d);
    });
  }

  [[cA], [cS], [cV], [cC]].forEach(([c]) => {
    if (c && !c.children.length) {
      c.innerHTML = '<div class="loading-slot" style="font-size:.75rem;">Sem pedidos</div>';
    }
  });
}

async function avancarStatusAdm(idPedido, statusAtual) {
  let prox = 'solicitados';
  if (statusAtual === 'solicitados') prox = 'viagem';
  if (statusAtual === 'viagem') prox = 'concluido';

  const r = await executarRequisicaoAPI("atualizar_status_pedido", { idPedido, novoStatus: prox });

  if (r.sucesso) {
    exibirToast("Status atualizado!", "success");
    await carregarPedidosAdm();
  } else {
    exibirToast(r.mensagem || "Erro.", "error");
  }
}

/* ═══════════════════════════════════════════════════════════════
   16. LINK TEMPORÁRIO
   ═══════════════════════════════════════════════════════════════ */
async function gerarLinkTemporarioAdm() {
  const sel = document.getElementById('select-duracao-link');
  const inp = document.getElementById('input-duracao-personalizada');
  let min = 15;

  if (sel && sel.value === 'personalizado') {
    min = parseInt(inp.value, 10);
    if (isNaN(min) || min <= 0) return exibirToast("Digite minutos válidos.", "error");
  } else if (sel) {
    min = parseInt(sel.value, 10) || 15;
  }

  mostrarLoader(`Gerando link (${min} min)...`);
  const r = await executarRequisicaoAPI("gerar_link_temporario", { duracaoMinutos: min });
  esconderLoader();

  if (r.sucesso) {
    const link = `${obterUrlBasePlataforma()}?token=${r.token}`;
    const c = document.getElementById('campo-link-gerado');
    const a = document.getElementById('area-link-gerado');
    if (c) c.value = link;
    if (a) a.classList.remove('hidden');
    exibirToast(`Link de ${min} min gerado!`, "success");
  } else {
    exibirToast(r.mensagem || "Erro.", "error");
  }
}

function copiarLinkGerado() {
  const c = document.getElementById('campo-link-gerado');
  if (!c) return;
  c.select();
  navigator.clipboard.writeText(c.value)
    .then(() => exibirToast("Copiado!", "success"))
    .catch(() => { document.execCommand("copy"); exibirToast("Copiado!", "success"); });
}

/* ═══════════════════════════════════════════════════════════════
   17. CADASTRO DE PRODUTO
   ═══════════════════════════════════════════════════════════════ */
async function tratarCadastroProduto(evento) {
  if (evento) evento.preventDefault();

  const nome = document.getElementById('adm-prod-nome').value.trim();
  const preco = parseFloat(document.getElementById('adm-prod-preco').value);
  const visib = document.getElementById('adm-prod-visibilidade').value;
  const url = document.getElementById('adm-prod-foto-url').value.trim();
  const foto = fotoBase64Temporaria || url || "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400";

  if (!nome || !preco || preco <= 0) return exibirToast("Preencha nome e preço.", "error");

  botaoCarregando('btn-salvar-produto', true);
  exibirToast("Salvando...", "info");

  const r = await executarRequisicaoAPI("cadastrar_produto", {
    produto: { nome, preco, foto, visibilidade: visib }
  });

  botaoCarregando('btn-salvar-produto', false);

  if (r.sucesso) {
    exibirToast("Produto adicionado!", "success");
    document.getElementById('form-novo-produto').reset();
    removerFotoCarregada();
    await sincronizarProdutosServidor();
  } else {
    exibirToast(r.mensagem || "Erro.", "error");
  }
}

/* ═══════════════════════════════════════════════════════════════
   18. MODAIS E TOASTS
   ═══════════════════════════════════════════════════════════════ */
function abrirModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('active');
}

function fecharModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('active');
  if (id === 'modal-chat') pararAutoRefreshChat();
}

let _cbConfirmacao = null;

function abrirConfirmacao(titulo, msg, cb) {
  const t = document.getElementById('confirmar-titulo');
  const m = document.getElementById('confirmar-mensagem');
  if (t) t.textContent = titulo;
  if (m) {
    if (typeof msg === 'string' && msg.startsWith('<div')) m.innerHTML = msg;
    else m.textContent = msg;
  }
  _cbConfirmacao = cb;

  const b = document.getElementById('confirmar-btn-ok');
  if (b) {
    b.onclick = () => {
      fecharConfirmacao();
      if (typeof _cbConfirmacao === 'function') _cbConfirmacao();
    };
  }
  abrirModal('modal-confirmar');
}

function abrirConfirmacaoElemento(titulo, el, cb) {
  const t = document.getElementById('confirmar-titulo');
  const m = document.getElementById('confirmar-mensagem');
  if (t) t.textContent = titulo;
  if (m) { m.innerHTML = ''; m.appendChild(el); }
  _cbConfirmacao = cb;

  const b = document.getElementById('confirmar-btn-ok');
  if (b) {
    b.onclick = () => {
      fecharConfirmacao();
      if (typeof _cbConfirmacao === 'function') _cbConfirmacao();
    };
  }
  abrirModal('modal-confirmar');
}

function fecharConfirmacao() {
  fecharModal('modal-confirmar');
  _cbConfirmacao = null;
}

function exibirToast(mensagem, tipo = 'info') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast toast-${tipo}`;
  t.textContent = mensagem;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

document.querySelectorAll('.modal-overlay').forEach(ov => {
  ov.addEventListener('click', e => {
    if (e.target === ov) {
      ov.classList.remove('active');
      if (ov.id === 'modal-chat') pararAutoRefreshChat();
    }
  });
});

/* ═══════════════════════════════════════════════════════════════
   19. EXPORTAÇÃO GLOBAL (BINDINGS)
   ═══════════════════════════════════════════════════════════════ */
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
