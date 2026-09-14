/* ============================================================================
   bindings.js — Delegação Central de Eventos (v6 — Sincronizado e Corrigido)
   ============================================================================
   CORREÇÕES:
     • Ações exclusivas de digitação/mudança (como 'filtro-vitrine') são
       ignoradas no listener de clique, evitando avisos no console.
     • Logout direto sem bloqueios.
     • Demarcação de INÍCIO e FIM em cada bloco funcional.
   ============================================================================ */

(function () {
  'use strict';

  /* ─── INÍCIO: chamarComSeguranca ────────────────────────────── */
  /**
   * Executa uma função global com segurança. Nunca quebra a página se a
   * função ainda não estiver carregada pelo app.js.
   */
  function chamarComSeguranca(nomeFuncao, ...argumentos) {
    if (typeof window[nomeFuncao] === 'function') {
      try {
        return window[nomeFuncao](...argumentos);
      } catch (erro) {
        console.error(`[bindings] Erro ao executar "${nomeFuncao}":`, erro);
      }
    } else {
      console.warn(`[bindings] A função "${nomeFuncao}" ainda não foi carregada.`);
    }
  }
  /* ─── FIM: chamarComSeguranca ────────────────────────────────── */

  // Temporizador do debounce da busca
  let temporizadorBusca = null;

  /* ─── INÍCIO: Listener Global de Clique (click) ─────────────── */
  document.addEventListener('click', function (e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;

    // Ignora formulários (o evento 'submit' cuida deles)
    if (el.tagName === 'FORM') return;

    // Ignora elementos desabilitados
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') {
      e.preventDefault();
      return;
    }

    const acao = el.dataset.action;

    // Ignora no clique ações exclusivas de digitação e seleção de arquivos
    if (['filtro-vitrine', 'upload-imagem', 'mudar-duracao-link'].includes(acao)) {
      return;
    }

    switch (acao) {
      /* Modais */
      case 'abrir-modal':
        e.preventDefault();
        chamarComSeguranca('abrirModal', el.dataset.modal);
        break;

      case 'fechar-modal':
        e.preventDefault();
        chamarComSeguranca('fecharModal', el.dataset.modal);
        break;

      case 'fechar-confirmacao':
        e.preventDefault();
        chamarComSeguranca('fecharConfirmacao');
        break;

      /* Sessão e Contas */
      case 'confirmar-logout':
        e.preventDefault();
        chamarComSeguranca('executarLogout');
        break;

      case 'pedir-desbloqueio':
        e.preventDefault();
        chamarComSeguranca('enviarPedidoDesbloqueio');
        break;

      /* Navegação */
      case 'navegar':
        e.preventDefault();
        chamarComSeguranca('navegarPara', el.dataset.view);
        break;

      /* Carrinho e Checkout */
      case 'criar-pedido':
        e.preventDefault();
        chamarComSeguranca('tratarCriacaoPedido');
        break;

      /* Gestão de Produtos (ADM) */
      case 'remover-foto':
        e.preventDefault();
        chamarComSeguranca('removerFotoCarregada');
        break;

      /* Links Temporários (ADM) */
      case 'gerar-link':
        e.preventDefault();
        chamarComSeguranca('gerarLinkTemporarioAdm');
        break;

      case 'copiar-link':
        e.preventDefault();
        chamarComSeguranca('copiarLinkGerado');
        break;

      /* Painel ADM */
      case 'carregar-painel-adm':
        e.preventDefault();
        chamarComSeguranca('carregarPainelCentralAdm');
        break;

      /* Central de Dúvidas e FAQ */
      case 'abrir-central-duvidas':
        e.preventDefault();
        chamarComSeguranca('abrirCentralDuvidas');
        break;

      case 'toggle-faq':
        e.preventDefault();
        el.closest('.faq-item')?.classList.toggle('active');
        break;

      /* Chat */
      case 'enviar-chat':
        e.preventDefault();
        if (typeof window.enviarMensagemChat === 'function') {
          chamarComSeguranca('enviarMensagemChat');
        } else {
          chamarComSeguranca('tratarEnvioMensagemChat');
        }
        break;

      case 'abrir-chat':
        e.preventDefault();
        chamarComSeguranca('abrirChatPedido', el.dataset.pedidoId);
        break;

      default:
        console.warn('[bindings] Ação de clique não reconhecida:', acao);
    }
  }, false);
  /* ─── FIM: Listener Global de Clique (click) ────────────────── */

  /* ─── INÍCIO: Listener de Submissão de Formulários (submit) ─── */
  document.addEventListener('submit', function (e) {
    const form = e.target.closest('form[data-action]');
    if (!form) return;

    const acao = form.dataset.action;

    switch (acao) {
      case 'enviar-comentario':
        e.preventDefault();
        chamarComSeguranca('tratarEnvioComentario', e);
        break;

      case 'enviar-cadastro':
        e.preventDefault();
        chamarComSeguranca('tratarSolicitacaoCadastro', e);
        break;

      case 'login':
        e.preventDefault();
        chamarComSeguranca('tratarLogin', e);
        break;

      case 'cadastrar-produto':
        e.preventDefault();
        chamarComSeguranca('tratarCadastroProduto', e);
        break;

      case 'enviar-sugestao':
        e.preventDefault();
        chamarComSeguranca('tratarEnvioSugestao', e);
        break;

      case 'adicionar-faq':
        e.preventDefault();
        chamarComSeguranca('tratarAdicionarFaq', e);
        break;

      default:
        console.warn('[bindings] Ação de formulário não reconhecida:', acao);
    }
  }, false);
  /* ─── FIM: Listener de Submissão de Formulários (submit) ─────── */

  /* ─── INÍCIO: Listener de Entrada de Texto (input) ──────────── */
  document.addEventListener('input', function (e) {
    if (e.target.matches('[data-action="filtro-vitrine"]')) {
      const termo = e.target.value;
      clearTimeout(temporizadorBusca);
      temporizadorBusca = setTimeout(function () {
        if (typeof window.aplicarFiltroVitrine === 'function') {
          chamarComSeguranca('aplicarFiltroVitrine', termo);
        } else if (typeof window.filtrarVitrineEmTempoReal === 'function') {
          chamarComSeguranca('filtrarVitrineEmTempoReal', termo);
        }
      }, 150);
    }
  }, false);
  /* ─── FIM: Listener de Entrada de Texto (input) ──────────────── */

  /* ─── INÍCIO: Listener de Alteração (change) ─────────────────── */
  document.addEventListener('change', function (e) {
    // Upload de imagem do produto (ADM)
    if (e.target.matches('[data-action="upload-imagem"]')) {
      chamarComSeguranca('processarUploadImagem', e);
      return;
    }

    // Seletor de tempo do link temporário (ADM)
    if (e.target.matches('[data-action="mudar-duracao-link"]')) {
      const inputPersonalizado = document.getElementById('input-duracao-personalizada');
      if (inputPersonalizado) {
        if (e.target.value === 'personalizado') {
          inputPersonalizado.classList.remove('hidden');
          inputPersonalizado.focus();
        } else {
          inputPersonalizado.classList.add('hidden');
        }
      }
      return;
    }
  }, false);
  /* ─── FIM: Listener de Alteração (change) ───────────────────── */

  /* ─── INÍCIO: Listener de Teclado (keydown) ─────────────────── */
  document.addEventListener('keydown', function (e) {
    // ESC fecha qualquer modal aberto
    if (e.key === 'Escape' || e.key === 'Esc') {
      const modaisAbertos = document.querySelectorAll('.modal-overlay.active, .modal.active');
      modaisAbertos.forEach(modal => chamarComSeguranca('fecharModal', modal.id));
      chamarComSeguranca('fecharConfirmacao');
      return;
    }

    // Enter no chat envia a mensagem (sem Shift)
    if (e.key === 'Enter' && !e.shiftKey && e.target && e.target.id === 'chat-input') {
      e.preventDefault();
      if (typeof window.enviarMensagemChat === 'function') {
        chamarComSeguranca('enviarMensagemChat');
      } else {
        chamarComSeguranca('tratarEnvioMensagemChat');
      }
    }
  }, false);
  /* ─── FIM: Listener de Teclado (keydown) ─────────────────────── */

})();
