/**
 * CORTOBA → CIVITAS — Bookmarklet de préremplissage
 * ====================================================
 * Usage :
 *   1. Ouvrir la plateforme Cortoba, cliquer "CIVITAS ↗" sur un projet.
 *   2. Dans le nouvel onglet CIVITAS, activer ce bookmarklet.
 *
 * Pour créer le bookmarklet dans Chrome :
 *   - Copier le contenu du bloc javascript:(...) ci-dessous
 *   - Créer un favori dont l'URL est ce code
 *
 * javascript:(function(){var s=document.createElement('script');s.src='https://VOTRE_DOMAINE/cortoba_plateforme/civitas-bookmarklet.js?t='+Date.now();document.head.appendChild(s);})();
 */

(function () {
  'use strict';

  // ── 1. Lire les données depuis les paramètres URL (passés par ouvrirCivitas()) ─
  var params  = new URLSearchParams(window.location.search);
  var ct      = params.get('ct');      // token serveur (méthode principale)
  var civB64  = params.get('civitas'); // fallback base64 direct

  // Méthode 1 : token serveur → fetch vers l'API Cortoba
  // L'URL de base est déduite depuis le src de CE script (pas de cb= dans l'URL pour éviter le WAF)
  if (ct) {
    var scriptEl  = document.querySelector('script[src*="civitas-bookmarklet"]');
    var scriptSrc = scriptEl ? scriptEl.src : '';
    var apiBase   = scriptSrc ? scriptSrc.replace(/civitas-bookmarklet\.js[^]*$/, '') : null;
    if (!apiBase) {
      alert('Cortoba → CIVITAS\n\nImpossible de détecter l\'URL Cortoba.\nVérifiez que le bookmarklet est bien celui fourni par Cortoba.');
      return;
    }
    var apiUrl = apiBase + 'api/civitas_store.php?token=' + encodeURIComponent(ct);
    fetch(apiUrl)
      .then(function(r) {
        if (!r.ok) throw new Error('Token expiré ou introuvable (code ' + r.status + ')');
        return r.json();
      })
      .then(function(d) { runPrefill(d); })
      .catch(function(e) {
        alert('Cortoba → CIVITAS\n\nImpossible de récupérer les données :\n' + e.message +
              '\n\nRelancez depuis la plateforme Cortoba (bouton CIVITAS ↗).');
      });
    return;   // attendre le fetch
  }

  // Méthode 2 : base64 dans ?civitas= (fallback si store indisponible)
  var raw = null;
  if (civB64) {
    try { raw = decodeURIComponent(escape(atob(civB64))); } catch (e) {}
  }
  if (!raw) {
    alert('Cortoba → CIVITAS\n\nAucune donnée trouvée.\nOuvrez d\'abord un projet depuis la plateforme Cortoba et cliquez "CIVITAS ↗".');
    return;
  }
  var d;
  try { d = JSON.parse(raw); } catch (e) { alert('Données invalides.'); return; }
  runPrefill(d);

  function runPrefill(d) {

  // ── 2. Utilitaires compatibles Vue/Angular/React ───────────────────────────
  /**
   * Remplit un <input> ou <textarea> en déclenchant les événements
   * nécessaires aux frameworks réactifs (Vue, Angular…)
   */
  function fill(el, value) {
    if (!el) return;
    var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    var nativeTextareaSetter   = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    var setter = el.tagName === 'TEXTAREA' ? nativeTextareaSetter : nativeInputValueSetter;
    if (setter && setter.set) setter.set.call(el, value);
    else el.value = value;
    ['input', 'change', 'blur'].forEach(function (evt) {
      el.dispatchEvent(new Event(evt, { bubbles: true }));
    });
  }

  /**
   * Coche une case à cocher (checkbox) et déclenche les événements
   */
  function check(el) {
    if (!el || el.checked) return;
    el.click();
  }

  /**
   * Cliquer sur un radio/checkbox dont le texte du label contient `text`
   * (recherche insensible à la casse, supporte l'arabe et le français)
   */
  function clickByLabel(text, container) {
    container = container || document;
    var labels = Array.from(container.querySelectorAll('label, .el-checkbox__label, .el-radio__label, span'));
    for (var i = 0; i < labels.length; i++) {
      var t = (labels[i].textContent || '').trim();
      if (t.indexOf(text) !== -1) {
        var input = labels[i].previousElementSibling ||
                    labels[i].querySelector('input') ||
                    labels[i].closest('label') && labels[i].closest('label').querySelector('input');
        if (input) { input.click(); return true; }
        labels[i].click(); return true;
      }
    }
    return false;
  }

  /**
   * Chercher un <input> dont le placeholder ou le label associé contient `hint`
   */
  function findInput(hint, container) {
    container = container || document;
    // Par placeholder
    var byPlaceholder = container.querySelector('input[placeholder*="' + hint + '"], textarea[placeholder*="' + hint + '"]');
    if (byPlaceholder) return byPlaceholder;
    // Par label (for → id)
    var labels = Array.from(container.querySelectorAll('label'));
    for (var i = 0; i < labels.length; i++) {
      if ((labels[i].textContent || '').indexOf(hint) !== -1) {
        var forAttr = labels[i].getAttribute('for');
        if (forAttr) {
          var inp = document.getElementById(forAttr);
          if (inp) return inp;
        }
        // label contenant directement l'input
        var nested = labels[i].querySelector('input, textarea');
        if (nested) return nested;
      }
    }
    return null;
  }

  /**
   * Remplir un champ selon une liste de sélecteurs CSS (premier trouvé)
   */
  function fillBySelectors(selectors, value) {
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) { fill(el, value); return true; }
    }
    return false;
  }

  /**
   * Définir la valeur d'un <select> (Element UI ou natif)
   */
  function setSelect(el, value) {
    if (!el) return;
    // Select natif
    if (el.tagName === 'SELECT') {
      for (var i = 0; i < el.options.length; i++) {
        if (el.options[i].value === value || el.options[i].text.indexOf(value) !== -1) {
          el.selectedIndex = i;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }
    }
    // Element UI / Ant Design : cliquer sur le wrapper pour ouvrir le dropdown
    el.click();
    setTimeout(function () {
      var options = Array.from(document.querySelectorAll('.el-select-dropdown__item, .ant-select-item, li[role="option"]'));
      for (var j = 0; j < options.length; j++) {
        if ((options[j].textContent || '').indexOf(value) !== -1) {
          options[j].click(); return;
        }
      }
    }, 300);
  }

  // ── 3. Délai pour attendre le rendu Vue.js ─────────────────────────────────
  setTimeout(function () {

    // ── 3a. Type de demande : أول مرة / إعادة نظر ────────────────────────────
    if (d.type_demande === 'premiere') {
      clickByLabel('أول مرة') || clickByLabel('Première') || clickByLabel('première');
    } else {
      clickByLabel('إعادة نظر') || clickByLabel('Révision') || clickByLabel('révision');
    }

    // ── 3b. Type de construction ──────────────────────────────────────────────
    var tcAr = d.type_construction_ar || '';
    if (tcAr) {
      clickByLabel(tcAr) ||
      clickByLabel(d.type_construction === 'nouveau'        ? 'جديد'    :
                   d.type_construction === 'extension'      ? 'توسعة'   :
                   d.type_construction === 'reconstruction' ? 'إعادة'   : 'سياحي');
    }

    // ── 3c. Lieu de la bâtisse ────────────────────────────────────────────────
    // مكان البيناية (champ texte adresse projet côté gauche)
    fillBySelectors(
      ['input[placeholder*="مكان"]', 'input[placeholder*="Adresse"]', '#adresse_batisse'],
      d.adresse_projet
    );

    // نوع البيناية (type de bâtiment — description)
    fillBySelectors(
      ['input[placeholder*="نوع"]', 'input[placeholder*="Type de b"]', '#type_batisse'],
      d.description || d.code_projet
    );

    // ── 3d. Commune & Délégation (dropdowns) ─────────────────────────────────
    if (d.commune) {
      var communeEl = document.querySelector('select[name*="commune"], select[name*="baladia"], .el-select:nth-of-type(1)');
      if (communeEl) setSelect(communeEl, d.commune);
      // Sinon tenter par texte du label
      else clickByLabel(d.commune);
    }
    if (d.delegation) {
      var delegEl = document.querySelector('select[name*="delegation"], select[name*="daira"], .el-select:nth-of-type(2)');
      if (delegEl) setSelect(delegEl, d.delegation);
    }

    // ── 3e. Personne physique (radio) ─────────────────────────────────────────
    clickByLabel('شخص طبيعي') || clickByLabel('Physique') || clickByLabel('physique');

    // ── 3f. Identité du maître d'ouvrage ─────────────────────────────────────
    // الاسم (prénom en arabe) et اللقب (nom en arabe)
    var fullNameAr = (d.prenom_ar && d.nom_ar) ? d.prenom_ar + ' ' + d.nom_ar : (d.nom_ar || d.prenom_ar || '');
    if (fullNameAr) {
      fillBySelectors(['input[placeholder*="الاسم"]', '#nom_prenom'], fullNameAr);
    }
    // Champs séparés prénom / nom si présents
    if (d.prenom_ar) fillBySelectors(['input[id*="prenom"]','input[placeholder*="الاسم الأول"]'], d.prenom_ar);
    if (d.nom_ar)    fillBySelectors(['input[id*="nom"]','input[placeholder*="اللقب"]'], d.nom_ar);

    // رقم بطاقة التهريف
    fillBySelectors(
      ['input[placeholder*="بطاقة"]', 'input[placeholder*="CIN"]', 'input[placeholder*="جواز"]', '#cin'],
      d.cin
    );

    // تاريخ إصدار بطاقة التهريف
    fillBySelectors(
      ['input[placeholder*="تاريخ"]', 'input[type="date"]', '#date_cin'],
      d.date_cin
    );

    // رقم الهاتف
    fillBySelectors(
      ['input[placeholder*="الهاتف"]', 'input[placeholder*="Téléphone"]', 'input[type="tel"]', '#tel'],
      d.tel
    );

    // البريد الإلكتروني
    fillBySelectors(
      ['input[placeholder*="البريد"]', 'input[placeholder*="mail"]', 'input[type="email"]', '#email'],
      d.email
    );

    // ── 3g. Feedback visuel ───────────────────────────────────────────────────
    var banner = document.createElement('div');
    banner.style.cssText = [
      'position:fixed;top:16px;right:16px;z-index:99999',
      'background:#1a1a16;border:1px solid #c8a96e',
      'border-radius:8px;padding:12px 16px;font-family:system-ui,sans-serif',
      'font-size:13px;color:#c8a96e;max-width:300px',
      'box-shadow:0 4px 24px rgba(0,0,0,.5)'
    ].join(';');
    banner.innerHTML =
      '<strong>Cortoba → CIVITAS</strong><br>' +
      '<span style="color:#ccc">Formulaire prérempli depuis le projet <em>' + (d.code_projet || '') + '</em>.<br>' +
      'Vérifiez et complétez les listes déroulantes.</span><br>' +
      '<button onclick="this.parentNode.remove()" ' +
        'style="margin-top:8px;background:none;border:1px solid #c8a96e;color:#c8a96e;' +
        'border-radius:4px;padding:2px 10px;cursor:pointer;font-size:11px">Fermer</button>';
    document.body.appendChild(banner);
    setTimeout(function () { if (banner.parentNode) banner.remove(); }, 10000);

  }, 600); // délai 600ms pour Vue.js

  } // fin runPrefill()

})();
