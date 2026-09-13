/* ============================================================================
   bindings.js — Delegação central de eventos (v2 corrigido)
   ============================================================================
   CORREÇÃO PRINCIPAL:
     • O handler de CLIQUE agora IGNORA elementos <form>.
       Antes, clicar num <button type="submit"> subia até o <form data-action="...">
       e disparava um erro "data-action desconhecida". Agora o submit cuida disso.
   ============================================================================ */

(function () {
  'use strict';

  /* ─── BLOCO 1: CLIQUE ──────────────────────────────────────── */
  document.addEventListener('click', function (e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;

    // ⚠️ CORREÇÃO CRÍTICA: se o elemento com data-action for um <form>,
    // IGNORA no clique — o evento de submit cuida dele.
    if (el.tagName === 'FORM') return;

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

      /* Navegação ------------------------------------------------ */
      case 'navegar':
        e.preventDefault();
        navegarPara(el.dataset.view);
        break;

      /* Carrinho ------------------------------------------------- */
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

      default:
        console.warn('[bindings] data-action desconhecida (clique):', acao);
    }
  }, false);

  /* ─── BLOCO 2: SUBMIT (formulários) ────────────────────────── */
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

  /* ─── BLOCO 3: INPUT (filtro) ──────────────────────────────── */
  document.addEventListener('input', function (e) {
    if (e.target.matches('[data-action="filtro-vitrine"]')) {
      aplicarFiltroVitrine();
    }
  }, false);

  /* ─── BLOCO 4: CHANGE (upload) ─────────────────────────────── */
  document.addEventListener('change', function (e) {
    if (e.target.matches('[data-action="upload-imagem"]')) {
      processarUploadImagem(e);
    }
  }, false);

})();
