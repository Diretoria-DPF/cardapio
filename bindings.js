/* ============================================================================
   bindings.js — Delegação Central de Eventos (v8 — Acessibilidade & Gestão ADM)
   ============================================================================
   NOVIDADES DESTA VERSÃO:
     • Máscara automática de telefone para formato (00) 00000-0000 em tempo real.
     • Duplo toque / clique em imagens de produto para abrir visualizador Lightbox.
     • Alternância dinâmica de tema (Modo Escuro / Claro).
     • Barra flutuante de sacola e gatilho de compra rápida em 1 toque.
     • Gestão em lote no ADM: seleção individual e botão "Selecionar Todos".
     • Disparo de exportação em PDF e compartilhamento de pedido via WhatsApp.
     • Acionador do Atendente Virtual e pílulas de dúvidas rápidas.
     • Demarcação de INÍCIO e FIM em cada bloco funcional.
   ============================================================================ */

(function () {
  'use strict';

  /* ─── INÍCIO: chamarComSeguranca ────────────────────────────── */
  /**
   * Executa funções globais com tratamento de exceções para proteger o fluxo.
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

  let temporizadorBusca = null;
  let ultimoToqueImagem = 0;

  /* ─── INÍCIO: formatarMascaraTelefone ───────────────────────── */
  /**
   * Aplica formatação visual progressiva: (00) 00000-0000
   */
  function formatarMascaraTelefone(valor) {
    let digitos = String(valor || '').replace(/\D/g, '').slice(0, 11);
    if (digitos.length === 0) return '';
    if (digitos.length <= 2) return `(${digitos}`;
    if (digitos.length <= 7) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  }
  /* ─── FIM: formatarMascaraTelefone ───────────────────────────── */

  /* ─── INÍCIO: Listener Global de Clique (click) ─────────────── */
  document.addEventListener('click', function (e) {
    // 1. Fechamento de Lightbox ao tocar fora da imagem ou no botão fechar
    if (e.target.closest('#lightbox-fechar') || e.target.id === 'modal-lightbox') {
      e.preventDefault();
      chamarComSeguranca('fecharLightbox');
      return;
    }

    // 2. Barra flutuante de sacola (estilo iFood)
    if (e.target.closest('#floating-cart-bar')) {
      e.preventDefault();
      chamarComSeguranca('navegarPara', 'carrinho');
      return;
    }

    // 3. Verificação de elementos com data-action
    const el = e.target.closest('[data-action]');
    if (!el) return;

    if (el.tagName === 'FORM') return;

    if (el.disabled || el.getAttribute('aria-disabled') === 'true') {
      e.preventDefault();
      return;
    }

    const acao = el.dataset.action;

    // Ignora ações exclusivas de digitação e seleção de arquivos
    if (['filtro-vitrine', 'upload-imagem', 'mudar-duracao-link'].includes(acao)) {
      return;
    }

    switch (acao) {
      /* Tema (Modo Escuro / Claro) */
      case 'alternar-tema':
        e.preventDefault();
        chamarComSeguranca('alternarModoEscuro');
        break;

      /* Modais do Sistema */
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

      /* Sessão e Acesso */
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

      /* Categorias e Vitrine */
      case 'filtrar-categoria':
        e.preventDefault();
        chamarComSeguranca('selecionarCategoriaChip', el.dataset.categoria, el);
        break;

      /* Cesta de Compras e Checkout */
      case 'criar-pedido':
        e.preventDefault();
        chamarComSeguranca('tratarCriacaoPedido');
        break;

      case 'comprar-agora':
        e.preventDefault();
        chamarComSeguranca('comprarProdutoDireto', el.dataset.id);
        break;

      case 'compartilhar-pedido':
        e.preventDefault();
        chamarComSeguranca('compartilharPedidoWhatsApp', el.dataset.id);
        break;

      /* Atendente Virtual & Dúvidas */
      case 'abrir-assistente':
        e.preventDefault();
        chamarComSeguranca('abrirAssistenteVirtual');
        break;

      case 'duvida-rapida':
        e.preventDefault();
        chamarComSeguranca('responderDuvidaRapida', el.dataset.pergunta);
        break;

      case 'abrir-central-duvidas':
        e.preventDefault();
        chamarComSeguranca('abrirCentralDuvidas');
        break;

      case 'toggle-faq':
        e.preventDefault();
        el.closest('.faq-item')?.classList.toggle('active');
        break;

      /* Gestão em Lote e Relatórios (ADM) */
      case 'toggle-selecionar-todos':
        // Gerenciado pelo listener 'change'
        break;

      case 'aprovar-lote':
        e.preventDefault();
        chamarComSeguranca('aprovarSolicitacoesSelecionadasLote');
        break;

      case 'exportar-pdf':
        e.preventDefault();
        chamarComSeguranca('gerarRelatorioPdfVendas');
        break;

      case 'remover-foto':
        e.preventDefault();
        chamarComSeguranca('removerFotoCarregada');
        break;

      case 'gerar-link':
        e.preventDefault();
        chamarComSeguranca('gerarLinkTemporarioAdm');
        break;

      case 'copiar-link':
        e.preventDefault();
        chamarComSeguranca('copiarLinkGerado');
        break;

      case 'carregar-painel-adm':
        e.preventDefault();
        chamarComSeguranca('carregarPainelCentralAdm');
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

  /* ─── INÍCIO: Listener Duplo Toque / Clique (Lightbox) ──────── */
  // Duplo clique com mouse
  document.addEventListener('dblclick', function (e) {
    const thumb = e.target.closest('.product-thumb');
    if (thumb && thumb.src) {
      e.preventDefault();
      chamarComSeguranca('abrirLightboxFoto', thumb.src, thumb.alt);
    }
  });

  // Duplo toque no mobile (<300ms)
  document.addEventListener('touchend', function (e) {
    const thumb = e.target.closest('.product-thumb');
    if (!thumb) return;

    const agora = Date.now();
    if (agora - ultimoToqueImagem < 300) {
      e.preventDefault();
      chamarComSeguranca('abrirLightboxFoto', thumb.src, thumb.alt);
      ultimoToqueImagem = 0;
    } else {
      ultimoToqueImagem = agora;
    }
  }, { passive: false });
  /* ─── FIM: Listener Duplo Toque / Clique (Lightbox) ────────── */

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
    // 1. Filtro em tempo real na vitrine com debounce
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
      return;
    }

    // 2. Máscara de telefone progressiva
    if (e.target.matches('input[type="tel"]') || e.target.id === 'cad-telefone') {
      e.target.value = formatarMascaraTelefone(e.target.value);
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

    // Duração do link temporário
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

    // Checkbox master "Selecionar Todos" (ADM)
    if (e.target.id === 'chk-selecionar-todos-cadastros') {
      const checked = e.target.checked;
      document.querySelectorAll('.chk-solicitacao-item').forEach(chk => {
        chk.checked = checked;
      });
      chamarComSeguranca('atualizarContadorSelecaoLote');
      return;
    }

    // Checkboxes individuais de solicitações (ADM)
    if (e.target.matches('.chk-solicitacao-item')) {
      chamarComSeguranca('atualizarContadorSelecaoLote');
      return;
    }
  }, false);
  /* ─── FIM: Listener de Alteração (change) ───────────────────── */

  /* ─── INÍCIO: Listener de Teclado (keydown) ─────────────────── */
  document.addEventListener('keydown', function (e) {
    // ESC fecha Lightbox, modais e menus flutuantes
    if (e.key === 'Escape' || e.key === 'Esc') {
      chamarComSeguranca('fecharLightbox');
      const modaisAbertos = document.querySelectorAll('.modal-overlay.active, .modal.active');
      modaisAbertos.forEach(modal => chamarComSeguranca('fecharModal', modal.id));
      chamarComSeguranca('fecharConfirmacao');
      return;
    }

    // Enter no chat envia mensagem (sem Shift)
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
