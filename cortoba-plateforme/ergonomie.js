// ═══════════════════════════════════════════════════════════
//  CORTOBA ATELIER — Ergonomie v1
//  Améliorations UX/UI : toasts, Ctrl+K, FAB, tri colonnes,
//  mode clair, sidebar persistante, breadcrumb, validation…
// ═══════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ════════════════════════════════════════════════════════
  //  1. SYSTÈME DE TOAST AMÉLIORÉ
  // ════════════════════════════════════════════════════════
  var _toastContainer = null;

  function getToastContainer() {
    if (!_toastContainer) {
      _toastContainer = document.createElement('div');
      _toastContainer.id = 'ergo-toast-container';
      document.body.appendChild(_toastContainer);
    }
    return _toastContainer;
  }

  var TOAST_ICONS = {
    success: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
    error:   '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    warning: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info:    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  };

  // Remplace showToast existant avec version enrichie
  // Signature rétrocompatible : showToast(msg, typeOuCouleur, action)
  window.showToast = function (msg, typeOrColor, action) {
    var type = 'info';
    if (typeOrColor === 'success' || typeOrColor === 'error' || typeOrColor === 'warning' || typeOrColor === 'info') {
      type = typeOrColor;
    }
    // Rétrocompatibilité : si une couleur CSS est passée, on garde info
    var icon = TOAST_ICONS[type] || TOAST_ICONS.info;
    var duration = (type === 'error') ? 5000 : 3000;

    var container = getToastContainer();
    var t = document.createElement('div');
    t.className = 'ergo-toast ergo-toast-' + type;

    var actionHtml = '';
    if (action && action.label && action.fn) {
      var fnStr = encodeURIComponent(action.fn.toString());
      actionHtml = '<button class="ergo-toast-action" data-fn="' + fnStr + '">' + action.label + '</button>';
    }

    t.innerHTML =
      '<span class="ergo-toast-icon ergo-toast-icon-' + type + '">' + icon + '</span>' +
      '<span class="ergo-toast-msg">' + msg + '</span>' +
      actionHtml +
      '<button class="ergo-toast-close" title="Fermer">✕</button>';

    container.appendChild(t);

    // Bouton action
    var actionBtn = t.querySelector('.ergo-toast-action');
    if (actionBtn && action && action.fn) {
      actionBtn.addEventListener('click', function () {
        try { action.fn(); } catch (e) {}
        dismissToast(t);
      });
    }

    // Bouton fermer
    t.querySelector('.ergo-toast-close').addEventListener('click', function () { dismissToast(t); });

    // Animation entrée
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { t.classList.add('ergo-toast-in'); });
    });

    // Fermeture automatique
    var timer = setTimeout(function () { if (t.parentNode) dismissToast(t); }, duration);
    t.addEventListener('mouseenter', function () { clearTimeout(timer); });
    t.addEventListener('mouseleave', function () { timer = setTimeout(function () { if (t.parentNode) dismissToast(t); }, 1500); });
  };

  function dismissToast(t) {
    t.classList.remove('ergo-toast-in');
    t.classList.add('ergo-toast-out');
    setTimeout(function () { if (t.parentNode) t.remove(); }, 320);
  }


  // ════════════════════════════════════════════════════════
  //  2. BANNIÈRE HORS LIGNE
  // ════════════════════════════════════════════════════════
  var _offlineBanner = null;
  var _isOffline = !navigator.onLine;

  function showOfflineBanner() {
    if (_offlineBanner) return;
    _offlineBanner = document.createElement('div');
    _offlineBanner.id = 'ergo-offline-banner';
    _offlineBanner.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>' +
      ' Connexion perdue — <button onclick="window.location.reload()">Réessayer</button>';
    document.body.appendChild(_offlineBanner);
  }

  function hideOfflineBanner() {
    if (_offlineBanner) { _offlineBanner.remove(); _offlineBanner = null; }
  }

  window.addEventListener('offline', function () { _isOffline = true; showOfflineBanner(); });
  window.addEventListener('online',  function () {
    _isOffline = false;
    hideOfflineBanner();
    window.showToast('Connexion rétablie', 'success');
  });

  // Patch apiFetch pour détecter les erreurs réseau
  var _patchApiFetch = function () {
    var orig = window.apiFetch;
    if (!orig || orig._ergoPatched) return;
    window.apiFetch = function (path, opts) {
      return orig(path, opts).catch(function (e) {
        var msg = (e && e.message) || '';
        var isNet = !msg || /fetch|network|failed to fetch/i.test(msg);
        if (isNet && !_isOffline) showOfflineBanner();
        throw e;
      });
    };
    window.apiFetch._ergoPatched = true;
  };


  // ════════════════════════════════════════════════════════
  //  3. KPIs CLIQUABLES
  // ════════════════════════════════════════════════════════
  var KPI_MAP = [
    { index: 0, page: 'bilans' },
    { index: 1, page: 'projets' },
    { index: 2, page: 'devis',       filterFn: function () { applyDevisFilter('En attente'); } },
    { index: 3, page: 'facturation', filterFn: function () { applyFactureFilter('Impayée'); } },
    { index: 4, page: 'depenses' },
    { index: 5, page: 'equipe' },
  ];

  function applyDevisFilter(statut) {
    var sel = document.getElementById('devis-filter-statut');
    if (sel) { sel.value = statut; sel.dispatchEvent(new Event('change')); }
  }
  function applyFactureFilter(statut) {
    var sel = document.getElementById('factures-filter-statut');
    if (sel) { sel.value = statut; sel.dispatchEvent(new Event('change')); }
  }

  function initKpiLinks() {
    var cards = document.querySelectorAll('#page-dashboard .kpi-card');
    KPI_MAP.forEach(function (cfg) {
      var card = cards[cfg.index];
      if (!card || card.classList.contains('ergo-kpi-link')) return;
      card.classList.add('ergo-kpi-link');
      card.addEventListener('click', function () {
        window.showPage && window.showPage(cfg.page);
        if (cfg.filterFn) setTimeout(cfg.filterFn, 200);
      });
    });
  }


  // ════════════════════════════════════════════════════════
  //  4. TRI PAR COLONNES
  // ════════════════════════════════════════════════════════
  function makeTableSortable(table) {
    if (!table || table.dataset.ergoSortable) return;
    table.dataset.ergoSortable = '1';
    var ths = table.querySelectorAll('thead th');
    var sortState = { col: -1, asc: true };

    ths.forEach(function (th, colIdx) {
      var text = th.textContent.trim();
      if (!text) return; // Ignorer les colonnes d'action vides
      th.classList.add('ergo-sortable');
      var icon = document.createElement('span');
      icon.className = 'ergo-sort-icon';
      icon.textContent = '↕';
      th.appendChild(icon);

      th.addEventListener('click', function () {
        if (sortState.col === colIdx) {
          sortState.asc = !sortState.asc;
        } else {
          sortState.col = colIdx;
          sortState.asc = true;
        }
        // Reset icônes
        ths.forEach(function (t) {
          var ic = t.querySelector('.ergo-sort-icon');
          if (ic) ic.textContent = '↕';
          t.classList.remove('sorted-asc', 'sorted-desc');
        });
        icon.textContent = sortState.asc ? '↑' : '↓';
        th.classList.add(sortState.asc ? 'sorted-asc' : 'sorted-desc');

        // Trier les lignes
        var tbody = table.querySelector('tbody');
        if (!tbody) return;
        var rows = Array.from(tbody.querySelectorAll('tr'));
        rows.sort(function (a, b) {
          var aC = a.querySelectorAll('td')[colIdx];
          var bC = b.querySelectorAll('td')[colIdx];
          var aT = aC ? aC.textContent.trim() : '';
          var bT = bC ? bC.textContent.trim() : '';
          // Valeur numérique (montants, pourcentages)
          var aN = parseFloat(aT.replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
          var bN = parseFloat(bT.replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
          if (!isNaN(aN) && !isNaN(bN)) return sortState.asc ? aN - bN : bN - aN;
          return sortState.asc
            ? aT.localeCompare(bT, 'fr', { sensitivity: 'base' })
            : bT.localeCompare(aT, 'fr', { sensitivity: 'base' });
        });
        rows.forEach(function (r) { tbody.appendChild(r); });
      });
    });
  }

  window.makeTableSortable = makeTableSortable;

  function initSortableTables() {
    document.querySelectorAll('.table-wrap table, .card table').forEach(makeTableSortable);
  }


  // ════════════════════════════════════════════════════════
  //  5. RECHERCHE GLOBALE — PALETTE DE COMMANDES (Ctrl+K)
  // ════════════════════════════════════════════════════════
  var _palette = null;
  var _palInput = null;
  var _palList  = null;
  var _palOpen  = false;
  var _palItems = [];
  var _palIdx   = 0;

  function buildIndex() {
    var items = [];
    var pages = [
      { id: 'dashboard',   label: 'Tableau de bord', icon: '◻' },
      { id: 'devis',       label: 'Offres & Devis',  icon: '📄' },
      { id: 'projets',     label: 'Projets',          icon: '📐' },
      { id: 'facturation', label: 'Facturation',       icon: '💶' },
      { id: 'bilans',      label: 'Bilans',            icon: '📊' },
      { id: 'depenses',    label: 'Dépenses',          icon: '💸' },
      { id: 'fiscalite',   label: 'Fiscalité',         icon: '🧾' },
      { id: 'equipe',      label: 'Équipe',            icon: '👥' },
      { id: 'clients',     label: 'Clients',           icon: '👤' },
      { id: 'parametres',  label: 'Paramètres',        icon: '⚙️' },
      { id: 'flotte',      label: 'Flotte véhicules',  icon: '🚗' },
      { id: 'flotte-reservations', label: 'Réservations véhicules', icon: '📅' },
      { id: 'flotte-km',   label: 'Kilométrage & Carburant', icon: '⛽' },
      { id: 'flotte-entretien', label: 'Entretien véhicules', icon: '🔧' },
      { id: 'flotte-couts', label: 'Coûts & TCO',       icon: '💰' },
      { id: 'flotte-conformite', label: 'Conformité & Assurances', icon: '🛡️' },
    ];
    pages.forEach(function (p) {
      items.push({ type: 'page', label: p.label, sub: 'Navigation', icon: p.icon,
        action: (function (pid) { return function () { window.showPage && window.showPage(pid); }; })(p.id) });
    });

    var clients = window.getClients ? window.getClients() : [];
    clients.forEach(function (c) {
      var name = c.displayNom || ((c.prenom || '') + ' ' + (c.nom || '')).trim() || c.raison || '';
      items.push({ type: 'client', label: name, sub: 'Client · ' + (c.code || ''), icon: '👤',
        action: function () { window.showPage && window.showPage('clients'); } });
    });

    var projets = window.getProjets ? window.getProjets() : [];
    projets.forEach(function (p) {
      items.push({ type: 'projet', label: p.nom || '', sub: 'Projet · ' + (p.phase || ''), icon: '📐',
        action: function () { window.showPage && window.showPage('projets'); } });
    });

    var devis = window.getDevis ? window.getDevis() : [];
    devis.forEach(function (d) {
      items.push({ type: 'devis', label: (d.ref || '') + ' — ' + (d.client || ''), sub: 'Devis · ' + (d.statut || ''), icon: '📄',
        action: function () { window.showPage && window.showPage('devis'); } });
    });

    return items;
  }

  function openPalette() {
    if (_palOpen) return;
    _palOpen = true;
    if (!_palette) createPalette();
    _palette.style.display = 'flex';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { _palette.classList.add('ergo-cmd-open'); });
    });
    _palInput.value = '';
    _palInput.focus();
    renderPaletteResults('');
  }

  function closePalette() {
    if (!_palOpen) return;
    _palOpen = false;
    if (_palette) {
      _palette.classList.remove('ergo-cmd-open');
      setTimeout(function () { if (_palette) _palette.style.display = 'none'; }, 220);
    }
  }

  function createPalette() {
    _palette = document.createElement('div');
    _palette.id = 'ergo-cmd-palette';
    _palette.innerHTML =
      '<div class="ergo-cmd-box">' +
        '<div class="ergo-cmd-input-wrap">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
          '<input id="ergo-pal-input" class="ergo-cmd-input" placeholder="Rechercher une page, client, projet…" autocomplete="off" spellcheck="false" />' +
          '<span class="ergo-cmd-esc">ESC</span>' +
        '</div>' +
        '<div id="ergo-pal-list" class="ergo-cmd-list"></div>' +
      '</div>';
    document.body.appendChild(_palette);

    _palInput = document.getElementById('ergo-pal-input');
    _palList  = document.getElementById('ergo-pal-list');

    _palInput.addEventListener('input', function () { renderPaletteResults(_palInput.value); });
    _palInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape')    { closePalette(); e.preventDefault(); }
      if (e.key === 'ArrowDown') { movePalSel(1);  e.preventDefault(); }
      if (e.key === 'ArrowUp')   { movePalSel(-1); e.preventDefault(); }
      if (e.key === 'Enter')     { activatePalSel(); e.preventDefault(); }
    });
    _palette.addEventListener('click', function (e) { if (e.target === _palette) closePalette(); });
  }

  function renderPaletteResults(query) {
    var all = buildIndex();
    var q = (query || '').toLowerCase().trim();
    _palItems = q
      ? all.filter(function (it) { return (it.label + ' ' + it.sub).toLowerCase().indexOf(q) !== -1; }).slice(0, 14)
      : all.filter(function (it) { return it.type === 'page'; }).slice(0, 11);
    _palIdx = 0;

    if (_palItems.length === 0) {
      _palList.innerHTML = '<div class="ergo-cmd-empty">Aucun résultat pour « ' + escHtml(query) + ' »</div>';
      return;
    }

    _palList.innerHTML = _palItems.map(function (it, i) {
      return '<div class="ergo-cmd-item' + (i === 0 ? ' ergo-cmd-selected' : '') + '" data-idx="' + i + '">' +
        '<span class="ergo-cmd-item-icon">' + it.icon + '</span>' +
        '<span class="ergo-cmd-item-label">' + escHtml(it.label) + '</span>' +
        '<span class="ergo-cmd-item-sub">' + escHtml(it.sub) + '</span>' +
        '</div>';
    }).join('');

    _palList.querySelectorAll('.ergo-cmd-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var idx = parseInt(el.getAttribute('data-idx'), 10);
        if (_palItems[idx]) { _palItems[idx].action(); closePalette(); }
      });
    });
  }

  function movePalSel(dir) {
    _palIdx = Math.max(0, Math.min(_palItems.length - 1, _palIdx + dir));
    _palList.querySelectorAll('.ergo-cmd-item').forEach(function (el, i) {
      el.classList.toggle('ergo-cmd-selected', i === _palIdx);
    });
    var sel = _palList.querySelector('.ergo-cmd-selected');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  function activatePalSel() {
    if (_palItems[_palIdx]) { _palItems[_palIdx].action(); closePalette(); }
  }

  window.openCommandPalette = openPalette;


  // ════════════════════════════════════════════════════════
  //  6. AUTO-SAUVEGARDE DES MODALES
  // ════════════════════════════════════════════════════════
  var MODAL_DRAFT_FIELDS = {
    'modal-devis':    ['dv-client', 'dv-objet', 'dv-montant', 'dv-notes'],
    'modal-facture':  ['fa-client', 'fa-objet', 'fa-montant-ht'],
    'modal-depense':  ['dep-libelle', 'dep-montant', 'dep-categorie'],
    'modal-projet':   ['pj-nom', 'pj-client-sel', 'pj-honoraires'],
  };

  function setupDraftAutoSave(modalId, fields) {
    var draftKey = 'cortoba_draft_' + modalId;
    function saveDraft() {
      var draft = {};
      fields.forEach(function (fid) {
        var el = document.getElementById(fid);
        if (el) draft[fid] = el.value;
      });
      try { localStorage.setItem(draftKey, JSON.stringify(draft)); } catch (e) {}
    }
    fields.forEach(function (fid) {
      var el = document.getElementById(fid);
      if (el) {
        el.addEventListener('input', saveDraft);
        el.addEventListener('change', saveDraft);
      }
    });
  }

  function restoreDraft(modalId, fields) {
    var draftKey = 'cortoba_draft_' + modalId;
    try {
      var draft = JSON.parse(localStorage.getItem(draftKey) || 'null');
      if (!draft) return false;
      var restored = false;
      fields.forEach(function (fid) {
        var el = document.getElementById(fid);
        if (el && draft[fid]) { el.value = draft[fid]; restored = true; }
      });
      return restored;
    } catch (e) { return false; }
  }

  window.clearModalDraft = function (modalId) {
    try { localStorage.removeItem('cortoba_draft_' + modalId); } catch (e) {}
  };

  function initModalDrafts() {
    Object.keys(MODAL_DRAFT_FIELDS).forEach(function (modalId) {
      setupDraftAutoSave(modalId, MODAL_DRAFT_FIELDS[modalId]);
    });

    // Patch openModal pour proposer de restaurer le brouillon
    var origOpen = window.openModal;
    if (origOpen && !origOpen._ergoPatched) {
      window.openModal = function (id) {
        origOpen(id);
        var fields = MODAL_DRAFT_FIELDS[id];
        if (fields) {
          var had = restoreDraft(id, fields);
          if (had) {
            window.showToast('Brouillon restauré', 'info', {
              label: 'Effacer',
              fn: function () {
                window.clearModalDraft(id);
                var origInner = window.openModal;
                window.openModal = origOpen;
                origOpen(id);
                window.openModal = origInner;
              }
            });
          }
        }
      };
      window.openModal._ergoPatched = true;
    }

    // Effacer brouillon à la fermeture réussie (closeModal existant)
    var origClose = window.closeModal;
    if (origClose && !origClose._ergoPatched) {
      window.closeModal = function (id) {
        origClose(id);
        // On ne supprime PAS le brouillon automatiquement afin de le proposer à la prochaine ouverture
      };
      window.closeModal._ergoPatched = true;
    }
  }


  // ════════════════════════════════════════════════════════
  //  7. SKELETON SCREENS
  // ════════════════════════════════════════════════════════
  function showSkeletons() {
    document.querySelectorAll('#page-dashboard .kpi-card').forEach(function (c) {
      c.classList.add('ergo-skeleton');
    });
  }
  function hideSkeletons() {
    document.querySelectorAll('.ergo-skeleton').forEach(function (c) {
      c.classList.remove('ergo-skeleton');
    });
  }
  window.ergoHideSkeletons = hideSkeletons;

  // Intercept le chargement initial pour montrer les skeletons
  var origLoadData = window.loadData;
  if (origLoadData && !origLoadData._ergoPatched) {
    window.loadData = function () {
      showSkeletons();
      return origLoadData.apply(this, arguments).then(function (r) {
        setTimeout(hideSkeletons, 200);
        return r;
      }).catch(function (e) {
        hideSkeletons();
        throw e;
      });
    };
    window.loadData._ergoPatched = true;
  }


  // ════════════════════════════════════════════════════════
  //  8. BREADCRUMB
  // ════════════════════════════════════════════════════════
  var BC_LABELS = {
    dashboard:   { section: '',            label: 'Tableau de bord' },
    devis:       { section: 'Activité',    label: 'Offres & Devis' },
    projets:     { section: 'Activité',    label: 'Projets' },
    facturation: { section: 'Activité',    label: 'Facturation' },
    bilans:      { section: 'Finance',     label: 'Bilans' },
    depenses:    { section: 'Finance',     label: 'Dépenses' },
    fiscalite:   { section: 'Finance',     label: 'Fiscalité' },
    nas:         { section: 'Ressources',  label: 'Serveur NAS' },
    equipe:      { section: 'Ressources',  label: 'Équipe' },
    clients:     { section: 'Ressources',  label: 'Clients' },
    parametres:  { section: 'Paramètres', label: 'Paramètres' },
  };

  function updateBreadcrumb(pageId) {
    var bc = document.getElementById('ergo-breadcrumb');
    if (!bc) return;
    var info = BC_LABELS[pageId] || { section: '', label: pageId };
    bc.innerHTML =
      '<span class="ergo-bc-home" onclick="showPage(\'dashboard\')" title="Retour au tableau de bord">Cortoba</span>' +
      (info.section ? '<span class="ergo-bc-sep">›</span><span class="ergo-bc-section">' + info.section + '</span>' : '') +
      '<span class="ergo-bc-sep">›</span><span class="ergo-bc-current">' + info.label + '</span>';
  }

  function injectBreadcrumb() {
    var headerLeft = document.querySelector('.app-header-left');
    var sectionLabel = document.getElementById('section-label');
    if (!headerLeft || !sectionLabel || document.getElementById('ergo-breadcrumb')) return;
    var bc = document.createElement('div');
    bc.id = 'ergo-breadcrumb';
    bc.className = 'ergo-breadcrumb';
    // Remplacer le section-label par le breadcrumb
    headerLeft.replaceChild(bc, sectionLabel);
    updateBreadcrumb('dashboard');
  }


  // ════════════════════════════════════════════════════════
  //  9. MODE CLAIR / SOMBRE
  // ════════════════════════════════════════════════════════
  var _isDark = true;

  function applyTheme(dark) {
    _isDark = dark;
    document.body.classList.toggle('ergo-light', !dark);
    var btn = document.getElementById('ergo-theme-toggle');
    if (btn) btn.innerHTML = dark ? '☀️' : '🌙';
    try { localStorage.setItem('cortoba_theme', dark ? 'dark' : 'light'); } catch (e) {}
  }

  window.toggleTheme = function () { applyTheme(!_isDark); };


  // ════════════════════════════════════════════════════════
  //  10. BOUTON FAB — CRÉATION RAPIDE
  // ════════════════════════════════════════════════════════
  var _fabOpen = false;

  window.toggleFAB = function () {
    _fabOpen = !_fabOpen;
    var menu = document.getElementById('ergo-fab-menu');
    var btn  = document.getElementById('ergo-fab-btn');
    if (menu) menu.classList.toggle('ergo-fab-menu-open', _fabOpen);
    if (btn)  btn.classList.toggle('ergo-fab-active', _fabOpen);
  };

  window.fabAction = function (fn) {
    _fabOpen = false;
    var menu = document.getElementById('ergo-fab-menu');
    var btn  = document.getElementById('ergo-fab-btn');
    if (menu) menu.classList.remove('ergo-fab-menu-open');
    if (btn)  btn.classList.remove('ergo-fab-active');
    if (typeof fn === 'function') fn();
  };

  function injectFAB() {
    if (document.getElementById('ergo-fab')) return;
    var fab = document.createElement('div');
    fab.id = 'ergo-fab';

    var items = [
      { label: 'Nouveau devis',    fn: "fabAction(function(){showPage('devis');setTimeout(function(){openModal('modal-devis');},120);})" },
      { label: 'Nouveau projet',   fn: "fabAction(function(){openConfigurateur();})" },
      { label: 'Nouveau client',   fn: "fabAction(function(){showPage('clients');setTimeout(function(){openModal('modal-client');},120);})" },
      { label: 'Nouvelle facture', fn: "fabAction(function(){showPage('facturation');setTimeout(function(){openModal('modal-facture');},120);})" },
      { label: 'Ajouter dépense', fn: "fabAction(function(){showPage('depenses');setTimeout(function(){openModal('modal-depense');},120);})" },
    ];

    var plusSVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

    fab.innerHTML =
      '<div id="ergo-fab-menu" class="ergo-fab-menu">' +
      items.map(function (it) {
        return '<button class="ergo-fab-item" onclick="' + it.fn + '">' + plusSVG + it.label + '</button>';
      }).join('') +
      '</div>' +
      '<button id="ergo-fab-btn" class="ergo-fab-btn" onclick="toggleFAB()" title="Création rapide">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
      '</button>';

    document.body.appendChild(fab);
    fab.classList.add('ergo-fab-visible');

    // Fermer le menu FAB si on clique ailleurs
    document.addEventListener('click', function (e) {
      if (_fabOpen && !fab.contains(e.target)) { window.toggleFAB(); }
    }, true);
  }


  // ════════════════════════════════════════════════════════
  //  11. EXPORT CSV
  // ════════════════════════════════════════════════════════
  window.exportTableCSV = function (tableEl, filename) {
    var table = typeof tableEl === 'string' ? document.querySelector(tableEl) : tableEl;
    if (!table) { window.showToast('Tableau introuvable', 'error'); return; }

    var rows = [];
    var headers = Array.from(table.querySelectorAll('thead th')).map(function (th) {
      // Retirer le texte du sort icon
      var clone = th.cloneNode(true);
      var icon = clone.querySelector('.ergo-sort-icon');
      if (icon) icon.remove();
      return '"' + clone.textContent.trim().replace(/"/g, '""') + '"';
    });
    rows.push(headers.join(','));

    table.querySelectorAll('tbody tr').forEach(function (tr) {
      var cells = Array.from(tr.querySelectorAll('td')).map(function (td) {
        var badge = td.querySelector('.badge');
        var text = badge ? badge.textContent.trim() : td.textContent.trim();
        // Nettoyer les icônes unicode
        text = text.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
        return '"' + text.replace(/"/g, '""') + '"';
      });
      if (cells.filter(function (c) { return c !== '""'; }).length > 0) rows.push(cells.join(','));
    });

    var csv = '\uFEFF' + rows.join('\r\n'); // BOM pour Excel
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = (filename || 'export') + '.csv';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    window.showToast('Export CSV téléchargé', 'success');
  };


  // ════════════════════════════════════════════════════════
  //  12. SIDEBAR — ÉTAT MÉMORISÉ (Desktop)
  // ════════════════════════════════════════════════════════
  var _sidebarCollapsed = false;

  window.toggleSidebarDesktop = function () {
    var sidebar     = document.getElementById('sidebar');
    var mainContent = document.querySelector('.main-content');
    if (!sidebar) return;
    if (window.innerWidth <= 900) { window.toggleSidebar && window.toggleSidebar(); return; }
    _sidebarCollapsed = !_sidebarCollapsed;
    sidebar.classList.toggle('ergo-sidebar-collapsed', _sidebarCollapsed);
    if (mainContent) mainContent.classList.toggle('ergo-mc-collapsed', _sidebarCollapsed);
    try { localStorage.setItem('cortoba_sidebar_collapsed', _sidebarCollapsed ? '1' : '0'); } catch (e) {}
  };

  function restoreSidebarState() {
    try {
      if (localStorage.getItem('cortoba_sidebar_collapsed') === '1' && window.innerWidth > 900) {
        _sidebarCollapsed = true;
        var sidebar = document.getElementById('sidebar');
        var mc = document.querySelector('.main-content');
        if (sidebar) sidebar.classList.add('ergo-sidebar-collapsed');
        if (mc) mc.classList.add('ergo-mc-collapsed');
      }
    } catch (e) {}
  }


  // ════════════════════════════════════════════════════════
  //  13. RACCOURCIS CLAVIER
  // ════════════════════════════════════════════════════════
  document.addEventListener('keydown', function (e) {
    // Ctrl+K : palette
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openPalette();
      return;
    }

    // Escape : fermer modal ouverte ou palette
    if (e.key === 'Escape') {
      if (_palOpen) { closePalette(); e.preventDefault(); return; }
      if (_fabOpen) { window.toggleFAB && window.toggleFAB(); e.preventDefault(); return; }
      var openModals = document.querySelectorAll('.modal-overlay.open');
      if (openModals.length > 0) {
        var last = openModals[openModals.length - 1];
        window.closeModal && window.closeModal(last.id);
        e.preventDefault();
      }
    }
  });


  // ════════════════════════════════════════════════════════
  //  14. FORMATAGE AUTOMATIQUE DES MONTANTS TND
  // ════════════════════════════════════════════════════════
  function formatTND(val) {
    if (isNaN(val)) return '';
    var parts = val.toFixed(3).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
    return parts.join(',');
  }

  function initTNDField(input) {
    if (!input || input.dataset.ergoTnd) return;
    input.dataset.ergoTnd = '1';

    input.addEventListener('blur', function () {
      var raw = parseFloat(input.value.replace(/\u202f/g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
      if (!isNaN(raw) && raw >= 0) {
        input.dataset.rawTnd = raw;
        input.title = formatTND(raw) + ' TND';
      }
    });
  }

  function initTNDFields() {
    var selectors = [
      'input[id*="montant"]', 'input[id*="honoraires"]',
      'input[id*="budget"]', 'input[id*="depense"]',
      'input[id*="irpp"]', 'input[id*="sim-"]',
    ];
    document.querySelectorAll(selectors.join(',')).forEach(initTNDField);
  }


  // ════════════════════════════════════════════════════════
  //  15. VALIDATION INLINE
  // ════════════════════════════════════════════════════════
  function addValidator(inputId, testFn, message) {
    var input = document.getElementById(inputId);
    if (!input || input.dataset.ergoValidated) return;
    input.dataset.ergoValidated = '1';

    var err = document.createElement('span');
    err.className = 'ergo-field-err';
    err.textContent = message;
    var parent = input.closest('.form-field') || input.parentNode;
    parent.appendChild(err);

    function check() {
      var ok = testFn(input.value);
      err.style.display = ok ? 'none' : 'block';
      input.classList.toggle('ergo-input-invalid', !ok);
      return ok;
    }

    input.addEventListener('blur', check);
    input.addEventListener('input', function () {
      if (input.classList.contains('ergo-input-invalid')) check();
    });
  }

  function initValidations() {
    var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    var telRe   = /^[\+\d\s\-().]{8,20}$/;
    addValidator('cl-email',    function (v) { return !v || emailRe.test(v); }, 'Adresse email invalide');
    addValidator('cl-tel',      function (v) { return !v || telRe.test(v); },  'Numéro de téléphone invalide');
    addValidator('cl-whatsapp', function (v) { return !v || telRe.test(v); },  'Numéro WhatsApp invalide');
  }


  // ════════════════════════════════════════════════════════
  //  16. DUPLICATION D'ENTITÉS
  // ════════════════════════════════════════════════════════
  window.duplicateDevis = function (devisId) {
    var devis = window.getDevis ? window.getDevis() : [];
    var orig  = devis.find(function (d) { return d.id === devisId || d.ref === devisId; });
    if (!orig) { window.showToast('Devis introuvable', 'error'); return; }
    window.showPage && window.showPage('devis');
    setTimeout(function () {
      window.openModal && window.openModal('modal-devis');
      setTimeout(function () {
        var map = { 'dv-client': orig.client, 'dv-objet': (orig.objet || '') + ' (copie)', 'dv-montant': orig.montant };
        Object.keys(map).forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.value = map[id] || '';
        });
        window.showToast('Données copiées depuis ' + orig.ref, 'info');
      }, 250);
    }, 120);
  };

  window.duplicateProjet = function (projetId) {
    var projets = window.getProjets ? window.getProjets() : [];
    var orig    = projets.find(function (p) { return p.id === projetId; });
    if (!orig) { window.showToast('Projet introuvable', 'error'); return; }
    window.showPage && window.showPage('projets');
    setTimeout(function () {
      window.openModal && window.openModal('modal-projet');
      setTimeout(function () {
        var map = { 'pj-nom': (orig.nom || '') + ' (copie)', 'pj-honoraires': orig.honoraires };
        Object.keys(map).forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.value = map[id] || '';
        });
        window.showToast('Données copiées depuis ' + (orig.nom || ''), 'info');
      }, 250);
    }, 120);
  };


  // ════════════════════════════════════════════════════════
  //  17. SÉLECTEUR DE PÉRIODE DU DASHBOARD
  // ════════════════════════════════════════════════════════
  var _dashPeriod = 'year';

  window.setDashPeriod = function (period) {
    _dashPeriod = period;
    try { localStorage.setItem('cortoba_dash_period', period); } catch (e) {}
    document.querySelectorAll('.ergo-period-btn').forEach(function (btn) {
      btn.classList.toggle('ergo-period-active', btn.getAttribute('data-period') === period);
    });
    if (window.renderCharts) setTimeout(window.renderCharts, 50);
  };

  window.getDashPeriod = function () { return _dashPeriod; };

  function injectPeriodSelector() {
    var pageHeader = document.querySelector('#page-dashboard .page-header .page-actions');
    if (!pageHeader || document.getElementById('ergo-period-bar')) return;

    var bar = document.createElement('div');
    bar.id = 'ergo-period-bar';
    bar.className = 'ergo-period-bar';
    [
      { label: 'Mois', value: 'month' },
      { label: 'Trim.', value: 'quarter' },
      { label: 'Année', value: 'year' },
    ].forEach(function (p) {
      var btn = document.createElement('button');
      btn.className = 'ergo-period-btn' + (p.value === _dashPeriod ? ' ergo-period-active' : '');
      btn.setAttribute('data-period', p.value);
      btn.textContent = p.label;
      btn.onclick = function () { window.setDashPeriod(p.value); };
      bar.appendChild(btn);
    });
    pageHeader.insertBefore(bar, pageHeader.firstChild);
  }


  // ════════════════════════════════════════════════════════
  //  18. SÉLECTION MULTIPLE + ACTIONS GROUPÉES
  // ════════════════════════════════════════════════════════
  function initBulkSelect(tableSelector, bulkBarId, actions) {
    var table = document.querySelector(tableSelector);
    var bar   = document.getElementById(bulkBarId);
    if (!table || !bar || table.dataset.ergoMultiSelect) return;
    table.dataset.ergoMultiSelect = '1';

    // Checkbox "tout sélectionner"
    var firstTh = table.querySelector('thead tr th:first-child');
    if (firstTh) {
      var allCb = document.createElement('input');
      allCb.type = 'checkbox';
      allCb.className = 'ergo-check-all';
      allCb.title = 'Tout sélectionner / désélectionner';
      firstTh.insertBefore(allCb, firstTh.firstChild);
      allCb.addEventListener('change', function () {
        table.querySelectorAll('.ergo-row-check').forEach(function (cb) { cb.checked = allCb.checked; });
        refreshBulkBar(table, bar);
      });
    }

    // Checkbox par ligne
    table.querySelectorAll('tbody tr').forEach(function (tr) {
      var td = tr.querySelector('td:first-child');
      if (!td || td.querySelector('.ergo-row-check')) return;
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'ergo-row-check';
      td.insertBefore(cb, td.firstChild);
      cb.addEventListener('change', function () { refreshBulkBar(table, bar); });
    });

    // Remplir la barre avec les actions fournies
    var actionsWrap = bar.querySelector('.ergo-bulk-actions');
    if (actionsWrap && actions) {
      actions.forEach(function (act) {
        var btn = document.createElement('button');
        btn.className = 'btn btn-sm';
        btn.textContent = act.label;
        btn.onclick = function () {
          var checked = Array.from(table.querySelectorAll('.ergo-row-check:checked'))
            .map(function (cb) { return cb.closest('tr'); });
          act.fn(checked);
        };
        actionsWrap.appendChild(btn);
      });
    }
  }

  window.initBulkSelect = initBulkSelect;

  function refreshBulkBar(table, bar) {
    var count   = table.querySelectorAll('.ergo-row-check:checked').length;
    var countEl = bar.querySelector('.ergo-bulk-count');
    if (countEl) countEl.textContent = count + ' sélectionné' + (count > 1 ? 's' : '');
    bar.style.display = count > 0 ? 'flex' : 'none';
  }


  // ════════════════════════════════════════════════════════
  //  BOUTONS HEADER (Thème + Recherche)
  // ════════════════════════════════════════════════════════
  function injectHeaderButtons() {
    var right = document.querySelector('.app-header-right');
    if (!right || document.getElementById('ergo-theme-toggle')) return;

    // Bouton recherche globale
    var searchBtn = document.createElement('button');
    searchBtn.className = 'ergo-header-btn';
    searchBtn.title = 'Recherche globale (Ctrl+K)';
    searchBtn.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
      '<span class="ergo-kbd">Ctrl K</span>';
    searchBtn.onclick = openPalette;
    right.insertBefore(searchBtn, right.firstChild);

    // Bouton thème
    var themeBtn = document.createElement('button');
    themeBtn.id = 'ergo-theme-toggle';
    themeBtn.className = 'ergo-header-btn';
    themeBtn.title = 'Changer de thème';
    themeBtn.innerHTML = '☀️';
    themeBtn.onclick = window.toggleTheme;
    right.insertBefore(themeBtn, right.firstChild);
  }


  // ════════════════════════════════════════════════════════
  //  PATCH showPage — mise à jour breadcrumb + re-init tri
  // ════════════════════════════════════════════════════════
  function patchShowPage() {
    var orig = window.showPage;
    if (!orig || orig._ergoPatched) return;
    window.showPage = function (id) {
      orig(id);
      updateBreadcrumb(id);
      setTimeout(initSortableTables, 300);
      setTimeout(injectPeriodSelector, 100);
    };
    window.showPage._ergoPatched = true;
  }


  // ════════════════════════════════════════════════════════
  //  UTILITAIRES
  // ════════════════════════════════════════════════════════
  function escHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }


  // ════════════════════════════════════════════════════════
  //  INITIALISATION
  // ════════════════════════════════════════════════════════
  function init() {
    // Thème sauvegardé
    try {
      var savedTheme = localStorage.getItem('cortoba_theme');
      if (savedTheme === 'light') applyTheme(false);
    } catch (e) {}

    // Période dashboard
    try {
      var savedPeriod = localStorage.getItem('cortoba_dash_period');
      if (savedPeriod) _dashPeriod = savedPeriod;
    } catch (e) {}

    // Patch apiFetch (réseau)
    _patchApiFetch();

    // Validations inline
    initValidations();

    // Attendre que l'app soit disponible (après login)
    var checkInterval = setInterval(function () {
      var app = document.getElementById('app');
      if (!app || app.style.display === 'none' || app.style.display === '') {
        // App pas encore visible — on injecte quand même certains éléments
        injectHeaderButtons();
        injectBreadcrumb();
        return;
      }
      clearInterval(checkInterval);
      onAppVisible();
    }, 400);

    // On tente immédiatement aussi
    setTimeout(function () {
      injectHeaderButtons();
      injectBreadcrumb();
      restoreSidebarState();
      patchShowPage();
      initModalDrafts();
    }, 300);
  }

  function onAppVisible() {
    injectFAB();
    injectPeriodSelector();
    initKpiLinks();
    initSortableTables();
    initTNDFields();
    setTimeout(initTNDFields, 1500); // après chargement données
    setTimeout(initSortableTables, 1500);
    setTimeout(initKpiLinks, 1000);

    // Patch showPage maintenant que l'app est visible
    patchShowPage();

    // Surveiller les nouvelles lignes de tableau (après chargement des données)
    if (window.MutationObserver) {
      var observer = new MutationObserver(function () {
        initSortableTables();
        initKpiLinks();
        initTNDFields();
      });
      var main = document.querySelector('.main-content');
      if (main) observer.observe(main, { childList: true, subtree: true });
    }
  }

  // Démarrage
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Ré-appliquer après login (l'app passe de display:none à display:block)
  var _appWasVisible = false;
  setInterval(function () {
    var app = document.getElementById('app');
    var visible = app && app.style.display === 'block';
    if (visible && !_appWasVisible) {
      _appWasVisible = true;
      setTimeout(onAppVisible, 200);
    }
    if (!visible) _appWasVisible = false;
  }, 500);

})();
