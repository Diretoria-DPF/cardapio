/* ============================================================================
   bindings.js — Delegação Central de Eventos e Atalhos de Teclado (v3)
   ============================================================================
   MELHORIAS APLICADAS:
     • Proteção de chamada segura: nunca quebra a página se a função não existir.
     • Ignora cliques em elementos desativados (disabled).
     • O clique continua a ignorar elementos <form> (mantendo o submit seguro).
     • Atalho de teclado: tecla "Enter" envia mensagem no chat temporário.
     • Atalho de teclado: tecla "ESC" fecha qualquer modal aberto.
     • Busca na vitrine com debounce (pausa de 150ms para poupar processador).
     • Suporte para ação 'abrir-chat' vinculada ao número do pedido.
   ============================================================================ */

(function () {
  'use strict';

  /**
   * Executa uma função global com segurança.
   * Se o app.js ainda não tiver declarado a função, avisa na consola sem travar o código.
   * 
   * @param {string} nomeFuncao - Nome da função que queremos executar.
   * @param {...*} argumentos - Parâmetros opcionais para passar à função.
   */
  function chamarComSeguranca(nomeFuncao, ...argumentos) {
    if (typeof window[nomeFuncao] === 'function') {
      try {
        return window[nomeFuncao](...argumentos);
      } catch (erro) {
        console.error(`[bindings] Erro ao executar "${nomeFuncao}":`, erro);
      }
    } else {
      console.warn(`[bindings] A função "${nomeFuncao}" ainda não foi carregada no app.js.`);
    }
  }

  // Temporizador usado pelo debounce na caixa de pesquisa
  let temporizadorBusca = null;

  /* ─── BLOCO 1: CLIQUE (Delegação Global) ────────────────────── */
  document.addEventListener('click', function (e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;

    // 1. Ignora se o elemento for um formulário (o evento 'submit' cuida dele)
    if (el.tagName === 'FORM') return;

    // 2. Ignora cliques em botões desativados
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') {
      e.preventDefault();
      return;
    }

    const acao = el.dataset.action;

    switch (acao) {
      /* Modais ---------------------------------------------------- */
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

      /* Sessão e Contas ------------------------------------------- */
      case 'confirmar-logout':
        e.preventDefault();
        if (typeof window.exibirConfirmacao === 'function') {
          window.exibirConfirmacao(
            'Encerrar Sessão',
            'Tem a certeza de que deseja sair da sua conta?',
            () => chamarComSeguranca('executarLogout')
          );
        } else {
          chamarComSeguranca('executarLogout');
        }
        break;

      case 'pedir-desbloqueio':
        e.preventDefault();
        chamarComSeguranca('enviarPedidoDesbloqueio');
        break;

      /* Navegação de Telas --------------------------------------- */
      case 'navegar':
        e.preventDefault();
        chamarComSeguranca('navegarPara', el.dataset.view);
        break;

      /* Carrinho e Checkout -------------------------------------- */
      case 'criar-pedido':
        e.preventDefault();
        chamarComSeguranca('tratarCriacaoPedido');
        break;

      /* Produtos (ADM) ------------------------------------------- */
      case 'remover-foto':
        e.preventDefault();
        chamarComSeguranca('removerFotoCarregada');
        break;

      /* Links Temporários (ADM) ---------------------------------- */
      case 'gerar-link':
        e.preventDefault();
        chamarComSeguranca('gerarLinkTemporarioAdm');
        break;

      case 'copiar-link':
        e.preventDefault();
        chamarComSeguranca('copiarLinkGerado');
        break;

// Alterna a exibição do campo de minutos personalizados no Painel ADM
    document.addEventListener('change', function (e) {
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
        }
    }, false);
          
      /* Painel ADM ----------------------------------------------- */
      case 'carregar-painel-adm':
        e.preventDefault();
        chamarComSeguranca('carregarPainelCentralAdm');
        break;

/* Central de Dúvidas e Sugestões (Novo) ------------------- */
   case 'abrir-central-duvidas':
     e.preventDefault();
     chamarComSeguranca('abrirCentralDuvidas');
     break;

   case 'toggle-faq':
     e.preventDefault();
     el.closest('.faq-item')?.classList.toggle('active');
     break;
          
      /* Chat de Entregas ----------------------------------------- */
      case 'enviar-chat':
        e.preventDefault();
        // Tenta o nome padrão ou a variação com prefixo
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

  /* ─── BLOCO 2: SUBMIT (Formulários Protegidos) ──────────────── */
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

  /* ─── BLOCO 3: INPUT (Busca com Debounce Suave) ────────────── */
  document.addEventListener('input', function (e) {
    if (e.target.matches('[data-action="filtro-vitrine"]')) {
      const termo = e.target.value;
      
      // Cancela a busca anterior se o usuário ainda estiver a teclar
      clearTimeout(temporizadorBusca);

      // Aguarda 150 milissegundos antes de atualizar os cartões
      temporizadorBusca = setTimeout(function () {
        if (typeof window.aplicarFiltroVitrine === 'function') {
          chamarComSeguranca('aplicarFiltroVitrine', termo);
        } else if (typeof window.filtrarVitrineEmTempoReal === 'function') {
          chamarComSeguranca('filtrarVitrineEmTempoReal', termo);
        }
      }, 150);
    }
  }, false);

  /* ─── BLOCO 4: CHANGE (Upload de Foto/GIF do Dispositivo) ────── */
  document.addEventListener('change', function (e) {
    if (e.target.matches('[data-action="upload-imagem"]')) {
      chamarComSeguranca('processarUploadImagem', e);
    }
  }, false);

  /* ─── BLOCO 5: TECLADO (Atalhos Úteis: Enter e ESC) ─────────── */
  document.addEventListener('keydown', function (e) {
    // 1. Tecla ESC fecha qualquer modal aberto na tela
    if (e.key === 'Escape' || e.key === 'Esc') {
      const modaisAbertos = document.querySelectorAll('.modal-overlay.active, .modal.active');
      modaisAbertos.forEach(modal => {
        chamarComSeguranca('fecharModal', modal.id);
      });
      chamarComSeguranca('fecharConfirmacao');
      return;
    }

    // 2. Tecla Enter no campo de chat envia a mensagem diretamente
    if (e.key === 'Enter' && !e.shiftKey && e.target && e.target.id === 'chat-input') {
      e.preventDefault();
      if (typeof window.enviarMensagemChat === 'function') {
        chamarComSeguranca('enviarMensagemChat');
      } else {
        chamarComSeguranca('tratarEnvioMensagemChat');
      }
    }
  }, false);

})();
