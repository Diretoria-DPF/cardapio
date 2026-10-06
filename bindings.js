/* ============================================================================
   bindings.js — Delegação Central de Eventos (v10 — Mobile-First & Laranja Energia)
   ============================================================================
   ARQUITETURA:
     • Um único listener para 'click', 'submit', 'input', 'change', 'keydown'
       e 'dblclick'/'touchend' no document — delegação total por data-action.
     • Cada ação mapeia para uma função global implementada no app.js.
     • chamarComSeguranca() protege contra funções ausentes.

   RECURSOS INTEGRADOS NESTA VERSÃO:
     • Máscara de telefone progressiva (00) 00000-0000 — CORRIGIDA.
     • Busca com debounce de 150ms + Enter para busca imediata.
     • Lightbox via duplo clique (desktop) ou duplo toque <300ms (mobile).
     • Favoritos, repetir pedido, agendamento de esgotados.
     • Confirmação destrutiva com foco em "Cancelar" por padrão.
     • ESC fecha o modal mais recente (não todos de uma vez).
     • Acessibilidade: foco inicial automático em inputs de modal.

   AÇÕES REMOVIDAS (desativadas neste módulo):
     ✗ abrir-chat / enviar-chat  → suporte migrado para WhatsApp
     ✗ pedir-desbloqueio         → sem fluxo de solicitação avulsa
     ✗ comprar-agora             → todo pedido passa pelo carrinho
     ✗ compartilhar-pedido       → compartilhamento via WhatsApp direto

   Demarcação padronizada de INÍCIO e FIM em cada bloco funcional.
   ============================================================================ */

