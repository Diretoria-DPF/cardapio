/* ============================================================================
   bindings.js — Delegação central de eventos
   ============================================================================
   POR QUE EXISTE:
     O HTML não tem mais NENHUM onclick/onsubmit/oninput/onchange.
     Em vez disso, cada elemento tem data-action="...".
     Este arquivo escuta os eventos no document e roteia para a função certa.

   VANTAGENS:
     • Compatível com CSP estrita (script-src 'self')
     • Todos os handlers visíveis num só lugar (fácil debugar)
     • Funciona para elementos criados dinamicamente pelo JS
   ============================================================================ */

(function () {
  'use strict';

  /* ─── BLOCO 1: CLIQUE (data-action em botões) ────────────────── */
  document.addEventListener('click', function (e) {
    // Sobe na árvore até achar um [data-action]; nada se não achar
    const el = e.target.closest('[data-action]');
    if (!el) return;

    const acao = el.dataset.action;

    switch (acao) {
      /* Modais ---------------------------------------------------- */
      case 'abrir-modal':
        e.preventDefault();
        abrirModal(el.dataset.modal);
        break;

      case 'fechar-modal':
        e.preventDefault();
        fecharModal(el.dataset.modal);
        break;

      case 'fechar-confirmacao':
        e.preventDefault();
        fecharConfirmacao();
        break;

      /* Sessão --------------------------------------------------- */
      case 'confirmar-logout':
        e.preventDefault();
        confirmarLogout();
        break;

      case 'pedir-desbloqueio':
        e.preventDefault();
        enviarPedidoDesbloqueio();
        break;

      /* Navegação entre abas ------------------------------------- */
      case 'navegar':
        e.preventDefault();
        navegarPara(el.dataset.view);
        break;

      /* Carrinho / pedidos --------------------------------------- */
      case 'criar-pedido':
        e.preventDefault();
        tratarCriacaoPedido();
        break;

      /* Produtos (ADM) ------------------------------------------- */
      case 'remover-foto':
        e.preventDefault();
        removerFotoCarregada();
        break;

      /* Links temporários (ADM) ---------------------------------- */
      case 'gerar-link':
        e.preventDefault();
        gerarLinkTemporarioAdm();
        break;

      case 'copiar-link':
        e.preventDefault();
        copiarLinkGerado();
        break;

      /* Painel ADM ----------------------------------------------- */
      case 'carregar-painel-adm':
        e.preventDefault();
        carregarPainelCentralAdm();
        break;

      /* Chat ----------------------------------------------------- */
      case 'enviar-chat':
        e.preventDefault();
        enviarMensagemChat();
        break;

      /* Ação desconhecida → avisa no console (ajuda a debugar) --- */
      default:
        console.warn('[bindings] data-action desconhecida:', acao);
    }
  }, false);

  /* ─── BLOCO 2: SUBMIT (data-action em <form>) ───────────────── */
  document.addEventListener('submit', function (e) {
    const form = e.target.closest('form[data-action]');
    if (!form) return;

    const acao = form.dataset.action;

    switch (acao) {
      case 'enviar-comentario':
        e.preventDefault();
        tratarEnvioComentario(e);
        break;

      case 'enviar-cadastro':
        e.preventDefault();
        tratarSolicitacaoCadastro(e);
        break;

      case 'login':
        e.preventDefault();
        tratarLogin(e);
        break;

      case 'cadastrar-produto':
        e.preventDefault();
        tratarCadastroProduto(e);
        break;

      default:
        console.warn('[bindings] form data-action desconhecida:', acao);
    }
  }, false);

  /* ─── BLOCO 3: INPUT (filtro em tempo real) ─────────────────── */
  document.addEventListener('input', function (e) {
    if (e.target.matches('[data-action="filtro-vitrine"]')) {
      aplicarFiltroVitrine();
    }
  }, false);

  /* ─── BLOCO 4: CHANGE (upload de arquivo) ───────────────────── */
  document.addEventListener('change', function (e) {
    if (e.target.matches('[data-action="upload-imagem"]')) {
      processarUploadImagem(e);
    }
  }, false);

})();