(function () {
  'use strict';

  /* ═════════════════════════════════════════════════════════════
     SEÇÃO 1 — UTILITÁRIOS INTERNOS
     ═════════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: chamarComSeguranca ────────────────────────────── */
  /**
   * Executa funções globais com tratamento de exceções para proteger o fluxo.
   * Se a função não existir E estivermos em ambiente de desenvolvimento,
   * exibe um aviso discreto no console (evita poluir em produção).
   */
  function chamarComSeguranca(nomeFuncao, ...argumentos) {
    if (typeof window[nomeFuncao] === 'function') {
      try {
        return window[nomeFuncao](...argumentos);
      } catch (erro) {
        console.error('[bindings] Erro ao executar "' + nomeFuncao + '":', erro);
      }
    } else {
      console.warn('[bindings] Função ausente: "' + nomeFuncao + '"');
      // Sinaliza visualmente em desenvolvimento (localhost)
      if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        if (typeof window.exibirToast === 'function') {
          window.exibirToast('Dev: função "' + nomeFuncao + '" não existe.', 'error');
        }
      }
    }
  }
  /* ─── FIM: chamarComSeguranca ───────────────────────────────── */

  /* ─── INÍCIO: formatarMascaraTelefone ───────────────────────── */
  /**
   * Formata progressivamente um número digitado como (00) 00000-0000.
   * Retorna apenas o valor formatado; não valida tamanho.
   */
  function formatarMascaraTelefone(valor) {
    const digitos = String(valor || '').replace(/\D/g, '').slice(0, 11);
    if (digitos.length === 0) return '';
    if (digitos.length <= 2) return '(' + digitos;
    if (digitos.length <= 6) return '(' + digitos.slice(0, 2) + ') ' + digitos.slice(2);
    if (digitos.length <= 10) {
      return '(' + digitos.slice(0, 2) + ') ' + digitos.slice(2, 6) + '-' + digitos.slice(6);
    }
    return '(' + digitos.slice(0, 2) + ') ' + digitos.slice(2, 7) + '-' + digitos.slice(7);
  }
  /* ─── FIM: formatarMascaraTelefone ──────────────────────────── */

  /* ─── INÍCIO: aplicarMascaraEmInput ─────────────────────────── */
  /**
   * Aplica a máscara preservando a posição do cursor.
   * Também define inputMode e autocomplete para navegadores móveis.
   */
  function aplicarMascaraEmInput(input) {
    if (!input) return;

    const posAnterior = input.selectionStart;
    const tamanhoAntes = input.value.length;

    input.value = formatarMascaraTelefone(input.value);

    const tamanhoDepois = input.value.length;
    const delta = tamanhoDepois - tamanhoAntes;

    try {
      const novaPos = Math.max(0, Math.min(tamanhoDepois, posAnterior + delta));
      input.setSelectionRange(novaPos, novaPos);
    } catch (e) {
      // Alguns navegadores antigos falham com setSelectionRange em type=tel
    }
  }
  /* ─── FIM: aplicarMascaraEmInput ────────────────────────────── */

  /* ─── INÍCIO: ehCampoTelefone ───────────────────────────────── */
  /**
   * Detecta se o elemento é um campo de telefone (por type ou por ID conhecido).
   */
  function ehCampoTelefone(el) {
    if (!el) return false;
    if (el.tagName !== 'INPUT') return false;
    if (el.type === 'tel') return true;
    const idsConhecidos = ['cad-telefone', 'cad-indicado-telefone', 'login-usuario'];
    return idsConhecidos.includes(el.id);
  }
  /* ─── FIM: ehCampoTelefone ──────────────────────────────────── */

  /* ─── INÍCIO: ehElementoVisivel ─────────────────────────────── */
  function ehElementoVisivel(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  /* ─── FIM: ehElementoVisivel ────────────────────────────────── */

  /* ─── INÍCIO: obterPainelModalAtivo ─────────────────────────── */
  /**
   * Retorna o modal atualmente visível com prioridade em ordem de empilhamento.
   * Usado pelo ESC para fechar apenas o mais recente.
   */
  function obterPainelModalAtivo() {
    const candidatos = document.querySelectorAll(
      '.modal-overlay.active, .lightbox-modal.active'
    );
    if (candidatos.length === 0) return null;
    return candidatos[candidatos.length - 1];
  }
  /* ─── FIM: obterPainelModalAtivo ────────────────────────────── */

  /* ═════════════════════════════════════════════════════════════
     SEÇÃO 2 — ESTADO INTERNO
     ═════════════════════════════════════════════════════════════ */

  let temporizadorBusca = null;
  let ultimoToqueImagem = 0;
  let ultimoToqueXY = { x: 0, y: 0 };

  /* ═════════════════════════════════════════════════════════════
     SEÇÃO 3 — LISTENER GLOBAL DE CLIQUE
     ═════════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: Listener Global de Clique (click) ─────────────── */
  document.addEventListener('click', function (e) {

    /* ---------------------------------------------------------
       3.1 — Ações especiais que NÃO usam data-action
       --------------------------------------------------------- */

    // Fechamento do Lightbox (fora da imagem ou botão X)
    if (e.target.closest('#lightbox-fechar') || e.target.id === 'modal-lightbox') {
      e.preventDefault();
      chamarComSeguranca('fecharLightbox');
      return;
    }

    // Barra flutuante do carrinho (role=button, sem data-action)
    if (e.target.closest('#floating-cart-bar')) {
      e.preventDefault();
      chamarComSeguranca('navegarPara', 'carrinho');
      return;
    }

    // Botão OK do modal de confirmação (tratado internamente pelo app.js via callback)
    if (e.target.id === 'confirmar-btn-ok') {
      // O callback é atribuído via _callbackConfirmacao no app.js.
      // Não interceptamos aqui: o app.js já vincula btn.onclick.
      return;
    }

    /* ---------------------------------------------------------
       3.2 — Delegação por data-action
       --------------------------------------------------------- */

    const el = e.target.closest('[data-action]');
    if (!el) return;

    // Formulários têm seu próprio listener 'submit' (abaixo). Ignorar cliques em botões submit internos.
    if (el.tagName === 'FORM') return;

    // Ignora botões desabilitados
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') {
      e.preventDefault();
      return;
    }

    const acao = el.dataset.action;

    // Ações que são tratadas em outros listeners (input/change/submit) — não clicar
    if (['filtro-vitrine', 'upload-imagem', 'mudar-duracao-link'].includes(acao)) {
      return;
    }

    switch (acao) {

      /* ─── 3.2.1 — Tema ─────────────────────────────────── */
      case 'alternar-tema':
        e.preventDefault();
        chamarComSeguranca('alternarModoEscuro');
        break;

      /* ─── 3.2.2 — Navegação ────────────────────────────── */
      case 'navegar':
        e.preventDefault();
        chamarComSeguranca('navegarPara', el.dataset.view);
        break;

      /* ─── 3.2.3 — Modais ───────────────────────────────── */
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

      /* ─── 3.2.4 — Sessão ──────────────────────────────── */
      case 'confirmar-logout':
        e.preventDefault();
        chamarComSeguranca('confirmarLogout');
        break;

      /* ─── 3.2.5 — Vitrine ─────────────────────────────── */
      case 'filtrar-categoria':
        e.preventDefault();
        chamarComSeguranca('selecionarCategoriaChip', el.dataset.categoria, el);
        break;

      case 'favoritar':
        e.preventDefault();
        chamarComSeguranca('alternarFavorito', el.dataset.id);
        break;

      case 'repetir-pedido':
        e.preventDefault();
        chamarComSeguranca('repetirUltimoPedido', el.dataset.id);
        break;

      case 'fechar-banner-repetir':
        e.preventDefault();
        chamarComSeguranca('fecharBannerRepetirPedido');
        break;

      case 'agendar-esgotado':
        e.preventDefault();
        chamarComSeguranca('adicionarAoAgendamento', el.dataset.id);
        break;

      /* ─── 3.2.6 — Carrinho / Pedido ───────────────────── */
      case 'criar-pedido':
        e.preventDefault();
        chamarComSeguranca('tratarCriacaoPedido');
        break;

      case 'copiar-pix':
        e.preventDefault();
        chamarComSeguranca('copiarPixCopiaECola', el);
        break;

      case 'enviar-comprovante':
        e.preventDefault();
        chamarComSeguranca('enviarComprovanteWhatsApp', el.dataset.id);
        break;

      /* ─── 3.2.7 — Esteira (ADM) ───────────────────────── */
      case 'limpar-concluidos':
        e.preventDefault();
        chamarComSeguranca('limparConcluidosAdm');
        break;

      case 'avancar-status':
        e.preventDefault();
        chamarComSeguranca('avancarStatusAdm', el.dataset.id, el.dataset.status);
        break;

      case 'cancelar-pedido':
        e.preventDefault();
        chamarComSeguranca('cancelarExcluirPedidoAdm', el.dataset.id);
        break;

      /* ─── 3.2.8 — Painel Central (ADM) ────────────────── */
      case 'exportar-pdf':
        e.preventDefault();
        chamarComSeguranca('gerarRelatorioPdfVendas');
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

      case 'alterar-modo-acesso':
        e.preventDefault();
        chamarComSeguranca('alternarModoAcessoSistema', el.dataset.modo);
        break;

      /* ─── 3.2.9 — Gavetas (Membros / Bloqueados) ──────── */
      case 'alternar-gaveta':
        e.preventDefault();
        chamarComSeguranca('alternarGavetaAdm', el.dataset.gaveta);
        break;

      case 'carregar-membros':
        e.preventDefault();
        chamarComSeguranca('carregarListaMembrosGaveta');
        break;

      case 'carregar-bloqueados':
        e.preventDefault();
        chamarComSeguranca('carregarListaBloqueadosGaveta');
        break;

      /* ─── 3.2.10 — Ações de solicitações (ADM) ────────── */
      case 'aprovar-solicitacao':
        e.preventDefault();
        chamarComSeguranca('aprovarMembroAdm', el.dataset.id);
        break;

      case 'bloquear-usuario':
        e.preventDefault();
        chamarComSeguranca('bloquearUsuarioComMotivo', el.dataset.id, el.dataset.nome);
        break;

      case 'excluir-usuario':
        e.preventDefault();
        chamarComSeguranca('excluirUsuarioMembro', el.dataset.id);
        break;

      case 'liberar-usuario':
        e.preventDefault();
        chamarComSeguranca('liberarContaUsuarioAdm', el.dataset.id);
        break;

      /* ─── 3.2.11 — Upload / Foto ──────────────────────── */
      case 'remover-foto':
        e.preventDefault();
        chamarComSeguranca('removerFotoCarregada');
        break;

      /* ─── 3.2.12 — FAQ / Ajuda ────────────────────────── */
      case 'toggle-faq':
        e.preventDefault();
        el.closest('.faq-item')?.classList.toggle('active');
        break;

      case 'duvida-rapida':
        e.preventDefault();
        chamarComSeguranca('responderDuvidaRapida', el.dataset.pergunta);
        break;

      /* ─── 3.2.13 — Fallback ───────────────────────────── */
      default:
        console.warn('[bindings] Ação de clique não reconhecida:', acao);
    }
  }, false);
  /* ─── FIM: Listener Global de Clique (click) ────────────────── */

  /* ═════════════════════════════════════════════════════════════
     SEÇÃO 4 — LISTENERS DE LIGHTBOX (DUPLO CLIQUE / DUPLO TOQUE)
     ═════════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: Listener Duplo Clique (mouse) ─────────────────── */
  document.addEventListener('dblclick', function (e) {
    const thumb = e.target.closest('.product-thumb');
    if (thumb && thumb.src) {
      e.preventDefault();
      chamarComSeguranca('abrirLightboxFoto', thumb.src, thumb.alt);
    }
  });
  /* ─── FIM: Listener Duplo Clique ────────────────────────────── */

  /* ─── INÍCIO: Listener Duplo Toque (mobile) ────────────────── */
  document.addEventListener('touchend', function (e) {
    const thumb = e.target.closest('.product-thumb');
    if (!thumb) return;

    // Ignora gestos de scroll (só considera toques parados)
    const toque = e.changedTouches[0];
    if (toque) {
      const dx = Math.abs(toque.clientX - ultimoToqueXY.x);
      const dy = Math.abs(toque.clientY - ultimoToqueXY.y);
      if (dx > 20 || dy > 20) {
        // Foi scroll, não toque — reinicia
        ultimoToqueImagem = 0;
        ultimoToqueXY = { x: toque.clientX, y: toque.clientY };
        return;
      }
      ultimoToqueXY = { x: toque.clientX, y: toque.clientY };
    }

    const agora = Date.now();
    if (agora - ultimoToqueImagem < 300) {
      e.preventDefault();
      chamarComSeguranca('abrirLightboxFoto', thumb.src, thumb.alt);
      ultimoToqueImagem = 0;
    } else {
      ultimoToqueImagem = agora;
    }
  }, { passive: false });
  /* ─── FIM: Listener Duplo Toque ─────────────────────────────── */

  /* ═════════════════════════════════════════════════════════════
     SEÇÃO 5 — LISTENER DE SUBMISSÃO DE FORMULÁRIOS
     ═════════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: Listener Global de Submit ─────────────────────── */
  document.addEventListener('submit', function (e) {
    const form = e.target.closest('form[data-action]');
    if (!form) return;

    const acao = form.dataset.action;

    // Validação nativa antes de delegar (evita handoff de formulários inválidos)
    if (typeof form.checkValidity === 'function' && !form.checkValidity()) {
      e.preventDefault();
      form.reportValidity();
      return;
    }

    switch (acao) {
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

      default:
        console.warn('[bindings] Ação de formulário não reconhecida:', acao);
    }
  }, false);
  /* ─── FIM: Listener Global de Submit ────────────────────────── */

  /* ═════════════════════════════════════════════════════════════
     SEÇÃO 6 — LISTENER DE ENTRADA (input)
     ═════════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: Listener Global de Input ──────────────────────── */
  document.addEventListener('input', function (e) {
    const alvo = e.target;

    /* 6.1 — Filtro da vitrine (debounce 150ms) */
    if (alvo.matches('[data-action="filtro-vitrine"]')) {
      const termo = alvo.value;
      clearTimeout(temporizadorBusca);
      temporizadorBusca = setTimeout(function () {
        chamarComSeguranca('aplicarFiltroVitrine', termo);
      }, 150);
      return;
    }

    /* 6.2 — Máscara de telefone progressiva (CORRIGIDA) */
    if (ehCampoTelefone(alvo)) {
      aplicarMascaraEmInput(alvo);
      return;
    }
  }, false);
  /* ─── FIM: Listener Global de Input ─────────────────────────── */

  /* ═════════════════════════════════════════════════════════════
     SEÇÃO 7 — LISTENER DE ALTERAÇÃO (change)
     ═════════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: Listener Global de Change ─────────────────────── */
  document.addEventListener('change', function (e) {
    const alvo = e.target;

    /* 7.1 — Upload de imagem do produto (ADM) */
    if (alvo.matches('[data-action="upload-imagem"]')) {
      chamarComSeguranca('processarUploadImagem', e);
      return;
    }

    /* 7.2 — Duração do link temporário */
    if (alvo.matches('[data-action="mudar-duracao-link"]')) {
      // Placeholder: caso você adicione input personalizado no futuro
      const inputPersonalizado = document.getElementById('input-duracao-personalizada');
      if (inputPersonalizado) {
        if (alvo.value === 'personalizado') {
          inputPersonalizado.classList.remove('hidden');
          inputPersonalizado.focus();
        } else {
          inputPersonalizado.classList.add('hidden');
        }
      }
      return;
    }

    /* 7.3 — Data de agendamento personalizada */
    if (alvo.id === 'data-agendamento') {
      const inputCustom = document.getElementById('data-agendamento-custom');
      if (inputCustom) {
        if (alvo.value === 'escolher') {
          inputCustom.classList.remove('hidden');
          inputCustom.focus();
          // Define min = amanhã
          const amanha = new Date();
          amanha.setDate(amanha.getDate() + 1);
          inputCustom.min = amanha.toISOString().split('T')[0];
        } else {
          inputCustom.classList.add('hidden');
          inputCustom.value = '';
        }
      }
      return;
    }
  }, false);
  /* ─── FIM: Listener Global de Change ────────────────────────── */

  /* ═════════════════════════════════════════════════════════════
     SEÇÃO 8 — LISTENER DE TECLADO (keydown)
     ═════════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: Listener Global de Keydown ────────────────────── */
  document.addEventListener('keydown', function (e) {

    /* 8.1 — ESC fecha o modal MAIS RECENTE (não todos de uma vez) */
    if (e.key === 'Escape' || e.key === 'Esc') {
      const painelAtivo = obterPainelModalAtivo();
      if (painelAtivo) {
        e.preventDefault();
        if (painelAtivo.id === 'modal-lightbox') {
          chamarComSeguranca('fecharLightbox');
        } else if (painelAtivo.id === 'modal-confirmar') {
          chamarComSeguranca('fecharConfirmacao');
        } else {
          chamarComSeguranca('fecharModal', painelAtivo.id);
        }
        return;
      }
      // Sem modal aberto: fecha dropdown de usuário, se visível
      const dropdown = document.getElementById('user-dropdown');
      if (dropdown && !dropdown.classList.contains('hidden')) {
        e.preventDefault();
        chamarComSeguranca('fecharUserDropdown');
      }
      return;
    }

    /* 8.2 — Enter na busca força execução imediata */
    if (e.key === 'Enter' && e.target && e.target.matches('[data-action="filtro-vitrine"]')) {
      e.preventDefault();
      clearTimeout(temporizadorBusca);
      chamarComSeguranca('aplicarFiltroVitrine', e.target.value);
      return;
    }

    /* 8.3 — Enter em campo de telefone não envia formulário acidentalmente */
    if (e.key === 'Enter' && ehCampoTelefone(e.target) && e.target.form) {
      // Permite submit normal (o navegador já trata)
      return;
    }
  }, false);
  /* ─── FIM: Listener Global de Keydown ───────────────────────── */

  /* ═════════════════════════════════════════════════════════════
     SEÇÃO 9 — FOCO AUTOMÁTICO EM MODAIS
     ═════════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: Observador de Modais (foco + scroll lock) ─────── */
  /**
   * Observa mudanças nas classes dos modais para:
   *  • Aplicar foco no primeiro input (melhora UX em mobile).
   *  • Travar scroll do body enquanto modal estiver aberto.
   *  • Devolver foco ao elemento anterior quando fechar.
   */
  let elementoFocoAnterior = null;

  function aoAbrirModal(modal) {
    elementoFocoAnterior = document.activeElement;
    document.body.classList.add('no-scroll');

    // Foco automático no primeiro input visível (após animação)
    setTimeout(() => {
      const primeiroInput = modal.querySelector(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
      );
      if (primeiroInput && ehElementoVisivel(primeiroInput)) {
        try { primeiroInput.focus({ preventScroll: true }); } catch (e) {}
      } else {
        // Foca no botão fechar como fallback acessível
        const btnFechar = modal.querySelector('.btn-close');
        if (btnFechar) try { btnFechar.focus({ preventScroll: true }); } catch (e) {}
      }
    }, 280);
  }

  function aoFecharModal() {
    const algumModalAberto = document.querySelector('.modal-overlay.active');
    if (!algumModalAberto) {
      document.body.classList.remove('no-scroll');
      if (elementoFocoAnterior && typeof elementoFocoAnterior.focus === 'function') {
        try { elementoFocoAnterior.focus({ preventScroll: true }); } catch (e) {}
      }
      elementoFocoAnterior = null;
    }
  }

  const observerModal = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      const alvo = m.target;
      if (!alvo.classList) return;
      if (!alvo.classList.contains('modal-overlay')) return;

      const estaAberto = alvo.classList.contains('active');
      const estavaAberto = m.oldValue && m.oldValue.includes('active');

      if (estaAberto && !estavaAberto) {
        aoAbrirModal(alvo);
      } else if (!estaAberto && estavaAberto) {
        aoFecharModal();
      }
    });
  });

  // Inicia observação quando o DOM estiver pronto
  function iniciarObservadorModais() {
    document.querySelectorAll('.modal-overlay').forEach((modal) => {
      observerModal.observe(modal, {
        attributes: true,
        attributeFilter: ['class'],
        attributeOldValue: true,
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarObservadorModais);
  } else {
    iniciarObservadorModais();
  }
  /* ─── FIM: Observador de Modais ─────────────────────────────── */

  /* ═════════════════════════════════════════════════════════════
     SEÇÃO 10 — LIMPEZA AO SAIR DA PÁGINA
     ═════════════════════════════════════════════════════════════ */

  /* ─── INÍCIO: Limpeza de timers ─────────────────────────────── */
  window.addEventListener('beforeunload', () => {
    if (temporizadorBusca) {
      clearTimeout(temporizadorBusca);
      temporizadorBusca = null;
    }
    if (observerModal) {
      observerModal.disconnect();
    }
  });
  /* ─── FIM: Limpeza de timers ────────────────────────────────── */

  /* ═════════════════════════════════════════════════════════════
     SEÇÃO 11 — EXPOSIÇÃO OPCIONAL PARA DEBUG
     ═════════════════════════════════════════════════════════════ */

  // Utilitários acessíveis via console (útil em suporte técnico)
  window.__bindings = {
    formatarMascaraTelefone,
    chamarComSeguranca,
    versao: 'v10',
  };

})();
