// ═══════════════════════════════════════════════════════════
//  CORTOBA ATELIER — Plateforme v8 (corrections A+B+C)
// ═══════════════════════════════════════════════════════════

// URL de base de l'API
var API_BASE = (function(){
  var p = window.location.pathname;
  var dir = p.substring(0, p.lastIndexOf('/') + 1);
  return window.location.origin + dir;
})();

// ── API helper ──
function apiFetch(path, opts) {
  opts = opts || {};
  var url = (path.indexOf('http') === 0) ? path : API_BASE + path;
  var headers = { 'Content-Type': 'application/json' };
  var token = sessionStorage.getItem('cortoba_token');
  if (token) headers['Authorization'] = 'Bearer ' + token;
  var init = { method: opts.method || 'GET', headers: headers };
  if (opts.body && (opts.method === 'POST' || opts.method === 'PUT'))
    init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  return fetch(url, init).then(function(r) {
    var ct = r.headers.get('Content-Type') || '';
    if (!ct.includes('json')) return r.text().then(function(t){ throw new Error(t || 'Erreur serveur'); });
    return r.json().then(function(j) {
      if (!j.success && j.error) throw new Error(j.error);
      return j;
    });
  });
}

// ── localStorage helpers ──
function getLS(k,d){ try{return JSON.parse(localStorage.getItem(k)||JSON.stringify(d));}catch(e){return d;} }
function setLS(k,v){ localStorage.setItem(k,JSON.stringify(v)); }

// ── Cache ──
var _cache = { clients:[], projets:[], devis:[], factures:[], depenses:[], demandes:[] };
function getClients(){ return _cache.clients; }
function getProjets(){ return _cache.projets; }
function getDevis(){ return _cache.devis; }
function getFactures(){ return _cache.factures; }
function getDepenses(){ return _cache.depenses; }
function getDemandes(){ return _cache.demandes; }

// Migration ponctuelle : supprimer les virgules des noms clients existants
(function(){
  if (sessionStorage.getItem('commas_cleaned')) return;
  apiFetch('api/clients.php?action=cleanup-commas', {method:'POST', body:{}})
    .then(function(){ sessionStorage.setItem('commas_cleaned','1'); })
    .catch(function(){});
})();

function loadData(){
  // Réinitialiser les caches de colonnes pour charger les préférences utilisateur
  _clActiveColumns = null;
  _pjActiveColumns = null;
  return Promise.all([
    // Charger les paramètres en premier pour que les selects soient prêts
    loadSettings(),
    apiFetch('api/clients.php').then(function(r){
      _cache.clients = (r.data||[]).map(function(c){
        var o={};
        for(var k in c) o[k]=c[k];
        o.displayNom = o.display_nom || o.displayNom;
        o.creePar = o.cree_par;
        o.creeAt  = o.cree_at;
        // Normaliser snake_case → camelCase pour typeBat
        if(o.type_bat !== undefined && o.typeBat === undefined) o.typeBat = o.type_bat;
        return o;
      });
      return _cache.clients;
    }),
    apiFetch('api/projets.php').then(function(r){
      _cache.projets = (r.data||[]).map(function(p){
        // Normaliser snake_case → camelCase
        if(p.type_bat !== undefined && p.typeBat === undefined) p.typeBat = p.type_bat;
        if(p.client_id !== undefined && p.clientId === undefined) p.clientId = p.client_id;
        return p;
      });
      return _cache.projets;
    }),
    apiFetch('api/data.php?table=devis').then(function(r){
      _cache.devis = (r.data||[]).map(function(d){
        return{id:d.id,ref:d.numero,client:d.client,objet:d.objet,montant:d.montant_ttc||d.montant_ht,date:d.date_devis,statut:d.statut};
      });
      return _cache.devis;
    }),
    apiFetch('api/data.php?table=factures').then(function(r){
      _cache.factures = (r.data||[]).map(function(f){
        return {
          id:             f.id,
          num:            f.numero,
          client:         f.client,
          clientAdresse:  f.client_adresse  || f.clientAdresse  || '',
          clientMF:       f.client_mf       || f.clientMF       || '',
          projetId:       f.projet_id       || f.projetId,
          objet:          f.objet           || '',
          dateEmission:   f.date_emission   || f.dateEmission   || '',
          echeance:       f.date_echeance   || f.dateEcheance   || f.echeance || '',
          statut:         f.statut,
          montant:        parseFloat(f.montant_ttc || f.montantTtc || f.montant || 0),
          montantHt:      parseFloat(f.montant_ht  || f.montantHt  || 0),
          montantTtc:     parseFloat(f.montant_ttc || f.montantTtc || f.montant || 0),
          montantTva:     parseFloat(f.montant_tva || f.montantTva || f.tva    || 0),
          tva:            f.tva,
          fodec:          parseFloat(f.fodec   || 0),
          timbre:         parseFloat(f.timbre  || 0),
          rasTaux:        parseFloat(f.ras_taux || f.rasTaux || 0),
          rasAmt:         parseFloat(f.ras_amt  || f.rasAmt  || 0),
          netPayer:       parseFloat(f.net_payer|| f.netPayer|| f.montant_ttc || f.montant || 0),
          montantLettres: f.montant_lettres  || f.montantLettres || '',
          modePaiement:   f.mode_paiement    || f.modePaiement   || '',
          notes:          f.notes            || '',
          rib:            f.rib              || '',
          lignes:         (function(){
            try{ return JSON.parse(f.lignes_json||f.lignes||'[]'); }catch(e){ return []; }
          })()
        };
      });
      return _cache.factures;
    }),
    apiFetch('api/data.php?table=depenses').then(function(r){
      _cache.depenses = (r.data||[]).map(function(d){
        return{id:d.id,libelle:d.description,montant:d.montant,date:d.date_dep,cat:d.categorie};
      });
      return _cache.depenses;
    }),
    apiFetch('api/demandes.php').then(function(r){ _cache.demandes = r.data || []; return _cache.demandes; }).catch(function(){ _cache.demandes = []; return []; }),
  ]).then(function(){
    _cache.factures = _cache.factures.map(function(f){
      var p = _cache.projets.find(function(x){return x.id===f.projetId;});
      f.projet = p ? p.nom : '';
      return f;
    });
    return _cache.clients;
  });
}

// ── Seed data ──
var DEFAULT_CLIENTS = [
  {id:'c1',code:'BSK001',type:'physique',prenom:'Karim',nom:'Ben Salah',raison:'',matricule:'',email:'k.bensalah@email.tn',tel:'+216 71 XXX XXX',whatsapp:'+216 71 XXX XXX',statut:'Actif',adresse:'Hammamet, Nabeul',dateContact:'2024-06-01',source:'Google',sourceDetail:'',remarques:'',contactsAux:[],ca:18000,projets:2,creePar:'Amal Cortoba',creeAt:new Date('2024-06-01').toISOString()},
  {id:'c2',code:'MSC002',type:'morale',prenom:'',nom:'',raison:'Mahjoub SCI',matricule:'1234567/A/M/000',email:'contact@mahjoub.tn',tel:'+216 74 XXX XXX',whatsapp:'+216 74 XXX XXX',statut:'Actif',adresse:'Sfax',dateContact:'2024-09-15',source:'Recommandation client',sourceDetail:'Ben Salah, Karim',remarques:'',contactsAux:[],ca:55000,projets:1,creePar:'Amal Cortoba',creeAt:new Date('2024-09-15').toISOString()},
  {id:'c3',code:'HML003',type:'physique',prenom:'Leila',nom:'Hamdi',raison:'',matricule:'',email:'l.hamdi@gmail.com',tel:'+216 98 XXX XXX',whatsapp:'+216 98 XXX XXX',statut:'Actif',adresse:'Tunis',dateContact:'2024-11-10',source:'Instagram',sourceDetail:'',remarques:'',contactsAux:[],ca:24000,projets:1,creePar:'Amal Cortoba',creeAt:new Date('2024-11-10').toISOString()},
  {id:'c4',code:'IDI004',type:'morale',prenom:'',nom:'',raison:'Invest Djerba SA',matricule:'9876543/A/P/000',email:'direction@investdjerba.tn',tel:'+216 75 XXX XXX',whatsapp:'+216 75 XXX XXX',statut:'Standby',adresse:'Djerba, Médenine',dateContact:'2025-01-20',source:'Salon/Exposition',sourceDetail:'',remarques:'Projet complexe, en attente financement.',contactsAux:[],ca:3500,projets:1,creePar:'Amal Cortoba',creeAt:new Date('2025-01-20').toISOString()},
  {id:'c5',code:'SME005',type:'morale',prenom:'',nom:'',raison:'SARL Méditerranée',matricule:'1122334/A/N/000',email:'contact@sarlmed.tn',tel:'+216 73 XXX XXX',whatsapp:'+216 73 XXX XXX',statut:'Actif',adresse:'Monastir',dateContact:'2025-02-05',source:'Recommandation ami/famille',sourceDetail:'Mestiri, Yassine',remarques:'',contactsAux:[],ca:22000,projets:1,creePar:'Amal Cortoba',creeAt:new Date('2025-02-05').toISOString()},
  {id:'c6',code:'BOO006',type:'physique',prenom:'Omar',nom:'Bouaziz',raison:'',matricule:'',email:'o.bouaziz@hotmail.fr',tel:'+216 22 XXX XXX',whatsapp:'+216 22 XXX XXX',statut:'Clôturé',adresse:'Tunis',dateContact:'2023-08-15',source:'Bouche à oreille',sourceDetail:'',remarques:'Projet terminé.',contactsAux:[],ca:14500,projets:1,creePar:'Amal Cortoba',creeAt:new Date('2023-08-15').toISOString()},
];
var DEFAULT_DEVIS = [
  {id:'dv1',ref:'DV-2026-042',client:'Ben Salah, Karim',objet:'Villa contemporaine — Hammamet',montant:12500,date:'2026-03-08',statut:'Accepté'},
  {id:'dv2',ref:'DV-2026-039',client:'Mahjoub SCI',objet:'Immeuble R+4 — Sfax',montant:38000,date:'2026-03-02',statut:'En attente'},
  {id:'dv3',ref:'DV-2026-035',client:'Hamdi, Leila',objet:'Rénovation villa — Tunis',montant:8500,date:'2026-02-20',statut:'Négociation'},
  {id:'dv4',ref:'DV-2026-031',client:'Invest Djerba SA',objet:'Complexe hôtelier — Djerba',montant:95000,date:'2026-02-10',statut:'Refusé'},
];
var DEFAULT_PROJETS = [
  {id:'pj1',nom:'Villa Ben Salah — Hammamet',client:'Ben Salah, Karim',phase:'EXE',honoraires:45000,delai:'2026-09-01'},
  {id:'pj2',nom:'Immeuble Mahjoub — Sfax',client:'Mahjoub SCI',phase:'APD',honoraires:80000,delai:'2027-03-01'},
  {id:'pj3',nom:'Villa Hamdi — Tunis',client:'Hamdi, Leila',phase:'PC',honoraires:23000,delai:'2026-12-01'},
  {id:'pj4',nom:'Bureaux Midoun',client:'Invest Djerba SA',phase:'APS',honoraires:3500,delai:'2026-06-01'},
  {id:'pj5',nom:'Résidence SARL Méd.',client:'SARL Méditerranée',phase:'DCE',honoraires:55000,delai:'2026-11-01'},
];
var DEFAULT_FACTURES = [
  {id:'fa1',num:'F-2026-018',client:'Ben Salah, Karim',projet:'Villa Ben Salah — Hammamet',montant:15000,tva:'7%',echeance:'2026-03-31',statut:'Payée'},
  {id:'fa2',num:'F-2026-015',client:'Mahjoub SCI',projet:'Immeuble Mahjoub — Sfax',montant:25000,tva:'19%',echeance:'2026-03-15',statut:'Impayée'},
  {id:'fa3',num:'F-2026-012',client:'Hamdi, Leila',projet:'Villa Hamdi — Tunis',montant:8000,tva:'7%',echeance:'2026-02-28',statut:'Payée'},
  {id:'fa4',num:'F-2026-009',client:'SARL Méditerranée',projet:'Résidence SARL Méd.',montant:12000,tva:'19%',echeance:'2026-04-15',statut:'Impayée'},
];
var DEFAULT_DEPENSES = [
  {id:'dp1',libelle:'Loyer bureau Midoun — Mars',montant:1200,date:'2026-03-01',cat:'Loyer & charges'},
  {id:'dp2',libelle:'Licences Revit 2026',montant:3400,date:'2026-01-15',cat:'Logiciels & licences'},
  {id:'dp3',libelle:'Déplacements chantier Sfax',montant:450,date:'2026-02-20',cat:'Déplacements'},
  {id:'dp4',libelle:'Fournitures impression plans',montant:280,date:'2026-03-05',cat:'Fournitures'},
];

// ── Helpers ──
function uid(){ return Date.now().toString(36)+Math.random().toString(36).substr(2,5); }
function fmtDate(d){ if(!d) return '—'; return new Date(d).toLocaleDateString('fr-FR'); }
function fmtMontant(n){
  var s=Math.round(n).toString(), parts=[];
  while(s.length>3){ parts.unshift(s.slice(-3)); s=s.slice(0,-3); }
  parts.unshift(s); return parts.join('\u202f')+' TND';
}
function badgeClass(s){
  var m={
    Actif:'badge-green', Payée:'badge-green', 'Accepté':'badge-green', Disponible:'badge-green',
    Standby:'badge-orange', 'En attente':'badge-orange', 'En pause':'badge-orange',
    'Négociation':'badge-orange', 'En négociation':'badge-orange',
    'Envoyée':'badge-orange', 'Paiement partiel':'badge-orange', 'Partielle':'badge-orange',
    Impayée:'badge-red', Refusé:'badge-red', 'En litige':'badge-red', 'Clôturé':'badge-gray',
    Archivé:'badge-gray', Prospection:'badge-blue', 'Sur chantier':'badge-blue'
  };
  return 'badge '+(m[s]||'badge-gray');
}

// ══════════════════════════════════════════════════════════
//  C — PARAMÈTRES — stockage localStorage (fiable sans API)
// ══════════════════════════════════════════════════════════

var _settingsCache = {};

// Charger les paramètres : localStorage d'abord, puis API si disponible
function loadSettings() {
  // 1) Charger depuis localStorage immédiatement (synchrone)
  _settingsCache = {};
  var localData = {};
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && (k.indexOf('cortoba_') === 0 || k.indexOf('cfg_') === 0)) {
        try {
          var parsed = JSON.parse(localStorage.getItem(k));
          _settingsCache[k] = parsed;
          localData[k] = parsed;
        } catch(e) {}
      }
    }
  } catch(e) {}

  // 2) Sync serveur ↔ localStorage
  return apiFetch('api/settings.php')
    .then(function(r){
      var serverData = r.data || {};
      var serverKeys = {};

      // Serveur → cache : le serveur a priorité sauf pour les valeurs vides
      Object.keys(serverData).forEach(function(k){
        serverKeys[k] = true;
        var sv = serverData[k];
        var lv = localData[k];
        var svEmpty = (sv === null || sv === undefined || sv === '' || (Array.isArray(sv) && sv.length === 0));
        var lvEmpty = (lv === null || lv === undefined || lv === '' || (Array.isArray(lv) && lv.length === 0));

        if (!svEmpty) {
          // Serveur a une valeur non-vide → utiliser serveur
          _settingsCache[k] = sv;
          try { localStorage.setItem(k, JSON.stringify(sv)); } catch(e){}
        } else if (!lvEmpty) {
          // Serveur vide mais localStorage a une valeur → garder localStorage et pousser vers serveur
          _settingsCache[k] = lv;
          apiFetch('api/settings.php', {method:'POST', body:{key:k, value:lv}}).catch(function(){});
        }
      });

      // 3) Clés locales absentes du serveur → pousser vers serveur
      Object.keys(localData).forEach(function(k){
        if (!serverKeys[k]) {
          var lv = localData[k];
          if (lv !== null && lv !== undefined && lv !== '') {
            apiFetch('api/settings.php', {method:'POST', body:{key:k, value:lv}}).catch(function(){});
          }
        }
      });

      return _settingsCache;
    })
    .catch(function(){
      return _settingsCache;
    });
}

// Lire un paramètre
function getSetting(key, defaut) {
  if (_settingsCache !== null && _settingsCache[key] !== undefined) return _settingsCache[key];
  return getLS(key, defaut);
}

// Sauvegarder un paramètre — localStorage + API serveur
function saveSetting(key, value) {
  _settingsCache[key] = value;
  setLS(key, value);
  return apiFetch('api/settings.php', {method:'POST', body:{key:key, value:value}})
    .then(function(r) { return r; })
    .catch(function(e) {
      console.error('[saveSetting] Erreur serveur pour "' + key + '":', e);
      return {error: true, key: key, message: e.message || String(e)};
    });
}

function deleteSetting(key) {
  delete _settingsCache[key];
  localStorage.removeItem(key);
  return apiFetch('api/settings.php?key='+encodeURIComponent(key), {method:'DELETE'})
    .catch(function(e){ console.error('[deleteSetting] Erreur pour "'+key+'":', e); });
}

// Helpers selects extensibles
function getSelectExtras(selectId) {
  var val = getSetting('cortoba_select_extras_'+selectId, []);
  return Array.isArray(val) ? val : [];
}
function saveSelectExtras(selectId, arr) {
  saveSetting('cortoba_select_extras_'+selectId, arr);
}

// Rend un <select> extensible
function makeExtensible(selectId) {
  var sel = document.getElementById(selectId);
  if (!sel || sel.dataset.extensible) return;
  sel.dataset.extensible = '1';

  // Charger et ajouter les options sauvegardées
  var extras = getSelectExtras(selectId);
  extras.forEach(function(val){
    if (!Array.from(sel.options).some(function(o){return o.value===val;})) {
      var opt = document.createElement('option');
      opt.value = val; opt.textContent = val;
      var autrEl = sel.querySelector('option[value="__autre__"]');
      if (autrEl) sel.insertBefore(opt, autrEl);
      else sel.appendChild(opt);
    }
  });

  // Ajouter l'option spéciale si absente
  if (!sel.querySelector('option[value="__autre__"]')) {
    var autrOpt = document.createElement('option');
    autrOpt.value = '__autre__';
    autrOpt.textContent = '＋ Autre (saisir)…';
    autrOpt.style.color = 'var(--accent)';
    sel.appendChild(autrOpt);
  }

  sel.addEventListener('change', function(){
    if (sel.value !== '__autre__') return;
    var valeur = (prompt('Saisir la nouvelle option :') || '').trim();
    if (!valeur) { sel.value = sel.dataset.prevVal || ''; return; }
    var newOpt = document.createElement('option');
    newOpt.value = valeur; newOpt.textContent = valeur;
    var autrEl = sel.querySelector('option[value="__autre__"]');
    if (autrEl) sel.insertBefore(newOpt, autrEl);
    else sel.appendChild(newOpt);
    sel.value = valeur;
    var extras = getSelectExtras(selectId);
    if (extras.indexOf(valeur) === -1) { extras.push(valeur); saveSelectExtras(selectId, extras); }
    renderParametresListes();
  });

  sel.addEventListener('mousedown', function(){ sel.dataset.prevVal = sel.value; });
}

function initExtensibleSelects() {
  ['pj-statut','cl-statut','cl-source'].forEach(makeExtensible);
  populateTypeBatSelect();
}

// ══════════════════════════════════════════════════════════
//  PARAMÈTRES — Gestion des listes déroulantes
// ══════════════════════════════════════════════════════════

var PARAM_LISTES = [
  { id:'pj-statut',    label:"Statut projet",      defauts:['Actif','En pause','Prospection','Archivé'] },
  { id:'cl-statut',    label:"Statut client",      defauts:['Actif','Standby','Clôturé'] },
  { id:'cl-source',    label:"Source d'acquisition",defauts:['Google','Facebook','Instagram','LinkedIn','Site web','Recommandation client','Recommandation ami/famille','Bouche à oreille','Salon/Exposition','Appel d\'offres'] },
];

function renderParametresListes() {
  var wrap = document.getElementById('param-listes-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  PARAM_LISTES.forEach(function(cfg){
    var extras = getSelectExtras(cfg.id);
    var toutes = cfg.defauts.concat(extras.filter(function(e){ return cfg.defauts.indexOf(e)===-1; }));
    var div = document.createElement('div');
    div.style.cssText = 'margin-bottom:1.5rem;background:var(--bg-2);border:1px solid var(--border);border-radius:8px;padding:1rem';
    div.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.8rem">'
      + '<span style="font-size:0.8rem;font-weight:600;color:var(--text)">' + cfg.label + '</span>'
      + '<button class="btn btn-sm" onclick="addParamOption(\''+cfg.id+'\')" style="font-size:0.72rem">＋ Ajouter</button>'
      + '</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:0.4rem">'
      + toutes.map(function(val){
          var isExtra = extras.indexOf(val) !== -1;
          return '<span style="display:inline-flex;align-items:center;gap:0.3rem;padding:0.25rem 0.6rem;border-radius:20px;font-size:0.75rem;background:var(--bg-3);border:1px solid var(--border);color:'+(isExtra?'var(--accent)':'var(--text-2)')+'">'
            + val
            + (isExtra ? '<button type="button" style="background:none;border:none;cursor:pointer;color:#e07070;font-size:0.85rem;line-height:1;padding:0 0 0 2px" onclick="removeParamOption(\''+cfg.id+'\',\''+val.replace(/'/g,"\\'").replace(/"/g,'&quot;')+'\')" title="Supprimer">✕</button>' : '')
            + '</span>';
        }).join('')
      + '</div>';
    wrap.appendChild(div);
  });
}

function addParamOption(selectId) {
  var valeur = (prompt('Nouvelle option à ajouter :') || '').trim();
  if (!valeur) return;
  var extras = getSelectExtras(selectId);
  if (extras.indexOf(valeur) === -1) {
    extras.push(valeur);
    saveSelectExtras(selectId, extras);
  }
  renderParametresListes();
  // Réinitialiser le select pour prendre en compte la nouvelle option
  var sel = document.getElementById(selectId);
  if (sel) {
    sel.dataset.extensible = '';
    makeExtensible(selectId);
  }
}

function removeParamOption(selectId, valeur) {
  if (!confirm('Supprimer l\'option "'+valeur+'" ?')) return;
  var extras = getSelectExtras(selectId);
  extras = extras.filter(function(e){ return e !== valeur; });
  saveSelectExtras(selectId, extras);
  // Retirer du select si présent
  var sel = document.getElementById(selectId);
  if (sel) {
    var opt = Array.from(sel.options).find(function(o){return o.value===valeur;});
    if (opt) sel.removeChild(opt);
  }
  renderParametresListes();
}

// ══════════════════════════════════════════════════════════
//  PARAMÈTRES — Types de bâtiment (Configurateur)
// ══════════════════════════════════════════════════════════

var CFG_TYPES_BATIMENT_DEFAULT = [
  { id:'logement', label:'Logement', icon:'🏠', subtypes:[
      {id:'individuel', label:'Individuel', icon:'🏡'},
      {id:'collectif',  label:'Collectif',  icon:'🏘️'}
  ]},
  { id:'immeuble', label:'Immeuble', icon:'🏢', subtypes:[
      {id:'residentiel', label:'Résidentiel', icon:'🏠'},
      {id:'commercial',  label:'Commercial',  icon:'🏪'},
      {id:'bureautique', label:'Bureautique', icon:'💼'},
      {id:'mixte',       label:'Mixte',       icon:'🔀'}
  ]}
];

function getCfgTypesBatiment() {
  var val = getSetting('cfg_types_batiment', null);
  return (Array.isArray(val) && val.length > 0) ? val : CFG_TYPES_BATIMENT_DEFAULT;
}

function saveCfgTypesBatiment(types) {
  saveSetting('cfg_types_batiment', types);
}

function renderCfgTypesParams() {
  var wrap = document.getElementById('param-cfg-types-wrap');
  if (!wrap) return;
  var types = getCfgTypesBatiment();
  wrap.innerHTML = '';

  types.forEach(function(group, gi) {
    var div = document.createElement('div');
    div.style.cssText = 'margin-bottom:1rem;background:var(--bg-2);border:1px solid var(--border);border-radius:8px;padding:1rem';

    // Group header
    var header = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.6rem">'
      + '<span style="font-size:0.9rem;font-weight:600;color:var(--text)">'
      + '<span style="margin-right:0.4rem">' + group.icon + '</span>' + group.label
      + ' <span style="font-size:0.65rem;color:var(--text-3);font-weight:400">(' + group.id + ')</span></span>'
      + '<div style="display:flex;gap:0.3rem">';

    if (gi > 0) header += '<button class="btn btn-sm" onclick="cfgTypesMoveGroup('+gi+',-1)" title="Monter" style="font-size:0.7rem;padding:0.2rem 0.4rem">▲</button>';
    if (gi < types.length-1) header += '<button class="btn btn-sm" onclick="cfgTypesMoveGroup('+gi+',1)" title="Descendre" style="font-size:0.7rem;padding:0.2rem 0.4rem">▼</button>';
    header += '<button class="btn btn-sm" onclick="cfgTypesRemoveGroup('+gi+')" title="Supprimer" style="font-size:0.7rem;padding:0.2rem 0.4rem;color:#e07070">✕</button>';
    header += '</div></div>';

    // Subtypes
    var subtypeHtml = '<div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.6rem">';
    (group.subtypes || []).forEach(function(st, si) {
      subtypeHtml += '<span style="display:inline-flex;align-items:center;gap:0.3rem;padding:0.25rem 0.6rem;border-radius:20px;font-size:0.75rem;background:var(--bg-3);border:1px solid var(--border);color:var(--text-2)">'
        + '<span>' + st.icon + '</span> ' + st.label
        + ' <span style="font-size:0.6rem;color:var(--text-3)">(' + st.id + ')</span>'
        + '<button type="button" style="background:none;border:none;cursor:pointer;color:#e07070;font-size:0.85rem;line-height:1;padding:0 0 0 2px" onclick="cfgTypesRemoveSubtype('+gi+','+si+')" title="Supprimer">✕</button>'
        + '</span>';
    });
    subtypeHtml += '</div>';

    // Add subtype form
    var addForm = '<div style="display:flex;gap:0.3rem;align-items:center">'
      + '<input class="form-input" id="cfg-st-icon-'+gi+'" placeholder="Icône" style="width:50px;font-size:0.75rem;padding:0.25rem 0.4rem" />'
      + '<input class="form-input" id="cfg-st-id-'+gi+'" placeholder="ID" style="width:90px;font-size:0.75rem;padding:0.25rem 0.4rem" />'
      + '<input class="form-input" id="cfg-st-label-'+gi+'" placeholder="Libellé" style="flex:1;font-size:0.75rem;padding:0.25rem 0.4rem" />'
      + '<button class="btn btn-sm" onclick="cfgTypesAddSubtype('+gi+')" style="font-size:0.68rem;padding:0.25rem 0.5rem">+ Sous-type</button>'
      + '</div>';

    div.innerHTML = header + subtypeHtml + addForm;
    wrap.appendChild(div);
  });
}

function cfgTypesAddGroup() {
  var icon  = (document.getElementById('param-cfg-type-icon').value || '🏗️').trim();
  var id    = (document.getElementById('param-cfg-type-id').value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g,'');
  var label = (document.getElementById('param-cfg-type-label').value || '').trim();
  if (!id || !label) { alert('Veuillez renseigner un ID et un libellé.'); return; }

  var types = getCfgTypesBatiment();
  if (types.some(function(g){ return g.id === id; })) { alert('Un type avec cet ID existe déjà.'); return; }

  types.push({ id: id, label: label, icon: icon, subtypes: [] });
  saveCfgTypesBatiment(types);
  renderCfgTypesParams();
  populateTypeBatSelect();

  document.getElementById('param-cfg-type-icon').value = '';
  document.getElementById('param-cfg-type-id').value = '';
  document.getElementById('param-cfg-type-label').value = '';
}

function cfgTypesRemoveGroup(gi) {
  var types = getCfgTypesBatiment();
  if (!confirm('Supprimer le type "' + types[gi].label + '" et tous ses sous-types ?')) return;
  types.splice(gi, 1);
  saveCfgTypesBatiment(types);
  renderCfgTypesParams();
  populateTypeBatSelect();
}

function cfgTypesMoveGroup(gi, dir) {
  var types = getCfgTypesBatiment();
  var ni = gi + dir;
  if (ni < 0 || ni >= types.length) return;
  var tmp = types[gi];
  types[gi] = types[ni];
  types[ni] = tmp;
  saveCfgTypesBatiment(types);
  renderCfgTypesParams();
  populateTypeBatSelect();
}

function cfgTypesAddSubtype(gi) {
  var icon  = (document.getElementById('cfg-st-icon-'+gi).value || '🔹').trim();
  var id    = (document.getElementById('cfg-st-id-'+gi).value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g,'');
  var label = (document.getElementById('cfg-st-label-'+gi).value || '').trim();
  if (!id || !label) { alert('Veuillez renseigner un ID et un libellé.'); return; }

  var types = getCfgTypesBatiment();
  var group = types[gi];
  if (!group.subtypes) group.subtypes = [];
  if (group.subtypes.some(function(s){ return s.id === id; })) { alert('Un sous-type avec cet ID existe déjà.'); return; }

  group.subtypes.push({ id: id, label: label, icon: icon });
  saveCfgTypesBatiment(types);
  renderCfgTypesParams();
  populateTypeBatSelect();
}

function cfgTypesRemoveSubtype(gi, si) {
  var types = getCfgTypesBatiment();
  var st = types[gi].subtypes[si];
  if (!confirm('Supprimer le sous-type "' + st.label + '" ?')) return;
  types[gi].subtypes.splice(si, 1);
  saveCfgTypesBatiment(types);
  renderCfgTypesParams();
  populateTypeBatSelect();
}

// Peuple le select pj-type-bat avec optgroups depuis cfg_types_batiment
function populateTypeBatSelect() {
  var sel = document.getElementById('pj-type-bat');
  if (!sel) return;
  var currentVal = sel.value;

  // Garder seulement le premier option (— Sélectionner —)
  while (sel.options.length > 1) sel.remove(1);

  var types = getCfgTypesBatiment();
  types.forEach(function(group) {
    var og = document.createElement('optgroup');
    og.label = group.icon + ' ' + group.label;
    (group.subtypes || []).forEach(function(st) {
      var opt = document.createElement('option');
      opt.value = group.label + ' ' + st.label;
      opt.textContent = st.icon + ' ' + st.label;
      og.appendChild(opt);
    });
    sel.appendChild(og);
  });

  // Restaurer la valeur si elle existe encore
  if (currentVal) sel.value = currentVal;
  // Sync custom dropdown display
  syncTypeBatDisplay();
}

// ── Type bâtiment custom dropdown ──
var _typeBatDropOpen = false;
function showTypeBatDropdown() {
  var dd = document.getElementById('pj-typebat-dropdown'); if (!dd) return;
  dd.style.display = 'block'; _typeBatDropOpen = true;
  renderTypeBatDropdown();
}
function hideTypeBatDropdown() {
  setTimeout(function() {
    var dd = document.getElementById('pj-typebat-dropdown');
    if (dd) dd.style.display = 'none'; _typeBatDropOpen = false;
  }, 200);
}
function renderTypeBatDropdown() {
  var dd = document.getElementById('pj-typebat-dropdown'); if (!dd) return;
  var types = getCfgTypesBatiment();
  var html = '';
  types.forEach(function(group) {
    html += '<div style="padding:0.4rem 1rem;font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-3);background:var(--bg-2);font-weight:600">' + group.icon + ' ' + group.label + '</div>';
    (group.subtypes || []).forEach(function(st) {
      var val = group.label + ' ' + st.label;
      html += '<div onmousedown="selectTypeBat(\'' + val.replace(/'/g, "\\'") + '\')" style="padding:0.5rem 1rem 0.5rem 1.8rem;cursor:pointer;font-size:0.82rem;border-bottom:1px solid var(--border);transition:background .15s" onmouseover="this.style.background=\'var(--bg-2)\'" onmouseout="this.style.background=\'none\'">' +
        st.icon + ' ' + st.label + '</div>';
    });
  });
  dd.innerHTML = html;
}
function selectTypeBat(val) {
  var sel = document.getElementById('pj-type-bat');
  var input = document.getElementById('pj-typebat-search');
  var clearBtn = document.getElementById('pj-typebat-clear');
  if (sel) sel.value = val;
  if (input) input.value = val;
  if (clearBtn) clearBtn.style.display = val ? 'block' : 'none';
  hideTypeBatDropdown();
}
function clearTypeBatSearch() {
  var sel = document.getElementById('pj-type-bat');
  var input = document.getElementById('pj-typebat-search');
  var clearBtn = document.getElementById('pj-typebat-clear');
  if (sel) sel.value = '';
  if (input) input.value = '';
  if (clearBtn) clearBtn.style.display = 'none';
}
function syncTypeBatDisplay() {
  var sel = document.getElementById('pj-type-bat');
  var input = document.getElementById('pj-typebat-search');
  var clearBtn = document.getElementById('pj-typebat-clear');
  if (!sel || !input) return;
  var val = sel.value || '';
  input.value = val;
  if (clearBtn) clearBtn.style.display = val ? 'block' : 'none';
}
document.addEventListener('click', function(e) {
  if (!_typeBatDropOpen) return;
  var input = document.getElementById('pj-typebat-search');
  var dd = document.getElementById('pj-typebat-dropdown');
  if (input && dd && !input.contains(e.target) && !dd.contains(e.target)) {
    dd.style.display = 'none'; _typeBatDropOpen = false;
  }
});

// ══════════════════════════════════════════════════════════
//  CODE CLIENT GENERATOR
// ══════════════════════════════════════════════════════════
function genClientCode(type, prenom, nomOuRaison) {
  var consonnes = 'BCDFGHJKLMNPQRSTVWXYZ';
  function codeNom(nom) {
    nom = nom.trim().toUpperCase().replace(/[^A-ZÁÀÂÄÉÈÊËÍÎÏÓÔÖÚÙÛÜ\s-]/g,'');
    nom = nom.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    var parts = nom.split(/[\s\-]+/).filter(Boolean);
    if (parts.length >= 2) return parts[0][0] + parts[1][0];
    var n = parts[0] || '';
    var first = n[0] || '';
    var secondCons = '';
    for (var i = 1; i < n.length; i++) {
      if (consonnes.indexOf(n[i]) !== -1) { secondCons = n[i]; break; }
    }
    if (!secondCons && n.length > 1) secondCons = n[1];
    return first + (secondCons || '');
  }
  var codeBase = '';
  if (type === 'morale') {
    codeBase = codeNom(nomOuRaison);
  } else {
    var codNom = codeNom(nomOuRaison);
    var initPrenom = (prenom||'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')[0] || '';
    codeBase = codNom + initPrenom;
  }
  var clients = getClients();
  // Exclure le client en cours d'édition + trouver le MAX numéro séquentiel
  var maxNum = 0;
  clients.forEach(function(c){
    if (_editingClientId && c.id === _editingClientId) return;
    if (c.code && c.code.startsWith(codeBase)) {
      var numPart = c.code.substring(codeBase.length);
      var n = parseInt(numPart, 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
  });
  return codeBase + String(maxNum + 1).padStart(3,'0');
}

function previewCode() {
  // Ne pas écraser si l'utilisateur a modifié manuellement
  var codeInput = document.getElementById('cl-code-input');
  if (codeInput && codeInput.style.display !== 'none' && codeInput.dataset.manual === '1') return;
  var type = document.querySelector('input[name="cl-type"]:checked');
  if (!type) return;
  var code = '';
  if (type.value === 'physique') {
    var prenom = (document.getElementById('cl-prenom').value||'').trim();
    var nom    = (document.getElementById('cl-nom').value||'').trim();
    if (nom.length >= 2) code = genClientCode('physique', prenom, nom);
  } else {
    var raison = (document.getElementById('cl-raison').value||'').trim();
    if (raison.length >= 2) code = genClientCode('morale', '', raison);
  }
  var clients = getClients();
  var num = clients.length + 1;
  document.getElementById('cl-code-preview').textContent = code || '—';
  document.getElementById('cl-num-preview').textContent  = code ? '· N° '+String(num).padStart(4,'0') : '';
}

var _clCodeEditMode = false;
function toggleClientCodeEdit() {
  var preview = document.getElementById('cl-code-preview');
  var input   = document.getElementById('cl-code-input');
  var btn     = document.getElementById('cl-code-edit-btn');
  if (!preview || !input) return;
  _clCodeEditMode = !_clCodeEditMode;
  if (_clCodeEditMode) {
    input.value = preview.textContent === '—' ? '' : preview.textContent;
    input.style.display = '';
    preview.style.display = 'none';
    input.dataset.manual = '1';
    input.focus();
    btn.textContent = '✓';
    btn.title = 'Valider le code';
  } else {
    var val = input.value.trim().toUpperCase();
    if (val) preview.textContent = val;
    input.style.display = 'none';
    preview.style.display = '';
    input.dataset.manual = '0';
    btn.textContent = '✏️';
    btn.title = 'Modifier le code';
  }
}

// ══════════════════════════════════════════════════════════
//  B — CLIENT FORM UI
// ══════════════════════════════════════════════════════════

function switchClientTab(tab, btn) {
  document.querySelectorAll('.cl-tab').forEach(function(t){
    t.classList.remove('active');
    t.style.color = 'var(--text-3)';
    t.style.borderBottomColor = 'transparent';
  });
  document.querySelectorAll('.cl-tab-panel').forEach(function(p){ p.style.display = 'none'; });
  btn.classList.add('active');
  btn.style.color = 'var(--accent)';
  btn.style.borderBottomColor = 'var(--accent)';
  var panel = document.getElementById('cl-panel-'+tab);
  if (panel) panel.style.display = 'block';
}

function togglePersonneType() {
  var typeEl = document.querySelector('input[name="cl-type"]:checked');
  if (!typeEl) return;
  var type = typeEl.value;
  document.getElementById('cl-fields-physique').style.display = type==='physique' ? 'grid' : 'none';
  document.getElementById('cl-fields-morale').style.display   = type==='morale'   ? 'grid' : 'none';
  document.getElementById('cl-fields-groupe').style.display   = type==='groupe'   ? 'block': 'none';
  // Code client : généré vs manuel
  var codePreviewEl   = document.getElementById('cl-code-preview');
  var codeNumEl       = document.getElementById('cl-num-preview');
  var codeGroupeWrap  = document.getElementById('cl-code-groupe-wrap');
  if (type === 'groupe') {
    if (codePreviewEl) codePreviewEl.style.display = 'none';
    if (codeNumEl)     codeNumEl.style.display     = 'none';
    if (codeGroupeWrap) codeGroupeWrap.style.display = 'flex';
    previewCodeGroupe();
  } else {
    if (codePreviewEl) codePreviewEl.style.display = '';
    if (codeNumEl)     codeNumEl.style.display     = '';
    if (codeGroupeWrap) codeGroupeWrap.style.display = 'none';
    document.getElementById('cl-code-preview').textContent = '—';
    document.getElementById('cl-num-preview').textContent   = '';
  }
}

function previewCodeGroupe() {
  var lettres = (document.getElementById('cl-code-groupe-lettres')||{value:''}).value.trim().toUpperCase();
  var clients = getClients();
  var numEl   = document.getElementById('cl-code-groupe-num');
  if (!lettres || lettres.length < 2) { if(numEl) numEl.textContent=''; return; }
  var existing = clients.filter(function(c){ return c.code && c.code.startsWith(lettres); });
  var num = String(existing.length + 1).padStart(3,'0');
  if (numEl) numEl.textContent = '→ Code : '+lettres+num+' · N° '+String(clients.length+1).padStart(4,'0');
}

function toggleSourceDetail() {
  var source = document.getElementById('cl-source').value;
  var wrap   = document.getElementById('cl-source-detail-wrap');
  var lbl    = document.getElementById('cl-source-detail-label');
  if (!wrap) return;
  var needDetail = source.indexOf('Recommandation') !== -1;
  wrap.style.display = needDetail ? 'block' : 'none';
  if (lbl) lbl.textContent = source.indexOf('client') !== -1 ? 'Nom du client référent' : 'Nom du référent (ami / famille)';
}

// B2 — Copie téléphone → WhatsApp
function syncWhatsApp() {
  var telInput = document.getElementById('cl-tel');
  var waInput  = document.getElementById('cl-whatsapp');
  var cb       = document.getElementById('copy-whatsapp-cb');
  if (!telInput || !waInput || !cb) return;
  if (cb.checked) {
    waInput.value    = telInput.value;
    waInput.readOnly = true;
    waInput.style.opacity = '0.6';
    telInput.addEventListener('input', _syncWaTel);
  } else {
    waInput.readOnly = false;
    waInput.style.opacity = '';
    telInput.removeEventListener('input', _syncWaTel);
  }
}
function _syncWaTel() {
  var cb = document.getElementById('copy-whatsapp-cb');
  if (cb && cb.checked) {
    var wa = document.getElementById('cl-whatsapp');
    if (wa) wa.value = document.getElementById('cl-tel').value;
  }
}

// B3 — Contacts auxiliaires (secondaires)
var _contactAuxCount = 0;
function addContactAux() {
  _contactAuxCount++;
  var n    = _contactAuxCount;
  var list = document.getElementById('cl-contacts-aux-list');
  if (!list) return;
  var div = document.createElement('div');
  div.id = 'cl-aux-'+n;
  div.style.cssText = 'border:1px solid var(--border);border-radius:6px;padding:0.8rem;margin-bottom:0.8rem;position:relative';
  div.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.7rem">'+
      '<span style="font-size:0.75rem;color:var(--text-3);letter-spacing:0.1em;text-transform:uppercase">Contact '+n+'</span>'+
      '<button class="btn btn-sm" style="color:#e07070;padding:0.2rem 0.5rem" onclick="document.getElementById(\'cl-aux-'+n+'\').remove()">✕</button>'+
    '</div>'+
    '<div class="form-grid">'+
      '<div class="form-field"><label class="form-label">Prénom</label><input class="form-input cl-aux-prenom" placeholder="Prénom" /></div>'+
      '<div class="form-field"><label class="form-label">Nom</label><input class="form-input cl-aux-nom" placeholder="Nom" /></div>'+
      '<div class="form-field"><label class="form-label">Email</label><input class="form-input cl-aux-email" type="email" placeholder="email@…" /></div>'+
      '<div class="form-field"><label class="form-label">Téléphone</label><input class="form-input cl-aux-tel" placeholder="+216…" /></div>'+
    '</div>';
  list.appendChild(div);
}

// B3 — Groupe de clients (type radio = 3e option)
var _groupeMembreCount = 0;
function addGroupeMembre() {
  _groupeMembreCount++;
  var n    = _groupeMembreCount;
  var list = document.getElementById('cl-groupe-list');
  if (!list) return;
  var clients = getClients();
  // Option 4 : afficher prénom + nom de famille depuis la fiche client
  var opts = '<option value="">— Lier à un client existant (optionnel) —</option>' +
    clients.map(function(c){
      var label = c.type === 'morale'
        ? (c.raison||c.displayNom||'')
        : ((c.prenom ? c.prenom+' ' : '') + (c.nom||c.displayNom||''));
      return '<option value="'+c.id+'">'+label.trim()+(c.code?' ('+c.code+')':'')+'</option>';
    }).join('');
  var div = document.createElement('div');
  div.id = 'cl-gm-'+n;
  div.style.cssText = 'border:1px solid var(--border);border-radius:6px;padding:0.8rem;margin-bottom:0.6rem;transition:border-color .2s';
  div.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.6rem">'+
      '<label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;font-size:0.8rem">'+
        '<input type="radio" name="groupe-mandataire" value="'+n+'" style="accent-color:var(--accent)" onchange="updateMandataire('+n+')" '+(_groupeMembreCount===1?'checked':'')+' />'+
        '<span style="color:var(--text-2)">Mandataire principal</span>'+
      '</label>'+
      '<button type="button" class="btn btn-sm" style="color:#e07070;padding:0.2rem 0.5rem" onclick="document.getElementById(\'cl-gm-'+n+'\').remove()">✕</button>'+
    '</div>'+
    '<div class="form-grid">'+
      '<div class="form-field"><label class="form-label">Prénom <span style="color:#e07070">*</span></label><input class="form-input cl-gm-prenom" placeholder="Prénom" /></div>'+
      '<div class="form-field"><label class="form-label">Nom de famille <span style="color:#e07070">*</span></label><input class="form-input cl-gm-nom" placeholder="Nom" /></div>'+
      '<div class="form-field"><label class="form-label">Rôle</label><input class="form-input cl-gm-role" placeholder="héritier, associé, gérant…" /></div>'+
      '<div class="form-field"><label class="form-label">Téléphone</label><input class="form-input cl-gm-tel" type="tel" placeholder="+216…" /></div>'+
      '<div class="form-field full"><label class="form-label">Ou lier à un client existant (prénom + nom)</label><select class="form-select cl-gm-id" onchange="prefillMembreFromClient(this,\''+n+'\')">'+opts+'</select></div>'+
    '</div>';
  list.appendChild(div);
  if (_groupeMembreCount === 1) updateMandataire(1);
}

// Pré-remplir prénom/nom depuis le client lié
function prefillMembreFromClient(sel, n) {
  var clientId = sel.value;
  if (!clientId) return;
  var c = getClients().find(function(x){ return x.id===clientId; });
  if (!c) return;
  var div = document.getElementById('cl-gm-'+n);
  if (!div) return;
  var prenomEl = div.querySelector('.cl-gm-prenom');
  var nomEl    = div.querySelector('.cl-gm-nom');
  if (prenomEl && c.prenom) prenomEl.value = c.prenom;
  if (nomEl    && c.nom)    nomEl.value    = c.nom || c.raison || '';
}
function updateMandataire(n) {
  document.querySelectorAll('#cl-groupe-list > div').forEach(function(d){
    d.style.borderColor = 'var(--border)';
  });
  var el = document.getElementById('cl-gm-'+n);
  if (el) el.style.borderColor = 'var(--accent)';
}
function getGroupeData() {
  var typeEl = document.querySelector('input[name="cl-type"]:checked');
  if (!typeEl || typeEl.value !== 'groupe') return null;
  var titre   = (document.getElementById('cl-groupe-titre')||{value:''}).value.trim();
  var membres = [];
  document.querySelectorAll('#cl-groupe-list > div').forEach(function(div){
    var radio   = div.querySelector('input[type=radio]');
    var prenom  = div.querySelector('.cl-gm-prenom');
    var nom     = div.querySelector('.cl-gm-nom');
    var role    = div.querySelector('.cl-gm-role');
    var tel     = div.querySelector('.cl-gm-tel');
    var sel     = div.querySelector('.cl-gm-id');
    var prenomV = prenom ? prenom.value.trim() : '';
    var nomV    = nom    ? nom.value.trim()    : '';
    membres.push({
      prenom:     prenomV,
      nom:        nomV,
      nomComplet: (prenomV + ' ' + nomV).trim(),
      role:       role ? role.value.trim() : '',
      tel:        tel  ? tel.value.trim()  : '',
      clientId:   sel  ? sel.value         : '',
      mandataire: radio ? radio.checked    : false
    });
  });
  return { titre: titre, membres: membres };
}
function validateGroupe() {
  var typeEl = document.querySelector('input[name="cl-type"]:checked');
  if (!typeEl || typeEl.value !== 'groupe') return true;
  var titre = (document.getElementById('cl-groupe-titre')||{value:''}).value.trim();
  if (!titre) return false;
  var mandataireChecked = document.querySelector('#cl-groupe-list input[type=radio]:checked');
  var errEl = document.getElementById('cl-groupe-err');
  if (!mandataireChecked) { if(errEl) errEl.style.display='block'; return false; }
  if (errEl) errEl.style.display='none';
  return true;
}

// ══════════════════════════════════════════════════════════
//  B — SAVE CLIENT
// ══════════════════════════════════════════════════════════
function saveClient() {
  var typeEl = document.querySelector('input[name="cl-type"]:checked');
  var type   = typeEl ? typeEl.value : 'physique';
  var prenom       = (document.getElementById('cl-prenom').value||'').trim();
  var nom          = (document.getElementById('cl-nom').value||'').trim();
  var raison       = (document.getElementById('cl-raison').value||'').trim();
  var matricule    = (document.getElementById('cl-matricule').value||'').trim();
  var email        = (document.getElementById('cl-email').value||'').trim();
  var tel          = (document.getElementById('cl-tel').value||'').trim();
  var whatsapp     = (document.getElementById('cl-whatsapp').value||'').trim();
  var adresse      = (document.getElementById('cl-adresse').value||'').trim();
  var statut       = document.getElementById('cl-statut').value;
  var dateContact  = document.getElementById('cl-date-contact').value;
  var source       = document.getElementById('cl-source').value;
  var sourceDetail = (document.getElementById('cl-source-detail').value||'').trim();
  var remarques    = (document.getElementById('cl-remarques').value||'').trim();
  var err          = document.getElementById('cl-err');

  // Validation selon le type
  if (type==='physique' && !nom) {
    err.textContent='Le nom de famille est obligatoire.'; err.style.display='block';
    switchClientTab('identite', document.querySelectorAll('.cl-tab')[0]); return;
  }
  if (type==='morale' && !raison) {
    err.textContent='La raison sociale est obligatoire.'; err.style.display='block';
    switchClientTab('identite', document.querySelectorAll('.cl-tab')[0]); return;
  }
  if (type==='groupe') {
    var titrGr = (document.getElementById('cl-groupe-titre')||{value:''}).value.trim();
    if (!titrGr) {
      err.textContent="L'intitulé du groupe est obligatoire."; err.style.display='block';
      switchClientTab('identite', document.querySelectorAll('.cl-tab')[0]); return;
    }
    if (!validateGroupe()) {
      err.textContent="Veuillez désigner un mandataire principal dans le groupe."; err.style.display='block';
      switchClientTab('identite', document.querySelectorAll('.cl-tab')[0]); return;
    }
  }
  err.style.display='none';

  // Contacts auxiliaires
  var contactsAux = [];
  document.querySelectorAll('#cl-contacts-aux-list > div').forEach(function(div){
    contactsAux.push({
      prenom: (div.querySelector('.cl-aux-prenom')||{value:''}).value.trim(),
      nom:    (div.querySelector('.cl-aux-nom')||{value:''}).value.trim(),
      email:  (div.querySelector('.cl-aux-email')||{value:''}).value.trim(),
      tel:    (div.querySelector('.cl-aux-tel')||{value:''}).value.trim(),
    });
  });

  var groupe = getGroupeData();
  var clients    = getClients();
  // displayNom selon le type
  var displayNom;
  if (type==='groupe') {
    var grTitre = (document.getElementById('cl-groupe-titre')||{value:''}).value.trim();
    displayNom = grTitre;
    // Mandataire principal : prénom + nom
    var mandataireEl = document.querySelector('#cl-groupe-list input[type=radio]:checked');
    if (mandataireEl) {
      var mandDiv = mandataireEl.closest('[id^="cl-gm-"]');
      if (mandDiv) {
        var mandPrenom = mandDiv.querySelector('.cl-gm-prenom');
        var mandNom2   = mandDiv.querySelector('.cl-gm-nom');
        var mandFull   = ((mandPrenom?mandPrenom.value.trim():'')+' '+(mandNom2?mandNom2.value.trim():'')).trim();
        if (mandFull) displayNom = grTitre + ' — ' + mandFull;
      }
    }
  } else if (type==='morale') {
    displayNom = raison;
  } else {
    displayNom = nom + (prenom ? ' '+prenom : '');
  }
  // Normaliser : supprimer virgules + forcer majuscules
  displayNom = displayNom.replace(/,/g, '').toUpperCase();
  nom    = nom    ? nom.replace(/,/g, '').toUpperCase()    : nom;
  prenom = prenom ? prenom.replace(/,/g, '').toUpperCase() : prenom;
  raison = raison ? raison.replace(/,/g, '').toUpperCase() : raison;

  var numClient  = _editingClientId
    ? (clients.find(function(c){ return c.id===_editingClientId; })||{}).numClient || clients.length + 1
    : clients.length + 1;

  var codeKey = type==='groupe'
    ? (document.getElementById('cl-groupe-titre')||{value:''}).value.trim()
    : (type==='morale' ? raison : nom);

  // Code client : manuel pour groupe, généré pour les autres
  var codeGenere;
  if (type === 'groupe') {
    var lettresEl = document.getElementById('cl-code-groupe-lettres');
    var lettres   = lettresEl ? lettresEl.value.trim().toUpperCase() : '';
    if (!lettres || lettres.length < 2) {
      err.textContent = 'Le code client doit comporter 2 ou 3 lettres.';
      err.style.display = 'block';
      switchClientTab('identite', document.querySelectorAll('.cl-tab')[0]); return;
    }
    var existing = clients.filter(function(c){ return c.code && c.code.startsWith(lettres); });
    codeGenere = lettres + String(existing.length + 1).padStart(3,'0');
  } else {
    codeGenere = genClientCode(type, prenom, type==='morale' ? raison : nom);
  }

  // Priorité : code manuel > code affiché dans le preview > code généré
  var clCodeInput = document.getElementById('cl-code-input');
  var clCodePreview = document.getElementById('cl-code-preview');
  var manualCode  = (clCodeInput && clCodeInput.dataset.manual === '1') ? clCodeInput.value.trim().toUpperCase() : '';
  var finalCode;
  if (manualCode) {
    finalCode = manualCode;
  } else if (clCodePreview && clCodePreview.textContent && clCodePreview.textContent !== '—') {
    // Utiliser le code affiché dans le preview (cohérent avec ce que l'utilisateur voit)
    finalCode = clCodePreview.textContent.trim();
  } else {
    finalCode = codeGenere;
  }

  var body = {
    code: finalCode,
    numClient: numClient, type: type, prenom: prenom, nom: nom,
    raison: raison, matricule: matricule, displayNom: displayNom,
    email: email, tel: tel, whatsapp: whatsapp, adresse: adresse,
    statut: statut, dateContact: dateContact||null, source: source||null,
    sourceDetail: sourceDetail||null, remarques: remarques,
    contactsAux: contactsAux,
    groupe: groupe
  };

  var method = 'POST';
  var url    = 'api/clients.php';
  if (_editingClientId) {
    method  = 'PUT';
    url     = 'api/clients.php?id=' + _editingClientId;
    body.id = _editingClientId;
  }

  apiFetch(url, {method:method, body:body})
    .then(function(){ loadData().then(function(){ renderClients(); }); closeModal('modal-client'); resetClientForm(); })
    .catch(function(e){ err.textContent=e.message||'Erreur'; err.style.display='block'; });
}

function resetClientForm() {
  ['cl-prenom','cl-nom','cl-raison','cl-matricule','cl-email','cl-tel','cl-whatsapp',
   'cl-adresse','cl-date-contact','cl-source-detail','cl-remarques'].forEach(function(id){
    var el = document.getElementById(id); if (el) el.value = '';
  });
  var whatsapp = document.getElementById('cl-whatsapp');
  if (whatsapp) { whatsapp.readOnly = false; whatsapp.style.opacity = ''; }
  var cb = document.getElementById('copy-whatsapp-cb');
  if (cb) cb.checked = false;
  var tel = document.getElementById('cl-tel');
  if (tel) tel.removeEventListener('input', _syncWaTel);

  document.getElementById('cl-type-physique').checked = true;
  document.getElementById('cl-statut').value           = 'Actif';
  document.getElementById('cl-source').value           = '';
  var sdw = document.getElementById('cl-source-detail-wrap');
  if (sdw) sdw.style.display = 'none';
  document.getElementById('cl-contacts-aux-list').innerHTML = '';
  document.getElementById('cl-err').style.display           = 'none';
  document.getElementById('cl-code-preview').textContent    = '—';
  document.getElementById('cl-code-preview').style.display  = '';
  var clCodeInp = document.getElementById('cl-code-input'); if(clCodeInp) { clCodeInp.style.display='none'; clCodeInp.dataset.manual='0'; clCodeInp.value=''; }
  var clCodeBtn = document.getElementById('cl-code-edit-btn'); if(clCodeBtn) { clCodeBtn.textContent='✏️'; clCodeBtn.title='Modifier le code'; }
  _clCodeEditMode = false;
  document.getElementById('cl-num-preview').textContent     = '';

  // Reset groupe (nouveau système radio)
  var gbList = document.getElementById('cl-groupe-list');
  if (gbList) gbList.innerHTML = '';
  var gbTitre = document.getElementById('cl-groupe-titre');
  if (gbTitre) gbTitre.value = '';
  var gbErr = document.getElementById('cl-groupe-err');
  if (gbErr) gbErr.style.display = 'none';
  var gbLettres = document.getElementById('cl-code-groupe-lettres');
  if (gbLettres) gbLettres.value = '';
  var gbNum = document.getElementById('cl-code-groupe-num');
  if (gbNum) gbNum.textContent = '';
  var gbWrap = document.getElementById('cl-code-groupe-wrap');
  if (gbWrap) gbWrap.style.display = 'none';
  _groupeMembreCount = 0;
  _contactAuxCount   = 0;

  togglePersonneType();
  _editingClientId   = null;
  _contactAuxCount   = 0;
  // Remettre le titre et bouton en mode création
  var titleEl = document.getElementById('modal-client-title');
  if (titleEl) titleEl.textContent = 'Nouveau client';
  var saveBtn = document.getElementById('cl-save-btn');
  if (saveBtn) saveBtn.textContent = 'Créer la fiche client →';
  var tabs   = document.querySelectorAll('.cl-tab');
  var panels = document.querySelectorAll('.cl-tab-panel');
  tabs.forEach(function(t, i){
    t.style.color = i===0 ? 'var(--accent)' : 'var(--text-3)';
    t.style.borderBottomColor = i===0 ? 'var(--accent)' : 'transparent';
    t.classList.toggle('active', i===0);
  });
  panels.forEach(function(p, i){ p.style.display = i===0 ? 'block' : 'none'; });

  // Réinitialiser selects extensibles
  setTimeout(initExtensibleSelects, 50);
}

// ── Client search/filter ──
function clientFilterChanged(){ renderClients(); }
function getFilteredClients(){
  var clients = getClients();
  var q = (document.getElementById('clients-search')||{value:''}).value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  var fStatut = (document.getElementById('clients-filter-statut')||{value:''}).value;
  return clients.filter(function(c){
    if(fStatut && (c.statut||'')!==fStatut) return false;
    if(!q) return true;
    var hay = [(c.code||''),(c.displayNom||c.nom||c.raison||''),(c.email||''),(c.whatsapp||c.tel||''),(c.source||'')].join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    return hay.indexOf(q)!==-1;
  });
}

// ── Colonnes clients ──
var ALL_CL_COLUMNS = [
  {key:'code',     label:'Code',     default:true, locked:false,sortable:true, render:function(c){return'<span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--accent)">'+c.code+'</span>';}},
  {key:'nom',      label:'Nom',      default:true, locked:true, sortable:true, render:function(c){return'<span style="font-weight:500">'+(c.displayNom||c.nom||c.raison)+'</span>';}},
  {key:'whatsapp', label:'WhatsApp', default:true, locked:false,sortable:false,render:function(c){var wa=c.whatsapp||c.tel||'';return wa?'<a href="https://wa.me/'+wa.replace(/[^0-9]/g,'')+'" target="_blank" style="color:#25D366;text-decoration:none" title="WhatsApp"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:3px"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>'+wa+'</a>':'—';}},
  {key:'email',    label:'Email',    default:true, locked:false,sortable:true, render:function(c){return c.email?'<a href="mailto:'+c.email+'" style="color:var(--accent)">'+c.email+'</a>':'—';}},
  {key:'source',   label:'Source',   default:true, locked:false,sortable:true, render:function(c){return c.source?'<span style="font-size:0.7rem;padding:0.15rem 0.4rem;background:var(--bg-2);border-radius:3px;color:var(--text-3)">'+c.source.split('/')[0].split('(')[0].trim()+'</span>':'—';}},
  {key:'statut',   label:'Statut',   default:true, locked:false,sortable:true, render:function(c){return'<span class="'+badgeClass(c.statut)+'">'+c.statut+'</span>';}},
  {key:'type',     label:'Type',     default:false,locked:false,sortable:true, render:function(c){return c.type==='morale'?'Morale':c.type==='groupe'?'Groupe':'Physique';}},
  {key:'tel',      label:'Téléphone',default:false,locked:false,sortable:false,render:function(c){return c.tel||'—';}},
  {key:'adresse',  label:'Adresse',  default:false,locked:false,sortable:true, render:function(c){return c.adresse||'—';}},
  {key:'projets',  label:'Projets',  default:false,locked:false,sortable:true, render:function(c){var pjs=getProjets();var count=pjs.filter(function(p){return p.client_code===c.code||(c.id&&(p.client_id===c.id||p.clientId===c.id));}).length;return String(count);}},
  {key:'creeAt',   label:'Créé le',  default:false,locked:false,sortable:true, render:function(c){if(!c.creeAt&&!c.cree_at) return '—'; var d=new Date(c.creeAt||c.cree_at); return isNaN(d)?'—':d.toLocaleDateString('fr-FR');}},
  {key:'creePar',  label:'Créé par', default:false,locked:false,sortable:true, render:function(c){return c.creePar||c.cree_par||'—';}},
  {key:'modifiePar',label:'Modifié par',default:false,locked:false,sortable:true, render:function(c){return c.modifie_par||'—';}}
];
var _clActiveColumns = null;

function _userPrefKey(base) {
  var s = getSession();
  var uname = (s && s.name) ? s.name.replace(/[^a-zA-Z0-9]/g,'_') : 'default';
  return base + '_' + uname;
}

function getClActiveColumns(){
  if(_clActiveColumns) return _clActiveColumns;
  var userKey = _userPrefKey('cortoba_cl_col_order');
  var saved = getSetting(userKey, null);
  if (!saved) saved = getLS('cortoba_cl_col_order', null); // fallback ancien format
  _clActiveColumns = (saved&&Array.isArray(saved)) ? saved : ALL_CL_COLUMNS.filter(function(c){return c.default;}).map(function(c){return c.key;});
  return _clActiveColumns;
}
function saveClColumnPrefs(){ var k=_userPrefKey('cortoba_cl_col_order'); setLS(k,_clActiveColumns); saveSetting(k,_clActiveColumns); }
function toggleClColumn(key){
  var col=ALL_CL_COLUMNS.find(function(c){return c.key===key;});
  if(col&&col.locked) return;
  var idx=_clActiveColumns.indexOf(key);
  if(idx===-1){
    // Insérer à la bonne position relative
    var allKeys=ALL_CL_COLUMNS.map(function(c){return c.key;});
    var pos=_clActiveColumns.length;
    for(var i=0;i<_clActiveColumns.length;i++){
      if(allKeys.indexOf(_clActiveColumns[i])>allKeys.indexOf(key)){pos=i;break;}
    }
    _clActiveColumns.splice(pos,0,key);
  } else {
    _clActiveColumns.splice(idx,1);
  }
  saveClColumnPrefs(); renderClients();
}
function resetClColumns(){ _clActiveColumns=ALL_CL_COLUMNS.filter(function(c){return c.default;}).map(function(c){return c.key;}); saveClColumnPrefs(); renderClients(); }

function openClColumnSelector(){
  var active = getClActiveColumns();
  var html='<div style="font-size:0.75rem;color:var(--text-3);margin-bottom:0.6rem;display:flex;justify-content:space-between;align-items:center"><span>Colonnes visibles</span><button class="btn btn-sm" onclick="resetClColumns();this.closest(\'.modal-overlay\').remove()" style="font-size:0.68rem">Réinitialiser</button></div>';
  ALL_CL_COLUMNS.forEach(function(col){
    var checked = active.indexOf(col.key)!==-1;
    var disabled = col.locked;
    html+='<label style="display:flex;align-items:center;gap:0.5rem;padding:0.35rem 0;cursor:'+(disabled?'default':'pointer')+';opacity:'+(disabled?'0.5':'1')+'">'+
      '<input type="checkbox" '+(checked?'checked':'')+' '+(disabled?'disabled':'')+' onchange="toggleClColumn(\''+col.key+'\')" style="accent-color:var(--accent)">'+
      '<span style="font-size:0.82rem">'+col.label+'</span></label>';
  });
  var ov=document.createElement('div');
  ov.className='modal-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center';
  ov.onclick=function(e){if(e.target===ov)ov.remove();};
  ov.innerHTML='<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:1.2rem 1.5rem;max-width:340px;width:90%">'+html+'</div>';
  document.body.appendChild(ov);
}

// ── Tri clients ──
var _clSortKey = 'nom', _clSortDir = 1;
function sortByClColumn(key) {
  if (_clSortKey === key) _clSortDir *= -1;
  else { _clSortKey = key; _clSortDir = 1; }
  renderClients();
}
window.sortByClColumn = sortByClColumn;

// ── Render Clients ──
function renderClients() {
  var tb = document.getElementById('clients-tbody'); if (!tb) return;
  var th = document.getElementById('clients-thead');
  var allClients = getClients();
  var clients = getFilteredClients();
  var active = getClActiveColumns();
  var ct = document.getElementById('clients-count');
  if(ct) ct.textContent = clients.length===allClients.length ? clients.length+' client'+(clients.length>1?'s':'') : clients.length+' / '+allClients.length+' clients';

  // Tri des clients
  var sk = _clSortKey, sd = _clSortDir;
  clients.sort(function(a, b) {
    var va, vb;
    if (sk === 'nom') { va = (a.displayNom||a.nom||a.raison||'').toLowerCase(); vb = (b.displayNom||b.nom||b.raison||'').toLowerCase(); }
    else if (sk === 'projets') {
      var pjs = getProjets();
      va = pjs.filter(function(p){return p.client_code===a.code;}).length;
      vb = pjs.filter(function(p){return p.client_code===b.code;}).length;
    }
    else if (sk === 'creeAt') { va = a.creeAt||a.cree_at||''; vb = b.creeAt||b.cree_at||''; }
    else { va = (a[sk]||'').toString().toLowerCase(); vb = (b[sk]||'').toString().toLowerCase(); }
    if (va < vb) return -1 * sd; if (va > vb) return 1 * sd; return 0;
  });

  // Header avec tri
  function clSortIcon(key) {
    if (_clSortKey !== key) return '<span style="margin-left:3px;font-size:0.6rem;color:var(--border);vertical-align:middle">⇅</span>';
    return '<span style="margin-left:3px;font-size:0.65rem;color:var(--accent);vertical-align:middle">' + (_clSortDir === 1 ? '▲' : '▼') + '</span>';
  }
  if(th){
    th.innerHTML = active.map(function(key){
      var col=ALL_CL_COLUMNS.find(function(x){return x.key===key;});
      if(!col) return '';
      var s = 'padding:0.45rem 0.8rem;font-size:0.7rem;white-space:nowrap;' + (col.sortable ? 'cursor:pointer;user-select:none' : '');
      return '<th style="'+s+'" '+(col.sortable?'onclick="sortByClColumn(\''+key+'\')"':'')+'>'+col.label+(col.sortable?clSortIcon(key):'')+'</th>';
    }).join('') + '<th style="padding:0.45rem 0.8rem"></th>';
  }
  tb.innerHTML = clients.length === 0
    ? '<tr><td colspan="'+(active.length+1)+'" style="text-align:center;color:var(--text-3);padding:2rem">'+(allClients.length?'Aucun résultat.':'Aucun client. Créez votre premier client.')+'</td></tr>'
    : clients.map(function(c) {
        var cells = active.map(function(key){
          var col=ALL_CL_COLUMNS.find(function(x){return x.key===key;});
          if(!col) return '<td style="padding:0.35rem 0.8rem">—</td>';
          var stopProp = (key==='whatsapp'||key==='email') ? ' onclick="event.stopPropagation()"' : '';
          return '<td style="padding:0.35rem 0.8rem"'+stopProp+'>'+col.render(c)+'</td>';
        }).join('');
        return '<tr onclick="openClientDetail(\''+c.id+'\')" style="cursor:pointer" title="Voir la fiche">'+
          cells+
          '<td onclick="event.stopPropagation()" style="white-space:nowrap;padding:0.35rem 0.8rem">'+
            '<button class="btn btn-sm" onclick="openEditClient(\''+c.id+'\')" style="color:var(--accent);margin-right:3px" title="Modifier">✎</button>'+
            (canDelete() ? '<button class="btn btn-sm" onclick="deleteRow(\'client\',\''+c.id+'\')" style="color:#e07070" title="Supprimer">✕</button>' : '')+
          '</td>'+
        '</tr>';
      }).join('');
}

// ── Client detail view ──
var _editingClientId = null;

function openClientDetail(id) {
  var c = getClients().find(function(x){ return x.id===id; });
  if (!c) return;
  var projets = getProjets().filter(function(p){ return p.client_code===c.code||p.client===c.displayNom||p.client===(c.nom+(c.prenom?' '+c.prenom:'')); });
  var devis   = getDevis().filter(function(d){   return d.client===c.displayNom||d.client===(c.nom+(c.prenom?' '+c.prenom:'')); });
  var groupe  = c.groupe ? '<b>Groupe :</b> '+(c.groupe.titre||'—')+' ('+c.groupe.membres.length+' membres)' : '';
  var info = [
    '<b>Code :</b> '+c.code+' · N° '+String(c.numClient||'—').padStart(4,'0'),
    '<b>Type :</b> '+(c.type==='morale'?'Personne morale':'Personne physique'),
    c.matricule ? '<b>Matricule :</b> '+c.matricule : '',
    '<b>Email :</b> '+(c.email?'<a href="mailto:'+c.email+'">'+c.email+'</a>':'—'),
    '<b>Tél :</b> '+(c.tel||'—'),
    '<b>WhatsApp :</b> '+(c.whatsapp?'<a href="https://wa.me/'+c.whatsapp.replace(/[^0-9]/g,'')+'" target="_blank">'+c.whatsapp+'</a>':'—'),
    '<b>Adresse :</b> '+(c.adresse||'—'),
    '<b>1er contact :</b> '+fmtDate(c.dateContact),
    '<b>Source :</b> '+(c.source||'—')+(c.sourceDetail?' ('+c.sourceDetail+')':''),
    '<b>Statut :</b> '+c.statut,
    c.remarques ? '<b>Remarques :</b> '+c.remarques : '',
    groupe,
    projets.length ? '<b>Projets :</b> '+projets.map(function(p){ return p.nom+' ('+p.phase+')'; }).join(', ') : '',
    devis.length   ? '<b>Devis :</b> '+devis.map(function(d){ return d.ref+' — '+d.statut; }).join(', ') : '',
    c.contactsAux && c.contactsAux.length ? '<b>Contacts :</b> '+c.contactsAux.map(function(a){ return a.prenom+' '+a.nom+(a.email?' ('+a.email+')':''); }).join(', ') : '',
    '<hr style="border-color:var(--border);margin:0.5rem 0">',
    '<span style="font-size:0.75rem;color:var(--text-3)">Créé par '+(c.creePar||'—')+' le '+fmtDate(c.creeAt)+'</span>'
  ].filter(Boolean).join('<br>');
  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center';
  ov.innerHTML =
    '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:2rem;max-width:560px;width:90%;max-height:80vh;overflow-y:auto">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.2rem">'+
    '<div><div style="font-size:0.7rem;color:var(--text-3);letter-spacing:0.12em;text-transform:uppercase;margin-bottom:0.2rem">FICHE CLIENT</div>'+
    '<div style="font-size:1.1rem;font-weight:600">'+(c.displayNom||c.raison)+'</div></div>'+
    '<div style="display:flex;gap:0.5rem;align-items:center">'+
      '<button onclick="this.closest(\'div[style*=\\\"position:fixed\\\"]\').remove();openEditClient(\''+c.id+'\')" '+
        'style="background:var(--accent-bg);border:1px solid rgba(200,169,110,0.3);color:var(--accent);border-radius:4px;padding:0.3rem 0.7rem;cursor:pointer;font-size:0.78rem">✎ Modifier</button>'+
      '<button onclick="this.closest(\'div[style*=position]\').remove()" style="background:none;border:none;color:var(--text-3);font-size:1.2rem;cursor:pointer">✕</button>'+
    '</div>'+
    '</div>'+
    '<div style="line-height:1.9;font-size:0.85rem">'+info+'</div>'+
    '</div>';
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
  document.body.appendChild(ov);
}

// ── Ouvrir la modal en mode édition ──
function openEditClient(id) {
  var c = getClients().find(function(x){ return x.id===id; });
  if (!c) return;

  resetClientForm();
  _editingClientId = id;

  // Mettre à jour le titre et le bouton
  var titleEl = document.getElementById('modal-client-title');
  if (titleEl) titleEl.textContent = 'Modifier — ' + (c.displayNom||c.raison||c.nom);
  var saveBtn = document.getElementById('cl-save-btn');
  if (saveBtn) saveBtn.textContent = 'Enregistrer les modifications →';

  // Type de personne
  if (c.type === 'morale') {
    var radioMorale = document.getElementById('cl-type-morale');
    if (radioMorale) { radioMorale.checked = true; togglePersonneType(); }
    var raisonEl = document.getElementById('cl-raison'); if (raisonEl) raisonEl.value = c.raison||'';
    var matricEl = document.getElementById('cl-matricule'); if (matricEl) matricEl.value = c.matricule||'';
  } else {
    var prenomEl = document.getElementById('cl-prenom'); if (prenomEl) prenomEl.value = c.prenom||'';
    var nomEl    = document.getElementById('cl-nom');    if (nomEl)    nomEl.value    = c.nom||'';
  }

  // Afficher le code existant (sans le régénérer)
  var codeEl = document.getElementById('cl-code-preview');
  if (codeEl) codeEl.textContent = c.code || '—';
  var numEl = document.getElementById('cl-num-preview');
  if (numEl) numEl.textContent = c.numClient ? '· N° '+String(c.numClient).padStart(4,'0') : '';

  // Onglet Contact
  var emailEl = document.getElementById('cl-email'); if (emailEl) emailEl.value = c.email||'';
  var telEl   = document.getElementById('cl-tel');   if (telEl)   telEl.value   = c.tel||'';
  var waEl    = document.getElementById('cl-whatsapp'); if (waEl) waEl.value    = c.whatsapp||'';
  var adrEl   = document.getElementById('cl-adresse'); if (adrEl) adrEl.value   = c.adresse||'';

  // Onglet Identité suite
  var statutEl = document.getElementById('cl-statut');
  if (statutEl) statutEl.value = c.statut || 'Actif';
  var dateEl = document.getElementById('cl-date-contact');
  if (dateEl) dateEl.value = c.dateContact || '';

  // Onglet Source
  var srcEl = document.getElementById('cl-source');
  if (srcEl) { srcEl.value = c.source||''; toggleSourceDetail(); }
  var srcDetEl = document.getElementById('cl-source-detail');
  if (srcDetEl) srcDetEl.value = c.sourceDetail||'';
  var remarqEl = document.getElementById('cl-remarques');
  if (remarqEl) remarqEl.value = c.remarques||'';

  // Contacts auxiliaires
  if (c.contactsAux && c.contactsAux.length) {
    c.contactsAux.forEach(function(aux){
      _contactAuxCount++;
      var n = _contactAuxCount;
      var list = document.getElementById('cl-contacts-aux-list');
      var div = document.createElement('div');
      div.id = 'cl-aux-'+n;
      div.style.cssText = 'border:1px solid var(--border);border-radius:6px;padding:0.8rem;margin-bottom:0.8rem;position:relative';
      div.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.7rem">'+
          '<span style="font-size:0.75rem;color:var(--text-3);letter-spacing:0.1em;text-transform:uppercase">Contact '+n+'</span>'+
          '<button class="btn btn-sm" style="color:#e07070;padding:0.2rem 0.5rem" onclick="document.getElementById(\'cl-aux-'+n+'\').remove()">✕</button>'+
        '</div>'+
        '<div class="form-grid">'+
          '<div class="form-field"><label class="form-label">Prénom</label><input class="form-input cl-aux-prenom" placeholder="Prénom" value="'+(aux.prenom||'')+'" /></div>'+
          '<div class="form-field"><label class="form-label">Nom</label><input class="form-input cl-aux-nom" placeholder="Nom" value="'+(aux.nom||'')+'" /></div>'+
          '<div class="form-field"><label class="form-label">Email</label><input class="form-input cl-aux-email" type="email" placeholder="email@…" value="'+(aux.email||'')+'" /></div>'+
          '<div class="form-field"><label class="form-label">Téléphone</label><input class="form-input cl-aux-tel" placeholder="+216…" value="'+(aux.tel||'')+'" /></div>'+
        '</div>';
      if (list) list.appendChild(div);
    });
  }

  // Groupe
  if (c.groupe && c.type === 'groupe') {
    // Sélectionner le radio groupe
    var grRadio = document.getElementById('cl-type-groupe');
    if (grRadio) { grRadio.checked = true; togglePersonneType(); }
    var gbTitre = document.getElementById('cl-groupe-titre');
    if (gbTitre) gbTitre.value = c.groupe.titre||'';
    if (c.groupe.membres && c.groupe.membres.length) {
      c.groupe.membres.forEach(function(m){
        addGroupeMembre();
        var list = document.getElementById('cl-groupe-list');
        if (!list) return;
        var last = list.lastElementChild;
        if (!last) return;
        var nomEl2 = last.querySelector('.cl-gm-nom');  if (nomEl2) nomEl2.value = m.nom||'';
        var roleEl = last.querySelector('.cl-gm-role'); if (roleEl) roleEl.value = m.role||'';
        var telEl  = last.querySelector('.cl-gm-tel');  if (telEl)  telEl.value  = m.tel||'';
        var selEl  = last.querySelector('.cl-gm-id');   if (selEl)  selEl.value  = m.clientId||'';
        // Cocher le mandataire
        if (m.mandataire) {
          var radio = last.querySelector('input[type=radio]');
          if (radio) { radio.checked = true; updateMandataire(parseInt(radio.value)); }
        }
      });
    }
  }

  document.getElementById('modal-client').classList.add('open');
  setTimeout(initExtensibleSelects, 80);
}

// ══════════════════════════════════════════════════════════
//  OTHER CRUD
// ══════════════════════════════════════════════════════════
function canDelete(){
  var s = getSession();
  return s && (s.isAdmin || s.role === 'Architecte gérant');
}
function deleteRow(type, id){
  if (!canDelete()) { alert('Seul un Architecte gérant peut supprimer.'); return; }
  if (!confirm('Supprimer cet élément ?')) return;
  var path = '';
  if (type==='client')  path = 'api/clients.php?id='+id;
  else if (type==='devis')   path = 'api/data.php?table=devis&id='+id;
  else if (type==='projet')  path = 'api/projets.php?id='+id;
  else if (type==='facture') path = 'api/data.php?table=factures&id='+id;
  else if (type==='depense') path = 'api/data.php?table=depenses&id='+id;
  if (!path) return;
  apiFetch(path, {method:'DELETE'}).then(function(){
    if (type==='client')  loadData().then(function(){ renderClients(); });
    else if (type==='devis')   loadData().then(function(){ renderDevisList(); });
    else if (type==='projet')  loadData().then(function(){ renderProjets(); });
    else if (type==='facture') loadData().then(function(){ renderFactures(); });
    else if (type==='depense') loadData().then(function(){ renderDepenses(); });
  }).catch(function(e){ alert(e.message||'Erreur suppression'); });
}

function openDevisDetail(id){
  var d = getDevis().find(function(x){ return x.id===id; });
  if (!d) return;
  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center';
  var badge = '<span class="'+badgeClass(d.statut)+'">'+d.statut+'</span>';
  var html = '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:2rem;max-width:520px;width:92%;max-height:80vh;overflow-y:auto">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.2rem">'
    + '<div><div style="font-size:0.65rem;color:var(--text-3);letter-spacing:0.15em;text-transform:uppercase;margin-bottom:0.2rem">DEVIS</div>'
    + '<div style="font-size:1.1rem;font-weight:600;color:var(--accent)">'+(d.ref||'—')+'</div></div>'
    + '<button id="close-devis-ov" style="background:none;border:none;color:var(--text-3);font-size:1.3rem;cursor:pointer;line-height:1">\u2715</button></div>'
    + '<table style="width:100%;border-collapse:collapse">'
    + '<tr><td style="padding:0.4rem 0.8rem 0.4rem 0;color:var(--text-3);font-size:0.78rem;white-space:nowrap">Client</td><td style="padding:0.4rem 0;font-size:0.85rem;font-weight:500">'+(d.client||'—')+'</td></tr>'
    + '<tr><td style="padding:0.4rem 0.8rem 0.4rem 0;color:var(--text-3);font-size:0.78rem">Objet</td><td style="padding:0.4rem 0;font-size:0.85rem">'+(d.objet||'—')+'</td></tr>'
    + '<tr><td style="padding:0.4rem 0.8rem 0.4rem 0;color:var(--text-3);font-size:0.78rem">Montant</td><td style="padding:0.4rem 0;font-size:0.95rem;font-weight:700;color:var(--accent)">'+fmtMontant(d.montant||0)+'</td></tr>'
    + '<tr><td style="padding:0.4rem 0.8rem 0.4rem 0;color:var(--text-3);font-size:0.78rem">Date</td><td style="padding:0.4rem 0;font-size:0.85rem">'+fmtDate(d.date)+'</td></tr>'
    + '<tr><td style="padding:0.4rem 0.8rem 0.4rem 0;color:var(--text-3);font-size:0.78rem">Statut</td><td style="padding:0.4rem 0">'+badge+'</td></tr>'
    + '</table>'
    + '<div style="margin-top:1.2rem;display:flex;gap:0.6rem;justify-content:flex-end">'
    + '<button id="close-devis-btn" class="btn btn-sm">Fermer</button>'
    + '<button id="del-devis-btn" class="btn btn-sm" style="color:#e07070">\u2715 Supprimer</button>'
    + '</div></div>';
  ov.innerHTML = html;
  ov.querySelector('#close-devis-ov').addEventListener('click', function(){ ov.remove(); });
  ov.querySelector('#close-devis-btn').addEventListener('click', function(){ ov.remove(); });
  ov.querySelector('#del-devis-btn').addEventListener('click', function(){
    if(confirm('Supprimer ce devis ?')){ deleteRow('devis', d.id); ov.remove(); }
  });
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
  document.body.appendChild(ov);
}

function renderDevisList(){
  var tb=document.getElementById('devis-tbody'); if(!tb) return;
  var list=getDevis();
  tb.innerHTML = list.length===0
    ? '<tr><td colspan="7" style="text-align:center;color:var(--text-3);padding:2rem">Aucun devis.</td></tr>'
    : list.map(function(d){
        var voirBtn = '<button class="btn btn-sm" onclick="openDevisDetail(\''+d.id+'\')" style="color:var(--accent);margin-right:3px">Voir</button>';
        var delBtn  = '<button class="btn btn-sm" onclick="deleteRow(\'devis\',\''+d.id+'\')" style="color:#e07070">✕</button>';
        return '<tr>'+
          '<td class="inline-val" style="font-family:var(--mono);font-size:0.78rem">'+d.ref+'</td>'+
          '<td style="font-weight:500">'+d.client+'</td>'+
          '<td style="color:var(--text-2);font-size:0.85rem">'+d.objet+'</td>'+
          '<td class="inline-val">'+fmtMontant(d.montant||0)+'</td>'+
          '<td>'+fmtDate(d.date)+'</td>'+
          '<td><span class="'+badgeClass(d.statut)+'">'+d.statut+'</span></td>'+
          '<td style="white-space:nowrap">'+voirBtn+delBtn+'</td></tr>';
      }).join('');
  var b = document.querySelector('[onclick="showPage(\'devis\')"] .nav-badge');
  if (b) b.textContent = list.filter(function(d){ return d.statut==='En attente'; }).length || '';
}
// Remplir la checklist des missions dans le modal devis
function populateDevisMissions(selected) {
  var wrap = document.getElementById('dv-missions-list'); if (!wrap) return;
  var missions = getMissions();
  var cats = getMissionCategories();
  selected = selected || [];
  var html = '';
  cats.forEach(function(cat) {
    var catM = missions.filter(function(m){ return m.cat === cat.id; });
    if (catM.length === 0) return;
    html += '<div style="margin-bottom:0.6rem">';
    html += '<div style="font-size:0.65rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--accent);font-weight:600;margin-bottom:0.25rem;display:flex;align-items:center;gap:0.4rem">' + cat.label;
    html += ' <button type="button" style="background:none;border:none;cursor:pointer;color:var(--text-3);font-size:0.6rem;padding:0" onclick="toggleDevisMissionCat(\'' + cat.id + '\')">tout</button></div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:0.2rem">';
    catM.forEach(function(m) {
      var isChecked = selected.indexOf(m.id) !== -1 || selected.indexOf(m.nom) !== -1;
      html += '<label style="display:flex;align-items:center;gap:0.35rem;font-size:0.75rem;color:var(--text-2);cursor:pointer;padding:0.15rem 0">';
      html += '<input type="checkbox" class="dv-mission-cb" data-mid="' + m.id + '" data-cat="' + m.cat + '" value="' + (m.nom||'').replace(/"/g,'&quot;') + '"' + (isChecked ? ' checked' : '') + ' style="accent-color:var(--accent)">';
      html += (m.nom||'') + '</label>';
    });
    html += '</div></div>';
  });
  wrap.innerHTML = html || '<span style="font-size:0.78rem;color:var(--text-3)">Aucune mission configurée</span>';
}

function toggleDevisMissionCat(catId) {
  var cbs = document.querySelectorAll('.dv-mission-cb[data-cat="' + catId + '"]');
  var allChecked = true;
  cbs.forEach(function(cb){ if (!cb.checked) allChecked = false; });
  cbs.forEach(function(cb){ cb.checked = !allChecked; });
}

function getDevisSelectedMissions() {
  var arr = [];
  document.querySelectorAll('.dv-mission-cb:checked').forEach(function(cb) {
    arr.push(cb.value);
  });
  return arr;
}

function saveDevis(){
  var client = (document.getElementById('dv-client').value||'').trim();
  var ref    = (document.getElementById('dv-ref').value||'').trim();
  var objet  = (document.getElementById('dv-objet').value||'').trim();
  var montant = parseFloat(document.getElementById('dv-montant').value)||0;
  var notes  = (document.getElementById('dv-notes').value||'').trim();
  var missions = getDevisSelectedMissions();
  var err    = document.getElementById('dv-err');
  if (!client||!objet) { err.textContent='Client et objet sont obligatoires.'; err.style.display='block'; return; }
  err.style.display='none';
  var list = getDevis();
  var autoRef = ref || ('DV-'+new Date().getFullYear()+'-'+String(list.length+1).padStart(3,'0'));
  var body = {numero:autoRef,client:client,objet:objet,montantHt:montant,montantTtc:montant,statut:'En attente',dateDevis:new Date().toISOString().split('T')[0],notes:notes,missions:missions};
  apiFetch('api/data.php?table=devis', {method:'POST', body:body})
    .then(function(){ loadData().then(function(){ renderDevisList(); }); closeModal('modal-devis');
      ['dv-client','dv-ref','dv-objet','dv-montant','dv-notes'].forEach(function(id){ var el=document.getElementById(id);if(el)el.value=''; }); })
    .catch(function(e){ err.textContent=e.message||'Erreur'; err.style.display='block'; });
}

// ── Filtres et tri projets ──
var PHASES_ORDER = ['Étude préliminaire','APS','APD','PC','DCE','EXE','Livré'];
var _pjSortKey='code', _pjSortDir=1, _pjColDropOpen=false;
var _pjPage=1, _pjPerPage=10, _pjAnneeInitDone=false;

function getFilteredSortedProjets(){
  var q       = (document.getElementById('projets-search')||{value:''}).value.trim().toLowerCase();
  var fStatut = (document.getElementById('projets-filter-statut')||{value:''}).value;
  var fAnnee  = (document.getElementById('projets-filter-annee')||{value:''}).value;
  var list    = getProjets();
  if (q) list = list.filter(function(p){
    var hay = [(p.code||''),(p.nom||''),(p.client||''),(p.statut||''),(p.adresse||'')].join(' ').toLowerCase();
    return q.split(/\s+/).every(function(w){ return hay.indexOf(w) !== -1; });
  });
  if (fStatut) list = list.filter(function(p){ return p.statut===fStatut; });
  if (fAnnee)  list = list.filter(function(p){ return String(p.annee)===fAnnee; });
  var key=_pjSortKey, dir=_pjSortDir;
  return list.slice().sort(function(a,b){
    var va=a[key]||'', vb=b[key]||'';
    if (key==='honoraires'||key==='budget'||key==='surface') return dir*((a[key]||0)-(b[key]||0));
    if (key==='creeAt') return dir*(new Date(va||0)-new Date(vb||0));
    return dir*(va<vb?-1:va>vb?1:0);
  });
}
function populateAnneeFilter(){
  var sel = document.getElementById('projets-filter-annee'); if(!sel) return;
  var current = sel.value;
  var years = {};
  getProjets().forEach(function(p){ if(p.annee) years[p.annee]=1; });
  var sorted = Object.keys(years).sort().reverse();
  // Première ouverture : sélectionner la dernière année par défaut
  if (!_pjAnneeInitDone && !current && sorted.length > 0) {
    current = sorted[0];
    _pjAnneeInitDone = true;
  }
  var html = '<option value="">Toutes les années</option>';
  sorted.forEach(function(y){ html += '<option value="'+y+'"'+(y===current?' selected':'')+'>'+y+'</option>'; });
  sel.innerHTML = html;
  if (current) sel.value = current;
}
function clearPjSearch(){
  var s=document.getElementById('projets-search');if(s)s.value='';
  var fs=document.getElementById('projets-filter-statut');if(fs)fs.value='';
  var fa=document.getElementById('projets-filter-annee');if(fa)fa.value='';
  _pjPage=1; _pjAnneeInitDone=false;
  renderProjets();
}
function pjFilterChanged(){ _pjPage=1; renderProjets(); }
function phaseBadgeClass(ph){
  if(!ph) return 'badge-gray';
  if(ph==='EXE'||ph==='Livré') return 'badge-gold';
  if(ph==='DCE'||ph==='PC')    return 'badge-orange';
  return 'badge-blue';
}

function renderProjets(){
  populateAnneeFilter();
  var thead = document.getElementById('projets-thead');
  var tb    = document.getElementById('projets-tbody');
  if (!thead||!tb) return;
  var active = getPjActiveColumns();
  var list   = getFilteredSortedProjets();
  var total  = getProjets().length;
  var q      = (document.getElementById('projets-search')||{value:''}).value.trim();
  var fStatut = (document.getElementById('projets-filter-statut')||{value:''}).value;
  var sortIcon = function(key){
    if(_pjSortKey!==key) return '<span style="margin-left:3px;font-size:0.6rem;color:var(--border);vertical-align:middle">⇅</span>';
    return '<span style="margin-left:3px;font-size:0.65rem;color:var(--accent);vertical-align:middle">'+(_pjSortDir===1?'▲':'▼')+'</span>';
  };
  var ths = active.map(function(key){
    var col = ALL_PJ_COLUMNS.find(function(c){ return c.key===key; }); if(!col) return '';
    var s = 'padding:0.45rem 0.8rem;white-space:nowrap;user-select:none;'; if(col.sortable) s+='cursor:pointer;';
    return '<th style="'+s+'" '+(col.sortable?'onclick="sortByPjColumn(\''+key+'\')"':'')+'>'+col.label+(col.sortable?sortIcon(key):'')+'</th>';
  }).join('');
  var burgerTh = '<th style="width:28px;padding:0.4rem 0.5rem;text-align:center"><button id="pj-col-burger" onclick="togglePjColDropdown(event)" title="Colonnes visibles" style="background:none;border:none;cursor:pointer;color:var(--text-3);opacity:0.6;padding:2px;display:flex;align-items:center;justify-content:center"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button></th>';
  thead.innerHTML = '<tr>'+ths+'<th style="width:72px"></th>'+burgerTh+'</tr>';
  var ct = document.getElementById('projets-count');
  // Pagination
  var totalFiltered = list.length;
  var totalPages = Math.max(1, Math.ceil(totalFiltered / _pjPerPage));
  if (_pjPage > totalPages) _pjPage = totalPages;
  if (_pjPage < 1) _pjPage = 1;
  var startIdx = (_pjPage - 1) * _pjPerPage;
  var pageList = list.slice(startIdx, startIdx + _pjPerPage);

  if(ct) {
    var showing = totalFiltered === total
      ? total+' projet'+(total>1?'s':'')
      : totalFiltered+' / '+total+' projets';
    if (totalPages > 1) showing += '  ·  page '+_pjPage+'/'+totalPages;
    ct.textContent = showing;
  }
  if(totalFiltered===0){
    var hasFilter = q||fStatut;
    tb.innerHTML = '<tr><td colspan="'+(active.length+2)+'" style="text-align:center;color:var(--text-3);padding:3rem">'+
      (hasFilter?'<div style="font-size:1.5rem;margin-bottom:0.5rem">🔍</div>Aucun résultat.<br><button class="btn btn-sm" style="margin-top:0.6rem" onclick="clearPjSearch()">Effacer les filtres</button>':'<div style="font-size:1.5rem;margin-bottom:0.5rem">🏗️</div>Aucun projet. Créez le premier.')+'</td></tr>';
    renderPjPagination(0, 1);
    if(typeof refreshGlobalMap==='function') setTimeout(refreshGlobalMap,100);
    return;
  }
  tb.innerHTML = pageList.map(function(p){
    var cells = active.map(function(key){
      var col=ALL_PJ_COLUMNS.find(function(x){return x.key===key;}); if(!col) return '<td style="padding:0.35rem 0.8rem">—</td>';
      return '<td style="padding:0.35rem 0.8rem">'+col.render(p)+'</td>';
    }).join('');
    var actionBtns = '<div style="display:flex;gap:2px;align-items:center">'+
      '<button class="btn btn-sm" onclick="event.stopPropagation();openEditProjet(\''+p.id+'\')" title="Modifier" style="color:var(--accent);padding:0.2rem 0.4rem;font-size:0.75rem">✎</button>'+
      (canDelete() ? '<button class="btn btn-sm" onclick="event.stopPropagation();deleteRow(\'projet\',\''+p.id+'\')" title="Supprimer" style="color:#e07070;padding:0.2rem 0.4rem;font-size:0.75rem">✕</button>' : '')+
      '</div>';
    return '<tr onclick="openProjetDetail(\''+p.id+'\')" style="cursor:pointer">'+cells+
      '<td onclick="event.stopPropagation()" style="padding:0.35rem 0.5rem">'+actionBtns+'</td><td style="padding:0.35rem 0.5rem"></td></tr>';
  }).join('');
  renderPjPagination(totalFiltered, totalPages);
  if(document.getElementById('page-projets')&&document.getElementById('page-projets').classList.contains('active')){
    if(typeof refreshGlobalMap==='function') setTimeout(refreshGlobalMap,100);
  }
}

// ── Pagination projets ──
function renderPjPagination(totalItems, totalPages){
  var container = document.getElementById('pj-pagination');
  if (!container) return;
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  var html = '<div style="display:flex;align-items:center;justify-content:center;gap:0.4rem;padding:1rem 0;font-size:0.82rem">';
  // Bouton précédent
  html += '<button class="btn btn-sm" onclick="goToPjPage('+(_pjPage-1)+')" '+(_pjPage<=1?'disabled style="opacity:0.3;pointer-events:none"':'')+' style="padding:0.3rem 0.6rem">← Préc.</button>';
  // Numéros de pages
  var startP = Math.max(1, _pjPage - 2);
  var endP   = Math.min(totalPages, _pjPage + 2);
  if (startP > 1) {
    html += '<button class="btn btn-sm" onclick="goToPjPage(1)" style="padding:0.3rem 0.5rem">1</button>';
    if (startP > 2) html += '<span style="color:var(--text-3);padding:0 0.2rem">…</span>';
  }
  for (var i = startP; i <= endP; i++) {
    var isActive = i === _pjPage;
    html += '<button class="btn btn-sm" onclick="goToPjPage('+i+')" style="padding:0.3rem 0.5rem;'+(isActive?'background:var(--accent);color:#fff;font-weight:600':'')+'">'+i+'</button>';
  }
  if (endP < totalPages) {
    if (endP < totalPages - 1) html += '<span style="color:var(--text-3);padding:0 0.2rem">…</span>';
    html += '<button class="btn btn-sm" onclick="goToPjPage('+totalPages+')" style="padding:0.3rem 0.5rem">'+totalPages+'</button>';
  }
  // Bouton suivant
  html += '<button class="btn btn-sm" onclick="goToPjPage('+(_pjPage+1)+')" '+(_pjPage>=totalPages?'disabled style="opacity:0.3;pointer-events:none"':'')+' style="padding:0.3rem 0.6rem">Suiv. →</button>';
  html += '</div>';
  container.innerHTML = html;
}
function goToPjPage(p){
  _pjPage = p;
  renderProjets();
  // Scroll en haut de la table
  var tbl = document.getElementById('projets-table');
  if (tbl) tbl.scrollIntoView({behavior:'smooth', block:'start'});
}

// ── Carte globale (Leaflet) ──
var _globalMap=null, _globalMarkers=[];
function refreshGlobalMap(){
  var container = document.getElementById('projets-global-map');
  if(!container) return;
  if(typeof L==='undefined'){ container.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-3);font-size:0.85rem">Carte (Leaflet requis)</div>'; return; }
  var projets = getProjets().filter(function(p){ return p.lat&&p.lng; });
  if(!_globalMap){
    _globalMap = L.map('projets-global-map',{zoomControl:true}).setView([33.84,10.88],10);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'Esri',maxZoom:19}).addTo(_globalMap);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',{attribution:'',maxZoom:19,subdomains:'abcd',opacity:1}).addTo(_globalMap);
  }
  _globalMarkers.forEach(function(m){ try{_globalMap.removeLayer(m);}catch(e){} });
  _globalMarkers = [];
  var statColors = {Actif:'#5aab6e','En pause':'#e0a46e',Prospection:'#6fa8d6',Archivé:'#555'};
  projets.forEach(function(p){
    var color  = statColors[p.statut]||'#c8a96e';
    var icon   = L.divIcon({className:'',html:'<div style="width:14px;height:14px;border-radius:50%;background:'+color+';border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.5)"></div>',iconSize:[14,14],iconAnchor:[7,7]});
    var marker = L.marker([p.lat,p.lng],{icon:icon}).addTo(_globalMap);
    var popup  = '<div style="font-family:\'DM Sans\',sans-serif;min-width:180px">'+
      '<div style="font-size:0.7rem;color:#888;margin-bottom:2px">'+(p.code||p.nom)+'</div>'+
      '<div style="font-weight:600;margin-bottom:4px">'+(p.nom||'—')+'</div>'+
      '<div style="font-size:0.78rem;color:#555">'+(p.client||'—')+'</div>'+
      '<span style="display:inline-block;margin-top:4px;padding:2px 6px;border-radius:6px;font-size:0.7rem;background:rgba(0,0,0,0.1)">'+(p.statut||'—')+'</span>'+
      (p.adresse?'<div style="font-size:0.72rem;color:#999;margin-top:4px">📍 '+p.adresse+'</div>':'')+
      '<a href="https://maps.google.com/?q='+p.lat+','+p.lng+'" target="_blank" style="font-size:0.72rem;color:#c8a96e;display:block;margin-top:5px">Ouvrir dans Maps →</a>'+
      '</div>';
    marker.bindPopup(popup,{maxWidth:240});
    _globalMarkers.push(marker);
  });
  if(projets.length>0){
    var group = new L.FeatureGroup(_globalMarkers);
    _globalMap.fitBounds(group.getBounds().pad(0.3));
  }
  setTimeout(function(){ try{ _globalMap.invalidateSize(); }catch(e){}}, 300);
}

// ═══════════════════════════════════════════════════════════
//  A — MODAL PROJET — onglets, code, NAS, missions, intervenants
// ═══════════════════════════════════════════════════════════
var _editingProjetId = null;
var _pjMap = null, _pjMarker = null;
var _intervenantCount = 0;

var PJ_TABS = [
  {id:'identite',     label:'Identité',         icon:'📋'},
  {id:'surfaces',     label:'Surfaces & Coûts',  icon:'📐'},
  {id:'missions',     label:'Missions',          icon:'🎯'},
  {id:'intervenants', label:'Intervenants',      icon:'👥'},
  {id:'localisation', label:'Localisation',      icon:'📍'}
];
function buildPjTabBar(){
  var bar = document.getElementById('pj-tab-bar');
  if(!bar) return;
  bar.innerHTML = PJ_TABS.map(function(t, i){
    return '<button class="pj-tab" data-tab="'+t.id+'" onclick="switchPjTab(\''+t.id+'\',this)" '+
      'style="background:none;border:none;padding:0.55rem 0.8rem;font-size:0.78rem;cursor:pointer;'+
      'border-bottom:2px solid transparent;color:var(--text-3);display:flex;align-items:center;gap:0.4rem;'+
      'transition:all 0.15s;border-radius:6px 6px 0 0;white-space:nowrap">'+
      '<span style="font-size:0.7rem">'+t.icon+'</span>'+
      '<span style="display:inline-block;width:16px;height:16px;line-height:16px;text-align:center;border-radius:50%;font-size:0.65rem;font-weight:700;background:var(--border);color:var(--text-3)">'+(i+1)+'</span> '+
      t.label+'</button>';
  }).join('');
  // Activer le premier
  var first = bar.querySelector('.pj-tab');
  if(first) { first.classList.add('active'); applyPjTabStyle(first, true); }
}
function applyPjTabStyle(btn, active){
  var num = btn.querySelector('span:nth-child(2)');
  if(active){
    btn.style.color='var(--accent)';
    btn.style.borderBottomColor='var(--accent)';
    btn.style.background='rgba(200,169,110,0.08)';
    if(num){ num.style.background='var(--accent)'; num.style.color='#fff'; }
  } else {
    btn.style.color='var(--text-3)';
    btn.style.borderBottomColor='transparent';
    btn.style.background='none';
    if(num){ num.style.background='var(--border)'; num.style.color='var(--text-3)'; }
  }
}
function switchPjTab(tab, btn){
  document.querySelectorAll('.pj-tab').forEach(function(t){ t.classList.remove('active'); applyPjTabStyle(t, false); });
  document.querySelectorAll('.pj-tab-panel').forEach(function(p){ p.style.display='none'; });
  if(!btn) btn = document.querySelector('.pj-tab[data-tab="'+tab+'"]');
  if(btn){ btn.classList.add('active'); applyPjTabStyle(btn, true); }
  var panel = document.getElementById('pj-panel-'+tab);
  if (panel) panel.style.display = 'block';
  if (tab==='localisation' && typeof L !== 'undefined') setTimeout(initPjMap, 150);
}

function genProjetCode(annee, clientDisplayNom, clientCode){
  var yy      = String(annee||new Date().getFullYear()).slice(-2);
  var projets = getProjets();
  // Trouver le numéro séquentiel MAX parmi les projets de la même année
  var maxSeq = 0;
  projets.forEach(function(p){
    if(_editingProjetId && p.id===_editingProjetId) return;
    if(p.annee==annee || (p.code && p.code.indexOf('_'+yy+'_')!==-1)){
      // Extraire le numéro séquentiel du code (premier segment avant _)
      var match = (p.code||'').match(/^(\d+)_/);
      if(match){
        var n = parseInt(match[1], 10);
        if(n > maxSeq) maxSeq = n;
      }
    }
  });
  var seq  = String(maxSeq+1).padStart(2,'0');
  var code = clientCode || '';
  if (!code && clientDisplayNom) {
    var c = getClients().find(function(x){ return x.displayNom===clientDisplayNom||x.display_nom===clientDisplayNom; });
    if (c) code = c.code;
  }
  return seq+'_'+yy+'_'+(code||'XXX');
}

function previewPjCode(){
  var clientSel = document.getElementById('pj-client');
  var anneeEl   = document.getElementById('pj-annee');
  var codeEl    = document.getElementById('pj-code-preview');
  if (!clientSel||!codeEl) return;
  var clientVal = clientSel.value;
  var annee     = parseInt(anneeEl&&anneeEl.value)||new Date().getFullYear();
  var client    = getClients().find(function(c){ return c.id===clientVal; });
  var clientNom = client ? (client.displayNom||client.display_nom||client.nom||'') : '';
  var clientCode= client ? client.code : '';
  if (!clientVal) { codeEl.textContent='—'; return; }
  // Ne pas écraser si l'utilisateur a modifié manuellement
  var codeInput = document.getElementById('pj-code-input');
  if (codeInput && codeInput.style.display !== 'none' && codeInput.dataset.manual === '1') return;
  var code    = genProjetCode(annee, clientNom, clientCode);
  codeEl.textContent = code;
}

var _codeEditMode = false;
function toggleCodeEdit() {
  var preview = document.getElementById('pj-code-preview');
  var input   = document.getElementById('pj-code-input');
  var btn     = document.getElementById('pj-code-edit-btn');
  if (!preview || !input) return;
  _codeEditMode = !_codeEditMode;
  if (_codeEditMode) {
    input.value = preview.textContent === '—' ? '' : preview.textContent;
    input.style.display = '';
    preview.style.display = 'none';
    input.dataset.manual = '1';
    input.focus();
    btn.textContent = '✓';
    btn.title = 'Valider le code';
  } else {
    var val = input.value.trim();
    if (val) preview.textContent = val;
    input.style.display = 'none';
    preview.style.display = '';
    input.dataset.manual = '0';
    btn.textContent = '✏️';
    btn.title = 'Modifier le code';
  }
}

function populateClientSelect(){
  var sel = document.getElementById('pj-client'); if(!sel) return;
  var clients = getClients();
  sel.innerHTML = '<option value="">— Sélectionner un client —</option>';
  clients.forEach(function(c){
    var nom = c.displayNom||c.display_nom||c.nom||c.raison||'';
    sel.innerHTML += '<option value="'+c.id+'">'+nom+' ('+(c.code||'')+')</option>';
  });
}

// ── Client searchable dropdown ──
var _clientDropdownOpen = false;

function filterClientDropdown() {
  var input = document.getElementById('pj-client-search');
  var q = (input.value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  var clearBtn = document.getElementById('pj-client-clear');
  if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';
  renderClientDropdown(q);
  showClientDropdown();
}

function showClientDropdown() {
  var dd = document.getElementById('pj-client-dropdown');
  if (!dd) return;
  dd.style.display = 'block';
  _clientDropdownOpen = true;
  var q = (document.getElementById('pj-client-search').value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  renderClientDropdown(q);
}

function hideClientDropdown() {
  setTimeout(function() {
    var dd = document.getElementById('pj-client-dropdown');
    if (dd) dd.style.display = 'none';
    _clientDropdownOpen = false;
  }, 200);
}

function renderClientDropdown(q) {
  var dd = document.getElementById('pj-client-dropdown');
  if (!dd) return;
  var clients = getClients();
  var filtered = clients.filter(function(c) {
    if (!q) return true;
    var nom = (c.displayNom || c.display_nom || c.nom || c.raison || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    var code = (c.code || '').toLowerCase();
    return nom.indexOf(q) !== -1 || code.indexOf(q) !== -1;
  });

  if (filtered.length === 0) {
    dd.innerHTML = '<div style="padding:0.8rem 1rem;color:var(--text-3);font-size:0.82rem">Aucun client trouvé</div>';
    return;
  }

  dd.innerHTML = filtered.map(function(c) {
    var nom = c.displayNom || c.display_nom || c.nom || c.raison || '';
    var code = c.code || '';
    return '<div class="client-dd-item" onmousedown="selectClient(\'' + c.id + '\')" style="padding:0.55rem 1rem;cursor:pointer;font-size:0.82rem;border-bottom:1px solid var(--border);transition:background .15s" onmouseover="this.style.background=\'var(--bg-2)\'" onmouseout="this.style.background=\'none\'">' +
      '<span style="color:var(--text-1)">' + nom + '</span>' +
      (code ? ' <span style="color:var(--text-3);font-size:0.72rem">(' + code + ')</span>' : '') +
      '</div>';
  }).join('');
}

function selectClient(clientId) {
  var sel = document.getElementById('pj-client');
  var input = document.getElementById('pj-client-search');
  var clearBtn = document.getElementById('pj-client-clear');
  sel.value = clientId;
  var selectedOpt = sel.selectedOptions[0];
  if (selectedOpt && clientId) {
    input.value = selectedOpt.textContent;
  } else {
    input.value = '';
  }
  if (clearBtn) clearBtn.style.display = clientId ? 'block' : 'none';
  hideClientDropdown();
  previewPjCode();
}

function clearClientSearch() {
  var input = document.getElementById('pj-client-search');
  var sel = document.getElementById('pj-client');
  var clearBtn = document.getElementById('pj-client-clear');
  input.value = '';
  sel.value = '';
  if (clearBtn) clearBtn.style.display = 'none';
  input.focus();
  showClientDropdown();
  previewPjCode();
}

// Close dropdown on outside click
document.addEventListener('click', function(e) {
  if (!_clientDropdownOpen) return;
  var container = document.getElementById('pj-client-search');
  var dd = document.getElementById('pj-client-dropdown');
  if (container && dd && !container.contains(e.target) && !dd.contains(e.target)) {
    dd.style.display = 'none';
    _clientDropdownOpen = false;
  }
});

// A2 — Missions avec liste par défaut
var MISSION_CATEGORIES = [
  {id:'AI',  label:'Assistance immobilière'},
  {id:'EP',  label:'Études préliminaires'},
  {id:'CON', label:'Conception architecturale'},
  {id:'EXE', label:'Études d\'exécution'},
  {id:'AMO', label:'Assistance à la maîtrise d\'ouvrage'},
  {id:'MOD', label:'Maîtrise d\'ouvrage déléguée'},
  {id:'3D',  label:'Visualisation 3D'},
  {id:'DEC', label:'Décoration & Paysage'},
  {id:'DET', label:'Suivi de chantier'},
  {id:'DIAG',label:'Diagnostic & Expertise'}
];

var DEFAULT_MISSIONS = [
  // ── Assistance immobilière ──
  {id:'m01', cat:'AI',  nom:'Recherche de bien immobilier'},
  {id:'m02', cat:'AI',  nom:'Assistance à l\'achat immobilier'},
  {id:'m03', cat:'AI',  nom:'Visite et expertise de terrain'},
  // ── Études préliminaires ──
  {id:'m04', cat:'EP',  nom:'Relevé architectural (gros œuvres)'},
  {id:'m05', cat:'EP',  nom:'Relevé détaillé'},
  {id:'m06', cat:'EP',  nom:'Livraison de fichier source'},
  {id:'m07', cat:'EP',  nom:'Élaboration de programme'},
  {id:'m08', cat:'EP',  nom:'Estimation sommaire (surface & coût)'},
  // ── Conception architecturale ──
  {id:'m09', cat:'CON', nom:'Avant-projet sommaire (APS)'},
  {id:'m10', cat:'CON', nom:'Avant-projet développé (APD)'},
  {id:'m11', cat:'CON', nom:'Permis de construire'},
  // ── Études d'exécution ──
  {id:'m12', cat:'EXE', nom:'Dossier d\'exécution'},
  {id:'m13', cat:'EXE', nom:'Consultation des ingénieurs'},
  {id:'m14', cat:'EXE', nom:'Coordination des études'},
  {id:'m15', cat:'EXE', nom:'Bordereau des prix'},
  // ── AMO ──
  {id:'m16', cat:'AMO', nom:'Assistance à la maîtrise d\'ouvrage'},
  {id:'m17', cat:'AMO', nom:'Assistance à la passation de marchés'},
  {id:'m18', cat:'AMO', nom:'Consultation fournisseurs & prestataires'},
  {id:'m19', cat:'AMO', nom:'Étude comparative'},
  {id:'m20', cat:'AMO', nom:'Assistance à l\'échantillonnage'},
  {id:'m21', cat:'AMO', nom:'Visite des fournisseurs'},
  // ── MOD ──
  {id:'m22', cat:'MOD', nom:'Validation des paiements'},
  {id:'m23', cat:'MOD', nom:'Paiement des prestataires & fournisseurs'},
  {id:'m24', cat:'MOD', nom:'Gestion financière'},
  {id:'m25', cat:'MOD', nom:'Gestion d\'approvisionnement'},
  {id:'m26', cat:'MOD', nom:'Gestion des ressources humaines'},
  {id:'m27', cat:'MOD', nom:'Journal de suivi'},
  // ── 3D ──
  {id:'m28', cat:'3D',  nom:'3D extérieure'},
  {id:'m29', cat:'3D',  nom:'3D intérieure'},
  {id:'m30', cat:'3D',  nom:'Animation 3D'},
  // ── Décoration & Paysage ──
  {id:'m31', cat:'DEC', nom:'Décoration d\'intérieur'},
  {id:'m32', cat:'DEC', nom:'Assistance choix ameublement & décoration'},
  {id:'m33', cat:'DEC', nom:'Étude paysagère & aménagement extérieur'},
  {id:'m34', cat:'DEC', nom:'Plan de plantation'},
  {id:'m35', cat:'DEC', nom:'Plan d\'arrosage'},
  {id:'m36', cat:'DEC', nom:'Plan d\'éclairage'},
  {id:'m37', cat:'DEC', nom:'Choix des palettes végétales'},
  {id:'m38', cat:'DEC', nom:'Rendu 3D paysager'},
  // ── Suivi de chantier ──
  {id:'m39', cat:'DET', nom:'Suivi de chantier'},
  {id:'m40', cat:'DET', nom:'Pilotage'},
  {id:'m41', cat:'DET', nom:'Assistance à la réception des travaux'},
  // ── Diagnostic ──
  {id:'m42', cat:'DIAG',nom:'Diagnostic / Expertise'},
];

function getMissions(){
  var m = getSetting('cortoba_missions', []);
  if (!Array.isArray(m) || m.length === 0) return DEFAULT_MISSIONS;
  // Migration : si les missions sauvegardées n'ont pas de champ 'cat' (ancien format {id,abbr,nom}),
  // on retourne les missions par défaut catégorisées et on efface l'ancien format
  if (m[0] && !m[0].cat && m[0].abbr !== undefined) {
    console.info('[getMissions] Migration ancien format → missions catégorisées par défaut');
    saveSetting('cortoba_missions', DEFAULT_MISSIONS);
    return DEFAULT_MISSIONS;
  }
  return m;
}
function getMissionCategories(){
  var c = getSetting('cortoba_mission_categories', []);
  return (Array.isArray(c) && c.length) ? c : MISSION_CATEGORIES;
}

function populateMissionsList(selected){
  var list = document.getElementById('pj-missions-list'); if(!list) return;
  var missions = getMissions();
  var cats = getMissionCategories();
  selected = selected || [];
  if (missions.length === 0) {
    list.innerHTML = '<span style="font-size:0.82rem;color:var(--text-3)">Aucune mission configurée. Ajoutez-en dans Paramètres.</span>';
    return;
  }
  var html = '';
  cats.forEach(function(cat){
    var catMissions = missions.filter(function(m){ return m.cat === cat.id; });
    if (catMissions.length === 0) return;
    html += '<div style="margin-bottom:1rem"><div style="font-size:0.68rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--accent);margin-bottom:0.4rem;font-weight:600;display:flex;align-items:center;gap:0.4rem">' + cat.label + ' <button type="button" style="background:none;border:none;cursor:pointer;color:var(--text-3);font-size:0.65rem;padding:0" onclick="toggleMissionCat(this,\'' + cat.id + '\')">tout cocher</button></div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:0.35rem">';
    catMissions.forEach(function(m){
      var val = m.id + '_' + (m.nom||'');
      var isSelected = selected.indexOf(m.nom)!==-1 || selected.indexOf(val)!==-1 || selected.indexOf(m.id)!==-1;
      html += '<label style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.6rem;background:var(--bg-2);border-radius:5px;cursor:pointer;border:1px solid '+(isSelected?'var(--accent)':'transparent')+';transition:border-color .15s" onchange="this.style.borderColor=this.querySelector(\'input\').checked?\'var(--accent)\':\'transparent\'">' +
        '<input type="checkbox" class="pj-mission-cb" data-cat="' + cat.id + '" value="' + val + '" '+(isSelected?'checked':'')+' style="accent-color:var(--accent)">' +
        '<span style="font-size:0.78rem">' + (m.nom||'') + '</span></label>';
    });
    html += '</div></div>';
  });
  // Missions sans catégorie
  var orphans = missions.filter(function(m){ return !m.cat || !cats.find(function(c){ return c.id===m.cat; }); });
  if (orphans.length > 0) {
    html += '<div style="margin-bottom:1rem"><div style="font-size:0.68rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-3);margin-bottom:0.4rem">Autres</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:0.35rem">';
    orphans.forEach(function(m){
      var val = m.id + '_' + (m.nom||'');
      var isSelected = selected.indexOf(m.nom)!==-1 || selected.indexOf(val)!==-1;
      html += '<label style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.6rem;background:var(--bg-2);border-radius:5px;cursor:pointer;border:1px solid '+(isSelected?'var(--accent)':'transparent')+'">' +
        '<input type="checkbox" class="pj-mission-cb" value="' + val + '" '+(isSelected?'checked':'')+' style="accent-color:var(--accent)">' +
        '<span style="font-size:0.78rem">' + (m.nom||'') + '</span></label>';
    });
    html += '</div></div>';
  }
  list.innerHTML = html;
}

function toggleMissionCat(btn, catId){
  var cbs = document.querySelectorAll('.pj-mission-cb[data-cat="'+catId+'"]');
  var allChecked = Array.from(cbs).every(function(c){ return c.checked; });
  cbs.forEach(function(c){
    c.checked = !allChecked;
    c.closest('label').style.borderColor = c.checked ? 'var(--accent)' : 'transparent';
  });
  btn.textContent = allChecked ? 'tout cocher' : 'tout décocher';
}

function filterPjMissions() {
  var q = (document.getElementById('pj-mission-search') || {value:''}).value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  var labels = document.querySelectorAll('#pj-missions-list label');
  var catHeaders = document.querySelectorAll('#pj-missions-list > div');
  labels.forEach(function(lbl) {
    var txt = (lbl.textContent || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    lbl.style.display = (!q || txt.indexOf(q) !== -1) ? '' : 'none';
  });
  // Masquer les catégories dont toutes les missions sont cachées
  catHeaders.forEach(function(catDiv) {
    var visibleLabels = catDiv.querySelectorAll('label:not([style*="display: none"])');
    // fallback : compter manuellement
    var count = 0;
    catDiv.querySelectorAll('label').forEach(function(l){ if(l.style.display !== 'none') count++; });
    var header = catDiv.querySelector('div');
    if (header && catDiv.querySelectorAll('label').length > 0) {
      catDiv.style.display = count > 0 ? '' : 'none';
    }
  });
}
window.filterPjMissions = filterPjMissions;

function getSelectedMissions(){
  var checks = document.querySelectorAll('#pj-missions-list input[type=checkbox]:checked');
  return Array.from(checks).map(function(c){ return c.value; });
}

function addIntervenant(data){
  _intervenantCount++;
  var n    = _intervenantCount;
  var list = document.getElementById('pj-intervenants-list'); if(!list) return;
  var div  = document.createElement('div');
  div.id   = 'pj-int-'+n;
  div.style.cssText = 'border:1px solid var(--border);border-radius:6px;padding:0.8rem;margin-bottom:0.6rem';
  div.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">'+
      '<span style="font-size:0.72rem;color:var(--text-3)">Intervenant '+n+'</span>'+
      '<button type="button" class="btn btn-sm" style="color:#e07070;padding:0.2rem 0.5rem" onclick="document.getElementById(\'pj-int-'+n+'\').remove()">✕</button>'+
    '</div>'+
    '<div class="form-grid">'+
      '<div class="form-field"><label class="form-label">Rôle</label><input class="form-input pj-int-role" placeholder="Ex: BET Structure" value="'+(data&&data.role||'')+'" /></div>'+
      '<div class="form-field"><label class="form-label">Nom</label><input class="form-input pj-int-nom" placeholder="Nom du cabinet" value="'+(data&&data.nom||'')+'" /></div>'+
      '<div class="form-field full"><label class="form-label">Contact</label><input class="form-input pj-int-contact" placeholder="Tél / email" value="'+(data&&data.contact||'')+'" /></div>'+
    '</div>';
  list.appendChild(div);
}

function getIntervenants(){
  var list = document.getElementById('pj-intervenants-list'); if(!list) return [];
  var out  = [];
  list.querySelectorAll('[id^="pj-int-"]').forEach(function(div){
    out.push({
      role:    div.querySelector('.pj-int-role').value.trim(),
      nom:     div.querySelector('.pj-int-nom').value.trim(),
      contact: div.querySelector('.pj-int-contact').value.trim()
    });
  });
  return out;
}

// A4 — initPjMap : toujours recréer pour éviter le bug de container vide
function initPjMap(){
  var container = document.getElementById('pj-map-container');
  if (!container || typeof L === 'undefined') return;
  // Détruire l'ancienne instance si elle existe
  if (_pjMap) { try{ _pjMap.remove(); }catch(e){} }
  _pjMap = null; _pjMarker = null;
  container.innerHTML = '';

  var lat = parseFloat(document.getElementById('pj-lat').value) || 33.79;
  var lng = parseFloat(document.getElementById('pj-lng').value) || 10.99;

  _pjMap = L.map(container, {zoomControl:true}).setView([lat, lng], 13);
  // Couche satellite Esri
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {attribution:'Esri World Imagery', maxZoom:19}).addTo(_pjMap);
  // Couche étiquettes par-dessus
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
    {attribution:'', maxZoom:19, subdomains:'abcd', opacity:1}).addTo(_pjMap);

  var markerIcon = L.divIcon({
    className:'',
    html:'<div style="width:18px;height:18px;background:#c8a96e;border:2px solid #fff;border-radius:50%;box-shadow:0 0 8px rgba(0,0,0,.6)"></div>',
    iconAnchor:[9,9]
  });

  // Placer le marqueur si coordonnées déjà saisies
  if (parseFloat(document.getElementById('pj-lat').value)) {
    _pjMarker = L.marker([lat, lng], {draggable:true, icon:markerIcon}).addTo(_pjMap);
    _pjMarker.on('dragend', function(e){ var ll=e.target.getLatLng(); setPjLocation(ll.lat, ll.lng); });
  }

  // Clic sur la carte → placer/déplacer le marqueur
  _pjMap.on('click', function(e){
    var lt=e.latlng.lat, lg=e.latlng.lng;
    if (_pjMarker) _pjMarker.setLatLng([lt, lg]);
    else {
      _pjMarker = L.marker([lt, lg], {draggable:true, icon:markerIcon}).addTo(_pjMap);
      _pjMarker.on('dragend', function(ev){ var ll=ev.target.getLatLng(); setPjLocation(ll.lat, ll.lng); });
    }
    setPjLocation(lt, lg);
  });

  // Forcer le recalcul de taille après animation de la modale
  setTimeout(function(){ try{ _pjMap.invalidateSize(); }catch(e){} }, 250);
}

function resetProjetForm(){
  _editingProjetId = null; _intervenantCount = 0;
  // Détruire la carte
  if (_pjMap) { try{ _pjMap.remove(); }catch(e){} }
  _pjMap = null; _pjMarker = null;

  ['pj-nom','pj-adresse','pj-description','pj-honoraires2','pj-budget2','pj-surface2','pj-shon','pj-shob','pj-terrain','pj-cout-construction','pj-cout-m2'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  var stdRst=document.getElementById('pj-standing'); if(stdRst) stdRst.value='';
  var zoneRst=document.getElementById('pj-zone'); if(zoneRst) zoneRst.value='';
  var anneeEl = document.getElementById('pj-annee');
  if (anneeEl) anneeEl.value = new Date().getFullYear();

  var pjStatut = document.getElementById('pj-statut');  if(pjStatut) pjStatut.value = 'Actif';
  var pjType   = document.getElementById('pj-type-bat');if(pjType)   pjType.value   = '';
  clearTypeBatSearch();

  var err     = document.getElementById('pj-err');     if(err)    err.style.display='none';
  var codeEl  = document.getElementById('pj-code-preview'); if(codeEl) { codeEl.textContent='—'; codeEl.style.display=''; }
  var codeInput = document.getElementById('pj-code-input'); if(codeInput) { codeInput.style.display='none'; codeInput.dataset.manual='0'; codeInput.value=''; }
  var codeBtn = document.getElementById('pj-code-edit-btn'); if(codeBtn) { codeBtn.textContent='✏️'; codeBtn.title='Modifier le code'; }
  _codeEditMode = false;
  var latEl   = document.getElementById('pj-lat');      if(latEl)  latEl.value='';
  var lngEl   = document.getElementById('pj-lng');      if(lngEl)  lngEl.value='';
  var coordsD = document.getElementById('pj-coords-display'); if(coordsD) coordsD.style.display='none';
  var intList = document.getElementById('pj-intervenants-list'); if(intList) intList.innerHTML='';
  var mapEl   = document.getElementById('pj-map-container');    if(mapEl)   mapEl.innerHTML='';

  var titleEl = document.getElementById('pj-modal-title');  if(titleEl) titleEl.textContent='Nouveau projet';
  var eyebrow = document.getElementById('pj-modal-eyebrow');if(eyebrow) eyebrow.textContent='NOUVEAU PROJET';
  var saveBtn = document.getElementById('pj-save-btn');     if(saveBtn) saveBtn.textContent='Créer le projet →';
  var chatChk = document.getElementById('pj-chat-create');  if(chatChk) chatChk.checked = false;
  var nasChk  = document.getElementById('pj-nas-create');   if(nasChk)  nasChk.checked = false;
  var portalBtn = document.getElementById('pj-portal-btn'); if(portalBtn) portalBtn.style.display = 'none';
  var nasLinkBtn = document.getElementById('pj-nas-link-btn'); if(nasLinkBtn) nasLinkBtn.style.display = 'none';
  var nasPathInput = document.getElementById('pj-nas-path-input'); if(nasPathInput) nasPathInput.value = '';
  var nasEditPanel = document.getElementById('pj-nas-edit-panel'); if(nasEditPanel) nasEditPanel.style.display = 'none';
  var msSearch = document.getElementById('pj-mission-search'); if(msSearch) msSearch.value = '';

  populateClientSelect();
  var csInput = document.getElementById('pj-client-search'); if (csInput) csInput.value = '';
  var csClear = document.getElementById('pj-client-clear'); if (csClear) csClear.style.display = 'none';
  populateMissionsList([]);

  // Construire et revenir au premier onglet
  buildPjTabBar();
  document.querySelectorAll('.pj-tab-panel').forEach(function(p,i){ p.style.display = i===0 ? 'block' : 'none'; });

  // Réinitialiser selects extensibles
  setTimeout(initExtensibleSelects, 50);
}

// ── Ouvrir le configurateur dans un nouvel onglet ──
function openConfigurateur(){
  var token=sessionStorage.getItem('cortoba_token');
  if(token){
    localStorage.setItem('cortoba_xfer_token',JSON.stringify({token:token,ts:Date.now()}));
  }
  window.open('configurateur.html','_blank');
}

// ── Auto-calc coût/m² dans le modal d'édition projet ──
var _PJ_BENCH={'Économique':[700,1100],'Standard':[1100,1700],'Moyen-Haut':[1700,2600],'Haut standing':[2600,4200],'Luxe':[4200,7500]};
var _PJ_ZONE_COEFF={'Urbaine':1.00,'Périurbaine':0.92,'Rurale':0.82,'Agricole':0.75};
function pjAutoCalcCoutM2(){
  var std=document.getElementById('pj-standing'); var z=document.getElementById('pj-zone');
  var shon=document.getElementById('pj-shon'); var cout=document.getElementById('pj-cout-construction'); var m2=document.getElementById('pj-cout-m2');
  if(!std||!z||!m2) return;
  var b=_PJ_BENCH[std.value]; var coeff=_PJ_ZONE_COEFF[z.value];
  if(b&&coeff!==undefined){
    var mid=((b[0]+b[1])/2)*coeff;
    m2.value=Math.round(mid);
    var s=parseFloat((shon||{}).value)||0;
    if(s>0&&cout) cout.value=Math.round(mid*s);
  }
}

// A5 — openEditProjet: utilise openModal interne (sans reset) puis rempli les champs
function openEditProjet(id){
  var p = getProjets().find(function(x){ return x.id===id; }); if(!p) return;
  // Ouvrir la modale SANS réinitialiser (resetProjetForm appelé avant ci-dessous)
  resetProjetForm();
  _editingProjetId = id;

  document.getElementById('pj-modal-title').textContent  = 'Modifier — '+(p.code||p.nom);
  var eyebrow = document.getElementById('pj-modal-eyebrow'); if(eyebrow) eyebrow.textContent='MODIFIER LE PROJET';
  document.getElementById('pj-save-btn').textContent = 'Enregistrer les modifications →';

  document.getElementById('pj-nom').value         = p.nom||'';
  document.getElementById('pj-annee').value        = p.annee||new Date().getFullYear();
  document.getElementById('pj-adresse').value      = p.adresse||'';
  var honEl=document.getElementById('pj-honoraires2'); if(honEl) honEl.value=p.honoraires||'';
  var budEl=document.getElementById('pj-budget2'); if(budEl) budEl.value=p.budget||'';
  var surfEl=document.getElementById('pj-surface2'); if(surfEl) surfEl.value=p.surface||'';
  document.getElementById('pj-description').value  = p.description||'';
  document.getElementById('pj-statut').value       = p.statut||'Actif';
  // A3 — typeBat : gérer snake_case (type_bat) et camelCase (typeBat)
  var typeBatVal = p.typeBat || p.type_bat || '';
  var typeBatSel = document.getElementById('pj-type-bat');
  typeBatSel.value = typeBatVal;
  // Si la valeur n'existe pas dans les options (ancien format), l'ajouter temporairement
  if (typeBatVal && typeBatSel.value !== typeBatVal) {
    var tmpOpt = document.createElement('option');
    tmpOpt.value = typeBatVal; tmpOpt.textContent = typeBatVal;
    typeBatSel.appendChild(tmpOpt);
    typeBatSel.value = typeBatVal;
  }
  syncTypeBatDisplay();

  if (p.lat && p.lng) {
    document.getElementById('pj-lat').value = p.lat;
    document.getElementById('pj-lng').value = p.lng;
    showPjCoords(p.lat, p.lng);
  }

  // Données techniques (configurateur)
  var shonEl=document.getElementById('pj-shon'); if(shonEl) shonEl.value=p.surface_shon||'';
  var shobEl=document.getElementById('pj-shob'); if(shobEl) shobEl.value=p.surface_shob||'';
  var terrEl=document.getElementById('pj-terrain'); if(terrEl) terrEl.value=p.surface_terrain||'';
  var stdEl=document.getElementById('pj-standing'); if(stdEl) stdEl.value=p.standing||'';
  var zoneEl=document.getElementById('pj-zone'); if(zoneEl) zoneEl.value=p.zone||'';
  var coutEl=document.getElementById('pj-cout-construction'); if(coutEl) coutEl.value=p.cout_construction||'';
  var m2El=document.getElementById('pj-cout-m2'); if(m2El) m2El.value=p.cout_m2||'';

  populateClientSelect();
  var sel    = document.getElementById('pj-client');
  var client = getClients().find(function(c){
    return c.id===p.clientId || c.id===p.client_id ||
           (c.displayNom||c.display_nom)===p.client;
  });
  if (sel && client) {
    sel.value = client.id;
    var searchInput = document.getElementById('pj-client-search');
    if (searchInput) searchInput.value = sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '';
    var clearBtn = document.getElementById('pj-client-clear');
    if (clearBtn) clearBtn.style.display = client.id ? 'block' : 'none';
  }
  previewPjCode();

  populateMissionsList(p.missions||[]);
  if (p.intervenants && p.intervenants.length) p.intervenants.forEach(function(i){ addIntervenant(i); });

  document.getElementById('pj-code-preview').textContent = p.code||'—';

  // Vérifier si une room chat existe déjà pour ce projet
  var chatChk = document.getElementById('pj-chat-create');
  var chatWrap = document.getElementById('pj-chat-create-wrap');
  if (chatChk) {
    chatChk.checked = false;
    chatChk.disabled = false;
    if (chatWrap) chatWrap.title = '';
    apiFetch('api/chat.php?action=rooms').then(function(r) {
      var rooms = (r.data || []);
      var hasRoom = rooms.some(function(rm) { return rm.type === 'projet' && rm.projet_id === id; });
      if (hasRoom) {
        chatChk.checked = true;
        chatChk.disabled = true;
        if (chatWrap) chatWrap.title = 'Groupe de discussion déjà créé';
      }
    }).catch(function(){});
  }

  // Afficher le bouton portail client en mode édition
  var portalBtn = document.getElementById('pj-portal-btn');
  if (!portalBtn) {
    // Créer dynamiquement si absent du HTML (cache navigateur)
    var footer = document.querySelector('#modal-projet .modal-footer');
    if (footer) {
      portalBtn = document.createElement('button');
      portalBtn.id = 'pj-portal-btn';
      portalBtn.className = 'btn';
      portalBtn.innerHTML = '&#128279; Créer accès portail';
      footer.insertBefore(portalBtn, footer.children[1] || footer.children[0]);
    }
  }
  if (portalBtn) {
    portalBtn.style.cssText = 'display:inline-block;margin-right:auto;background:none;border:1px solid var(--accent);color:var(--accent);border-radius:5px;padding:0.45rem 0.9rem;font-size:0.78rem;font-weight:600;cursor:pointer;font-family:var(--font)';
    portalBtn.onclick = function(){ openCreatePortalAccess(_editingProjetId, document.getElementById('pj-client')?.selectedOptions[0]?.text||'', document.getElementById('pj-client')?.value||''); };
  }

  // Afficher le bouton NAS en mode édition + charger le chemin sauvegardé
  var nasBtn = document.getElementById('pj-nas-link-btn');
  if (nasBtn) {
    nasBtn.style.display = 'inline-flex';
    nasBtn.setAttribute('data-projet-id', id);
  }
  var nasPathInput = document.getElementById('pj-nas-path-input');
  if (nasPathInput) nasPathInput.value = p.nas_path || p.nasPath || '';

  // Ouvrir la modale directement (sans passer par openModal pour éviter le double reset)
  document.getElementById('modal-projet').classList.add('open');
}

// ── Ouvrir le dossier NAS depuis la modale d'édition ──
function buildCurrentNasPath() {
  var cfg = getNasConfig();
  var ip = cfg.local || '192.168.1.165';
  var code = (document.getElementById('pj-code-preview').textContent || '').trim();
  var clientSel = document.getElementById('pj-client');
  var clientObj = clientSel ? getClients().find(function(c){ return c.id === clientSel.value; }) : null;
  var clientName = clientObj ? (clientObj.displayNom || clientObj.display_nom || clientObj.nom || clientObj.raison || '') : '';
  clientName = clientName.replace(/,/g, '');
  var annee = (document.getElementById('pj-annee').value || new Date().getFullYear());
  if (code === '—') code = '';
  var folderName = (code + '_' + clientName).replace(/[<>:"\/\\|?*,]/g, '_').replace(/\s+/g, ' ').trim();
  return '\\\\' + ip + '\\Public\\CAS_PROJETS\\' + annee + '\\' + folderName;
}

function openNasFolder() {
  // Utiliser le chemin personnalisé s'il existe
  var customInput = document.getElementById('pj-nas-path-input');
  var nasPath = (customInput && customInput.value.trim()) ? customInput.value.trim() : buildCurrentNasPath();
  navigator.clipboard.writeText(nasPath).then(function() {
    showToast('Chemin NAS copié : ' + nasPath, 'success');
  });
}

function toggleNasPathEdit() {
  var panel = document.getElementById('pj-nas-edit-panel');
  if (!panel) return;
  var visible = panel.style.display !== 'none';
  panel.style.display = visible ? 'none' : 'block';
  if (!visible) {
    var input = document.getElementById('pj-nas-path-input');
    if (input && !input.value) input.value = buildCurrentNasPath();
    input.focus();
    input.select();
  }
}

function resetNasPath() {
  var input = document.getElementById('pj-nas-path-input');
  if (input) { input.value = buildCurrentNasPath(); input.select(); }
}

function saveNasPath() {
  var input = document.getElementById('pj-nas-path-input');
  var path = input ? input.value.trim() : '';
  if (!path) { showToast('Chemin vide', 'error'); return; }
  if (!_editingProjetId) { showToast('Sauvegardez d\'abord le projet', 'error'); return; }
  apiFetch('api/projets.php?id=' + _editingProjetId, {
    method: 'PUT',
    body: { nasPath: path }
  }).then(function() {
    showToast('Chemin NAS sauvegardé ✓', 'success');
    var panel = document.getElementById('pj-nas-edit-panel');
    if (panel) panel.style.display = 'none';
    loadData().then(function(){ renderProjets(); });
  }).catch(function() { showToast('Erreur de sauvegarde', 'error'); });
}
window.saveNasPath = saveNasPath;

function copyNasPathFromInput() {
  var input = document.getElementById('pj-nas-path-input');
  var path = input ? input.value.trim() : '';
  if (!path) { showToast('Chemin vide', 'error'); return; }
  navigator.clipboard.writeText(path).then(function() {
    showToast('Chemin NAS copié ✓', 'success');
  });
}
window.copyNasPathFromInput = copyNasPathFromInput;

function applyNasPath() { saveNasPath(); }

// ── NAS folder button for project detail ──
function buildNasFolderButton(p) {
  var cfg = getNasConfig();
  var ip = cfg.local || '192.168.1.165';
  var annee = p.annee || new Date().getFullYear();
  var code = p.code || '';
  var client = p.client || p.nom || '';
  var folderName = (code + '_' + client).replace(/[<>:"\/\\|?*]/g, '_').replace(/\s+/g, ' ').trim();
  var nasPath = '\\\\' + ip + '\\Public\\CAS_PROJETS\\' + annee + '\\' + folderName;
  var btnStyle = 'border:1px solid var(--border);background:var(--bg-2);color:var(--text-1);border-radius:5px;padding:0.45rem 1rem;font-size:0.78rem;font-weight:600;cursor:pointer;font-family:var(--font);display:flex;align-items:center;gap:0.4rem';
  // Build a button that copies NAS path + offers to create folder if needed
  return '<button onclick="copyNasPath(this,\'' + esc(nasPath).replace(/'/g, "\\'") + '\')" style="' + btnStyle + '" title="' + esc(nasPath) + '">' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' +
    ' Dossier NAS</button>';
}
function copyNasPath(btn, path) {
  navigator.clipboard.writeText(path).then(function() {
    showToast('Chemin copié : ' + path, 'success');
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copié !';
    setTimeout(function() {
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> Dossier NAS';
    }, 2000);
  });
}

function openProjetDetail(id){
  var p = getProjets().find(function(x){ return x.id===id; }); if(!p) return;
  var typeBatVal = p.typeBat||p.type_bat||'';
  var rows = [
    ['Code dossier','<span style="font-family:var(--mono);color:var(--accent);font-weight:700">'+(p.code||'—')+'</span>'],
    ['Statut','<span class="'+badgeClass(p.statut)+'">'+(p.statut||'—')+'</span>'],
    ['Client', p.client||'—'],
    typeBatVal ? ['Type de bâtiment', typeBatVal] : null,
    p.description ? ['Description','<em style="color:var(--text-2)">'+p.description+'</em>'] : null,
    ['Honoraires HT','<strong>'+fmtMontant(p.honoraires||0)+'</strong>'],
    p.budget  ? ['Budget client', fmtMontant(p.budget)] : null,
    p.surface ? ['Surface', p.surface+' m²'] : null,
    p.adresse ? ['Lieu', p.adresse] : null
  ].filter(Boolean);
  var tr = rows.map(function(r){
    return '<tr><td style="padding:0.5rem 1rem 0.5rem 0;color:var(--text-3);font-size:0.78rem;white-space:nowrap;vertical-align:top">'+r[0]+'</td>'+
      '<td style="padding:0.5rem 0;font-size:0.85rem">'+r[1]+'</td></tr>';
  }).join('');
  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;display:flex;align-items:center;justify-content:center';
  ov.innerHTML = '<div style="background:var(--bg-1);border:1px solid var(--border);border-radius:8px;max-width:560px;width:94%;max-height:85vh;overflow:auto">'+
    '<div style="padding:1.2rem 1.5rem;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">'+
    '<div><div style="font-size:0.62rem;color:var(--text-3);letter-spacing:0.15em;text-transform:uppercase">FICHE PROJET</div>'+
    '<div style="font-size:1.1rem;font-weight:600">'+(p.nom||'')+'</div></div>'+
    '<button onclick="this.closest(\'div[style*=position]\').remove()" style="background:none;border:none;color:var(--text-3);font-size:1.2rem;cursor:pointer">✕</button></div>'+
    '<div style="padding:1.2rem 1.5rem"><table style="width:100%;border-collapse:collapse">'+tr+'</table>'+
    '<div style="margin-top:1.2rem;padding-top:1rem;border-top:1px solid var(--border);display:flex;gap:0.5rem;flex-wrap:wrap">'+
    buildNasFolderButton(p)+
    '<button onclick="openCreatePortalAccess(\''+p.id+'\',\''+esc(p.client||'').replace(/'/g,"\\'")+'\',\''+(p.clientId||p.client_id||'')+'\')" style="background:var(--accent);color:#1a1a1a;border:none;border-radius:5px;padding:0.45rem 1rem;font-size:0.78rem;font-weight:600;cursor:pointer;font-family:var(--font);display:flex;align-items:center;gap:0.4rem">'+
    '<span style="font-size:0.9rem">&#128279;</span> Créer accès portail</button>'+
    '</div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
  document.body.appendChild(ov);
}

// ── Créer accès portail client ──
function openCreatePortalAccess(projetId, clientName, clientId) {
  if (!clientId) { showToast('Ce projet n\'a pas de client associé','error'); return; }
  var client = getClients().find(function(c){ return c.id === clientId; });
  var email = client ? (client.email||'') : '';
  var nom   = client ? (client.displayNom||client.display_nom||client.nom||clientName||'') : clientName;

  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:10000;display:flex;align-items:center;justify-content:center';
  ov.innerHTML = '<div style="background:var(--bg-1);border:1px solid var(--border);border-radius:8px;max-width:440px;width:94%;max-height:85vh;overflow:auto">'+
    '<div style="padding:1.2rem 1.5rem;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">'+
    '<div><div style="font-size:0.62rem;color:var(--text-3);letter-spacing:0.15em;text-transform:uppercase">PORTAIL CLIENT</div>'+
    '<div style="font-size:1rem;font-weight:600">Créer un accès portail</div></div>'+
    '<button id="portal-close" style="background:none;border:none;color:var(--text-3);font-size:1.2rem;cursor:pointer">✕</button></div>'+
    '<div style="padding:1.2rem 1.5rem">'+
    '<div style="margin-bottom:0.8rem"><label style="display:block;font-size:0.7rem;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.3rem">Nom du client</label>'+
    '<input id="portal-nom" type="text" value="'+esc(nom)+'" style="width:100%;padding:0.5rem 0.7rem;background:var(--bg-2);color:var(--text);border:1px solid var(--border);border-radius:5px;font-size:0.85rem;font-family:var(--font)"></div>'+
    '<div style="margin-bottom:0.8rem"><label style="display:block;font-size:0.7rem;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.3rem">Email</label>'+
    '<input id="portal-email" type="email" value="'+esc(email)+'" placeholder="client@email.com" style="width:100%;padding:0.5rem 0.7rem;background:var(--bg-2);color:var(--text);border:1px solid var(--border);border-radius:5px;font-size:0.85rem;font-family:var(--font)"></div>'+
    '<div style="margin-bottom:0.8rem"><label style="display:block;font-size:0.7rem;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.3rem">Mot de passe</label>'+
    '<input id="portal-pass" type="text" value="" placeholder="Minimum 6 caractères" style="width:100%;padding:0.5rem 0.7rem;background:var(--bg-2);color:var(--text);border:1px solid var(--border);border-radius:5px;font-size:0.85rem;font-family:var(--font)">'+
    '<button id="portal-gen-pass" style="background:none;border:none;color:var(--accent);font-size:0.72rem;cursor:pointer;margin-top:0.3rem;font-family:var(--font)">Générer un mot de passe</button></div>'+
    '<div id="portal-error" style="display:none;color:var(--red);font-size:0.8rem;margin-bottom:0.5rem"></div>'+
    '<div id="portal-success" style="display:none;background:rgba(90,171,110,0.1);border:1px solid var(--green);border-radius:5px;padding:0.8rem;margin-bottom:0.5rem"></div>'+
    '<button id="portal-submit" style="width:100%;padding:0.55rem;background:var(--accent);color:#1a1a1a;border:none;border-radius:5px;font-size:0.85rem;font-weight:600;cursor:pointer;font-family:var(--font)">Créer le compte</button>'+
    '</div></div>';
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
  ov.querySelector('#portal-close').addEventListener('click', function(){ ov.remove(); });
  ov.querySelector('#portal-gen-pass').addEventListener('click', function(){
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    var pass = '';
    for(var i=0;i<10;i++) pass += chars.charAt(Math.floor(Math.random()*chars.length));
    document.getElementById('portal-pass').value = pass;
  });
  ov.querySelector('#portal-submit').addEventListener('click', function(){
    var emailVal = (document.getElementById('portal-email').value||'').trim();
    var nomVal   = (document.getElementById('portal-nom').value||'').trim();
    var passVal  = (document.getElementById('portal-pass').value||'').trim();
    var errEl    = document.getElementById('portal-error');
    var succEl   = document.getElementById('portal-success');
    errEl.style.display = 'none';
    succEl.style.display = 'none';

    if(!emailVal||!nomVal||passVal.length<6){
      errEl.textContent = 'Email, nom et mot de passe (min 6 car.) requis';
      errEl.style.display = 'block'; return;
    }
    var btn = document.getElementById('portal-submit');
    btn.disabled = true; btn.textContent = 'Création...';

    apiFetch('api/client_portal_admin.php?action=create_account', {
      method:'POST',
      body:{ client_id:clientId, email:emailVal, nom:nomVal, password:passVal }
    }).then(function(resp){
      var d = resp.data || resp;
      var portalUrl = window.location.origin + window.location.pathname.replace(/[^/]+$/, '') + 'portail-client.html';
      succEl.innerHTML = '<div style="font-weight:600;color:var(--green);margin-bottom:0.5rem">&#10003; Compte créé avec succès</div>'+
        '<div style="font-size:0.8rem;color:var(--text-2);margin-bottom:0.5rem">Transmettez ces identifiants au client :</div>'+
        '<div style="background:var(--bg-2);border-radius:5px;padding:0.6rem 0.8rem;font-size:0.82rem;font-family:var(--mono)">'+
        '<div><strong>URL :</strong> <a href="'+esc(portalUrl)+'" target="_blank" style="color:var(--accent)">'+esc(portalUrl)+'</a></div>'+
        '<div><strong>Email :</strong> '+esc(emailVal)+'</div>'+
        '<div><strong>Mot de passe :</strong> '+esc(passVal)+'</div></div>'+
        '<button onclick="navigator.clipboard.writeText(\'URL: '+esc(portalUrl)+'\\nEmail: '+esc(emailVal)+'\\nMot de passe: '+esc(passVal)+'\').then(function(){showToast(\'Copié !\',\'success\')})" '+
        'style="margin-top:0.5rem;background:var(--bg-3);color:var(--text);border:1px solid var(--border);border-radius:5px;padding:0.35rem 0.8rem;font-size:0.75rem;cursor:pointer;font-family:var(--font)">Copier les identifiants</button>';
      succEl.style.display = 'block';
      btn.style.display = 'none';
    }).catch(function(e){
      errEl.textContent = e.message || 'Erreur création';
      errEl.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Créer le compte';
    });
  });
  document.body.appendChild(ov);
}

function showPjCoords(lat, lng){
  var d = document.getElementById('pj-coords-display'); if(!d) return;
  document.getElementById('pj-lat-display').textContent = parseFloat(lat).toFixed(6);
  document.getElementById('pj-lng-display').textContent = parseFloat(lng).toFixed(6);
  var link = document.getElementById('pj-maps-link');
  if (link) link.href = 'https://maps.google.com/?q='+lat+','+lng;
  d.style.display = 'block';
}

function setPjLocation(lat, lng){
  var latEl = document.getElementById('pj-lat'); var lngEl = document.getElementById('pj-lng');
  if (latEl) latEl.value = lat; if (lngEl) lngEl.value = lng;
  showPjCoords(lat, lng);
}

// A5 — saveProjet: POST pour création, PUT pour modification
function saveProjet(){
  var nom      = (document.getElementById('pj-nom').value||'').trim();
  var clientSel = document.getElementById('pj-client');
  var clientId  = clientSel ? clientSel.value : '';
  var err       = document.getElementById('pj-err');
  if (!nom) {
    err.textContent='Le nom du projet est obligatoire.'; err.style.display='block';
    // Naviguer vers l'onglet Identité
    var identTab = document.querySelector('.pj-tab[onclick*="identite"]');
    if(identTab) switchPjTab('identite', identTab);
    document.getElementById('pj-nom').focus();
    return;
  }
  if (!clientId) {
    err.textContent='Veuillez sélectionner un client.'; err.style.display='block';
    var identTab2 = document.querySelector('.pj-tab[onclick*="identite"]');
    if(identTab2) switchPjTab('identite', identTab2);
    return;
  }
  err.style.display = 'none';

  var client      = getClients().find(function(c){ return c.id===clientId; }) || {};
  var annee       = parseInt(document.getElementById('pj-annee').value) || new Date().getFullYear();
  var statut      = document.getElementById('pj-statut').value;
  var typeBat     = document.getElementById('pj-type-bat').value;
  var honoraires  = parseFloat((document.getElementById('pj-honoraires2')||{}).value)||0;
  var budget      = parseFloat((document.getElementById('pj-budget2')||{}).value)||0;
  var surface     = parseFloat((document.getElementById('pj-surface2')||{}).value)||0;
  var description = (document.getElementById('pj-description').value||'').trim();
  var adresse     = (document.getElementById('pj-adresse').value||'').trim();
  var lat         = parseFloat(document.getElementById('pj-lat').value)||null;
  var lng         = parseFloat(document.getElementById('pj-lng').value)||null;
  var displayNom  = client.displayNom||client.display_nom||client.nom||client.raison||'';
  // Lire le code : priorité au champ manuel s'il est actif
  var codeInputEl = document.getElementById('pj-code-input');
  var codeManual  = (codeInputEl && codeInputEl.dataset.manual === '1') ? codeInputEl.value.trim() : '';
  var code        = codeManual
    || (_editingProjetId
      ? (document.getElementById('pj-code-preview').textContent || genProjetCode(annee, displayNom, client.code))
      : genProjetCode(annee, displayNom, client.code));

  var body = {
    nom:nom, client:displayNom, clientId:clientId,
    code:code, annee:annee, statut:statut,
    typeBat: typeBat||null,            // camelCase envoyé; PHP doit accepter les deux
    type_bat: typeBat||null,           // snake_case aussi pour compatibilité API
    honoraires:honoraires,
    budget:budget||null, surface:surface||null,
    description:description||null, adresse:adresse||null,
    lat:lat, lng:lng,
    surface_shon: parseFloat((document.getElementById('pj-shon')||{}).value)||null,
    surface_shob: parseFloat((document.getElementById('pj-shob')||{}).value)||null,
    surface_terrain: parseFloat((document.getElementById('pj-terrain')||{}).value)||null,
    standing: (document.getElementById('pj-standing')||{}).value||null,
    zone: (document.getElementById('pj-zone')||{}).value||null,
    cout_construction: parseFloat((document.getElementById('pj-cout-construction')||{}).value)||null,
    cout_m2: parseFloat((document.getElementById('pj-cout-m2')||{}).value)||null,
    missions:getSelectedMissions(),
    intervenants:getIntervenants(),
    create_chat_room: (document.getElementById('pj-chat-create') || {}).checked || false,
    nasPath: (document.getElementById('pj-nas-path-input') || {}).value || null,
  };
  var wantNas = !_editingProjetId && ((document.getElementById('pj-nas-create') || {}).checked || false);
  // Ouvrir la popup NAS AVANT l'appel async (sinon popup blocker)
  var nasPopup = null;
  if (wantNas) {
    nasPopup = window.open('about:blank', 'nas-bridge', 'width=520,height=420');
  }

  var method, url;
  if (_editingProjetId) {
    body.id = _editingProjetId;
    method  = 'PUT';
    url     = 'api/projets.php?id=' + _editingProjetId;
  } else {
    method = 'POST';
    url    = 'api/projets.php';
  }

  apiFetch(url, {method:method, body:body})
    .then(function(resp){
      var projet = resp.data || resp || {};
      var finalCode = projet.code || code;
      if (nasPopup) {
        nasPopup.location.href = buildNasBridgeUrl(finalCode, displayNom, annee);
      }
      loadData().then(function(){ renderProjets(); populateProjetSelect(); });
      closeModal('modal-projet');
      resetProjetForm();
    })
    .catch(function(e){
      if (nasPopup) try { nasPopup.close(); } catch(x) {}
      err.textContent=e.message||'Erreur'; err.style.display='block';
    });
}

// ── Colonnes projets ──
var ALL_PJ_COLUMNS = [
  {key:'code',      label:'Code',       default:true, locked:false,sortable:true, render:function(p){return'<span style="font-family:var(--mono);font-size:0.72rem;color:var(--accent);font-weight:700;letter-spacing:0.08em">'+(p.code||'—')+'</span>';}},
  {key:'nom',       label:'Projet',     default:true, locked:true, sortable:true, render:function(p){return'<span style="font-weight:500">'+(p.nom||'—')+'</span>';}},
  {key:'client',    label:'Client',     default:true, locked:false,sortable:true, render:function(p){return p.client||'—';}},
  {key:'statut',    label:'Statut',     default:true, locked:false,sortable:true, render:function(p){return'<span class="'+badgeClass(p.statut||'')+'">'+(p.statut||'—')+'</span>';}},
  {key:'annee',     label:'Année',      default:false,locked:false,sortable:true, render:function(p){return p.annee||'—';}},
  {key:'typeBat',   label:'Type bât.',  default:false,locked:false,sortable:true, render:function(p){return p.typeBat||p.type_bat||'—';}},
  {key:'standing',  label:'Standing',   default:false,locked:false,sortable:true, render:function(p){return p.standing||'—';}},
  {key:'zone',      label:'Zone',       default:false,locked:false,sortable:true, render:function(p){return p.zone||'—';}},
  {key:'honoraires',label:'Honoraires', default:true, locked:false,sortable:true, render:function(p){return'<span class="inline-val">'+fmtMontant(p.honoraires||0)+'</span>';}},
  {key:'adresse',   label:'Lieu',       default:false,locked:false,sortable:true, render:function(p){return p.adresse||'—';}},
  {key:'creeAt',    label:'Créé le',    default:false,locked:false,sortable:true, render:function(p){if(!p.cree_at) return '—'; var d=new Date(p.cree_at); return isNaN(d)?'—':d.toLocaleDateString('fr-FR');}},
  {key:'creePar',   label:'Créé par',   default:false,locked:false,sortable:true, render:function(p){return p.cree_par||'—';}},
  {key:'modifiePar',label:'Modifié par',default:false,locked:false,sortable:true, render:function(p){return p.modifie_par||'—';}},
  {key:'nasPath',   label:'Dossier NAS',default:false,locked:false,sortable:false,render:function(p){var cfg=getNasConfig();var ip=cfg.local||'192.168.1.165';var cl=(p.client||p.nom||'').replace(/,/g,'');var fn=(p.code||'')+'_'+cl;var path='\\\\'+ip+'\\Public\\CAS_PROJETS\\'+(p.annee||'')+'\\'+fn;var safeP=path.replace(/\\/g,'\\\\').replace(/'/g,"\\'");return'<span onclick="event.stopPropagation();navigator.clipboard.writeText(\''+safeP+'\');showToast(\'Chemin copié\',\'success\')" style="cursor:pointer;font-size:0.7rem;color:var(--text-3);text-decoration:underline dotted" title="'+path.replace(/"/g,'&quot;')+'">'+fn.substring(0,20)+(fn.length>20?'…':'')+'</span>';}}
];
var _pjActiveColumns = null;

function getPjActiveColumns(){
  if (_pjActiveColumns) return _pjActiveColumns;
  var userKey = _userPrefKey('cortoba_pj_col_order');
  var saved = getSetting(userKey, null);
  if (!saved) saved = getLS('cortoba_pj_col_order', null); // fallback ancien format
  _pjActiveColumns = (saved&&Array.isArray(saved)) ? saved : ALL_PJ_COLUMNS.filter(function(c){return c.default;}).map(function(c){return c.key;});
  return _pjActiveColumns;
}
function savePjColumnPrefs(){ var k=_userPrefKey('cortoba_pj_col_order'); setLS(k,_pjActiveColumns); saveSetting(k,_pjActiveColumns); }
function resetPjColumns(){ _pjActiveColumns=ALL_PJ_COLUMNS.filter(function(c){return c.default;}).map(function(c){return c.key;}); savePjColumnPrefs(); renderProjets(); }
function togglePjColDropdown(e){
  e.stopPropagation(); _pjColDropOpen=!_pjColDropOpen;
  var dd=document.getElementById('pj-col-dropdown'); var btn=document.getElementById('pj-col-burger');
  if(_pjColDropOpen){ renderPjColDropdown(); if(dd)dd.style.display='block'; if(btn){btn.style.color='var(--accent)';btn.style.opacity='1';} }
  else { if(dd)dd.style.display='none'; if(btn){btn.style.color='';btn.style.opacity='';} }
}
function renderPjColDropdown(){
  var list=document.getElementById('pj-col-list'); if(!list) return;
  var active=getPjActiveColumns();
  list.innerHTML='';
  ALL_PJ_COLUMNS.forEach(function(col){
    var isActive=active.indexOf(col.key)!==-1;
    var row=document.createElement('label');
    row.style.cssText='display:flex;align-items:center;gap:0.6rem;padding:0.45rem 0.2rem;cursor:pointer';
    row.innerHTML='<input type="checkbox" '+(isActive?'checked':'')+' '+(col.locked?'disabled':'')+' onchange="togglePjColumn(\''+col.key+'\')" style="accent-color:var(--accent)"><span style="font-size:0.82rem;color:var(--text-2)">'+col.label+'</span>';
    list.appendChild(row);
  });
}
function togglePjColumn(key){
  var active=getPjActiveColumns();
  var col=ALL_PJ_COLUMNS.find(function(c){return c.key===key;});
  if(col&&col.locked) return;
  var idx=active.indexOf(key);
  if(idx!==-1){ if(active.length<=2)return; active.splice(idx,1); }
  else {
    var allKeys=ALL_PJ_COLUMNS.map(function(c){return c.key;});
    var ki=allKeys.indexOf(key); var ins=active.length;
    for(var i=ki-1;i>=0;i--){ var pos=active.indexOf(allKeys[i]); if(pos!==-1){ins=pos+1;break;} }
    active.splice(ins,0,key);
  }
  _pjActiveColumns=active; savePjColumnPrefs(); renderPjColDropdown(); renderProjets();
}
function sortByPjColumn(key){ if(_pjSortKey===key)_pjSortDir*=-1; else{_pjSortKey=key;_pjSortDir=1;} renderProjets(); }
document.addEventListener('click',function(e){
  if(_pjColDropOpen&&!e.target.closest('#pj-col-dropdown')&&e.target.id!=='pj-col-burger'){
    _pjColDropOpen=false;
    var dd=document.getElementById('pj-col-dropdown');if(dd)dd.style.display='none';
    var btn=document.getElementById('pj-col-burger');if(btn){btn.style.color='';btn.style.opacity='';}
  }
});

// ── Factures & Dépenses ──
// ══════════════════════════════════════════════════════════
//  FACTURATION — version complète loi tunisienne 2026
// ══════════════════════════════════════════════════════════

function populateProjetSelect(){
  var sel=document.getElementById('fa-projet'); if(!sel) return;
  var p=getProjets();
  sel.innerHTML='<option value="">— Sélectionner un projet —</option>'+
    p.map(function(x){return'<option value="'+x.id+'" data-nom="'+x.nom+'" data-client="'+x.client+'">'+x.nom+'</option>';}).join('');
  // Remplir la datalist client (autocomplete)
  var dl = document.getElementById('fa-client-list');
  if (dl) dl.innerHTML = getClients().map(function(c){
    var nom = c.displayNom||c.display_nom||c.nom||c.raison||'';
    return '<option value="'+nom+'">';
  }).join('');
}

function prefillClientFromProjet(){
  var sel = document.getElementById('fa-projet'); if(!sel||!sel.value) return;
  var opt = sel.options[sel.selectedIndex];
  var clientNom = opt.dataset.client||'';
  var clientEl  = document.getElementById('fa-client');
  if (clientEl && clientNom) clientEl.value = clientNom;
  // Chercher adresse et MF du client
  var c = getClients().find(function(x){
    return (x.displayNom||x.nom||x.raison||'') === clientNom;
  });
  if (c) {
    var adresseEl = document.getElementById('fa-client-adresse');
    if (adresseEl && c.adresse) adresseEl.value = c.adresse;
    var mfEl = document.getElementById('fa-client-mf');
    if (mfEl && c.matricule) mfEl.value = c.matricule;
  }
}

// Onglets facture
function switchFaTab(tab, btn){
  document.querySelectorAll('.fa-tab').forEach(function(t){
    t.classList.remove('active'); t.style.color='var(--text-3)'; t.style.borderBottomColor='transparent';
  });
  document.querySelectorAll('.fa-tab-panel').forEach(function(p){ p.style.display='none'; });
  btn.classList.add('active'); btn.style.color='var(--accent)'; btn.style.borderBottomColor='var(--accent)';
  var panel = document.getElementById('fa-panel-'+tab);
  if (panel) panel.style.display='block';
  if (tab==='fiscal') calcFactureTotal();
}

// Générer numéro automatique
function autoNumFacture(){
  var list = getFactures();
  var year = new Date().getFullYear();
  var next = list.length + 1;
  var numEl = document.getElementById('fa-num');
  if (numEl) numEl.value = String(next).padStart(3,'0') + '/' + year;
}

// Lignes de prestation
var _faLigneCount = 0;
function addFactureLigne(data){
  _faLigneCount++;
  var n = _faLigneCount;
  var wrap = document.getElementById('fa-lignes-wrap'); if(!wrap) return;
  var div = document.createElement('div');
  div.id = 'fa-ligne-'+n;
  div.style.cssText = 'display:grid;grid-template-columns:2fr 55px 90px 75px 90px 30px;gap:0.4rem;margin-bottom:0.4rem;align-items:center';
  div.innerHTML =
    '<input class="form-input fa-l-desc" placeholder="Désignation de la prestation" value="'+(data&&data.desc||'')+'" oninput="calcFactureTotal()" style="font-size:0.82rem" />'+
    '<input class="form-input fa-l-qte" type="number" step="0.01" placeholder="1" value="'+(data&&data.qte||1)+'" oninput="calcFactureTotal()" style="font-size:0.82rem;text-align:center" />'+
    '<input class="form-input fa-l-pu" type="number" step="0.001" placeholder="0.000" value="'+(data&&data.pu||'')+'" oninput="calcFactureTotal()" style="font-size:0.82rem;text-align:right" />'+
    '<select class="form-select fa-l-tva" onchange="calcFactureTotal()" style="font-size:0.82rem">'+
      '<option value="0"'+(data&&data.tva==0?' selected':'')+'>0%</option>'+
      '<option value="7"'+(data&&data.tva==7?' selected':'')+'>7%</option>'+
      '<option value="13"'+(data&&data.tva==13?' selected':'')+'>13%</option>'+
      '<option value="19"'+((!data||data.tva==19)?' selected':'')+'>19%</option>'+
    '</select>'+
    '<input class="form-input fa-l-total" readonly style="font-size:0.82rem;text-align:right;background:var(--bg-3);color:var(--text-2)" value="0,000" />'+
    '<button type="button" class="btn btn-sm" style="color:#e07070;padding:0.2rem 0.4rem" onclick="document.getElementById(\'fa-ligne-'+n+'\').remove();calcFactureTotal()">✕</button>';
  wrap.appendChild(div);
  calcFactureTotal();
}

function calcFactureTotal(){
  var totalHT=0, tvaMap={};
  document.querySelectorAll('#fa-lignes-wrap > div').forEach(function(div){
    var qteEl  = div.querySelector('.fa-l-qte');
    var puEl   = div.querySelector('.fa-l-pu');
    var tvaEl  = div.querySelector('.fa-l-tva');
    var totEl  = div.querySelector('.fa-l-total');
    if(!puEl) return;
    var qte    = parseFloat(qteEl?qteEl.value:1)||1;
    var pu     = parseFloat(puEl.value)||0;
    var tva    = parseFloat(tvaEl?tvaEl.value:19)||0;
    var ligneHT= Math.round(qte * pu * 1000)/1000;
    totalHT   += ligneHT;
    if (totEl) totEl.value = ligneHT.toFixed(3).replace('.',',');
    tvaMap[tva] = (tvaMap[tva]||0) + ligneHT;
  });

  // TVA par taux
  var totalTVA = 0;
  var tvaRecap = '';
  Object.keys(tvaMap).sort().forEach(function(t){
    var base     = tvaMap[t];
    var tvaAmt   = Math.round(base * parseFloat(t) / 100 * 1000)/1000;
    totalTVA    += tvaAmt;
    if (parseFloat(t) > 0) tvaRecap += '<div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:0.2rem"><span style="color:var(--text-3)">TVA '+t+'% sur '+base.toFixed(3).replace('.',',')+' TND</span><span style="font-family:var(--mono)">'+tvaAmt.toFixed(3).replace('.',',')+' TND</span></div>';
  });
  var tvaRecapWrap = document.getElementById('fa-tva-recap');
  var tvaRecapLines = document.getElementById('fa-tva-recap-lines');
  if (tvaRecapWrap) tvaRecapWrap.style.display = tvaRecap ? 'block' : 'none';
  if (tvaRecapLines) tvaRecapLines.innerHTML = tvaRecap;

  // FODEC
  var fodecActive = document.getElementById('fa-fodec-active');
  var fodec = (fodecActive&&fodecActive.checked) ? Math.round(totalHT*0.01*1000)/1000 : 0;

  // Timbre : 1 TND fixe si TTC ≥ 10
  var preTTC = totalHT + totalTVA + fodec;
  var timbre = preTTC >= 10 ? 1.000 : 0;
  var ttc    = preTTC + timbre;

  // RAS
  var rasActive = document.getElementById('fa-ras-active');
  var rasTauxSel= document.getElementById('fa-ras-taux');
  var rasTauxCustom = document.getElementById('fa-ras-taux-custom');
  var rasTaux = 0;
  if (rasActive && rasActive.checked) {
    var tv = rasTauxSel ? rasTauxSel.value : '10';
    rasTaux = tv === 'custom' ? (parseFloat(rasTauxCustom?rasTauxCustom.value:0)||0) : parseFloat(tv)||0;
  }
  var rasAmt  = Math.round(ttc * rasTaux / 100 * 1000)/1000;
  var netPayer= Math.round((ttc - rasAmt)*1000)/1000;

  function fmt(n){ return n.toFixed(3).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,' ')+' TND'; }
  var htEl    = document.getElementById('fa-total-ht');    if(htEl)    htEl.textContent    = fmt(totalHT);
  var tvaEl   = document.getElementById('fa-total-tva');   if(tvaEl)   tvaEl.textContent   = fmt(totalTVA);
  var fodecEl = document.getElementById('fa-total-fodec'); if(fodecEl) fodecEl.textContent = fmt(fodec);
  var timbreEl= document.getElementById('fa-total-timbre');if(timbreEl)timbreEl.textContent= fmt(timbre);
  var ttcEl   = document.getElementById('fa-total-ttc');   if(ttcEl)   ttcEl.textContent   = fmt(ttc);
  var rasBaseEl = document.getElementById('fa-ras-base');  if(rasBaseEl) rasBaseEl.textContent = fmt(ttc);
  var rasAmtEl  = document.getElementById('fa-ras-montant');if(rasAmtEl) rasAmtEl.textContent = '- '+fmt(rasAmt);
  var netEl     = document.getElementById('fa-net-payer'); if(netEl)    netEl.textContent   = fmt(netPayer);

  // Montant en lettres
  var lettresEl = document.getElementById('fa-montant-lettres');
  if (lettresEl) lettresEl.textContent = montantEnLettres(ttc) + ' dinars tunisiens';
}

function toggleRas(){
  var active = document.getElementById('fa-ras-active');
  var wrap   = document.getElementById('fa-ras-wrap');
  if (wrap) wrap.style.display = (active&&active.checked) ? 'block' : 'none';
  calcFactureTotal();
}

function onRasTauxChange(){
  var sel = document.getElementById('fa-ras-taux');
  var customWrap = document.getElementById('fa-ras-custom-wrap');
  if (customWrap) customWrap.style.display = (sel&&sel.value==='custom') ? 'block' : 'none';
  calcFactureTotal();
}

// Convertir un montant en lettres (arabe tunisien simplifié)
function montantEnLettres(n){
  n = Math.round(n * 1000)/1000;
  var entier  = Math.floor(n);
  var millimes= Math.round((n - entier)*1000);
  var unites = ['','un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix',
    'onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'];
  var dizaines= ['','dix','vingt','trente','quarante','cinquante','soixante','soixante-dix','quatre-vingt','quatre-vingt-dix'];
  function conv(n){
    if(n===0) return '';
    if(n<20) return unites[n];
    if(n<100){var d=Math.floor(n/10),u=n%10;return dizaines[d]+(u?(d===7||d===9?'-':'-')+unites[d===7||d===9?u+10:u]:'');}
    if(n<1000){var c=Math.floor(n/100);return(c===1?'cent':conv(c)+' cent')+(n%100?' '+conv(n%100):'');}
    if(n<1000000){var m=Math.floor(n/1000);return(m===1?'mille':conv(m)+' mille')+(n%1000?' '+conv(n%1000):'');}
    return n.toString();
  }
  var r = conv(entier)||'zéro';
  if (millimes>0) r += ' et '+conv(millimes)+' millime'+(millimes>1?'s':'');
  return r.charAt(0).toUpperCase()+r.slice(1);
}

function resetFactureForm(){
  _faLigneCount = 0;
  ['fa-num','fa-date','fa-echeance','fa-client','fa-client-adresse','fa-client-mf',
   'fa-objet','fa-ref-elfatoora','fa-signature-elec','fa-notes','fa-rib'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  var proj = document.getElementById('fa-projet'); if(proj) proj.value='';
  var stat = document.getElementById('fa-statut'); if(stat) stat.value='Impayée';
  var mode = document.getElementById('fa-mode-paiement'); if(mode) mode.selectedIndex=0;
  var rasAct = document.getElementById('fa-ras-active'); if(rasAct) { rasAct.checked=false; toggleRas(); }
  var fodecAct = document.getElementById('fa-fodec-active'); if(fodecAct) fodecAct.checked=false;
  var wrap = document.getElementById('fa-lignes-wrap'); if(wrap) wrap.innerHTML='';
  var err = document.getElementById('fa-err'); if(err) err.style.display='none';
  // Revenir au premier onglet
  document.querySelectorAll('.fa-tab').forEach(function(t,i){
    t.style.color=i===0?'var(--accent)':'var(--text-3)';
    t.style.borderBottomColor=i===0?'var(--accent)':'transparent';
    t.classList.toggle('active',i===0);
  });
  document.querySelectorAll('.fa-tab-panel').forEach(function(p,i){ p.style.display=i===0?'block':'none'; });
  // Pré-remplir date et RIB depuis paramètres
  var dateEl = document.getElementById('fa-date');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
  var ribEl = document.getElementById('fa-rib');
  if (ribEl) {
    var savedRib = getSetting('cortoba_rib','');
    if (savedRib) ribEl.value = savedRib;
  }
  // Remettre le titre en mode création
  var titleEl = document.querySelector('#modal-facture .modal-title');
  if (titleEl) titleEl.textContent = 'Nouvelle facture';
  _editingFactureId = null;
  // Ajouter une ligne par défaut
  addFactureLigne();
  calcFactureTotal();
  populateProjetSelect();
}

function saveFacture(){
  var num     = (document.getElementById('fa-num').value||'').trim();
  var client  = (document.getElementById('fa-client').value||'').trim();
  var date    = document.getElementById('fa-date').value;
  var err     = document.getElementById('fa-err');

  if (!num)    { err.textContent='Le numéro de facture est obligatoire.'; err.style.display='block'; return; }
  if (!client) { err.textContent='Le client est obligatoire.'; err.style.display='block'; return; }
  if (!date)   { err.textContent='La date d\'émission est obligatoire.'; err.style.display='block'; return; }
  err.style.display='none';

  // Collecter les lignes
  var lignes = [];
  var totalHT=0, totalTVA=0;
  document.querySelectorAll('#fa-lignes-wrap > div').forEach(function(div){
    var desc = div.querySelector('.fa-l-desc');
    var qteEl= div.querySelector('.fa-l-qte');
    var puEl = div.querySelector('.fa-l-pu');
    var tvaEl= div.querySelector('.fa-l-tva');
    if(!puEl) return;
    var qte  = parseFloat(qteEl?qteEl.value:1)||1;
    var pu   = parseFloat(puEl.value)||0;
    var tva  = parseFloat(tvaEl?tvaEl.value:19)||0;
    var lht  = Math.round(qte*pu*1000)/1000;
    totalHT += lht;
    totalTVA+= Math.round(lht*tva/100*1000)/1000;
    lignes.push({desc:(desc?desc.value.trim():''), qte:qte, pu:pu, tva:tva, ht:lht});
  });
  if (lignes.length===0||totalHT===0) { err.textContent='Ajoutez au moins une prestation.'; err.style.display='block'; return; }

  var fodecActive = document.getElementById('fa-fodec-active');
  var fodec  = (fodecActive&&fodecActive.checked) ? Math.round(totalHT*0.01*1000)/1000 : 0;
  var preTTC = totalHT + totalTVA + fodec;
  var timbre = preTTC >= 10 ? 1.000 : 0;
  var ttc    = preTTC + timbre;

  var rasActive = document.getElementById('fa-ras-active');
  var rasTauxSel= document.getElementById('fa-ras-taux');
  var rasTaux = 0;
  if (rasActive&&rasActive.checked) {
    var tv = rasTauxSel?rasTauxSel.value:'10';
    if (tv==='custom') tv = (document.getElementById('fa-ras-taux-custom')||{value:'0'}).value;
    rasTaux = parseFloat(tv)||0;
  }
  var rasAmt   = Math.round(ttc*rasTaux/100*1000)/1000;
  var netPayer = Math.round((ttc-rasAmt)*1000)/1000;

  var projet = document.getElementById('fa-projet');
  var proj   = getProjets().find(function(p){return p.id===(projet?projet.value:'');});

  var body = {
    numero: num,
    client: client,
    clientAdresse: (document.getElementById('fa-client-adresse').value||'').trim(),
    clientMF: (document.getElementById('fa-client-mf').value||'').trim(),
    objet: (document.getElementById('fa-objet').value||'').trim(),
    projetId: proj?proj.id:null,
    dateEmission: date,
    dateEcheance: document.getElementById('fa-echeance').value||null,
    lignes: lignes,
    montantHt: totalHT, montantTva: totalTVA, fodec: fodec,
    timbre: timbre, montantTtc: ttc,
    rasTaux: rasTaux, rasAmt: rasAmt, netPayer: netPayer,
    modePaiement: (document.getElementById('fa-mode-paiement')||{value:''}).value,
    statut: (document.getElementById('fa-statut')||{value:'Impayée'}).value,
    notes: (document.getElementById('fa-notes').value||'').trim(),
    rib: (document.getElementById('fa-rib').value||'').trim(),
    refElfatoora: (document.getElementById('fa-ref-elfatoora').value||'').trim(),
    signatureElec: (document.getElementById('fa-signature-elec').value||'').trim(),
    montantLettres: montantEnLettres(ttc)
  };

  // Tentative sauvegarde API — fallback localStorage si erreur serveur
  var bodyAPI = {
    numero:         num,
    client:         client,
    projetId:       proj ? proj.id : null,
    projet_id:      proj ? proj.id : null,
    montantHt:      totalHT, montant_ht:  totalHT,
    montantTtc:     ttc,     montant_ttc: ttc,
    tva:            totalTVA,
    dateEcheance:   document.getElementById('fa-echeance').value || null,
    date_echeance:  document.getElementById('fa-echeance').value || null,
    statut:         (document.getElementById('fa-statut')||{value:'Impayée'}).value
  };

  var bodyFull = Object.assign({}, bodyAPI, {
    clientAdresse:   (document.getElementById('fa-client-adresse').value||'').trim(),
    client_adresse:  (document.getElementById('fa-client-adresse').value||'').trim(),
    clientMF:        (document.getElementById('fa-client-mf').value||'').trim(),
    client_mf:       (document.getElementById('fa-client-mf').value||'').trim(),
    objet:           (document.getElementById('fa-objet').value||'').trim(),
    dateEmission:    date, date_emission: date,
    lignes:          lignes,
    lignes_json:     JSON.stringify(lignes),
    fodec:           fodec,
    timbre:          timbre,
    rasTaux:         rasTaux,  ras_taux:    rasTaux,
    rasAmt:          rasAmt,   ras_amt:     rasAmt,
    netPayer:        netPayer, net_payer:   netPayer,
    modePaiement:    (document.getElementById('fa-mode-paiement')||{value:''}).value,
    mode_paiement:   (document.getElementById('fa-mode-paiement')||{value:''}).value,
    notes:           (document.getElementById('fa-notes').value||'').trim(),
    rib:             (document.getElementById('fa-rib').value||'').trim(),
    refElfatoora:    (document.getElementById('fa-ref-elfatoora').value||'').trim(),
    ref_elfatoora:   (document.getElementById('fa-ref-elfatoora').value||'').trim(),
    signatureElec:   (document.getElementById('fa-signature-elec').value||'').trim(),
    signature_elec:  (document.getElementById('fa-signature-elec').value||'').trim(),
    montantLettres:  montantEnLettres(ttc),
    montant_lettres: montantEnLettres(ttc)
  });

  var btn = document.getElementById('fa-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }

  // POST (création) ou PUT (modification)
  var method = _editingFactureId ? 'PUT' : 'POST';
  var url = _editingFactureId
    ? 'api/data.php?table=factures&id=' + _editingFactureId
    : 'api/data.php?table=factures';
  if (_editingFactureId) bodyFull.id = _editingFactureId;

  apiFetch(url, {method:method, body:bodyFull})
    .then(function(r){
      var savedFacId = r && (r.id || (r.data && r.data.id)) || null;
      _editingFactureId = null;
      loadData().then(function(){ renderFactures(); });
      closeModal('modal-facture');
      resetFactureForm();
      if (btn) { btn.disabled = false; btn.textContent = 'Émettre la facture →'; }
      showToast('Facture enregistrée avec succès');
    })
    .catch(function(e){
      if (btn) { btn.disabled = false; btn.textContent = 'Émettre la facture →'; }
      var err = document.getElementById('fa-err');
      if (err) { err.textContent = e.message || 'Erreur serveur'; err.style.display = 'block'; }
    });
}

// Ouvrir facture en mode édition
var _editingFactureId = null;
function openEditFacture(id){
  var f = getFactures().find(function(x){ return x.id===id; });
  if (!f) return;

  // Recharger depuis l'API pour avoir les données fraîches (lignes, etc.)
  var token = sessionStorage.getItem('cortoba_token');
  var headers = {'Content-Type':'application/json'};
  if (token) headers['Authorization'] = 'Bearer ' + token;

  fetch(API_BASE + 'api/data.php?table=factures&id=' + id, {headers: headers})
    .then(function(r){ return r.json(); })
    .then(function(resp){
      var fFresh = resp.data || f; // utiliser données fraîches, sinon cache
      var lignes = [];
      try { lignes = JSON.parse(fFresh.lignes_json || fFresh.lignes || '[]'); } catch(e){}
      _fillEditFacture(fFresh, lignes, id);
    })
    .catch(function(){
      // fallback sur le cache
      var lignes = f.lignes || [];
      _fillEditFacture(f, lignes, id);
    });
}

function _fillEditFacture(f, lignes, id){
  openModal('modal-facture');
  _editingFactureId = id;

  setTimeout(function(){
    // ── Titre et bouton ──
    var titleEl = document.querySelector('#modal-facture .modal-title');
    if(titleEl) titleEl.textContent = 'Modifier \u2014 '+(f.numero||f.num||'Facture');
    var saveBtn = document.getElementById('fa-save-btn');
    if(saveBtn) saveBtn.textContent = 'Enregistrer les modifications \u2192';

    // ── Onglet Général ──
    var el;
    el = document.getElementById('fa-num');           if(el) el.value = f.numero||f.num||'';
    el = document.getElementById('fa-date');          if(el) el.value = f.date_emission||f.dateEmission||'';
    el = document.getElementById('fa-echeance');      if(el) el.value = f.date_echeance||f.dateEcheance||f.echeance||'';
    el = document.getElementById('fa-client');        if(el) el.value = f.client||'';
    el = document.getElementById('fa-client-adresse');if(el) el.value = f.client_adresse||f.clientAdresse||'';
    el = document.getElementById('fa-client-mf');     if(el) el.value = f.client_mf||f.clientMF||'';
    el = document.getElementById('fa-objet');         if(el) el.value = f.objet||'';

    // Projet lié
    var projSel = document.getElementById('fa-projet');
    if(projSel){
      var pid = f.projet_id||f.projetId||'';
      Array.from(projSel.options).forEach(function(o){ if(o.value===pid) o.selected=true; });
    }

    // ── Onglet Prestations — recharger les lignes ──
    var wrap = document.getElementById('fa-lignes-wrap');
    if(wrap){
      wrap.innerHTML = '';
      _faLigneCount = 0;
      if(lignes && lignes.length){
        lignes.forEach(function(l){
          addFactureLigne({
            desc: l.desc||l.description||'',
            qte:  l.qte||1,
            pu:   l.pu||l.puHt||0,
            tva:  l.tva||0
          });
        });
      } else {
        addFactureLigne();
      }
    }
    calcFactureTotal();

    // ── Onglet Fiscal ──
    var fodecCb = document.getElementById('fa-fodec-active');
    if(fodecCb){ fodecCb.checked = parseFloat(f.fodec||0) > 0; }

    var rasCb = document.getElementById('fa-ras-active');
    var rasAmt = parseFloat(f.ras_amt||f.rasAmt||0);
    if(rasCb){
      rasCb.checked = rasAmt > 0;
      if(rasAmt > 0){
        var rasSel = document.getElementById('fa-ras-taux');
        if(rasSel) rasSel.value = String(f.ras_taux||f.rasTaux||'10');
        toggleRas();
      }
    }

    // ── Onglet Paiement ──
    el = document.getElementById('fa-statut');
    if(el) el.value = f.statut||'Impayée';
    el = document.getElementById('fa-mode-paiement');
    if(el && (f.mode_paiement||f.modePaiement)) el.value = f.mode_paiement||f.modePaiement||'';
    el = document.getElementById('fa-notes');
    if(el) el.value = f.notes||'';
    el = document.getElementById('fa-rib');
    if(el) el.value = f.rib||getSetting('cortoba_rib','')||'';
    el = document.getElementById('fa-ref-elfatoora');
    if(el) el.value = f.ref_elfatoora||f.refElfatoora||'';
    el = document.getElementById('fa-signature-elec');
    if(el) el.value = f.signature_elec||f.signatureElec||'';

    // ── Bouton PDF ──
    var pdfBtn = document.getElementById('fa-pdf-btn');
    if(pdfBtn){
      pdfBtn.disabled = false;
      pdfBtn.style.opacity = '1';
      pdfBtn.title = 'Exporter cette facture en PDF';
      pdfBtn.onclick = (function(fid){ return function(){ exportUneFacturePDF(fid); }; })(id);
    }

    // Revenir au premier onglet
    document.querySelectorAll('.fa-tab').forEach(function(t,i){
      t.classList.toggle('active', i===0);
      t.style.color = i===0 ? 'var(--accent)' : 'var(--text-3)';
      t.style.borderBottomColor = i===0 ? 'var(--accent)' : 'transparent';
    });
    document.querySelectorAll('.fa-tab-panel').forEach(function(p,i){
      p.style.display = i===0 ? 'block' : 'none';
    });

  }, 80);
}

function renderFactures(){
  var tb=document.getElementById('factures-tbody'); if(!tb) return;
  var list = getFactures();

  tb.innerHTML = list.length === 0
    ? '<tr><td colspan="8" style="text-align:center;color:var(--text-3);padding:2rem">Aucune facture.</td></tr>'
    : list.map(function(f){
        var ttc = f.montantTtc||f.montant_ttc||f.montant||0;
        var ht  = f.montantHt||f.montant_ht||0;
        var modBtn   = '<button class="btn btn-sm" onclick="event.stopPropagation();openEditFacture(\''+f.id+'\')" style="color:var(--accent);margin-right:3px" title="Modifier">✎</button>';
        var pdfBtn   = '<button class="btn btn-sm" onclick="event.stopPropagation();exportUneFacturePDF(\''+f.id+'\')" style="color:#6fa8d6;margin-right:3px" title="Exporter PDF">⬇ PDF</button>';
        var printBtn = '<button class="btn btn-sm" onclick="event.stopPropagation();imprimerFacture(\''+f.id+'\')" style="color:var(--text-2);margin-right:3px" title="Imprimer">🖨</button>';
        var delBtn   = '<button class="btn btn-sm" onclick="deleteRow(\'facture\',\''+f.id+'\')" style="color:#e07070" title="Supprimer">✕</button>';
        return '<tr>'+
          '<td class="inline-val" style="font-family:var(--mono);font-size:0.78rem">'+(f.num||f.numero||'—')+'</td>'+
          '<td style="font-weight:500">'+(f.client||'—')+'</td>'+
          '<td style="font-size:0.8rem;color:var(--text-2)">'+(f.projet||f.objet||'—')+'</td>'+
          '<td class="inline-val">'+fmtMontant(ht||ttc)+'</td>'+
          '<td class="inline-val" style="color:var(--accent)">'+fmtMontant(ttc)+'</td>'+
          '<td>'+fmtDate(f.echeance||f.dateEcheance||f.date_echeance)+'</td>'+
          '<td><span class="'+badgeClass(f.statut)+'">'+f.statut+'</span></td>'+
          '<td onclick="event.stopPropagation()" style="white-space:nowrap">'+modBtn+pdfBtn+printBtn+delBtn+'</td></tr>';
      }).join('');
  var b=document.querySelector('[onclick="showPage(\'facturation\')"] .nav-badge');
  if(b)b.textContent=list.filter(function(f){return f.statut==='Impayée';}).length||'';
}

// Logo dans Paramètres
function uploadLogo(input){
  var file = input.files[0]; if(!file) return;
  var stEl = document.getElementById('param-logo-status');

  function setStatus(msg, color){
    if(!stEl) return;
    stEl.textContent = msg;
    stEl.style.color = color || '';
  }

  setStatus('Compression…');

  var imgEl2 = new Image();
  var objUrl = URL.createObjectURL(file);

  imgEl2.onload = function(){
    // Compression : max 600×200 px, qualité 0.88
    var maxW=600, maxH=200, w=imgEl2.width, h=imgEl2.height;
    if(w>maxW){h=Math.round(h*maxW/w);w=maxW;}
    if(h>maxH){w=Math.round(w*maxH/h);h=maxH;}
    var cv=document.createElement('canvas'); cv.width=w; cv.height=h;
    cv.getContext('2d').drawImage(imgEl2,0,0,w,h);
    var dataUrl = cv.toDataURL('image/png', 0.88);
    URL.revokeObjectURL(objUrl);

    // 1. Afficher immédiatement
    var imgPreview = document.getElementById('param-logo-preview');
    var ph = document.getElementById('param-logo-placeholder');
    if(imgPreview){ imgPreview.src=dataUrl; imgPreview.style.display='block'; }
    if(ph) ph.style.display='none';

    // 2. Sauver en localStorage (toujours, immédiatement)
    try { localStorage.setItem('cortoba_logo', dataUrl); } catch(e) {}
    _settingsCache['cortoba_logo'] = dataUrl;

    setStatus('Enregistrement sur le serveur…');

    // 3. Sauver sur le serveur via API
    apiFetch('api/settings.php', {method:'POST', body:{key:'cortoba_logo', value:dataUrl}})
      .then(function(){
        setStatus('✓ Logo enregistré (serveur + local)', 'var(--green)');
      })
      .catch(function(){
        // API indisponible ou trop grande — le logo reste en localStorage
        setStatus('✓ Logo enregistré localement (serveur indisponible)', 'var(--accent)');
      });
  };

  imgEl2.onerror = function(){
    URL.revokeObjectURL(objUrl);
    setStatus('⚠ Erreur lecture image', 'var(--red)');
  };

  imgEl2.src = objUrl;
}

function removeLogo(){
  // Supprimer partout
  try { localStorage.removeItem('cortoba_logo'); } catch(e){}
  delete _settingsCache['cortoba_logo'];
  apiFetch('api/settings.php?key=cortoba_logo', {method:'DELETE'}).catch(function(){});

  var img=document.getElementById('param-logo-preview');
  var ph=document.getElementById('param-logo-placeholder');
  var st=document.getElementById('param-logo-status');
  if(img){ img.src=''; img.style.display='none'; }
  if(ph) ph.style.display='block';
  if(st){ st.style.color=''; st.textContent='Aucun logo importé'; }
}

function loadLogoParam(){
  // Chercher d'abord dans le cache mémoire, sinon localStorage direct
  var logo = _settingsCache['cortoba_logo']
    || (function(){ try{ return localStorage.getItem('cortoba_logo')||''; }catch(e){return '';} })();

  var img = document.getElementById('param-logo-preview');
  var ph  = document.getElementById('param-logo-placeholder');
  var st  = document.getElementById('param-logo-status');

  if(logo && img){
    img.src=logo;
    img.style.display='block';
    if(ph) ph.style.display='none';
    if(st){ st.style.color='var(--green)'; st.textContent='✓ Logo chargé'; }
  } else {
    if(img) img.style.display='none';
    if(ph) ph.style.display='block';
    if(st){ st.style.color=''; st.textContent='Aucun logo importé'; }
  }
}

// Paramètres agence — sauvegarde par IDs
function saveAgenceParams(){
  var map = {
    'param-agence-raison':  'cortoba_agence_raison',
    'param-agence-email':   'cortoba_agence_email',
    'param-agence-tel':     'cortoba_agence_tel',
    'param-agence-adresse': 'cortoba_agence_adresse',
    'param-agence-mf':      'cortoba_agence_mf',
    'param-agence-cnoa':    'cortoba_agence_cnoa'
  };
  var promises = [];
  var saved = 0;
  Object.keys(map).forEach(function(id){
    var el = document.getElementById(id);
    if (!el) return;
    var val = el.value.trim();
    // Ne sauvegarder que les champs avec une valeur
    if (!val && _settingsCache[map[id]]) return;
    if (val) { saved++; promises.push(saveSetting(map[id], val)); }
  });
  if (saved === 0) { showToast('⚠ Aucun champ à sauvegarder', 'error'); return; }
  Promise.all(promises).then(function(results) {
    var errors = results.filter(function(r){ return r && r.error; });
    if (errors.length > 0) {
      showToast('⚠ Sauvegarde locale OK, mais ' + errors.length + ' erreur(s) serveur', 'error');
    } else {
      showToast('✓ Informations agence enregistrées');
    }
  });
}

// Paramètres Rendement — taux horaires standards
function saveRendementParams(){
  var fact = (document.getElementById('param-taux-facturation-std')||{value:''}).value;
  var cout = (document.getElementById('param-taux-cout-std')||{value:''}).value;
  var vFact = fact === '' ? 0 : parseFloat(fact);
  var vCout = cout === '' ? 0 : parseFloat(cout);
  Promise.all([
    saveSetting('rendement_taux_facturation_std', vFact),
    saveSetting('rendement_taux_cout_std',        vCout)
  ]).then(function(results){
    var errors = results.filter(function(r){ return r && r.error; });
    if (errors.length > 0) showToast('⚠ Sauvegarde locale OK, mais ' + errors.length + ' erreur(s) serveur', 'error');
    else showToast('✓ Taux Rendement enregistrés');
  });
}
function loadRendementParams(){
  var f = document.getElementById('param-taux-facturation-std');
  var c = document.getElementById('param-taux-cout-std');
  if (f) f.value = getSetting('rendement_taux_facturation_std', 60);
  if (c) c.value = getSetting('rendement_taux_cout_std', 25);
}

// Charger les infos agence dans les champs
function loadAgenceParams(){
  var map = {
    'param-agence-raison':  'cortoba_agence_raison',
    'param-agence-email':   'cortoba_agence_email',
    'param-agence-tel':     'cortoba_agence_tel',
    'param-agence-adresse': 'cortoba_agence_adresse',
    'param-agence-mf':      'cortoba_agence_mf',
    'param-agence-cnoa':    'cortoba_agence_cnoa'
  };
  Object.keys(map).forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.value = getSetting(map[id], '');
  });
}

// Paramètres facturation (RIB, mentions)
function saveFactureParams(){
  var rib      = (document.getElementById('param-rib')||{value:''}).value.trim();
  var banque   = (document.getElementById('param-banque')||{value:''}).value.trim();
  var mentions = (document.getElementById('param-fa-mentions')||{value:''}).value.trim();
  Promise.all([
    saveSetting('cortoba_rib', rib),
    saveSetting('cortoba_banque', banque),
    saveSetting('cortoba_fa_mentions', mentions)
  ]).then(function(results) {
    var errors = results.filter(function(r){ return r && r.error; });
    if (errors.length > 0) {
      showToast('⚠ Sauvegarde locale OK, mais ' + errors.length + ' erreur(s) serveur', 'error');
    } else {
      showToast('✓ Coordonnées bancaires enregistrées');
    }
  });
}


// ══════════════════════════════════════════════════════════
//  DÉPENSES — version enrichie
// ══════════════════════════════════════════════════════════

// Historique libellés & fournisseurs
function getDepLibelles(){ return getLS('cortoba_dep_libelles',[]); }
function getDepFournisseurs(){ return getLS('cortoba_dep_fournisseurs',[]); }
function saveDepLibelle(v){ var a=getDepLibelles(); if(v&&a.indexOf(v)===-1){a.unshift(v);if(a.length>50)a=a.slice(0,50);setLS('cortoba_dep_libelles',a);} }
function saveDepFournisseur(v){ var a=getDepFournisseurs(); if(v&&a.indexOf(v)===-1){a.unshift(v);if(a.length>50)a=a.slice(0,50);setLS('cortoba_dep_fournisseurs',a);} }

function initDepDatalist(){
  var dl = document.getElementById('dep-libelle-list');
  if(dl) dl.innerHTML = getDepLibelles().map(function(v){return'<option value="'+v+'">'; }).join('');
  var df = document.getElementById('dep-fournisseur-list');
  if(df) df.innerHTML = getDepFournisseurs().map(function(v){return'<option value="'+v+'">'; }).join('');
}

// Lignes de montant (multi-TVA)
var _depLigneCount = 0;
function addDepenseLigne(data){
  _depLigneCount++;
  var n = _depLigneCount;
  var wrap = document.getElementById('dep-lignes-wrap'); if(!wrap) return;
  var tvaOptions = getLS('cortoba_select_extras_dep-tva',[]);
  var defTvas = ['0%','7%','13%','19%'];
  var allTvas = defTvas.concat(tvaOptions.filter(function(t){return defTvas.indexOf(t)===-1;}));
  var tvaOpts = allTvas.map(function(t){
    return '<option value="'+t+'" '+(data&&data.tva===t?'selected':'')+'>'+t+'</option>';
  }).join('');
  var div = document.createElement('div');
  div.id = 'dep-ligne-'+n;
  div.style.cssText = 'display:grid;grid-template-columns:1fr 100px 100px auto;gap:0.5rem;align-items:end;margin-bottom:0.5rem';
  div.innerHTML =
    '<div><label class="form-label" style="font-size:0.65rem">Description ligne</label>'+
      '<input class="form-input dep-l-desc" placeholder="Article / prestation…" value="'+(data&&data.desc||'')+'" oninput="calcDepTotal()" /></div>'+
    '<div><label class="form-label" style="font-size:0.65rem">Montant HT</label>'+
      '<input class="form-input dep-l-ht" type="number" step="0.001" placeholder="0.000" value="'+(data&&data.ht||'')+'" oninput="calcDepTotal()" /></div>'+
    '<div><label class="form-label" style="font-size:0.65rem">TVA</label>'+
      '<select class="form-select dep-l-tva" onchange="calcDepTotal()">'+tvaOpts+'</select></div>'+
    '<div style="padding-bottom:0.1rem"><button type="button" class="btn btn-sm" style="color:#e07070" onclick="document.getElementById(\'dep-ligne-'+n+'\').remove();calcDepTotal()">✕</button></div>';
  wrap.appendChild(div);
  calcDepTotal();
}

function calcDepTotal(){
  var totalHT=0, totalTVA=0;
  document.querySelectorAll('#dep-lignes-wrap > div').forEach(function(div){
    var htEl  = div.querySelector('.dep-l-ht');
    var tvaEl = div.querySelector('.dep-l-tva');
    if(!htEl||!tvaEl) return;
    var ht  = parseFloat(htEl.value)||0;
    var tva = parseFloat((tvaEl.value||'0').replace('%',''))||0;
    totalHT  += ht;
    totalTVA += ht * tva / 100;
  });
  var ttcBase = totalHT + totalTVA;
  var timbre  = ttcBase >= 10 ? 1.000 : 0; // 1 TND fixe — loi tunisienne
  var ttc     = ttcBase + timbre;
  function fmt(n){ return n.toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g,' ')+' TND'; }
  var htEl  = document.getElementById('dep-total-ht');   if(htEl)  htEl.textContent  = fmt(totalHT);
  var tvaEl = document.getElementById('dep-total-tva');  if(tvaEl) tvaEl.textContent = fmt(totalTVA);
  var tbEl  = document.getElementById('dep-timbre');     if(tbEl)  tbEl.textContent  = fmt(timbre);
  var ttcEl = document.getElementById('dep-total-ttc');  if(ttcEl) ttcEl.textContent = fmt(ttc);
}

// ── Dépense récurrente : helpers UI ──
function toggleRecurrenceSection() {
  var toggle = document.getElementById('dep-recurrent-toggle');
  var section = document.getElementById('dep-recurrence-section');
  if (!toggle || !section) return;
  section.style.display = toggle.checked ? '' : 'none';
}
function toggleRecurrenceEndDate() {
  var cb  = document.getElementById('dep-rec-no-end');
  var inp = document.getElementById('dep-rec-end-date');
  if (!cb || !inp) return;
  inp.disabled = cb.checked;
  if (cb.checked) inp.value = '';
}

// Ajoute une durée (en jours/semaines) à une date YYYY-MM-DD et renvoie YYYY-MM-DD
function advanceDateClient(dateStr, frequency) {
  var d = new Date(dateStr);
  if (isNaN(d)) d = new Date();
  switch (frequency) {
    case 'weekly':     d.setDate(d.getDate() + 7); break;
    case 'monthly':    d.setMonth(d.getMonth() + 1); break;
    case 'quarterly':  d.setMonth(d.getMonth() + 3); break;
    case 'semiannual': d.setMonth(d.getMonth() + 6); break;
    case 'yearly':     d.setFullYear(d.getFullYear() + 1); break;
    default:           d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().split('T')[0];
}

// Etat : si on est en train de valider depuis une notification
var _depFromTemplateId = null;

function saveDepense(){
  var cat      = (document.getElementById('dep-categorie')||{value:''}).value;
  var libelle  = (document.getElementById('dep-libelle').value||'').trim();
  var date     = document.getElementById('dep-date').value;
  var ref      = (document.getElementById('dep-reference').value||'').trim();
  var fourn    = (document.getElementById('dep-fournisseur').value||'').trim();
  var codeTva  = (document.getElementById('dep-code-tva').value||'').trim();

  if (!cat) { alert('Veuillez choisir une catégorie.'); return; }
  if (!libelle) { alert('Le libellé est obligatoire.'); return; }

  // Collecter les lignes
  var lignes = [];
  var totalHT=0, totalTVA=0;
  var firstVatRate = 19;
  document.querySelectorAll('#dep-lignes-wrap > div').forEach(function(div, idx){
    var htEl  = div.querySelector('.dep-l-ht');
    var tvaEl = div.querySelector('.dep-l-tva');
    var dEl   = div.querySelector('.dep-l-desc');
    if(!htEl) return;
    var ht  = parseFloat(htEl.value)||0;
    var tva = parseFloat((tvaEl?tvaEl.value:'0').replace('%',''))||0;
    if (idx === 0) firstVatRate = tva;
    totalHT  += ht;
    totalTVA += ht * tva/100;
    lignes.push({desc:(dEl?dEl.value.trim():''), ht:ht, tva:tva});
  });
  var ttcBase = totalHT + totalTVA;
  var timbre  = ttcBase >= 10 ? 1.000 : 0; // 1 TND fixe — loi tunisienne
  var ttc     = ttcBase + timbre;

  if (lignes.length === 0 || totalHT === 0) { alert('Ajoutez au moins un montant.'); return; }

  // Sauvegarder dans l'historique
  saveDepLibelle(libelle);
  if (fourn) saveDepFournisseur(fourn);

  // ── Lecture des champs de récurrence ──
  var recToggle = document.getElementById('dep-recurrent-toggle');
  var isRecurrent = recToggle && recToggle.checked;

  var today   = new Date().toISOString().split('T')[0];
  var depDate = date || today;
  // On insère une dépense réelle uniquement si la date est <= aujourd'hui
  var insertImmediateExpense = (!isRecurrent) || (depDate <= today);

  // Promesse principale
  var p = Promise.resolve();

  // ── Étape A : insérer la dépense immédiate (si applicable) ──
  if (insertImmediateExpense) {
    var body = {
      description: libelle, montant: ttc, dateDep: depDate,
      categorie: cat, reference: ref||null,
      fournisseur: fourn||null, codeTvaFournisseur: codeTva||null,
      montantHt: totalHT, montantTva: totalTVA, timbre: timbre,
      montantTtc: ttc, lignesJson: lignes,
      templateId: _depFromTemplateId || null
    };
    // Si dépense de type salaire → lier au membre + snapshot fiche de paie
    if (cat === 'Salaires & charges' && _currentSalaryMember) {
      var moisInp = (document.getElementById('dep-paie-mois')||{value:''}).value;
      body.employeId    = _currentSalaryMember.id;
      body.paieMois     = moisInp || null;
      body.paieSnapshot = JSON.stringify(_currentFichePaie || computeFichePaie(_currentSalaryMember, {}));
    }
    var method = 'POST';
    var url    = 'api/data.php?table=depenses';
    if (_editingDepenseId) {
      method = 'PUT';
      url    = 'api/data.php?table=depenses&id=' + _editingDepenseId;
      body.id = _editingDepenseId;
    }
    p = p.then(function(){ return apiFetch(url, {method:method, body:body}); });
  }

  // ── Étape B : si récurrent ET pas une édition → créer/mettre à jour le template ──
  if (isRecurrent && !_editingDepenseId && !_depFromTemplateId) {
    var freq       = (document.getElementById('dep-rec-frequency')||{value:'monthly'}).value;
    var amountType = (document.getElementById('dep-rec-amount-type')||{value:'fixed'}).value;
    var notifyN    = parseInt((document.getElementById('dep-rec-notify-n')||{value:5}).value, 10) || 5;
    var notifyUnit = (document.getElementById('dep-rec-notify-unit')||{value:'days'}).value;
    var noEnd      = document.getElementById('dep-rec-no-end');
    var endDateInp = document.getElementById('dep-rec-end-date');
    var endDate    = (noEnd && noEnd.checked) ? null : (endDateInp ? endDateInp.value : null);

    var notifyDays = notifyUnit === 'weeks' ? notifyN * 7 : notifyN;

    // Prochaine échéance = date saisie + une période
    var nextDue = advanceDateClient(depDate, freq);

    var tplBody = {
      label:              libelle,
      categorie:          cat,
      fournisseur:        fourn || null,
      code_tva:           codeTva || null,
      frequency:          freq,
      amount_type:        amountType,
      base_amount_ht:     totalHT,
      vat_rate:           firstVatRate,
      stamp_duty:         timbre,
      base_amount_ttc:    ttc,
      lignes:             lignes,
      next_due_date:      nextDue,
      notify_days_before: notifyDays,
      end_date:           endDate || null
    };
    p = p.then(function(){ return apiFetch('api/depenses_templates.php', {method:'POST', body:tplBody}); });
  }

  // ── Étape C : si validation depuis une notification → avancer le template ──
  if (_depFromTemplateId) {
    var idAdv = _depFromTemplateId;
    p = p.then(function(){
      return apiFetch('api/depenses_templates.php?action=advance&id=' + encodeURIComponent(idAdv), {method:'POST', body:{}});
    });
  }

  // ── Finalisation ──
  p.then(function(){
    return loadData();
  })
  .then(function(){
    if (typeof renderDepenses === 'function') renderDepenses();
    refreshNotifBadge(); // rafraîchir la cloche
    closeModal('modal-depense');
    resetDepenseForm();
    showToast(isRecurrent ? 'Dépense + modèle récurrent enregistrés ✓' : 'Dépense enregistrée ✓');
  })
  .catch(function(e){ alert(e.message||'Erreur'); });
}

function resetDepenseForm(){
  _depLigneCount = 0;
  _editingDepenseId = null;
  _depFromTemplateId = null;
  // Réinitialiser la section récurrence
  var recToggle = document.getElementById('dep-recurrent-toggle');
  if (recToggle) recToggle.checked = false;
  var recSec = document.getElementById('dep-recurrence-section');
  if (recSec) recSec.style.display = 'none';
  var recFreq = document.getElementById('dep-rec-frequency'); if (recFreq) recFreq.value = 'monthly';
  var recAmt  = document.getElementById('dep-rec-amount-type'); if (recAmt) recAmt.value = 'fixed';
  var recN    = document.getElementById('dep-rec-notify-n'); if (recN) recN.value = '5';
  var recUnit = document.getElementById('dep-rec-notify-unit'); if (recUnit) recUnit.value = 'days';
  var recEnd  = document.getElementById('dep-rec-end-date'); if (recEnd) recEnd.value = '';
  var recNoEnd= document.getElementById('dep-rec-no-end'); if (recNoEnd) recNoEnd.checked = true;
  var title = document.querySelector('#modal-depense .modal-title');
  if (title) title.textContent = 'Ajouter une dépense';
  var saveBtn = document.querySelector('#modal-depense .modal-footer .btn-primary');
  if (saveBtn) saveBtn.textContent = 'Enregistrer →';
  ['dep-libelle','dep-reference','dep-fournisseur','dep-code-tva'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  var depDateEl = document.getElementById('dep-date');
  if(depDateEl) depDateEl.value = new Date().toISOString().split('T')[0];
  var cat=document.getElementById('dep-categorie'); if(cat) cat.value='';
  var wrap=document.getElementById('dep-lignes-wrap'); if(wrap) wrap.innerHTML='';
  calcDepTotal();
  initDepDatalist();
  // Ajouter une ligne par défaut
  addDepenseLigne();
}

// ── Scan facture IA ──
var _scanImageBase64 = null;
var _scanMimeType    = 'image/jpeg';

function handleScanFile(file){
  if (!file) return;
  // Compresser l'image via canvas avant d'envoyer (max 800px, qualité 0.7)
  var mimeType = file.type || 'image/jpeg';
  _scanMimeType = mimeType;

  if (mimeType.indexOf('image') !== -1) {
    // Compression via canvas
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function(){
      var maxW = 1200, maxH = 1200;
      var w = img.width, h = img.height;
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; }
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      var dataUrl = canvas.toDataURL('image/jpeg', 0.75);
      _scanImageBase64 = dataUrl.split(',')[1];
      _scanMimeType    = 'image/jpeg';
      document.getElementById('scan-file-input').dataset.mediatype = 'image/jpeg';
      document.getElementById('scan-preview-img').src = dataUrl;
      document.getElementById('scan-preview-wrap').style.display = 'block';
      document.getElementById('scan-zone').style.display = 'none';
      document.getElementById('scan-result-wrap').style.display = 'none';
      document.getElementById('scan-import-btn').style.display = 'none';
      document.getElementById('scan-loader').style.display = 'none';
      URL.revokeObjectURL(url);
    };
    img.src = url;
  } else {
    // PDF ou autre : lire directement
    var reader = new FileReader();
    reader.onload = function(e){
      _scanImageBase64 = e.target.result.split(',')[1];
      document.getElementById('scan-file-input').dataset.mediatype = mimeType;
      document.getElementById('scan-preview-img').src = '';
      document.getElementById('scan-preview-wrap').style.display = 'block';
      document.getElementById('scan-zone').style.display = 'none';
      document.getElementById('scan-result-wrap').style.display = 'none';
      document.getElementById('scan-import-btn').style.display = 'none';
      document.getElementById('scan-loader').style.display = 'none';
    };
    reader.readAsDataURL(file);
  }
}

function handleScanDrop(e){
  var file = e.dataTransfer.files[0];
  if (file) handleScanFile(file);
}

// Clé API Gemini (AI Studio) — même clé que le chatbot du site principal
// Scan factures via proxy PHP (clé sécurisée côté serveur)
function analyserFacture(){
  if (!_scanImageBase64) return;
  var btn = document.getElementById('scan-analyse-btn');
  var loader = document.getElementById('scan-loader');
  var resultWrap = document.getElementById('scan-result-wrap');
  btn.disabled = true; btn.textContent = 'Analyse…';
  loader.style.display = 'block';
  resultWrap.style.display = 'none';

  var mediaType = document.getElementById('scan-file-input').dataset.mediatype || 'image/jpeg';
  var proxyUrl  = API_BASE + 'facture_proxy.php';

  fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: _scanImageBase64, mimeType: mediaType })
  })
  .then(function(r){ return r.json(); })
  .then(function(j){
    loader.style.display = 'none';
    btn.disabled = false; btn.textContent = '✨ Analyser avec l\'IA';
    if (j.error) { alert('Erreur IA : ' + j.error); return; }
    document.getElementById('scan-fournisseur').value  = j.fournisseur||'';
    document.getElementById('scan-reference').value    = j.reference||'';
    document.getElementById('scan-date').value         = j.date||'';
    document.getElementById('scan-libelle').value      = j.libelle||'';
    document.getElementById('scan-ht').value           = j.montant_ht||'';
    document.getElementById('scan-tva-val').value      = j.montant_tva||'';
    document.getElementById('scan-ttc').value          = j.montant_ttc||'';
    document.getElementById('scan-code-tva').value     = j.code_tva_fournisseur||'';
    document.getElementById('scan-file-input').dataset.tauxTva   = j.taux_tva||0;
    document.getElementById('scan-file-input').dataset.lignesJson = JSON.stringify(j.lignes||[]);
    var catSel = document.getElementById('scan-categorie');
    if (catSel && j.categorie) catSel.value = j.categorie;
    var msgEl = document.getElementById('scan-ia-msg');
    if (msgEl) msgEl.textContent = j.message ? '⚠ '+j.message : '✓ Extraction réussie — vérifiez et corrigez si nécessaire.';
    resultWrap.style.display = 'block';
    document.getElementById('scan-import-btn').style.display = 'inline-flex';
  })
  .catch(function(e){
    loader.style.display = 'none';
    btn.disabled = false; btn.textContent = '✨ Analyser avec l\'IA';
    alert('Erreur réseau : ' + e.message + '\nVérifiez que facture_proxy.php est uploadé dans /cortoba_plateforme/');
  });
}

function importerDepuisScan(){
  // Pré-remplir la modal dépense depuis le scan
  closeModal('modal-scan-facture');
  openModal('modal-depense');
  setTimeout(function(){
    var cat = document.getElementById('scan-categorie');
    var depCat = document.getElementById('dep-categorie');
    if (cat && depCat) depCat.value = cat.value;
    var fourn = document.getElementById('scan-fournisseur');
    var depFourn = document.getElementById('dep-fournisseur');
    if (fourn && depFourn) depFourn.value = fourn.value;
    var ref = document.getElementById('scan-reference');
    var depRef = document.getElementById('dep-reference');
    if (ref && depRef) depRef.value = ref.value;
    var date = document.getElementById('scan-date');
    var depDate = document.getElementById('dep-date');
    if (date && depDate) depDate.value = date.value;
    var lib = document.getElementById('scan-libelle');
    var depLib = document.getElementById('dep-libelle');
    if (lib && depLib) depLib.value = lib.value;
    var codeTva = document.getElementById('scan-code-tva');
    var depCodTva = document.getElementById('dep-code-tva');
    if (codeTva && depCodTva) depCodTva.value = codeTva.value;
    // Ligne de montant
    var ht = parseFloat((document.getElementById('scan-ht')||{value:'0'}).value)||0;
    var tauxTva = parseFloat(document.getElementById('scan-file-input').dataset.tauxTva||'0')||0;
    var pct = tauxTva > 0 ? tauxTva+'%' : '0%';
    // Vider les lignes existantes et en créer une
    var wrap = document.getElementById('dep-lignes-wrap');
    if (wrap) wrap.innerHTML=''; _depLigneCount=0;
    addDepenseLigne({desc: (document.getElementById('scan-libelle')||{value:''}).value, ht: ht, tva: pct});
  }, 200);
  resetScanFacture();
}

function resetScanFacture(){
  _scanImageBase64 = null;
  var img = document.getElementById('scan-preview-img'); if(img) img.src='';
  var pw = document.getElementById('scan-preview-wrap'); if(pw) pw.style.display='none';
  var sz = document.getElementById('scan-zone'); if(sz) sz.style.display='block';
  var rw = document.getElementById('scan-result-wrap'); if(rw) rw.style.display='none';
  var ld = document.getElementById('scan-loader'); if(ld) ld.style.display='none';
  var ib = document.getElementById('scan-import-btn'); if(ib) ib.style.display='none';
  var fi = document.getElementById('scan-file-input'); if(fi) fi.value='';
}

// ══════════════════════════════════════════════════════════
//  PARAMÈTRES — Missions
// ══════════════════════════════════════════════════════════
function renderParametresMissions(){
  var wrap = document.getElementById('param-missions-wrap'); if(!wrap) return;
  var missions = getMissions();
  var cats = getMissionCategories();
  var html = '';

  cats.forEach(function(cat){
    var catMissions = missions.filter(function(m){ return m.cat === cat.id; });
    html += '<div style="margin-bottom:1.2rem">';
    html += '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem">';
    html += '<span style="font-size:0.75rem;font-weight:600;color:var(--accent);letter-spacing:0.08em;text-transform:uppercase">' + cat.label + '</span>';
    html += '<span style="font-size:0.68rem;color:var(--text-3)">(' + catMissions.length + ')</span>';
    html += '</div>';
    if (catMissions.length > 0) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:0.35rem">';
      catMissions.forEach(function(m){
        var isDefault = m.id && m.id.indexOf('mc_') === -1;
        html += '<span style="display:inline-flex;align-items:center;gap:0.3rem;padding:0.2rem 0.55rem;border-radius:4px;font-size:0.74rem;background:var(--bg-3);border:1px solid var(--border);color:' + (isDefault ? 'var(--text-2)' : 'var(--accent)') + '">';
        html += (m.nom||'');
        html += '<button type="button" style="background:none;border:none;cursor:pointer;color:#e07070;font-size:0.8rem;line-height:1;padding:0 0 0 3px" onclick="removeParamMission(\'' + m.id + '\')" title="Supprimer">✕</button>';
        html += '</span>';
      });
      html += '</div>';
    } else {
      html += '<div style="font-size:0.75rem;color:var(--text-3);font-style:italic">Aucune mission dans cette catégorie</div>';
    }
    html += '</div>';
  });

  // Orphelins
  var orphans = missions.filter(function(m){ return !m.cat || !cats.find(function(c){ return c.id===m.cat; }); });
  if (orphans.length > 0) {
    html += '<div style="margin-bottom:1rem"><div style="font-size:0.75rem;font-weight:600;color:var(--text-3);margin-bottom:0.5rem">Non catégorisées</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:0.35rem">';
    orphans.forEach(function(m){
      html += '<span style="display:inline-flex;align-items:center;gap:0.3rem;padding:0.2rem 0.55rem;border-radius:4px;font-size:0.74rem;background:var(--bg-3);border:1px solid var(--border);color:var(--text-3)">' + (m.nom||'');
      html += '<button type="button" style="background:none;border:none;cursor:pointer;color:#e07070;font-size:0.8rem" onclick="removeParamMission(\'' + m.id + '\')">✕</button></span>';
    });
    html += '</div></div>';
  }

  wrap.innerHTML = html;

  // Remplir le select des catégories
  var catSel = document.getElementById('param-mission-cat');
  if (catSel && catSel.options.length <= 1) {
    cats.forEach(function(c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.label;
      catSel.appendChild(opt);
    });
  }
}

function addParamMission(){
  var catSel = document.getElementById('param-mission-cat');
  var nom = (document.getElementById('param-mission-nom').value||'').trim();
  var cat = catSel ? catSel.value : '';
  if (!nom) { alert('Saisissez le nom de la mission.'); return; }
  if (!cat) { alert('Choisissez une catégorie.'); return; }
  var missions = getMissions();
  var newM = { id:'mc_'+Date.now(), cat:cat, nom:nom };
  missions.push(newM);
  saveSetting('cortoba_missions', missions);
  document.getElementById('param-mission-nom').value = '';
  renderParametresMissions();
  showToast('Mission ajoutée');
}

function removeParamMission(id){
  if (!confirm('Supprimer cette mission ?')) return;
  var missions = getMissions().filter(function(m){ return m.id !== id; });
  saveSetting('cortoba_missions', missions);
  renderParametresMissions();
  showToast('Mission supprimée');
}

// ── NAS config (ancien — remplacé par version complète plus bas) ──
// saveNasConfig() est défini à la section NAS complète (~ligne 4598)
function getNasUrl(){
  return getSetting('cortoba_nas_cloud', 'https://www.myqnapcloud.com/smartshare/79e3hh7i5m13n741tx673995_d1731k4140o82pqur26146zbb4761i64');
}

// ── Modifier dépense ──
var _editingDepenseId = null;

function openEditDepense(id) {
  var d = getDepenses().find(function(x){ return x.id===id; });
  if (!d) return;
  resetDepenseForm();
  _editingDepenseId = id;

  var title = document.querySelector('#modal-depense .modal-title');
  if (title) title.textContent = 'Modifier la dépense';
  var saveBtn = document.querySelector('#modal-depense .modal-footer .btn-primary');
  if (saveBtn) saveBtn.textContent = 'Enregistrer les modifications →';

  var catEl = document.getElementById('dep-categorie');
  if (catEl) { catEl.value = d.cat || d.categorie || ''; onDepCategorieChange(); }
  // Si salaire : restaurer le bénéficiaire + mois
  if ((d.categorie || d.cat) === 'Salaires & charges') {
    var benefSel = document.getElementById('dep-beneficiaire');
    var moisInp  = document.getElementById('dep-paie-mois');
    if (d.employeId || d.employe_id) {
      if (benefSel) benefSel.value = d.employeId || d.employe_id;
    }
    if (moisInp && (d.paieMois || d.paie_mois)) moisInp.value = d.paieMois || d.paie_mois;
    if (d.paieSnapshot || d.paie_snapshot) {
      try { _currentFichePaie = (typeof (d.paieSnapshot||d.paie_snapshot) === 'string') ? JSON.parse(d.paieSnapshot||d.paie_snapshot) : (d.paieSnapshot||d.paie_snapshot); } catch(e){}
    }
    var mm = (getMembres()||[]).find(function(x){ return x.id === (d.employeId||d.employe_id); });
    if (mm) {
      _currentSalaryMember = mm;
      var pb = document.getElementById('dep-print-fiche-btn'); if (pb) pb.style.display = '';
    }
  }
  var libEl = document.getElementById('dep-libelle');
  if (libEl) libEl.value = d.libelle || d.description || '';
  var dateEl = document.getElementById('dep-date');
  if (dateEl) dateEl.value = d.date || d.dateDep || '';
  var refEl = document.getElementById('dep-reference');
  if (refEl) refEl.value = d.reference || '';
  var fournEl = document.getElementById('dep-fournisseur');
  if (fournEl) fournEl.value = d.fournisseur || '';
  var codeTvaEl = document.getElementById('dep-code-tva');
  if (codeTvaEl) codeTvaEl.value = d.codeTvaFournisseur || d.code_tva_fournisseur || '';

  var wrap = document.getElementById('dep-lignes-wrap');
  if (wrap) wrap.innerHTML = '';
  _depLigneCount = 0;
  if (d.lignes && d.lignes.length) {
    d.lignes.forEach(function(l){
      addDepenseLigne({desc:l.desc||l.description||'', ht:l.ht||l.montant_ht||0, tva:(l.tva||l.taux_tva||0)+'%'});
    });
  } else {
    var ht  = d.montantHT || d.montant_ht || d.montant || 0;
    var tva = (d.montantTVA && ht) ? Math.round(d.montantTVA/ht*100) : 0;
    addDepenseLigne({desc:d.libelle||d.description||'', ht:ht, tva:tva+'%'});
  }
  document.getElementById('modal-depense').classList.add('open');
}

// ── Render all ──
function renderAll(){ renderClients(); renderDevisList(); renderProjets(); renderFactures(); renderDepenses(); renderDemandes(); populateProjetSelect(); renderCharts(); renderFiscalAlerts(); }

function renderDepenses(){
  var tb=document.getElementById('depenses-tbody'); if(!tb) return;
  var list=getDepenses();
  tb.innerHTML=list.length===0?'<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:2rem">Aucune dépense.</td></tr>'
    :list.map(function(d){
      var ttc = d.montantTTC||d.montant||0;
      return'<tr>'+
        '<td>'+fmtDate(d.date||d.dateDep)+'</td>'+
        '<td style="font-weight:500">'+(d.libelle||d.description||'—')+'</td>'+
        '<td>'+(d.fournisseur?'<span style="font-size:0.78rem;color:var(--text-2)">'+d.fournisseur+'</span>':'—')+'</td>'+
        '<td><span class="badge badge-blue" style="font-size:0.7rem">'+(d.cat||d.categorie||'—')+'</span></td>'+
        '<td class="inline-val">'+fmtMontant(ttc)+'</td>'+
        '<td onclick="event.stopPropagation()" style="white-space:nowrap">'+
          '<button class="btn btn-sm" onclick="openEditDepense(\''+d.id+'\')" style="color:var(--accent);margin-right:3px" title="Modifier">✎</button>'+
          '<button class="btn btn-sm" onclick="deleteRow(\'depense\',\''+d.id+'\')" style="color:#e07070" title="Supprimer">✕</button>'+
        '</td>'+
      '</tr>';
    }).join('');
}

// ══════════════════════════════════════════════════════════
//  FONCTIONS UTILITAIRES & EXPORT
// ══════════════════════════════════════════════════════════

// ── Notifications ──
var _dueTemplatesCache = [];

var _personalNotifCache = [];

function refreshNotifBadge(){
  // Compte : notifications personnelles non lues + (pour les admins) factures en retard + devis en attente + dépenses récurrentes due
  var factures = getFactures();
  var now = new Date();
  var retards = factures.filter(function(f){
    if (f.statut === 'Payée') return false;
    var ech = new Date(f.echeance||f.dateEcheance||f.date_echeance||'');
    return !isNaN(ech) && ech < now;
  });
  var devisAtt = getDevis().filter(function(d){ return d.statut === 'En attente'; });

  // Récupérer en parallèle : notifications personnelles + dépenses dues
  var pNotifs = apiFetch('api/notifications.php?action=list&limit=30')
    .then(function(r){ _personalNotifCache = (r && r.data) ? r.data : (r || []); return _personalNotifCache; })
    .catch(function(){ _personalNotifCache = []; return []; });
  var pDue = apiFetch('api/depenses_templates.php?action=due')
    .then(function(r){ _dueTemplatesCache = (r && r.data) ? r.data : (r || []); return _dueTemplatesCache; })
    .catch(function(){ _dueTemplatesCache = []; return []; });

  Promise.all([pNotifs, pDue]).then(function(){
    var unread = _personalNotifCache.filter(function(n){ return !parseInt(n.is_read||0,10); }).length;
    var chatUnread = window.__chatUnread || 0;
    var total = unread + retards.length + devisAtt.length + _dueTemplatesCache.length + chatUnread;
    var badge = document.getElementById('notif-badge');
    if (badge) {
      badge.textContent = String(total);
      badge.style.display = total > 0 ? '' : 'none';
    }
  });
}

// Écouter les mises à jour du compteur chat pour rafraîchir le badge cloche
if (!window.__chatBellWired) {
  window.__chatBellWired = true;
  document.addEventListener('chat-unread', function() {
    refreshNotifBadge();
  });
}

function _fmtTndShort(n){
  n = parseFloat(n)||0;
  return n.toFixed(3).replace('.',',') + ' TND';
}
function _fmtDateFR(d){
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('fr-FR'); } catch(e){ return String(d); }
}

function openDepenseFromTemplate(templateId){
  // Récupérer le template
  apiFetch('api/depenses_templates.php?id=' + encodeURIComponent(templateId))
    .then(function(r){
      var tpl = (r && r.data) ? r.data : r;
      if (!tpl || !tpl.id) { alert('Template introuvable'); return; }
      resetDepenseForm();
      _depFromTemplateId = tpl.id;
      // Pré-remplissage champs principaux
      var byId = function(id){ return document.getElementById(id); };
      if (byId('dep-libelle'))     byId('dep-libelle').value     = tpl.label || '';
      if (byId('dep-fournisseur')) byId('dep-fournisseur').value = tpl.fournisseur || '';
      if (byId('dep-code-tva'))    byId('dep-code-tva').value    = tpl.code_tva || '';
      if (byId('dep-categorie'))   byId('dep-categorie').value   = tpl.categorie || '';
      if (byId('dep-date'))        byId('dep-date').value        = tpl.next_due_date || new Date().toISOString().split('T')[0];

      // Lignes
      var wrap = byId('dep-lignes-wrap'); if (wrap) wrap.innerHTML = '';
      _depLigneCount = 0;
      var lignes = [];
      if (tpl.lignes_json) {
        try { lignes = (typeof tpl.lignes_json === 'string') ? JSON.parse(tpl.lignes_json) : tpl.lignes_json; }
        catch(e){ lignes = []; }
      }
      if (lignes && lignes.length && typeof addDepenseLigne === 'function') {
        lignes.forEach(function(l){ addDepenseLigne(l); });
      } else if (typeof addDepenseLigne === 'function') {
        addDepenseLigne({ desc: tpl.label||'', ht: tpl.base_amount_ht||0, tva: tpl.vat_rate||19 });
      }
      if (typeof calcDepTotal === 'function') calcDepTotal();

      // Titre modale + badge type (fixe/estimé)
      var title = document.querySelector('#modal-depense .modal-title');
      if (title) {
        title.textContent = (tpl.amount_type === 'estimated')
          ? 'Dépense récurrente — montant à confirmer'
          : 'Dépense récurrente — validation';
      }

      // Pour un template on n'affiche pas le switch récurrence (déjà un template)
      var recToggle = byId('dep-recurrent-toggle');
      if (recToggle) recToggle.checked = false;
      var recSec = byId('dep-recurrence-section');
      if (recSec) recSec.style.display = 'none';

      openModal('modal-depense');
    })
    .catch(function(e){ alert('Erreur : ' + (e.message||'Impossible de charger le template')); });
}

function showNotifications(){
  var factures = getFactures();
  var now = new Date();
  var retards = factures.filter(function(f){
    if (f.statut === 'Payée') return false;
    var ech = new Date(f.echeance||f.dateEcheance||f.date_echeance||'');
    return !isNaN(ech) && ech < now;
  });
  var devis = getDevis().filter(function(d){ return d.statut === 'En attente'; });

  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);z-index:9999;display:flex;align-items:flex-start;justify-content:flex-end;padding:4rem 1.5rem 0';
  var box = document.createElement('div');
  box.style.cssText = 'background:#1b1b1f;border:1px solid var(--border);border-radius:10px;padding:1.2rem 1.5rem;min-width:360px;max-width:460px;max-height:80vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.85)';
  var header = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">'
    + '<div style="font-size:0.72rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-3)">Notifications</div>'
    + '<div style="display:flex;gap:0.5rem;align-items:center">'
    +   '<button id="notif-mark-all" style="background:none;border:none;color:var(--accent);font-size:0.72rem;cursor:pointer;text-decoration:underline">Tout marquer lu</button>'
    +   '<button id="notif-close" style="background:none;border:none;color:var(--text-3);font-size:1.1rem;cursor:pointer;line-height:1">\u2715</button>'
    + '</div></div>';
  box.innerHTML = header;

  // Parallel : personal notifications + dépenses dues (dropdown = 5 plus récentes hors archivées)
  var pNotifs = apiFetch('api/notifications.php?action=list&status=inbox&sort=unread_first&limit=5')
    .then(function(r){ return (r && r.data) ? r.data : (r || []); })
    .catch(function(){ return []; });
  var pDue = apiFetch('api/depenses_templates.php?action=due')
    .then(function(r){ return (r && r.data) ? r.data : (r || []); })
    .catch(function(){ return []; });

  Promise.all([pNotifs, pDue]).then(function(results){
    var notifs  = results[0] || [];
    var dueList = results[1] || [];
    _personalNotifCache = notifs;
    _dueTemplatesCache  = dueList;

    var hasAny = notifs.length || retards.length || devis.length || dueList.length;

    // ── Notifications personnelles (priorité) ──
    if (notifs.length) {
      var sectionTitle = document.createElement('div');
      sectionTitle.style.cssText = 'font-size:0.65rem;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-3);margin:0.4rem 0 0.3rem';
      sectionTitle.textContent = 'Personnelles';
      box.appendChild(sectionTitle);

      notifs.forEach(function(n){
        var entry = document.createElement('div');
        var unread = !parseInt(n.is_read||0, 10);
        entry.style.cssText = 'font-size:0.82rem;padding:0.6rem 0.6rem;border-bottom:1px solid var(--border);cursor:pointer;border-radius:4px;margin:0 -0.3rem;transition:background 0.15s;color:var(--text-1);'
          + (unread ? 'background:rgba(200,169,110,0.08);border-left:2px solid var(--accent)' : '');
        entry.onmouseover = function(){ entry.style.background = unread ? 'rgba(200,169,110,0.1)' : 'rgba(255,255,255,0.04)'; };
        entry.onmouseout  = function(){ entry.style.background = unread ? 'rgba(200,169,110,0.06)' : 'transparent'; };
        var when = n.cree_at ? _cgRelativeTime(n.cree_at) : '';
        entry.innerHTML =
            '<div style="font-weight:' + (unread ? '600' : '400') + ';margin-bottom:0.2rem">' + _cgEscape(n.title) + '</div>'
          + (n.message ? '<div style="color:var(--text-3);font-size:0.74rem;white-space:pre-wrap">' + _cgEscape(n.message) + '</div>' : '')
          + '<div style="color:var(--text-3);font-size:0.68rem;margin-top:0.25rem">' + when + (n.cree_par ? ' · ' + _cgEscape(n.cree_par) : '') + '</div>';
        entry.addEventListener('click', function(){
          // Marquer comme lue + naviguer
          apiFetch('api/notifications.php?action=mark_read&id=' + encodeURIComponent(n.id), { method:'POST', body:{} })
            .catch(function(){});
          ov.remove();
          if (n.link_page) setTimeout(function(){ showPage(n.link_page); }, 50);
          setTimeout(refreshNotifBadge, 300);
        });
        box.appendChild(entry);
      });
    }

    // ── Alertes business (admin) ──
    if (retards.length || devis.length || dueList.length) {
      var sectionBiz = document.createElement('div');
      sectionBiz.style.cssText = 'font-size:0.65rem;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-3);margin:0.8rem 0 0.3rem';
      sectionBiz.textContent = 'Activité';
      box.appendChild(sectionBiz);
    }

    if (retards.length) {
      var li = document.createElement('div');
      li.style.cssText = 'font-size:0.85rem;padding:0.55rem 0;border-bottom:1px solid var(--border);cursor:pointer';
      li.innerHTML = '\ud83d\udd34 ' + retards.length + ' facture(s) impayée(s) en retard';
      li.addEventListener('click', function(){ showPage('facturation'); ov.remove(); });
      box.appendChild(li);
    }
    if (devis.length) {
      var ld = document.createElement('div');
      ld.style.cssText = 'font-size:0.85rem;padding:0.55rem 0;border-bottom:1px solid var(--border);cursor:pointer';
      ld.innerHTML = '\ud83d\udfe1 ' + devis.length + ' devis en attente de réponse';
      ld.addEventListener('click', function(){ showPage('devis'); ov.remove(); });
      box.appendChild(ld);
    }
    dueList.forEach(function(tpl){
      var entry = document.createElement('div');
      entry.style.cssText = 'font-size:0.82rem;padding:0.6rem 0.5rem;border-bottom:1px solid var(--border);cursor:pointer;border-radius:4px;margin:0 -0.5rem;transition:background 0.15s';
      entry.onmouseover = function(){ entry.style.background = 'rgba(255,255,255,0.04)'; };
      entry.onmouseout  = function(){ entry.style.background = 'transparent'; };
      var icon = tpl.amount_type === 'estimated' ? '📊' : '🔄';
      entry.innerHTML =
          '<div style="display:flex;justify-content:space-between;gap:0.5rem">'
        +   '<strong style="color:var(--accent)">'+icon+' '+_cgEscape(tpl.label||'—')+'</strong>'
        +   '<span style="font-family:var(--font-mono);font-size:0.75rem">'+_fmtTndShort(tpl.base_amount_ttc)+'</span>'
        + '</div>'
        + '<div style="color:var(--text-3);font-size:0.72rem;margin-top:0.2rem">'
        +   'Échéance : '+_fmtDateFR(tpl.next_due_date)
        +   (tpl.amount_type === 'estimated' ? ' — <em>montant à confirmer</em>' : '')
        + '</div>';
      entry.addEventListener('click', function(){
        ov.remove();
        openDepenseFromTemplate(tpl.id);
      });
      box.appendChild(entry);
    });

    if (!hasAny) {
      var empty = document.createElement('div');
      empty.style.cssText = 'font-size:0.85rem;padding:0.5rem 0;color:var(--text-3)';
      empty.innerHTML = '\u2705 Aucune notification en attente';
      box.appendChild(empty);
    }

    // ── Footer : bouton "Afficher tout" ──
    var footer = document.createElement('div');
    footer.style.cssText = 'margin-top:0.8rem;padding-top:0.7rem;border-top:1px solid var(--border);text-align:center';
    var btnAll = document.createElement('button');
    btnAll.type = 'button';
    btnAll.style.cssText = 'background:rgba(200,169,110,0.1);border:1px solid var(--accent);color:var(--accent);padding:0.5rem 1rem;border-radius:6px;font-size:0.72rem;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer;width:100%;transition:background 0.15s';
    btnAll.textContent = 'Afficher toutes les notifications';
    btnAll.onmouseover = function(){ btnAll.style.background = 'rgba(200,169,110,0.22)'; };
    btnAll.onmouseout  = function(){ btnAll.style.background = 'rgba(200,169,110,0.1)'; };
    btnAll.addEventListener('click', function(){
      ov.remove();
      showPage('notifications');
    });
    footer.appendChild(btnAll);
    box.appendChild(footer);
  });

  box.querySelector('#notif-close').addEventListener('click', function(){ ov.remove(); });
  box.querySelector('#notif-mark-all').addEventListener('click', function(){
    apiFetch('api/notifications.php?action=mark_all_read', { method:'POST', body:{} })
      .then(function(){ ov.remove(); refreshNotifBadge(); })
      .catch(function(e){ alert('Erreur : ' + e.message); });
  });
  ov.appendChild(box);
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
  document.body.appendChild(ov);
}

// Helper : format relatif (il y a X min / h / jours)
function _cgRelativeTime(iso){
  try {
    var d = new Date(iso.replace(' ', 'T'));
    var diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60)     return 'à l\'instant';
    if (diff < 3600)   return 'il y a ' + Math.floor(diff/60) + ' min';
    if (diff < 86400)  return 'il y a ' + Math.floor(diff/3600) + ' h';
    if (diff < 604800) return 'il y a ' + Math.floor(diff/86400) + ' j';
    return d.toLocaleDateString('fr-FR');
  } catch(e) { return ''; }
}

// ── Changer mot de passe ──
function changePassword(){
  var newPwd   = (document.querySelector('#page-parametres input[type="password"]')||{value:''}).value;
  var confirm2 = (document.querySelectorAll('#page-parametres input[type="password"]')[1]||{value:''}).value;
  if (!newPwd)  { alert('Saisissez un nouveau mot de passe.'); return; }
  if (newPwd !== confirm2) { alert('Les deux mots de passe ne correspondent pas.'); return; }
  if (newPwd.length < 6) { alert('Le mot de passe doit faire au moins 6 caractères.'); return; }
  apiFetch('api/auth.php?action=change_password', {method:'POST', body:{password: newPwd}})
    .then(function(){ alert('✅ Mot de passe mis à jour avec succès.'); })
    .catch(function(e){ alert('Erreur : ' + (e.message||'Impossible de changer le mot de passe.')); });
}

// ── Export Devis PDF (impression navigateur) ──
function exportDevisPDF(){
  var list = getDevis();
  if (!list.length) { alert('Aucun devis à exporter.'); return; }
  var win = window.open('', '_blank');
  var rows = list.map(function(d){
    return '<tr><td>' + (d.ref||'—') + '</td><td>' + (d.client||'—') + '</td><td>' + (d.objet||'—') + '</td>'
      + '<td style="text-align:right">' + fmtMontant(d.montant||0) + '</td>'
      + '<td>' + fmtDate(d.date) + '</td><td>' + (d.statut||'—') + '</td></tr>';
  }).join('');
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Devis — Cortoba Architecture</title>'
    + '<style>body{font-family:sans-serif;padding:2rem;color:#111}h2{margin-bottom:1rem}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:0.5rem 0.7rem;font-size:0.85rem}th{background:#f5f5f5;font-weight:600}tr:nth-child(even){background:#fafafa}td:last-child{font-weight:600}</style>'
    + '</head><body><h2>Offres & Devis — Cortoba Architecture Studio</h2><p style="color:#888;font-size:0.82rem">Exporté le ' + new Date().toLocaleDateString('fr-FR') + '</p>'
    + '<table><thead><tr><th>Réf.</th><th>Client</th><th>Objet</th><th>Montant</th><th>Date</th><th>Statut</th></tr></thead><tbody>' + rows + '</tbody></table>'
    + '<script>window.onload=function(){window.print();}<\/script></body></html>');
  win.document.close();
}

// ── Export Factures PDF (impression navigateur) ──
// ── Ouvrir modal sélection pour export PDF ──
function openExportFactures(){
  var list = getFactures();
  if (!list.length) { alert('Aucune facture à exporter.'); return; }
  var wrap = document.getElementById('export-factures-list');
  if (!wrap) return;
  wrap.innerHTML = list.map(function(f){
    var ttc = f.montantTtc||f.montant_ttc||f.montant||0;
    var num = f.num||f.numero||'—';
    return '<label style="display:flex;align-items:center;gap:0.8rem;padding:0.65rem 0.8rem;border:1px solid var(--border);border-radius:6px;cursor:pointer">'
      + '<input type="checkbox" class="export-fa-cb" value="'+f.id+'" checked style="accent-color:var(--accent);width:15px;height:15px;flex-shrink:0">'
      + '<div style="flex:1;min-width:0">'
      + '<div style="display:flex;justify-content:space-between;align-items:center">'
      + '<span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--accent)">'+num+'</span>'
      + '<span class="'+badgeClass(f.statut||'')+'">'+f.statut+'</span>'
      + '</div>'
      + '<div style="font-size:0.82rem;font-weight:500;margin-top:0.15rem">'+(f.client||'—')+'</div>'
      + '<div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-3);margin-top:0.1rem">'
      + '<span>'+(f.projet||f.objet||'—')+'</span>'
      + '<span style="font-family:var(--font-mono);color:var(--text-2)">'+fmtMontant(ttc)+'</span>'
      + '</div></div></label>';
  }).join('');
  document.getElementById('modal-export-factures').classList.add('open');
}

function exportSelectAll(checked){
  document.querySelectorAll('.export-fa-cb').forEach(function(cb){ cb.checked = checked; });
}

function exportFacturesPDFSelection(){
  var ids = [];
  document.querySelectorAll('.export-fa-cb:checked').forEach(function(cb){ ids.push(cb.value); });
  if (!ids.length) { alert('Sélectionnez au moins une facture.'); return; }
  var sel = getFactures().filter(function(f){ return ids.indexOf(String(f.id))!==-1 || ids.indexOf(f.id)!==-1; });
  genFacturesPDF(sel);
  document.getElementById('modal-export-factures').classList.remove('open');
}

function exportUneFacturePDF(id){
  var f = getFactures().find(function(x){ return String(x.id)===String(id) || x.id===id; });
  if (!f) { alert('Facture introuvable.'); return; }
  genFacturesPDF([f]);
}

function exportFactureCourante(){
  if (_editingFactureId) {
    exportUneFacturePDF(_editingFactureId);
  } else {
    alert('Enregistrez d\u2019abord la facture pour l\u2019exporter.');
  }
}

function exportFacturesPDF(){ openExportFactures(); }

// ── Imprimer une facture (même rendu que PDF mais via window.print) ──
function imprimerFacture(id){
  exportUneFacturePDF(id);
}

function genFacturesPDF(factures){
  var ag = {
    raison:  getSetting('cortoba_agence_raison','Cortoba Architecture Studio'),
    adresse: getSetting('cortoba_agence_adresse','Midoun, Djerba, Tunisie'),
    tel:     getSetting('cortoba_agence_tel',''),
    email:   getSetting('cortoba_agence_email',''),
    mf:      getSetting('cortoba_agence_mf',''),
    cnoa:    getSetting('cortoba_agence_cnoa',''),
    banque:  getSetting('cortoba_banque',''),
    rib:     getSetting('cortoba_rib',''),
    mentions:getSetting('cortoba_fa_mentions','')
  };
  var logo = getSetting('cortoba_logo','');
  var logoH = logo
    ? '<img src="'+logo+'" style="max-height:55px;max-width:180px;object-fit:contain" />'
    : '<div style="font-size:1.2rem;font-weight:700;color:#111">'+ag.raison+'</div>';

  function fN(n){ return (n||0).toFixed(3).replace('.',',')+' TND'; }
  function fD(d){ if(!d) return '\u2014'; try{ return new Date(d).toLocaleDateString('fr-FR'); }catch(e){return String(d);} }

  var pages = factures.map(function(f, fi){
    var ttc = f.montantTtc||f.montant_ttc||f.montant||0;
    var ht  = f.montantHt||f.montant_ht||0;
    var tva = f.montantTva||f.montant_tva||0;
    var ras = f.rasAmt||0;
    var net = f.netPayer||ttc-ras;
    var timb= f.timbre||0;
    var fodc= f.fodec||0;

    // Résoudre les lignes : tableau parsé, ou lignes_json string, ou fallback
    var lignesArr = f.lignes || [];
    if ((!lignesArr || !lignesArr.length) && f.lignes_json) {
      try { lignesArr = JSON.parse(f.lignes_json); } catch(e){ lignesArr = []; }
    }

    var lignesH = '';
    if(lignesArr && lignesArr.length){
      lignesH = lignesArr.map(function(l){
        var pu   = parseFloat(l.pu || l.puHt || 0);
        var qte  = parseFloat(l.qte || 1);
        var lht  = parseFloat(l.ht || l.montant_ht || (pu * qte));
        // l.tva est le TAUX (ex: 19), pas le montant
        var taux = parseFloat(l.tva || 0);
        return '<tr><td class="tl">'+(l.desc||l.description||'\u2014')+'</td>'
          +'<td class="tc">'+qte+'</td>'
          +'<td class="tr">'+pu.toFixed(3)+' TND</td>'
          +'<td class="tc">'+taux+'%</td>'
          +'<td class="tr fw">'+lht.toFixed(3)+' TND</td></tr>';
      }).join('');
    } else {
      // Fallback : pas de lignes détaillées → synthèse
      // f.tva peut être un montant (ex: 299.25) pas un taux → calculer le taux
      var tvaMontant = parseFloat(f.montantTva || f.montant_tva || f.tva || 0);
      var tauxCalc   = (ht > 0 && tvaMontant > 0) ? Math.round(tvaMontant / ht * 100 * 100) / 100 : 0;
      lignesH = '<tr>'
        + '<td class="tl">'+(f.objet||'Honoraires d\u2019architecture')+'</td>'
        + '<td class="tc">1</td>'
        + '<td class="tr">'+ht.toFixed(3)+' TND</td>'
        + '<td class="tc">'+tauxCalc+'%</td>'
        + '<td class="tr fw">'+ht.toFixed(3)+' TND</td>'
        + '</tr>';
    }

    var totH = '<table class="tot"><tbody>'
      +'<tr><td class="gray">Total HT</td><td class="tr">'+fN(ht||ttc)+'</td></tr>'
      +(tva ? '<tr><td class="gray">TVA</td><td class="tr">'+fN(tva)+'</td></tr>' : '')
      +(fodc? '<tr><td class="gray">FODEC (1%)</td><td class="tr">'+fN(fodc)+'</td></tr>' : '')
      +(timb? '<tr><td class="gray">Droit de timbre</td><td class="tr">'+fN(timb)+'</td></tr>' : '')
      +'<tr class="sep"><td class="gold fw">Total TTC</td><td class="tr gold fw">'+fN(ttc)+'</td></tr>'
      +(ras ? '<tr><td class="gray">RAS ('+(f.rasTaux||0)+'%)</td><td class="tr red">\u2212 '+fN(ras)+'</td></tr>'
             +'<tr class="sep2"><td class="fw">Net \u00e0 payer</td><td class="tr fw">'+fN(net)+'</td></tr>' : '')
      +'</tbody></table>';

    var ribH = (ag.banque||ag.rib)
      ? '<div class="rib"><b>Coordonn\u00e9es bancaires</b>'+(ag.banque ? '<br>Banque\u00a0: '+ag.banque : '')+(ag.rib ? '<br>RIB\u00a0: <span class="mono">'+ag.rib+'</span>' : '')+'</div>' : '';

    var stcol = f.statut==='Pay\u00e9e'?'#2d7a50':f.statut==='Impay\u00e9e'||f.statut==='En litige'?'#c0392b':'#c8a96e';

    return (fi>0 ? '<div style="page-break-before:always"></div>' : '')
      +'<div class="page">'
      +'<div class="hdr"><div>'+logoH
      +'<div class="agaddr">'+(ag.adresse?'<span>'+ag.adresse+'</span>':'')+(ag.tel?'<span>'+ag.tel+'</span>':'')+(ag.email?'<span>'+ag.email+'</span>':'')+(ag.mf?'<span>MF\u00a0: '+ag.mf+'</span>':'')+(ag.cnoa?'<span>CNOA\u00a0: '+ag.cnoa+'</span>':'')+'</div></div>'
      +'<div class="hdr-r"><div class="facnum">'+(f.num||f.numero||'\u2014')+'</div>'
      +'<div class="gray sm">Émise le '+fD(f.dateEmission||f.date_emission)+'</div>'
      +(f.echeance||f.dateEcheance?'<div class="gray sm">Échéance\u00a0: '+fD(f.echeance||f.dateEcheance||f.date_echeance)+'</div>':'')
      +'<div class="statut" style="color:'+stcol+';border-color:'+stcol+'">'+f.statut+'</div></div></div>'
      +'<div class="sl"></div>'
      +'<div class="parties"><div class="party"><div class="plbl">Émetteur</div><div class="fw">'+ag.raison+'</div>'+(ag.adresse?'<div class="gray sm">'+ag.adresse+'</div>':'')+'</div>'
      +'<div class="party pdest"><div class="plbl">Destinataire</div><div class="fw">'+(f.client||'\u2014')+'</div>'+(f.clientAdresse||f.client_adresse?'<div class="gray sm">'+(f.clientAdresse||f.client_adresse)+'</div>':'')+(f.clientMF||f.client_mf?'<div class="gray sm">MF\u00a0: '+(f.clientMF||f.client_mf)+'</div>':'')+'</div></div>'
      +(f.objet?'<div class="obj"><b>Objet\u00a0:</b> '+f.objet+'</div>':'')
      +'<table class="prest"><thead><tr><th class="tl">Désignation</th><th class="tc w40">Qté</th><th class="tr w80">P.U. HT</th><th class="tc w55">TVA</th><th class="tr w80">Total HT</th></tr></thead><tbody>'+lignesH+'</tbody></table>'
      +totH
      +(f.montantLettres||f.montant_lettres ? '<div class="lett">Arr\u00eat\u00e9e \u00e0 la somme de\u00a0: <i>'+(f.montantLettres||f.montant_lettres)+' dinars tunisiens</i></div>' : '')
      +ribH+(ag.mentions?'<div class="ment">'+ag.mentions+'</div>':'')
      +'</div>';
  }).join('');

  var css = '@page{size:A4;margin:14mm 13mm 16mm}*{box-sizing:border-box}body{font-family:Helvetica,Arial,sans-serif;font-size:9pt;color:#222;margin:0}'
    +'.page{max-width:184mm;margin:0 auto}.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10pt}'
    +'.hdr-r{text-align:right}.agaddr{display:flex;flex-direction:column;gap:1pt;margin-top:5pt}.agaddr span{font-size:7.5pt;color:#555}'
    +'.facnum{font-size:18pt;font-weight:700;color:#c8a96e}.statut{display:inline-block;margin-top:4pt;padding:2pt 7pt;border:1pt solid;border-radius:3pt;font-size:7.5pt;font-weight:600}'
    +'.sl{border-top:1.5pt solid #c8a96e;margin:10pt 0}.parties{display:flex;gap:18pt;margin-bottom:12pt}'
    +'.party{flex:1;padding:8pt;background:#f9f9f9;border-radius:3pt}.pdest{background:#fff3e8}'
    +'.plbl{font-size:6.5pt;text-transform:uppercase;letter-spacing:.1em;color:#888;margin-bottom:4pt}'
    +'.obj{font-size:8.5pt;margin-bottom:10pt;color:#444}'
    +'.prest{width:100%;border-collapse:collapse;margin-bottom:10pt}.prest th,.prest td{border:.5pt solid #ddd;padding:4pt 6pt;font-size:8pt}.prest thead tr{background:#f0f0f0}'
    +'.tot{width:215pt;margin-left:auto;border-collapse:collapse}.tot td{padding:3pt 6pt;font-size:8.5pt}'
    +'.tot .sep td{border-top:1pt solid #c8a96e;padding-top:4pt}.tot .sep2 td{border-top:.5pt solid #ccc}'
    +'.rib{margin-top:9pt;padding:6pt 9pt;background:#fafafa;border:.5pt solid #ddd;border-radius:3pt;font-size:8pt}'
    +'.lett{font-size:8pt;margin-top:7pt;color:#555;font-style:italic}'
    +'.ment{margin-top:7pt;font-size:7.5pt;color:#888;border-top:.5pt solid #eee;padding-top:5pt}'
    +'.tl{text-align:left}.tc{text-align:center}.tr{text-align:right}.fw{font-weight:700}'
    +'.gold{color:#c8a96e}.red{color:#c0392b}.gray{color:#777}.sm{font-size:7.5pt}'
    +'.w40{width:32pt}.w55{width:42pt}.w80{width:62pt}.mono{font-family:monospace}'
    +'@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';

  // Construction HTML
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Factures \u2014 '+ag.raison+'</title><style>'+css+'</style></head><body>'+pages+'<scr'+'ipt>window.addEventListener("load",function(){setTimeout(function(){window.print();},400);});<\/scr'+'ipt></body></html>';
  // Méthode 1 : window.open (desktop)
  var win = null;
  try { win = window.open('','_blank'); } catch(e){}
  if(win && win.document){ win.document.write(html); win.document.close(); }
  else {
    // Méthode 2 : blob URL (mobile + popup bloqué)
    var blob = new Blob([html], {type:'text/html;charset=utf-8'});
    var blobUrl = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href=blobUrl; a.target='_blank'; a.rel='noopener';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(blobUrl); }, 10000);
  }
}

// ── Export Bilans Excel (CSV téléchargeable) ──
function exportBilansExcel(){
  var factures = getFactures();
  var depenses = getDepenses();
  var sep = ';';
  var nl = '\r\n';
  var rows = [['Type','Libellé','Montant TND','Date','Statut'].join(sep)];
  factures.forEach(function(f){
    var ttc = f.montantTtc||f.montant_ttc||f.montant||0;
    var lib = ((f.client||'') + ' — ' + (f.projet||'')).trim();
    var dt  = f.echeance||f.dateEcheance||f.date_echeance||'';
    rows.push(['"Facture"', '"'+lib.replace(/"/g,'""')+'"', ttc, '"'+dt+'"', '"'+(f.statut||'')+'"'].join(sep));
  });
  depenses.forEach(function(d){
    var ttc = d.montantTTC||d.montant||0;
    var lib = (d.libelle||d.description||'');
    var dt  = d.date||d.dateDep||'';
    rows.push(['"Dépense"', '"'+lib.replace(/"/g,'""')+'"', ttc, '"'+dt+'"', '"'+(d.cat||d.categorie||'')+'"'].join(sep));
  });
  var csv = '\uFEFF' + rows.join(nl);
  var blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'Bilan_Cortoba_' + new Date().getFullYear() + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}


// ── Toast notification ──
function showToast(msg, color){
  color = color || 'var(--accent)';
  var t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;background:var(--bg-1);border:1px solid '+color+';border-radius:6px;padding:0.65rem 1.1rem;font-size:0.82rem;color:'+color+';z-index:9999;display:flex;align-items:center;gap:0.5rem;box-shadow:0 4px 16px rgba(0,0,0,.3)';
  t.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> ' + msg;
  document.body.appendChild(t);
  setTimeout(function(){ t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(function(){t.remove();},300); }, 2500);
}


// ══════════════════════════════════════════════════════════════
//  GESTION DES ACCÈS PAR MODULE
// ══════════════════════════════════════════════════════════════

// Liste des modules de la plateforme
var NAV_MODULE_IDS = ['dashboard','demandes','devis','projets','suivi','journal','rendement','timesheet','gantt','charge','facturation','bilans','depenses','fiscalite','nas','equipe','clients','demandes-admin','conges','parametres','flotte','flotte-reservations','flotte-km','flotte-entretien','flotte-couts','flotte-conformite'];

// Lire la session courante
function getSession() {
  try { return JSON.parse(sessionStorage.getItem('cortoba_session') || 'null'); } catch(e) { return null; }
}

// Modules autorisés pour l'utilisateur connecté (null = tous)
function getAllowedModules() {
  var s = getSession();
  if (!s) return [];
  if (s.isAdmin || !s.modules) return null; // null = accès complet
  return Array.isArray(s.modules) ? s.modules : [];
}

// Appliquer les restrictions de module : masquer les nav-items interdits
function applyModuleAccess() {
  var allowed = getAllowedModules(); // null = tout, [] = rien, [...] = liste

  NAV_MODULE_IDS.forEach(function(moduleId) {
    var allNavBtns = document.querySelectorAll('.nav-item');
    var btn = null;
    for (var i = 0; i < allNavBtns.length; i++) {
      var oc = allNavBtns[i].getAttribute('onclick') || '';
      if (oc.indexOf("showPage('" + moduleId + "')") !== -1) { btn = allNavBtns[i]; break; }
    }
    if (!btn) return;
    var hasAccess = (allowed === null) || (allowed.indexOf(moduleId) !== -1);
    btn.style.display = hasAccess ? '' : 'none';
  });

  // Masquer les sidebar-section dont tous les nav-items sont cachés
  var sections = document.querySelectorAll('.sidebar-section');
  for (var s = 0; s < sections.length; s++) {
    var items = sections[s].querySelectorAll('.nav-item');
    var hasVisible = false;
    for (var i = 0; i < items.length; i++) {
      if (items[i].style.display !== 'none') { hasVisible = true; break; }
    }
    sections[s].style.display = hasVisible ? '' : 'none';
  }

  // Sections admin uniquement
  var session = getSession();
  var isAdmin = session && session.isAdmin;
  var el = document.getElementById('param-roles-card');
  if (el) el.style.display = isAdmin ? '' : 'none';
}

// Contrôle d'accès intégré directement dans showPage() ci-dessous

// ══════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════
function togglePwd(id,btn){
  var inp=document.getElementById(id); if(!inp) return;
  var show=inp.type==='text'; inp.type=show?'password':'text';
  btn.innerHTML=show
    ?'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
    :'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
}
function doLogin(){
  var email  = (document.getElementById('login-user').value||'').trim().toLowerCase();
  var pass   = document.getElementById('login-pass').value||'';
  var errEl  = document.getElementById('login-err');
  var btn    = document.querySelector('.login-btn');
  if (errEl) errEl.style.display = 'none';

  if (!email || !pass) {
    if (errEl) { errEl.textContent='Email et mot de passe requis'; errEl.style.display='block'; }
    return;
  }

  // Désactiver le bouton pendant la requête
  if (btn) { btn.disabled = true; btn.textContent = 'Connexion…'; }

  apiFetch('api/auth.php?action=login', {method:'POST', body:{email:email, password:pass}})
    .then(function(r){
      var d = r.data || r;
      var isAdmin = d.user.isAdmin || d.user.role === 'admin';
      var modules = d.user.modules || null; // null = accès complet (admin)
      sessionStorage.setItem('cortoba_token', d.token);
      sessionStorage.setItem('cortoba_session', JSON.stringify({
        email:   d.user.email,
        name:    d.user.name,
        role:    d.user.role || '',
        isAdmin: isAdmin,
        modules: modules
      }));
      updateHeaderUserDisplay(d.user);
      var ls = document.getElementById('login-screen');
      var ap = document.getElementById('app');
      if (ls) ls.style.display = 'none';
      if (ap) ap.style.display = 'block';
      applyModuleAccess();
      loadModulesFromAPI(); // peupler la liste des modules dès la connexion
      loadData().then(function(){
        renderAll();
        showPage(_getStartPage());
        _openLinkedProjet();
        refreshNotifBadge();
        setTimeout(function(){ try { if (typeof checkDeadlinesPopup === 'function') checkDeadlinesPopup(); } catch(e) {} }, 1200);
      });
    })
    .catch(function(e){
      var msg = e.message || '';
      // Erreur réseau → message plus clair
      if (!msg || msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network') || msg.toLowerCase().includes('failed')) {
        msg = 'Impossible de contacter le serveur. Vérifiez votre connexion.';
      }
      if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
    })
    .finally(function(){
      // Réactiver le bouton dans tous les cas
      if (btn) { btn.disabled = false; btn.textContent = 'Se connecter →'; }
    });
}
function doLogout(){
  sessionStorage.removeItem('cortoba_token');
  sessionStorage.removeItem('cortoba_session');
  applyModuleAccess(); // reset sidebar
  var ls = document.getElementById('login-screen');
  var ap = document.getElementById('app');
  if (ls) ls.style.display = 'flex';
  if (ap) ap.style.display = 'none';
  var u = document.getElementById('login-user'); if(u) u.value='';
  var p = document.getElementById('login-pass'); if(p) p.value='';
  var e = document.getElementById('login-err');  if(e) e.style.display='none';
}

// ── Navigation ──
function _getStartPage(){
  try { var p = new URLSearchParams(window.location.search).get('page'); if(p && document.getElementById('page-'+p)) return p; } catch(e){}
  return 'dashboard';
}
function _openLinkedProjet(){
  try {
    var pid = new URLSearchParams(window.location.search).get('projet');
    if(pid) setTimeout(function(){ openProjetDetail(pid); }, 300);
  } catch(e){}
}
var pageLabels={dashboard:'Tableau de bord',demandes:'Demandes',devis:'Offres & Devis',projets:'Projets',suivi:'Suivi des missions',journal:'Journal du jour',rendement:'Rendement',timesheet:'Timesheet',gantt:'Gantt',charge:'Charge de travail',facturation:'Facturation',bilans:'Bilans',depenses:'Dépenses',fiscalite:'Fiscalité & Impôts',nas:'Serveur NAS',equipe:'Équipe',clients:'Clients','demandes-admin':'Demandes administratives',conges:'Congés & absences',notifications:'Notifications',parametres:'Paramètres',chantier:'Tableau de bord chantier','chantier-journal':'Journal de chantier','chantier-intervenants':'Intervenants','chantier-reunions':'Réunions & PV','chantier-photos':'Photos & Médias','chantier-reserves':'Réserves & RFI','chantier-visas':'Visas d\'exécution','chantier-securite':'Sécurité',flotte:'Tableau de bord flotte','flotte-reservations':'Réservations & Attributions','flotte-km':'Kilométrage & Carburant','flotte-entretien':'Entretien & Maintenance','flotte-couts':'Coûts & TCO','flotte-conformite':'Conformité & Assurances',portail:'Comptes clients','portail-docs':'Documents partagés','portail-messages':'Messages clients'};
function showPage(id){
  // Contrôle d'accès : rediriger si module non autorisé
  // ('notifications' est toujours accessible : ouvert depuis la cloche)
  var _allowed = getAllowedModules();
  if (id !== 'notifications' && _allowed !== null && _allowed.indexOf(id) === -1) {
    var _first = _allowed[0] || 'dashboard';
    if (_first !== id) showPage(_first);
    return;
  }
  document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.remove('active'); });
  document.getElementById('page-'+id).classList.add('active');
  var btn=document.querySelector('[onclick="showPage(\''+id+'\')"]');
  if(btn) btn.classList.add('active');
  // Auto-développer la section sidebar contenant la page active
  if (typeof _expandSidebarForPage === 'function') _expandSidebarForPage(id);
  var _secLabel = document.getElementById('section-label');
  if (_secLabel) _secLabel.textContent=pageLabels[id]||'';
  if(id==='dashboard')  setTimeout(renderDashboard,80);
  if(id==='demandes')   setTimeout(renderDemandes,80);
  if(id==='projets')    setTimeout(refreshGlobalMap,300);
  if(id==='suivi')      setTimeout(function(){ loadTaches().then(function(){ renderSuiviPage(); }).catch(function(e){ console.error('[suivi] init error', e); }); },80);
  if(id==='journal')    setTimeout(function(){ var dEl=document.getElementById('journal-date'); if(dEl && !dEl.value) dEl.value=new Date().toISOString().split('T')[0]; renderJournalPage(); },80);
  if(id==='rendement')  setTimeout(renderRendementPage,80);
  if(id==='timesheet')  setTimeout(function(){ if(typeof renderTimesheetPage==='function') renderTimesheetPage(); },80);
  if(id==='gantt')      setTimeout(function(){ if(typeof renderGanttPage==='function') renderGanttPage(); },80);
  if(id==='charge')     setTimeout(function(){ if(typeof renderChargePage==='function') renderChargePage(); },80);
  if(id==='demandes-admin') setTimeout(renderDemandesAdminPage,80);
  if(id==='conges')     setTimeout(function(){ if(typeof renderCongesPage==='function') renderCongesPage(); },80);
  if(id==='notifications') setTimeout(function(){ if(typeof renderNotificationsPage==='function') renderNotificationsPage(); },40);
  if(id==='nas')        setTimeout(renderNasPage,80);
  if(id==='chantier')   setTimeout(function(){ if(typeof renderChantierDashboard==='function') renderChantierDashboard(); },80);
  if(id==='chantier-journal')     setTimeout(function(){ if(typeof renderChantierJournalPage==='function') renderChantierJournalPage(); },80);
  if(id==='chantier-intervenants') setTimeout(function(){ if(typeof renderChantierIntervenantsPage==='function') renderChantierIntervenantsPage(); },80);
  if(id==='chantier-reunions')    setTimeout(function(){ if(typeof renderChantierReunionsPage==='function') renderChantierReunionsPage(); },80);
  if(id==='chantier-photos')      setTimeout(function(){ if(typeof renderChantierPhotosPage==='function') renderChantierPhotosPage(); },80);
  if(id==='chantier-reserves')    setTimeout(function(){ if(typeof renderChantierReservesPage==='function') renderChantierReservesPage(); },80);
  if(id==='chantier-visas')       setTimeout(function(){ if(typeof renderChantierVisasPage==='function') renderChantierVisasPage(); },80);
  if(id==='chantier-securite')    setTimeout(function(){ if(typeof renderChantierSecuritePage==='function') renderChantierSecuritePage(); },80);
  if(id==='flotte')              setTimeout(function(){ if(typeof renderFlotteDashboard==='function') renderFlotteDashboard(); },80);
  if(id==='flotte-reservations') setTimeout(function(){ if(typeof renderFlotteResaPage==='function') renderFlotteResaPage(); },80);
  if(id==='flotte-km')           setTimeout(function(){ if(typeof renderFlotteKmPage==='function') renderFlotteKmPage(); },80);
  if(id==='flotte-entretien')    setTimeout(function(){ if(typeof renderFlotteEntretienPage==='function') renderFlotteEntretienPage(); },80);
  if(id==='flotte-couts')        setTimeout(function(){ if(typeof renderFlotteCoutsPage==='function') renderFlotteCoutsPage(); },80);
  if(id==='flotte-conformite')   setTimeout(function(){ if(typeof renderFlotteConformitePage==='function') renderFlotteConformitePage(); },80);
  if(id==='portail')    setTimeout(function(){ if(typeof renderPortailAccounts==='function') renderPortailAccounts(); },80);
  if(id==='portail-docs') setTimeout(function(){ if(typeof renderPortailDocs==='function') renderPortailDocs(); },80);
  if(id==='portail-messages') setTimeout(function(){ if(typeof renderPortailMessages==='function') renderPortailMessages(); },80);
  if(id==='equipe')     setTimeout(renderEquipePage,80);
  if(id==='fiscalite')  setTimeout(renderFiscalitePage,100);
  if(id==='parametres') {
    // Attendre que loadSettings soit terminé avant de remplir les champs
    var fillParams = function(){
      renderParametresListes();
      renderCfgTypesParams();
      renderParametresMissions();
      if (typeof renderParametresTachesTypes === 'function') renderParametresTachesTypes();
      if (typeof renderParametresLivrables === 'function') renderParametresLivrables();
      if (typeof renderParametresDA === 'function') renderParametresDA();
      if (typeof renderParametresRoles === 'function') renderParametresRoles();
      loadAgenceParams();
      loadRendementParams();
      loadNasParams();
      loadLogoParam();
      loadCfgParams();
      var ribEl = document.getElementById('param-rib');
      if(ribEl) ribEl.value = getSetting('cortoba_rib', '');
      var banqueEl = document.getElementById('param-banque');
      if(banqueEl) banqueEl.value = getSetting('cortoba_banque', '');
      var mentEl = document.getElementById('param-fa-mentions');
      if(mentEl) mentEl.value = getSetting('cortoba_fa_mentions', '');
      if (typeof loadPaieParams === 'function') loadPaieParams();
      if (typeof loadParamPhases === 'function') loadParamPhases();
      // Activer l'onglet par défaut (Agence) à l'ouverture de la page
      if (typeof switchParamTab === 'function') {
        var defBtn = document.querySelector('#param-tabs-bar .param-tab[data-param-tab="agence"]');
        if (defBtn) switchParamTab('agence', defBtn);
      }
    };
    // Si le cache est déjà rempli (loadData terminé), remplir immédiatement
    if (Object.keys(_settingsCache).length > 3) {
      setTimeout(fillParams, 50);
    } else {
      // Sinon attendre que loadSettings termine via l'API
      loadSettings().then(function() { setTimeout(fillParams, 50); });
    }
  }
  if(window.innerWidth<=900) closeSidebar();
}
function toggleSidebar(){ document.getElementById('sidebar').classList.toggle('open'); document.getElementById('sidebar-backdrop').classList.toggle('open'); }
function closeSidebar(){ document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebar-backdrop').classList.remove('open'); }

// ── Sidebar sections collapsibles ──
var _sidebarSectionState = {};
try { _sidebarSectionState = JSON.parse(localStorage.getItem('sidebar_sections') || '{}'); } catch(e){}

function toggleSidebarSection(labelEl) {
  var section = labelEl.closest('.sidebar-section');
  if (!section || !section.dataset.section) return;
  section.classList.toggle('collapsed');
  _sidebarSectionState[section.dataset.section] = section.classList.contains('collapsed');
  try { localStorage.setItem('sidebar_sections', JSON.stringify(_sidebarSectionState)); } catch(e){}
}
window.toggleSidebarSection = toggleSidebarSection;

function _initSidebarSections() {
  var sections = document.querySelectorAll('.sidebar-section[data-section]');
  for (var i = 0; i < sections.length; i++) {
    var s = sections[i];
    var key = s.dataset.section;
    // Restaurer l'état sauvegardé (mais pas si la section contient la page active)
    var hasActive = s.querySelector('.nav-item.active');
    if (_sidebarSectionState[key] && !hasActive) {
      s.classList.add('collapsed');
    }
  }
}

function _expandSidebarForPage(pageId) {
  var sections = document.querySelectorAll('.sidebar-section[data-section]');
  for (var i = 0; i < sections.length; i++) {
    var s = sections[i];
    var items = s.querySelectorAll('.nav-item');
    for (var j = 0; j < items.length; j++) {
      var onclick = items[j].getAttribute('onclick') || '';
      if (onclick.indexOf("'" + pageId + "'") !== -1) {
        s.classList.remove('collapsed');
        _sidebarSectionState[s.dataset.section] = false;
        try { localStorage.setItem('sidebar_sections', JSON.stringify(_sidebarSectionState)); } catch(e){}
        return;
      }
    }
  }
}

// Initialiser au chargement
document.addEventListener('DOMContentLoaded', _initSidebarSections);

// A1 — openModal: modal-projet ouvre correctement sans déclencher modal-client
function openModal(id){
  document.getElementById(id).classList.add('open');
  if(id==='modal-facture'){
    resetFactureForm();
    var pdfBtn=document.getElementById('fa-pdf-btn');
    if(pdfBtn){ pdfBtn.disabled=true; pdfBtn.style.opacity='0.38'; pdfBtn.title='Enregistrez la facture pour activer le PDF'; }
  }
  if(id==='modal-client'){
    resetClientForm();
    setTimeout(initExtensibleSelects, 80);
  }
  if(id==='modal-projet'){
    _editingProjetId = null;
    resetProjetForm();
    setTimeout(initExtensibleSelects, 80);
  }
  if(id==='modal-depense'){
    resetDepenseForm();
  }
  if(id==='modal-scan-facture'){
    resetScanFacture();
  }
  if(id==='modal-membre'){
    openModal_membre_reset();
  }
  if(id==='modal-nas-raccourci'){
    openModal_raccourci_reset();
  }
  if(id==='modal-devis'){
    populateDevisMissions([]);
  }
  if(id==='modal-chantier'){
    if(typeof _chPopulateProjetSelect==='function') _chPopulateProjetSelect();
  }
  if(id==='modal-ch-journal'){
    // Reset form if not editing
    if(!document.getElementById('chj-edit-id').value) {
      _chResetJournalForm();
    }
    // Populate phases
    if(typeof _chLoadPhases==='function') _chLoadPhases().then(function(){ _chPopulatePhaseSelects(); });
  }
}
function closeModal(id){ document.getElementById(id).classList.remove('open'); }

// ── NAS — remplacé par nasOpenLocal/nasOpenCloud dans le nouveau module ──
function nasConnect(){
  nasOpenLocal();
}

// ── Charts ──
function renderCharts(){
  renderDashboard();
  // Trésorerie prévisionnelle (bilans page) — toujours depuis cache local
  var factures = getFactures();
  var now = new Date();
  var year = now.getFullYear();
  var mois = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  var caParMois = new Array(12).fill(0);
  factures.forEach(function(f){
    var d = new Date(f.dateEmission||f.date_emission||f.echeance||f.date_echeance||'');
    if (!isNaN(d) && d.getFullYear()===year && f.statut==='Payée') {
      caParMois[d.getMonth()] += (f.montantTtc||f.montant_ttc||f.montant||0)/1000;
    }
  });
  var curMonth = now.getMonth();
  var cumul = 0;
  var trData = [];
  for (var j=0; j<=Math.min(curMonth+3, 11); j++){
    if (j <= curMonth) cumul += caParMois[j];
    var maxCumul = Math.max(cumul * 1.3, 10);
    trData.push({label:mois[j], val:Math.round(cumul*10)/10, max:maxCumul, future: j > curMonth});
  }
  renderBarChart('tresorerie-chart', trData, 'k', true);
}

// ═══════════════════════════════════════════════════════════
//  DASHBOARD — Données réelles depuis api/dashboard.php
// ═══════════════════════════════════════════════════════════
var _dashData = null;

function renderDashboard(){
  apiFetch('api/dashboard.php').then(function(r){
    _dashData = r.data;
    _renderDashKpis(_dashData.kpis);
    _renderDashCaChart(_dashData.ca_mensuel, _dashData.ca_mensuel_prev, _dashData.annee, _dashData.mois_courant);
    _renderDashActivity(_dashData.activity);
    _renderDashProjets(_dashData.projets_actifs);
    _renderDashDepenses(_dashData.depenses_par_cat, _dashData.kpis.depenses_mois);
    // Mettre à jour le label mois
    var MOIS_NOMS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    var el = document.getElementById('dash-current-month');
    if(el) el.textContent = MOIS_NOMS[_dashData.mois_courant-1]+' '+_dashData.annee;
    var yEl = document.getElementById('dash-chart-year');
    if(yEl) yEl.textContent = _dashData.annee;
    var ypEl = document.getElementById('dash-chart-year-prev');
    if(ypEl) ypEl.textContent = _dashData.annee - 1;
    if(window.ergoHideSkeletons) window.ergoHideSkeletons();
  }).catch(function(e){
    console.error('[dashboard] load error:', e);
    // Fallback : données locales depuis le cache
    _renderDashboardFromCache();
  });
}

// Fallback : construire le dashboard depuis les données déjà en cache (loadData)
function _renderDashboardFromCache(){
  var now = new Date();
  var year = now.getFullYear();
  var month = now.getMonth(); // 0-based
  var MOIS_NOMS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

  var factures = getFactures();
  var devis = getDevis();
  var projets = getProjets();
  var depenses = getDepenses();

  // KPIs
  var caYtd = 0;
  factures.forEach(function(f){
    var d = new Date(f.dateEmission||f.date_emission||'');
    if(!isNaN(d) && d.getFullYear()===year && f.statut==='Payée') caYtd += (f.montantTtc||f.montant_ttc||f.montant||0);
  });
  var projEnCours = projets.filter(function(p){ return p.statut==='En cours'; });
  var devisEnAttente = devis.filter(function(d){ return d.statut==='En attente'; });
  var devisTotal = 0; devisEnAttente.forEach(function(d){ devisTotal += parseFloat(d.montant)||0; });
  var factImpayees = factures.filter(function(f){ return f.statut==='Émise'||f.statut==='En retard'||f.statut==='Impayée'; });
  var factTotal = 0; factImpayees.forEach(function(f){ factTotal += (f.montantTtc||f.montant_ttc||f.montant||0); });
  var depMois = 0;
  depenses.forEach(function(d){
    var dd = new Date(d.date||'');
    if(!isNaN(dd) && dd.getFullYear()===year && dd.getMonth()===month) depMois += parseFloat(d.montant)||0;
  });

  _renderDashKpis({
    ca_ytd: caYtd, ca_delta: 0,
    projets_en_cours: projEnCours.length, phase_detail: '',
    devis_en_attente: devisEnAttente.length, devis_total: devisTotal,
    factures_impayees: factImpayees.length, factures_total: factTotal, jours_retard: 0,
    depenses_mois: depMois, dep_delta: 0,
    taux_occupation: 0, heures_saisies: 0, heures_dispo: 0
  });

  // CA chart depuis factures cache
  var caParMois = new Array(12).fill(0);
  factures.forEach(function(f){
    var d = new Date(f.dateEmission||f.date_emission||'');
    if(!isNaN(d) && d.getFullYear()===year && f.statut==='Payée') caParMois[d.getMonth()] += (f.montantTtc||f.montant_ttc||f.montant||0);
  });
  _renderDashCaChart(caParMois, new Array(12).fill(0), year, month+1);

  // Activity depuis devis/factures récents
  var act = [];
  devis.slice(0,4).forEach(function(d){
    var color = d.statut==='Accepté'?'green':(d.statut==='Refusé'?'red':'accent');
    act.push({type:'devis', text:'Devis <strong>'+(d.ref||'')+'</strong> · '+(d.client||'')+' · '+(d.statut||''), time:d.date||'', color:color});
  });
  _renderDashActivity(act.length ? act : []);

  // Projets actifs
  var pa = projEnCours.slice(0,6).map(function(p){ return {nom:p.nom, phase:p.phase||'', total_taches:0, taches_terminees:0, avancement:0}; });
  _renderDashProjets(pa);

  _renderDashDepenses([], depMois);

  var el = document.getElementById('dash-current-month');
  if(el) el.textContent = MOIS_NOMS[month]+' '+year;
  var yEl = document.getElementById('dash-chart-year');
  if(yEl) yEl.textContent = year;
  var ypEl = document.getElementById('dash-chart-year-prev');
  if(ypEl) ypEl.textContent = year - 1;
  if(window.ergoHideSkeletons) window.ergoHideSkeletons();
}

function _fmtMontant(v){
  if(v>=1000000) return (Math.round(v/100000)/10)+'M';
  if(v>=1000) return (Math.round(v/100)/10)+'k';
  return Math.round(v)+'';
}

function _renderDashKpis(k){
  var el = document.getElementById('dash-kpis');
  if(!el) return;
  var svgUp = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>';
  var svgDown = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>';

  var cards = [
    {
      label: "Chiffre d'affaires YTD",
      value: _fmtMontant(k.ca_ytd),
      unit: ' TND',
      delta: (k.ca_delta>=0?'+':'')+k.ca_delta+'% vs '+(new Date().getFullYear()-1),
      dir: k.ca_delta>=0?'up':'down',
      icon: svgUp
    },
    {
      label: 'Projets en cours',
      value: k.projets_en_cours,
      unit: '',
      delta: k.phase_detail || '',
      dir: 'neutral'
    },
    {
      label: 'Devis en attente',
      value: k.devis_en_attente,
      unit: '',
      delta: _fmtMontant(k.devis_total)+' TND',
      dir: k.devis_en_attente>0?'up':'neutral',
      icon: svgUp
    },
    {
      label: 'Factures impayées',
      value: k.factures_impayees,
      unit: '',
      delta: k.factures_impayees>0?_fmtMontant(k.factures_total)+' TND'+(k.jours_retard>0?' · '+k.jours_retard+'j retard':''):'Aucune',
      dir: k.factures_impayees>0?'down':'neutral',
      icon: k.factures_impayees>0?svgDown:''
    },
    {
      label: 'Dépenses du mois',
      value: _fmtMontant(k.depenses_mois),
      unit: ' TND',
      delta: k.dep_delta!==0?((k.dep_delta>0?'+':'')+k.dep_delta+'% vs mois préc.'):'Stable',
      dir: k.dep_delta>0?'down':(k.dep_delta<0?'up':'neutral'),
      icon: k.dep_delta>0?svgDown:(k.dep_delta<0?svgUp:'')
    },
    {
      label: 'Taux occupation',
      value: k.taux_occupation,
      unit: '%',
      delta: Math.round(k.heures_saisies)+'h / '+Math.round(k.heures_dispo)+'h',
      dir: k.taux_occupation>=70?'up':(k.taux_occupation>=40?'neutral':'down'),
      icon: k.taux_occupation>=70?svgUp:''
    }
  ];

  el.innerHTML = cards.map(function(c){
    return '<div class="kpi-card">' +
      '<div class="kpi-label">'+c.label+'</div>' +
      '<div class="kpi-value">'+c.value+(c.unit?'<span class="kpi-unit">'+c.unit+'</span>':'')+'</div>' +
      '<div class="kpi-delta '+c.dir+'">'+(c.icon||'')+' '+c.delta+'</div>' +
    '</div>';
  }).join('');
}

function _renderDashCaChart(caMensuel, caPrev, annee, moisCourant){
  var el = document.getElementById('ca-chart');
  if(!el) return;
  var MOIS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  var maxMonth = Math.min(moisCourant + 2, 12); // afficher jusqu'à mois courant + 2
  var allVals = caMensuel.concat(caPrev);
  var maxVal = Math.max.apply(null, allVals.map(function(v){return v||1;}))*1.15;
  if(maxVal<=0) maxVal = 1000;

  var html = '<div class="dash-ca-grid">';
  // Y-axis labels
  var steps = 4;
  html += '<div class="dash-ca-yaxis">';
  for(var s=steps; s>=0; s--){
    var yVal = Math.round(maxVal/steps*s);
    html += '<div class="dash-ca-ylabel">'+_fmtMontant(yVal)+'</div>';
  }
  html += '</div>';

  html += '<div class="dash-ca-bars">';
  // Grid lines
  for(var g=0; g<=steps; g++){
    var pct = (g/steps)*100;
    html += '<div class="dash-ca-gridline" style="bottom:'+pct+'%"></div>';
  }

  for(var i=0; i<maxMonth; i++){
    var val = caMensuel[i]||0;
    var prevVal = caPrev[i]||0;
    var hCur = maxVal>0?Math.max(val>0?2:0,(val/maxVal)*100):0;
    var hPrev = maxVal>0?Math.max(prevVal>0?2:0,(prevVal/maxVal)*100):0;
    var isFuture = i >= moisCourant;
    html += '<div class="dash-ca-col'+(isFuture?' dash-ca-future':'')+'">' +
      '<div class="dash-ca-bar-group">' +
        '<div class="dash-ca-bar dash-ca-bar-prev" style="height:'+hPrev+'%"'+(prevVal>0?' title="'+(annee-1)+': '+_fmtMontant(prevVal)+' TND"':'')+'></div>' +
        '<div class="dash-ca-bar dash-ca-bar-cur" style="height:'+hCur+'%"'+(val>0?' title="'+annee+': '+_fmtMontant(val)+' TND"':'')+'>' +
          (val>0?'<span class="dash-ca-val">'+_fmtMontant(val)+'</span>':'') +
        '</div>' +
      '</div>' +
      '<div class="dash-ca-label">'+MOIS[i]+'</div>' +
    '</div>';
  }
  html += '</div></div>';
  el.innerHTML = html;
}

function _renderDashActivity(items){
  var el = document.getElementById('dash-activity');
  if(!el) return;
  if(!items || !items.length){
    el.innerHTML = '<div class="dash-empty">Aucune activité récente</div>';
    return;
  }
  var colorMap = {green:'var(--green)',red:'var(--red)',blue:'var(--blue)',accent:'var(--accent)',orange:'var(--orange)'};
  el.innerHTML = items.map(function(it){
    var col = colorMap[it.color]||'var(--accent)';
    var timeStr = _formatRelativeTime(it.time);
    return '<div class="activity-item">' +
      '<div class="activity-dot" style="background:'+col+'"></div>' +
      '<div><div class="activity-text">'+it.text+'</div>' +
      '<div class="activity-time">'+timeStr+'</div></div>' +
    '</div>';
  }).join('');
}

function _formatRelativeTime(dateStr){
  if(!dateStr) return '';
  var d = new Date(dateStr);
  if(isNaN(d)) return dateStr;
  var now = new Date();
  var diff = Math.floor((now - d)/86400000);
  var MOIS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  if(diff===0) return "Aujourd'hui";
  if(diff===1) return 'Hier';
  if(diff<7) return 'Il y a '+diff+' jours';
  return d.getDate()+' '+MOIS[d.getMonth()]+' '+d.getFullYear();
}

function _renderDashProjets(projets){
  var el = document.getElementById('dash-projets-actifs');
  if(!el) return;
  if(!projets || !projets.length){
    el.innerHTML = '<div class="dash-empty">Aucun projet en cours</div>';
    return;
  }
  var colors = ['','blue','green','','blue','green'];
  el.innerHTML = projets.map(function(p, idx){
    var av = p.avancement||0;
    var fillColor = av>=80?'background:var(--green)':av>=50?'':'background:var(--blue)';
    var phaseLabel = p.phase?' — Phase '+p.phase:'';
    return '<div class="progress-bar-wrap'+(idx>0?' dash-progress-mt':'')+'">' +
      '<div class="progress-info">' +
        '<span class="progress-info-label">'+p.nom+phaseLabel+'</span>' +
        '<span class="progress-info-val">'+av+'%</span>' +
      '</div>' +
      '<div class="progress-track"><div class="progress-fill" style="width:'+av+'%;'+fillColor+'"></div></div>' +
      '<div class="dash-projet-tasks">'+p.taches_terminees+'/'+p.total_taches+' tâches</div>' +
    '</div>';
  }).join('');
}

function _renderDashDepenses(cats, totalMois){
  var el = document.getElementById('dash-depenses-cat');
  if(!el) return;
  if(!cats || !cats.length){
    el.innerHTML = '<div class="dash-empty">Aucune dépense ce mois</div>';
    return;
  }
  var catColors = ['var(--accent)','var(--blue)','var(--green)','var(--orange)','var(--red)'];
  var total = 0;
  cats.forEach(function(c){ total += parseFloat(c.total)||0; });
  if(total<=0) total = 1;

  var html = '<div class="dash-dep-bars">';
  // Barre horizontale empilée
  html += '<div class="dash-dep-stacked">';
  cats.forEach(function(c, i){
    var pct = Math.round(parseFloat(c.total)/total*100);
    html += '<div class="dash-dep-seg" style="width:'+pct+'%;background:'+catColors[i%catColors.length]+'" title="'+c.categorie+': '+_fmtMontant(parseFloat(c.total))+' TND ('+pct+'%)"></div>';
  });
  html += '</div>';

  // Légende
  html += '<div class="dash-dep-legend">';
  cats.forEach(function(c, i){
    html += '<div class="dash-dep-legend-item">' +
      '<span class="dash-dep-legend-dot" style="background:'+catColors[i%catColors.length]+'"></span>' +
      '<span class="dash-dep-legend-label">'+(c.categorie||'Autre')+'</span>' +
      '<span class="dash-dep-legend-val">'+_fmtMontant(parseFloat(c.total))+' TND</span>' +
    '</div>';
  });
  html += '</div>';

  // Total
  html += '<div class="dash-dep-total">Total : <strong>'+_fmtMontant(totalMois)+' TND</strong></div>';
  html += '</div>';
  el.innerHTML = html;
}

// Legacy bar chart fallback (used by trésorerie etc.)
function renderBarChart(containerId,data,unit,isGreen){
  var el=document.getElementById(containerId); if(!el) return; el.innerHTML='';
  var maxVal=Math.max.apply(null,data.map(function(d){return d.max||d.val||1;}));
  data.forEach(function(d){
    var wrap=document.createElement('div'); wrap.className='chart-bar-wrap';
    var h=d.val?Math.max(6,(d.val/maxVal)*160):0;
    var bs=d.future?'background:rgba(255,255,255,0.05);border:1px dashed rgba(255,255,255,0.1)':(isGreen?'background:rgba(90,171,110,0.3)':'');
    wrap.innerHTML='<div class="chart-bar" style="height:'+h+'px;'+bs+'">'+(d.val?'<div class="chart-bar-val">'+d.val+unit+'</div>':'')+'</div><div class="chart-bar-label">'+d.label+'</div>';
    el.appendChild(wrap);
  });
}

// ── Init ──
document.addEventListener('DOMContentLoaded',function(){
  // Fermer les modals en cliquant le fond
  document.querySelectorAll('.modal-overlay').forEach(function(m){
    m.addEventListener('click',function(e){ if(e.target===m) m.classList.remove('open'); });
  });

  // S'assurer que le login-screen est visible par défaut
  var loginScreen = document.getElementById('login-screen');
  var appEl       = document.getElementById('app');
  if (loginScreen) loginScreen.style.display = 'flex';
  if (appEl)       appEl.style.display       = 'none';

  // Vérifier token de session existant
  var token = sessionStorage.getItem('cortoba_token');
  if (token) {
    apiFetch('api/auth.php?action=me')
      .then(function(r){
        var u = r.data || r;
        updateHeaderUserDisplay(u);
        if (loginScreen) loginScreen.style.display = 'none';
        if (appEl)       appEl.style.display       = 'block';
        applyModuleAccess();
        loadModulesFromAPI();
        loadData().then(function(){ renderAll(); showPage(_getStartPage()); _openLinkedProjet(); refreshNotifBadge(); });
      })
      .catch(function(){
        // Token invalide ou API inaccessible → retour au login sans bloquer
        doLogout();
        if (loginScreen) loginScreen.style.display = 'flex';
        if (appEl)       appEl.style.display       = 'none';
      });
  }
  // Si pas de token : le login-screen reste affiché (déjà fait ci-dessus)
});

// ═══════════════════════════════════════════════════════════════════════
//  MODULE FISCALITÉ TUNISIENNE — Cortoba Atelier
//  IRPP · TVA · RAS · Acomptes provisionnels · Déclarations mensuelles
// ═══════════════════════════════════════════════════════════════════════

// ── Barème IRPP 2024 (Tunisie, personnes physiques) ──
var IRPP_BAREME = [
  { de: 0,      a: 5000,   taux: 0,   libelle: '0 à 5 000 TND' },
  { de: 5000,   a: 20000,  taux: 26,  libelle: '5 001 à 20 000 TND' },
  { de: 20000,  a: 30000,  taux: 28,  libelle: '20 001 à 30 000 TND' },
  { de: 30000,  a: 50000,  taux: 32,  libelle: '30 001 à 50 000 TND' },
  { de: 50000,  a: 70000,  taux: 35,  libelle: '50 001 à 70 000 TND' },
  { de: 70000,  a: Infinity,taux: 40, libelle: 'Au-delà de 70 000 TND' },
];

// ── Calcul IRPP selon le barème progressif ──
function calcIRPP(revenuNet) {
  var impot = 0;
  for (var i = 0; i < IRPP_BAREME.length; i++) {
    var t = IRPP_BAREME[i];
    if (revenuNet <= t.de) break;
    var base = Math.min(revenuNet, t.a === Infinity ? revenuNet : t.a) - t.de;
    impot += base * t.taux / 100;
  }
  return Math.max(0, Math.round(impot * 1000) / 1000);
}

// ── Helpers ──
function fmtTND(n) {
  n = parseFloat(n) || 0;
  return n.toFixed(3).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f') + ' TND';
}
function getYear() { return new Date().getFullYear(); }
function getMonth(){ return new Date().getMonth() + 1; }
function nomMois(m) {
  return ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'][m-1] || '';
}
function nomMoisComplet(m) {
  return ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'][m-1] || '';
}
function dateEcheanceMensuelle(annee, moisOp) {
  // Mois d'opération → échéance = 28 du mois suivant
  var moisEch = moisOp === 12 ? 1 : moisOp + 1;
  var anneeEch = moisOp === 12 ? annee + 1 : annee;
  return new Date(anneeEch, moisEch - 1, 28);
}
function isDepassee(date) { return date < new Date(); }
function jours(date) {
  var diff = Math.ceil((date - new Date()) / 86400000);
  return diff;
}
function badgeEcheance(date) {
  var j = jours(date);
  if (j < 0)  return '<span style="display:inline-block;padding:2px 7px;border-radius:4px;font-size:0.7rem;background:rgba(224,112,112,0.15);color:#e07b72;font-weight:600">En retard ('+Math.abs(j)+' j)</span>';
  if (j <= 7) return '<span style="display:inline-block;padding:2px 7px;border-radius:4px;font-size:0.7rem;background:rgba(200,169,110,0.15);color:var(--accent);font-weight:600">Dans '+j+' j</span>';
  if (j <= 30)return '<span style="display:inline-block;padding:2px 7px;border-radius:4px;font-size:0.7rem;background:rgba(111,168,214,0.12);color:#6fa8d6">'+j+' j</span>';
  return '<span style="font-size:0.72rem;color:var(--text-3)">'+date.toLocaleDateString('fr-FR')+'</span>';
}

// ── Données fiscales sauvegardées ──
function getFiscalData() {
  return getSetting('cortoba_fiscal', {
    irppRef: { annee: getYear() - 1, montant: 0, acomptesVerses: 0 },
    declarationsMensuelles: {},
    acomptesVerses: {}
  });
}
function saveFiscalData(d) { saveSetting('cortoba_fiscal', d); }

// ── Calculs depuis les vraies données ──
function calcTVAMoisAnnee(annee, mois) {
  var factures = getFactures().filter(function(f) {
    if (f.statut !== 'Payée') return false;
    var d = new Date(f.dateEmission || f.date_emission || f.echeance || '');
    return !isNaN(d) && d.getFullYear() === annee && d.getMonth() + 1 === mois;
  });
  var depenses = getDepenses().filter(function(d) {
    var dt = new Date(d.date || d.dateDep || '');
    return !isNaN(dt) && dt.getFullYear() === annee && dt.getMonth() + 1 === mois;
  });
  var tvaCol = 0;
  factures.forEach(function(f) { tvaCol += parseFloat(f.montantTva || f.montant_tva || f.tva || 0); });
  var tvaDed = 0;
  depenses.forEach(function(d) {
    var ht  = parseFloat(d.montantHT || d.montant_ht || d.montant || 0);
    var tva = parseFloat(d.montantTVA || d.montant_tva || 0);
    if (!tva && ht) tva = ht * 0.19; // estimation 19% si absent
    tvaDed += tva;
  });
  return { collectee: tvaCol, deductible: tvaDed, nette: Math.max(0, tvaCol - tvaDed) };
}

function calcRASAnnee(annee) {
  var total = 0;
  getFactures().forEach(function(f) {
    var d = new Date(f.dateEmission || f.date_emission || f.echeance || '');
    if (!isNaN(d) && d.getFullYear() === annee && f.statut === 'Payée') {
      total += parseFloat(f.rasAmt || f.ras_amt || 0);
    }
  });
  return total;
}

function calcCAHT(annee) {
  var total = 0;
  getFactures().forEach(function(f) {
    var d = new Date(f.dateEmission || f.date_emission || f.echeance || '');
    if (!isNaN(d) && d.getFullYear() === annee && f.statut === 'Payée') {
      total += parseFloat(f.montantHt || f.montant_ht || 0);
    }
  });
  return total;
}

function calcChargesAnnee(annee) {
  var total = 0;
  getDepenses().forEach(function(d) {
    var dt = new Date(d.date || d.dateDep || '');
    if (!isNaN(dt) && dt.getFullYear() === annee) {
      total += parseFloat(d.montantTTC || d.montant || 0);
    }
  });
  return total;
}

// ── Alertes fiscales ──
function renderFiscalAlerts() {
  var wrap = document.getElementById('fiscal-alerts-wrap');
  if (!wrap) return;
  var alerts = [];
  var now = new Date();
  var yr  = now.getFullYear();
  var mo  = now.getMonth() + 1;

  // Déclaration annuelle IRPP
  var irppDate = new Date(yr, 4, 25); // 25 mai
  if (irppDate > now) {
    var j = jours(irppDate);
    if (j <= 60) alerts.push({ level: j <= 14 ? 'red' : 'orange', msg: 'Déclaration annuelle IRPP ' + (yr-1) + ' — avant le 25 mai ' + yr, detail: 'Professions libérales & architectes. Dans ' + j + ' jour(s).' });
  }

  // Acomptes provisionnels
  var fiscal = getFiscalData();
  var irppRef = parseFloat((fiscal.irppRef||{}).montant || 0);
  var acompte = Math.round(irppRef * 0.30 * 1000) / 1000;
  [
    { label: '1er acompte IRPP (30%)', date: new Date(yr, 5, 25) },
    { label: '2ème acompte IRPP (30%)', date: new Date(yr, 8, 25) },
    { label: '3ème acompte IRPP (30%)', date: new Date(yr, 11, 25) },
  ].forEach(function(ac) {
    if (ac.date > now) {
      var j2 = jours(ac.date);
      if (j2 <= 30) alerts.push({ level: j2 <= 7 ? 'red' : 'orange', msg: ac.label + ' — ' + fmtTND(acompte), detail: 'Échéance : ' + ac.date.toLocaleDateString('fr-FR') + '. Dans ' + j2 + ' jour(s).' });
    } else {
      var j2n = Math.abs(jours(ac.date));
      if (j2n <= 14) alerts.push({ level: 'red', msg: ac.label + ' — EN RETARD', detail: 'Échéance dépassée depuis ' + j2n + ' jour(s). Pénalités applicables.' });
    }
  });

  // TVA mensuelle
  var tvaEch = dateEcheanceMensuelle(yr, mo === 1 ? 12 : mo - 1);
  var tvaJours = jours(tvaEch);
  if (tvaJours <= 7 && tvaJours >= 0) {
    var tvaData = calcTVAMoisAnnee(yr, mo === 1 ? 12 : mo - 1);
    alerts.push({ level: 'orange', msg: 'Déclaration TVA de ' + nomMoisComplet(mo===1?12:mo-1) + ' — ' + fmtTND(tvaData.nette), detail: 'Échéance : 28/' + (mo===1?'01':String(mo).padStart(2,'0')) + '. Dans ' + tvaJours + ' jour(s).' });
  }

  // Badge nav
  var badge = document.getElementById('fiscalite-badge');
  if (badge) {
    var urg = alerts.filter(function(a){ return a.level === 'red'; }).length;
    if (urg > 0) { badge.textContent = urg; badge.style.display = ''; }
    else badge.style.display = 'none';
  }

  if (!alerts.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = alerts.map(function(a) {
    var col = a.level === 'red' ? '#e07b72' : '#c8a96e';
    var bg  = a.level === 'red' ? 'rgba(224,123,114,0.08)' : 'rgba(200,169,110,0.08)';
    return '<div style="display:flex;align-items:flex-start;gap:0.8rem;padding:0.8rem 1rem;background:'+bg+';border:1px solid '+col+';border-radius:6px;margin-bottom:0.5rem">'
      + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="'+col+'" stroke-width="2" style="flex-shrink:0;margin-top:2px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
      + '<div><div style="font-size:0.85rem;font-weight:600;color:'+col+'">'+a.msg+'</div>'
      + '<div style="font-size:0.78rem;color:var(--text-3);margin-top:0.15rem">'+a.detail+'</div></div>'
      + '</div>';
  }).join('');
}

// ── KPIs fiscaux ──
function renderFiscalKPIs() {
  var yr  = getYear();
  var ca  = calcCAHT(yr);
  var ch  = calcChargesAnnee(yr);
  var ras = calcRASAnnee(yr);
  var revNet = Math.max(0, ca - ch);
  var irppEst = calcIRPP(revNet);
  var irppNet = Math.max(0, irppEst - ras);

  // TVA année en cours (cumul)
  var tvaCol = 0, tvaDed = 0;
  for (var m = 1; m <= 12; m++) {
    var t = calcTVAMoisAnnee(yr, m);
    tvaCol += t.collectee; tvaDed += t.deductible;
  }
  var tvaNet = Math.max(0, tvaCol - tvaDed);

  function setEl(id, val) { var el = document.getElementById(id); if (el) el.innerHTML = val; }

  setEl('fk-ca', '<span style="font-size:1.1rem;font-weight:700">' + fmtTND(ca) + '</span>');
  setEl('fk-ca-sub', 'Charges déductibles : ' + fmtTND(ch));
  setEl('fk-tva-col', '<span style="font-size:1.1rem;font-weight:700">' + fmtTND(tvaCol) + '</span>');
  setEl('fk-tva-ded', '<span style="font-size:1.1rem;font-weight:700">' + fmtTND(tvaDed) + '</span>');
  setEl('fk-tva-net', '<span style="font-size:1.1rem;font-weight:700">' + fmtTND(tvaNet) + '</span>');
  setEl('fk-tva-ech', 'Prochain dépôt : 28/' + String(getMonth()+1>12?'01':getMonth()+1).padStart(2,'0'));
  setEl('fk-ras', '<span style="font-size:1.1rem;font-weight:700">' + fmtTND(ras) + '</span>');
  setEl('fk-irpp', '<span style="font-size:1.1rem;font-weight:700">' + fmtTND(irppNet) + '</span>');
  setEl('fk-irpp-sub', 'Après déduction RAS | Base : ' + fmtTND(revNet));
}

// ── Calendrier fiscal ──
function renderFiscalCalendar() {
  var el = document.getElementById('fiscal-calendar');
  if (!el) return;
  var yr = getYear();
  var now = new Date();
  var fiscal = getFiscalData();
  var irppRef = parseFloat((fiscal.irppRef||{}).montant || 0);
  var acompte = Math.round(irppRef * 0.30 * 1000) / 1000;
  var labelYr = document.getElementById('fiscal-year-label');
  if (labelYr) labelYr.textContent = yr;

  var events = [
    { date: new Date(yr, 0, 28),  label: 'TVA + RAS déclaration décembre N-1',    type: 'tva' },
    { date: new Date(yr, 1, 28),  label: 'TVA + RAS déclaration janvier',          type: 'tva' },
    { date: new Date(yr, 2, 28),  label: 'TVA + RAS déclaration février',          type: 'tva' },
    { date: new Date(yr, 3, 28),  label: 'TVA + RAS déclaration mars',             type: 'tva' },
    { date: new Date(yr, 4, 25),  label: 'Déclaration annuelle IRPP N-1',          type: 'irpp', montant: null, urgent: true },
    { date: new Date(yr, 4, 28),  label: 'TVA + RAS déclaration avril',            type: 'tva' },
    { date: new Date(yr, 5, 25),  label: '1er acompte IRPP (30%)',                 type: 'acompte', montant: acompte },
    { date: new Date(yr, 5, 28),  label: 'TVA + RAS déclaration mai',              type: 'tva' },
    { date: new Date(yr, 6, 28),  label: 'TVA + RAS déclaration juin',             type: 'tva' },
    { date: new Date(yr, 7, 28),  label: 'TVA + RAS déclaration juillet',          type: 'tva' },
    { date: new Date(yr, 8, 25),  label: '2ème acompte IRPP (30%)',                type: 'acompte', montant: acompte },
    { date: new Date(yr, 8, 28),  label: 'TVA + RAS déclaration août',             type: 'tva' },
    { date: new Date(yr, 9, 28),  label: 'TVA + RAS déclaration septembre',        type: 'tva' },
    { date: new Date(yr, 10, 28), label: 'TVA + RAS déclaration octobre',          type: 'tva' },
    { date: new Date(yr, 11, 25), label: '3ème acompte IRPP (30%)',                type: 'acompte', montant: acompte },
    { date: new Date(yr, 11, 28), label: 'TVA + RAS déclaration novembre',         type: 'tva' },
  ].sort(function(a,b){ return a.date - b.date; });

  var colors = { tva:'#6fa8d6', irpp:'#c8a96e', acompte:'#e07b72' };
  var icons  = { tva:'📋', irpp:'📊', acompte:'💰' };

  el.innerHTML = '<div style="display:flex;flex-direction:column;gap:0.35rem;max-height:320px;overflow-y:auto;padding-right:0.3rem">'
    + events.map(function(ev) {
        var isPast    = ev.date < now;
        var isClose   = !isPast && jours(ev.date) <= 14;
        var col = isPast ? 'var(--text-3)' : (isClose ? colors[ev.type] : 'var(--text-2)');
        var bg  = isPast ? 'transparent' : (isClose ? 'rgba('+hexToRgb(colors[ev.type])+',0.06)' : 'transparent');
        return '<div style="display:flex;align-items:center;gap:0.7rem;padding:0.4rem 0.6rem;border-radius:5px;background:'+bg+';border:1px solid '+(isClose?colors[ev.type]:'transparent')+';opacity:'+(isPast?'0.45':'1')+'">'
          + '<span style="font-size:0.75rem;font-family:var(--font-mono);color:'+col+';white-space:nowrap;min-width:75px">'
          + ev.date.toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit'}) + '</span>'
          + '<span style="font-size:0.7rem">' + icons[ev.type] + '</span>'
          + '<span style="font-size:0.8rem;color:'+col+';flex:1">' + ev.label
          + (ev.montant ? ' <strong style="color:var(--accent)">— ' + fmtTND(ev.montant) + '</strong>' : '')
          + '</span>'
          + (isPast ? '<span style="font-size:0.65rem;color:var(--text-3)">✓</span>' : badgeEcheance(ev.date))
          + '</div>';
      }).join('')
    + '</div>';
}

function hexToRgb(hex) {
  var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return r+','+g+','+b;
}

// ── TVA mensuelle ──
function renderTVAMensuelle() {
  var sel = document.getElementById('tva-annee-sel');
  var yr  = sel ? parseInt(sel.value) : getYear();
  var el  = document.getElementById('tva-mensuelle-table');
  if (!el) return;
  var now = new Date();
  var fiscal = getFiscalData();
  var decls  = (fiscal.declarationsMensuelles || {});

  var rows = '';
  for (var m = 1; m <= 12; m++) {
    var tva  = calcTVAMoisAnnee(yr, m);
    var ech  = dateEcheanceMensuelle(yr, m);
    var key  = yr + '-' + String(m).padStart(2,'0');
    var done = !!(decls[key] && decls[key].faite);
    var isFuture = new Date(yr, m - 1, 1) > now;

    var netStyle = tva.nette > 0 ? 'color:var(--red);font-weight:600' : 'color:var(--green)';
    rows += '<tr>'
      + '<td style="font-size:0.78rem;color:var(--text-2)">' + nomMoisComplet(m) + '</td>'
      + '<td style="text-align:right;font-size:0.78rem">' + (isFuture ? '—' : fmtTND(tva.collectee)) + '</td>'
      + '<td style="text-align:right;font-size:0.78rem">' + (isFuture ? '—' : fmtTND(tva.deductible)) + '</td>'
      + '<td style="text-align:right;font-size:0.78rem;' + (isFuture?'':netStyle) + '">' + (isFuture ? '—' : fmtTND(tva.nette)) + '</td>'
      + '<td style="text-align:center;font-size:0.72rem">' + (isFuture ? '<span style="color:var(--text-3)">—</span>' : ech.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})) + '</td>'
      + '<td style="text-align:center">'
      + (isFuture ? '' : '<label style="cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.3rem">'
        + '<input type="checkbox" '+(done?'checked':'')+' onchange="toggleDeclaration(\''+key+'\',this.checked)" style="accent-color:var(--accent)">'
        + '<span style="font-size:0.7rem;color:var(--text-3)">'+(done?'Faite':'À faire')+'</span></label>')
      + '</td>'
      + '</tr>';
  }

  // Totaux
  var totCol = 0, totDed = 0, totNet = 0;
  for (var mm = 1; mm <= 12; mm++) {
    var t2 = calcTVAMoisAnnee(yr, mm);
    totCol += t2.collectee; totDed += t2.deductible; totNet += t2.nette;
  }

  el.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:0.8rem">'
    + '<thead><tr style="border-bottom:1px solid var(--border)">'
    + '<th style="text-align:left;padding:0.4rem 0.5rem;font-size:0.7rem;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em">Mois</th>'
    + '<th style="text-align:right;padding:0.4rem 0.5rem;font-size:0.7rem;color:var(--text-3)">Collectée</th>'
    + '<th style="text-align:right;padding:0.4rem 0.5rem;font-size:0.7rem;color:var(--text-3)">Déductible</th>'
    + '<th style="text-align:right;padding:0.4rem 0.5rem;font-size:0.7rem;color:var(--text-3)">Nette</th>'
    + '<th style="text-align:center;padding:0.4rem 0.5rem;font-size:0.7rem;color:var(--text-3)">Échéance</th>'
    + '<th style="text-align:center;padding:0.4rem 0.5rem;font-size:0.7rem;color:var(--text-3)">Statut</th>'
    + '</tr></thead><tbody>' + rows + '</tbody>'
    + '<tfoot><tr style="border-top:2px solid var(--accent)">'
    + '<td style="padding:0.5rem;font-weight:600;font-size:0.8rem">Total ' + yr + '</td>'
    + '<td style="text-align:right;padding:0.5rem;font-size:0.8rem">' + fmtTND(totCol) + '</td>'
    + '<td style="text-align:right;padding:0.5rem;font-size:0.8rem;color:var(--green)">' + fmtTND(totDed) + '</td>'
    + '<td style="text-align:right;padding:0.5rem;font-size:0.8rem;color:var(--accent);font-weight:700">' + fmtTND(totNet) + '</td>'
    + '<td colspan="2"></td></tr></tfoot></table>';
}

function toggleDeclaration(key, checked) {
  var fiscal = getFiscalData();
  if (!fiscal.declarationsMensuelles) fiscal.declarationsMensuelles = {};
  fiscal.declarationsMensuelles[key] = { faite: checked, date: new Date().toISOString() };
  saveFiscalData(fiscal);
  renderFiscalAlerts();
}

// ── Acomptes provisionnels ──
function renderAcomptes() {
  var el = document.getElementById('acomptes-wrap');
  if (!el) return;
  var yr     = getYear();
  var fiscal = getFiscalData();
  var irppRef= parseFloat((fiscal.irppRef||{}).montant || 0);
  var acomp  = Math.round(irppRef * 0.30 * 1000) / 1000;
  var verses = fiscal.acomptesVerses || {};

  var echeances = [
    { key: yr+'-AC1', label: '1er acompte', date: new Date(yr, 5, 25), montant: acomp },
    { key: yr+'-AC2', label: '2ème acompte', date: new Date(yr, 8, 25), montant: acomp },
    { key: yr+'-AC3', label: '3ème acompte', date: new Date(yr, 11, 25), montant: acomp },
  ];
  var totalVerses = 0;
  Object.values(verses).forEach(function(v){ totalVerses += parseFloat(v.montant||0); });

  el.innerHTML = (irppRef === 0
    ? '<div style="padding:0.8rem;background:var(--bg-2);border-radius:6px;font-size:0.82rem;color:var(--text-3)">Saisissez l\'IRPP N-1 via le bouton <strong style="color:var(--accent)">Saisir IRPP N-1</strong> pour calculer vos acomptes.</div>'
    : '') +
    '<div style="display:flex;flex-direction:column;gap:0.6rem;margin-bottom:0.8rem">'
    + echeances.map(function(ac) {
        var done = !!(verses[ac.key]);
        var isPast = ac.date < new Date();
        return '<div style="display:flex;align-items:center;gap:0.8rem;padding:0.7rem 0.9rem;border:1px solid '+(done?'var(--green)':isPast?'var(--red)':'var(--border)')+';border-radius:6px;background:'+(done?'rgba(90,171,110,0.06)':isPast?'rgba(224,123,114,0.06)':'var(--bg-2)')+'">'
          + '<div style="flex:1">'
          + '<div style="font-size:0.85rem;font-weight:500;color:var(--text)">' + ac.label + '</div>'
          + '<div style="font-size:0.75rem;color:var(--text-3);margin-top:1px">Échéance : ' + ac.date.toLocaleDateString('fr-FR') + '</div>'
          + '</div>'
          + '<div style="font-family:var(--font-mono);font-size:0.9rem;color:var(--accent);font-weight:700;min-width:120px;text-align:right">' + fmtTND(ac.montant) + '</div>'
          + '<label style="cursor:pointer;display:flex;align-items:center;gap:0.4rem;flex-shrink:0">'
          + '<input type="checkbox" '+(done?'checked':'')+' onchange="toggleAcompte(\''+ac.key+'\',this.checked,'+ac.montant+')" style="accent-color:var(--accent);width:14px;height:14px">'
          + '<span style="font-size:0.75rem;color:var(--text-3)">'+(done?'Versé':'À verser')+'</span>'
          + '</label></div>';
      }).join('')
    + '</div>'
    + (irppRef > 0 ? '<div style="padding:0.6rem 0.9rem;background:var(--bg-2);border-radius:6px;display:flex;justify-content:space-between;font-size:0.82rem">'
      + '<span style="color:var(--text-3)">Total acomptes versés</span>'
      + '<span style="font-family:var(--font-mono);color:var(--green);font-weight:600">' + fmtTND(totalVerses) + ' / ' + fmtTND(acomp * 3) + '</span>'
      + '</div>' : '');
}

function toggleAcompte(key, checked, montant) {
  var fiscal = getFiscalData();
  if (!fiscal.acomptesVerses) fiscal.acomptesVerses = {};
  if (checked) fiscal.acomptesVerses[key] = { montant: montant, date: new Date().toISOString() };
  else delete fiscal.acomptesVerses[key];
  saveFiscalData(fiscal);
  renderAcomptes();
  renderFiscalAlerts();
}

// ── RAS récapitulatif ──
function renderRASRecap() {
  var el = document.getElementById('ras-recap-wrap');
  if (!el) return;
  var yr = getYear();
  var factures = getFactures().filter(function(f) {
    var d = new Date(f.dateEmission||f.date_emission||f.echeance||'');
    return !isNaN(d) && d.getFullYear() === yr;
  });
  var rasTotal = 0;
  var rows = factures.filter(function(f){ return parseFloat(f.rasAmt||f.ras_amt||0) > 0; }).map(function(f) {
    var ras = parseFloat(f.rasAmt||f.ras_amt||0);
    rasTotal += ras;
    return '<tr><td style="font-size:0.78rem">' + (f.num||f.numero||'—') + '</td>'
      + '<td style="font-size:0.78rem">' + (f.client||'—') + '</td>'
      + '<td style="text-align:right;font-size:0.78rem;font-family:var(--font-mono)">' + fmtTND(parseFloat(f.montantHt||f.montant_ht||0)) + '</td>'
      + '<td style="text-align:center;font-size:0.78rem">' + (f.rasTaux||f.ras_taux||'10') + '%</td>'
      + '<td style="text-align:right;font-size:0.78rem;font-family:var(--font-mono);color:#6fa8d6;font-weight:600">' + fmtTND(ras) + '</td>'
      + '</tr>';
  });

  if (rows.length === 0) {
    el.innerHTML = '<div style="font-size:0.82rem;color:var(--text-3);padding:0.5rem 0">Aucune retenue à la source enregistrée pour ' + yr + '.</div>';
    return;
  }
  el.innerHTML = '<table style="width:100%;border-collapse:collapse">'
    + '<thead><tr style="border-bottom:1px solid var(--border)">'
    + '<th style="text-align:left;padding:0.3rem 0.4rem;font-size:0.7rem;color:var(--text-3)">Facture</th>'
    + '<th style="text-align:left;padding:0.3rem 0.4rem;font-size:0.7rem;color:var(--text-3)">Client</th>'
    + '<th style="text-align:right;padding:0.3rem 0.4rem;font-size:0.7rem;color:var(--text-3)">HT</th>'
    + '<th style="text-align:center;padding:0.3rem 0.4rem;font-size:0.7rem;color:var(--text-3)">Taux</th>'
    + '<th style="text-align:right;padding:0.3rem 0.4rem;font-size:0.7rem;color:var(--text-3)">RAS</th>'
    + '</tr></thead><tbody>' + rows.join('') + '</tbody>'
    + '<tfoot><tr style="border-top:1px solid var(--border)">'
    + '<td colspan="4" style="padding:0.4rem;font-size:0.8rem;font-weight:600">Total RAS ' + yr + '</td>'
    + '<td style="text-align:right;padding:0.4rem;font-family:var(--font-mono);color:#6fa8d6;font-weight:700">' + fmtTND(rasTotal) + '</td>'
    + '</tr></tfoot></table>';
}

// ── Barème IRPP tableau ──
function renderIRPPBareme() {
  var el = document.getElementById('irpp-bareme-tbody');
  if (!el) return;
  var cumul = 0;
  el.innerHTML = IRPP_BAREME.map(function(t) {
    var impotTranche = t.a === Infinity ? '—' : fmtTND((t.a - t.de) * t.taux / 100);
    return '<tr><td style="padding:0.45rem 0.6rem;font-size:0.8rem">' + t.libelle + '</td>'
      + '<td style="text-align:center;padding:0.45rem 0.6rem;font-size:0.8rem;font-weight:700;color:'+(t.taux===0?'var(--text-3)':'var(--accent)')+'">' + t.taux + '%</td>'
      + '<td style="text-align:right;padding:0.45rem 0.6rem;font-size:0.78rem;color:var(--text-2)">' + impotTranche + '</td>'
      + '</tr>';
  }).join('');
}

// ── Simulation IRPP ──
function calcIRPPSim() {
  var revEl  = document.getElementById('irpp-sim-revenu');
  var dedEl  = document.getElementById('irpp-sim-deductions');
  var rasEl  = document.getElementById('irpp-sim-ras');
  var res    = document.getElementById('irpp-sim-result');
  if (!res) return;
  var rev    = parseFloat((revEl||{}).value||0);
  var ded    = parseFloat((dedEl||{}).value||0);
  var ras    = parseFloat((rasEl||{}).value||0);
  if (!rev) { res.innerHTML = ''; return; }
  var base   = Math.max(0, rev - ded);
  var irpp   = calcIRPP(base);
  var net    = Math.max(0, irpp - ras);
  var tEffectif = rev > 0 ? Math.round(net / rev * 1000) / 10 : 0;

  res.innerHTML = '<div style="display:flex;flex-direction:column;gap:0.5rem">'
    + row('Revenu brut',           fmtTND(rev),  '')
    + row('Déductions',            '− ' + fmtTND(ded), 'color:var(--green)')
    + row('Base imposable',        fmtTND(base), 'font-weight:600')
    + '<div style="height:1px;background:var(--border);margin:0.2rem 0"></div>'
    + row('IRPP brut (barème)',    fmtTND(irpp), 'color:var(--red)')
    + row('RAS déjà versée',       '− ' + fmtTND(ras), 'color:var(--green)')
    + '<div style="height:1px;background:var(--accent);margin:0.2rem 0"></div>'
    + row('IRPP NET À PAYER', fmtTND(net), 'color:var(--accent);font-weight:700;font-size:1rem')
    + row('Taux effectif', tEffectif + '%', 'color:var(--text-2)')
    + '</div>';

  function row(label, val, style) {
    return '<div style="display:flex;justify-content:space-between;font-size:0.82rem">'
      + '<span style="color:var(--text-3)">' + label + '</span>'
      + '<span style="font-family:var(--font-mono);' + (style||'') + '">' + val + '</span></div>';
  }
}

// ── Déclarations mensuelles checklist ──
function renderDeclarationsMensuelles() {
  var el = document.getElementById('declarations-mensuelle-wrap');
  if (!el) return;
  var yr     = getYear();
  var mo     = getMonth();
  var fiscal = getFiscalData();
  var decls  = fiscal.declarationsMensuelles || {};
  var rows   = '';

  for (var m = Math.max(1, mo - 2); m <= mo; m++) {
    var key  = yr + '-' + String(m).padStart(2,'0');
    var tva  = calcTVAMoisAnnee(yr, m);
    var ech  = dateEcheanceMensuelle(yr, m);
    var done = !!(decls[key] && decls[key].faite);
    var late = !done && ech < new Date();

    rows += '<div style="display:flex;align-items:center;gap:1rem;padding:0.7rem 1rem;border:1px solid '+(late?'var(--red)':done?'var(--green)':'var(--border)')+';border-radius:6px;background:'+(late?'rgba(224,123,114,0.05)':done?'rgba(90,171,110,0.05)':'var(--bg-2)')+';margin-bottom:0.5rem">'
      + '<div style="flex:1">'
      + '<div style="font-size:0.85rem;font-weight:500">' + nomMoisComplet(m) + ' ' + yr + '</div>'
      + '<div style="font-size:0.75rem;color:var(--text-3);margin-top:2px">'
      + 'TVA collectée : <strong>' + fmtTND(tva.collectee) + '</strong>'
      + ' · Déductible : <strong style="color:var(--green)">' + fmtTND(tva.deductible) + '</strong>'
      + ' · Nette : <strong style="color:var(--accent)">' + fmtTND(tva.nette) + '</strong>'
      + '</div></div>'
      + '<div style="text-align:right;font-size:0.75rem;color:var(--text-3);min-width:90px">'
      + 'Éch. ' + ech.toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit'})
      + (late ? '<br><span style="color:var(--red);font-weight:600">EN RETARD</span>' : '')
      + '</div>'
      + '<label style="cursor:pointer;display:flex;align-items:center;gap:0.4rem;flex-shrink:0;padding:0.4rem 0.7rem;border-radius:4px;background:'+(done?'rgba(90,171,110,0.1)':'rgba(200,169,110,0.06)')+'">'
      + '<input type="checkbox" '+(done?'checked':'')+' onchange="toggleDeclaration(\''+key+'\',this.checked)" style="accent-color:var(--accent)">'
      + '<span style="font-size:0.78rem;color:'+(done?'var(--green)':'var(--text-2)')+';">'+(done?'✓ Faite':'À déclarer')+'</span>'
      + '</label></div>';
  }
  el.innerHTML = rows || '<div style="color:var(--text-3);font-size:0.82rem">Aucune donnée disponible.</div>';
}

// ── Modal IRPP N-1 ──
function previewAcomptes() {
  var montant = parseFloat((document.getElementById('irpp-montant-ref')||{}).value||0);
  var verses  = parseFloat((document.getElementById('irpp-acomptes-verses')||{}).value||0);
  var el = document.getElementById('irpp-preview');
  if (!el) return;
  if (!montant) { el.style.display = 'none'; return; }
  var acomp = Math.round(montant * 0.30 * 1000) / 1000;
  el.style.display = 'block';
  el.innerHTML = '<div style="font-size:0.8rem;display:flex;flex-direction:column;gap:0.4rem">'
    + '<div style="display:flex;justify-content:space-between"><span style="color:var(--text-3)">IRPP N-1</span><span style="font-family:var(--font-mono)">' + fmtTND(montant) + '</span></div>'
    + '<div style="display:flex;justify-content:space-between"><span style="color:var(--text-3)">Acompte × 3 (30% chacun)</span><span style="font-family:var(--font-mono);color:var(--accent)">' + fmtTND(acomp) + ' × 3 = ' + fmtTND(acomp*3) + '</span></div>'
    + (verses > 0 ? '<div style="display:flex;justify-content:space-between"><span style="color:var(--text-3)">Déjà versé</span><span style="font-family:var(--font-mono);color:var(--green)">− ' + fmtTND(verses) + '</span></div>' : '')
    + '</div>';
}

function saveIRPPRef() {
  var annee   = parseInt((document.getElementById('irpp-annee-ref')||{}).value || (getYear()-1));
  var montant = parseFloat((document.getElementById('irpp-montant-ref')||{}).value || 0);
  var verses  = parseFloat((document.getElementById('irpp-acomptes-verses')||{}).value || 0);
  var fiscal  = getFiscalData();
  fiscal.irppRef = { annee: annee, montant: montant, acomptesVerses: verses };
  saveFiscalData(fiscal);
  closeModal('modal-irpp');
  renderFiscalitePage();
  showToast('IRPP N-1 enregistré — acomptes calculés');
}

// ── Sélecteur années TVA ──
function initTVAAnneeSel() {
  var sel = document.getElementById('tva-annee-sel');
  if (!sel) return;
  var yr = getYear();
  sel.innerHTML = '';
  for (var y = yr; y >= yr - 3; y--) {
    var opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    if (y === yr) opt.selected = true;
    sel.appendChild(opt);
  }
}

// ── Export PDF fiscal ──
function exportFiscalitePDF() {
  var yr = getYear();
  var ca = calcCAHT(yr), ch = calcChargesAnnee(yr);
  var revNet = Math.max(0, ca - ch);
  var irpp = calcIRPP(revNet), ras = calcRASAnnee(yr);
  var tvaRows = '';
  var totCol=0, totDed=0, totNet=0;
  for (var m=1; m<=12; m++) {
    var t = calcTVAMoisAnnee(yr, m);
    totCol+=t.collectee; totDed+=t.deductible; totNet+=t.nette;
    tvaRows += '<tr><td>'+nomMoisComplet(m)+'</td><td style="text-align:right">'+t.collectee.toFixed(3)+'</td><td style="text-align:right;color:green">'+t.deductible.toFixed(3)+'</td><td style="text-align:right;font-weight:600">'+t.nette.toFixed(3)+'</td></tr>';
  }
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Rapport Fiscal '+yr+'</title>'
    + '<style>body{font-family:Helvetica,Arial,sans-serif;padding:2cm;color:#222;font-size:9pt}h1{color:#c8a96e;font-size:16pt;margin-bottom:4pt}h2{font-size:11pt;color:#555;margin:16pt 0 6pt;border-bottom:1pt solid #eee;padding-bottom:4pt}table{width:100%;border-collapse:collapse;margin-bottom:12pt}th,td{border:0.5pt solid #ddd;padding:4pt 6pt;font-size:8.5pt}th{background:#f5f5f5;font-weight:600}.gold{color:#c8a96e;font-weight:700}.right{text-align:right}</style>'
    + '</head><body>'
    + '<h1>Rapport Fiscal — Cortoba Architecture Studio</h1>'
    + '<p style="color:#888;font-size:8pt">Exercice ' + yr + ' · Généré le ' + new Date().toLocaleDateString('fr-FR') + '</p>'
    + '<h2>Synthèse financière</h2>'
    + '<table><tr><td>CA HT encaissé</td><td class="right">' + ca.toFixed(3) + ' TND</td></tr>'
    + '<tr><td>Charges déductibles</td><td class="right">− ' + ch.toFixed(3) + ' TND</td></tr>'
    + '<tr><td><strong>Revenu net imposable</strong></td><td class="right gold">' + revNet.toFixed(3) + ' TND</td></tr>'
    + '<tr><td>IRPP estimé (barème progressif)</td><td class="right">' + irpp.toFixed(3) + ' TND</td></tr>'
    + '<tr><td>RAS versée par les clients</td><td class="right" style="color:green">− ' + ras.toFixed(3) + ' TND</td></tr>'
    + '<tr><td><strong>IRPP NET à payer</strong></td><td class="right gold">' + Math.max(0,irpp-ras).toFixed(3) + ' TND</td></tr></table>'
    + '<h2>TVA mensuelle ' + yr + '</h2>'
    + '<table><thead><tr><th>Mois</th><th class="right">Collectée</th><th class="right">Déductible</th><th class="right">Nette</th></tr></thead><tbody>' + tvaRows + '</tbody>'
    + '<tfoot><tr><td><strong>Total</strong></td><td class="right"><strong>'+totCol.toFixed(3)+'</strong></td><td class="right" style="color:green"><strong>'+totDed.toFixed(3)+'</strong></td><td class="right gold"><strong>'+totNet.toFixed(3)+'</strong></td></tr></tfoot></table>'
    + '<scr'+'ipt>window.addEventListener("load",function(){setTimeout(function(){window.print();},300);});<\/scr'+'ipt></body></html>';
  var win = null; try { win = window.open('','_blank'); } catch(e){}
  if (win && win.document) { win.document.write(html); win.document.close(); }
  else { var blob=new Blob([html],{type:'text/html;charset=utf-8'}); var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.target='_blank'; a.rel='noopener'; document.body.appendChild(a); a.click(); document.body.removeChild(a); }
}

// ── Render complet de la page ──
function renderFiscalitePage() {
  renderFiscalAlerts();
  renderFiscalKPIs();
  renderFiscalCalendar();
  initTVAAnneeSel();
  renderTVAMensuelle();
  renderAcomptes();
  renderRASRecap();
  renderIRPPBareme();
  renderDeclarationsMensuelles();
  // Pré-remplir modal IRPP si déjà sauvé
  var fiscal = getFiscalData();
  var ref = fiscal.irppRef || {};
  var anneeEl = document.getElementById('irpp-annee-ref');
  var montantEl = document.getElementById('irpp-montant-ref');
  if (anneeEl && ref.annee) anneeEl.value = ref.annee;
  if (montantEl && ref.montant) { montantEl.value = ref.montant; previewAcomptes(); }
  // Simulation avec données réelles
  var yr = getYear();
  var ca = calcCAHT(yr), ch = calcChargesAnnee(yr), ras = calcRASAnnee(yr);
  var simRevEl = document.getElementById('irpp-sim-revenu');
  var simDedEl = document.getElementById('irpp-sim-deductions');
  var simRasEl = document.getElementById('irpp-sim-ras');
  if (simRevEl && !simRevEl.value) simRevEl.value = Math.round(ca);
  if (simDedEl && !simDedEl.value) simDedEl.value = Math.round(ch);
  if (simRasEl && !simRasEl.value) simRasEl.value = Math.round(ras);
  calcIRPPSim();
}

// ═══════════════════════════════════════════════════════════════════════
//  PATCH JS — Module Équipe & Gestion des accès — Cortoba Atelier
//  À ajouter dans plateforme.js (ou dans un <script> après le JS principal)
// ═══════════════════════════════════════════════════════════════════════

// ── Modules disponibles dans la plateforme (cache / fallback) ──
// La liste réelle est chargée dynamiquement depuis api/modules.php
var MODULES_PLATEFORME = [
  { id: 'dashboard',   label: 'Tableau de bord' },
  { id: 'demandes',    label: 'Demandes' },
  { id: 'devis',       label: 'Offres & Devis' },
  { id: 'projets',     label: 'Projets' },
  { id: 'suivi',       label: 'Suivi' },
  { id: 'journal',     label: 'Journal quotidien' },
  { id: 'rendement',   label: 'Rendement' },
  { id: 'facturation', label: 'Facturation' },
  { id: 'bilans',      label: 'Bilans' },
  { id: 'depenses',    label: 'Dépenses' },
  { id: 'fiscalite',   label: 'Fiscalité' },
  { id: 'nas',         label: 'Serveur NAS' },
  { id: 'equipe',      label: 'Équipe' },
  { id: 'clients',     label: 'Clients' },
  { id: 'demandes-admin', label: 'Demandes admin' },
  { id: 'conges',      label: 'Congés' },
  { id: 'parametres',  label: 'Paramètres' },
];

// Charge la liste dynamique depuis l'API (avec fallback cache local)
function loadModulesFromAPI() {
  return apiFetch('api/modules.php')
    .then(function(r) {
      var arr = r.data || [];
      if (Array.isArray(arr) && arr.length > 0) {
        MODULES_PLATEFORME = arr.map(function(m){
          return { id: m.id, label: m.label, route_url: m.route_url, categorie: m.categorie };
        });
        saveSetting('cortoba_modules_cache', MODULES_PLATEFORME);
      }
      return MODULES_PLATEFORME;
    })
    .catch(function() {
      var cached = getSetting('cortoba_modules_cache', null);
      if (Array.isArray(cached) && cached.length > 0) MODULES_PLATEFORME = cached;
      return MODULES_PLATEFORME;
    });
}

// Met à jour la zone utilisateur du header (avec avatar miniature)
function updateHeaderUserDisplay(user) {
  if (user) window._currentUser = user;
  var el = document.getElementById('user-display');
  if (!el || !user) return;
  var name  = user.name || '';
  var photo = user.profile_picture_url || null;
  // Chercher aussi dans la liste des membres si on a un id
  if (!photo && user.id) {
    var arr = getSetting('cortoba_membres', []);
    var found = (arr || []).find(function(m){ return m.id === user.id; });
    if (found && found.profile_picture_url) photo = found.profile_picture_url;
  }
  var avatar = photo
    ? '<div class="member-avatar sm"><img src="'+photo.replace(/"/g,'&quot;')+'" alt=""></div>'
    : '<div class="header-user-dot"></div>';
  el.innerHTML = avatar + '<span>' + (name).replace(/</g,'&lt;') + '</span>';
}

// Helper : l'utilisateur courant peut-il voir les données sensibles (salaire, perso) ?
function canViewSensitiveMember() {
  var s = getSession();
  if (!s) return false;
  if (s.isAdmin) return true;
  if (s.role === 'Architecte gérant') return true;
  return false;
}

// Modules par défaut selon rôle (pré-coché automatiquement à la sélection)
var MODULES_PAR_ROLE = {
  'Architecte gérant':       ['dashboard','demandes','devis','projets','suivi','journal','rendement','facturation','bilans','depenses','fiscalite','nas','equipe','clients','demandes-admin','parametres'],
  'Architecte collaborateur':['dashboard','devis','projets','suivi','journal','rendement','nas','clients','demandes-admin'],
  'Décorateur':              ['dashboard','projets','suivi','journal','nas','clients'],
  'Comptable':               ['dashboard','facturation','bilans','depenses','fiscalite'],
  'Ingénieur paysagiste':    ['dashboard','projets','suivi','journal','nas','clients','demandes-admin'],
  'Stagiaire':               ['dashboard','projets','suivi','journal'],
};

// Rôles par défaut
var ROLES_DEFAUT = [
  'Architecte gérant',
  'Architecte collaborateur',
  'Décorateur',
  'Comptable',
  'Ingénieur paysagiste',
  'Stagiaire',
];

// ── Stockage des membres (localStorage + API) ──
var _membres = null;
var _deletingMembreId = null;

function getMembres() {
  if (_membres !== null) return _membres;
  _membres = getSetting('cortoba_membres', []);
  return _membres;
}

function saveMembresData(arr) {
  _membres = arr;
  saveSetting('cortoba_membres', arr);
}

// ── Rôles configurables ──
function getRolesEquipe() {
  var saved = getSetting('cortoba_roles_equipe', null);
  if (Array.isArray(saved) && saved.length > 0) return saved;
  return ROLES_DEFAUT.slice();
}

function saveRolesEquipe(arr) {
  saveSetting('cortoba_roles_equipe', arr);
}

// ── Render page Équipe ──
function renderEquipePage() {
  var grid = document.getElementById('equipe-grid');
  if (!grid) return;
  loadMembresFromAPI().then(function(membres) { _doRenderEquipe(membres); });
}
function _doRenderEquipe(membres) {
  var grid = document.getElementById('equipe-grid');
  if (!grid) return;

  if (membres.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-3);font-size:0.85rem;border:1px dashed var(--border);border-radius:8px">'
      + '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" style="margin-bottom:0.8rem;opacity:0.4"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
      + '<br>Aucun membre ajouté.<br><button class="btn btn-primary" style="margin-top:1rem" onclick="openModal(\'modal-membre\')">Ajouter un premier membre</button></div>';
  } else {
    grid.innerHTML = membres.map(function(m) {
      return renderMembreCard(m);
    }).join('');
  }

  renderEquipeAccesTable();
}

function initiales(prenom, nom) {
  var p = (prenom||'').trim()[0] || '';
  var n = (nom||'').trim()[0] || '';
  return (p + n).toUpperCase() || '?';
}

function renderMembreCard(m) {
  var statutColor = {
    'Actif':       'var(--green)',
    'Sur chantier':'var(--blue)',
    'En congé':    'var(--accent)',
    'Inactif':     'var(--text-3)'
  };
  var col = statutColor[m.statut] || 'var(--text-3)';
  var ini = initiales(m.prenom, m.nom);
  var modules = Array.isArray(m.modules) ? m.modules : [];
  var nbModules = modules.length;

  return '<div class="card" style="position:relative">'
    // Actions
    + '<div style="position:absolute;top:0.8rem;right:0.8rem;display:flex;gap:0.3rem">'
    + '<button class="btn btn-sm" onclick="editMembre(\''+m.id+'\')" title="Modifier">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
    + '</button>'
    + '<button class="btn btn-sm" onclick="deleteMembre(\''+m.id+'\')" title="Supprimer" style="color:#e07b72">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>'
    + '</button>'
    + '</div>'
    // Avatar + infos
    + '<div style="display:flex;align-items:flex-start;gap:0.9rem;margin-bottom:1rem;padding-right:4rem">'
    + renderAvatarHtml(m, 'member-avatar')
    + '<div>'
    + '<div style="font-weight:500;color:var(--text);font-size:0.9rem">' + escHtml(m.prenom + ' ' + m.nom) + '</div>'
    + '<div style="font-size:0.72rem;color:var(--text-3);margin-top:2px">' + escHtml(m.role || '—') + (m.spec ? ' · ' + escHtml(m.spec) : '') + '</div>'
    + '<div style="font-size:0.7rem;color:var(--text-3);margin-top:2px">' + escHtml(pickEmailDisplay(m)) + '</div>'
    + (pickTelDisplay(m) ? '<div style="font-size:0.7rem;color:var(--text-3);margin-top:2px">' + escHtml(pickTelDisplay(m)) + '</div>' : '')
    + '</div></div>'
    // Statut + modules
    + '<div style="display:flex;align-items:center;justify-content:space-between">'
    + '<span style="display:inline-flex;align-items:center;gap:0.35rem;font-size:0.72rem;color:'+col+'">'
    + '<div style="width:6px;height:6px;border-radius:50%;background:'+col+'"></div>'
    + escHtml(m.statut || 'Actif')
    + '</span>'
    + '<span style="font-size:0.72rem;color:var(--text-3)">'
    + '<span style="color:var(--accent);font-weight:600">'+nbModules+'</span> module'+(nbModules>1?'s':'')+' accordé'+(nbModules>1?'s':'')
    + '</span>'
    + '</div>'
    // Liste mini des modules
    + '<div style="margin-top:0.7rem;display:flex;flex-wrap:wrap;gap:0.3rem">'
    + modules.slice(0,6).map(function(mid){
        var mod = MODULES_PLATEFORME.find(function(x){return x.id===mid;});
        return '<span style="display:inline-block;padding:0.15rem 0.5rem;border-radius:20px;font-size:0.65rem;background:var(--bg-3);border:1px solid var(--border);color:var(--text-3)">'+(mod?mod.label:mid)+'</span>';
      }).join('')
    + (modules.length > 6 ? '<span style="display:inline-block;padding:0.15rem 0.5rem;border-radius:20px;font-size:0.65rem;color:var(--text-3)">+' + (modules.length - 6) + '</span>' : '')
    + '</div>'
    + '</div>';
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Tableau récap accès ──
function renderEquipeAccesTable() {
  var membres = getMembres();
  var thead = document.getElementById('equipe-acces-thead');
  var tbody = document.getElementById('equipe-acces-tbody');
  if (!thead || !tbody) return;

  // En-tête : Module | Admin | Membre1 | Membre2 ...
  thead.innerHTML = '<tr>'
    + '<th style="text-align:left;padding:0.45rem 0.7rem;font-size:0.7rem;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid var(--border);white-space:nowrap">Module</th>'
    + '<th style="text-align:center;padding:0.45rem 0.7rem;font-size:0.7rem;color:var(--accent);border-bottom:1px solid var(--border);white-space:nowrap">Admin</th>'
    + membres.map(function(m){
        return '<th style="text-align:center;padding:0.45rem 0.7rem;font-size:0.72rem;color:var(--text-2);border-bottom:1px solid var(--border);white-space:nowrap">'
          + escHtml(m.prenom + ' ' + (m.nom||'').substring(0,1) + '.') + '</th>';
      }).join('')
    + '</tr>';

  // Corps : une ligne par module
  tbody.innerHTML = MODULES_PLATEFORME.map(function(mod) {
    return '<tr>'
      + '<td style="padding:0.4rem 0.7rem;font-size:0.78rem;color:var(--text-2);border-bottom:1px solid rgba(255,255,255,0.04)">' + mod.label + '</td>'
      + '<td style="text-align:center;padding:0.4rem;border-bottom:1px solid rgba(255,255,255,0.04)"><span style="color:var(--accent);font-size:0.85rem">✓</span></td>'
      + membres.map(function(m){
          var ok = Array.isArray(m.modules) && m.modules.indexOf(mod.id) !== -1;
          return '<td style="text-align:center;padding:0.4rem;border-bottom:1px solid rgba(255,255,255,0.04)">'
            + (ok
              ? '<span style="color:var(--green);font-size:0.85rem">✓</span>'
              : '<span style="color:rgba(255,255,255,0.12);font-size:0.85rem">—</span>')
            + '</td>';
        }).join('')
      + '</tr>';
  }).join('');
}

// ── Modal membre : ouvrir / éditer ──
var _editingMembreId    = null;
var _mbCurrentPhoto     = null;   // URL actuelle de la photo
var _mbPendingPhotoData = null;   // dataUrl en attente d'upload

// Helpers d'affichage (respectent la confidentialité)
function pickEmailDisplay(m) {
  if (canViewSensitiveMember() && m.email_principal === 'perso' && m.email_perso) return m.email_perso;
  return m.email_pro || m.email || '';
}
function pickTelDisplay(m) {
  if (canViewSensitiveMember() && m.tel_principal === 'perso' && m.tel_perso) return m.tel_perso;
  return m.tel_pro || m.tel || '';
}
function renderAvatarHtml(m, extraClass) {
  var ini = initiales(m.prenom, m.nom);
  var cls = 'member-avatar' + (extraClass ? ' ' + extraClass : '');
  if (m.profile_picture_url) {
    return '<div class="'+cls+'"><img src="'+escHtml(m.profile_picture_url)+'" alt="'+escHtml(m.prenom||'')+'"></div>';
  }
  return '<div class="'+cls+'">' + ini + '</div>';
}

// Bascule entre onglets
function mbShowTab(name) {
  var tabs   = document.querySelectorAll('#mb-tabs .mb-tab');
  var panels = document.querySelectorAll('#modal-membre .mb-panel');
  tabs.forEach(function(t){ t.classList.toggle('active', t.getAttribute('data-tab') === name); });
  panels.forEach(function(p){ p.style.display = p.getAttribute('data-panel') === name ? '' : 'none'; });
}

// Cacher les onglets sensibles pour les rôles non privilégiés
function applyMbTabsVisibility() {
  var canSee = canViewSensitiveMember();
  document.querySelectorAll('#mb-tabs .mb-tab-sensitive').forEach(function(t){
    t.classList.toggle('hidden', !canSee);
  });
}

function openModal_membre_reset() {
  _editingMembreId    = null;
  _mbCurrentPhoto     = null;
  _mbPendingPhotoData = null;
  document.getElementById('modal-membre-title').textContent = 'Nouveau membre';

  var ids = ['mb-prenom','mb-nom','mb-email','mb-spec','mb-pass','mb-pass2',
             'mb-tel-pro','mb-tel-perso','mb-email-pro','mb-email-perso',
             'mb-salaire','mb-charges','mb-subv','mb-avant',
             'mb-date-embauche','mb-date-augm',
             // fiche de paie
             'mb-salaire-base','mb-matricule','mb-cin','mb-n-cnss','mb-emploi',
             'mb-cat-emploi','mb-echelon','mb-adresse-perso','mb-banque','mb-rib'];
  ids.forEach(function(id){ var el = document.getElementById(id); if (el) el.value = ''; });
  var sit = document.getElementById('mb-situation');   if (sit) sit.value = 'Célibataire';
  var enf = document.getElementById('mb-enfants');      if (enf) enf.value = '0';
  var mp  = document.getElementById('mb-mode-paie');    if (mp)  mp.value = 'Virement';

  var heuresEl = document.getElementById('mb-heures');       if (heuresEl) heuresEl.value = '160';
  var tauxEl   = document.getElementById('mb-taux-augm');    if (tauxEl)   tauxEl.value   = '5';
  var statEl   = document.getElementById('mb-statut');       if (statEl)   statEl.value   = 'Actif';
  var roleEl   = document.getElementById('mb-role');         if (roleEl)   roleEl.value   = '';

  // Reset radios principal
  var r1 = document.querySelector('input[name="mb-tel-principal"][value="pro"]');     if (r1) r1.checked = true;
  var r2 = document.querySelector('input[name="mb-email-principal"][value="pro"]');   if (r2) r2.checked = true;
  var showWebEl = document.getElementById('mb-show-website'); if (showWebEl) showWebEl.checked = false;
  var colorEl = document.getElementById('mb-color'); if (colorEl) colorEl.value = '#c8a96e';

  document.getElementById('mb-error').style.display = 'none';

  setMbPhotoPreview(null, 'Nouveau');
  renderRoleSelectModal();
  renderModulesCheckboxes([]);
  recomputeCoutEmployeur();
  recomputeProjectionAugm();
  applyMbTabsVisibility();
  mbShowTab('profil');
}

function editMembre(id) {
  var m = getMembres().find(function(x){ return x.id === id; });
  if (!m) return;
  _editingMembreId    = id;
  _mbCurrentPhoto     = m.profile_picture_url || null;
  _mbPendingPhotoData = null;

  document.getElementById('modal-membre-title').textContent = 'Modifier le membre';

  function setVal(id, v) { var el = document.getElementById(id); if (el) el.value = v || ''; }
  setVal('mb-prenom', m.prenom);
  setVal('mb-nom',    m.nom);
  setVal('mb-email',  m.email);
  setVal('mb-spec',   m.spec);
  setVal('mb-pass',   '');
  setVal('mb-pass2',  '');
  // Contacts
  setVal('mb-tel-pro',     m.tel_pro     || m.tel || '');
  setVal('mb-tel-perso',   m.tel_perso   || '');
  setVal('mb-email-pro',   m.email_pro   || m.email || '');
  setVal('mb-email-perso', m.email_perso || '');
  // Rémunération
  setVal('mb-salaire', m.salaire_net);
  setVal('mb-charges', m.charges_sociales);
  setVal('mb-subv',    m.subventions);
  setVal('mb-avant',   m.avantages_nature);
  setVal('mb-heures',  m.heures_mois || 160);
  // Projection
  setVal('mb-date-embauche', m.date_embauche);
  setVal('mb-date-augm',     m.date_derniere_augm);
  setVal('mb-taux-augm',     m.taux_augm_pct || 5);
  // Fiche de paie
  setVal('mb-salaire-base',  m.salaire_base);
  setVal('mb-matricule',     m.matricule);
  setVal('mb-cin',           m.cin);
  setVal('mb-n-cnss',        m.n_cnss);
  setVal('mb-emploi',        m.emploi);
  setVal('mb-cat-emploi',    m.categorie_emploi);
  setVal('mb-echelon',       m.echelon);
  setVal('mb-adresse-perso', m.adresse);
  setVal('mb-banque',        m.banque);
  setVal('mb-rib',           m.rib);
  setVal('mb-hourly-cost',    m.hourly_cost_rate    != null ? m.hourly_cost_rate    : '');
  setVal('mb-hourly-billing', m.hourly_billing_rate != null ? m.hourly_billing_rate : '');
  var sitEl = document.getElementById('mb-situation'); if (sitEl) sitEl.value = m.situation_familiale || 'Célibataire';
  var enfEl = document.getElementById('mb-enfants');   if (enfEl) enfEl.value = (m.enfants_charge!=null ? m.enfants_charge : 0);
  var mpEl  = document.getElementById('mb-mode-paie'); if (mpEl)  mpEl.value = m.mode_paiement || 'Virement';

  var statEl = document.getElementById('mb-statut');
  if (statEl) statEl.value = m.statut || 'Actif';

  // Radios principal
  var telPrinc   = m.tel_principal   || 'pro';
  var emailPrinc = m.email_principal || 'pro';
  var r1 = document.querySelector('input[name="mb-tel-principal"][value="'+telPrinc+'"]');     if (r1) r1.checked = true;
  var r2 = document.querySelector('input[name="mb-email-principal"][value="'+emailPrinc+'"]'); if (r2) r2.checked = true;
  var showWebEl = document.getElementById('mb-show-website'); if (showWebEl) showWebEl.checked = !!(+m.show_on_website);
  var colorEl = document.getElementById('mb-color'); if (colorEl) colorEl.value = (m.color && /^#[0-9A-Fa-f]{6}/.test(m.color)) ? m.color.substring(0,7) : '#c8a96e';

  document.getElementById('mb-error').style.display = 'none';

  setMbPhotoPreview(m.profile_picture_url, m.prenom + ' ' + m.nom);
  renderRoleSelectModal();
  setTimeout(function(){
    var roleEl = document.getElementById('mb-role');
    if (roleEl && m.role) roleEl.value = m.role;
    renderModulesCheckboxes(m.modules || []);
  }, 50);
  recomputeCoutEmployeur();
  recomputeProjectionAugm();
  applyMbTabsVisibility();
  mbShowTab('profil');

  // Ouvrir le modal directement sans reset (openModal appellerait openModal_membre_reset)
  document.getElementById('modal-membre').classList.add('open');
}

// ── Photo de profil : upload + crop carré via canvas ──
function setMbPhotoPreview(url, label) {
  var prev = document.getElementById('mb-avatar-preview');
  var rem  = document.getElementById('mb-photo-remove');
  if (!prev) return;
  if (url) {
    prev.innerHTML = '<img src="'+escHtml(url)+'" style="width:100%;height:100%;object-fit:cover">';
    if (rem) rem.style.display = '';
  } else {
    var ini = (String(label||'?').trim()[0] || '?').toUpperCase();
    prev.textContent = ini;
    if (rem) rem.style.display = 'none';
  }
}

function clearMbPhoto() {
  _mbCurrentPhoto     = null;
  _mbPendingPhotoData = null;
  var p = document.getElementById('mb-prenom');
  setMbPhotoPreview(null, p ? p.value : '');
}

function handleMbPhotoFile(input) {
  var f = input.files && input.files[0];
  if (!f) return;
  if (!/^image\/(jpeg|jpg|png|webp)$/.test(f.type)) {
    alert('Format non supporté. Utilisez JPG, PNG ou WebP.');
    input.value = '';
    return;
  }
  if (f.size > 5 * 1024 * 1024) {
    alert('Image trop volumineuse (max 5 Mo).');
    input.value = '';
    return;
  }
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      // Crop carré centré + redimensionnement à 400×400
      var size   = Math.min(img.width, img.height);
      var sx     = (img.width - size) / 2;
      var sy     = (img.height - size) / 2;
      var canvas = document.createElement('canvas');
      canvas.width = 400; canvas.height = 400;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 400, 400);
      var dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      _mbPendingPhotoData = dataUrl;
      setMbPhotoPreview(dataUrl, '');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(f);
  input.value = '';
}

// ── Rémunération : recalculs temps réel ──
function recomputeCoutEmployeur() {
  function v(id) { var e = document.getElementById(id); return parseFloat(e ? e.value : 0) || 0; }
  var salaire = v('mb-salaire');
  var charges = v('mb-charges');
  var subv    = v('mb-subv');
  var avant   = v('mb-avant');
  var heures  = Math.max(1, v('mb-heures') || 160);
  var coutTot = (salaire + charges) - subv + avant;
  var coutH   = coutTot / heures;
  var ct = document.getElementById('mb-cout-total');
  var ch = document.getElementById('mb-cout-horaire');
  if (ct) ct.textContent = fmtTnd(coutTot);
  if (ch) ch.textContent = fmtTnd(coutH) + '/h';
  // Re-calcul projection (dépend du salaire)
  recomputeProjectionAugm();
}

function fmtTnd(n) {
  if (!isFinite(n)) n = 0;
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TND';
}

// ── Projection d'augmentation ──
function recomputeProjectionAugm() {
  var wrap = document.getElementById('mb-projection-widget');
  if (!wrap) return;
  function v(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  var salaire = parseFloat(v('mb-salaire')) || 0;
  var taux    = parseFloat(v('mb-taux-augm')) || 0;
  var dateEmb = v('mb-date-embauche');
  var dateAug = v('mb-date-augm');

  var refDateStr = dateAug || dateEmb;
  if (!refDateStr) {
    wrap.innerHTML = '<div style="font-size:0.78rem;color:var(--text-3)">Renseignez une date d\'embauche ou de dernière augmentation pour activer la projection.</div>';
    return;
  }
  var refDate = new Date(refDateStr);
  if (isNaN(refDate)) { wrap.innerHTML = '<div style="font-size:0.78rem;color:#e07b72">Date invalide.</div>'; return; }

  // Prochaine projection = référence + 12 mois
  var nextDate = new Date(refDate);
  nextDate.setFullYear(nextDate.getFullYear() + 1);
  var today    = new Date();
  var total    = nextDate - refDate;
  var elapsed  = today - refDate;
  var pct      = Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
  var newSal   = salaire * (1 + taux / 100);

  // Estimation rendement du membre (si la fonction existe)
  var efficacite = null, beneficeMois = null;
  try {
    if (typeof computeMembreRendementStats === 'function' && _editingMembreId) {
      var stats = computeMembreRendementStats(_editingMembreId);
      if (stats) { efficacite = stats.efficacite; beneficeMois = stats.beneficeMensuel; }
    }
  } catch(e) { /* silencieux */ }

  var seuilEff = 70;   // %
  var seuilBen = 0;    // TND
  var conditionOk = (efficacite == null || efficacite >= seuilEff) && (beneficeMois == null || beneficeMois >= seuilBen);
  var badge = efficacite == null
    ? '<span style="color:var(--text-3);font-size:0.7rem">Données rendement non disponibles — projection basée uniquement sur la date</span>'
    : (conditionOk
        ? '<span style="color:var(--green);font-size:0.75rem">✓ Conditions remplies (efficacité '+Math.round(efficacite)+'%)</span>'
        : '<span style="color:#e07b72;font-size:0.75rem">⚠ Conditions non remplies (efficacité '+Math.round(efficacite)+'% < '+seuilEff+'%)</span>');

  var dateFmt = nextDate.toLocaleDateString('fr-FR', { year:'numeric', month:'long', day:'numeric' });

  wrap.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:0.4rem">'
    +  '<div style="font-size:0.72rem;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em">Prochaine augmentation projetée</div>'
    +  '<div style="font-size:0.7rem;color:var(--text-3)">'+pct+'% du cycle</div>'
    + '</div>'
    + '<div style="font-size:1.2rem;color:var(--text);font-weight:500">'+dateFmt+'</div>'
    + '<div class="augm-timeline"><div class="augm-timeline-fill" style="width:'+pct+'%"></div></div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;margin-top:1rem">'
    +   '<div><div style="font-size:0.65rem;color:var(--text-3);text-transform:uppercase">Salaire actuel</div>'
    +     '<div style="font-size:1rem;color:var(--text-2)">'+fmtTnd(salaire)+'</div></div>'
    +   '<div><div style="font-size:0.65rem;color:var(--text-3);text-transform:uppercase">Projeté (+'+taux+'%)</div>'
    +     '<div style="font-size:1rem;color:var(--accent)">'+fmtTnd(newSal)+'</div></div>'
    + '</div>'
    + '<div style="margin-top:0.8rem">'+badge+'</div>';
}

function deleteMembre(id) {
  var m = getMembres().find(function(x){ return x.id === id; });
  if (!m) return;
  _deletingMembreId = id;
  document.getElementById('modal-delete-membre-msg').innerHTML =
    'Êtes-vous sûr de vouloir supprimer le compte de <strong>' + escHtml(m.prenom + ' ' + m.nom) + '</strong> ?<br>'
    + '<span style="font-size:0.8rem;color:var(--text-3)">Cette action supprimera son accès à la plateforme.</span>';
  openModal('modal-delete-membre');
}

function confirmDeleteMembre() {
  if (!_deletingMembreId) return;
  var idToDelete = _deletingMembreId;
  _deletingMembreId = null;
  closeModal('modal-delete-membre');
  // Supprimer via API d'abord
  apiFetch('api/users.php?id=' + idToDelete, { method: 'DELETE' })
    .catch(function() {}) // silencieux si API absente
    .finally(function() {
      // Mettre à jour le cache local dans tous les cas
      var membres = getMembres().filter(function(m){ return m.id !== idToDelete; });
      saveMembresData(membres);
      _membres = membres;
      renderEquipePage();
      showToast('Membre supprimé');
    });
}

// ── Remplir le select Rôle dans le modal ──
function renderRoleSelectModal() {
  var sel = document.getElementById('mb-role');
  if (!sel) return;
  var roles = getRolesEquipe();
  sel.innerHTML = '<option value="">— Sélectionner un rôle —</option>'
    + roles.map(function(r){
        return '<option value="'+escHtml(r)+'">'+escHtml(r)+'</option>';
      }).join('');
  sel.onchange = function(){
    var role = sel.value;
    var presets = MODULES_PAR_ROLE[role] || [];
    renderModulesCheckboxes(presets);
  };
}

// ── Checkboxes modules (générées dynamiquement depuis api/modules.php) ──
function renderModulesCheckboxes(preChecked) {
  var wrap = document.getElementById('mb-modules-wrap');
  if (!wrap) return;
  preChecked = preChecked || [];

  function doRender() {
    wrap.innerHTML = MODULES_PLATEFORME.map(function(mod) {
      var checked = preChecked.indexOf(mod.id) !== -1;
      return '<label style="display:flex;align-items:center;gap:0.6rem;padding:0.55rem 0.8rem;border:1px solid var(--border);border-radius:6px;cursor:pointer;transition:border-color .15s;background:var(--bg-2)" '
        + 'onmouseover="this.style.borderColor=\'var(--accent)\'" onmouseout="this.style.borderColor=\'var(--border)\'">'
        + '<input type="checkbox" name="mb-mod" value="'+mod.id+'" '+(checked?'checked':'')+' style="accent-color:var(--accent);width:14px;height:14px;flex-shrink:0">'
        + '<span style="font-size:0.8rem;color:var(--text-2)">'+escHtml(mod.label)+'</span>'
        + '</label>';
    }).join('');
  }

  // Rafraîchir depuis l'API à chaque ouverture (pour détecter nouveaux modules déployés)
  loadModulesFromAPI().then(doRender).catch(doRender);
  // Rendu immédiat avec ce qu'on a déjà en mémoire
  doRender();
}

function setAllModules(state) {
  var checks = document.querySelectorAll('input[name="mb-mod"]');
  checks.forEach(function(c){ c.checked = state; });
}

function updateMembreInitiales() {
  // preview avatar (optionnel, non bloquant)
}

// ── Sauvegarder membre ──
function saveMembre() {
  function val(id) { var e = document.getElementById(id); return (e ? e.value : '') || ''; }
  function num(id) { return parseFloat(val(id)) || 0; }

  var prenom = val('mb-prenom').trim();
  var nom    = val('mb-nom').trim();
  var email  = val('mb-email').trim().toLowerCase();
  var role   = val('mb-role').trim();
  var statut = val('mb-statut') || 'Actif';
  var spec   = val('mb-spec').trim();
  var pass   = val('mb-pass');
  var pass2  = val('mb-pass2');

  // Contacts Pro/Perso
  var telPro     = val('mb-tel-pro').trim();
  var telPerso   = val('mb-tel-perso').trim();
  var emailPro   = val('mb-email-pro').trim();
  var emailPerso = val('mb-email-perso').trim();
  var telPrincEl   = document.querySelector('input[name="mb-tel-principal"]:checked');
  var emailPrincEl = document.querySelector('input[name="mb-email-principal"]:checked');
  var telPrincipal   = telPrincEl   ? telPrincEl.value   : 'pro';
  var emailPrincipal = emailPrincEl ? emailPrincEl.value : 'pro';

  var errEl = document.getElementById('mb-error');
  function showErr(msg) { errEl.textContent = msg; errEl.style.display = 'block'; }
  errEl.style.display = 'none';

  // Validation
  if (!prenom || !nom) { showErr('Le prénom et le nom sont requis.'); return; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showErr('Email identifiant invalide.'); return; }
  if (!role) { showErr('Veuillez sélectionner un rôle.'); return; }

  var membres = getMembres();
  var duplicate = membres.find(function(m){ return m.email === email && m.id !== _editingMembreId; });
  if (duplicate) { showErr('Cet email est déjà utilisé par un autre membre.'); return; }

  if (!_editingMembreId || pass) {
    if (!_editingMembreId && !pass) { showErr('Un mot de passe initial est requis.'); return; }
    if (pass && pass.length < 6)    { showErr('Le mot de passe doit contenir au moins 6 caractères.'); return; }
    if (pass && pass !== pass2)     { showErr('Les mots de passe ne correspondent pas.'); return; }
  }

  // Modules cochés
  var modules = [];
  document.querySelectorAll('input[name="mb-mod"]:checked').forEach(function(c){ modules.push(c.value); });

  var membreId = _editingMembreId || uid();
  var isEdit   = !!_editingMembreId;

  // Payload de base
  var payload = {
    id:       membreId,
    prenom:   prenom,
    nom:      nom,
    email:    email,
    role:     role,
    statut:   statut,
    // Legacy: on conserve tel = tel principal pour rétro-compat
    tel:      telPrincipal === 'perso' ? telPerso : telPro,
    spec:     spec,
    modules:  modules,
    password: pass,
    // Contacts doublés
    tel_pro:         telPro,
    tel_perso:       telPerso,
    tel_principal:   telPrincipal,
    email_pro:       emailPro || email,
    email_perso:     emailPerso,
    email_principal: emailPrincipal,
    profile_picture_url: _mbCurrentPhoto || null,
    show_on_website: (document.getElementById('mb-show-website') || {}).checked ? 1 : 0,
    color: ((document.getElementById('mb-color') || {}).value) || '#c8a96e'
  };

  // Rémunération — uniquement si l'utilisateur peut voir/éditer le sensible
  if (canViewSensitiveMember()) {
    payload.salaire_net        = num('mb-salaire');
    payload.charges_sociales   = num('mb-charges');
    payload.subventions        = num('mb-subv');
    payload.avantages_nature   = num('mb-avant');
    payload.heures_mois        = num('mb-heures') || 160;
    payload.date_embauche      = val('mb-date-embauche') || null;
    payload.date_derniere_augm = val('mb-date-augm') || null;
    payload.taux_augm_pct      = num('mb-taux-augm') || 5;
    // Fiche de paie
    payload.salaire_base        = num('mb-salaire-base');
    payload.matricule           = val('mb-matricule').trim();
    payload.cin                 = val('mb-cin').trim();
    payload.n_cnss              = val('mb-n-cnss').trim();
    payload.emploi              = val('mb-emploi').trim();
    payload.categorie_emploi    = val('mb-cat-emploi').trim();
    payload.echelon             = val('mb-echelon').trim();
    payload.situation_familiale = val('mb-situation') || 'Célibataire';
    payload.enfants_charge      = parseInt(val('mb-enfants'),10) || 0;
    payload.adresse             = val('mb-adresse-perso').trim();
    payload.banque              = val('mb-banque').trim();
    payload.rib                 = val('mb-rib').trim();
    payload.mode_paiement       = val('mb-mode-paie') || 'Virement';
    // Taux horaires Rendement
    var vCost = val('mb-hourly-cost');
    var vBill = val('mb-hourly-billing');
    payload.hourly_cost_rate    = (vCost === '' || vCost == null) ? null : parseFloat(vCost);
    payload.hourly_billing_rate = (vBill === '' || vBill == null) ? null : parseFloat(vBill);
  }

  var saveBtn = document.querySelector('#modal-membre .btn-primary');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Enregistrement…'; }

  // Étape 1 : upload photo si nouvelle dataUrl en attente
  var photoPromise = _mbPendingPhotoData
    ? apiFetch('api/upload_user_photo.php', { method:'POST', body:{ dataUrl: _mbPendingPhotoData } })
        .then(function(r){
          var path = (r && r.data && r.data.path) || (r && r.path);
          if (path) { payload.profile_picture_url = path; _mbCurrentPhoto = path; }
        })
        .catch(function(){ /* Upload échoué — on continue sans bloquer */ })
    : Promise.resolve();

  // Étape 2 : POST/PUT api/users.php
  photoPromise
    .then(function(){
      return apiFetch('api/users.php', { method: isEdit ? 'PUT' : 'POST', body: payload });
    })
    .then(function() {
      // Rafraîchir depuis l'API pour récupérer les champs filtrés à jour
      return loadMembresFromAPI();
    })
    .then(function() {
      closeModal('modal-membre');
      renderEquipePage();
      showToast(isEdit ? 'Membre mis à jour ✓' : 'Compte créé — connexion possible immédiatement ✓');
    })
    .catch(function(e) {
      var msg = (e && e.message) || '';
      var isNetErr = !msg || msg.indexOf('404') !== -1 || msg.indexOf('Failed') !== -1;
      if (isNetErr) {
        // Fallback localStorage si api non disponible
        var membres = getMembres();
        var entry = Object.assign({}, payload, { createdAt: new Date().toISOString() });
        delete entry.password;
        if (isEdit) {
          var idx = membres.findIndex(function(m){ return m.id === membreId; });
          if (idx !== -1) membres[idx] = Object.assign({}, membres[idx], entry);
        } else {
          membres.push(entry);
        }
        saveMembresData(membres);
        closeModal('modal-membre');
        renderEquipePage();
        showToast('⚠️ Sauvegardé localement — déployez les API pour activer la synchro serveur', '#e07b72');
      } else {
        errEl.textContent = msg;
        errEl.style.display = 'block';
      }
    })
    .finally(function(){
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Enregistrer'; }
      _editingMembreId    = null;
      _mbPendingPhotoData = null;
    });
}

// Charger les membres depuis l'API
function loadMembresFromAPI() {
  return apiFetch('api/users.php')
    .then(function(r) {
      _membres = r.data || [];
      saveSetting('cortoba_membres', _membres);
      return _membres;
    })
    .catch(function() {
      _membres = getSetting('cortoba_membres', []);
      return _membres;
    });
}

// ═══════════════════════════════════════════════════════════════
//  PARAMÈTRES — Gestion des rôles
// ═══════════════════════════════════════════════════════════════

function renderParametresRoles() {
  var wrap = document.getElementById('param-roles-wrap');
  if (!wrap) return;
  var roles = getRolesEquipe();
  var rolesCustom = getSetting('cortoba_roles_custom', []);

  wrap.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:0.4rem">'
    + roles.map(function(r) {
        var isCustom = rolesCustom.indexOf(r) !== -1;
        return '<span style="display:inline-flex;align-items:center;gap:0.3rem;padding:0.3rem 0.8rem;border-radius:20px;font-size:0.78rem;background:var(--bg-3);border:1px solid var(--border);color:'+(isCustom?'var(--accent)':'var(--text-2)')+'">'
          + escHtml(r)
          + (isCustom
              ? '<button type="button" style="background:none;border:none;cursor:pointer;color:#e07070;font-size:0.85rem;line-height:1;padding:0 0 0 2px" onclick="removeParamRole(\''+r.replace(/'/g,"\\'")+'\')" title="Supprimer">✕</button>'
              : '')
          + '</span>';
      }).join('')
    + '</div>';
}

function addParamRole() {
  var inp = document.getElementById('param-role-input');
  if (!inp) return;
  var val = inp.value.trim();
  if (!val) return;
  var roles = getRolesEquipe();
  if (roles.indexOf(val) !== -1) {
    showToast('Ce rôle existe déjà', '#e07b72'); return;
  }
  roles.push(val);
  saveRolesEquipe(roles);
  // Marquer comme custom
  var custom = getSetting('cortoba_roles_custom', []);
  if (custom.indexOf(val) === -1) { custom.push(val); saveSetting('cortoba_roles_custom', custom); }
  inp.value = '';
  renderParametresRoles();
  showToast('Rôle "' + val + '" ajouté');
}

function removeParamRole(role) {
  // Vérifier qu'aucun membre n'utilise ce rôle
  var utilisateurs = getMembres().filter(function(m){ return m.role === role; });
  if (utilisateurs.length > 0) {
    showToast('Impossible : ' + utilisateurs.length + ' membre(s) ont ce rôle', '#e07b72');
    return;
  }
  var roles = getRolesEquipe().filter(function(r){ return r !== role; });
  saveRolesEquipe(roles);
  var custom = getSetting('cortoba_roles_custom', []).filter(function(r){ return r !== role; });
  saveSetting('cortoba_roles_custom', custom);
  renderParametresRoles();
  showToast('Rôle supprimé');
}

// ═══════════════════════════════════════════════════════════════
//  INTÉGRATION DANS LES FONCTIONS EXISTANTES
//  (à ajouter / modifier dans le JS principal)
// ═══════════════════════════════════════════════════════════════

/*
  1. Dans openModal() — ajouter le cas modal-membre :
     if (id === 'modal-membre') {
       openModal_membre_reset();
     }

  2. Dans showPage() — ajouter le cas 'equipe' :
     if (id === 'equipe') setTimeout(renderEquipePage, 80);

  3. Dans showPage() — ajouter le cas 'parametres' (dans le setTimeout existant) :
     renderParametresRoles();

  4. Dans pageLabels — ajouter si absent :
     equipe: 'Équipe'
     (déjà présent dans le JS original)

  Voir les snippets ci-dessous à copier-coller dans les fonctions concernées.
*/

// ── Module Équipe chargé ──

// ═══════════════════════════════════════════════════════════════
//  MODULE NAS — Cortoba Atelier
//  Statut temps réel · Accès local/cloud · Raccourcis · Fichiers
// ═══════════════════════════════════════════════════════════════

// ── Icônes pour les raccourcis ──
var NAS_ICONS = {
  folder:  '📁', doc: '📄', image: '🖼️', pdf: '📑',
  archive: '🗂️', plan: '📐', photo: '📷', contrat: '📋'
};

// ── Lire la config NAS depuis les settings ──
function getNasConfig() {
  var rawLocal = getSetting('cortoba_nas_local', '192.168.1.100');
  return {
    local:       extractNasIp(rawLocal) || '192.168.1.100',  // IP extraite pour usage réseau
    localFull:   rawLocal,                                    // Chemin UNC complet pour genNasPath
    port:        getSetting('cortoba_nas_port', '8080'),
    cloud:       getSetting('cortoba_nas_cloud', ''),
    user:        getSetting('cortoba_nas_user', 'admin'),
    pass:        getSetting('cortoba_nas_pass', ''),
    apikey:      getSetting('cortoba_nas_apikey', ''),
    model:       getSetting('cortoba_nas_model', 'QNAP NAS'),
    capacity:    parseFloat(getSetting('cortoba_nas_capacity', '0')) || 0,
    used:        parseFloat(getSetting('cortoba_nas_used', '0')) || 0,
    webdavPort:  getSetting('cortoba_nas_webdav_port', '5005'),
    webdavPath:  getSetting('cortoba_nas_webdav', ''),
    publicIp:    getSetting('cortoba_nas_public_ip', ''),
  };
}

// ── Sauvegarder config NAS ──
function saveNasConfig() {
  var fields = {
    cortoba_nas_local:        'param-nas-local',
    cortoba_nas_port:         'param-nas-port',
    cortoba_nas_cloud:        'param-nas-cloud',
    cortoba_nas_user:         'param-nas-user',
    cortoba_nas_pass:         'param-nas-pass',
    cortoba_nas_apikey:       'param-nas-apikey',
    cortoba_nas_model:        'param-nas-model',
    cortoba_nas_capacity:     'param-nas-capacity',
    cortoba_nas_used:         'param-nas-used',
    cortoba_nas_webdav_port:  'param-nas-webdav-port',
    cortoba_nas_webdav:       'param-nas-webdav',
    cortoba_nas_public_ip:    'param-nas-public-ip',
  };
  var saved = 0;
  var skipped = 0;
  var promises = [];
  Object.keys(fields).forEach(function(key) {
    var el = document.getElementById(fields[key]);
    if (!el) return;
    var val = el.value;
    // NE PAS sanitiser cortoba_nas_local — garder le chemin UNC complet
    // (ex: \\192.168.1.165\Public\CAS_PROJETS) pour que le PHP puisse
    // extraire l'IP ET le chemin WebDAV automatiquement
    // Ne pas sauvegarder un champ vide s'il y a déjà une valeur enregistrée
    if (!val && _settingsCache[key]) { skipped++; return; }
    if (!val) { skipped++; return; }
    _settingsCache[key] = val;
    setLS(key, val);
    saved++;
    promises.push(
      apiFetch('api/settings.php', {method:'POST', body:{key:key, value:val}})
        .catch(function(e) { console.error('NAS save error for ' + key + ':', e); return {error:true}; })
    );
  });
  if (saved === 0) {
    showToast('⚠ Aucun champ à sauvegarder — remplissez au moins un champ', 'error');
    return;
  }
  Promise.all(promises).then(function(results) {
    var errors = results.filter(function(r) { return r && r.error; });
    if (errors.length > 0) {
      showToast('⚠ ' + saved + ' paramètres sauvegardés localement, mais ' + errors.length + ' erreur(s) serveur', 'error');
    } else {
      showToast('✓ Configuration NAS enregistrée (' + saved + ' paramètres)');
    }
    nasRefreshStatus();
  });
}

// ── Charger les champs Paramètres NAS ──
function loadNasParams() {
  var cfg = getNasConfig();
  var map = {
    'param-nas-local':       cfg.localFull,
    'param-nas-port':        cfg.port,
    'param-nas-cloud':       cfg.cloud,
    'param-nas-user':        cfg.user,
    'param-nas-pass':        cfg.pass,
    'param-nas-apikey':      cfg.apikey,
    'param-nas-model':       cfg.model,
    'param-nas-capacity':    cfg.capacity || '',
    'param-nas-used':        cfg.used || '',
    'param-nas-webdav-port': cfg.webdavPort,
    'param-nas-webdav':      cfg.webdavPath,
    'param-nas-public-ip':   cfg.publicIp,
  };
  Object.keys(map).forEach(function(id) {
    var el = document.getElementById(id);
    if (el && map[id] !== undefined) el.value = map[id];
  });
  // Champs supplémentaires de la section Projets NAS
  var rootEl = document.getElementById('param-nas-projets-root');
  if (rootEl) rootEl.value = getSetting('cortoba_nas_projets_root', '');
  var tplEl = document.getElementById('param-nas-template-folder');
  if (tplEl) tplEl.value = getSetting('cortoba_nas_template_folder', '00-Dossier Type');
  renderNasSubfolders();
}

// ── Sous-dossiers par défaut NAS ──
function _getNasSubfolders() {
  var val = getSetting('cortoba_nas_subfolders', []);
  return Array.isArray(val) ? val : [];
}
function renderNasSubfolders() {
  var list = document.getElementById('param-nas-subfolders-list');
  if (!list) return;
  var subs = _getNasSubfolders();
  if (subs.length === 0) {
    list.innerHTML = '<span style="font-size:0.75rem;color:var(--text-3);font-style:italic">Aucun sous-dossier configuré</span>';
    return;
  }
  list.innerHTML = subs.map(function(s, i) {
    return '<div style="display:flex;align-items:center;gap:0.4rem;padding:0.35rem 0.6rem;background:var(--bg-2);border-radius:5px;border:1px solid var(--border)">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--accent);flex-shrink:0"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' +
      '<span style="flex:1;font-size:0.8rem">' + s + '</span>' +
      '<button class="btn btn-sm" onclick="removeNasSubfolder(' + i + ')" style="color:#e07070;padding:0.1rem 0.3rem;font-size:0.7rem" title="Supprimer">✕</button>' +
      '</div>';
  }).join('');
}
window.renderNasSubfolders = renderNasSubfolders;

function addNasSubfolder() {
  var input = document.getElementById('param-nas-subfolder-input');
  if (!input) return;
  var name = input.value.trim().replace(/[<>:"\/\\|?*]/g, '_');
  if (!name) return;
  var subs = _getNasSubfolders();
  if (subs.indexOf(name) !== -1) { showToast('Ce sous-dossier existe déjà', 'error'); return; }
  subs.push(name);
  _settingsCache['cortoba_nas_subfolders'] = subs;
  setLS('cortoba_nas_subfolders', subs);
  input.value = '';
  renderNasSubfolders();
}
window.addNasSubfolder = addNasSubfolder;

function removeNasSubfolder(idx) {
  var subs = _getNasSubfolders();
  subs.splice(idx, 1);
  _settingsCache['cortoba_nas_subfolders'] = subs;
  setLS('cortoba_nas_subfolders', subs);
  renderNasSubfolders();
}
window.removeNasSubfolder = removeNasSubfolder;

// ── Sauvegarder config dossiers projets NAS ──
function saveNasProjectConfig() {
  var fields = {
    cortoba_nas_projets_root:    'param-nas-projets-root',
    cortoba_nas_template_folder: 'param-nas-template-folder',
  };
  var promises = [];
  Object.keys(fields).forEach(function(key) {
    var el = document.getElementById(fields[key]);
    if (!el) return;
    var val = el.value;
    _settingsCache[key] = val;
    setLS(key, val);
    promises.push(
      apiFetch('api/settings.php', {method:'POST', body:{key:key, value:val}})
        .catch(function(e) { console.error('NAS project config save error:', e); return {error:true}; })
    );
  });
  // Sauvegarder aussi les sous-dossiers
  var subs = _getNasSubfolders();
  _settingsCache['cortoba_nas_subfolders'] = subs;
  setLS('cortoba_nas_subfolders', subs);
  promises.push(
    apiFetch('api/settings.php', {method:'POST', body:{key:'cortoba_nas_subfolders', value:subs}})
      .catch(function(e) { console.error('NAS subfolders save error:', e); return {error:true}; })
  );
  Promise.all(promises).then(function(results) {
    var errors = results.filter(function(r) { return r && r.error; });
    if (errors.length > 0) {
      showToast('Erreur lors de la sauvegarde', 'error');
    } else {
      showToast('Configuration dossiers projets NAS enregistrée');
    }
  });
}

// ── Construire l'URL du bridge NAS (HTTP sur le NAS local) ──
function buildNasBridgeUrl(code, clientName, annee) {
  var cfg = getNasConfig();
  var ip = cfg.local || '192.168.1.165';
  var user = cfg.user || 'CASNAS';
  var pass = cfg.pass || 'Cortoba2026';
  var port = cfg.webdavPort || '5005';

  clientName = (clientName||'').replace(/,/g, '');
  var folderName = (code + '_' + clientName).replace(/[<>:"\/\\|?*,]/g, '_').replace(/\s+/g, ' ').trim();
  var folders = 'Public/CAS_PROJETS/' + annee + '/' + folderName;
  var nasPath = '\\\\' + ip + '\\Public\\CAS_PROJETS\\' + annee + '\\' + folderName;

  var tplRaw = getSetting('cortoba_nas_template_folder', '00-Dossier Type') || '00-Dossier Type';
  // Extraire le nom du dossier si chemin UNC ou absolu saisi (ex: \\192.168.1.165\Public\...\00-Dossier Type)
  var tplName = tplRaw.replace(/\\/g, '/').split('/').filter(function(s){return s;}).pop() || '00-Dossier Type';
  var projRoot = getSetting('cortoba_nas_projets_root', '/Public/CAS_PROJETS').replace(/^\//, '');
  var templateFolder = projRoot + '/' + annee + '/' + tplName;

  var subfolders = _getNasSubfolders();

  var hash = 'ip=' + encodeURIComponent(ip)
    + '&user=' + encodeURIComponent(user)
    + '&pass=' + encodeURIComponent(pass)
    + '&port=' + port
    + '&folders=' + encodeURIComponent(folders)
    + '&nasPath=' + encodeURIComponent(nasPath)
    + '&template=' + encodeURIComponent(templateFolder)
    + (subfolders.length ? '&subfolders=' + encodeURIComponent(JSON.stringify(subfolders)) : '');

  return 'http://' + ip + ':' + port + '/Public/nas-tools/nas-bridge.html?v=20260408b#' + hash;
}

// ── Ping NAS local via Image trick (contourne CORS) ──
function nasCheckLocal(callback) {
  var cfg = getNasConfig();
  if (!cfg.local) { callback(false, 0); return; }
  var ip = cfg.local.indexOf('://') === -1 ? cfg.local : cfg.local.split('://')[1];
  var port = cfg.port || '8080';
  var url = 'http://' + ip + ':' + port;
  var start = Date.now();
  var done = false;

  var img = new Image();
  var timer = setTimeout(function() {
    if (!done) { done = true; callback(false, 0); }
  }, 2500);

  img.onload = img.onerror = function() {
    if (!done) {
      done = true;
      clearTimeout(timer);
      var latency = Date.now() - start;
      // Si on a une réponse (même erreur image), le serveur est up
      callback(true, latency);
    }
  };
  // Tenter de charger le favicon QNAP
  img.src = url + '/favicon.ico?_=' + Date.now();
}

// ── Actualiser la barre d'état ──
function nasRefreshStatus() {
  var cfg = getNasConfig();

  // Mise à jour infos config dans le pied
  var localEl = document.getElementById('nas-info-local');
  var cloudEl = document.getElementById('nas-info-cloud');
  if (localEl) localEl.textContent = cfg.local ? cfg.local + ':' + cfg.port : '—';
  if (cloudEl) cloudEl.textContent = cfg.cloud || '—';

  // WebDAV badge
  var wBadge    = document.getElementById('nas-webdav-badge');
  var wBadgeOff = document.getElementById('nas-webdav-badge-off');
  var hasWebdav = !!(cfg.webdavPath && cfg.webdavPort);
  if (wBadge)    wBadge.style.display    = hasWebdav ? '' : 'none';
  if (wBadgeOff) wBadgeOff.style.display = hasWebdav ? 'none' : '';

  // Modèle
  var modelEl = document.getElementById('nas-stat-model');
  if (modelEl) modelEl.textContent = cfg.model || 'QNAP NAS';

  // Stockage (valeurs manuelles jusqu\'à API dispo)
  nasUpdateStorage(cfg.used, cfg.capacity);

  // Ping
  var dot   = document.getElementById('nas-dot');
  var label = document.getElementById('nas-stat-label');
  var addrEl = document.getElementById('nas-stat-addr-text');
  var pingEl = document.getElementById('nas-stat-ping');

  if (dot) dot.style.background = '#888';
  if (label) label.textContent = 'Vérification…';

  // Essai via proxy serveur (api/nas.php) — donne les vraies stats si configuré
  apiFetch('api/nas.php?action=status')
    .then(function(r) {
      var d = r.data || {};
      if (dot)   dot.style.background = d.online ? 'var(--green)' : 'var(--red)';
      if (label) label.innerHTML = d.online
        ? 'État : <strong style="color:var(--green)">En ligne — ' + (d.mode === 'local' ? 'Réseau local' : 'Cloud') + '</strong>'
        : 'État : <strong style="color:var(--red)">Hors ligne</strong>';
      if (addrEl) addrEl.textContent = d.address || '—';
      if (pingEl) pingEl.textContent = d.latency ? 'Latence : ' + d.latency + ' ms' : 'Latence : —';
      if (modelEl) modelEl.textContent = d.model || cfg.model || 'QNAP NAS';
      if (d.capacity) nasUpdateStorage(d.used || 0, d.capacity);
    })
    .catch(function() {
      // Fallback : ping direct navigateur
      nasCheckLocal(function(online, latency) {
        if (online) {
          if (dot)   dot.style.background = 'var(--green)';
          if (label) label.innerHTML = 'État : <strong style="color:var(--green)">En ligne — Local</strong>';
          if (addrEl) addrEl.textContent = cfg.local + ':' + cfg.port;
          if (pingEl) pingEl.textContent = 'Latence : ' + latency + ' ms';
        } else {
          var hasCloud = !!(cfg.cloud && cfg.cloud.length > 10);
          if (dot)   dot.style.background = hasCloud ? 'var(--accent)' : 'var(--red)';
          if (label) label.innerHTML = hasCloud
            ? 'État : <strong style="color:var(--accent)">Cloud uniquement</strong>'
            : 'État : <strong style="color:var(--red)">Hors ligne / Non configuré</strong>';
          if (addrEl) addrEl.textContent = hasCloud ? (cfg.cloud.length > 40 ? cfg.cloud.substring(0,40)+'…' : cfg.cloud) : '—';
          if (pingEl) pingEl.textContent = 'Latence : —';
        }
      });
    });
}

function nasUpdateStorage(used, total) {
  var storageEl = document.getElementById('nas-stat-storage-text');
  var bar       = document.getElementById('nas-storage-bar');
  var fill      = document.getElementById('nas-storage-fill');
  if (!storageEl) return;

  if (!total || total === 0) {
    storageEl.textContent = 'Stockage : non configuré';
    if (bar) bar.style.display = 'none';
    return;
  }

  var pct = Math.round((used / total) * 100);
  var color = pct > 85 ? 'var(--red)' : pct > 65 ? 'var(--accent)' : 'var(--green)';
  storageEl.innerHTML = 'Stockage : <strong>' + used.toFixed(2) + ' To / ' + total + ' To</strong> (' + pct + '%)';
  if (bar)  { bar.style.display = 'block'; }
  if (fill) { fill.style.width = pct + '%'; fill.style.background = color; }
}

// ── Accès boutons ──
function nasOpenLocal() {
  var cfg = getNasConfig();
  if (!cfg.local) { showToast('Adresse locale non configurée', '#e07b72'); return; }
  var localPath = cfg.local.trim();
  // Chemin UNC (\\serveur\dossier) → file://serveur/dossier pour l'explorateur Windows
  var fileUrl;
  if (localPath.startsWith('\\\\')) {
    fileUrl = 'file:' + localPath.replace(/\\/g, '/');
  } else if (localPath.startsWith('//')) {
    fileUrl = 'file:' + localPath;
  } else {
    // IP seule → interface web QTS
    var ip = localPath.indexOf('://') === -1 ? localPath : localPath.split('://')[1];
    window.open('http://' + ip + ':' + (cfg.port || '8080'), '_blank');
    return;
  }
  // Copier le chemin UNC dans le presse-papiers (fallback si le navigateur bloque file://)
  if (navigator.clipboard) {
    navigator.clipboard.writeText(localPath).catch(function(){});
  }
  window.open(fileUrl, '_blank');
}

function nasOpenCloud() {
  var cfg = getNasConfig();
  if (!cfg.cloud) { showToast('URL cloud non configurée — allez dans Paramètres', '#e07b72'); return; }
  window.open(cfg.cloud, '_blank');
}

// ── Test de connexion depuis Paramètres ──
function nasTestConnection() {
  var resEl = document.getElementById('nas-test-result');
  if (resEl) {
    resEl.style.display = 'block';
    resEl.style.background = 'var(--bg-3)';
    resEl.style.color = 'var(--text-3)';
    resEl.style.borderColor = 'var(--border)';
    resEl.textContent = 'Test en cours…';
  }
  nasCheckLocal(function(online, latency) {
    if (!resEl) return;
    if (online) {
      resEl.style.background = 'rgba(90,171,110,0.08)';
      resEl.style.color = 'var(--green)';
      resEl.style.borderColor = 'rgba(90,171,110,0.3)';
      resEl.textContent = '✓ NAS local accessible — Latence : ' + latency + ' ms';
    } else {
      resEl.style.background = 'rgba(224,112,112,0.08)';
      resEl.style.color = '#e07b72';
      resEl.style.borderColor = 'rgba(224,112,112,0.25)';
      resEl.textContent = '✗ NAS local inaccessible. Vérifiez l\'IP, le port, et que vous êtes sur le même réseau WiFi.';
    }
  });
}

// ═══════════════════════════════════════════════════════════════
//  RACCOURCIS NAS — Accès rapide personnalisable
// ═══════════════════════════════════════════════════════════════

var _editingRaccourciId = null;

function getNasRaccourcis() {
  var saved = getSetting('cortoba_nas_raccourcis', null);
  if (Array.isArray(saved) && saved.length > 0) return saved;
  // Défauts
  return [
    { id: 'r1', nom: 'Projets actifs',         desc: 'Plans, DCE, PV de chantier, photos', icone: 'folder',  url: '/Projets' },
    { id: 'r2', nom: 'Documents admin',         desc: 'Devis signés, factures, contrats',  icone: 'doc',     url: '/Admin' },
    { id: 'r3', nom: 'Bibliothèque photos',     desc: 'Réalisations, chantiers, références',icone: 'photo',   url: '/Photos' },
    { id: 'r4', nom: 'Bibliothèque matériaux',  desc: 'Fiches techniques, catalogues',      icone: 'archive', url: '/Materiaux' },
  ];
}

function renderNasRaccourcis() {
  var grid = document.getElementById('nas-raccourcis-grid');
  if (!grid) return;
  var raccourcis = getNasRaccourcis();
  if (raccourcis.length === 0) {
    grid.innerHTML = '<div style="font-size:0.82rem;color:var(--text-3);padding:1rem;text-align:center;border:1px dashed var(--border);border-radius:6px">Aucun raccourci — cliquez sur Ajouter</div>';
    return;
  }
  grid.innerHTML = raccourcis.map(function(r) {
    var icone = NAS_ICONS[r.icone] || '📁';
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:0.7rem 1rem;background:var(--bg-1);border:1px solid var(--border);border-radius:6px;margin-bottom:0.5rem;cursor:pointer;transition:border-color .15s" onmouseover="this.style.borderColor=\'var(--accent)\'" onmouseout="this.style.borderColor=\'var(--border)\'">'
      + '<div style="display:flex;align-items:center;gap:0.8rem;flex:1" onclick="nasOpenRaccourci(\'' + r.id + '\')">'
      + '<div style="width:36px;height:36px;background:var(--accent-bg);border:1px solid rgba(200,169,110,0.25);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">' + icone + '</div>'
      + '<div><div style="font-size:0.85rem;font-weight:500;color:var(--text)">' + escHtml(r.nom) + '</div>'
      + '<div style="font-size:0.7rem;color:var(--text-3);margin-top:1px">' + escHtml(r.desc || '') + '</div></div>'
      + '</div>'
      + '<div style="display:flex;gap:0.3rem;flex-shrink:0">'
      + '<button class="btn btn-sm" onclick="editRaccourci(\'' + r.id + '\')" style="font-size:0.7rem;padding:0.25rem 0.5rem">✏️</button>'
      + '<button class="btn btn-sm" onclick="deleteRaccourci(\'' + r.id + '\')" style="font-size:0.7rem;padding:0.25rem 0.5rem;color:#e07070">✕</button>'
      + '</div></div>';
  }).join('');
}

function nasOpenRaccourci(id) {
  var r = getNasRaccourcis().find(function(x) { return x.id === id; });
  if (!r) return;
  var cfg = getNasConfig();
  // Si l\'URL est absolue, ouvrir directement
  if (r.url && (r.url.indexOf('http://') === 0 || r.url.indexOf('https://') === 0)) {
    window.open(r.url, '_blank'); return;
  }
  // Sinon construire l\'URL NAS locale
  var ip = cfg.local || '192.168.1.100';
  var port = cfg.port || '8080';
  window.open('http://' + ip + ':' + port, '_blank');
}

function selectRcIcon(val, btn) {
  document.querySelectorAll('.rc-icon-btn').forEach(function(b) {
    b.style.borderColor = 'var(--border)';
    b.style.background = 'var(--bg-1)';
  });
  btn.style.borderColor = 'var(--accent)';
  btn.style.background = 'var(--accent-bg)';
  var inp = document.getElementById('rc-icone');
  if (inp) inp.value = val;
}

function openModal_raccourci_reset() {
  _editingRaccourciId = null;
  document.getElementById('modal-raccourci-title').textContent = 'Nouveau raccourci';
  ['rc-nom','rc-desc','rc-url'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  var inp = document.getElementById('rc-icone'); if (inp) inp.value = 'folder';
  document.querySelectorAll('.rc-icon-btn').forEach(function(b) {
    b.style.borderColor = 'var(--border)'; b.style.background = 'var(--bg-1)';
  });
  var first = document.querySelector('.rc-icon-btn');
  if (first) { first.style.borderColor = 'var(--accent)'; first.style.background = 'var(--accent-bg)'; }
}

function editRaccourci(id) {
  var r = getNasRaccourcis().find(function(x) { return x.id === id; });
  if (!r) return;
  _editingRaccourciId = id;
  document.getElementById('modal-raccourci-title').textContent = 'Modifier le raccourci';
  document.getElementById('rc-nom').value  = r.nom  || '';
  document.getElementById('rc-desc').value = r.desc || '';
  document.getElementById('rc-url').value  = r.url  || '';
  document.getElementById('rc-icone').value = r.icone || 'folder';
  document.querySelectorAll('.rc-icon-btn').forEach(function(b) {
    b.style.borderColor = 'var(--border)'; b.style.background = 'var(--bg-1)';
    if (b.getAttribute('onclick') && b.getAttribute('onclick').indexOf("'" + r.icone + "'") !== -1) {
      b.style.borderColor = 'var(--accent)'; b.style.background = 'var(--accent-bg)';
    }
  });
  document.getElementById('modal-nas-raccourci').classList.add('open');
}

function deleteRaccourci(id) {
  if (!confirm('Supprimer ce raccourci ?')) return;
  var list = getNasRaccourcis().filter(function(r) { return r.id !== id; });
  saveSetting('cortoba_nas_raccourcis', list);
  renderNasRaccourcis();
}

function saveRaccourci() {
  var nom  = (document.getElementById('rc-nom').value  || '').trim();
  var desc = (document.getElementById('rc-desc').value || '').trim();
  var url  = (document.getElementById('rc-url').value  || '').trim();
  var icone= (document.getElementById('rc-icone').value|| 'folder');
  if (!nom) { showToast('Le nom est requis', '#e07b72'); return; }

  var list = getNasRaccourcis();
  if (_editingRaccourciId) {
    var idx = list.findIndex(function(r) { return r.id === _editingRaccourciId; });
    if (idx !== -1) { list[idx].nom = nom; list[idx].desc = desc; list[idx].url = url; list[idx].icone = icone; }
  } else {
    list.push({ id: uid(), nom: nom, desc: desc, url: url, icone: icone });
  }
  saveSetting('cortoba_nas_raccourcis', list);
  closeModal('modal-nas-raccourci');
  renderNasRaccourcis();
  showToast('Raccourci enregistré ✓');
  _editingRaccourciId = null;
}

// ═══════════════════════════════════════════════════════════════
//  FICHIERS RÉCENTS NAS
// ═══════════════════════════════════════════════════════════════

var _editingFichierId = null;

function getNasFichiers() {
  return getSetting('cortoba_nas_fichiers', []);
}

function renderNasFichiers() {
  var tbody = document.getElementById('nas-fichiers-tbody');
  if (!tbody) return;
  var fichiers = getNasFichiers();

  if (fichiers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-3);font-size:0.82rem;padding:1.5rem">Aucun fichier — cliquez sur "+ Ajouter" ou "WebDAV" pour charger</td></tr>';
    return;
  }

  // Trier par date desc
  fichiers = fichiers.slice().sort(function(a, b) {
    return new Date(b.date || 0) - new Date(a.date || 0);
  });

  tbody.innerHTML = fichiers.map(function(f) {
    var ext = (f.nom || '').split('.').pop().toLowerCase();
    var extColors = { dwg:'#6fa8d6', pdf:'#e07b72', docx:'#6fa8d6', xlsx:'var(--green)', jpg:'var(--accent)', png:'var(--accent)', zip:'var(--text-2)' };
    var color = extColors[ext] || 'var(--text-3)';
    var dateStr = f.date ? new Date(f.date).toLocaleDateString('fr-FR', {day:'2-digit', month:'short'}) : '—';
    var projetNom = '';
    var projets = getProjets();
    if (f.projetId) {
      var pj = projets.find(function(p) { return p.id === f.projetId; });
      projetNom = pj ? pj.nom : f.projetNom || '';
    } else {
      projetNom = f.projetNom || '';
    }
    return '<tr>'
      + '<td><span style="font-family:var(--font-mono);font-size:0.75rem;color:' + color + ';margin-right:0.4rem">' + ext.toUpperCase() + '</span>' + escHtml(f.nom || '') + '</td>'
      + '<td style="font-size:0.78rem;color:var(--text-2)">' + escHtml(projetNom) + '</td>'
      + '<td style="font-size:0.78rem;color:var(--text-3);white-space:nowrap">' + dateStr + '</td>'
      + '<td style="white-space:nowrap">'
      + (f.url ? '<button class="btn btn-sm" onclick="nasOpenFichier(\'' + f.id + '\')" style="font-size:0.68rem">Ouvrir</button> ' : '')
      + '<button class="btn btn-sm" onclick="deleteFichier(\'' + f.id + '\')" style="font-size:0.68rem;color:#e07070">✕</button>'
      + '</td></tr>';
  }).join('');
}

function nasOpenFichier(id) {
  var f = getNasFichiers().find(function(x) { return x.id === id; });
  if (!f || !f.url) return;
  if (f.url.indexOf('http') === 0) { window.open(f.url, '_blank'); return; }
  var cfg = getNasConfig();
  var base = 'http://' + cfg.local + ':' + (cfg.webdavPort || '5005');
  window.open(base + f.url, '_blank');
}

function openNasFichierModal() {
  _editingFichierId = null;
  document.getElementById('modal-fichier-title').textContent = 'Ajouter un fichier récent';
  ['nf-nom','nf-url'].forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
  var dateEl = document.getElementById('nf-date');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
  // Remplir le select projets
  var sel = document.getElementById('nf-projet');
  if (sel) {
    sel.innerHTML = '<option value="">— Sélectionner un projet —</option>';
    getProjets().forEach(function(p) {
      sel.innerHTML += '<option value="' + p.id + '">' + escHtml(p.nom) + '</option>';
    });
  }
  document.getElementById('modal-nas-fichier').classList.add('open');
}

function saveNasFichier() {
  var nom      = (document.getElementById('nf-nom').value || '').trim();
  var projetId = document.getElementById('nf-projet').value || '';
  var date     = document.getElementById('nf-date').value || '';
  var url      = (document.getElementById('nf-url').value || '').trim();
  if (!nom) { showToast('Le nom du fichier est requis', '#e07b72'); return; }

  var pj = getProjets().find(function(p) { return p.id === projetId; });
  var fichiers = getNasFichiers();
  fichiers.push({ id: uid(), nom: nom, projetId: projetId, projetNom: pj ? pj.nom : '', date: date, url: url });
  saveSetting('cortoba_nas_fichiers', fichiers);
  closeModal('modal-nas-fichier');
  renderNasFichiers();
  showToast('Fichier ajouté ✓');
}

function deleteFichier(id) {
  if (!confirm('Supprimer ce fichier de la liste ?')) return;
  var list = getNasFichiers().filter(function(f) { return f.id !== id; });
  saveSetting('cortoba_nas_fichiers', list);
  renderNasFichiers();
}

// ── Chargement WebDAV via API proxy ──
function nasLoadWebDAV() {
  var cfg = getNasConfig();
  var statusEl = document.getElementById('nas-webdav-status');

  if (!cfg.webdavPath || !cfg.webdavPort) {
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.style.color = '#e07b72';
      statusEl.textContent = '⚠ WebDAV non configuré — renseignez le port et le dossier dans Paramètres → NAS';
    }
    return;
  }

  if (statusEl) { statusEl.style.display = 'block'; statusEl.style.color = 'var(--text-3)'; statusEl.textContent = 'Chargement WebDAV…'; }

  apiFetch('api/nas.php?action=files&path=' + encodeURIComponent(cfg.webdavPath))
    .then(function(r) {
      var files = r.data || [];
      if (files.length === 0) {
        if (statusEl) statusEl.textContent = 'Aucun fichier trouvé dans ' + cfg.webdavPath;
        return;
      }
      // Fusionner avec la liste existante (pas de doublons sur le nom)
      var existing = getNasFichiers();
      var added = 0;
      files.forEach(function(f) {
        if (!existing.find(function(e) { return e.nom === f.nom; })) {
          existing.push({ id: uid(), nom: f.nom, projetNom: '', date: f.modified || '', url: f.path || '', projetId: '' });
          added++;
        }
      });
      saveSetting('cortoba_nas_fichiers', existing);
      renderNasFichiers();
      if (statusEl) { statusEl.style.color = 'var(--green)'; statusEl.textContent = '✓ ' + added + ' fichier(s) importé(s) depuis WebDAV'; }
    })
    .catch(function(e) {
      if (statusEl) { statusEl.style.color = '#e07b72'; statusEl.textContent = '✗ Erreur WebDAV : ' + (e.message || 'vérifiez la configuration et que api/nas.php est déployé'); }
    });
}

// ── Render complet page NAS ──
function renderNasPage() {
  renderNasRaccourcis();
  renderNasFichiers();
  nasRefreshStatus();
}

// Extraire l'IP pure d'une valeur qui peut contenir un chemin UNC
function extractNasIp(val) {
  if (!val) return '';
  var s = val.replace(/\\/g, '/').replace(/^\/+/, '');
  if (s.indexOf('/') === -1) return s;
  var m = s.match(/^([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/);
  if (m) return m[1];
  return s.split('/')[0];
}

// ══════════════════════════════════════════════════════════
//  DEMANDES (configurateur public)
// ══════════════════════════════════════════════════════════

var _openDemandeId = null;

function renderDemandes() {
  var demandes = getDemandes();
  var tbody = document.getElementById('demandes-tbody');
  if (!tbody) return;

  // KPIs
  var nouvelles = 0, encours = 0, converties = 0;
  demandes.forEach(function(d) {
    if (d.statut === 'nouvelle') nouvelles++;
    else if (d.statut === 'en_cours') encours++;
    else if (d.statut === 'client_cree' || d.statut === 'projet_cree' || d.statut === 'devis_cree') converties++;
  });
  var el;
  el = document.getElementById('dem-kpi-nouvelles'); if (el) el.textContent = nouvelles;
  el = document.getElementById('dem-kpi-encours');   if (el) el.textContent = encours;
  el = document.getElementById('dem-kpi-converties'); if (el) el.textContent = converties;
  el = document.getElementById('dem-kpi-total');     if (el) el.textContent = demandes.length;

  // Badge sidebar
  var badge = document.getElementById('demandes-badge');
  if (badge) { badge.textContent = nouvelles; badge.style.display = nouvelles > 0 ? '' : 'none'; }

  // Filtres
  var q = (document.getElementById('demandes-search') || {}).value || '';
  var statut = (document.getElementById('demandes-filtre-statut') || {}).value || '';
  var filtered = demandes.filter(function(d) {
    if (statut && d.statut !== statut) return false;
    if (q) {
      var lq = q.toLowerCase();
      var searchStr = (d.nom_projet + ' ' + d.prenom + ' ' + d.nom + ' ' + d.tel + ' ' + (d.email || '')).toLowerCase();
      if (searchStr.indexOf(lq) === -1) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-3);padding:2rem">Aucune demande</td></tr>';
    return;
  }

  var html = '';
  filtered.forEach(function(d) {
    var date = d.cree_at ? d.cree_at.substring(0, 10) : '—';
    var surface = d.surface_estimee ? parseFloat(d.surface_estimee).toFixed(0) + ' m²' : '—';
    var cout = '—';
    if (d.cout_estime_low && d.cout_estime_high) {
      cout = Math.round(d.cout_estime_low/1000) + 'k – ' + Math.round(d.cout_estime_high/1000) + 'k TND';
    }
    var statutBadge = getDemandeStatutBadge(d.statut);
    html += '<tr style="cursor:pointer" onclick="openDemande(\'' + d.id + '\')">'
      + '<td>' + date + '</td>'
      + '<td><strong>' + esc(d.nom_projet) + '</strong></td>'
      + '<td>' + esc(d.prenom + ' ' + d.nom) + '</td>'
      + '<td>' + esc(d.tel) + '</td>'
      + '<td>' + surface + '</td>'
      + '<td>' + cout + '</td>'
      + '<td>' + statutBadge + '</td>'
      + '<td><button class="btn btn-sm" onclick="event.stopPropagation();openDemande(\'' + d.id + '\')">Voir</button></td>'
      + '</tr>';
  });
  tbody.innerHTML = html;
}

function getDemandeStatutBadge(statut) {
  var map = {
    'nouvelle':     'badge-blue',
    'en_cours':     'badge-yellow',
    'client_cree':  'badge-green',
    'projet_cree':  'badge-green',
    'devis_cree':   'badge-green',
    'archivee':     'badge-gray'
  };
  var labels = {
    'nouvelle':     'Nouvelle',
    'en_cours':     'En cours',
    'client_cree':  'Client créé',
    'projet_cree':  'Projet créé',
    'devis_cree':   'Devis créé',
    'archivee':     'Archivée'
  };
  var cls = map[statut] || 'badge-gray';
  var label = labels[statut] || statut;
  return '<span class="badge ' + cls + '">' + label + '</span>';
}

function filterDemandes() {
  renderDemandes();
}

function esc(s) {
  if (!s) return '';
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ── Affichage structuré des données configurateur ──
function renderCfgDataStructured(cfg, d) {
  var s = '<style>.dem-section{margin-bottom:1.2rem}.dem-section-title{font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--accent);margin-bottom:0.6rem;font-weight:600;display:flex;align-items:center;gap:0.4rem}.dem-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.3rem 1.5rem}.dem-item{display:flex;justify-content:space-between;padding:0.35rem 0;border-bottom:1px solid rgba(255,255,255,.04)}.dem-item-label{color:var(--text-3);font-size:0.78rem}.dem-item-val{font-size:0.78rem;font-weight:500;text-align:right}.dem-rooms-table{width:100%;border-collapse:collapse;font-size:0.78rem;margin-top:0.4rem}.dem-rooms-table th{text-align:left;padding:0.4rem 0.6rem;color:var(--text-3);border-bottom:1px solid var(--border);font-weight:400;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em}.dem-rooms-table td{padding:0.4rem 0.6rem;border-bottom:1px solid rgba(255,255,255,.04)}.dem-rooms-table tr:last-child td{border-bottom:none;font-weight:600}.dem-tag{display:inline-block;padding:0.15rem 0.5rem;border-radius:3px;font-size:0.72rem;background:var(--accent-bg);color:var(--accent);border:1px solid rgba(200,169,110,.25);margin:0.1rem 0.15rem}</style>';

  function item(label, val) {
    if (val === null || val === undefined || val === '' || val === false || val === 0) return '';
    var display = val === true ? '✓' : esc(String(val));
    return '<div class="dem-item"><span class="dem-item-label">' + label + '</span><span class="dem-item-val">' + display + '</span></div>';
  }
  function fmtNum(n) { return n ? Number(n).toLocaleString('fr-FR') : '—'; }

  // ── Section 1 : Identité du projet ──
  s += '<div class="dem-section"><div class="dem-section-title"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg> Identité du projet</div>';
  s += '<div class="dem-grid">';
  s += item('Type de bâtiment', cfg.cfg_type);
  s += item('Catégorie', cfg.cfg_type_group);
  s += item('Opération', cfg.cfg_operation);
  s += item('Style architectural', cfg.cfg_style);
  s += item('Niveau de standing', cfg.cfg_standing);
  s += item('Nombre de niveaux', cfg.cfg_niveaux);
  s += item('Budget prévisionnel', cfg.cfg_budget_custom ? fmtNum(cfg.cfg_budget_custom) + ' TND' : null);
  s += item('Forme', cfg.cfg_forme);
  s += '</div></div>';

  // ── Section 2 : Terrain & localisation ──
  if (cfg.cfg_terrain || cfg.cfg_lat) {
    s += '<div class="dem-section"><div class="dem-section-title"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Terrain & localisation</div>';
    s += '<div class="dem-grid">';
    s += item('Surface terrain', cfg.cfg_terrain ? fmtNum(cfg.cfg_terrain) + ' m²' : null);
    s += item('Nature du terrain', cfg.cfg_terrain_nature);
    if (cfg.cfg_lat && cfg.cfg_lng) {
      s += '<div class="dem-item"><span class="dem-item-label">Coordonnées GPS</span><span class="dem-item-val"><a href="https://maps.google.com/?q=' + cfg.cfg_lat + ',' + cfg.cfg_lng + '" target="_blank" style="color:var(--accent);text-decoration:none">' + cfg.cfg_lat + ', ' + cfg.cfg_lng + ' ↗</a></span></div>';
    }
    s += '</div></div>';
  }

  // ── Section 3 : Programme — tableau des pièces ──
  var bilanRooms = cfg.bilanRooms || [];
  if (bilanRooms.length > 0) {
    var habRooms = bilanRooms.filter(function(r) { return !r.ext; });
    var extRooms = bilanRooms.filter(function(r) { return r.ext; });
    var totalHab = habRooms.reduce(function(a, r) { return a + (r.s || 0); }, 0);
    var totalExt = extRooms.reduce(function(a, r) { return a + (r.s || 0); }, 0);

    s += '<div class="dem-section"><div class="dem-section-title"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg> Programme des espaces</div>';
    s += '<table class="dem-rooms-table"><thead><tr><th>Espace</th><th style="text-align:right;width:80px">Surface</th></tr></thead><tbody>';
    habRooms.forEach(function(r) {
      s += '<tr><td>' + esc(r.label) + '</td><td style="text-align:right">' + r.s + ' m²</td></tr>';
    });
    s += '<tr><td>Total habitable (hors circulations)</td><td style="text-align:right;color:var(--accent)">' + totalHab + ' m²</td></tr>';
    s += '</tbody></table>';

    if (extRooms.length > 0) {
      s += '<table class="dem-rooms-table" style="margin-top:0.6rem"><thead><tr><th>Annexes</th><th style="text-align:right;width:80px">Surface</th></tr></thead><tbody>';
      extRooms.forEach(function(r) {
        s += '<tr><td>' + esc(r.label) + '</td><td style="text-align:right">' + r.s + ' m²</td></tr>';
      });
      s += '<tr><td>Total annexes</td><td style="text-align:right;color:var(--accent)">' + totalExt + ' m²</td></tr>';
      s += '</tbody></table>';
    }

    // Barre visuelle proportionnelle
    if (habRooms.length > 1) {
      var colors = ['#c8a96e','#8bc8a0','#6ea8c8','#c86e8b','#c8b46e','#6ec8c8','#a06ec8','#c89e6e','#6e8bc8','#c86e6e'];
      s += '<div style="display:flex;height:18px;border-radius:4px;overflow:hidden;margin-top:0.8rem;gap:1px">';
      habRooms.forEach(function(r, i) {
        var pct = totalHab > 0 ? (r.s / totalHab * 100) : 0;
        if (pct < 2) pct = 2;
        s += '<div title="' + esc(r.label) + ' — ' + r.s + ' m²" style="flex:' + r.s + ';background:' + colors[i % colors.length] + ';min-width:4px;transition:flex .3s"></div>';
      });
      s += '</div>';
      // Légende
      s += '<div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.5rem">';
      habRooms.forEach(function(r, i) {
        s += '<span style="font-size:0.65rem;display:flex;align-items:center;gap:0.25rem;color:var(--text-3)"><span style="width:8px;height:8px;border-radius:2px;background:' + colors[i % colors.length] + ';flex-shrink:0"></span>' + esc(r.label) + '</span>';
      });
      s += '</div>';
    }
    s += '</div>';
  }

  // ── Section 4 : Équipements extérieurs ──
  var extFeatures = [];
  if (cfg.cfg_piscine) {
    var pDesc = (cfg.cfg_piscine_type === 'debordement' ? 'À débordement' : 'À skimmer');
    if (cfg.cfg_piscine_forma) pDesc += ', ' + cfg.cfg_piscine_forma;
    if (cfg.cfg_pisc_length && cfg.cfg_pisc_width) pDesc += ' (' + cfg.cfg_pisc_length + '×' + cfg.cfg_pisc_width + ' m)';
    else if (cfg.cfg_pisc_area) pDesc += ' (' + cfg.cfg_pisc_area + ' m²)';
    extFeatures.push({ label: 'Piscine', detail: pDesc });
  }
  if (cfg.cfg_terrasse) extFeatures.push({ label: 'Terrasse aménagée', detail: '' });
  if (cfg.cfg_cuisine_ext) extFeatures.push({ label: 'Cuisine extérieure', detail: '' });
  if (cfg.cfg_sanitaires_ext) extFeatures.push({ label: 'Sanitaires extérieurs', detail: '' });
  if (cfg.cfg_salon_ext) extFeatures.push({ label: 'Salon extérieur', detail: '' });
  if (cfg.cfg_debarrat) extFeatures.push({ label: 'Débarras', detail: '' });
  if (cfg.cfg_toit_terrasse) extFeatures.push({ label: 'Toit terrasse', detail: '' });
  if (cfg.cfg_cloture) extFeatures.push({ label: 'Clôture', detail: cfg.cfg_cloture_length ? cfg.cfg_cloture_length + ' ml' : '' });

  if (extFeatures.length > 0) {
    s += '<div class="dem-section"><div class="dem-section-title"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg> Équipements extérieurs</div>';
    s += '<div style="display:flex;flex-wrap:wrap;gap:0.4rem">';
    extFeatures.forEach(function(f) {
      s += '<span class="dem-tag">' + esc(f.label) + (f.detail ? ' <span style="opacity:0.7">· ' + esc(f.detail) + '</span>' : '') + '</span>';
    });
    s += '</div></div>';
  }

  // ── Section 5 : Estimation financière ──
  if (d.surface_estimee || d.cout_estime_low) {
    s += '<div class="dem-section"><div class="dem-section-title"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Estimation financière</div>';
    s += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.8rem;text-align:center">';
    if (d.surface_estimee) {
      s += '<div style="background:var(--bg-2);border-radius:6px;padding:0.8rem 0.5rem;border:1px solid var(--border)"><div style="font-size:1.2rem;font-weight:700;color:var(--text)">' + fmtNum(Math.round(d.surface_estimee)) + '</div><div style="font-size:0.68rem;color:var(--text-3);margin-top:0.2rem">m² estimés</div></div>';
    }
    if (d.cout_estime_low) {
      s += '<div style="background:var(--bg-2);border-radius:6px;padding:0.8rem 0.5rem;border:1px solid var(--border)"><div style="font-size:1.2rem;font-weight:700;color:var(--text)">' + fmtNum(Math.round(d.cout_estime_low/1000)) + 'k</div><div style="font-size:0.68rem;color:var(--text-3);margin-top:0.2rem">TND (estimation basse)</div></div>';
    }
    if (d.cout_estime_high) {
      s += '<div style="background:var(--bg-2);border-radius:6px;padding:0.8rem 0.5rem;border:1px solid var(--border)"><div style="font-size:1.2rem;font-weight:700;color:var(--accent)">' + fmtNum(Math.round(d.cout_estime_high/1000)) + 'k</div><div style="font-size:0.68rem;color:var(--text-3);margin-top:0.2rem">TND (estimation haute)</div></div>';
    }
    s += '</div></div>';
  }

  // ── Section 6 : Missions demandées ──
  var missions = cfg.missions || [];
  if (missions.length > 0) {
    var cats = getMissionCategories();
    s += '<div class="dem-section"><div class="dem-section-title"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> Missions demandées <span style="font-size:0.68rem;color:var(--text-3);font-weight:400;text-transform:none;letter-spacing:0">(' + missions.length + ')</span></div>';
    // Grouper par catégorie
    var byCat = {};
    missions.forEach(function(m) {
      var catId = m.cat || 'other';
      if (!byCat[catId]) byCat[catId] = [];
      byCat[catId].push(m);
    });
    // Si les missions n'ont pas de .cat, essayer de retrouver via l'id dans DEFAULT_MISSIONS
    if (Object.keys(byCat).length === 1 && byCat['other']) {
      var allM = getMissions();
      byCat = {};
      missions.forEach(function(m) {
        var found = allM.find(function(dm) { return dm.id === m.id; });
        var catId = found ? found.cat : 'other';
        if (!byCat[catId]) byCat[catId] = [];
        byCat[catId].push({ id: m.id, nom: m.nom || (found ? found.nom : m.id) });
      });
    }
    cats.forEach(function(cat) {
      var catMissions = byCat[cat.id];
      if (!catMissions || catMissions.length === 0) return;
      s += '<div style="margin-bottom:0.5rem"><span style="font-size:0.68rem;font-weight:600;color:var(--text-2);text-transform:uppercase;letter-spacing:0.08em">' + esc(cat.label) + '</span>';
      s += '<div style="display:flex;flex-wrap:wrap;gap:0.3rem;margin-top:0.25rem">';
      catMissions.forEach(function(m) {
        s += '<span class="dem-tag">' + esc(m.nom || m.id) + '</span>';
      });
      s += '</div></div>';
    });
    // Orphelins
    if (byCat['other'] && byCat['other'].length > 0) {
      s += '<div style="display:flex;flex-wrap:wrap;gap:0.3rem;margin-top:0.3rem">';
      byCat['other'].forEach(function(m) { s += '<span class="dem-tag">' + esc(m.nom || m.id) + '</span>'; });
      s += '</div>';
    }
    s += '</div>';
  }

  return s;
}

function openDemande(id) {
  _openDemandeId = id;
  var d = getDemandes().find(function(x) { return x.id === id; });
  if (!d) return;

  // Titre
  var title = document.getElementById('modal-demande-title');
  if (title) title.textContent = d.nom_projet || 'Demande';

  // Client info
  var clientEl = document.getElementById('dem-detail-client');
  if (clientEl) {
    clientEl.innerHTML = '<strong>' + esc(d.prenom) + ' ' + esc(d.nom) + '</strong><br>'
      + '📞 ' + esc(d.tel) + '<br>'
      + (d.whatsapp ? '💬 ' + esc(d.whatsapp) + '<br>' : '')
      + (d.email ? '✉ ' + esc(d.email) : '<span style="color:var(--text-3)">Pas d\'email</span>');
  }

  // Projet info
  var projetEl = document.getElementById('dem-detail-projet');
  if (projetEl) {
    var surface = d.surface_estimee ? parseFloat(d.surface_estimee).toFixed(0) + ' m²' : '—';
    var cout = '—';
    if (d.cout_estime_low && d.cout_estime_high) {
      cout = Number(d.cout_estime_low).toLocaleString('fr-FR') + ' – ' + Number(d.cout_estime_high).toLocaleString('fr-FR') + ' TND';
    }
    projetEl.innerHTML = '<strong>' + esc(d.nom_projet) + '</strong><br>'
      + 'Surface estimée : ' + surface + '<br>'
      + 'Coût estimé : ' + cout;
  }

  // Cfg data — affichage structuré
  var cfgEl = document.getElementById('dem-detail-cfg');
  if (cfgEl) {
    try {
      var cfg = typeof d.cfg_data === 'string' ? JSON.parse(d.cfg_data) : (d.cfg_data || {});
      var html = renderCfgDataStructured(cfg, d);
      cfgEl.innerHTML = html || '<span style="color:var(--text-3)">Aucune donnée</span>';
    } catch(e) {
      cfgEl.innerHTML = '<span style="color:var(--text-3)">Données non disponibles</span>';
    }
  }

  // Remarques
  var remEl = document.getElementById('dem-remarques');
  if (remEl) remEl.value = d.remarques || '';

  // Statut
  var statutEl = document.getElementById('dem-detail-statut');
  if (statutEl) statutEl.innerHTML = getDemandeStatutBadge(d.statut);

  var traiteEl = document.getElementById('dem-detail-traite');
  if (traiteEl) {
    traiteEl.textContent = d.traite_par ? ('Traité par ' + d.traite_par + (d.traite_at ? ' le ' + d.traite_at.substring(0,10) : '')) : '';
  }

  // Boutons état
  var btnClient = document.getElementById('dem-btn-client');
  var btnProjet = document.getElementById('dem-btn-projet');
  var btnDevis  = document.getElementById('dem-btn-devis');
  if (btnClient) btnClient.disabled = !!d.client_id;
  if (btnProjet) btnProjet.disabled = !d.client_id || !!d.projet_id;
  if (btnDevis)  btnDevis.disabled  = !d.projet_id;

  openModal('modal-demande');
}

function saveDemandeRemarques() {
  if (!_openDemandeId) return;
  var rem = (document.getElementById('dem-remarques') || {}).value || '';
  apiFetch('api/demandes.php?id=' + _openDemandeId, {
    method: 'PUT',
    body: { action: 'update_remarques', remarques: rem }
  }).then(function() {
    // Mettre à jour le cache
    var d = getDemandes().find(function(x) { return x.id === _openDemandeId; });
    if (d) d.remarques = rem;
    showToast('Remarques enregistrées');
  }).catch(function(e) { showToast('Erreur : ' + e.message, 'error'); });
}

function convertDemandeToClient() {
  if (!_openDemandeId) return;
  if (!confirm('Créer une fiche client à partir de cette demande ?')) return;
  apiFetch('api/demandes.php?id=' + _openDemandeId, {
    method: 'PUT',
    body: { action: 'convertir_client' }
  }).then(function(r) {
    showToast('✓ Fiche client créée');
    // Recharger les données
    return loadData();
  }).then(function() {
    renderAll();
    openDemande(_openDemandeId); // Refresh la modal
  }).catch(function(e) { showToast('Erreur : ' + e.message, 'error'); });
}

function convertDemandeToProjet() {
  if (!_openDemandeId) return;
  var d = getDemandes().find(function(x) { return x.id === _openDemandeId; });
  if (d && !d.client_id) {
    showToast('Veuillez d\'abord créer la fiche client', 'error');
    return;
  }
  // Ouvrir le configurateur pré-rempli avec les données de la demande
  var token = sessionStorage.getItem('cortoba_token');
  if (token) localStorage.setItem('cortoba_xfer_token', JSON.stringify({token:token, ts:Date.now()}));
  window.open('configurateur.html?demande=' + _openDemandeId, '_blank');
}

function createDevisFromDemande() {
  if (!_openDemandeId) return;
  var d = getDemandes().find(function(x) { return x.id === _openDemandeId; });
  if (d && !d.projet_id) {
    showToast('Veuillez d\'abord créer la fiche projet', 'error');
    return;
  }
  // Ouvrir le modal devis pré-rempli
  closeModal('modal-demande');
  showPage('devis');
  setTimeout(function() {
    openModal('modal-devis');
    // Pré-remplir le client (input texte)
    var clientEl = document.getElementById('dv-client');
    if (clientEl) {
      var client = getClients().find(function(c) { return c.id === d.client_id; });
      clientEl.value = client ? (client.displayNom || client.display_nom || d.prenom + ' ' + d.nom) : (d.prenom + ' ' + d.nom);
    }
    // Objet du devis
    var cfg = {};
    try { cfg = typeof d.cfg_data === 'string' ? JSON.parse(d.cfg_data) : (d.cfg_data || {}); } catch(e){}
    var objEl = document.getElementById('dv-objet');
    if (objEl) {
      var parts = ['Projet ' + d.nom_projet];
      if (cfg.cfg_type) parts.push(cfg.cfg_type);
      if (cfg.cfg_operation) parts.push(cfg.cfg_operation);
      objEl.value = parts.join(' — ');
    }
    // Montant estimé
    var montantEl = document.getElementById('dv-montant');
    if (montantEl && d.cout_estime_high) {
      montantEl.value = Math.round(parseFloat(d.cout_estime_high) * 0.08); // ~8% honoraires
    }
    // Pré-sélectionner les missions depuis la demande
    var demMissions = (cfg.missions || []).map(function(m) { return m.id || m.nom; });
    populateDevisMissions(demMissions);
  }, 200);
}

function archiveDemande() {
  if (!_openDemandeId) return;
  if (!confirm('Archiver cette demande ?')) return;
  apiFetch('api/demandes.php?id=' + _openDemandeId, {
    method: 'PUT',
    body: { action: 'update_statut', statut: 'archivee' }
  }).then(function() {
    var d = getDemandes().find(function(x) { return x.id === _openDemandeId; });
    if (d) d.statut = 'archivee';
    renderDemandes();
    closeModal('modal-demande');
    showToast('Demande archivée');
  }).catch(function(e) { showToast('Erreur : ' + e.message, 'error'); });
}

// ══════════════════════════════════════════════════════════
//  PARAMÈTRES CONFIGURATEUR
// ══════════════════════════════════════════════════════════

var CFG_DEFAULTS = {
  cfg_cost_per_m2: {
    standard:  { contemporain: 1200, traditionnel: 1100, industriel: 1050, bioclimatique: 1350 },
    confort:   { contemporain: 1600, traditionnel: 1450, industriel: 1400, bioclimatique: 1750 },
    premium:   { contemporain: 2200, traditionnel: 2000, industriel: 1900, bioclimatique: 2400 }
  },
  cfg_zone_coefficients: {
    'grand-tunis': 1.15, sahel: 1.05, sfax: 1.00, djerba: 1.10, nord: 0.95, autres: 0.90
  },
  cfg_ext_costs: {
    vrd: 80, amenagement: 60, branchements: 40, honoraires: 8
  },
  cfg_ratios: {
    shob: 1.15, emprise: 40
  }
};

function loadCfgParams() {
  var costs = getSetting('cfg_cost_per_m2', CFG_DEFAULTS.cfg_cost_per_m2);
  var zones = getSetting('cfg_zone_coefficients', CFG_DEFAULTS.cfg_zone_coefficients);
  var ext   = getSetting('cfg_ext_costs', CFG_DEFAULTS.cfg_ext_costs);
  var ratios = getSetting('cfg_ratios', CFG_DEFAULTS.cfg_ratios);

  // Remplir les inputs coûts
  ['standard','confort','premium'].forEach(function(standing) {
    ['contemporain','traditionnel','industriel','bioclimatique'].forEach(function(style) {
      var el = document.getElementById('cfg-cost-' + standing + '-' + style);
      if (el) el.value = (costs[standing] && costs[standing][style]) || CFG_DEFAULTS.cfg_cost_per_m2[standing][style];
    });
  });

  // Zones
  var zoneIds = {'grand-tunis':'grand-tunis', sahel:'sahel', sfax:'sfax', djerba:'djerba', nord:'nord', autres:'autres'};
  Object.keys(zoneIds).forEach(function(k) {
    var el = document.getElementById('cfg-zone-' + k);
    if (el) el.value = zones[k] !== undefined ? zones[k] : CFG_DEFAULTS.cfg_zone_coefficients[k];
  });

  // Ext costs
  ['vrd','amenagement','branchements','honoraires'].forEach(function(k) {
    var el = document.getElementById('cfg-ext-' + k);
    if (el) el.value = ext[k] !== undefined ? ext[k] : CFG_DEFAULTS.cfg_ext_costs[k];
  });

  // Ratios
  var elShob = document.getElementById('cfg-ratio-shob');
  if (elShob) elShob.value = ratios.shob || CFG_DEFAULTS.cfg_ratios.shob;
  var elEmprise = document.getElementById('cfg-ratio-emprise');
  if (elEmprise) elEmprise.value = ratios.emprise || CFG_DEFAULTS.cfg_ratios.emprise;
}

function saveCfgParams() {
  var costs = {};
  ['standard','confort','premium'].forEach(function(standing) {
    costs[standing] = {};
    ['contemporain','traditionnel','industriel','bioclimatique'].forEach(function(style) {
      var el = document.getElementById('cfg-cost-' + standing + '-' + style);
      costs[standing][style] = el ? parseFloat(el.value) || 0 : 0;
    });
  });

  var zones = {};
  ['grand-tunis','sahel','sfax','djerba','nord','autres'].forEach(function(k) {
    var el = document.getElementById('cfg-zone-' + k);
    zones[k] = el ? parseFloat(el.value) || 0 : 0;
  });

  var ext = {};
  ['vrd','amenagement','branchements','honoraires'].forEach(function(k) {
    var el = document.getElementById('cfg-ext-' + k);
    ext[k] = el ? parseFloat(el.value) || 0 : 0;
  });

  var ratios = {
    shob: parseFloat((document.getElementById('cfg-ratio-shob') || {}).value) || 1.15,
    emprise: parseFloat((document.getElementById('cfg-ratio-emprise') || {}).value) || 40
  };

  Promise.all([
    saveSetting('cfg_cost_per_m2', costs),
    saveSetting('cfg_zone_coefficients', zones),
    saveSetting('cfg_ext_costs', ext),
    saveSetting('cfg_ratios', ratios)
  ]).then(function(results) {
    var errors = results.filter(function(r){ return r && r.error; });
    if (errors.length > 0) {
      showToast('⚠ Sauvegarde locale OK, mais ' + errors.length + ' erreur(s) serveur', 'error');
    } else {
      showToast('✓ Paramètres configurateur enregistrés');
    }
  });
}

function resetCfgParams() {
  if (!confirm('Réinitialiser tous les paramètres du configurateur aux valeurs par défaut ?')) return;
  saveSetting('cfg_cost_per_m2', CFG_DEFAULTS.cfg_cost_per_m2);
  saveSetting('cfg_zone_coefficients', CFG_DEFAULTS.cfg_zone_coefficients);
  saveSetting('cfg_ext_costs', CFG_DEFAULTS.cfg_ext_costs);
  saveSetting('cfg_ratios', CFG_DEFAULTS.cfg_ratios);
  loadCfgParams();
  showToast('Paramètres réinitialisés');
}

// ═══════════════════════════════════════════════════════════
//  SUIVI DES MISSIONS — Module complet
// ═══════════════════════════════════════════════════════════

var _suiviCache = [];
var _suiviView = 'list'; // 'list' ou 'kanban'

function loadTaches(projetId) {
  var url = 'api/taches.php';
  if (projetId) url += '?projet_id=' + encodeURIComponent(projetId);
  return apiFetch(url).then(function(r) {
    _suiviCache = (r.data || []).map(function(t) {
      if (t.projet_id !== undefined)   t.projetId    = t.projet_id;
      if (t.parent_id !== undefined)   t.parentId    = t.parent_id;
      if (t.projet_nom !== undefined)  t.projetNom   = t.projet_nom;
      if (t.projet_code !== undefined) t.projetCode  = t.projet_code;
      if (t.date_debut !== undefined)  t.dateDebut   = t.date_debut;
      if (t.date_echeance !== undefined) t.dateEcheance = t.date_echeance;
      if (t.cree_par !== undefined)    t.creePar     = t.cree_par;
      if (t.cree_at !== undefined)     t.creeAt      = t.cree_at;
      t.niveau      = parseInt(t.niveau, 10);
      if (isNaN(t.niveau)) t.niveau = 0;
      t.progression = parseInt(t.progression, 10) || 0;
      t.ordre       = parseInt(t.ordre, 10) || 0;
      t.livrables_total = parseInt(t.livrables_total, 10) || 0;
      t.livrables_done  = parseInt(t.livrables_done,  10) || 0;
      return t;
    });
    console.info('[loadTaches] ' + _suiviCache.length + ' tâches chargées');
    return _suiviCache;
  }).catch(function(e) {
    console.error('[loadTaches] Erreur:', e);
    showToast('Erreur chargement tâches : ' + (e.message||e), 'error');
    return _suiviCache;
  });
}

function renderSuiviPage() {
  console.info('[renderSuiviPage] _suiviCache:', _suiviCache.length, 'éléments');
  var filterProjet   = document.getElementById('suivi-filter-projet').value;
  var filterStatut   = document.getElementById('suivi-filter-statut').value;
  var filterPriorite = document.getElementById('suivi-filter-priorite').value;
  var filterLocation = (document.getElementById('suivi-filter-location')||{}).value || '';
  var search = (document.getElementById('suivi-search').value || '').toLowerCase().trim();

  // Populate project select (une seule fois)
  var selProjet = document.getElementById('suivi-filter-projet');
  if (selProjet.options.length <= 1) {
    getProjets().forEach(function(p) {
      var opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = (p.code ? p.code + ' — ' : '') + p.nom;
      selProjet.appendChild(opt);
    });
    if (filterProjet) selProjet.value = filterProjet;
  }

  // Filter tasks
  var filtered = _suiviCache.filter(function(t) {
    if (filterProjet && (t.projet_id || t.projetId) !== filterProjet) return false;
    if (filterStatut && t.statut !== filterStatut) return false;
    if (filterPriorite && t.priorite !== filterPriorite) return false;
    if (filterLocation && (t.location_type||'Bureau') !== filterLocation) return false;
    if (search) {
      var hay = ((t.titre||'') + ' ' + (t.description||'') + ' ' + (t.assignee||'') + ' ' + (t.projetNom||'')).toLowerCase();
      if (hay.indexOf(search) === -1) return false;
    }
    return true;
  });
  console.info('[renderSuiviPage] filtered:', filtered.length, 'après filtres, projet=' + filterProjet + ', statut=' + filterStatut);

  // Count
  var countEl = document.getElementById('suivi-count');
  var missions = filtered.filter(function(t){ return t.niveau === 0; });
  var taches = filtered.filter(function(t){ return t.niveau === 1; });
  var sousTaches = filtered.filter(function(t){ return t.niveau === 2; });
  countEl.textContent = missions.length + ' mission' + (missions.length > 1 ? 's' : '') +
    ' · ' + taches.length + ' tâche' + (taches.length > 1 ? 's' : '') +
    ' · ' + sousTaches.length + ' sous-tâche' + (sousTaches.length > 1 ? 's' : '');

  if (_suiviView === 'kanban') {
    renderSuiviKanban(filtered);
  } else if (_suiviView === 'membres') {
    renderSuiviMembres(filtered);
  } else {
    renderSuiviTree(filtered);
  }
}

// ── Statut badge helper ──
function suiviStatutBadge(statut) {
  var cls = 'badge-gray';
  if (statut === 'En cours') cls = 'badge-blue';
  if (statut === 'Terminé') cls = 'badge-green';
  if (statut === 'Bloqué')  cls = 'badge-red';
  if (statut === 'A faire') cls = 'badge-orange';
  return '<span class="badge ' + cls + '">' + statut + '</span>';
}

function suiviPrioriteBadge(p) {
  if (p === 'Urgente') return '<span class="suivi-prio suivi-prio-urgente">Urgente</span>';
  if (p === 'Haute')   return '<span class="suivi-prio suivi-prio-haute">Haute</span>';
  if (p === 'Basse')   return '<span class="suivi-prio suivi-prio-basse">Basse</span>';
  return '';
}

function _livrablesBadgeHtml(t) {
  var tot = parseInt(t && t.livrables_total, 10) || 0;
  if (!tot) return '';
  var done = parseInt(t && t.livrables_done, 10) || 0;
  var full = done >= tot;
  var color = full ? 'var(--green)' : (done > 0 ? 'var(--accent)' : 'var(--text-3)');
  return '<span class="suivi-livrables-badge" title="Livrables cochés" style="display:inline-flex;align-items:center;gap:0.2rem;font-size:0.7rem;color:' + color + ';background:var(--bg-2);border:1px solid var(--border);border-radius:10px;padding:0.05rem 0.45rem;margin-left:0.35rem">☑ ' + done + '/' + tot + '</span>';
}

function suiviProgressBar(val) {
  var color = val >= 100 ? 'var(--green)' : val >= 50 ? 'var(--accent)' : 'var(--blue)';
  return '<div class="suivi-progress-wrap">' +
    '<div class="suivi-progress-bar" style="width:' + val + '%;background:' + color + '"></div>' +
    '</div>' +
    '<span class="suivi-progress-text">' + val + '%</span>';
}

// ── Extraire l'année depuis le code projet "XX_YY_CODE" → 20YY ──
function _extractProjetYear(code, fallback) {
  if (code) {
    var m = String(code).match(/^\d{1,3}_(\d{2})_/);
    if (m) {
      var yy = parseInt(m[1], 10);
      return yy < 50 ? (2000 + yy) : (1900 + yy);
    }
  }
  if (fallback) {
    var d = new Date(fallback);
    if (!isNaN(d)) return d.getFullYear();
  }
  return (new Date()).getFullYear();
}

// Pourcentage planifié = temps écoulé entre date_debut et date_echeance
function _calcPlanifiedPct(debut, fin) {
  if (!debut || !fin) return 0;
  var d1 = new Date(debut).getTime();
  var d2 = new Date(fin).getTime();
  var now = Date.now();
  if (isNaN(d1) || isNaN(d2) || d2 <= d1) return 0;
  if (now <= d1) return 0;
  if (now >= d2) return 100;
  return Math.round((now - d1) / (d2 - d1) * 100);
}

// Pastille de couleur membre
function _memberDot(name) {
  if (!name) return '';
  var c = (typeof getMemberColor === 'function') ? getMemberColor(name) : '#c8a96e';
  return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+c+';margin-right:0.3rem;vertical-align:middle"></span>';
}

// ── Vue arborescente (liste) ──
function renderSuiviTree(items) {
  var tree = document.getElementById('suivi-tree');
  var empty = document.getElementById('suivi-empty');

  // Build hierarchy: group by year → projet → missions → taches → sous-taches
  var projetMap = {};
  items.forEach(function(t) {
    var pid = t.projet_id;
    if (!projetMap[pid]) {
      projetMap[pid] = {
        nom: t.projetNom || 'Projet inconnu',
        code: t.projetCode || '',
        year: _extractProjetYear(t.projetCode, t.creeAt || t.cree_at),
        items: []
      };
    }
    projetMap[pid].items.push(t);
  });

  if (Object.keys(projetMap).length === 0) {
    tree.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  // Grouper par année décroissante
  var yearGroups = {};
  Object.keys(projetMap).forEach(function(pid){
    var y = projetMap[pid].year;
    if (!yearGroups[y]) yearGroups[y] = [];
    yearGroups[y].push(pid);
  });
  var yearsSorted = Object.keys(yearGroups).map(Number).sort(function(a,b){ return b - a; });

  var html = '';
  yearsSorted.forEach(function(year){
    html += '<div class="suivi-year-header" style="font-size:0.72rem;letter-spacing:0.15em;text-transform:uppercase;color:var(--accent);font-weight:600;padding:0.5rem 0.3rem;margin-top:0.8rem;border-bottom:1px solid var(--border)">▸ Année ' + year + ' <span style="color:var(--text-3);font-weight:400">(' + yearGroups[year].length + ' projet' + (yearGroups[year].length>1?'s':'') + ')</span></div>';
    yearGroups[year].forEach(function(pid){
    var proj = projetMap[pid];
    var projItems = proj.items;

    // Stats for project
    var totalTasks = projItems.length;
    var done = projItems.filter(function(t){ return t.statut === 'Terminé'; }).length;
    var projProg = totalTasks > 0 ? Math.round((done / totalTasks) * 100) : 0;

    html += '<div class="suivi-projet-group">';
    html += '<div class="suivi-projet-header" onclick="this.parentElement.classList.toggle(\'collapsed\')">';
    html += '<div class="suivi-projet-left">';
    html += '<svg class="suivi-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
    html += '<span class="suivi-projet-code">' + (proj.code || '') + '</span>';
    html += '<span class="suivi-projet-nom">' + proj.nom + '</span>';
    html += '</div>';
    html += '<div class="suivi-projet-right">';
    html += '<span class="suivi-projet-stats">' + done + '/' + totalTasks + '</span>';
    html += suiviProgressBar(projProg);
    html += '<button class="btn btn-sm" onclick="event.stopPropagation();openSuiviModal(0, null, \'' + pid + '\')" title="Ajouter une mission">+ Mission</button>';
    html += '</div>';
    html += '</div>';

    // Missions (niveau 0)
    var missionsList = projItems.filter(function(t){ return t.niveau === 0; });
    missionsList.sort(function(a,b){ return a.ordre - b.ordre; });

    html += '<div class="suivi-projet-body">';
    missionsList.forEach(function(m) {
      var children = projItems.filter(function(t){ return t.parent_id === m.id && t.niveau === 1; });
      children.sort(function(a,b){ return a.ordre - b.ordre; });

      html += '<div class="suivi-mission-card">';
      html += '<div class="suivi-mission-header" onclick="this.parentElement.classList.toggle(\'collapsed\')">';
      html += '<div class="suivi-mission-left">';
      html += '<svg class="suivi-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
      html += '<span class="suivi-mission-icon">🎯</span>';
      html += '<span class="suivi-mission-titre">' + (m.titre||'') + '</span>';
      html += suiviPrioriteBadge(m.priorite);
      html += '</div>';
      html += '<div class="suivi-mission-right">';
      html += suiviStatutBadge(m.statut);
      // Planifié (temps écoulé) vs réel (progression)
      var planPct = _calcPlanifiedPct(m.date_debut || m.dateDebut, m.date_echeance || m.dateEcheance);
      var realPct = parseInt(m.progression,10) || 0;
      var deltaColor = realPct >= planPct ? 'var(--green)' : '#c0392b';
      html += '<div title="Planifié '+planPct+'% vs Réel '+realPct+'%" style="display:flex;flex-direction:column;gap:2px;min-width:80px">';
      html += '<div style="height:4px;background:var(--bg-2);border-radius:2px;overflow:hidden"><div style="height:100%;width:'+planPct+'%;background:var(--text-3)"></div></div>';
      html += '<div style="height:4px;background:var(--bg-2);border-radius:2px;overflow:hidden"><div style="height:100%;width:'+realPct+'%;background:'+deltaColor+'"></div></div>';
      html += '</div>';
      if (m.dateEcheance) html += '<span class="suivi-date" title="Échéance">' + fmtDate(m.dateEcheance) + '</span>';
      if (m.assignee) html += '<span class="suivi-assignee" title="' + m.assignee + '">' + _memberDot(m.assignee) + m.assignee.split(' ')[0] + '</span>';
      html += '<div class="suivi-actions">';
      html += '<button class="suivi-action-btn" onclick="event.stopPropagation();openSuiviModal(1, \'' + m.id + '\', \'' + pid + '\')" title="Ajouter tâche">+ Tâche</button>';
      html += '<button class="suivi-action-btn" onclick="event.stopPropagation();editTache(\'' + m.id + '\')" title="Modifier">✎</button>';
      if (canDelete()) html += '<button class="suivi-action-btn suivi-del" onclick="event.stopPropagation();deleteTache(\'' + m.id + '\')" title="Supprimer">✕</button>';
      html += '</div>';
      html += '</div>';
      html += '</div>';

      // Tâches (niveau 1)
      html += '<div class="suivi-children">';
      children.forEach(function(tache) {
        var subChildren = projItems.filter(function(t){ return t.parent_id === tache.id && t.niveau === 2; });
        subChildren.sort(function(a,b){ return a.ordre - b.ordre; });

        html += '<div class="suivi-tache-card">';
        html += '<div class="suivi-tache-row">';
        html += '<div class="suivi-tache-left">';
        if (subChildren.length > 0) {
          html += '<svg class="suivi-chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" onclick="this.closest(\'.suivi-tache-card\').classList.toggle(\'collapsed\');event.stopPropagation()" style="cursor:pointer"><polyline points="6 9 12 15 18 9"/></svg>';
        } else {
          html += '<span style="width:11px;display:inline-block"></span>';
        }
        html += '<input type="checkbox" class="suivi-cb" ' + (tache.statut === 'Terminé' ? 'checked' : '') + ' onchange="toggleTacheStatut(\'' + tache.id + '\', this.checked)" onclick="event.stopPropagation()" />';
        html += '<span class="suivi-tache-titre' + (tache.statut === 'Terminé' ? ' done' : '') + '">' + (tache.titre||'') + '</span>';
        html += suiviPrioriteBadge(tache.priorite);
        html += _livrablesBadgeHtml(tache);
        html += '</div>';
        html += '<div class="suivi-tache-right">';
        html += suiviStatutBadge(tache.statut);
        html += suiviProgressBar(tache.progression);
        if (tache.dateEcheance) html += '<span class="suivi-date">' + fmtDate(tache.dateEcheance) + '</span>';
        if (tache.assignee) html += '<span class="suivi-assignee">' + _memberDot(tache.assignee) + tache.assignee.split(' ')[0] + '</span>';
        html += '<div class="suivi-actions">';
        html += '<button class="suivi-action-btn" onclick="event.stopPropagation();openTimesheetModal(\'' + tache.id + '\')" title="Saisir du temps">⏱</button>';
        html += '<button class="suivi-action-btn" onclick="event.stopPropagation();openSuiviModal(2, \'' + tache.id + '\', \'' + pid + '\')" title="Ajouter sous-tâche">+</button>';
        html += '<button class="suivi-action-btn" onclick="event.stopPropagation();editTache(\'' + tache.id + '\')" title="Modifier">✎</button>';
        if (canDelete()) html += '<button class="suivi-action-btn suivi-del" onclick="event.stopPropagation();deleteTache(\'' + tache.id + '\')" title="Supprimer">✕</button>';
        html += '</div>';
        html += '</div>';
        html += '</div>';

        // Sous-tâches (niveau 2)
        if (subChildren.length > 0) {
          html += '<div class="suivi-sub-children">';
          subChildren.forEach(function(st) {
            html += '<div class="suivi-subtache-row">';
            html += '<input type="checkbox" class="suivi-cb" ' + (st.statut === 'Terminé' ? 'checked' : '') + ' onchange="toggleTacheStatut(\'' + st.id + '\', this.checked)" />';
            html += '<span class="suivi-tache-titre' + (st.statut === 'Terminé' ? ' done' : '') + '">' + (st.titre||'') + '</span>';
            html += suiviPrioriteBadge(st.priorite);
            html += _livrablesBadgeHtml(st);
            html += '<div style="margin-left:auto;display:flex;align-items:center;gap:0.4rem">';
            html += suiviStatutBadge(st.statut);
            html += suiviProgressBar(st.progression || 0);
            if (st.assignee) html += '<span class="suivi-assignee">' + _memberDot(st.assignee) + st.assignee.split(' ')[0] + '</span>';
            html += '<button class="suivi-action-btn" onclick="editTache(\'' + st.id + '\')" title="Modifier">✎</button>';
            if (canDelete()) html += '<button class="suivi-action-btn suivi-del" onclick="deleteTache(\'' + st.id + '\')" title="Supprimer">✕</button>';
            html += '</div>';
            html += '</div>';
          });
          html += '</div>';
        }
        html += '</div>';
      });
      html += '</div>'; // .suivi-children
      html += '</div>'; // .suivi-mission-card
    });
    html += '</div>'; // .suivi-projet-body
    html += '</div>'; // .suivi-projet-group
    }); // year projects
  }); // years

  tree.innerHTML = html;
}

// ── Vue Kanban (swimlanes par Mission) ──
function renderSuiviKanban(items) {
  var kanban = document.getElementById('suivi-kanban');
  var statuts = ['A faire', 'En cours', 'Bloqué', 'Terminé'];
  var colors = { 'A faire': 'var(--yellow)', 'En cours': 'var(--blue)', 'Bloqué': 'var(--red)', 'Terminé': 'var(--green)' };

  // Regrouper par mission parente (swimlane). Les missions elles-mêmes + les tâches orphelines → lane "Sans mission"
  var missions = items.filter(function(t){ return t.niveau === 0; });
  var byMission = {};
  missions.forEach(function(m){ byMission[m.id] = { mission: m, items: [] }; });
  var orphelins = { mission: null, items: [] };
  items.forEach(function(t){
    if (t.niveau === 0) return; // missions rendues en tête de swimlane
    var parentMission = null;
    if (t.niveau === 1 && t.parent_id && byMission[t.parent_id]) parentMission = t.parent_id;
    else if (t.niveau === 2) {
      var pTache = items.find(function(x){ return x.id === t.parent_id; });
      if (pTache && pTache.parent_id && byMission[pTache.parent_id]) parentMission = pTache.parent_id;
    }
    if (parentMission) byMission[parentMission].items.push(t);
    else orphelins.items.push(t);
  });

  var html = '';
  var renderLane = function(lane, laneTitle, laneBadge) {
    html += '<div class="suivi-kanban-swimlane" style="margin-bottom:1.2rem">';
    html += '<div class="suivi-kanban-swimlane-header" style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.6rem;background:var(--bg-2);border-left:3px solid var(--accent);margin-bottom:0.5rem;border-radius:4px">';
    html += '<span style="font-size:0.85rem;font-weight:500">🎯 ' + laneTitle + '</span>';
    if (laneBadge) html += laneBadge;
    html += '</div>';
    html += '<div class="suivi-kanban-cols" style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.6rem">';
    statuts.forEach(function(st){
      var col = lane.items.filter(function(t){ return t.statut === st; });
      html += '<div class="suivi-kanban-col">';
      html += '<div class="suivi-kanban-col-header" style="border-top-color:' + colors[st] + '">';
      html += '<span>' + st + '</span><span class="suivi-kanban-count">' + col.length + '</span>';
      html += '</div>';
      html += '<div class="suivi-kanban-col-body">';
      col.forEach(function(t) {
        var niveauLabel = t.niveau === 1 ? 'Tâche' : 'Sous-tâche';
        html += '<div class="suivi-kanban-card" onclick="editTache(\'' + t.id + '\')">';
        html += '<div class="suivi-kanban-card-top">';
        html += '<span class="suivi-kanban-niveau">' + niveauLabel + '</span>';
        html += suiviPrioriteBadge(t.priorite);
        html += '</div>';
        html += '<div class="suivi-kanban-card-titre">' + (t.titre||'') + '</div>';
        if (t.projetNom) html += '<div class="suivi-kanban-card-projet">' + (t.projetCode ? t.projetCode + ' — ' : '') + t.projetNom + '</div>';
        html += '<div class="suivi-kanban-card-bottom">';
        if (t.assignee) html += '<span class="suivi-assignee">' + _memberDot(t.assignee) + t.assignee + '</span>';
        if (t.dateEcheance) html += '<span class="suivi-date">' + fmtDate(t.dateEcheance) + '</span>';
        html += '<button class="suivi-action-btn" style="margin-left:auto" onclick="event.stopPropagation();openTimesheetModal(\'' + t.id + '\')" title="Saisir du temps">⏱</button>';
        html += '</div>';
        html += '</div>';
      });
      html += '</div></div>';
    });
    html += '</div></div>';
  };

  Object.keys(byMission).forEach(function(mid){
    var lane = byMission[mid];
    var m = lane.mission;
    var badge = suiviStatutBadge(m.statut) + ' ' + suiviProgressBar(m.progression||0);
    renderLane(lane, (m.projetCode?m.projetCode+' · ':'') + (m.titre||''), badge);
  });
  if (orphelins.items.length) renderLane(orphelins, 'Sans mission parente', '');

  kanban.innerHTML = html;
}

// ── Vue par membre assigné ──
function renderSuiviMembres(items) {
  var wrap = document.getElementById('suivi-membres');

  // Grouper par assignee
  var membreMap = {};
  var nonAssigne = [];
  items.forEach(function(t) {
    var a = (t.assignee || '').trim();
    if (!a) { nonAssigne.push(t); return; }
    if (!membreMap[a]) membreMap[a] = [];
    membreMap[a].push(t);
  });

  // Trier les membres par nombre de tâches (desc)
  var membresKeys = Object.keys(membreMap).sort(function(a, b) {
    return membreMap[b].length - membreMap[a].length;
  });

  if (membresKeys.length === 0 && nonAssigne.length === 0) {
    wrap.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text-3)">'
      + '<div style="font-size:0.9rem;margin-bottom:0.3rem">Aucune tâche assignée</div>'
      + '<div style="font-size:0.78rem">Assignez des tâches aux membres de l\'équipe pour voir cette vue.</div></div>';
    return;
  }

  var html = '';
  membresKeys.forEach(function(nom) {
    var taches = membreMap[nom];
    html += _renderMembreColumn(nom, taches);
  });
  // Colonne "Non assigné"
  if (nonAssigne.length > 0) {
    html += _renderMembreColumn(null, nonAssigne);
  }

  wrap.innerHTML = html;
}

function _renderMembreColumn(nom, taches) {
  var done = taches.filter(function(t) { return t.statut === 'Terminé'; }).length;
  var enCours = taches.filter(function(t) { return t.statut === 'En cours'; }).length;
  var bloque = taches.filter(function(t) { return t.statut === 'Bloqué'; }).length;
  var total = taches.length;
  var pct = total > 0 ? Math.round((done / total) * 100) : 0;

  var ini = '?';
  var displayName = 'Non assigné';
  var photoUrl = null;
  if (nom) {
    displayName = nom;
    var parts = nom.split(' ');
    ini = ((parts[0] || '')[0] || '') + ((parts[1] || '')[0] || '');
    ini = ini.toUpperCase() || '?';
    // Retrouver le membre pour récupérer sa photo de profil
    var membreMatch = (getMembres() || []).find(function(mb){
      return ((mb.prenom||'') + ' ' + (mb.nom||'')).trim() === nom;
    });
    if (membreMatch && membreMatch.profile_picture_url) photoUrl = membreMatch.profile_picture_url;
  }

  var avatarInner = photoUrl
    ? '<img src="' + escHtml(photoUrl) + '" alt="' + escHtml(displayName) + '" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">'
    : ini;

  var html = '<div class="suivi-membre-card">';
  // Header membre
  html += '<div class="suivi-membre-header">';
  html += '<div class="suivi-membre-avatar' + (nom ? '' : ' no-assign') + '" style="overflow:hidden">' + avatarInner + '</div>';
  html += '<div class="suivi-membre-info">';
  html += '<div class="suivi-membre-nom">' + displayName + '</div>';
  html += '<div class="suivi-membre-stats">';
  html += '<span>' + total + ' tâche' + (total > 1 ? 's' : '') + '</span>';
  if (enCours) html += '<span style="color:var(--blue)">' + enCours + ' en cours</span>';
  if (bloque)  html += '<span style="color:var(--red)">' + bloque + ' bloqué' + (bloque > 1 ? 's' : '') + '</span>';
  html += '<span style="color:var(--green)">' + done + '/' + total + ' terminé' + (done > 1 ? 's' : '') + '</span>';
  html += '</div>';
  html += '</div>';
  html += suiviProgressBar(pct);
  html += '</div>';

  // Liste des tâches
  html += '<div class="suivi-membre-tasks">';
  // Trier : Bloqué > En cours > A faire > Terminé
  var ordre = {'Bloqué': 0, 'En cours': 1, 'A faire': 2, 'Terminé': 3};
  taches.sort(function(a, b) { return (ordre[a.statut] || 9) - (ordre[b.statut] || 9); });

  taches.forEach(function(t) {
    var niveauLabel = t.niveau === 0 ? '🎯' : t.niveau === 1 ? '◆' : '•';
    html += '<div class="suivi-membre-task-row" onclick="editTache(\'' + t.id + '\')">';
    html += '<span class="suivi-membre-task-niveau">' + niveauLabel + '</span>';
    html += '<div class="suivi-membre-task-body">';
    html += '<div class="suivi-membre-task-titre">' + (t.titre || '') + '</div>';
    if (t.projetNom) html += '<div class="suivi-membre-task-projet">' + (t.projetCode ? t.projetCode + ' — ' : '') + t.projetNom + '</div>';
    html += '</div>';
    html += '<div class="suivi-membre-task-meta">';
    html += suiviStatutBadge(t.statut);
    html += suiviPrioriteBadge(t.priorite);
    if (t.dateEcheance) html += '<span class="suivi-date">' + fmtDate(t.dateEcheance) + '</span>';
    html += '</div>';
    html += '</div>';
  });
  html += '</div></div>';
  return html;
}

// ── Toggle vue liste / kanban / membres ──
var _suiviViews = ['list', 'kanban', 'membres'];
function suiviSetView(view) {
  _suiviView = view;

  document.getElementById('suivi-list-view').style.display    = view === 'list'    ? '' : 'none';
  document.getElementById('suivi-kanban-view').style.display   = view === 'kanban'  ? '' : 'none';
  document.getElementById('suivi-membres-view').style.display  = view === 'membres' ? '' : 'none';

  // Mettre à jour l'état actif des boutons
  _suiviViews.forEach(function(v){
    var b = document.getElementById('suivi-view-' + v);
    if (b) {
      if (v === view) { b.classList.add('active'); }
      else { b.classList.remove('active'); }
    }
  });

  // Masquer le bouton tout développer/réduire si pas en vue liste
  var expandBtn = document.getElementById('suivi-expand-toggle');
  if (expandBtn) expandBtn.style.display = view === 'list' ? '' : 'none';

  renderSuiviPage();
}
window.suiviSetView = suiviSetView;

// ── Tout développer / Tout réduire (vue liste) ──
var _suiviExpanded = false;
function suiviToggleExpand() {
  _suiviExpanded = !_suiviExpanded;
  var tree = document.getElementById('suivi-tree');
  if (!tree) return;
  var groups = tree.querySelectorAll('.suivi-projet-group, .suivi-mission-card, .suivi-tache-card');
  for (var i = 0; i < groups.length; i++) {
    if (_suiviExpanded) {
      groups[i].classList.remove('collapsed');
    } else {
      groups[i].classList.add('collapsed');
    }
  }
  var btn = document.getElementById('suivi-expand-toggle');
  if (btn) {
    btn.innerHTML = _suiviExpanded
      ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg> Tout réduire'
      : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7 13 12 18 17 13"/><polyline points="7 6 12 11 17 6"/></svg> Tout développer';
  }
}
window.suiviToggleExpand = suiviToggleExpand;

// ── Modal ouverture ──
function openSuiviModal(niveau, parentId, projetId) {
  niveau = niveau || 0;
  var labels = ['Nouvelle mission', 'Nouvelle tâche', 'Nouvelle sous-tâche'];
  document.getElementById('tache-modal-title').textContent = labels[niveau] || labels[0];
  document.getElementById('tache-id').value = '';
  document.getElementById('tache-parent-id').value = parentId || '';
  document.getElementById('tache-niveau').value = niveau;
  document.getElementById('tache-titre').value = '';
  document.getElementById('tache-desc').value = '';
  document.getElementById('tache-statut').value = 'A faire';
  document.getElementById('tache-priorite').value = 'Normale';
  document.getElementById('tache-progression').value = 0;
  document.getElementById('tache-prog-val').textContent = '0%';
  document.getElementById('tache-date-debut').value = '';
  document.getElementById('tache-date-echeance').value = '';
  var _r;
  _r = document.getElementById('tache-location-type');       if (_r) _r.value = 'Bureau';
  _r = document.getElementById('tache-location-zone');       if (_r) _r.value = '';
  _r = document.getElementById('tache-heures-estimees');     if (_r) _r.value = '';
  _r = document.getElementById('tache-order-index');         if (_r) _r.value = '';
  _r = document.getElementById('tache-progression-manuelle'); if (_r) _r.checked = false;
  var _livSec = document.getElementById('tache-livrables-section');
  if (_livSec) _livSec.style.display = 'none';
  _currentTacheLivrables = [];
  var errEl = document.getElementById('tache-err');
  if (errEl) errEl.style.display = 'none';

  // Afficher select mission (niveau 0) ou input titre (niveau 1/2)
  _toggleTitreField(niveau, '');

  // Populate projet select
  var sel = document.getElementById('tache-projet');
  sel.innerHTML = '<option value="">— Choisir un projet —</option>';
  getProjets().forEach(function(p) {
    var opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = (p.code ? p.code + ' — ' : '') + p.nom;
    sel.appendChild(opt);
  });
  if (projetId) sel.value = projetId;

  // Disable projet select if adding child to a specific project
  sel.disabled = !!projetId && niveau > 0;

  // Réinitialiser la barre de recherche projet
  var _sProj = document.getElementById('tache-projet-search');
  if (_sProj) {
    if (projetId) {
      var _pp = getProjets().find(function(p){ return p.id === projetId; });
      _sProj.value = _pp ? ((_pp.code ? _pp.code + ' — ' : '') + _pp.nom) : '';
      _sProj.readOnly = !!projetId && niveau > 0;
    } else {
      _sProj.value = '';
      _sProj.readOnly = false;
    }
  }
  // Réinitialiser la recherche mission
  var _sMiss = document.getElementById('tache-mission-search');
  if (_sMiss) _sMiss.value = '';
  var _ddMiss = document.getElementById('tache-mission-dropdown');
  if (_ddMiss) _ddMiss.style.display = 'none';
  _missionDropOpen = false;

  // Re-populer les missions après que le projet soit défini pour avoir le bon contexte
  if (niveau === 0) _populateMissionsSelect('');

  // Populate assignee select with team members
  _populateAssigneeSelect('');

  openModal('modal-tache');
}

// ── Basculer entre select mission (niveau 0) et input titre (niveau 1/2) ──
function _toggleTitreField(niveau, selectedValue) {
  var fieldSelect = document.getElementById('tache-titre-field-select');
  var fieldInput  = document.getElementById('tache-titre-field-input');
  if (niveau === 0) {
    // Mission → afficher le select avec la liste des missions configurées
    fieldSelect.style.display = '';
    fieldInput.style.display = 'none';
    _populateMissionsSelect(selectedValue);
  } else {
    // Tâche / sous-tâche → afficher l'input texte libre
    fieldSelect.style.display = 'none';
    fieldInput.style.display = '';
    document.getElementById('tache-titre').value = selectedValue || '';
  }
}

// Normaliser les missions affectées à un projet : retourne un tableau de noms
//   Le format stocké peut être "m01_Nom de la mission" (checkbox value), "m01" ou juste "Nom"
function _normalizeProjetMissions(rawList) {
  if (!rawList) return [];
  var arr = Array.isArray(rawList) ? rawList : [];
  var missions = getMissions();
  var out = [];
  arr.forEach(function(v){
    if (v == null) return;
    var s = String(v);
    // Format "id_Nom"
    var m = s.match(/^([a-z0-9]+)_(.+)$/i);
    if (m) {
      var byId = missions.find(function(x){ return x.id === m[1]; });
      if (byId) { out.push(byId.nom); return; }
      out.push(m[2]);
      return;
    }
    // Format id seul
    var byIdOnly = missions.find(function(x){ return x.id === s; });
    if (byIdOnly) { out.push(byIdOnly.nom); return; }
    // Sinon nom brut
    out.push(s);
  });
  return out;
}
window._normalizeProjetMissions = _normalizeProjetMissions;

// ── Remplir le select missions groupé par catégorie ──
//    Missions affectées au projet = normales, les autres = demi-teinte (cliquables)
function _populateMissionsSelect(selectedValue) {
  var sel = document.getElementById('tache-titre-select');
  sel.innerHTML = '<option value="">— Choisir une mission —</option>';
  var missions = getMissions();
  var cats = getMissionCategories();

  // Récupérer les missions affectées au projet courant (format unifié = noms)
  var projetId = (document.getElementById('tache-projet')||{}).value;
  var affectees = null;
  if (projetId) {
    var projet = (getProjets()||[]).find(function(p){ return p.id === projetId; });
    if (projet) {
      var raw;
      try { raw = Array.isArray(projet.missions) ? projet.missions : (projet.missions ? JSON.parse(projet.missions) : []); }
      catch(e) { raw = []; }
      affectees = _normalizeProjetMissions(raw);
    }
  }
  var hasContext = !!affectees;
  var isAffectee = function(nom){
    if (!hasContext) return true;
    return affectees.indexOf(nom) !== -1;
  };

  // Libellé catégorie pour préfixer
  var catLabel = function(catId){
    var c = cats.find(function(x){ return x.id === catId; });
    return c ? c.label : '';
  };

  var makeOpt = function(m, unaffected){
    var opt = document.createElement('option');
    opt.value = m.nom;
    opt.textContent = (unaffected ? '◌ ' : '') + m.nom;
    if (unaffected) {
      opt.setAttribute('data-unaffected', '1');
      opt.title = 'Non affectée — la sélectionner l\'ajoutera à la fiche projet';
    }
    return opt;
  };

  // Toujours grouper par catégorie
  cats.forEach(function(cat) {
    var catMissions = missions.filter(function(m) { return m.cat === cat.id; });
    if (catMissions.length === 0) return;
    var og = document.createElement('optgroup');
    og.label = cat.label;
    catMissions.forEach(function(m){ og.appendChild(makeOpt(m, !isAffectee(m.nom))); });
    sel.appendChild(og);
  });
  var orphans = missions.filter(function(m) { return !m.cat || !cats.find(function(c){ return c.id === m.cat; }); });
  if (orphans.length) {
    var og2 = document.createElement('optgroup');
    og2.label = 'Autres';
    orphans.forEach(function(m){ og2.appendChild(makeOpt(m, !isAffectee(m.nom))); });
    sel.appendChild(og2);
  }

  if (selectedValue) sel.value = selectedValue;
}

// ── Recherche dans le select projet (filtre les <option>) ──
// ── Searchable dropdown pour le projet dans le modal tâche ──
var _tacheProjetDropOpen = false;
function _buildTacheProjetItems() {
  var projets = getProjets();
  var clients = getClients();
  return projets.map(function(p) {
    var clientName = p.client || '';
    if (!clientName && p.client_code) {
      var cl = clients.find(function(c){ return c.code === p.client_code; });
      if (cl) clientName = cl.displayNom || cl.nom || '';
    }
    var label = (p.code ? p.code + ' — ' : '') + p.nom;
    return { id: p.id, label: label, search: (label + ' ' + clientName).toLowerCase(), client: clientName };
  });
}
function openTacheProjetDropdown() {
  _tacheProjetDropOpen = true;
  filterTacheProjetDropdown(document.getElementById('tache-projet-search').value);
}
function filterTacheProjetDropdown(query) {
  var dd = document.getElementById('tache-projet-dropdown');
  if (!dd) return;
  var q = (query || '').trim().toLowerCase();
  var items = _buildTacheProjetItems();
  var qNorm = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  var filtered = items.filter(function(it) { return !qNorm || it.search.normalize('NFD').replace(/[\u0300-\u036f]/g, '').indexOf(qNorm) !== -1; });
  dd.innerHTML = filtered.length === 0
    ? '<div style="padding:0.6rem 0.8rem;color:var(--text-3);font-size:0.78rem">Aucun projet trouvé</div>'
    : filtered.map(function(it) {
        var clientHtml = it.client ? '<span style="font-size:0.72rem;color:var(--text-3);margin-left:0.4rem">' + it.client + '</span>' : '';
        return '<div onmousedown="selectTacheProjet(\'' + it.id + '\',\'' + it.label.replace(/'/g, "\\'") + '\')"' +
          ' style="padding:0.5rem 0.8rem;cursor:pointer;font-size:0.82rem;border-bottom:1px solid var(--border);transition:background 0.15s"' +
          ' onmouseenter="this.style.background=\'var(--bg-2)\'" onmouseleave="this.style.background=\'\'">' +
          it.label + clientHtml + '</div>';
      }).join('');
  dd.style.display = 'block';
}
function selectTacheProjet(id, label) {
  var sel = document.getElementById('tache-projet');
  var search = document.getElementById('tache-projet-search');
  var dd = document.getElementById('tache-projet-dropdown');
  if (sel) { sel.value = id; }
  if (search) search.value = label;
  if (dd) dd.style.display = 'none';
  _tacheProjetDropOpen = false;
  onTacheProjetChange();
}
window.selectTacheProjet = selectTacheProjet;
window.openTacheProjetDropdown = openTacheProjetDropdown;
window.filterTacheProjetDropdown = filterTacheProjetDropdown;
// Fermer dropdown si clic ailleurs
document.addEventListener('click', function(e) {
  if (!_tacheProjetDropOpen) return;
  var search = document.getElementById('tache-projet-search');
  var dd = document.getElementById('tache-projet-dropdown');
  if (search && dd && !search.contains(e.target) && !dd.contains(e.target)) {
    dd.style.display = 'none'; _tacheProjetDropOpen = false;
  }
});
// Compatibilité ancienne fonction
function filterTacheProjetSelect(query) { filterTacheProjetDropdown(query); }
window.filterTacheProjetSelect = filterTacheProjetSelect;

// ── Searchable dropdown pour les missions ──
var _missionDropOpen = false;

function _buildMissionDropdownItems() {
  var missions = getMissions();
  var cats = getMissionCategories();
  var projetId = (document.getElementById('tache-projet') || {}).value;
  var affectees = null;
  if (projetId) {
    var projet = (getProjets() || []).find(function(p) { return p.id === projetId; });
    if (projet) {
      var raw;
      try { raw = Array.isArray(projet.missions) ? projet.missions : (projet.missions ? JSON.parse(projet.missions) : []); }
      catch (e) { raw = []; }
      affectees = _normalizeProjetMissions(raw);
    }
  }
  var hasContext = !!affectees;
  var isAffectee = function(nom) { return !hasContext || affectees.indexOf(nom) !== -1; };
  var items = [];
  // Toujours grouper par catégorie
  cats.forEach(function(cat) {
    var catMissions = missions.filter(function(m) { return m.cat === cat.id; });
    if (catMissions.length === 0) return;
    items.push({ type: 'header', label: cat.label });
    catMissions.forEach(function(m) {
      items.push({ type: 'item', nom: m.nom, unaffected: !isAffectee(m.nom) });
    });
  });
  var orphans = missions.filter(function(m) { return !m.cat || !cats.find(function(c) { return c.id === m.cat; }); });
  if (orphans.length) {
    items.push({ type: 'header', label: 'Autres' });
    orphans.forEach(function(m) {
      items.push({ type: 'item', nom: m.nom, unaffected: !isAffectee(m.nom) });
    });
  }
  return items;
}

function openMissionDropdown() {
  _missionDropOpen = true;
  filterMissionDropdown(document.getElementById('tache-mission-search').value);
}
window.openMissionDropdown = openMissionDropdown;

function filterMissionDropdown(query) {
  var dd = document.getElementById('tache-mission-dropdown');
  if (!dd) return;
  var q = (query || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  var items = _buildMissionDropdownItems();
  var html = '';
  var lastHeaderHtml = '';
  var hasVisibleInGroup = false;

  items.forEach(function(it, idx) {
    if (it.type === 'header') {
      if (lastHeaderHtml && hasVisibleInGroup) html += lastHeaderHtml;
      lastHeaderHtml = '<div style="padding:0.4rem 0.8rem;font-size:0.68rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--accent);font-weight:600;background:var(--bg-2);border-bottom:1px solid var(--border)">' + it.label + '</div>';
      hasVisibleInGroup = false;
    } else {
      var txt = it.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (!q || txt.indexOf(q) !== -1) {
        if (lastHeaderHtml && !hasVisibleInGroup) { html += lastHeaderHtml; hasVisibleInGroup = true; }
        var style = 'padding:0.5rem 0.8rem;cursor:pointer;font-size:0.82rem;border-bottom:1px solid var(--border);transition:background 0.15s' +
          (it.unaffected ? ';color:var(--text-3);font-style:italic' : '');
        html += '<div onmousedown="selectMissionDropdown(\'' + it.nom.replace(/'/g, "\\'") + '\',' + (it.unaffected ? 'true' : 'false') + ')"' +
          ' style="' + style + '"' +
          ' onmouseenter="this.style.background=\'var(--bg-2)\'" onmouseleave="this.style.background=\'\'">' +
          (it.unaffected ? '◌ ' : '') + it.nom + '</div>';
      }
    }
  });

  if (!html) html = '<div style="padding:0.6rem 0.8rem;color:var(--text-3);font-size:0.78rem">Aucune mission trouvée</div>';
  dd.innerHTML = html;
  dd.style.display = 'block';
}
window.filterMissionDropdown = filterMissionDropdown;

function selectMissionDropdown(nom, unaffected) {
  var sel = document.getElementById('tache-titre-select');
  var search = document.getElementById('tache-mission-search');
  var dd = document.getElementById('tache-mission-dropdown');
  if (sel) { sel.value = nom; }
  if (search) search.value = nom;
  if (dd) dd.style.display = 'none';
  _missionDropOpen = false;
  // Trigger the unaffected mission check
  if (unaffected && sel) onTacheTitreSelectChange(sel);
}
window.selectMissionDropdown = selectMissionDropdown;

// Fermer dropdown mission si clic ailleurs
document.addEventListener('click', function(e) {
  if (!_missionDropOpen) return;
  var search = document.getElementById('tache-mission-search');
  var dd = document.getElementById('tache-mission-dropdown');
  if (search && dd && !search.contains(e.target) && !dd.contains(e.target)) {
    dd.style.display = 'none'; _missionDropOpen = false;
  }
});

// Compat ancienne fonction
function filterMissionSelect(query) { filterMissionDropdown(query); }
window.filterMissionSelect = filterMissionSelect;

// ── Changement de projet → recharger la liste des missions (demi-teinte à jour) ──
function onTacheProjetChange() {
  var niveau = parseInt((document.getElementById('tache-niveau')||{}).value || '0', 10);
  if (niveau === 0) {
    var sel = document.getElementById('tache-titre-select');
    var cur = sel ? sel.value : '';
    _populateMissionsSelect(cur);
  }
}
window.onTacheProjetChange = onTacheProjetChange;

// ── Remplir le select assigné avec les membres de l'équipe ──
function _populateAssigneeSelect(selectedValue) {
  var selA = document.getElementById('tache-assignee');
  selA.innerHTML = '<option value="">— Non assigné —</option>';
  var membres = getMembres();
  membres.forEach(function(m) {
    var fullName = ((m.prenom || '') + ' ' + (m.nom || '')).trim();
    if (!fullName) return;
    var opt = document.createElement('option');
    opt.value = fullName;
    opt.textContent = fullName + (m.role ? ' (' + m.role + ')' : '');
    selA.appendChild(opt);
  });
  if (selectedValue) selA.value = selectedValue;
}

// ── Modifier une tâche existante ──
function editTache(id) {
  var t = _suiviCache.find(function(x){ return x.id === id; });
  if (!t) return;

  var labels = ['Modifier la mission', 'Modifier la tâche', 'Modifier la sous-tâche'];
  document.getElementById('tache-modal-title').textContent = labels[t.niveau] || labels[0];
  document.getElementById('tache-id').value = t.id;
  document.getElementById('tache-parent-id').value = t.parent_id || '';
  document.getElementById('tache-niveau').value = t.niveau;
  // Pré-remplir le projet AVANT le toggle pour que _populateMissionsSelect ait le contexte
  var _selP0 = document.getElementById('tache-projet');
  if (_selP0 && t.projet_id) {
    if (!_selP0.querySelector('option[value="'+t.projet_id+'"]')) {
      var _o0 = document.createElement('option');
      _o0.value = t.projet_id;
      _o0.textContent = (t.projetCode ? t.projetCode+' — ' : '') + (t.projetNom || '');
      _selP0.appendChild(_o0);
    }
    _selP0.value = t.projet_id;
  }
  // Afficher select mission ou input titre selon le niveau
  _toggleTitreField(t.niveau, t.titre || '');
  document.getElementById('tache-desc').value = t.description || '';
  document.getElementById('tache-statut').value = t.statut || 'A faire';
  document.getElementById('tache-priorite').value = t.priorite || 'Normale';
  document.getElementById('tache-progression').value = t.progression || 0;
  document.getElementById('tache-prog-val').textContent = (t.progression||0) + '%';
  document.getElementById('tache-date-debut').value = t.dateDebut || t.date_debut || '';
  document.getElementById('tache-date-echeance').value = t.dateEcheance || t.date_echeance || '';
  var _livSecE = document.getElementById('tache-livrables-section');
  if (_livSecE) { _livSecE.style.display = ''; loadTacheLivrables(t.id); }
  var errEl = document.getElementById('tache-err');
  if (errEl) errEl.style.display = 'none';

  var sel = document.getElementById('tache-projet');
  sel.innerHTML = '<option value="">— Choisir un projet —</option>';
  getProjets().forEach(function(p) {
    var opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = (p.code ? p.code + ' — ' : '') + p.nom;
    sel.appendChild(opt);
  });
  sel.value = t.projet_id;
  sel.disabled = true;

  // Mettre à jour le search input projet
  var _spE = document.getElementById('tache-projet-search');
  if (_spE) {
    var _ppE = getProjets().find(function(p){ return p.id === t.projet_id; });
    _spE.value = _ppE ? ((_ppE.code ? _ppE.code + ' — ' : '') + _ppE.nom) : (t.projetNom || '');
    _spE.readOnly = true;
  }
  // Pré-remplir la recherche mission avec le titre existant
  var _smE = document.getElementById('tache-mission-search');
  if (_smE) _smE.value = (t.niveau === 0 && t.titre) ? t.titre : '';
  // Fermer le dropdown mission
  var _ddM = document.getElementById('tache-mission-dropdown');
  if (_ddM) _ddM.style.display = 'none';
  _missionDropOpen = false;

  // Populate assignee select with team members
  _populateAssigneeSelect(t.assignee || '');

  // v3 : localisation / heures / ordre / manuelle
  var elLoc  = document.getElementById('tache-location-type');  if (elLoc) elLoc.value = t.location_type || 'Bureau';
  var elZone = document.getElementById('tache-location-zone');  if (elZone) elZone.value = t.location_zone || '';
  var elHE   = document.getElementById('tache-heures-estimees'); if (elHE) elHE.value = (t.heures_estimees != null ? t.heures_estimees : '');
  var elOrd  = document.getElementById('tache-order-index');    if (elOrd) elOrd.value = (t.ordre != null ? t.ordre : '');
  var elMan  = document.getElementById('tache-progression-manuelle'); if (elMan) elMan.checked = !!(+t.progression_manuelle);

  openModal('modal-tache');
}

// ── Sauvegarder tâche (create / update) ──
function saveTache() {
  var id       = document.getElementById('tache-id').value;
  var niveau   = parseInt(document.getElementById('tache-niveau').value) || 0;
  // Titre : dropdown mission (0) ou tâche-type (1 avec liste), sinon input libre
  var selectVisible = document.getElementById('tache-titre-field-select').style.display !== 'none';
  var titre = selectVisible
    ? (document.getElementById('tache-titre-select').value.trim() || document.getElementById('tache-mission-search').value.trim())
    : document.getElementById('tache-titre').value.trim();
  var projetId = document.getElementById('tache-projet').value;
  var errEl    = document.getElementById('tache-err');

  var errMsg = niveau === 0 ? 'Veuillez choisir une mission.' : niveau === 1 ? 'Veuillez choisir ou saisir une tâche.' : 'Le titre est requis.';
  if (!titre) { errEl.textContent = errMsg; errEl.style.display = 'block'; return; }
  if (!projetId) { errEl.textContent = 'Veuillez choisir un projet.'; errEl.style.display = 'block'; return; }

  // v3 : heures estimées obligatoires
  var heuresEstInput = document.getElementById('tache-heures-estimees');
  var heuresEst = heuresEstInput ? parseFloat(heuresEstInput.value) : 0;
  if (!heuresEst || heuresEst <= 0) {
    errEl.textContent = 'Heures estimées requises (pour Gantt & Charge de travail).';
    errEl.style.display = 'block';
    if (heuresEstInput) heuresEstInput.focus();
    return;
  }

  var body = {
    projet_id:     projetId,
    parent_id:     document.getElementById('tache-parent-id').value || null,
    niveau:        parseInt(document.getElementById('tache-niveau').value) || 0,
    titre:         titre,
    description:   document.getElementById('tache-desc').value.trim(),
    statut:        document.getElementById('tache-statut').value,
    priorite:      document.getElementById('tache-priorite').value,
    assignee:      document.getElementById('tache-assignee').value.trim(),
    progression:   parseInt(document.getElementById('tache-progression').value) || 0,
    date_debut:    document.getElementById('tache-date-debut').value || null,
    date_echeance: document.getElementById('tache-date-echeance').value || null,
    location_type: (document.getElementById('tache-location-type')||{}).value || 'Bureau',
    location_zone: ((document.getElementById('tache-location-zone')||{}).value || '').trim(),
    heures_estimees: heuresEst,
    progression_manuelle: (document.getElementById('tache-progression-manuelle')||{}).checked ? 1 : 0
  };
  var ordV = (document.getElementById('tache-order-index')||{}).value;
  if (ordV !== '' && ordV != null) body.ordre = parseInt(ordV, 10) || 0;

  var isEdit = !!id;
  var url    = isEdit ? 'api/taches.php?id=' + id : 'api/taches.php';
  var method = isEdit ? 'PUT' : 'POST';

  apiFetch(url, { method: method, body: body })
    .then(function() {
      closeModal('modal-tache');
      showToast(isEdit ? '✓ Tâche modifiée' : '✓ Tâche créée');
      loadTaches().then(function(){ renderSuiviPage(); });
    })
    .catch(function(e) {
      errEl.textContent = e.message || 'Erreur lors de l\'enregistrement';
      errEl.style.display = 'block';
    });
}

// ── Toggle statut rapide (checkbox) ──
function toggleTacheStatut(id, checked) {
  var newStatut = checked ? 'Terminé' : 'A faire';
  var newProg   = checked ? 100 : 0;
  apiFetch('api/taches.php?id=' + id, {
    method: 'PUT',
    body: { statut: newStatut, progression: newProg }
  }).then(function() {
    loadTaches().then(function(){ renderSuiviPage(); });
  });
}

// ── Supprimer tâche ──
function deleteTache(id) {
  var t = _suiviCache.find(function(x){ return x.id === id; });
  var labels = ['cette mission', 'cette tâche', 'cette sous-tâche'];
  var label = t ? labels[t.niveau] : 'cet élément';
  if (!confirm('Supprimer ' + label + ' et tous ses enfants ?')) return;

  apiFetch('api/taches.php?id=' + id, { method: 'DELETE' })
    .then(function() {
      showToast('✓ Supprimé');
      loadTaches().then(function(){ renderSuiviPage(); });
    })
    .catch(function(e) { showToast('Erreur : ' + e.message, 'error'); });
}

// ═══════════════════════════════════════════════════════════
//  JOURNAL QUOTIDIEN — Suivi journalier par membre
// ═══════════════════════════════════════════════════════════

var _journalCache = [];

function getJournalDate() {
  var el = document.getElementById('journal-date');
  if (!el || !el.value) return new Date().toISOString().split('T')[0];
  return el.value;
}

function journalToday() {
  document.getElementById('journal-date').value = new Date().toISOString().split('T')[0];
  renderJournalPage();
}
function journalPrevDay() {
  var d = new Date(getJournalDate());
  d.setDate(d.getDate() - 1);
  document.getElementById('journal-date').value = d.toISOString().split('T')[0];
  renderJournalPage();
}
function journalNextDay() {
  var d = new Date(getJournalDate());
  d.setDate(d.getDate() + 1);
  document.getElementById('journal-date').value = d.toISOString().split('T')[0];
  renderJournalPage();
}

function renderJournalPage() {
  var dateJour = getJournalDate();
  var me = window._currentUser || {};
  var isGerant = !!(me.isAdmin || me.role === 'Architecte gérant');

  var selMembre = document.getElementById('journal-membre');

  if (!isGerant) {
    // Non-gérant : forcer sur son propre nom, cacher le filtre
    var myName = (me.name || '').trim();
    selMembre.value = myName;
    selMembre.style.display = 'none';
  } else {
    selMembre.style.display = '';
    // Populate membre select (une seule fois)
    if (selMembre.options.length <= 1) {
      getMembres().forEach(function(m) {
        var fullName = ((m.prenom || '') + ' ' + (m.nom || '')).trim();
        if (!fullName) return;
        var opt = document.createElement('option');
        opt.value = fullName;
        opt.textContent = fullName + (m.role ? ' (' + m.role + ')' : '');
        selMembre.appendChild(opt);
      });
    }
  }

  var membreFilter = selMembre.value;

  // Charger les tâches et le journal du jour en parallèle
  Promise.all([
    loadTaches(),
    apiFetch('api/journal.php?date=' + dateJour).catch(function() { return { data: [] }; })
  ]).then(function(results) {
    var taches = results[0] || [];
    _journalCache = results[1].data || [];

    // Filtrer les tâches assignées au membre sélectionné
    var mesTaches = taches;
    if (membreFilter) {
      mesTaches = taches.filter(function(t) { return t.assignee === membreFilter; });
    }

    // Exclure les missions (niveau 0) — ne garder que tâches et sous-tâches
    var tachesActives = mesTaches.filter(function(t) {
      return t.niveau >= 1 && t.statut !== 'Terminé';
    });

    // Entrées du journal pour ce jour et ce membre
    var entries = _journalCache;
    if (membreFilter) {
      entries = entries.filter(function(e) { return e.membre === membreFilter; });
    }

    // KPIs
    _renderJournalKPIs(tachesActives, entries, membreFilter);

    // Tâches programmées
    _renderJournalTasks(tachesActives, entries, dateJour);

    // Historique des entrées
    _renderJournalEntries(entries);

    // Résumé
    var summary = document.getElementById('journal-summary');
    var jourLabel = fmtDate(dateJour);
    summary.textContent = jourLabel + (membreFilter ? ' — ' + membreFilter : ' — Tous les membres');
  });
}

function _renderJournalKPIs(taches, entries, membre) {
  var wrap = document.getElementById('journal-kpis');
  var totalTaches = taches.length;
  var remplies = 0;
  var tacheIds = taches.map(function(t) { return t.id; });
  entries.forEach(function(e) {
    if (tacheIds.indexOf(e.tache_id) !== -1) remplies++;
  });
  var heuresTotal = 0;
  entries.forEach(function(e) { heuresTotal += parseFloat(e.heures || 0); });
  var avgProg = 0;
  if (entries.length > 0) {
    var sumProg = 0;
    entries.forEach(function(e) { sumProg += parseInt(e.progression_apres || 0); });
    avgProg = Math.round(sumProg / entries.length);
  }

  wrap.innerHTML = ''
    + '<div class="journal-kpi"><div class="journal-kpi-val">' + totalTaches + '</div><div class="journal-kpi-label">Tâches programmées</div></div>'
    + '<div class="journal-kpi"><div class="journal-kpi-val">' + entries.length + '</div><div class="journal-kpi-label">Entrées saisies</div></div>'
    + '<div class="journal-kpi"><div class="journal-kpi-val">' + heuresTotal.toFixed(1) + 'h</div><div class="journal-kpi-label">Heures travaillées</div></div>'
    + '<div class="journal-kpi"><div class="journal-kpi-val">' + avgProg + '%</div><div class="journal-kpi-label">Avancement moyen</div></div>';
}

function _renderJournalTasks(taches, entries, dateJour) {
  var wrap = document.getElementById('journal-tasks');
  if (taches.length === 0) {
    wrap.innerHTML = '<div class="card" style="text-align:center;padding:2rem;color:var(--text-3)">'
      + '<div style="font-size:0.88rem;margin-bottom:0.3rem">Aucune tâche programmée</div>'
      + '<div style="font-size:0.78rem">Sélectionnez un membre ou assignez des tâches dans le module Suivi.</div></div>';
    return;
  }

  // Map des entrées déjà saisies par tache_id
  var entryMap = {};
  entries.forEach(function(e) { entryMap[e.tache_id] = e; });

  // Grouper par projet
  var projetMap = {};
  taches.forEach(function(t) {
    var pid = t.projet_id;
    if (!projetMap[pid]) projetMap[pid] = { nom: t.projetNom || '—', code: t.projetCode || '', items: [] };
    projetMap[pid].items.push(t);
  });

  var html = '';
  Object.keys(projetMap).forEach(function(pid) {
    var proj = projetMap[pid];
    html += '<div class="card" style="margin-bottom:0.8rem">';
    html += '<div class="card-title" style="font-size:0.78rem">';
    if (proj.code) html += '<span style="color:var(--accent);font-family:var(--mono)">' + proj.code + '</span> — ';
    html += proj.nom + '</div>';

    proj.items.forEach(function(t) {
      var entry = entryMap[t.id];
      var filled = !!entry;
      html += '<div class="journal-task-row' + (filled ? ' filled' : '') + '">';
      html += '<div class="journal-task-left">';
      html += '<span class="journal-task-niveau">' + (t.niveau === 1 ? '◆' : '•') + '</span>';
      html += '<div>';
      html += '<div class="journal-task-titre">' + (t.titre || '') + '</div>';
      html += '<div class="journal-task-meta">';
      html += suiviStatutBadge(t.statut);
      html += '<span style="font-size:0.7rem;color:var(--text-3)">Progression : ' + (t.progression || 0) + '%</span>';
      if (t.dateEcheance) html += '<span class="suivi-date">' + fmtDate(t.dateEcheance) + '</span>';
      html += '</div>';
      html += '</div>';
      html += '</div>';
      html += '<div class="journal-task-right">';
      if (filled) {
        html += '<div class="journal-filled-info">';
        html += '<span class="journal-filled-prog">' + entry.progression_avant + '% → <strong>' + entry.progression_apres + '%</strong></span>';
        if (entry.heures) html += '<span class="journal-filled-h">' + entry.heures + 'h</span>';
        html += '<button class="btn btn-sm" onclick="openJournalModal(\'' + t.id + '\',\'' + pid + '\',\'' + entry.id + '\')">Modifier</button>';
        html += '</div>';
        if (entry.commentaire) html += '<div class="journal-filled-comment">' + escHtml(entry.commentaire) + '</div>';
      } else {
        html += '<button class="btn btn-primary btn-sm" onclick="openJournalModal(\'' + t.id + '\',\'' + pid + '\')">Saisir l\'avancement</button>';
      }
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
  });

  wrap.innerHTML = html;
}

function _renderJournalEntries(entries) {
  var wrap = document.getElementById('journal-entries');
  if (entries.length === 0) { wrap.innerHTML = ''; return; }

  var html = '<div class="card"><div class="card-title">Historique du jour</div>';
  html += '<div class="table-wrap"><table><thead><tr>';
  html += '<th>Membre</th><th>Tâche</th><th>Projet</th><th>Avant</th><th>Après</th><th>Heures</th><th>Commentaire</th>';
  html += '</tr></thead><tbody>';

  entries.forEach(function(e) {
    html += '<tr>';
    html += '<td><span class="suivi-assignee">' + (e.membre || '—') + '</span></td>';
    html += '<td>' + (e.tache_titre || '—') + '</td>';
    html += '<td style="font-size:0.78rem;color:var(--text-3)">' + (e.projet_code ? e.projet_code + ' — ' : '') + (e.projet_nom || '') + '</td>';
    html += '<td style="text-align:center">' + (e.progression_avant || 0) + '%</td>';
    html += '<td style="text-align:center;font-weight:600;color:var(--accent)">' + (e.progression_apres || 0) + '%</td>';
    html += '<td style="text-align:center">' + (e.heures ? e.heures + 'h' : '—') + '</td>';
    html += '<td style="font-size:0.78rem;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escHtml(e.commentaire || '') + '">' + escHtml(e.commentaire || '—') + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table></div></div>';
  wrap.innerHTML = html;
}

// ── Helpers HTML ──
function escHtml(s) {
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ── Modal journal ──
function openJournalModal(tacheId, projetId, entryId) {
  var t = _suiviCache.find(function(x) { return x.id === tacheId; });
  if (!t) { showToast('Tâche introuvable', 'error'); return; }

  document.getElementById('jrn-tache-id').value = tacheId;
  document.getElementById('jrn-projet-id').value = projetId;
  document.getElementById('jrn-entry-id').value = entryId || '';

  // Label tâche
  var label = (t.projetCode ? t.projetCode + ' — ' : '') + (t.titre || '');
  document.getElementById('jrn-tache-label').textContent = label;

  // Progression actuelle
  var currentProg = t.progression || 0;
  document.getElementById('jrn-prog-avant').textContent = currentProg + '%';

  var errEl = document.getElementById('jrn-err');
  if (errEl) errEl.style.display = 'none';

  // Si modification d'une entrée existante
  if (entryId) {
    var entry = _journalCache.find(function(e) { return e.id === entryId; });
    if (entry) {
      document.getElementById('jrn-commentaire').value = entry.commentaire || '';
      document.getElementById('jrn-prog-apres').value = entry.progression_apres || 0;
      document.getElementById('jrn-prog-val').textContent = (entry.progression_apres || 0) + '%';
      document.getElementById('jrn-heures').value = entry.heures || '';
      document.getElementById('jrn-prog-avant').textContent = (entry.progression_avant || 0) + '%';
    }
  } else {
    document.getElementById('jrn-commentaire').value = '';
    document.getElementById('jrn-prog-apres').value = currentProg;
    document.getElementById('jrn-prog-val').textContent = currentProg + '%';
    document.getElementById('jrn-heures').value = '';
  }

  openModal('modal-journal');
}

function saveJournalEntry() {
  var tacheId  = document.getElementById('jrn-tache-id').value;
  var projetId = document.getElementById('jrn-projet-id').value;
  var entryId  = document.getElementById('jrn-entry-id').value;
  var commentaire = document.getElementById('jrn-commentaire').value.trim();
  var progApres   = parseInt(document.getElementById('jrn-prog-apres').value) || 0;
  var heures      = document.getElementById('jrn-heures').value;
  var errEl       = document.getElementById('jrn-err');

  if (!commentaire) {
    errEl.textContent = 'Décrivez le travail effectué.';
    errEl.style.display = 'block';
    return;
  }

  // Membre = utilisateur connecté ou sélection
  var membreFilter = document.getElementById('journal-membre').value;
  var membre = membreFilter;
  if (!membre) {
    // Utiliser le nom de l'utilisateur connecté
    var userSpan = document.getElementById('user-display');
    if (userSpan) membre = (userSpan.textContent || '').trim();
  }
  if (!membre) { errEl.textContent = 'Sélectionnez un membre.'; errEl.style.display = 'block'; return; }

  var t = _suiviCache.find(function(x) { return x.id === tacheId; });
  var progAvant = t ? (t.progression || 0) : 0;

  var body = {
    tache_id:          tacheId,
    projet_id:         projetId,
    membre:            membre,
    date_jour:         getJournalDate(),
    commentaire:       commentaire,
    progression_avant: progAvant,
    progression_apres: progApres,
    heures:            heures || null
  };

  var isEdit = !!entryId;
  var url    = isEdit ? 'api/journal.php?id=' + entryId : 'api/journal.php';
  var method = isEdit ? 'PUT' : 'POST';

  apiFetch(url, { method: method, body: body })
    .then(function() {
      closeModal('modal-journal');
      showToast(isEdit ? '✓ Entrée modifiée' : '✓ Avancement enregistré');
      renderJournalPage();
    })
    .catch(function(e) {
      errEl.textContent = e.message || 'Erreur';
      errEl.style.display = 'block';
    });
}

// ═══════════════════════════════════════════════════════════
//  TÂCHES-TYPES — Liste configurable classée par mission
// ═══════════════════════════════════════════════════════════

function getTachesTypes() {
  var t = getSetting('cortoba_taches_types', []);
  return Array.isArray(t) ? t : [];
}

function renderParametresTachesTypes() {
  var wrap = document.getElementById('param-taches-types-wrap'); if (!wrap) return;
  var tachesTypes = getTachesTypes();
  var missions = getMissions();
  var cats = getMissionCategories();
  var html = '';

  // Grouper par mission
  missions.forEach(function(m) {
    var cat = cats.find(function(c) { return c.id === m.cat; });
    var catLabel = cat ? cat.label : '';
    var mTaches = tachesTypes.filter(function(t) { return t.mission_id === m.id; });
    if (mTaches.length === 0) return;

    html += '<div style="margin-bottom:1rem">';
    html += '<div style="font-size:0.72rem;font-weight:600;color:var(--accent);letter-spacing:0.06em;text-transform:uppercase;margin-bottom:0.4rem">';
    html += (catLabel ? catLabel + ' › ' : '') + m.nom + '</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:0.3rem">';
    mTaches.forEach(function(t) {
      html += '<span style="display:inline-flex;align-items:center;gap:0.25rem;padding:0.2rem 0.5rem;border-radius:4px;font-size:0.74rem;background:var(--bg-3);border:1px solid var(--border);color:var(--text-2)">';
      html += (t.nom || '');
      html += '<button type="button" style="background:none;border:none;cursor:pointer;color:#e07070;font-size:0.8rem;line-height:1;padding:0 0 0 3px" onclick="removeParamTacheType(\'' + t.id + '\')" title="Supprimer">✕</button>';
      html += '</span>';
    });
    html += '</div></div>';
  });

  // Orphelines
  var orphans = tachesTypes.filter(function(t) { return !t.mission_id || !missions.find(function(m) { return m.id === t.mission_id; }); });
  if (orphans.length > 0) {
    html += '<div style="margin-bottom:1rem"><div style="font-size:0.72rem;font-weight:600;color:var(--text-3);margin-bottom:0.4rem">Non classées</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:0.3rem">';
    orphans.forEach(function(t) {
      html += '<span style="display:inline-flex;align-items:center;gap:0.25rem;padding:0.2rem 0.5rem;border-radius:4px;font-size:0.74rem;background:var(--bg-3);border:1px solid var(--border);color:var(--text-3)">' + (t.nom || '');
      html += '<button type="button" style="background:none;border:none;cursor:pointer;color:#e07070;font-size:0.8rem" onclick="removeParamTacheType(\'' + t.id + '\')">✕</button></span>';
    });
    html += '</div></div>';
  }

  if (!html) html = '<div style="font-size:0.78rem;color:var(--text-3);font-style:italic">Aucune tâche-type configurée. Ajoutez-en ci-dessous.</div>';
  wrap.innerHTML = html;

  // Remplir le select des missions parentes
  var selM = document.getElementById('param-tache-mission');
  if (selM && selM.options.length <= 1) {
    cats.forEach(function(cat) {
      var catMissions = missions.filter(function(m) { return m.cat === cat.id; });
      if (catMissions.length === 0) return;
      var optgroup = document.createElement('optgroup');
      optgroup.label = cat.label;
      catMissions.forEach(function(m) {
        var opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.nom;
        optgroup.appendChild(opt);
      });
      selM.appendChild(optgroup);
    });
  }
}

function addParamTacheType() {
  var missionId = document.getElementById('param-tache-mission').value;
  var nom = (document.getElementById('param-tache-nom').value || '').trim();
  if (!nom) { alert('Saisissez le nom de la tâche.'); return; }
  if (!missionId) { alert('Choisissez la mission parente.'); return; }
  var list = getTachesTypes();
  list.push({ id: 'tt_' + Date.now(), mission_id: missionId, nom: nom });
  saveSetting('cortoba_taches_types', list);
  document.getElementById('param-tache-nom').value = '';
  renderParametresTachesTypes();
  showToast('Tâche-type ajoutée');
}

function removeParamTacheType(id) {
  if (!confirm('Supprimer cette tâche-type ?')) return;
  var list = getTachesTypes().filter(function(t) { return t.id !== id; });
  saveSetting('cortoba_taches_types', list);
  renderParametresTachesTypes();
  showToast('Tâche-type supprimée');
}

// ═══════════════════════════════════════════════════════════
//  MODAL SUIVI — Tâches depuis la liste configurable
// ═══════════════════════════════════════════════════════════

// Surcharger _toggleTitreField pour niveau 1 (tâches) : select depuis tâches-types
var _origToggleTitreField = _toggleTitreField;
_toggleTitreField = function(niveau, selectedValue) {
  var fieldSelect = document.getElementById('tache-titre-field-select');
  var fieldInput  = document.getElementById('tache-titre-field-input');

  if (niveau === 0) {
    // Mission → select missions
    fieldSelect.style.display = '';
    fieldInput.style.display = 'none';
    var labelEl = fieldSelect.querySelector('.form-label');
    if (labelEl) labelEl.textContent = 'Mission *';
    _populateMissionsSelect(selectedValue);
  } else if (niveau === 1) {
    // Tâche → select tâches-types OU input libre
    var tachesTypes = getTachesTypes();
    if (tachesTypes.length > 0) {
      fieldSelect.style.display = '';
      fieldInput.style.display = 'none';
      var labelEl = fieldSelect.querySelector('.form-label');
      if (labelEl) labelEl.textContent = 'Tâche *';
      _populateTachesTypesSelect(selectedValue);
    } else {
      fieldSelect.style.display = 'none';
      fieldInput.style.display = '';
      document.getElementById('tache-titre').value = selectedValue || '';
    }
  } else {
    // Sous-tâche → input libre
    fieldSelect.style.display = 'none';
    fieldInput.style.display = '';
    document.getElementById('tache-titre').value = selectedValue || '';
  }
};

function _populateTachesTypesSelect(selectedValue) {
  var sel = document.getElementById('tache-titre-select');
  sel.innerHTML = '<option value="">— Choisir une tâche —</option><option value="__add__">➕ Ajouter une nouvelle tâche…</option>';
  // Bind handler for the "+" pseudo-option
  sel.onchange = function(){
    if (sel.value === '__add__') { sel.value = ''; openAddTacheTypeInline(); }
  };
  var tachesTypes = getTachesTypes();
  var missions = getMissions();
  var cats = getMissionCategories();

  // Grouper par mission
  missions.forEach(function(m) {
    var mTaches = tachesTypes.filter(function(t) { return t.mission_id === m.id; });
    if (mTaches.length === 0) return;
    var cat = cats.find(function(c) { return c.id === m.cat; });
    var optgroup = document.createElement('optgroup');
    optgroup.label = (cat ? cat.label + ' › ' : '') + m.nom;
    mTaches.forEach(function(t) {
      var opt = document.createElement('option');
      opt.value = t.nom;
      opt.textContent = t.nom;
      optgroup.appendChild(opt);
    });
    sel.appendChild(optgroup);
  });

  if (selectedValue) sel.value = selectedValue;
}

// ═══════════════════════════════════════════════════════════
//  RENDEMENT — Dashboard analytique multi-onglets (Phase 1)
// ═══════════════════════════════════════════════════════════

var _rdmState = {
  preset: '30', from: null, to: null,
  label: '30 derniers jours', tab: 'equipe',
  taches: [], journal: [], timesheets: [], users: []
};

function _rdmIso(d)   { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function _rdmToday()  { var d = new Date(); d.setHours(0,0,0,0); return d; }
function _rdmFmtFR(d) { return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear(); }

function getTauxStandardFacturation() { return parseFloat(getSetting('rendement_taux_facturation_std', 60)) || 0; }
function getTauxStandardCout()        { return parseFloat(getSetting('rendement_taux_cout_std', 25)) || 0; }

function _rdmMemberBillingRate(m) {
  if (!m) return getTauxStandardFacturation();
  if (m.hourly_billing_rate != null && m.hourly_billing_rate !== '') return parseFloat(m.hourly_billing_rate) || 0;
  return getTauxStandardFacturation();
}
function _rdmMemberCostRate(m) {
  if (!m) return getTauxStandardCout();
  if (m.hourly_cost_rate != null && m.hourly_cost_rate !== '') return parseFloat(m.hourly_cost_rate) || 0;
  if (m.salaire_net != null && m.heures_mois) {
    var s = parseFloat(m.salaire_net) || 0;
    var c = parseFloat(m.charges_sociales) || 0;
    var h = parseFloat(m.heures_mois) || 160;
    if (h > 0) return (s + c) / h;
  }
  return getTauxStandardCout();
}

function _rdmFindMemberByName(fullName) {
  if (!fullName) return null;
  var key = String(fullName).trim().toLowerCase();
  var list = getMembres() || [];
  for (var i = 0; i < list.length; i++) {
    var fn = ((list[i].prenom || '') + ' ' + (list[i].nom || '')).trim().toLowerCase();
    if (fn === key) return list[i];
  }
  return null;
}

function toggleRdmDatePicker() {
  var pop = document.getElementById('rdm-drp-pop');
  if (!pop) return;
  pop.style.display = (pop.style.display === 'none' || !pop.style.display) ? 'block' : 'none';
}

function applyRdmPreset(preset) {
  var to = _rdmToday();
  var from = new Date(to);
  var label = '';
  switch (preset) {
    case 'today':     label = "Aujourd'hui"; break;
    case '7':         from.setDate(to.getDate() - 6);  label = '7 derniers jours'; break;
    case '30':        from.setDate(to.getDate() - 29); label = '30 derniers jours'; break;
    case 'month':     from = new Date(to.getFullYear(), to.getMonth(), 1); label = 'Ce mois-ci'; break;
    case 'lastmonth':
      from = new Date(to.getFullYear(), to.getMonth()-1, 1);
      to   = new Date(to.getFullYear(), to.getMonth(), 0);
      label = 'Mois dernier';
      break;
    case 'year':      from = new Date(to.getFullYear(), 0, 1); label = 'Année en cours'; break;
    case 'all':       from = new Date('2020-01-01'); label = 'Depuis le début'; break;
    default:          from.setDate(to.getDate() - 29); label = '30 derniers jours';
  }
  _rdmState.preset = preset;
  _rdmState.from = from; _rdmState.to = to; _rdmState.label = label;
  var lbl = document.getElementById('rdm-drp-label'); if (lbl) lbl.textContent = label;
  var pop = document.getElementById('rdm-drp-pop'); if (pop) pop.style.display = 'none';
  renderRendementPage();
}

function applyRdmCustom() {
  var f = (document.getElementById('rdm-drp-from') || {}).value;
  var t = (document.getElementById('rdm-drp-to') || {}).value;
  if (!f || !t) { alert('Veuillez choisir deux dates'); return; }
  var from = new Date(f + 'T00:00:00');
  var to   = new Date(t + 'T00:00:00');
  if (from > to) { alert('La date de début doit être avant la date de fin'); return; }
  _rdmState.preset = 'custom';
  _rdmState.from = from; _rdmState.to = to;
  _rdmState.label = _rdmFmtFR(from) + ' → ' + _rdmFmtFR(to);
  var lbl = document.getElementById('rdm-drp-label'); if (lbl) lbl.textContent = _rdmState.label;
  var pop = document.getElementById('rdm-drp-pop'); if (pop) pop.style.display = 'none';
  renderRendementPage();
}

function switchRdmTab(tab) {
  _rdmState.tab = tab;
  document.querySelectorAll('.rdm-tab').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-rdm-tab') === tab);
  });
  document.querySelectorAll(".rdm-tab-panel").forEach(function(p) {
    var isActive = p.id === "rdm-panel-" + tab;
    p.classList.toggle("active", isActive);
    p.style.display = isActive ? "block" : "none";
  });



}

function renderRendementPage() {
  if (!_rdmState.from || !_rdmState.to) {
    var to = _rdmToday();
    var from = new Date(to); from.setDate(to.getDate() - 29);
    _rdmState.from = from; _rdmState.to = to;
  }
  var df = _rdmIso(_rdmState.from);
  var dt = _rdmIso(_rdmState.to);

  Promise.all([
    loadTaches(),
    apiFetch('api/journal.php?date_from=' + df + '&date_to=' + dt).catch(function() { return { data: [] }; }),
    apiFetch('api/timesheets.php?date_from=' + df + '&date_to=' + dt).catch(function() { return { data: [] }; }),
    Promise.resolve(getMembres() || [])
  ]).then(function(results) {
    var taches  = results[0] || [];
    var journal = (results[1] && results[1].data) || [];
    var ts      = (results[2] && results[2].data) || [];
    var users   = results[3] || [];

    _rdmState.taches = taches;
    _rdmState.journal = journal;
    _rdmState.timesheets = ts;
    _rdmState.users = users;

    _renderRendementKPIs(taches, journal, ts, users);
    _renderRendementMembres(taches, journal, ts, users);
    _renderRendementHistorique(taches, journal, ts);
  });
}

function _rdmComputeMemberStats(fullName, taches, entries, timesheets) {
  var m = _rdmFindMemberByName(fullName);
  var s = {
    nom: fullName, member: m,
    role: m ? (m.role || '') : '',
    photo: m ? (m.profile_picture_url || null) : null,
    assignees: 0, terminees: 0, enCours: 0, bloquees: 0,
    heures: 0, heuresBillable: 0, heuresInternal: 0,
    entries: 0, progSum: 0,
    estimEcartSum: 0, estimEcartCount: 0,
    beneficeGenere: 0, coutTotal: 0
  };

  (taches || []).forEach(function(t) {
    if (t.niveau < 1) return;
    if ((t.assignee || '').trim() !== fullName) return;
    s.assignees++;
    if (t.statut === 'Terminé') s.terminees++;
    else if (t.statut === 'En cours') s.enCours++;
    else if (t.statut === 'Bloqué') s.bloquees++;
    if (t.statut === 'Terminé' && t.heures_estimees && t.heures_reelles) {
      var est = parseFloat(t.heures_estimees) || 0;
      var re  = parseFloat(t.heures_reelles) || 0;
      if (est > 0) { s.estimEcartSum += ((re - est) / est) * 100; s.estimEcartCount++; }
    }
  });

  (entries || []).forEach(function(e) {
    if ((e.membre || '').trim() !== fullName) return;
    var h = parseFloat(e.heures || 0);
    s.heures += h; s.entries++;
    s.progSum += (parseInt(e.progression_apres || 0) - parseInt(e.progression_avant || 0));
    s.heuresBillable += h;
  });

  (timesheets || []).forEach(function(e) {
    if ((e.membre || e.user_name || '').trim() !== fullName) return;
    var h = parseFloat(e.heures || e.hours || 0);
    s.heures += h;
    if (e.billable === 0 || e.is_billable === 0 || e.type === 'internal') s.heuresInternal += h;
    else s.heuresBillable += h;
  });

  var bill = _rdmMemberBillingRate(m);
  var cost = _rdmMemberCostRate(m);
  s.coutTotal = s.heures * cost;
  s.beneficeGenere = (s.heuresBillable * bill) - s.coutTotal;
  return s;
}

function _renderRendementKPIs(taches, entries, timesheets, users) {
  var wrap = document.getElementById('rendement-kpis');
  if (!wrap) return;
  var totalTaches = taches.filter(function(t) { return t.niveau >= 1; }).length;
  var terminees   = taches.filter(function(t) { return t.niveau >= 1 && t.statut === 'Terminé'; }).length;
  var totalHeures = 0;
  entries.forEach(function(e) { totalHeures += parseFloat(e.heures || 0); });
  (timesheets || []).forEach(function(e) { totalHeures += parseFloat(e.heures || e.hours || 0); });

  var membresActifs = {};
  entries.forEach(function(e) { if (e.membre) membresActifs[e.membre] = true; });
  (timesheets || []).forEach(function(e) { var n = e.membre || e.user_name; if (n) membresActifs[n] = true; });
  var nbMembres = Object.keys(membresActifs).length;
  var tauxCompletion = totalTaches > 0 ? Math.round((terminees / totalTaches) * 100) : 0;

  var beneficeTotal = 0;
  Object.keys(membresActifs).forEach(function(n) {
    beneficeTotal += _rdmComputeMemberStats(n, taches, entries, timesheets).beneficeGenere;
  });
  var benefColor = beneficeTotal >= 0 ? 'var(--green)' : 'var(--red)';
  var benefStr = (beneficeTotal >= 0 ? '+' : '') + Math.round(beneficeTotal).toLocaleString('fr-FR');

  wrap.innerHTML = ''
    + '<div class="journal-kpi"><div class="journal-kpi-val">' + totalTaches + '</div><div class="journal-kpi-label">Tâches totales</div></div>'
    + '<div class="journal-kpi"><div class="journal-kpi-val" style="color:var(--green)">' + terminees + '</div><div class="journal-kpi-label">Terminées</div></div>'
    + '<div class="journal-kpi"><div class="journal-kpi-val">' + tauxCompletion + '%</div><div class="journal-kpi-label">Taux de complétion</div></div>'
    + '<div class="journal-kpi"><div class="journal-kpi-val">' + totalHeures.toFixed(1) + 'h</div><div class="journal-kpi-label">Heures travaillées</div></div>'
    + '<div class="journal-kpi"><div class="journal-kpi-val">' + nbMembres + '</div><div class="journal-kpi-label">Membres actifs</div></div>'
    + '<div class="journal-kpi"><div class="journal-kpi-val" style="color:' + benefColor + '">' + benefStr + '<span style="font-size:0.55em;opacity:.7"> DT</span></div><div class="journal-kpi-label">Bénéfice généré</div></div>';
}

function _renderRendementMembres(taches, entries, timesheets, users) {
  var wrap = document.getElementById('rendement-membres');
  if (!wrap) return;
  var membres = users || getMembres();

  var names = {};
  membres.forEach(function(m) {
    var fn = ((m.prenom || '') + ' ' + (m.nom || '')).trim();
    if (fn) names[fn] = true;
  });
  (entries || []).forEach(function(e) { if (e.membre) names[e.membre] = true; });
  (timesheets || []).forEach(function(e) { var n = e.membre || e.user_name; if (n) names[n] = true; });

  var all = Object.keys(names).map(function(n) { return _rdmComputeMemberStats(n, taches, entries, timesheets); });
  var sorted = all.filter(function(s) { return s.assignees > 0 || s.heures > 0; })
                  .sort(function(a, b) { return b.terminees - a.terminees; });

  if (sorted.length === 0) {
    wrap.innerHTML = '<div class="card" style="text-align:center;padding:2rem;color:var(--text-3)">Aucune donnée de performance sur cette période.</div>';
    return;
  }

  var canSens = typeof canViewSensitiveMember === 'function' ? canViewSensitiveMember() : false;

  var html = '<div class="rendement-grid">';
  sorted.forEach(function(s) {
    var tauxCompl = s.assignees > 0 ? Math.round((s.terminees / s.assignees) * 100) : 0;
    var ini = ((s.nom.split(' ')[0] || '')[0] || '') + ((s.nom.split(' ')[1] || '')[0] || '');
    ini = ini.toUpperCase() || '?';
    var perfColor = tauxCompl >= 80 ? 'var(--green)' : tauxCompl >= 50 ? 'var(--accent)' : tauxCompl > 0 ? 'var(--orange)' : 'var(--text-3)';
    var avatarInner = s.photo
      ? '<img src="' + escHtml(s.photo) + '" alt="' + escHtml(s.nom) + '" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">'
      : ini;
    var safeName = escHtml(s.nom);
    var jsName = safeName.replace(/'/g, "\\'");

    html += '<div class="rendement-card rdm-card-clickable" onclick="openRdmMemberOffcanvas(\'' + jsName + '\')">';
    html += '<div class="rendement-card-header">';
    html += '<div class="suivi-membre-avatar" style="overflow:hidden">' + avatarInner + '</div>';
    html += '<div style="flex:1;min-width:0">';
    html += '<div class="suivi-membre-nom">' + safeName + '</div>';
    if (s.role) html += '<div style="font-size:0.7rem;color:var(--text-3)">' + escHtml(s.role) + '</div>';
    html += '</div>';
    html += '<div class="rendement-score" style="color:' + perfColor + '">' + tauxCompl + '%</div>';
    html += '</div>';

    html += '<div class="rendement-metrics">';
    html += '<div class="rendement-metric"><div class="rendement-metric-val">' + s.assignees + '</div><div class="rendement-metric-label">Assignées</div></div>';
    html += '<div class="rendement-metric"><div class="rendement-metric-val" style="color:var(--green)">' + s.terminees + '</div><div class="rendement-metric-label">Terminées</div></div>';
    html += '<div class="rendement-metric"><div class="rendement-metric-val" style="color:var(--blue)">' + s.enCours + '</div><div class="rendement-metric-label">En cours</div></div>';
    html += '<div class="rendement-metric"><div class="rendement-metric-val" style="color:var(--red)">' + s.bloquees + '</div><div class="rendement-metric-label">Bloquées</div></div>';
    html += '<div class="rendement-metric"><div class="rendement-metric-val">' + s.heures.toFixed(1) + 'h</div><div class="rendement-metric-label">Heures</div></div>';
    html += '<div class="rendement-metric"><div class="rendement-metric-val">' + s.entries + '</div><div class="rendement-metric-label">Entrées journal</div></div>';
    html += '</div>';

    if (canSens) {
      var bColor = s.beneficeGenere >= 0 ? 'var(--green)' : 'var(--red)';
      var bStr = (s.beneficeGenere >= 0 ? '+' : '') + Math.round(s.beneficeGenere).toLocaleString('fr-FR');
      html += '<div class="rdm-benefice-banner">';
      html += '<span class="rdm-benefice-label">Bénéfice généré</span>';
      html += '<span class="rdm-benefice-val" style="color:' + bColor + '">' + bStr + '<span class="rdm-benefice-unit"> DT</span></span>';
      html += '<span class="rdm-benefice-sub">' + s.heuresBillable.toFixed(1) + 'h facturables</span>';
      html += '</div>';
    }

    html += '<div style="padding:0.6rem 1rem;border-top:1px solid var(--border)">';
    html += '<div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-3);margin-bottom:0.3rem"><span>Taux de complétion</span><span style="color:' + perfColor + ';font-weight:600">' + tauxCompl + '%</span></div>';
    html += '<div style="width:100%;height:6px;background:var(--bg-3);border-radius:3px;overflow:hidden"><div style="width:' + tauxCompl + '%;height:100%;background:' + perfColor + ';border-radius:3px;transition:width 0.4s"></div></div>';
    html += '</div>';

    html += '</div>';
  });
  html += '</div>';
  wrap.innerHTML = html;
}

function computeMembreRendementStats(fullName) {
  return _rdmComputeMemberStats(fullName, _rdmState.taches, _rdmState.journal, _rdmState.timesheets);
}

function _renderRendementHistorique(taches, entries, timesheets) {
  var wrap = document.getElementById('rendement-historique');
  if (!wrap) return;
  if (!entries || entries.length === 0) { wrap.innerHTML = ''; return; }

  var dateMap = {};
  entries.forEach(function(e) {
    var d = e.date_jour;
    if (!dateMap[d]) dateMap[d] = { date: d, membres: {}, heures: 0, entries: 0, progSum: 0 };
    dateMap[d].heures += parseFloat(e.heures || 0);
    dateMap[d].entries++;
    dateMap[d].progSum += parseInt(e.progression_apres || 0) - parseInt(e.progression_avant || 0);
    dateMap[d].membres[e.membre] = true;
  });
  var dates = Object.keys(dateMap).sort().reverse();

  var html = '<div class="card">';
  html += '<div class="card-title">Historique par journée</div>';
  html += '<div class="table-wrap"><table><thead><tr>';
  html += '<th>Date</th><th>Membres actifs</th><th>Entrées</th><th>Heures</th><th>Avancement cumulé</th>';
  html += '</tr></thead><tbody>';
  dates.forEach(function(d) {
    var row = dateMap[d];
    var nbMembres = Object.keys(row.membres).length;
    html += '<tr>';
    html += '<td style="font-family:var(--mono);font-size:0.8rem">' + fmtDate(d) + '</td>';
    html += '<td style="text-align:center">' + nbMembres + '</td>';
    html += '<td style="text-align:center">' + row.entries + '</td>';
    html += '<td style="text-align:center">' + row.heures.toFixed(1) + 'h</td>';
    html += '<td style="text-align:center;color:var(--green);font-weight:500">+' + row.progSum + ' pts</td>';
    html += '</tr>';
  });
  html += '</tbody></table></div></div>';
  wrap.innerHTML = html;
}

function openRdmMemberOffcanvas(fullName) {
  var s = _rdmComputeMemberStats(fullName, _rdmState.taches, _rdmState.journal, _rdmState.timesheets);
  var title = document.getElementById('rdm-oc-title');
  var body  = document.getElementById('rdm-oc-body');
  if (!title || !body) return;
  title.textContent = fullName + (s.role ? ' — ' + s.role : '');

  var canSens = typeof canViewSensitiveMember === 'function' ? canViewSensitiveMember() : false;
  var donut = _rdmDonutSvg(s.heuresBillable, s.heuresInternal);

  var weeks = 1;
  if (_rdmState.from && _rdmState.to) {
    var ms = _rdmState.to.getTime() - _rdmState.from.getTime();
    weeks = Math.max(1, Math.round(ms / (7*24*3600*1000)));
  }
  var velocity = (s.terminees / weeks).toFixed(1);

  var ecartMoy = s.estimEcartCount > 0 ? (s.estimEcartSum / s.estimEcartCount) : null;
  var ecartStr = ecartMoy === null ? '—'
               : (ecartMoy > 0 ? '+' : '') + ecartMoy.toFixed(0) + '%';
  var ecartColor = ecartMoy === null ? 'var(--text-3)'
                 : (Math.abs(ecartMoy) < 10 ? 'var(--green)' : Math.abs(ecartMoy) < 25 ? 'var(--orange)' : 'var(--red)');

  var html = '';
  html += '<div class="rdm-oc-kpis">';
  html += '<div class="rdm-oc-kpi"><div class="rdm-oc-kpi-val">' + s.heures.toFixed(1) + 'h</div><div class="rdm-oc-kpi-label">Total heures</div></div>';
  html += '<div class="rdm-oc-kpi"><div class="rdm-oc-kpi-val" style="color:var(--green)">' + s.terminees + '</div><div class="rdm-oc-kpi-label">Tâches terminées</div></div>';
  html += '<div class="rdm-oc-kpi"><div class="rdm-oc-kpi-val">' + velocity + '</div><div class="rdm-oc-kpi-label">Vélocité (tâches/sem.)</div></div>';
  html += '<div class="rdm-oc-kpi"><div class="rdm-oc-kpi-val" style="color:' + ecartColor + '">' + ecartStr + '</div><div class="rdm-oc-kpi-label">Écart estimation</div></div>';
  html += '</div>';

  html += '<div class="rdm-oc-section"><div class="rdm-oc-section-title">Répartition des heures</div>';
  html += '<div class="rdm-donut-row">' + donut;
  html += '<ul class="rdm-donut-legend">';
  html += '<li><span class="dot" style="background:var(--accent)"></span> Facturables <b>' + s.heuresBillable.toFixed(1) + 'h</b></li>';
  html += '<li><span class="dot" style="background:var(--text-3)"></span> Internes <b>' + s.heuresInternal.toFixed(1) + 'h</b></li>';
  html += '</ul></div></div>';

  if (canSens) {
    var m = s.member;
    var bill = _rdmMemberBillingRate(m);
    var cost = _rdmMemberCostRate(m);
    var bColor = s.beneficeGenere >= 0 ? 'var(--green)' : 'var(--red)';
    html += '<div class="rdm-oc-section"><div class="rdm-oc-section-title">Rentabilité sur la période</div>';
    html += '<div class="rdm-oc-rate">';
    html += '<div><span>Taux facturation</span><b>' + bill.toFixed(2) + ' DT/h</b></div>';
    html += '<div><span>Taux coût</span><b>' + cost.toFixed(2) + ' DT/h</b></div>';
    html += '<div><span>CA généré</span><b>' + Math.round(s.heuresBillable * bill).toLocaleString('fr-FR') + ' DT</b></div>';
    html += '<div><span>Coût total</span><b>' + Math.round(s.coutTotal).toLocaleString('fr-FR') + ' DT</b></div>';
    html += '<div><span>Bénéfice</span><b style="color:' + bColor + '">' + (s.beneficeGenere >= 0 ? '+' : '') + Math.round(s.beneficeGenere).toLocaleString('fr-FR') + ' DT</b></div>';
    html += '</div></div>';
  }

  body.innerHTML = html;

  var oc = document.getElementById('rdm-offcanvas');
  var bd = document.getElementById('rdm-oc-backdrop');
  if (oc) { oc.classList.add('open'); oc.setAttribute('aria-hidden','false'); }
  if (bd) bd.classList.add('open');
}

function closeRdmOffcanvas() {
  var oc = document.getElementById('rdm-offcanvas');
  var bd = document.getElementById('rdm-oc-backdrop');
  if (oc) { oc.classList.remove('open'); oc.setAttribute('aria-hidden','true'); }
  if (bd) bd.classList.remove('open');
}

function _rdmDonutSvg(billable, internal) {
  var total = (billable || 0) + (internal || 0);
  var pctB  = total > 0 ? (billable / total) : 0;
  var pctI  = total > 0 ? (internal / total) : 0;
  var cx = 60, cy = 60, r = 48, c = 2 * Math.PI * r;
  var dashB = (pctB * c).toFixed(2) + ' ' + c.toFixed(2);
  var dashI = (pctI * c).toFixed(2) + ' ' + c.toFixed(2);
  var offI  = (-pctB * c).toFixed(2);
  var centerLabel = total > 0 ? Math.round(pctB * 100) + '%' : '—';
  var svg = '<svg class="rdm-donut" viewBox="0 0 120 120" width="120" height="120">';
  svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="var(--bg-3)" stroke-width="14"/>';
  if (pctB > 0) svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="var(--accent)" stroke-width="14" stroke-dasharray="' + dashB + '" stroke-dashoffset="0" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>';
  if (pctI > 0) svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="var(--text-3)" stroke-width="14" stroke-dasharray="' + dashI + '" stroke-dashoffset="' + offI + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>';
  svg += '<text x="60" y="58" text-anchor="middle" fill="var(--text)" font-size="18" font-weight="700">' + centerLabel + '</text>';
  svg += '<text x="60" y="76" text-anchor="middle" fill="var(--text-3)" font-size="10">facturables</text>';
  svg += '</svg>';
  return svg;
}

// ═══════════════════════════════════════════════════════════
//  DEMANDES ADMINISTRATIVES
// ═══════════════════════════════════════════════════════════

var _daCache = [];

function loadDemandesAdmin() {
  return apiFetch('api/demandes_admin.php')
    .then(function(r) { _daCache = r.data || []; return _daCache; })
    .catch(function(e) { console.error('[DA] load error', e); showToast('Erreur chargement demandes admin', 'error'); return []; });
}

var DA_DEFAULT_TYPES = [
  'Demande d\'avis','Demande d\'accord de principe','Demande d\'autorisation','Demande de permis de bâtir',
  'Demande de raccordement','Demande de certificat','Demande de régularisation','Demande de devis',
  'Demande d\'intervention','Demande de renseignements','Lettre de relance','Réclamation'
];
var DA_DEFAULT_ADMINS = [
  'Municipalité','Gouvernorat','Délégation','STEG','SONEDE','ONAS','Protection civile','CRDA',
  'Ministère de l\'Équipement et de l\'Habitat','Ministère des Domaines de l\'État','INP — Institut National du Patrimoine',
  'ALIPH','APAL','Tribunal immobilier','Conservation foncière','Direction régionale de l\'urbanisme'
];
var DA_DEFAULT_GOUVS = ['Tunis','Ariana','Ben Arous','Manouba','Nabeul','Zaghouan','Bizerte','Béja','Jendouba','Le Kef','Siliana','Sousse','Monastir','Mahdia','Sfax','Kairouan','Kasserine','Sidi Bouzid','Gabès','Médenine','Tataouine','Gafsa','Tozeur','Kébili'];
// Délégations de Djerba (Médenine) + principales délégations Sud
var DA_DEFAULT_DELEGS = ['Houmt Souk','Midoun','Ajim','Zarzis','Ben Gardane','Médenine Nord','Médenine Sud','Beni Khedache','Sidi Makhlouf','Djerba - Houmt Souk','Djerba - Midoun','Djerba - Ajim'];
// Municipalités de Djerba + voisines
var DA_DEFAULT_MUNIS = ['Municipalité de Houmt Souk','Municipalité de Midoun','Municipalité d\'Ajim','Municipalité d\'Erriadh','Municipalité de Zarzis','Municipalité de Ben Gardane','Municipalité de Médenine'];
var DA_DEFAULT_DOCS = ['Copie CIN','Plan de situation','Plan d\'architecture','Titre foncier','Extrait du registre foncier','Permis de bâtir','Attestation d\'assurance','Quittance de paiement','Procuration légalisée','Photos du site','Rapport technique','Attestation de propriété','Levé topographique','Étude de sol'];

function getDAList(key, defaults) {
  var val = getSetting(key, null);
  if (val && Array.isArray(val)) return val;
  return defaults || [];
}
function getDATypes()  { return getDAList('types_demandes_admin', DA_DEFAULT_TYPES); }
function getDAAdmins() { return getDAList('administrations_list', DA_DEFAULT_ADMINS); }
function getDAGouvs()  { return getDAList('gouvernorats_list', DA_DEFAULT_GOUVS); }
function getDADelegs() { return getDAList('delegations_list', DA_DEFAULT_DELEGS); }
function getDAMunis()  { return getDAList('municipalites_list', DA_DEFAULT_MUNIS); }
function getDADocs()   { return getDAList('documents_admin_list', DA_DEFAULT_DOCS); }
function getDAObjets() { return getDAList('objets_demandes_admin', []); }

function _daDefaultsFor(key) {
  return key === 'types_demandes_admin' ? DA_DEFAULT_TYPES
       : key === 'administrations_list' ? DA_DEFAULT_ADMINS
       : key === 'gouvernorats_list'    ? DA_DEFAULT_GOUVS
       : key === 'delegations_list'     ? DA_DEFAULT_DELEGS
       : key === 'municipalites_list'   ? DA_DEFAULT_MUNIS
       : key === 'documents_admin_list' ? DA_DEFAULT_DOCS
       : [];
}

function addParamDAItem(settingKey, inputId, listId) {
  var inp = document.getElementById(inputId);
  var val = (inp.value || '').trim();
  if (!val) { alert('Saisissez une valeur.'); return; }
  var list = getDAList(settingKey, _daDefaultsFor(settingKey));
  if (list.indexOf(val) !== -1) { alert('Cette valeur existe déjà.'); return; }
  list.push(val);
  saveSetting(settingKey, list);
  inp.value = '';
  _renderDAParamList(settingKey, listId, list);
  showToast('Ajouté');
}

function removeParamDAItem(settingKey, listId, val) {
  var list = getDAList(settingKey, _daDefaultsFor(settingKey)).filter(function(v) { return v !== val; });
  saveSetting(settingKey, list);
  _renderDAParamList(settingKey, listId, list);
  showToast('Supprimé');
}

// Enregistre automatiquement un objet dans l'historique
function _daSaveObjetHistory(objet) {
  var val = (objet || '').trim();
  if (!val) return;
  var list = getDAObjets();
  if (list.indexOf(val) !== -1) return;
  list.push(val);
  if (list.length > 100) list = list.slice(-100);
  saveSetting('objets_demandes_admin', list);
}

function _renderDAParamList(settingKey, listId, list) {
  var wrap = document.getElementById(listId);
  if (!wrap) return;
  var html = '';
  list.forEach(function(v) {
    var safeVal = String(v).replace(/'/g, "\\'");
    html += '<span style="display:inline-flex;align-items:center;gap:0.3rem;padding:0.2rem 0.55rem;border-radius:4px;font-size:0.74rem;background:var(--bg-3);border:1px solid var(--border);color:var(--accent)">';
    html += escHtml(v);
    html += '<button type="button" style="background:none;border:none;cursor:pointer;color:#e07070;font-size:0.8rem;line-height:1;padding:0 0 0 3px" onclick="removeParamDAItem(\'' + settingKey + '\',\'' + listId + '\',\'' + safeVal + '\')" title="Supprimer">\u2715</button>';
    html += '</span>';
  });
  wrap.innerHTML = html;
}

function renderParametresDA() {
  _renderDAParamList('types_demandes_admin', 'param-da-type-list', getDATypes());
  _renderDAParamList('administrations_list', 'param-da-admin-list', getDAAdmins());
  _renderDAParamList('gouvernorats_list', 'param-da-gouv-list', getDAGouvs());
  _renderDAParamList('delegations_list', 'param-da-deleg-list', getDADelegs());
  _renderDAParamList('municipalites_list', 'param-da-muni-list', getDAMunis());
  _renderDAParamList('documents_admin_list', 'param-da-doc-list', getDADocs());
  _renderDAParamList('objets_demandes_admin', 'param-da-objet-list', getDAObjets());

  // En-tête agence — pré-remplir (réutilise les clés cortoba_agence_*)
  var setVal = function(id, val) { var e = document.getElementById(id); if (e) e.value = val || ''; };
  setVal('param-da-hdr-nom-fr', getSetting('cortoba_agence_raison', 'Cortoba Architecture Studio'));
  setVal('param-da-hdr-nom-ar', getSetting('cortoba_agence_raison_ar', ''));
  setVal('param-da-hdr-adr-fr', getSetting('cortoba_agence_adresse', ''));
  setVal('param-da-hdr-adr-ar', getSetting('cortoba_agence_adresse_ar', ''));
  setVal('param-da-hdr-tel',    getSetting('cortoba_agence_tel', ''));
  setVal('param-da-hdr-email',  getSetting('cortoba_agence_email', ''));

  var logo = getSetting('cortoba_agence_logo', '');
  var imgL = document.getElementById('param-da-hdr-logo-preview');
  if (imgL) {
    if (logo) { imgL.src = logo; imgL.style.display = 'inline-block'; }
    else      { imgL.src = ''; imgL.style.display = 'none'; }
  }

  var cachet = getSetting('cortoba_cachet_signature', '');
  var imgC = document.getElementById('param-da-cachet-preview');
  if (imgC) {
    if (cachet) { imgC.src = cachet; imgC.style.display = 'inline-block'; }
    else        { imgC.src = ''; imgC.style.display = 'none'; }
  }

  // Cachet visible uniquement pour gérants
  var cachetWrap = document.getElementById('param-da-cachet-wrap');
  if (cachetWrap) cachetWrap.style.display = _daIsGerant() ? '' : 'none';

  // Style en-tête : pré-remplir les champs + aperçu
  _daWriteHeaderStyleToForm(getDAHeaderStyle());
  previewDAHeader();
}

function _daIsGerant() {
  var s = getSession ? getSession() : null;
  return !!(s && (s.isAdmin || s.role === 'Architecte gérant'));
}

// Style par défaut de l'en-tête des lettres
var DA_HDR_STYLE_DEFAULTS = {
  font: "'Segoe UI', Arial, sans-serif",
  sizeName: 16,
  sizeText: 11,
  colorName: '#1a1a1a',
  colorText: '#555555',
  weight: '700',
  logoPos: 'left',
  logoSize: 70,
  align: 'left',
  marginTop: 0,
  marginBottom: 10,
  separator: 'line',
  lineHeight: 1.4
};

function getDAHeaderStyle() {
  var s = getSetting('cortoba_agence_header_style', null);
  if (!s || typeof s !== 'object') return Object.assign({}, DA_HDR_STYLE_DEFAULTS);
  var out = Object.assign({}, DA_HDR_STYLE_DEFAULTS);
  Object.keys(s).forEach(function(k) { if (s[k] !== undefined && s[k] !== null && s[k] !== '') out[k] = s[k]; });
  return out;
}

// Génère le HTML de l'en-tête (partagé preview + impression)
// textOverride (optionnel) : {nomFr,nomAr,adrFr,adrAr,tel,email,logo} pour aperçu live
function _daBuildHeaderHtml(lang, style, textOverride) {
  var isAr = (lang === 'ar');
  var o = textOverride || {};
  var logo = (o.logo !== undefined) ? o.logo : getSetting('cortoba_agence_logo', '');
  var nomFr = (o.nomFr !== undefined) ? o.nomFr : getSetting('cortoba_agence_raison','Cortoba Architecture Studio');
  var nomAr = (o.nomAr !== undefined) ? o.nomAr : getSetting('cortoba_agence_raison_ar','');
  var adrFr = (o.adrFr !== undefined) ? o.adrFr : getSetting('cortoba_agence_adresse','');
  var adrAr = (o.adrAr !== undefined) ? o.adrAr : getSetting('cortoba_agence_adresse_ar','');
  var nom  = isAr ? (nomAr || nomFr) : nomFr;
  var adr  = isAr ? (adrAr || adrFr) : adrFr;
  var tel  = (o.tel !== undefined) ? o.tel : getSetting('cortoba_agence_tel','');
  var email = (o.email !== undefined) ? o.email : getSetting('cortoba_agence_email','');

  var dir = isAr ? 'rtl' : 'ltr';
  var contact = [];
  if (tel)   contact.push(tel);
  if (email) contact.push(email);

  var logoHtml = (logo && style.logoPos !== 'none') ? '<img src="' + logo + '" alt="" style="max-height:' + style.logoSize + 'px;max-width:200px;object-fit:contain" />' : '';
  var textBlock = '';
  textBlock += '<div style="flex:1;line-height:' + style.lineHeight + '">';
  textBlock += '<div style="font-weight:' + style.weight + ';font-size:' + style.sizeName + 'px;color:' + style.colorName + '">' + escHtml(nom) + '</div>';
  if (adr)           textBlock += '<div style="font-size:' + style.sizeText + 'px;color:' + style.colorText + '">' + escHtml(adr) + '</div>';
  if (contact.length) textBlock += '<div style="font-size:' + (style.sizeText - 1) + 'px;color:' + style.colorText + '">' + escHtml(contact.join(' · ')) + '</div>';
  textBlock += '</div>';

  var sepCss = 'none';
  if (style.separator === 'line')   sepCss = '1px solid ' + style.colorName;
  if (style.separator === 'thick')  sepCss = '2px solid ' + style.colorName;
  if (style.separator === 'double') sepCss = '3px double ' + style.colorName;
  if (style.separator === 'dashed') sepCss = '1px dashed ' + style.colorName;

  var inner, wrapAlign;
  if (style.logoPos === 'center') {
    inner = (logoHtml ? '<div style="text-align:center;margin-bottom:6px">' + logoHtml + '</div>' : '') +
            '<div style="text-align:' + style.align + '">' + textBlock.replace('flex:1;', '') + '</div>';
    wrapAlign = '';
  } else {
    var flexDir = (style.logoPos === 'right') ? 'row-reverse' : 'row';
    if (isAr) flexDir = (style.logoPos === 'right') ? 'row' : 'row-reverse';
    inner = '<div style="display:flex;align-items:center;gap:14px;flex-direction:' + flexDir + ';text-align:' + style.align + '">' +
            logoHtml + textBlock + '</div>';
    wrapAlign = '';
  }

  return '<div style="font-family:' + style.font + ';direction:' + dir + ';margin-top:' + style.marginTop + 'mm;padding-bottom:6px;border-bottom:' + sepCss + ';margin-bottom:' + style.marginBottom + 'mm">' + inner + '</div>';
}

// Applique les valeurs courantes des champs de style dans l'aperçu Paramètres
function previewDAHeader() {
  var wrap = document.getElementById('param-da-hdr-preview');
  if (!wrap) return;
  var style = _daReadHeaderStyleFromForm();
  var lang = (document.getElementById('param-da-hdr-prev-lang') || {}).value || 'fr';
  var val = function(id) { var e = document.getElementById(id); return e ? (e.value || '') : ''; };
  var logoImg = document.getElementById('param-da-hdr-logo-preview');
  var override = {
    nomFr: val('param-da-hdr-nom-fr'),
    nomAr: val('param-da-hdr-nom-ar'),
    adrFr: val('param-da-hdr-adr-fr'),
    adrAr: val('param-da-hdr-adr-ar'),
    tel:   val('param-da-hdr-tel'),
    email: val('param-da-hdr-email'),
    logo:  (logoImg && logoImg.src && logoImg.style.display !== 'none') ? logoImg.src : getSetting('cortoba_agence_logo','')
  };
  wrap.innerHTML = _daBuildHeaderHtml(lang, style, override);
}

function _daReadHeaderStyleFromForm() {
  var v = function(id) { var e = document.getElementById(id); return e ? e.value : ''; };
  var n = function(id) { var x = parseFloat(v(id)); return isNaN(x) ? null : x; };
  var s = Object.assign({}, DA_HDR_STYLE_DEFAULTS);
  if (v('param-da-hdr-font'))       s.font       = v('param-da-hdr-font');
  if (n('param-da-hdr-size-name') !== null) s.sizeName = n('param-da-hdr-size-name');
  if (n('param-da-hdr-size-text') !== null) s.sizeText = n('param-da-hdr-size-text');
  if (v('param-da-hdr-color-name')) s.colorName  = v('param-da-hdr-color-name');
  if (v('param-da-hdr-color-text')) s.colorText  = v('param-da-hdr-color-text');
  if (v('param-da-hdr-weight'))     s.weight     = v('param-da-hdr-weight');
  if (v('param-da-hdr-logo-pos'))   s.logoPos    = v('param-da-hdr-logo-pos');
  if (n('param-da-hdr-logo-size') !== null) s.logoSize = n('param-da-hdr-logo-size');
  if (v('param-da-hdr-align'))      s.align      = v('param-da-hdr-align');
  if (n('param-da-hdr-mt') !== null) s.marginTop = n('param-da-hdr-mt');
  if (n('param-da-hdr-mb') !== null) s.marginBottom = n('param-da-hdr-mb');
  if (v('param-da-hdr-sep'))        s.separator  = v('param-da-hdr-sep');
  if (n('param-da-hdr-lh') !== null) s.lineHeight = n('param-da-hdr-lh');
  return s;
}

function _daWriteHeaderStyleToForm(s) {
  var set = function(id, val) { var e = document.getElementById(id); if (e) e.value = val; };
  set('param-da-hdr-font',       s.font);
  set('param-da-hdr-size-name',  s.sizeName);
  set('param-da-hdr-size-text',  s.sizeText);
  set('param-da-hdr-color-name', s.colorName);
  set('param-da-hdr-color-text', s.colorText);
  set('param-da-hdr-weight',     s.weight);
  set('param-da-hdr-logo-pos',   s.logoPos);
  set('param-da-hdr-logo-size',  s.logoSize);
  set('param-da-hdr-align',      s.align);
  set('param-da-hdr-mt',         s.marginTop);
  set('param-da-hdr-mb',         s.marginBottom);
  set('param-da-hdr-sep',        s.separator);
  set('param-da-hdr-lh',         s.lineHeight);
}

function resetDAHeaderStyle() {
  if (!confirm('Réinitialiser le style de l\'en-tête ?')) return;
  saveSetting('cortoba_agence_header_style', null);
  _daWriteHeaderStyleToForm(DA_HDR_STYLE_DEFAULTS);
  previewDAHeader();
  showToast('Style réinitialisé');
}

function saveDAHeader() {
  saveSetting('cortoba_agence_raison',    (document.getElementById('param-da-hdr-nom-fr').value || '').trim());
  saveSetting('cortoba_agence_raison_ar', (document.getElementById('param-da-hdr-nom-ar').value || '').trim());
  saveSetting('cortoba_agence_adresse',   (document.getElementById('param-da-hdr-adr-fr').value || '').trim());
  saveSetting('cortoba_agence_adresse_ar',(document.getElementById('param-da-hdr-adr-ar').value || '').trim());
  saveSetting('cortoba_agence_tel',       (document.getElementById('param-da-hdr-tel').value || '').trim());
  saveSetting('cortoba_agence_email',     (document.getElementById('param-da-hdr-email').value || '').trim());
  saveSetting('cortoba_agence_header_style', _daReadHeaderStyleFromForm());
  previewDAHeader();
  showToast('En-tête enregistré');
}

function _daReadFileAsDataURL(file, cb) {
  var r = new FileReader();
  r.onload = function(e) { cb(e.target.result); };
  r.readAsDataURL(file);
}

function uploadDAHeaderLogo(input) {
  var f = input.files && input.files[0];
  if (!f) return;
  if (f.size > 2 * 1024 * 1024) { alert('Logo trop volumineux (max 2 Mo).'); input.value = ''; return; }
  _daReadFileAsDataURL(f, function(dataUrl) {
    saveSetting('cortoba_agence_logo', dataUrl);
    var img = document.getElementById('param-da-hdr-logo-preview');
    if (img) { img.src = dataUrl; img.style.display = 'inline-block'; }
    showToast('Logo enregistré');
  });
}
function clearDAHeaderLogo() {
  saveSetting('cortoba_agence_logo', '');
  var img = document.getElementById('param-da-hdr-logo-preview');
  if (img) { img.src = ''; img.style.display = 'none'; }
  var f = document.getElementById('param-da-hdr-logo-file'); if (f) f.value = '';
  showToast('Logo retiré');
}

function uploadDACachet(input) {
  if (!_daIsGerant()) { alert('Seul un Architecte gérant peut définir le cachet.'); input.value = ''; return; }
  var f = input.files && input.files[0];
  if (!f) return;
  if (f.size > 2 * 1024 * 1024) { alert('Image trop volumineuse (max 2 Mo).'); input.value = ''; return; }
  _daReadFileAsDataURL(f, function(dataUrl) {
    saveSetting('cortoba_cachet_signature', dataUrl);
    var img = document.getElementById('param-da-cachet-preview');
    if (img) { img.src = dataUrl; img.style.display = 'inline-block'; }
    showToast('Cachet enregistré');
  });
}
function clearDACachet() {
  if (!_daIsGerant()) { alert('Seul un Architecte gérant peut modifier le cachet.'); return; }
  saveSetting('cortoba_cachet_signature', '');
  var img = document.getElementById('param-da-cachet-preview');
  if (img) { img.src = ''; img.style.display = 'none'; }
  var f = document.getElementById('param-da-cachet-file'); if (f) f.value = '';
  showToast('Cachet retiré');
}

function renderDemandesAdminPage() {
  loadDemandesAdmin().then(function(data) {
    _renderDAKPIs(data);
    _renderDAList(data);
    _populateDAFilterAdmin();
  });
}

function _populateDAFilterAdmin() {
  var sel = document.getElementById('da-filter-admin');
  if (!sel || sel.options.length > 1) return;
  getDAAdmins().forEach(function(a) {
    var o = document.createElement('option');
    o.value = a; o.textContent = a;
    sel.appendChild(o);
  });
}

function _renderDAKPIs(data) {
  var wrap = document.getElementById('da-kpis');
  if (!wrap) return;
  var total = data.length;
  var brouillons = data.filter(function(d) { return d.statut === 'Brouillon'; }).length;
  var envoyees = data.filter(function(d) { return d.statut === 'Envoyée'; }).length;
  var repondues = data.filter(function(d) { return d.statut === 'Répondue'; }).length;
  wrap.innerHTML =
    '<div class="journal-kpi"><div class="journal-kpi-val">' + total + '</div><div class="journal-kpi-label">Total</div></div>' +
    '<div class="journal-kpi"><div class="journal-kpi-val" style="color:var(--text-2)">' + brouillons + '</div><div class="journal-kpi-label">Brouillons</div></div>' +
    '<div class="journal-kpi"><div class="journal-kpi-val" style="color:var(--blue)">' + envoyees + '</div><div class="journal-kpi-label">Envoyées</div></div>' +
    '<div class="journal-kpi"><div class="journal-kpi-val" style="color:var(--green)">' + repondues + '</div><div class="journal-kpi-label">Répondues</div></div>';
}

function _renderDAList(data) {
  var wrap = document.getElementById('da-list');
  if (!wrap) return;

  var fAdmin = document.getElementById('da-filter-admin');
  var fStatut = document.getElementById('da-filter-statut');
  var filterAdmin = fAdmin ? fAdmin.value : '';
  var filterStatut = fStatut ? fStatut.value : '';

  var filtered = data.filter(function(d) {
    if (filterAdmin && d.administration !== filterAdmin) return false;
    if (filterStatut && d.statut !== filterStatut) return false;
    return true;
  });

  if (filtered.length === 0) {
    wrap.innerHTML = '<div class="card" style="text-align:center;color:var(--text-3);padding:2rem">Aucune demande administrative.<br><button class="btn btn-primary btn-sm" style="margin-top:0.8rem" onclick="openDemandeAdminModal()">Créer une demande</button></div>';
    return;
  }

  var html = '<div class="card"><div class="table-wrap"><table><thead><tr>';
  html += '<th>Date</th><th>Type</th><th>Administration</th><th>Objet</th><th>Projet</th><th>Langue</th><th>Statut</th><th style="width:80px"></th>';
  html += '</tr></thead><tbody>';

  filtered.forEach(function(d) {
    var statutColor = d.statut === 'Envoyée' ? 'var(--blue)' : d.statut === 'Répondue' ? 'var(--green)' : d.statut === 'Classée' ? 'var(--text-3)' : 'var(--text-2)';
    var langLabel = d.langue === 'ar' ? 'AR' : 'FR';
    html += '<tr style="cursor:pointer" onclick="editDemandeAdmin(\'' + d.id + '\')">';
    html += '<td style="font-family:var(--mono);font-size:0.8rem;white-space:nowrap">' + fmtDate(d.date_demande) + '</td>';
    html += '<td>' + escHtml(d.type_demande || '') + '</td>';
    html += '<td>' + escHtml(d.administration || '') + '</td>';
    html += '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(d.objet || '') + '</td>';
    html += '<td style="font-size:0.78rem;color:var(--text-2)">' + escHtml(d.projet_nom || d.projet_code || '—') + '</td>';
    html += '<td style="text-align:center"><span class="badge" style="font-size:0.68rem">' + langLabel + '</span></td>';
    html += '<td><span class="badge" style="color:' + statutColor + '">' + escHtml(d.statut) + '</span></td>';
    html += '<td style="text-align:right">';
    html += '<button class="btn btn-sm" style="padding:0.2rem 0.4rem;font-size:0.72rem" onclick="event.stopPropagation();deleteDemandeAdmin(\'' + d.id + '\')">Suppr.</button>';
    html += '</td>';
    html += '</tr>';
  });

  html += '</tbody></table></div></div>';
  wrap.innerHTML = html;
}

function openDemandeAdminModal(data) {
  document.getElementById('da-edit-id').value = data ? data.id : '';
  document.getElementById('modal-da-title').textContent = data ? 'Modifier la demande' : 'Nouvelle demande administrative';
  document.getElementById('da-date').value = data ? (data.date_demande || '') : new Date().toISOString().split('T')[0];
  document.getElementById('da-langue').value = data ? (data.langue || 'fr') : 'fr';
  document.getElementById('da-objet').value = data ? (data.objet || '') : '';
  document.getElementById('da-contenu').value = data ? (data.contenu || '') : '';
  document.getElementById('da-expediteur').value = data ? (data.expediteur || '') : getSetting('cortoba_agence_raison', 'Cortoba Architecture Studio');
  document.getElementById('da-destinataire').value = data ? (data.destinataire || '') : '';
  document.getElementById('da-reference').value = data ? (data.reference || '') : '';
  // Migration douce : anciens statuts "Réponse reçue (positive/négative)" → statut unique + reponse_type
  var _rawStatut = data ? (data.statut || 'Brouillon') : 'Brouillon';
  var _autoReponse = '';
  if (_rawStatut.indexOf('Réponse reçue') === 0) {
    if (_rawStatut.indexOf('positive') !== -1) _autoReponse = 'positive';
    else if (_rawStatut.indexOf('négative') !== -1 || _rawStatut.indexOf('negative') !== -1) _autoReponse = 'negative';
    _rawStatut = 'Réponse reçue';
  }
  // Anciens "Envoyée" → "Déposé" / "Répondue" → "Réponse reçue"
  if (_rawStatut === 'Envoyée') _rawStatut = 'Déposé';
  if (_rawStatut === 'Répondue') _rawStatut = 'Réponse reçue';
  document.getElementById('da-statut').value = _rawStatut;
  document.getElementById('da-remarques').value = data ? (data.remarques || '') : '';

  // v3 : workflow DA
  var dEl = document.getElementById('da-date-depot'); if (dEl) dEl.value = (data && data.date_depot) || '';
  var jEl = document.getElementById('da-justificatif-current');
  if (jEl) jEl.innerHTML = (data && data.justificatif_url) ? '<a href="'+data.justificatif_url+'" target="_blank" style="color:var(--accent)">📎 Justificatif actuel</a>' : '';
  var rEl = document.getElementById('da-reponse-type'); if (rEl) rEl.value = (data && data.reponse_type) || _autoReponse;
  window._daCurrentEdit = data || null;
  _daRenderManquants(data);
  _daRefreshWorkflow();
  // Hook change listener une seule fois
  var sSel = document.getElementById('da-statut');
  if (sSel && !sSel._daHooked) { sSel.addEventListener('change', _daRefreshWorkflow); sSel._daHooked = true; }

  _populateDASelect('da-type', getDATypes(), data ? data.type_demande : '');
  _populateDASelectSorted('da-administration', getDAAdmins(), data ? data.administration : '', false, 'da_recent_admins');
  _populateDASelectSorted('da-gouvernorat',    getDAGouvs(),  data ? data.gouvernorat  : '', true, 'da_recent_gouvs');
  _populateDASelectSorted('da-delegation',     getDADelegs(), data ? data.delegation   : '', true, 'da_recent_delegs');
  _populateDASelectSorted('da-municipalite',   getDAMunis(),  data ? data.municipalite : '', true, 'da_recent_munis');

  // Clients (avec recherche)
  _daPopulateClients(data ? data.client_id : '');

  // Projets : filtrés par client si client_id présent
  _daPopulateProjets(data ? data.projet_id : '', data ? data.client_id : '');

  // Historique objets → datalist
  var dl = document.getElementById('da-objet-list');
  if (dl) {
    dl.innerHTML = '';
    getDAObjets().forEach(function(o) {
      var opt = document.createElement('option');
      opt.value = o;
      dl.appendChild(opt);
    });
  }

  // En-tête agence preview
  _renderDAHeaderPreview(document.getElementById('da-langue').value);

  // Cachet section visible pour gérants uniquement
  var cachetWrap = document.getElementById('da-cachet-wrap');
  if (cachetWrap) cachetWrap.style.display = _daIsGerant() ? '' : 'none';
  _daRefreshCachetState(data);

  _renderDADocsChecklist(data);
  toggleDALangue();
  openModal('modal-demande-admin');
}

// Remplit le select des projets — si clientId fourni, seuls les projets de ce client sont listés
function _daPopulateProjets(selectedProjetId, clientId) {
  var pSel = document.getElementById('da-projet');
  if (!pSel) return;
  pSel.innerHTML = '<option value="">-- Aucun --</option>';
  var all = getProjets() || [];

  var filtered = all;
  if (clientId) {
    var client = (getClients() || []).find(function(c) { return c.id === clientId; });
    var clientDisplay = client ? (client.display_nom || client.displayNom || client.nom || client.raison || '') : '';
    filtered = all.filter(function(p) {
      if (p.client_id && p.client_id === clientId) return true;
      if (p.clientId && p.clientId === clientId)   return true;
      if (clientDisplay && p.client && String(p.client).trim() === String(clientDisplay).trim()) return true;
      return false;
    });
  }

  filtered.forEach(function(p) {
    var o = document.createElement('option');
    o.value = p.id;
    o.textContent = (p.code ? p.code + ' — ' : '') + p.nom;
    o.setAttribute('data-client-id', p.client_id || p.clientId || '');
    if (selectedProjetId && p.id === selectedProjetId) o.selected = true;
    pSel.appendChild(o);
  });
}

// Remplit le select des clients en appliquant la recherche courante
function _daPopulateClients(selectedClientId) {
  var cSel = document.getElementById('da-client');
  if (!cSel) return;
  _daEnsureClientSearch();
  var q = ((document.getElementById('da-client-search') || {}).value || '').trim().toLowerCase();
  cSel.innerHTML = '<option value="">-- Aucun --</option>';
  var list = (getClients() || []).slice().sort(function(a, b) {
    return String(a.display_nom || a.nom || '').localeCompare(String(b.display_nom || b.nom || ''), 'fr', { sensitivity: 'base' });
  });
  if (q) {
    list = list.filter(function(c) {
      var hay = ((c.code || '') + ' ' + (c.display_nom || '') + ' ' + (c.nom || '') + ' ' + (c.raison || '') + ' ' + (c.email || '') + ' ' + (c.tel || '')).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }
  list.forEach(function(c) {
    var o = document.createElement('option');
    o.value = c.id;
    o.textContent = (c.code ? c.code + ' — ' : '') + (c.display_nom || c.nom || c.raison || '—');
    if (selectedClientId && c.id === selectedClientId) o.selected = true;
    cSel.appendChild(o);
  });
  var info = document.getElementById('da-client-count');
  if (info) info.textContent = list.length + ' client(s)';
}

// Injecte (une seule fois) un input de recherche au-dessus du select client
function _daEnsureClientSearch() {
  if (document.getElementById('da-client-search')) return;
  var cSel = document.getElementById('da-client');
  if (!cSel) return;
  var wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;gap:0.4rem;align-items:center;margin-bottom:0.3rem';
  wrap.innerHTML =
    '<input id="da-client-search" class="form-input" placeholder="Rechercher un client…" style="flex:1;font-size:0.8rem" />' +
    '<span id="da-client-count" style="font-size:0.72rem;color:var(--text-3);white-space:nowrap"></span>';
  cSel.parentNode.insertBefore(wrap, cSel);
  document.getElementById('da-client-search').addEventListener('input', function() {
    var current = cSel.value;
    _daPopulateClients(current);
  });
}

function _daOnClientChange() {
  var cSel = document.getElementById('da-client');
  var pSel = document.getElementById('da-projet');
  if (!cSel || !pSel) return;
  var cid = cSel.value;
  // Si la sélection courante n'appartient pas au nouveau client, on la conserve uniquement si cid vide
  var currentProjet = pSel.value;
  if (cid) {
    var current = pSel.options[pSel.selectedIndex];
    if (!current || current.getAttribute('data-client-id') !== cid) currentProjet = '';
  }
  _daPopulateProjets(currentProjet, cid || null);

  // Si un seul projet pour ce client et aucun sélectionné → auto-sélection
  if (cid && !pSel.value && pSel.options.length === 2) {
    pSel.selectedIndex = 1;
  }
}

function _renderDAHeaderPreview(lang) {
  var wrap = document.getElementById('da-header-preview');
  if (!wrap) return;
  wrap.innerHTML = _daBuildHeaderHtml(lang, getDAHeaderStyle());
  wrap.style.display = '';
  wrap.style.background = '#fff';
  wrap.style.color = '#222';
}

// État courant du cachet sur la demande en cours (on stocke dans une remarque ?
// Non : on stocke dans une variable et on l'applique au print. On peut aussi marquer via un flag en remarques.
// Ici : on utilise un attribut DOM sur le modal.
function _daRefreshCachetState(data) {
  var wrap = document.getElementById('da-cachet-wrap');
  if (!wrap) return;
  // Flag : la présence du marqueur dans remarques ou un champ spécifique → on lit depuis data.remarques si contient [CACHET]
  var on = false;
  if (data && typeof data.remarques === 'string' && data.remarques.indexOf('[CACHET]') !== -1) on = true;
  wrap.setAttribute('data-cachet-on', on ? '1' : '0');
  var btn = document.getElementById('da-cachet-btn');
  var status = document.getElementById('da-cachet-status');
  var preview = document.getElementById('da-cachet-preview');
  var cachetImg = getSetting('cortoba_cachet_signature','');
  if (btn) btn.textContent = on ? 'Retirer le cachet' : 'Ajouter cachet & signature';
  if (status) {
    if (!cachetImg) status.textContent = 'Aucun cachet défini dans Paramètres.';
    else status.textContent = on ? 'Cachet activé pour cette lettre.' : '';
  }
  if (preview) {
    preview.innerHTML = (on && cachetImg) ? '<img src="' + cachetImg + '" alt="cachet" style="max-height:90px;background:transparent" />' : '';
  }
}

function toggleDACachet() {
  if (!_daIsGerant()) { alert('Seul un Architecte gérant peut apposer le cachet.'); return; }
  var cachetImg = getSetting('cortoba_cachet_signature','');
  if (!cachetImg) { alert('Aucun cachet défini. Allez dans Paramètres → Demandes administratives pour en ajouter un.'); return; }
  var wrap = document.getElementById('da-cachet-wrap');
  var on = wrap.getAttribute('data-cachet-on') === '1';
  on = !on;
  wrap.setAttribute('data-cachet-on', on ? '1' : '0');

  // Synchroniser avec le champ remarques (marqueur [CACHET])
  var rem = document.getElementById('da-remarques');
  var val = (rem.value || '').replace(/\s*\[CACHET\]\s*/g, '').trim();
  if (on) val = (val ? val + ' ' : '') + '[CACHET]';
  rem.value = val;

  _daRefreshCachetState({ remarques: rem.value });
}

function _populateDASelect(selectId, items, selected, allowEmpty) {
  var sel = document.getElementById(selectId);
  sel.innerHTML = allowEmpty ? '<option value="">-- Aucun(e) --</option>' : '<option value="">-- Choisir --</option>';
  items.forEach(function(v) {
    var o = document.createElement('option');
    o.value = v; o.textContent = v;
    if (v === selected) o.selected = true;
    sel.appendChild(o);
  });
}

// Variante tri alphabétique + épinglage des récents en haut
function _populateDASelectSorted(selectId, items, selected, allowEmpty, recentsKey) {
  var sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = allowEmpty ? '<option value="">-- Aucun(e) --</option>' : '<option value="">-- Choisir --</option>';

  var recents = (getSetting(recentsKey, []) || []).filter(function(v) { return items.indexOf(v) !== -1; });
  var others  = items.slice().filter(function(v) { return recents.indexOf(v) === -1; });
  others.sort(function(a, b) { return String(a).localeCompare(String(b), 'fr', { sensitivity: 'base' }); });

  if (recents.length) {
    var gR = document.createElement('optgroup');
    gR.label = '★ Récents';
    recents.forEach(function(v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v;
      if (v === selected) o.selected = true;
      gR.appendChild(o);
    });
    sel.appendChild(gR);
    var gO = document.createElement('optgroup');
    gO.label = 'Tous';
    others.forEach(function(v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v;
      if (v === selected) o.selected = true;
      gO.appendChild(o);
    });
    sel.appendChild(gO);
  } else {
    others.forEach(function(v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v;
      if (v === selected) o.selected = true;
      sel.appendChild(o);
    });
  }
}

// Pousse une valeur en tête des récents (max 5)
function _daPushRecent(key, val) {
  if (!val) return;
  var list = (getSetting(key, []) || []).filter(function(v) { return v !== val; });
  list.unshift(val);
  if (list.length > 5) list = list.slice(0, 5);
  saveSetting(key, list);
}

function _renderDADocsChecklist(data) {
  var wrap = document.getElementById('da-docs-checklist');
  if (!wrap) return;
  var docs = getDADocs();
  var checked = [];
  if (data && data.documents_joints) {
    try { checked = typeof data.documents_joints === 'string' ? JSON.parse(data.documents_joints) : data.documents_joints; }
    catch(e) { checked = []; }
  }
  if (!Array.isArray(checked)) checked = [];
  var html = '';
  docs.forEach(function(doc) {
    var isChecked = checked.indexOf(doc) !== -1 ? 'checked' : '';
    html += '<label style="display:flex;align-items:center;gap:0.35rem;font-size:0.8rem;cursor:pointer;padding:0.25rem 0">';
    html += '<input type="checkbox" class="da-doc-check" value="' + escHtml(doc) + '" ' + isChecked + ' />';
    html += escHtml(doc);
    html += '</label>';
  });
  wrap.innerHTML = html;
}

function toggleDALangue() {
  var lang = document.getElementById('da-langue').value;
  var contenu = document.getElementById('da-contenu');
  var objet = document.getElementById('da-objet');
  if (lang === 'ar') {
    contenu.style.direction = 'rtl';
    contenu.style.textAlign = 'right';
    contenu.style.fontFamily = "'Noto Sans Arabic', 'Amiri', 'Traditional Arabic', serif";
    objet.style.direction = 'rtl';
    objet.style.textAlign = 'right';
  } else {
    contenu.style.direction = 'ltr';
    contenu.style.textAlign = 'left';
    contenu.style.fontFamily = '';
    objet.style.direction = 'ltr';
    objet.style.textAlign = 'left';
  }
  _renderDAHeaderPreview(lang);
}

function editDemandeAdmin(id) {
  var d = _daCache.find(function(x) { return x.id === id; });
  if (!d) return;
  openDemandeAdminModal(d);
}

function saveDemandeAdmin() {
  var id = document.getElementById('da-edit-id').value;
  var clientEl = document.getElementById('da-client');
  var body = {
    type_demande:   document.getElementById('da-type').value,
    langue:         document.getElementById('da-langue').value,
    administration: document.getElementById('da-administration').value,
    gouvernorat:    document.getElementById('da-gouvernorat').value || null,
    delegation:     document.getElementById('da-delegation').value || null,
    municipalite:   document.getElementById('da-municipalite').value || null,
    projet_id:      document.getElementById('da-projet').value || null,
    client_id:      (clientEl && clientEl.value) ? clientEl.value : null,
    objet:          document.getElementById('da-objet').value,
    contenu:        document.getElementById('da-contenu').value,
    expediteur:     document.getElementById('da-expediteur').value,
    destinataire:   document.getElementById('da-destinataire').value,
    reference:      document.getElementById('da-reference').value,
    date_demande:   document.getElementById('da-date').value,
    statut:         document.getElementById('da-statut').value,
    remarques:      document.getElementById('da-remarques').value,
    date_depot:     (document.getElementById('da-date-depot')||{}).value || null,
    reponse_type:   (document.getElementById('da-reponse-type')||{}).value || null,
    documents_manquants: (function(){
      var arr = [];
      document.querySelectorAll('.da-manquant-check').forEach(function(cb){
        if (cb.checked) arr.push(cb.value);
      });
      return arr;
    })(),
    documents_joints: []
  };
  // Justificatif URL (si déjà uploadé dans _daCurrentEdit)
  if (window._daCurrentEdit && window._daCurrentEdit.justificatif_url) {
    body.justificatif_url = window._daCurrentEdit.justificatif_url;
  }

  document.querySelectorAll('.da-doc-check:checked').forEach(function(cb) {
    body.documents_joints.push(cb.value);
  });

  if (!body.type_demande)   { alert('Choisissez un type de demande.'); return; }
  if (!body.administration) { alert('Choisissez une administration.'); return; }
  if (!body.objet)          { alert('Saisissez l\'objet de la demande.'); return; }

  // Sauvegarder l'objet dans l'historique + épingler les choix utilisés
  _daSaveObjetHistory(body.objet);
  _daPushRecent('da_recent_admins', body.administration);
  _daPushRecent('da_recent_gouvs',  body.gouvernorat);
  _daPushRecent('da_recent_delegs', body.delegation);
  _daPushRecent('da_recent_munis',  body.municipalite);

  var url = id ? 'api/demandes_admin.php?id=' + id : 'api/demandes_admin.php';
  var method = id ? 'PUT' : 'POST';

  apiFetch(url, { method: method, body: body })
    .then(function() {
      closeModal('modal-demande-admin');
      showToast(id ? 'Demande mise à jour' : 'Demande créée');
      renderDemandesAdminPage();
    })
    .catch(function(e) { alert('Erreur : ' + (e.message || e)); });
}

function deleteDemandeAdmin(id) {
  if (!confirm('Supprimer cette demande ?')) return;
  apiFetch('api/demandes_admin.php?id=' + id, { method: 'DELETE' })
    .then(function() {
      showToast('Demande supprimée');
      renderDemandesAdminPage();
    })
    .catch(function(e) { alert('Erreur : ' + (e.message || e)); });
}

function generateDALetter() {
  var lang  = document.getElementById('da-langue').value;
  var type  = document.getElementById('da-type').value;
  var admin = document.getElementById('da-administration').value;
  var gouv  = document.getElementById('da-gouvernorat').value;
  var deleg = document.getElementById('da-delegation').value;
  var muni  = document.getElementById('da-municipalite').value;
  var objet = document.getElementById('da-objet').value;
  var exped = document.getElementById('da-expediteur').value;
  var dest  = document.getElementById('da-destinataire').value;
  var ref   = document.getElementById('da-reference').value;
  var date  = document.getElementById('da-date').value;
  var projet = document.getElementById('da-projet');
  var projetText = projet.selectedIndex > 0 ? projet.options[projet.selectedIndex].text : '';

  var clientEl = document.getElementById('da-client');
  var clientText = (clientEl && clientEl.selectedIndex > 0) ? clientEl.options[clientEl.selectedIndex].text : '';

  var docs = [];
  document.querySelectorAll('.da-doc-check:checked').forEach(function(cb) { docs.push(cb.value); });

  var ctx = { type:type, admin:admin, gouv:gouv, deleg:deleg, muni:muni, objet:objet, exped:exped,
              dest:dest, ref:ref, date:date, projet:projetText, client:clientText, docs:docs };

  var contenuEl = document.getElementById('da-contenu');
  contenuEl.value = (lang === 'ar') ? _generateLetterAR(ctx) : _generateLetterFR(ctx);
  toggleDALangue();
}

// Détecte la catégorie de l'administration pour choisir le bon corps de lettre
function _daAdminCategory(admin) {
  var a = (admin || '').toLowerCase();
  if (a.indexOf('municipal') !== -1)                                 return 'municipalite';
  if (a.indexOf('crda') !== -1 || a.indexOf('fonci') !== -1 || a.indexOf('domaines') !== -1) return 'domanial';
  if (a.indexOf('steg') !== -1 || a.indexOf('sonede') !== -1 || a.indexOf('onas') !== -1)   return 'concessionnaire';
  if (a.indexOf('ministère') !== -1 || a.indexOf('ministere') !== -1 || a.indexOf('inp') !== -1 || a.indexOf('aliph') !== -1 || a.indexOf('apal') !== -1) return 'ministere';
  if (a.indexOf('gouvernorat') !== -1 || a.indexOf('délégation') !== -1 || a.indexOf('delegation') !== -1) return 'autorite';
  if (a.indexOf('protection civile') !== -1)                         return 'concessionnaire';
  return 'generique';
}

function _generateLetterFR(c) {
  var lieu = c.muni || c.deleg || c.gouv || 'Djerba';
  lieu = String(lieu).replace(/^Municipalité (de |d'|d\u2019)/i,'').replace(/^Délégation (de |d'|d\u2019)/i,'');
  var dateStr = '';
  try { dateStr = c.date ? new Date(c.date + 'T00:00:00').toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' }) : ''; } catch(e) { dateStr = c.date || ''; }

  var cat = _daAdminCategory(c.admin);
  var destinataire = c.dest || (cat === 'municipalite' ? 'Monsieur le Président de la Commune'
                              : cat === 'autorite'     ? 'Monsieur le Gouverneur'
                              : cat === 'ministere'    ? 'Monsieur le Ministre'
                              : 'Monsieur le Directeur');

  var L = '';
  L += lieu + ', le ' + dateStr + '\n\n';
  L += c.exped + '\n';
  if (c.ref) L += 'Réf. : ' + c.ref + '\n';
  L += '\n';
  L += 'À\n' + destinataire + '\n';
  L += c.admin;
  if (c.gouv && c.admin.indexOf(c.gouv) === -1) L += ' — ' + c.gouv;
  L += '\n';
  if (c.deleg && cat === 'autorite') L += 'Délégation de ' + c.deleg + '\n';
  L += '\n';
  L += 'Objet : ' + c.objet + '\n';
  if (c.projet) L += 'Projet : ' + c.projet + '\n';
  if (c.client) L += 'Maître d\'ouvrage : ' + c.client + '\n';
  L += '\n';
  L += destinataire + ',\n\n';

  // Corps selon la catégorie (templates extraits des documents Drive)
  var typeLower = (c.type || 'demande').toLowerCase();
  if (cat === 'municipalite') {
    L += 'J\'ai l\'honneur, en ma qualité d\'architecte mandaté par ' + (c.client || 'le maître d\'ouvrage') + ', de solliciter de votre haute bienveillance ' + typeLower + ' ';
    L += 'concernant ' + (c.objet || '...').toLowerCase() + (c.projet ? ', dans le cadre du projet « ' + c.projet + ' »' : '') + '.\n\n';
    L += 'Le dossier technique correspondant, établi conformément à la réglementation en vigueur et aux prescriptions du plan d\'aménagement urbain, est joint à la présente.\n\n';
    L += 'Je reste à votre entière disposition pour tout complément d\'information ou pièce complémentaire qui pourrait vous être utile à l\'instruction du dossier.\n\n';
  } else if (cat === 'concessionnaire') {
    L += 'J\'ai l\'honneur de solliciter de vos services ' + typeLower + ' ';
    L += 'relative à ' + (c.objet || '...').toLowerCase() + (c.projet ? ', pour le projet « ' + c.projet + ' »' : '') + '.\n\n';
    L += 'Vous trouverez ci-joint l\'ensemble des pièces requises pour l\'étude de cette demande.\n\n';
    L += 'Je vous serais reconnaissant de bien vouloir donner suite à cette demande dans les meilleurs délais afin de nous permettre de poursuivre l\'avancement des travaux.\n\n';
  } else if (cat === 'domanial') {
    L += 'J\'ai l\'honneur, au nom de ' + (c.client || 'mon mandant') + ', de solliciter de vos services ' + typeLower + ' ';
    L += 'portant sur ' + (c.objet || '...').toLowerCase() + (c.projet ? ' dans le cadre du projet « ' + c.projet + ' »' : '') + '.\n\n';
    L += 'Les documents justificatifs et le dossier technique sont joints à la présente en vue de l\'instruction du dossier.\n\n';
  } else if (cat === 'ministere') {
    L += 'J\'ai l\'honneur de porter à la haute connaissance de Votre Excellence ' + typeLower + ' ';
    L += 'relative à ' + (c.objet || '...').toLowerCase() + (c.projet ? ', dans le cadre du projet « ' + c.projet + ' »' : '') + '.\n\n';
    L += 'Compte tenu de l\'intérêt du projet et de sa conformité aux orientations de votre département, je sollicite votre bienveillante attention pour l\'examen de ce dossier.\n\n';
  } else if (cat === 'autorite') {
    L += 'J\'ai l\'honneur de soumettre à votre haute appréciation ' + typeLower + ' ';
    L += 'concernant ' + (c.objet || '...').toLowerCase() + (c.projet ? ', relative au projet « ' + c.projet + ' »' : '') + '.\n\n';
    L += 'Le dossier complet accompagnant la présente est établi conformément aux textes réglementaires en vigueur.\n\n';
  } else {
    L += 'J\'ai l\'honneur de vous adresser la présente ' + typeLower + ' ';
    L += 'relative à ' + (c.objet || '...').toLowerCase() + (c.projet ? ', concernant le projet « ' + c.projet + ' »' : '') + '.\n\n';
  }

  L += 'Dans l\'attente d\'une suite favorable, je vous prie d\'agréer, ' + destinataire + ', l\'expression de ma haute considération.\n\n';
  L += '\n' + c.exped + '\n';
  L += 'Architecte\n';

  if (c.docs && c.docs.length > 0) {
    L += '\n──────────────────────────\n';
    L += 'Pièces jointes :\n';
    c.docs.forEach(function(d, i) { L += '• ' + d + '\n'; });
  }
  return L;
}

function _generateLetterAR(c) {
  var dateStr = '';
  try { dateStr = c.date ? new Date(c.date + 'T00:00:00').toLocaleDateString('ar-TN', { day:'numeric', month:'long', year:'numeric' }) : ''; } catch(e) { dateStr = c.date || ''; }
  var lieu = c.muni || c.deleg || c.gouv || 'جربة';
  lieu = String(lieu).replace(/^Municipalité (de |d'|d\u2019)/i,'').replace(/^Délégation (de |d'|d\u2019)/i,'');

  var typeMap = {
    'Demande d\'avis': 'مطلب في الحصول على رأي',
    'Demande d\'accord de principe': 'مطلب في الحصول على موافقة مبدئية',
    'Demande d\'autorisation': 'مطلب في الحصول على ترخيص',
    'Demande de permis de bâtir': 'مطلب في الحصول على رخصة بناء',
    'Demande de raccordement': 'مطلب ربط',
    'Demande de certificat': 'مطلب في الحصول على شهادة',
    'Demande de régularisation': 'مطلب في تسوية وضعية',
    'Demande de devis': 'مطلب تقدير',
    'Demande d\'intervention': 'مطلب تدخّل',
    'Demande de renseignements': 'مطلب إرشادات',
    'Lettre de relance': 'مكتوب تذكير',
    'Réclamation': 'مكتوب تظلّم'
  };
  var typeAR = typeMap[c.type] || c.type || 'مطلب';

  var adminMap = {
    'STEG': 'الشركة التونسية للكهرباء والغاز',
    'SONEDE': 'الشركة الوطنية لاستغلال وتوزيع المياه',
    'ONAS': 'الديوان الوطني للتطهير',
    'Municipalité': 'البلدية',
    'Protection civile': 'الحماية المدنية',
    'Gouvernorat': 'الولاية',
    'Délégation': 'المعتمدية',
    'Ministère de l\'Équipement et de l\'Habitat': 'وزارة التجهيز والإسكان',
    'Ministère des Domaines de l\'État': 'وزارة أملاك الدولة والشؤون العقارية',
    'INP — Institut National du Patrimoine': 'المعهد الوطني للتراث',
    'ALIPH': 'التحالف الدولي لحماية التراث في مناطق النزاعات',
    'APAL': 'وكالة حماية وتهيئة الشريط الساحلي',
    'CRDA': 'المندوبية الجهوية للتنمية الفلاحية',
    'Tribunal immobilier': 'المحكمة العقارية',
    'Conservation foncière': 'إدارة الملكية العقارية',
    'Direction régionale de l\'urbanisme': 'الإدارة الجهوية للتعمير'
  };
  var adminAR = adminMap[c.admin] || c.admin;
  var cat = _daAdminCategory(c.admin);

  var destAR = c.dest || (cat === 'municipalite' ? 'السيد رئيس البلدية'
                        : cat === 'autorite'     ? 'السيد الوالي'
                        : cat === 'ministere'    ? 'السيد الوزير'
                        : 'السيد المدير');

  var L = '';
  L += lieu + '، في ' + dateStr + '\n\n';
  L += 'من: ' + c.exped + '\n';
  if (c.ref) L += 'المرجع: ' + c.ref + '\n';
  L += '\n';
  L += 'إلى\n' + destAR + '\n';
  L += adminAR + '\n';
  if (c.deleg && cat === 'autorite') L += 'معتمدية ' + c.deleg + '\n';
  L += '\n';
  L += 'الموضوع: ' + c.objet + '\n';
  if (c.projet) L += 'المشروع: ' + c.projet + '\n';
  if (c.client) L += 'صاحب المشروع: ' + c.client + '\n';
  L += '\n';
  L += 'تحية طيبة وبعد،\n\n';

  if (cat === 'municipalite') {
    L += 'يشرّفني، بصفتي مهندسا معماريا مكلّفا من طرف ' + (c.client || 'صاحب المشروع') + '، أن أتقدّم إلى سيادتكم بـ' + typeAR + ' ';
    L += 'يتعلّق بـ' + (c.objet || '...') + (c.projet ? '، في إطار مشروع « ' + c.projet + ' »' : '') + '.\n\n';
    L += 'وقد تمّ إعداد الملف الفنّي المرفق طبق التراتيب الجاري بها العمل وبما يتماشى مع مقتضيات مثال التهيئة العمرانية.\n\n';
    L += 'وأبقى على ذمّتكم لتقديم أيّ إيضاحات أو وثائق تكميلية قد تستلزمها دراسة الملف.\n\n';
  } else if (cat === 'concessionnaire') {
    L += 'يشرّفني أن أتقدّم إلى مصالحكم بـ' + typeAR + ' ';
    L += 'يتعلّق بـ' + (c.objet || '...') + (c.projet ? '، في إطار مشروع « ' + c.projet + ' »' : '') + '.\n\n';
    L += 'وتجدون رفقته جميع الوثائق المطلوبة لدراسة هذا المطلب.\n\n';
    L += 'أرجو من سيادتكم التكرّم بالاستجابة لهذا الطلب في أقرب الآجال حتى يتسنّى لنا مواصلة إنجاز الأشغال.\n\n';
  } else if (cat === 'domanial') {
    L += 'يشرّفني، باسم ' + (c.client || 'موكّلي') + '، أن أتقدّم إلى مصالحكم بـ' + typeAR + ' ';
    L += 'يتعلّق بـ' + (c.objet || '...') + (c.projet ? ' في إطار مشروع « ' + c.projet + ' »' : '') + '.\n\n';
    L += 'وتجدون رفقته المؤيّدات اللازمة والملف الفنّي قصد دراسة الطلب.\n\n';
  } else if (cat === 'ministere') {
    L += 'يشرّفني أن أعرض على أنظار سيادتكم ' + typeAR + ' ';
    L += 'يتعلّق بـ' + (c.objet || '...') + (c.projet ? '، في إطار مشروع « ' + c.projet + ' »' : '') + '.\n\n';
    L += 'ونظرا لأهمّية المشروع وانسجامه مع التوجّهات المعتمدة بوزارتكم الموقّرة، ألتمس منكم الموافقة الكريمة على النظر في هذا الملف.\n\n';
  } else if (cat === 'autorite') {
    L += 'يشرّفني أن أعرض على سيادتكم ' + typeAR + ' ';
    L += 'يتعلّق بـ' + (c.objet || '...') + (c.projet ? '، في إطار مشروع « ' + c.projet + ' »' : '') + '.\n\n';
    L += 'وقد تمّ إعداد الملف المرفق طبق التراتيب الجاري بها العمل.\n\n';
  } else {
    L += 'يشرّفني أن أتقدّم إليكم بهذا ' + typeAR + ' ';
    L += 'المتعلّق بـ' + (c.objet || '...') + (c.projet ? '، في إطار مشروع « ' + c.projet + ' »' : '') + '.\n\n';
  }

  L += 'وفي انتظار ردّكم الإيجابي، تقبّلوا، ' + destAR + '، فائق عبارات الاحترام والتقدير.\n\n';
  L += '\n' + c.exped + '\n';
  L += 'المهندس المعماري\n';

  if (c.docs && c.docs.length > 0) {
    L += '\n──────────────────────────\n';
    L += 'الوثائق المرفقة:\n';
    c.docs.forEach(function(d) { L += '• ' + d + '\n'; });
  }
  return L;
}

function printDALetter() {
  var contenu = document.getElementById('da-contenu').value;
  if (!contenu) { alert('Générez d\'abord la lettre.'); return; }

  var lang = document.getElementById('da-langue').value;
  var isAr = (lang === 'ar');
  var dir = isAr ? 'rtl' : 'ltr';
  var fontFamily = isAr ? "'Amiri', 'Noto Sans Arabic', 'Traditional Arabic', serif" : "'Segoe UI', Arial, sans-serif";
  var textAlign = isAr ? 'right' : 'left';

  // Cachet : seulement si flag actif sur cette demande
  var wrap = document.getElementById('da-cachet-wrap');
  var cachetOn = wrap && wrap.getAttribute('data-cachet-on') === '1';
  var cachetImg = cachetOn ? getSetting('cortoba_cachet_signature','') : '';

  // En-tête stylé selon les paramètres
  var headerHtml = _daBuildHeaderHtml(lang, getDAHeaderStyle());

  var cachetHtml = cachetImg ? '<div class="da-cachet"><img src="' + cachetImg + '" alt="cachet et signature" /></div>' : '';

  var css =
    '@page{size:A4;margin:18mm 20mm}' +
    'body{font-family:' + fontFamily + ';font-size:13px;line-height:1.75;padding:20px 30px;max-width:820px;margin:0 auto;direction:' + dir + ';text-align:' + textAlign + ';color:#222}' +
    'pre{white-space:pre-wrap;font-family:inherit;font-size:inherit;line-height:inherit;margin:0}' +
    '.da-cachet{margin-top:30px;' + (isAr ? 'text-align:left;' : 'text-align:right;') + '}' +
    '.da-cachet img{max-height:140px;max-width:240px;background:transparent}' +
    '@media print{body{padding:0}}';

  var win = window.open('', '_blank');
  win.document.write('<!DOCTYPE html><html dir="' + dir + '"><head><meta charset="utf-8"><title>Demande administrative</title>');
  win.document.write('<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Noto+Sans+Arabic:wght@400;600&display=swap" rel="stylesheet">');
  win.document.write('<style>' + css + '</style>');
  win.document.write('</head><body>' + headerHtml + '<pre>' + escHtml(contenu) + '</pre>' + cachetHtml + '</body></html>');
  win.document.close();
  setTimeout(function() { win.print(); }, 700);
}

// ══════════════════════════════════════════════════════════════
//  FICHE DE PAIE — Paramètres agence + calcul + impression
// ══════════════════════════════════════════════════════════════

// Valeurs par défaut Tunisie 2024
var PAIE_DEFAULTS = {
  cnss_affiliation: '',
  cnss_sal_taux: 9.18,
  cnss_pat_taux: 16.57,
  at_taux: 0.4,
  css_taux: 1.0,
  frais_pro_taux: 10,
  frais_pro_plafond: 2000,
  deduc_marie: 300,
  deduc_enfant: 100,
  bareme_irpp: [
    { min: 0,     max: 5000,  taux: 0 },
    { min: 5000,  max: 20000, taux: 26 },
    { min: 20000, max: 30000, taux: 28 },
    { min: 30000, max: 50000, taux: 32 },
    { min: 50000, max: null,  taux: 35 }
  ]
};

function getPaieParam(key) {
  var defaults = PAIE_DEFAULTS;
  var v = getSetting('cortoba_paie_' + key, null);
  if (v === null || v === undefined || v === '') return defaults[key];
  if (typeof defaults[key] === 'number') return parseFloat(v);
  return v;
}

function getIrppBareme() {
  var raw = getSetting('cortoba_paie_bareme_irpp', null);
  if (!raw) return PAIE_DEFAULTS.bareme_irpp.slice();
  try {
    var arr = (typeof raw === 'string') ? JSON.parse(raw) : raw;
    if (Array.isArray(arr) && arr.length) return arr;
  } catch(e){}
  return PAIE_DEFAULTS.bareme_irpp.slice();
}

// ═══ Onglets Paramètres ═══════════════════════════════════════
function switchParamTab(tab, btn) {
  // Style des boutons
  document.querySelectorAll('#param-tabs-bar .param-tab').forEach(function(b){
    b.classList.remove('active');
    b.style.color = 'var(--text-3)';
    b.style.borderBottomColor = 'transparent';
  });
  if (btn) {
    btn.classList.add('active');
    btn.style.color = 'var(--accent)';
    btn.style.borderBottomColor = 'var(--accent)';
  }
  // Afficher/masquer les cartes (scope restreint aux .card pour ne pas toucher les boutons d'onglets)
  document.querySelectorAll('#page-parametres .card[data-param-tab]').forEach(function(c){
    c.style.display = (c.getAttribute('data-param-tab') === tab) ? '' : 'none';
  });
}

function loadPaieParams() {
  var set = function(id, val){ var e=document.getElementById(id); if(e) e.value = (val==null?'':val); };
  set('param-paie-cnss-aff',          getPaieParam('cnss_affiliation'));
  set('param-paie-cnss-sal',          getPaieParam('cnss_sal_taux'));
  set('param-paie-cnss-pat',          getPaieParam('cnss_pat_taux'));
  set('param-paie-at',                getPaieParam('at_taux'));
  set('param-paie-css',                getPaieParam('css_taux'));
  set('param-paie-frais-pro',         getPaieParam('frais_pro_taux'));
  set('param-paie-frais-pro-plafond', getPaieParam('frais_pro_plafond'));
  set('param-paie-deduc-marie',       getPaieParam('deduc_marie'));
  set('param-paie-deduc-enfant',      getPaieParam('deduc_enfant'));
  renderIrppBaremeEditor();
}

function renderIrppBaremeEditor() {
  var wrap = document.getElementById('param-paie-irpp-wrap');
  if (!wrap) return;
  var bareme = getIrppBareme();
  wrap.innerHTML = bareme.map(function(t, i){
    return '<div><label style="font-size:0.65rem;color:var(--text-3)">De (TND)</label>'
      + '<input class="form-input irpp-min" type="number" step="1" value="'+(t.min||0)+'" data-idx="'+i+'" /></div>'
      + '<div><label style="font-size:0.65rem;color:var(--text-3)">À (TND, vide = ∞)</label>'
      + '<input class="form-input irpp-max" type="number" step="1" value="'+(t.max==null?'':t.max)+'" data-idx="'+i+'" /></div>'
      + '<div><label style="font-size:0.65rem;color:var(--text-3)">Taux (%)</label>'
      + '<input class="form-input irpp-taux" type="number" step="0.5" value="'+(t.taux||0)+'" data-idx="'+i+'" /></div>'
      + '<button type="button" class="btn btn-sm" onclick="removeIrppTranche('+i+')" style="color:#e07070">✕</button>';
  }).join('');
}

function addIrppTranche() {
  var bareme = collectIrppFromForm();
  bareme.push({ min: 0, max: null, taux: 0 });
  saveSetting('cortoba_paie_bareme_irpp', JSON.stringify(bareme));
  renderIrppBaremeEditor();
}
function removeIrppTranche(idx) {
  var bareme = collectIrppFromForm();
  bareme.splice(idx, 1);
  saveSetting('cortoba_paie_bareme_irpp', JSON.stringify(bareme));
  renderIrppBaremeEditor();
}
function collectIrppFromForm() {
  var wrap = document.getElementById('param-paie-irpp-wrap');
  if (!wrap) return getIrppBareme();
  var mins  = wrap.querySelectorAll('.irpp-min');
  var maxs  = wrap.querySelectorAll('.irpp-max');
  var tauxs = wrap.querySelectorAll('.irpp-taux');
  var out = [];
  for (var i=0; i<mins.length; i++) {
    var mi = parseFloat(mins[i].value)||0;
    var mx = maxs[i].value === '' ? null : parseFloat(maxs[i].value);
    var tx = parseFloat(tauxs[i].value)||0;
    out.push({ min: mi, max: mx, taux: tx });
  }
  return out;
}

function savePaieParams() {
  var v = function(id){ var e=document.getElementById(id); return e ? e.value : ''; };
  var tasks = [
    saveSetting('cortoba_paie_cnss_affiliation',  v('param-paie-cnss-aff')),
    saveSetting('cortoba_paie_cnss_sal_taux',     parseFloat(v('param-paie-cnss-sal'))||0),
    saveSetting('cortoba_paie_cnss_pat_taux',     parseFloat(v('param-paie-cnss-pat'))||0),
    saveSetting('cortoba_paie_at_taux',           parseFloat(v('param-paie-at'))||0),
    saveSetting('cortoba_paie_css_taux',          parseFloat(v('param-paie-css'))||0),
    saveSetting('cortoba_paie_frais_pro_taux',    parseFloat(v('param-paie-frais-pro'))||0),
    saveSetting('cortoba_paie_frais_pro_plafond', parseFloat(v('param-paie-frais-pro-plafond'))||0),
    saveSetting('cortoba_paie_deduc_marie',       parseFloat(v('param-paie-deduc-marie'))||0),
    saveSetting('cortoba_paie_deduc_enfant',      parseFloat(v('param-paie-deduc-enfant'))||0),
    saveSetting('cortoba_paie_bareme_irpp',       JSON.stringify(collectIrppFromForm()))
  ];
  Promise.all(tasks).then(function(){ showToast('✓ Paramètres fiche de paie enregistrés'); })
                    .catch(function(){ showToast('⚠ Erreur sauvegarde', 'error'); });
}

function resetPaieParams() {
  if (!confirm('Réinitialiser toutes les valeurs par défaut ?')) return;
  var keys = ['cnss_affiliation','cnss_sal_taux','cnss_pat_taux','at_taux','css_taux',
              'frais_pro_taux','frais_pro_plafond','deduc_marie','deduc_enfant'];
  keys.forEach(function(k){ saveSetting('cortoba_paie_'+k, PAIE_DEFAULTS[k]); });
  saveSetting('cortoba_paie_bareme_irpp', JSON.stringify(PAIE_DEFAULTS.bareme_irpp));
  setTimeout(loadPaieParams, 200);
  showToast('✓ Valeurs par défaut restaurées');
}

// ── Calcul fiche de paie (mensuel) ──
function computeFichePaie(member, options) {
  options = options || {};
  var salBase  = parseFloat(member.salaire_base) || parseFloat(member.salaire_net) || 0;
  var primes   = parseFloat(options.primes   || 0);
  var htsup    = parseFloat(options.htsup    || 0);
  var transp   = parseFloat(options.transp   || 0);
  var panier   = parseFloat(options.panier   || 0);
  var autres   = parseFloat(options.autres   || 0);
  var avance   = parseFloat(options.avance   || 0);

  var brut = salBase + primes + htsup + transp + panier + autres;

  var cnssSalTaux = getPaieParam('cnss_sal_taux');
  var cnssPatTaux = getPaieParam('cnss_pat_taux');
  var atTaux      = getPaieParam('at_taux');
  var cssTaux     = getPaieParam('css_taux');
  var fraisPct    = getPaieParam('frais_pro_taux');
  var fraisPlaf   = getPaieParam('frais_pro_plafond');
  var deducMarie  = getPaieParam('deduc_marie');
  var deducEnf    = getPaieParam('deduc_enfant');

  var cnssSal  = brut * cnssSalTaux / 100;
  var cnssPat  = brut * cnssPatTaux / 100;
  var atCot    = brut * atTaux / 100;
  var totalCot = cnssPat + atCot;

  var brutImposableMensuel = brut - cnssSal;
  // Frais pro : % sur brut imposable, plafonné annuellement
  var fraisMensuelPlafond = fraisPlaf / 12;
  var fraisProM = Math.min(brutImposableMensuel * fraisPct / 100, fraisMensuelPlafond);

  var deducSitM = 0;
  if ((member.situation_familiale || 'Célibataire') === 'Marié') {
    deducSitM = deducMarie / 12;
  }
  var nbEnfants = parseInt(member.enfants_charge || 0, 10);
  var deducEnfM = (nbEnfants * deducEnf) / 12;

  var baseIrppM = Math.max(0, brutImposableMensuel - fraisProM - deducSitM - deducEnfM);
  // Calcul IRPP via barème annualisé
  var bareme = getIrppBareme();
  var baseAnnuelle = baseIrppM * 12;
  var irppAnnuel = 0;
  for (var i = 0; i < bareme.length; i++) {
    var t = bareme[i];
    var low = t.min || 0;
    var high = (t.max==null) ? Infinity : t.max;
    if (baseAnnuelle > low) {
      var slice = Math.min(baseAnnuelle, high) - low;
      if (slice > 0) irppAnnuel += slice * (t.taux || 0) / 100;
    }
  }
  var irppM = irppAnnuel / 12;

  // CSS : 1% sur base calcul CSS (brut imposable mensuel)
  var baseCssM = brutImposableMensuel;
  var cssM = baseCssM * cssTaux / 100;

  var salaireNet = brutImposableMensuel - irppM - cssM;
  var netAPayer  = salaireNet - avance;

  return {
    salaire_base: salBase,
    primes: primes, htsup: htsup, transp: transp, panier: panier, autres: autres,
    total_brut: brut,
    cnss_sal: cnssSal, cnss_pat: cnssPat, at_cot: atCot, total_cot: totalCot,
    brut_imposable: brutImposableMensuel,
    frais_pro: fraisProM, deduc_situation: deducSitM, deduc_enfants: deducEnfM,
    base_irpp: baseIrppM, irpp: irppM,
    base_css: baseCssM, css: cssM,
    salaire_net: salaireNet, avance: avance, net_a_payer: netAPayer,
    // Taux appliqués
    taux_cnss_sal: cnssSalTaux, taux_cnss_pat: cnssPatTaux, taux_at: atTaux, taux_css: cssTaux
  };
}

// ── Conversion montant en lettres (français) ──
function numberToWordsFR(n) {
  if (n == null || isNaN(n)) return '';
  n = Math.round(parseFloat(n) * 1000) / 1000;
  var entier = Math.floor(Math.abs(n));
  var millimes = Math.round((Math.abs(n) - entier) * 1000);
  var units = ['zéro','un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix','onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'];
  var tens  = ['','','vingt','trente','quarante','cinquante','soixante','soixante','quatre-vingt','quatre-vingt'];
  function hundreds(num) {
    if (num === 0) return '';
    if (num < 20) return units[num];
    var t = Math.floor(num/10), r = num%10;
    if (t === 7 || t === 9) return tens[t] + '-' + units[10 + r];
    var s = tens[t];
    if (r === 1 && t !== 8) s += ' et un';
    else if (r > 0) s += '-' + units[r];
    else if (t === 8) s += 's';
    return s;
  }
  function thousands(num) {
    if (num < 100) return hundreds(num);
    var c = Math.floor(num/100), r = num%100;
    var s = '';
    if (c === 1) s = 'cent';
    else s = units[c] + ' cent' + (r===0?'s':'');
    if (r > 0) s += ' ' + hundreds(r);
    return s;
  }
  function bigNum(num) {
    if (num === 0) return 'zéro';
    var parts = [];
    var mil = Math.floor(num / 1000000);
    if (mil > 0) {
      parts.push((mil === 1 ? 'un million' : thousands(mil) + ' millions'));
      num -= mil * 1000000;
    }
    var mille = Math.floor(num / 1000);
    if (mille > 0) {
      parts.push((mille === 1 ? 'mille' : thousands(mille) + ' mille'));
      num -= mille * 1000;
    }
    if (num > 0) parts.push(thousands(num));
    return parts.join(' ');
  }
  var txt = bigNum(entier) + ' dinar' + (entier>1?'s':'');
  if (millimes > 0) txt += ' ' + bigNum(millimes) + ' millime' + (millimes>1?'s':'');
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

// ══════════════════════════════════════════════════════════════
//  Modal dépense — adaptation catégorie SALAIRE
// ══════════════════════════════════════════════════════════════

var _currentSalaryMember = null;     // membre sélectionné pour dépense salaire
var _currentFichePaie    = null;     // dernier calcul (pour impression)

function onDepCategorieChange() {
  var cat = (document.getElementById('dep-categorie')||{value:''}).value;
  var isSalaire = (cat === 'Salaires & charges');
  var benefWrap = document.getElementById('dep-beneficiaire-wrap');
  var moisWrap  = document.getElementById('dep-paie-mois-wrap');
  var fourWrap  = document.getElementById('dep-fournisseur-wrap');
  var printBtn  = document.getElementById('dep-print-fiche-btn');

  if (isSalaire) {
    if (benefWrap) benefWrap.style.display = '';
    if (moisWrap)  moisWrap.style.display  = '';
    if (fourWrap)  fourWrap.style.display  = 'none';
    populateDepBeneficiaireSelect();
    // Pré-remplir mois courant
    var mi = document.getElementById('dep-paie-mois');
    if (mi && !mi.value) {
      var now = new Date();
      mi.value = now.getFullYear() + '-' + ('0'+(now.getMonth()+1)).slice(-2);
    }
  } else {
    if (benefWrap) benefWrap.style.display = 'none';
    if (moisWrap)  moisWrap.style.display  = 'none';
    if (fourWrap)  fourWrap.style.display  = '';
    if (printBtn)  printBtn.style.display  = 'none';
    _currentSalaryMember = null;
    _currentFichePaie    = null;
  }
}

function populateDepBeneficiaireSelect() {
  var sel = document.getElementById('dep-beneficiaire');
  if (!sel) return;
  var currentVal = sel.value;
  var list = (getMembres() || []).filter(function(m){
    return (m.statut !== 'Inactif');
  });
  sel.innerHTML = '<option value="">— Sélectionner un membre —</option>'
    + list.map(function(m){
        return '<option value="'+m.id+'">'+escHtml((m.prenom||'') + ' ' + (m.nom||''))
             + (m.role ? ' — ' + escHtml(m.role) : '')
             + '</option>';
      }).join('');
  if (currentVal) sel.value = currentVal;
}

function onDepBeneficiaireChange() {
  var sel = document.getElementById('dep-beneficiaire');
  if (!sel) return;
  var id = sel.value;
  var infoEl = document.getElementById('dep-benef-info');
  var printBtn = document.getElementById('dep-print-fiche-btn');

  if (!id) {
    _currentSalaryMember = null;
    _currentFichePaie    = null;
    if (infoEl) infoEl.style.display = 'none';
    if (printBtn) printBtn.style.display = 'none';
    return;
  }

  var m = (getMembres()||[]).find(function(x){ return x.id === id; });
  if (!m) return;
  _currentSalaryMember = m;

  // Calcul fiche de paie
  var fp = computeFichePaie(m, {});
  _currentFichePaie = fp;

  // Mois de paie
  var moisInput = (document.getElementById('dep-paie-mois')||{value:''}).value;
  var moisLabel = formatMonthLabelFR(moisInput);

  // Auto-remplissage du formulaire dépense :
  //  - libellé : "Salaire <mois> <année> — <Nom Prénom>"
  //  - fournisseur (caché) : nom du membre
  //  - date : dernier jour du mois (ou aujourd'hui)
  //  - lignes : UNIQUE ligne avec HT = net à payer, TVA = 0
  var libelle = 'Salaire ' + moisLabel + ' — ' + (m.prenom||'') + ' ' + (m.nom||'');
  var libEl = document.getElementById('dep-libelle'); if (libEl) libEl.value = libelle;
  var fourEl = document.getElementById('dep-fournisseur'); if (fourEl) fourEl.value = (m.prenom||'')+' '+(m.nom||'');

  // Reconstruire les lignes : 1 ligne nette
  var wrap = document.getElementById('dep-lignes-wrap');
  if (wrap) wrap.innerHTML = '';
  _depLigneCount = 0;
  if (typeof addDepenseLigne === 'function') {
    addDepenseLigne({ desc: 'Salaire net à payer (' + moisLabel + ')', ht: fp.net_a_payer, tva: 0 });
  }
  if (typeof calcDepTotal === 'function') calcDepTotal();

  // Info résumé sous le select
  if (infoEl) {
    infoEl.style.display = '';
    infoEl.innerHTML = '<strong>Brut :</strong> ' + fmtTnd(fp.total_brut)
      + ' &nbsp;•&nbsp; <strong>CNSS :</strong> ' + fmtTnd(fp.cnss_sal)
      + ' &nbsp;•&nbsp; <strong>IRPP :</strong> ' + fmtTnd(fp.irpp)
      + ' &nbsp;•&nbsp; <strong>Net à payer :</strong> <span style="color:var(--accent);font-weight:600">' + fmtTnd(fp.net_a_payer) + '</span>';
  }

  if (printBtn) printBtn.style.display = '';
}

function formatMonthLabelFR(ym) {
  if (!ym) { var n = new Date(); ym = n.getFullYear()+'-'+('0'+(n.getMonth()+1)).slice(-2); }
  var parts = ym.split('-');
  var mois = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  var idx = parseInt(parts[1],10) - 1;
  return (mois[idx] || '') + ' ' + parts[0];
}

// ══════════════════════════════════════════════════════════════
//  Impression fiche de paie — gabarit HTML inspiré du modèle XLSX
// ══════════════════════════════════════════════════════════════

function openFichePaiePreview() {
  if (!_currentSalaryMember) { alert('Sélectionnez un salarié bénéficiaire.'); return; }
  var fp = computeFichePaie(_currentSalaryMember, {});
  _currentFichePaie = fp;
  var html = renderFichePaieHtml(_currentSalaryMember, fp);
  var wrap = document.getElementById('fiche-paie-content');
  if (wrap) wrap.innerHTML = html;
  openModal('modal-fiche-paie');
}

function printFichePaie() {
  var content = document.getElementById('fiche-paie-content');
  if (!content) return;
  var win = window.open('', '_blank', 'width=900,height=1200');
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bulletin de paie</title>');
  win.document.write('<style>' + fichePaieCss() + '</style>');
  win.document.write('</head><body>' + content.innerHTML + '</body></html>');
  win.document.close();
  setTimeout(function(){ win.print(); }, 500);
}

function fichePaieCss() {
  return ''
    + 'body{font-family:Arial,sans-serif;padding:1.5rem;color:#111;background:#fff}'
    + '.fp-wrap{max-width:820px;margin:0 auto;border:2px solid #333}'
    + '.fp-title{background:#2c3e50;color:#fff;text-align:center;padding:0.8rem;font-size:1.1rem;font-weight:bold;letter-spacing:0.15em}'
    + '.fp-section{padding:0.6rem 0.9rem;border-bottom:1px solid #ccc}'
    + '.fp-row{display:flex;justify-content:space-between;margin:0.22rem 0;font-size:0.8rem}'
    + '.fp-row strong{color:#333;min-width:150px}'
    + '.fp-grid2{display:grid;grid-template-columns:1fr 1fr;gap:0.6rem}'
    + 'table.fp-tbl{width:100%;border-collapse:collapse;font-size:0.75rem;margin-top:0.4rem}'
    + 'table.fp-tbl th,table.fp-tbl td{border:1px solid #999;padding:4px 6px;text-align:left}'
    + 'table.fp-tbl th{background:#ecf0f1;font-weight:600;font-size:0.7rem;text-transform:uppercase}'
    + 'table.fp-tbl td.num{text-align:right;font-family:monospace}'
    + 'table.fp-tbl tr.total td{background:#f8f9fa;font-weight:bold}'
    + '.fp-net{background:#2c3e50;color:#fff;padding:0.7rem 1rem;font-size:1rem;font-weight:bold;display:flex;justify-content:space-between;align-items:center}'
    + '.fp-lettres{padding:0.6rem 0.9rem;font-style:italic;font-size:0.78rem;color:#555;border-bottom:1px solid #ccc}'
    + '.fp-signatures{display:flex;justify-content:space-between;padding:1.4rem 0.9rem 0.4rem;font-size:0.75rem;color:#666}'
    + '.fp-sig-box{flex:0 0 46%;text-align:center;border-top:1px solid #666;padding-top:0.3rem}'
    + '@media print{body{padding:0}.fp-wrap{border:none}}';
}

function renderFichePaieHtml(m, fp) {
  var fN = function(n){ return (parseFloat(n)||0).toFixed(3).replace('.',','); };
  var ag = {
    raison: getSetting('cortoba_agence_raison','Cortoba Architecture Studio'),
    adresse: getSetting('cortoba_agence_adresse','Djerba, Tunisie'),
    mf:      getSetting('cortoba_agence_mf',''),
    cnoa:    getSetting('cortoba_agence_cnoa','')
  };
  var cnssAff = getPaieParam('cnss_affiliation');
  var moisInput = (document.getElementById('dep-paie-mois')||{value:''}).value;
  var moisLabel = formatMonthLabelFR(moisInput);
  var datePaie = (document.getElementById('dep-date')||{value:''}).value || new Date().toISOString().split('T')[0];
  var taux_h   = (parseFloat(m.salaire_base)||0) / (parseFloat(m.heures_mois)||208);

  var html = '<div class="fp-wrap">';
  html += '<div class="fp-title">BULLETIN DE PAIE</div>';

  // En-tête société
  html += '<div class="fp-section">';
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:0.6rem">';
  html += '<div><div style="font-size:0.95rem;font-weight:bold;color:#2c3e50">'+escHtml(ag.raison)+'</div>';
  html += '<div style="font-size:0.72rem;color:#666;margin-top:2px">'+escHtml(ag.adresse)+'</div>';
  if (cnssAff) html += '<div style="font-size:0.72rem;color:#666">Affiliation CNSS : '+escHtml(cnssAff)+'</div>';
  html += '</div>';
  html += '<div style="font-size:0.75rem;text-align:right">';
  html += '<div><strong>Année :</strong> '+ (moisInput.split('-')[0] || new Date().getFullYear()) +'</div>';
  html += '<div><strong>Mois :</strong> '+ escHtml(moisLabel) +'</div>';
  html += '<div><strong>Date de paiement :</strong> '+ fmtDate(datePaie) +'</div>';
  html += '</div>';
  html += '</div></div>';

  // Identification salarié
  html += '<div class="fp-section">';
  html += '<div class="fp-grid2">';
  html += '<div>';
  html += '<div class="fp-row"><strong>Matricule</strong><span>'+escHtml(m.matricule||'—')+'</span></div>';
  html += '<div class="fp-row"><strong>Nom & Prénom</strong><span>'+escHtml((m.prenom||'')+' '+(m.nom||''))+'</span></div>';
  html += '<div class="fp-row"><strong>CIN</strong><span>'+escHtml(m.cin||'—')+'</span></div>';
  html += '<div class="fp-row"><strong>N° CNSS</strong><span>'+escHtml(m.n_cnss||'—')+'</span></div>';
  html += '<div class="fp-row"><strong>Adresse</strong><span>'+escHtml(m.adresse||'—')+'</span></div>';
  html += '</div>';
  html += '<div>';
  html += '<div class="fp-row"><strong>Emploi</strong><span>'+escHtml(m.emploi||m.role||'—')+'</span></div>';
  html += '<div class="fp-row"><strong>Catégorie</strong><span>'+escHtml(m.categorie_emploi||'—')+'</span></div>';
  html += '<div class="fp-row"><strong>Échelon</strong><span>'+escHtml(m.echelon||'—')+'</span></div>';
  html += '<div class="fp-row"><strong>Situation familiale</strong><span>'+escHtml(m.situation_familiale||'—')+'</span></div>';
  html += '<div class="fp-row"><strong>Enfants à charge</strong><span>'+(m.enfants_charge||0)+'</span></div>';
  html += '<div class="fp-row"><strong>Salaire de base</strong><span>'+fN(m.salaire_base)+' TND</span></div>';
  html += '<div class="fp-row"><strong>Taux horaire</strong><span>'+fN(taux_h)+' TND</span></div>';
  html += '</div>';
  html += '</div></div>';

  // Tableau rubriques
  html += '<div class="fp-section">';
  html += '<table class="fp-tbl"><thead><tr>';
  html += '<th>Désignation</th><th>Base</th><th>Taux</th><th>Gain</th><th>Retenue</th>';
  html += '</tr></thead><tbody>';
  html += '<tr><td>Salaire de base</td><td class="num">'+fN(m.heures_mois||208)+'</td><td class="num">'+fN(taux_h)+'</td><td class="num">'+fN(fp.salaire_base)+'</td><td class="num">—</td></tr>';
  if (fp.primes > 0) html += '<tr><td>Primes</td><td class="num">—</td><td class="num">—</td><td class="num">'+fN(fp.primes)+'</td><td class="num">—</td></tr>';
  if (fp.transp > 0) html += '<tr><td>Indemnité de transport</td><td class="num">—</td><td class="num">—</td><td class="num">'+fN(fp.transp)+'</td><td class="num">—</td></tr>';
  if (fp.panier > 0) html += '<tr><td>Prime de panier</td><td class="num">—</td><td class="num">—</td><td class="num">'+fN(fp.panier)+'</td><td class="num">—</td></tr>';
  if (fp.htsup  > 0) html += '<tr><td>Heures supplémentaires</td><td class="num">—</td><td class="num">—</td><td class="num">'+fN(fp.htsup)+'</td><td class="num">—</td></tr>';
  html += '<tr class="total"><td colspan="3">Total Brut</td><td class="num">'+fN(fp.total_brut)+'</td><td class="num">—</td></tr>';
  html += '<tr><td>Retenue CNSS salariale</td><td class="num">'+fN(fp.total_brut)+'</td><td class="num">'+fN(fp.taux_cnss_sal)+'%</td><td class="num">—</td><td class="num">'+fN(fp.cnss_sal)+'</td></tr>';
  html += '<tr class="total"><td colspan="3">Salaire Brut Imposable</td><td class="num">'+fN(fp.brut_imposable)+'</td><td class="num">—</td></tr>';
  html += '<tr><td>Déduction frais professionnels</td><td class="num">—</td><td class="num">—</td><td class="num">'+fN(fp.frais_pro)+'</td><td class="num">—</td></tr>';
  html += '<tr><td>Déduction situation familiale</td><td class="num">—</td><td class="num">—</td><td class="num">'+fN(fp.deduc_situation)+'</td><td class="num">—</td></tr>';
  if (fp.deduc_enfants > 0) html += '<tr><td>Déduction enfants à charge</td><td class="num">—</td><td class="num">—</td><td class="num">'+fN(fp.deduc_enfants)+'</td><td class="num">—</td></tr>';
  html += '<tr class="total"><td colspan="3">Base imposable IRPP</td><td class="num">'+fN(fp.base_irpp)+'</td><td class="num">—</td></tr>';
  html += '<tr><td>IRPP (barème annuel)</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">'+fN(fp.irpp)+'</td></tr>';
  html += '<tr><td>Contribution Sociale Solidaire (CSS)</td><td class="num">'+fN(fp.base_css)+'</td><td class="num">'+fN(fp.taux_css)+'%</td><td class="num">—</td><td class="num">'+fN(fp.css)+'</td></tr>';
  html += '<tr class="total"><td colspan="3">Salaire Net</td><td class="num">'+fN(fp.salaire_net)+'</td><td class="num">—</td></tr>';
  if (fp.avance > 0) html += '<tr><td>Avance</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">'+fN(fp.avance)+'</td></tr>';
  html += '</tbody></table>';
  html += '</div>';

  // Cotisations patronales (info)
  html += '<div class="fp-section" style="font-size:0.72rem;color:#666">';
  html += '<div style="font-weight:600;margin-bottom:0.3rem;text-transform:uppercase;font-size:0.68rem;letter-spacing:0.08em">Contributions patronales (information)</div>';
  html += '<div class="fp-row"><strong>CNSS patronale ('+fN(fp.taux_cnss_pat)+'%)</strong><span>'+fN(fp.cnss_pat)+' TND</span></div>';
  html += '<div class="fp-row"><strong>Accident de travail ('+fN(fp.taux_at)+'%)</strong><span>'+fN(fp.at_cot)+' TND</span></div>';
  html += '<div class="fp-row"><strong>Total cotisation patronale</strong><span>'+fN(fp.total_cot)+' TND</span></div>';
  html += '</div>';

  // Net à payer
  html += '<div class="fp-net"><span>NET À PAYER</span><span>'+fN(fp.net_a_payer)+' TND</span></div>';
  html += '<div class="fp-lettres">Arrêté la présente fiche à la somme de : <strong>'+escHtml(numberToWordsFR(fp.net_a_payer))+'</strong></div>';

  // Mode de paiement
  html += '<div class="fp-section" style="font-size:0.76rem">';
  html += '<div class="fp-grid2">';
  html += '<div class="fp-row"><strong>Mode de paiement</strong><span>'+escHtml(m.mode_paiement||'Virement')+'</span></div>';
  html += '<div class="fp-row"><strong>Banque</strong><span>'+escHtml(m.banque||'—')+'</span></div>';
  html += '<div class="fp-row" style="grid-column:1/-1"><strong>N° de compte / RIB</strong><span>'+escHtml(m.rib||'—')+'</span></div>';
  html += '</div></div>';

  // Signatures
  html += '<div class="fp-signatures">';
  html += '<div class="fp-sig-box">Signature et cachet employeur</div>';
  html += '<div class="fp-sig-box">Signature employé</div>';
  html += '</div>';

  html += '</div>'; // fp-wrap
  return html;
}

// ── Réinitialisation modale dépense : ajout salaire ──
(function(){
  var origReset = resetDepenseForm;
  if (typeof origReset === 'function') {
    resetDepenseForm = function(){
      origReset.apply(this, arguments);
      var benefWrap = document.getElementById('dep-beneficiaire-wrap');
      var moisWrap  = document.getElementById('dep-paie-mois-wrap');
      var fourWrap  = document.getElementById('dep-fournisseur-wrap');
      var printBtn  = document.getElementById('dep-print-fiche-btn');
      if (benefWrap) benefWrap.style.display = 'none';
      if (moisWrap)  moisWrap.style.display  = 'none';
      if (fourWrap)  fourWrap.style.display  = '';
      if (printBtn)  printBtn.style.display  = 'none';
      var bSel = document.getElementById('dep-beneficiaire'); if (bSel) bSel.value = '';
      var bMoi = document.getElementById('dep-paie-mois');    if (bMoi) bMoi.value = '';
      var bInf = document.getElementById('dep-benef-info');   if (bInf) bInf.style.display = 'none';
      _currentSalaryMember = null;
      _currentFichePaie    = null;
    };
  }
})();

// ═══════════════════════════════════════════════════════════════
//  SUIVI v3 — Handlers select mission/tâche-type + inline add
// ═══════════════════════════════════════════════════════════════

function onTacheTitreSelectChange(sel) {
  // Pour niveau 0 : détecter mission "grisée" (non affectée au projet) → proposer ajout
  var niveau = parseInt((document.getElementById('tache-niveau')||{}).value || '0', 10);
  if (niveau !== 0 || !sel || !sel.value) return;
  var projetId = (document.getElementById('tache-projet')||{}).value;
  if (!projetId) return;
  var projet = getProjets().find(function(p){ return p.id === projetId; });
  if (!projet) return;
  var rawList = [];
  try { rawList = Array.isArray(projet.missions) ? projet.missions.slice() : (projet.missions ? JSON.parse(projet.missions) : []); } catch(e) { rawList = []; }
  // Normaliser en noms pour comparaison
  var nomsAffectees = _normalizeProjetMissions(rawList);
  if (nomsAffectees.indexOf(sel.value) !== -1) return; // déjà affectée

  if (confirm('La mission "'+sel.value+'" n\'est pas affectée au projet '+(projet.code||projet.nom)+'. L\'ajouter à la fiche projet ?')) {
    // Trouver l'ID de la mission et stocker au format "id_nom" (comme populateMissionsList)
    var missionObj = (getMissions()||[]).find(function(m){ return m.nom === sel.value; });
    var toPush = missionObj ? (missionObj.id + '_' + missionObj.nom) : sel.value;
    rawList.push(toPush);
    projet.missions = rawList;
    apiFetch('api/projets.php?id='+projet.id, { method:'PUT', body:{ missions: rawList } })
      .then(function(){
        showToast('✓ Mission ajoutée au projet');
        // Re-peupler le select pour que la mission ne soit plus demi-teinte
        _populateMissionsSelect(sel.value);
      })
      .catch(function(e){ showToast('Erreur : '+e.message, 'error'); });
  } else {
    sel.value = '';
  }
}

function onTacheTitreTypeChange(sel) {
  // Option "+ nouvelle" → ouvrir modale ; sinon recopier dans tache-titre
  if (!sel) return;
  if (sel.value === '__add__') {
    sel.value = '';
    openAddTacheTypeInline();
    return;
  }
  var inp = document.getElementById('tache-titre');
  if (inp && sel.value) inp.value = sel.value;
}

function openAddTacheTypeInline() {
  var selM = document.getElementById('add-tt-mission');
  if (selM) {
    selM.innerHTML = '';
    var missions = getMissions();
    missions.forEach(function(m){
      var o = document.createElement('option');
      o.value = m.id; o.textContent = m.nom;
      selM.appendChild(o);
    });
    // Pré-sélectionner la mission du parent si niveau 1
    var parentId = (document.getElementById('tache-parent-id')||{}).value;
    if (parentId && typeof _suiviCache !== 'undefined') {
      var parent = _suiviCache.find(function(x){ return x.id === parentId; });
      if (parent) {
        var mMatch = missions.find(function(m){ return m.nom === parent.titre; });
        if (mMatch) selM.value = mMatch.id;
      }
    }
  }
  var nomEl = document.getElementById('add-tt-nom'); if (nomEl) nomEl.value = '';
  openModal('modal-add-tachetype');
}

function confirmAddTacheTypeInline() {
  var missionId = (document.getElementById('add-tt-mission')||{}).value;
  var nom = ((document.getElementById('add-tt-nom')||{}).value || '').trim();
  if (!missionId) { showToast('Mission requise', 'error'); return; }
  if (!nom) { showToast('Nom requis', 'error'); return; }
  var list = getTachesTypes();
  var newId = 'tt_' + Date.now();
  list.push({ id: newId, mission_id: missionId, nom: nom });
  saveSetting('cortoba_taches_types', list);
  closeModal('modal-add-tachetype');
  showToast('✓ Tâche-type ajoutée');
  // Re-peupler le select courant et pré-sélectionner
  try { _populateTachesTypesSelect(nom); } catch(e) {}
  var inp = document.getElementById('tache-titre'); if (inp) inp.value = nom;
}

// ═══════════════════════════════════════════════════════════════
//  DÉPLACEMENTS — Feuille de route (Chantier + Administration)
// ═══════════════════════════════════════════════════════════════

function openDeplacementsView() {
  var me = (window._currentUser || {});
  var myName = ((me.prenom||'') + ' ' + (me.nom||'')).trim() || me.name || me.email || '';
  loadTaches().then(function(list){
    var rows = (list||[]).filter(function(t){
      var loc = t.location_type || 'Bureau';
      if (loc !== 'Chantier' && loc !== 'Administration') return false;
      if (t.statut === 'Terminé') return false;
      if (myName && t.assignee && t.assignee !== myName && (me.role||'') !== 'admin' && (me.role||'') !== 'Architecte gérant') {
        return false;
      }
      return true;
    });
    rows.sort(function(a,b){
      var ka = (a.location_zone||'') + '|' + (a.date_echeance||'9999');
      var kb = (b.location_zone||'') + '|' + (b.date_echeance||'9999');
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    var w = window.open('', '_blank');
    if (!w) { showToast('Popup bloqué', 'error'); return; }
    var html = '<!doctype html><html><head><meta charset="utf-8"><title>Feuille de route</title>';
    html += '<style>body{font-family:Arial,sans-serif;padding:20px;color:#222}h1{color:#8b6f3a;border-bottom:2px solid #c8a96e;padding-bottom:6px}table{border-collapse:collapse;width:100%;margin-top:12px;font-size:12px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f5efe2}tr.sep td{background:#fbf6e8;font-weight:bold}</style>';
    html += '</head><body>';
    html += '<h1>Feuille de route — ' + new Date().toLocaleDateString('fr-FR') + '</h1>';
    html += '<div style="font-size:12px;color:#666">Collaborateur : ' + (myName||'Tous') + ' · ' + rows.length + ' déplacement(s)</div>';
    html += '<table><thead><tr><th>Zone</th><th>Type</th><th>Projet</th><th>Tâche</th><th>Échéance</th><th>Assigné</th></tr></thead><tbody>';
    var lastZone = '';
    rows.forEach(function(r){
      if (r.location_zone !== lastZone) {
        html += '<tr class="sep"><td colspan="6">' + (r.location_zone || '— Zone non précisée —') + '</td></tr>';
        lastZone = r.location_zone;
      }
      html += '<tr><td>'+(r.location_zone||'—')+'</td><td>'+(r.location_type||'')+'</td><td>'+((r.projetCode||r.projet_code||'')+(r.projetNom? ' — '+r.projetNom:''))+'</td><td>'+(r.titre||'')+'</td><td>'+(r.dateEcheance||r.date_echeance||'—')+'</td><td>'+(r.assignee||'—')+'</td></tr>';
    });
    html += '</tbody></table>';
    html += '<script>window.onload=function(){window.print();}</scr'+'ipt></body></html>';
    w.document.write(html); w.document.close();
  });
}

// ═══════════════════════════════════════════════════════════════
//  POPUP ÉCHÉANCES — à l'ouverture de session
// ═══════════════════════════════════════════════════════════════

var _deadlinesChecked = false;
function checkDeadlinesPopup() {
  if (_deadlinesChecked) return;
  _deadlinesChecked = true;
  var me = (window._currentUser || {});
  var myName = ((me.prenom||'') + ' ' + (me.nom||'')).trim() || me.name || '';
  var isPriv = (me.role === 'admin' || me.role === 'Architecte gérant');
  loadTaches().then(function(list){
    var today = new Date(); today.setHours(0,0,0,0);
    var lim = new Date(today); lim.setDate(lim.getDate() + 3);
    var alerts = (list||[]).filter(function(t){
      if (t.statut === 'Terminé') return false;
      var d = t.dateEcheance || t.date_echeance;
      if (!d) return false;
      var dd = new Date(d); dd.setHours(0,0,0,0);
      if (dd > lim) return false;
      if (!isPriv && myName && t.assignee && t.assignee !== myName) return false;
      return true;
    });
    if (!alerts.length) return;
    alerts.sort(function(a,b){ return (a.dateEcheance||a.date_echeance||'') < (b.dateEcheance||b.date_echeance||'') ? -1 : 1; });
    var wrap = document.getElementById('deadlines-list');
    if (!wrap) return;
    var html = '';
    alerts.forEach(function(t){
      var d = t.dateEcheance || t.date_echeance;
      var dd = new Date(d); dd.setHours(0,0,0,0);
      var overdue = dd < today;
      var color = overdue ? '#c0392b' : '#d18e1e';
      html += '<div style="border-left:3px solid '+color+';padding:0.5rem 0.7rem;background:var(--bg-2);border-radius:4px">';
      html += '<div style="font-size:0.85rem;font-weight:500">'+(t.titre||'')+'</div>';
      html += '<div style="font-size:0.72rem;color:var(--text-3)">'+(t.projetCode||t.projet_code||'')+' · '+(t.assignee||'Non assigné')+' · <span style="color:'+color+'">échéance '+d+(overdue?' (en retard)':'')+'</span></div>';
      html += '</div>';
    });
    wrap.innerHTML = html;
    openModal('modal-deadlines');
  });
}

// ═══════════════════════════════════════════════════════════════
//  TIMESHEET — saisie du temps
// ═══════════════════════════════════════════════════════════════

var _timesheetCache = [];

function renderTimesheetPage() {
  // Populate filtres une seule fois
  var selU = document.getElementById('ts-filter-user');
  if (selU && selU.options.length <= 1) {
    getMembres().forEach(function(m){
      var n = ((m.prenom||'')+' '+(m.nom||'')).trim();
      if (!n) return;
      var o = document.createElement('option');
      o.value = m.id; o.textContent = n;
      selU.appendChild(o);
    });
  }
  var selP = document.getElementById('ts-filter-projet');
  if (selP && selP.options.length <= 1) {
    getProjets().forEach(function(p){
      var o = document.createElement('option');
      o.value = p.id; o.textContent = (p.code?p.code+' — ':'') + p.nom;
      selP.appendChild(o);
    });
  }
  var q = [];
  var u = (document.getElementById('ts-filter-user')||{}).value;
  var pr = (document.getElementById('ts-filter-projet')||{}).value;
  var df = (document.getElementById('ts-filter-from')||{}).value;
  var dt = (document.getElementById('ts-filter-to')||{}).value;
  if (u)  q.push('user_id='   + encodeURIComponent(u));
  if (pr) q.push('projet_id=' + encodeURIComponent(pr));
  if (df) q.push('date_from=' + encodeURIComponent(df));
  if (dt) q.push('date_to='   + encodeURIComponent(dt));
  apiFetch('api/timesheets.php' + (q.length?'?'+q.join('&'):'')).then(function(r){
    _timesheetCache = r.data || [];
    var wrap = document.getElementById('ts-table-wrap');
    if (!wrap) return;
    if (!_timesheetCache.length) {
      wrap.innerHTML = '<div style="color:var(--text-3);padding:1.5rem;text-align:center;font-size:0.82rem">Aucune saisie sur la période.</div>';
      var s = document.getElementById('ts-summary'); if (s) s.textContent = '';
      return;
    }
    var html = '<table style="width:100%;border-collapse:collapse;font-size:0.8rem">';
    html += '<thead><tr style="border-bottom:1px solid var(--border);color:var(--text-3);text-align:left"><th style="padding:0.5rem">Date</th><th>Collaborateur</th><th>Projet</th><th>Tâche</th><th style="text-align:right">Heures</th><th>Fact.</th><th>Commentaire</th><th></th></tr></thead><tbody>';
    var total = 0, billable = 0;
    _timesheetCache.forEach(function(t){
      var h = parseFloat(t.hours_spent)||0;
      total += h;
      if (+t.is_billable) billable += h;
      html += '<tr style="border-bottom:1px solid var(--border-subtle)">';
      html += '<td style="padding:0.4rem 0.5rem">'+(t.date_jour||'')+'</td>';
      html += '<td>'+(t.user_name||'—')+'</td>';
      html += '<td>'+((t.projet_code||'')+(t.projet_nom?' — '+t.projet_nom:'') || '—')+'</td>';
      html += '<td>'+(t.tache_titre||'—')+'</td>';
      html += '<td style="text-align:right;font-variant-numeric:tabular-nums">'+h.toFixed(2)+'</td>';
      html += '<td>'+(+t.is_billable?'✓':'—')+'</td>';
      html += '<td style="color:var(--text-3);font-size:0.75rem">'+(t.commentaire||'')+'</td>';
      html += '<td><button class="btn btn-sm" onclick="editTimesheet(\''+t.id+'\')">Modif</button> <button class="btn btn-sm" onclick="deleteTimesheet(\''+t.id+'\')">×</button></td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
    var s = document.getElementById('ts-summary');
    if (s) s.textContent = 'Total : '+total.toFixed(2)+' h · Facturable : '+billable.toFixed(2)+' h';
  }).catch(function(e){
    var wrap = document.getElementById('ts-table-wrap');
    if (wrap) wrap.innerHTML = '<div style="color:var(--red);padding:1rem">Erreur : '+e.message+'</div>';
  });
}

function openTimesheetModal(tacheId) {
  document.getElementById('ts-id').value = '';
  document.getElementById('ts-tache-id').value = tacheId || '';
  document.getElementById('ts-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('ts-hours').value = '';
  document.getElementById('ts-commentaire').value = '';
  document.getElementById('ts-billable').checked = true;
  // Populate projet
  var selP = document.getElementById('ts-projet');
  selP.innerHTML = '<option value="">— Projet —</option>';
  getProjets().forEach(function(p){
    var o = document.createElement('option');
    o.value = p.id; o.textContent = (p.code?p.code+' — ':'') + p.nom;
    selP.appendChild(o);
  });
  // Populate tâche
  var selT = document.getElementById('ts-tache');
  selT.innerHTML = '<option value="">— Aucune —</option>';
  (_suiviCache||[]).forEach(function(t){
    if (t.niveau === 0) return;
    var o = document.createElement('option');
    o.value = t.id; o.textContent = (t.projetCode?t.projetCode+' · ':'') + (t.titre||'');
    selT.appendChild(o);
  });
  if (tacheId) {
    selT.value = tacheId;
    var tk = (_suiviCache||[]).find(function(x){ return x.id === tacheId; });
    if (tk && tk.projet_id) selP.value = tk.projet_id;
  }
  openModal('modal-timesheet');
}

function editTimesheet(id) {
  var t = _timesheetCache.find(function(x){ return x.id === id; });
  if (!t) return;
  openTimesheetModal(t.tache_id);
  document.getElementById('ts-id').value = t.id;
  document.getElementById('ts-projet').value = t.projet_id || '';
  document.getElementById('ts-tache').value  = t.tache_id || '';
  document.getElementById('ts-date').value   = t.date_jour || '';
  document.getElementById('ts-hours').value  = t.hours_spent || '';
  document.getElementById('ts-billable').checked = !!(+t.is_billable);
  document.getElementById('ts-commentaire').value = t.commentaire || '';
}

function saveTimesheet() {
  var id = document.getElementById('ts-id').value;
  var hours = parseFloat(document.getElementById('ts-hours').value);
  if (!hours || hours <= 0) { showToast('Heures requises', 'error'); return; }
  var body = {
    projet_id:   document.getElementById('ts-projet').value || null,
    tache_id:    document.getElementById('ts-tache').value || null,
    date_jour:   document.getElementById('ts-date').value,
    hours_spent: hours,
    is_billable: document.getElementById('ts-billable').checked ? 1 : 0,
    commentaire: document.getElementById('ts-commentaire').value.trim()
  };
  var url = id ? 'api/timesheets.php?id='+id : 'api/timesheets.php';
  var method = id ? 'PUT' : 'POST';
  apiFetch(url, { method: method, body: body }).then(function(){
    closeModal('modal-timesheet');
    showToast('✓ Temps enregistré');
    if (typeof renderTimesheetPage === 'function' && document.getElementById('page-timesheet').classList.contains('active')) renderTimesheetPage();
  }).catch(function(e){ showToast('Erreur : '+e.message, 'error'); });
}

function deleteTimesheet(id) {
  if (!confirm('Supprimer cette saisie ?')) return;
  apiFetch('api/timesheets.php?id='+id, { method:'DELETE' }).then(function(){
    showToast('✓ Supprimé');
    renderTimesheetPage();
  });
}

// ═══════════════════════════════════════════════════════════════
//  GANTT — planning visuel (frappe-gantt)
// ═══════════════════════════════════════════════════════════════

function renderGanttPage() {
  var selP = document.getElementById('gantt-projet');
  if (selP && selP.options.length <= 1) {
    getProjets().forEach(function(p){
      var o = document.createElement('option');
      o.value = p.id; o.textContent = (p.code?p.code+' — ':'') + p.nom;
      selP.appendChild(o);
    });
  }
  var projetId = selP ? selP.value : '';
  loadTaches(projetId || null).then(function(list){
    // Normaliser les dates au format YYYY-MM-DD strict pour frappe-gantt
    function normDate(d) {
      if (!d) return null;
      var s = String(d).substring(0, 10); // YYYY-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
      return s;
    }
    var tasks = (list||[]).filter(function(t){
      var sd = normDate(t.date_debut || t.dateDebut);
      var ed = normDate(t.date_echeance || t.dateEcheance);
      return sd && ed && sd <= ed;
    }).map(function(t){
      var sd = normDate(t.date_debut || t.dateDebut);
      var ed = normDate(t.date_echeance || t.dateEcheance);
      // frappe-gantt exige que end soit > start (au moins 1 jour)
      if (sd === ed) {
        var d = new Date(ed); d.setDate(d.getDate() + 1);
        ed = d.toISOString().substring(0, 10);
      }
      return {
        id: String(t.id),
        name: (t.projetCode?t.projetCode+' · ':'') + (t.titre||''),
        start: sd,
        end:   ed,
        progress: parseInt(t.progression,10) || 0,
        dependencies: ''
      };
    });
    var container = document.getElementById('gantt-container');
    if (!container) return;
    if (!tasks.length) {
      container.innerHTML = '<div style="color:var(--text-3);padding:2rem;text-align:center;font-size:0.82rem">Aucune tâche avec dates (début + échéance) à afficher.</div>';
      window._ganttInstance = null;
      return;
    }
    container.innerHTML = '<svg id="gantt-svg"></svg>';
    if (typeof Gantt === 'undefined') {
      container.innerHTML = '<div style="color:var(--red);padding:1rem">Bibliothèque frappe-gantt non chargée.</div>';
      return;
    }
    try {
      window._ganttInstance = new Gantt('#gantt-svg', tasks, {
        view_mode: (document.getElementById('gantt-scale')||{}).value || 'Week',
        language: 'fr',
        bar_height: 24,
        padding: 18,
        column_width: 45,
        on_click: function(task){ editTache(task.id); },
        on_date_change: function() {},
        on_progress_change: function() {},
        custom_popup_html: function(task) {
          return '<div class="details-container" style="padding:8px 12px;background:var(--bg-card,#1a1a2e);border:1px solid var(--border,#333);border-radius:6px;color:var(--text-1,#fff);font-size:0.8rem">' +
            '<b>' + task.name + '</b><br>' +
            '<span style="color:var(--text-3)">' + task.progress + '% terminé</span>' +
            '</div>';
        }
      });
    } catch (e) {
      container.innerHTML = '<div style="color:var(--red);padding:1rem">Erreur Gantt : '+e.message+'</div>';
    }
  });
}

// ═══════════════════════════════════════════════════════════════
//  CHARGE DE TRAVAIL — capacité vs planifié
// ═══════════════════════════════════════════════════════════════

function renderChargePage() {
  var df = (document.getElementById('charge-from')||{}).value;
  var dt = (document.getElementById('charge-to')||{}).value;
  if (!df || !dt) {
    var today = new Date();
    var weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
    if (!df) { document.getElementById('charge-from').value = today.toISOString().split('T')[0]; df = today.toISOString().split('T')[0]; }
    if (!dt) { document.getElementById('charge-to').value = weekEnd.toISOString().split('T')[0]; dt = weekEnd.toISOString().split('T')[0]; }
  }
  loadTaches().then(function(list){
    var membres = getMembres();
    var byMember = {};
    membres.forEach(function(m){
      var n = ((m.prenom||'')+' '+(m.nom||'')).trim();
      if (!n) return;
      byMember[n] = { membre: m, planifie: 0, tasks: [] };
    });
    var d1 = new Date(df), d2 = new Date(dt);
    (list||[]).forEach(function(t){
      if (!t.assignee) return;
      if (t.statut === 'Terminé') return;
      var td = t.date_debut || t.dateDebut;
      var te = t.date_echeance || t.dateEcheance;
      // Inclure si chevauchement avec la période
      if (td && te) {
        var ts = new Date(td), tend = new Date(te);
        if (tend < d1 || ts > d2) return;
      }
      var he = parseFloat(t.heures_estimees)||0;
      if (!byMember[t.assignee]) byMember[t.assignee] = { membre: { prenom:'', nom:t.assignee, heures_mois:160, color:'#c8a96e' }, planifie:0, tasks:[] };
      byMember[t.assignee].planifie += he;
      byMember[t.assignee].tasks.push(t);
    });
    // Capacité hebdo = heures_mois / 4 ; ajuster selon longueur période
    var periodDays = Math.max(1, Math.round((d2-d1)/86400000) + 1);
    var wrap = document.getElementById('charge-wrap');
    if (!wrap) return;
    var html = '';
    var names = Object.keys(byMember);
    if (!names.length) { wrap.innerHTML = '<div style="color:var(--text-3);font-size:0.82rem">Aucun collaborateur.</div>'; return; }
    names.forEach(function(n){
      var d = byMember[n];
      var capWeek = parseFloat(d.membre.heures_mois || 160) / 4;
      var capacite = capWeek * (periodDays / 7);
      var pct = capacite > 0 ? Math.round(d.planifie / capacite * 100) : 0;
      var color = d.membre.color || '#c8a96e';
      var barColor = pct > 100 ? '#c0392b' : (pct > 80 ? '#d18e1e' : color);
      html += '<div style="margin-bottom:1rem">';
      html += '<div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:0.3rem">';
      html += '<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:'+color+';margin-right:0.4rem"></span>'+n+'</span>';
      html += '<span style="color:var(--text-3)">'+d.planifie.toFixed(1)+' h / '+capacite.toFixed(1)+' h <strong style="color:'+barColor+'">('+pct+'%)</strong></span>';
      html += '</div>';
      html += '<div style="height:8px;background:var(--bg-2);border-radius:4px;overflow:hidden"><div style="height:100%;width:'+Math.min(pct,100)+'%;background:'+barColor+';transition:width .3s"></div></div>';
      if (d.tasks.length) {
        html += '<div style="font-size:0.72rem;color:var(--text-3);margin-top:0.3rem">'+d.tasks.length+' tâche(s) active(s)</div>';
      }
      html += '</div>';
    });
    wrap.innerHTML = html;
  });
}

// ═══════════════════════════════════════════════════════════════
//  AJOUT COULEUR MEMBRE — fiche membre
// ═══════════════════════════════════════════════════════════════

(function(){
  // Hook saveMembre pour inclure color si un input existe
  if (typeof saveMembre === 'function') {
    var _origSaveMembre = saveMembre;
    window.saveMembre = function() {
      var colorEl = document.getElementById('membre-color');
      if (colorEl && window._lastMembrePayload) {
        window._lastMembrePayload.color = colorEl.value || '#c8a96e';
      }
      return _origSaveMembre.apply(this, arguments);
    };
  }
})();

// ═══════════════════════════════════════════════════════════════
//  DA — Workflow avancé (déposé / en attente / prêt / réponse)
// ═══════════════════════════════════════════════════════════════

function _daRefreshWorkflow() {
  var statut = (document.getElementById('da-statut')||{}).value || '';
  var box = document.getElementById('da-workflow-box');
  if (!box) return;
  var dep = document.getElementById('da-wf-depose');
  var man = document.getElementById('da-wf-manquants');
  var pre = document.getElementById('da-wf-pret');
  var rep = document.getElementById('da-wf-reponse');
  if (dep) dep.style.display = 'none';
  if (man) man.style.display = 'none';
  if (pre) pre.style.display = 'none';
  if (rep) rep.style.display = 'none';
  var show = false;
  if (statut === 'Déposé' || statut === 'Envoyée') { if (dep) dep.style.display = ''; show = true; }
  if (statut === 'En attente de documents')        { if (man) man.style.display = ''; show = true; }
  if (statut === 'Prêt à déposer')                 { if (pre) pre.style.display = ''; show = true; }
  if (statut === 'Réponse reçue')                  {
    if (rep) rep.style.display = '';
    onDAReponseChange();
    show = true;
  }
  box.style.display = show ? '' : 'none';

  // Hook upload si visible
  var fIn = document.getElementById('da-justificatif-file');
  if (fIn && !fIn._daHooked) {
    fIn.addEventListener('change', _daUploadJustificatif);
    fIn._daHooked = true;
  }
}

function onDAReponseChange() {
  var rt = (document.getElementById('da-reponse-type')||{}).value || '';
  var wrap = document.getElementById('da-reponse-clone-wrap');
  if (wrap) wrap.style.display = (rt === 'negative') ? 'flex' : 'none';
}

function _daRenderManquants(data) {
  var wrap = document.getElementById('da-manquants-list');
  if (!wrap) return;
  // Source = liste des pièces paramétrée (identique à la checklist "Pièces jointes")
  var allDocs = (typeof getDADocs === 'function') ? (getDADocs() || []).slice() : [];
  // Pièces déjà marquées manquantes sur cette demande
  var already = [];
  if (data && data.documents_manquants) {
    try { already = Array.isArray(data.documents_manquants) ? data.documents_manquants : JSON.parse(data.documents_manquants); } catch(e) { already = []; }
  }
  // Inclure les pièces custom qui ne sont pas dans la liste paramétrée
  already.forEach(function(d){ if (allDocs.indexOf(d) === -1) allDocs.push(d); });

  var html = '';
  allDocs.forEach(function(doc){
    var checked = already.indexOf(doc) !== -1 ? 'checked' : '';
    var safe = String(doc).replace(/"/g,'&quot;');
    html += '<label style="display:flex;align-items:center;gap:0.5rem;font-size:0.8rem;cursor:pointer;padding:0.2rem 0.3rem;border-radius:3px">';
    html += '<input type="checkbox" class="da-manquant-check" value="'+escHtml(doc)+'" '+checked+' />';
    html += '<span style="flex:1">'+escHtml(doc)+'</span>';
    html += '<button type="button" class="suivi-del" onclick="_daRemoveManquant(this, \''+safe.replace(/'/g,"\\'")+'\')" title="Retirer" style="background:none;border:none;color:#e07070;cursor:pointer;font-size:0.8rem">✕</button>';
    html += '</label>';
  });
  // Ligne d'ajout personnalisé
  html += '<div style="display:flex;gap:0.4rem;margin-top:0.5rem;padding-top:0.5rem;border-top:1px dashed var(--border)">';
  html += '<input type="text" id="da-manquant-new" class="form-input" placeholder="+ Ajouter une pièce personnalisée…" style="flex:1;font-size:0.78rem" onkeypress="if(event.key===\'Enter\'){event.preventDefault();_daAddManquant();}" />';
  html += '<button type="button" class="btn btn-sm" onclick="_daAddManquant()">Ajouter</button>';
  html += '</div>';
  wrap.innerHTML = html;
}

function _daAddManquant() {
  var inp = document.getElementById('da-manquant-new');
  if (!inp) return;
  var val = (inp.value || '').trim();
  if (!val) return;
  var wrap = document.getElementById('da-manquants-list');
  // Vérifier doublon
  var dupli = false;
  wrap.querySelectorAll('.da-manquant-check').forEach(function(cb){
    if (cb.value === val) dupli = true;
  });
  if (dupli) { showToast('Pièce déjà présente', 'error'); return; }
  // Ajouter la nouvelle ligne (cochée par défaut puisqu'on la crée comme manquante)
  var safe = val.replace(/'/g,"\\'");
  var label = document.createElement('label');
  label.style.cssText = 'display:flex;align-items:center;gap:0.5rem;font-size:0.8rem;cursor:pointer;padding:0.2rem 0.3rem;border-radius:3px';
  label.innerHTML = '<input type="checkbox" class="da-manquant-check" value="'+escHtml(val)+'" checked /><span style="flex:1">'+escHtml(val)+'</span><button type="button" onclick="_daRemoveManquant(this, \''+safe+'\')" title="Retirer" style="background:none;border:none;color:#e07070;cursor:pointer;font-size:0.8rem">✕</button>';
  // Insérer avant la ligne d'ajout
  var addLine = inp.parentElement;
  wrap.insertBefore(label, addLine);
  inp.value = '';
  inp.focus();
}

function _daRemoveManquant(btn, val) {
  var label = btn.closest('label');
  if (label) label.remove();
}

function _daUploadJustificatif() {
  var fIn = document.getElementById('da-justificatif-file');
  if (!fIn || !fIn.files || !fIn.files[0]) return;
  var id = document.getElementById('da-edit-id').value;
  if (!id) {
    showToast('Enregistrez d\'abord la demande avant d\'uploader le justificatif', 'error');
    fIn.value = '';
    return;
  }
  var fd = new FormData();
  fd.append('file', fIn.files[0]);
  fd.append('demande_id', id);
  var token = sessionStorage.getItem('cortoba_token') || '';
  fetch('api/upload_da_justif.php', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token },
    body: fd
  }).then(function(r){ return r.json(); }).then(function(res){
    if (res && res.success) {
      showToast('✓ Justificatif envoyé');
      if (window._daCurrentEdit) window._daCurrentEdit.justificatif_url = res.data.url;
      var cur = document.getElementById('da-justificatif-current');
      if (cur) cur.innerHTML = '<a href="'+res.data.url+'" target="_blank" style="color:var(--accent)">📎 '+res.data.filename+'</a>';
    } else {
      showToast('Erreur : '+(res && res.error ? res.error : 'upload échoué'), 'error');
    }
  }).catch(function(e){ showToast('Erreur : '+e.message, 'error'); });
}

function cloneDAForRedepot() {
  var id = document.getElementById('da-edit-id').value;
  if (!id) { showToast('Enregistrez d\'abord la demande', 'error'); return; }
  if (!confirm('Cloner cette demande en brouillon pour redépôt ?')) return;
  apiFetch('api/demandes_admin.php?action=clone&id='+id, { method:'POST', body:{} }).then(function(r){
    showToast('✓ Demande clonée (nouveau brouillon)');
    closeModal('modal-demande-admin');
    renderDemandesAdminPage();
  }).catch(function(e){ showToast('Erreur : '+e.message, 'error'); });
}

function createDATaskFromDA() {
  var d = window._daCurrentEdit;
  if (!d || !d.projet_id) {
    showToast('Liez cette demande à un projet pour créer une tâche', 'error');
    return;
  }
  closeModal('modal-demande-admin');
  setTimeout(function(){
    openSuiviModal(1, null, d.projet_id);
    var t = document.getElementById('tache-titre');
    if (t) t.value = 'Dépôt : ' + (d.objet || d.type_demande || '');
    var loc = document.getElementById('tache-location-type'); if (loc) loc.value = 'Administration';
    var zone = document.getElementById('tache-location-zone'); if (zone) zone.value = d.administration || '';
  }, 200);
}

// Helper pour récupérer la couleur d'un membre par son nom
function getMemberColor(fullName) {
  if (!fullName) return '#c8a96e';
  var m = (getMembres()||[]).find(function(x){
    var n = ((x.prenom||'')+' '+(x.nom||'')).trim();
    return n === fullName;
  });
  return (m && m.color) || '#c8a96e';
}
window.getMemberColor = getMemberColor;

// ═══════════════════════════════════════════════════════════
//  MODULE CONGÉS — soldes, demandes, heatmap, admin
// ═══════════════════════════════════════════════════════════
var _congesState = { current: null, heatmap: null, isManager: false, decideId: null };

function _cgFmtDate(s){
  if (!s) return '—';
  var d = new Date(s);
  if (isNaN(d)) return s;
  return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' });
}
function _cgEscape(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

function _cgIsManager(){
  // Heuristique : rôle admin / gerant / non-membre
  try {
    var token = sessionStorage.getItem('cortoba_token');
    if (!token) return false;
    var parts = token.split('.');
    if (parts.length !== 3) return false;
    var payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
    var role = (payload.role || '').toLowerCase();
    if (['admin','gerant','gérant','manager','directeur'].indexOf(role) !== -1) return true;
    if (!payload.isMember) return true;
    return false;
  } catch(e){ return false; }
}

function switchCongeTab(tab, btn){
  document.querySelectorAll('.cg-tab').forEach(function(b){
    b.classList.remove('active');
    b.style.color = 'var(--text-3)';
    b.style.borderBottomColor = 'transparent';
  });
  if (btn){
    btn.classList.add('active');
    btn.style.color = 'var(--text-2)';
    btn.style.borderBottomColor = 'var(--accent)';
  }
  document.getElementById('cg-panel-mine').style.display  = tab === 'mine'  ? '' : 'none';
  document.getElementById('cg-panel-admin').style.display = tab === 'admin' ? '' : 'none';
  var tcPanel = document.getElementById('cg-panel-teamcal');
  if (tcPanel) tcPanel.style.display = tab === 'teamcal' ? '' : 'none';
  if (tab === 'admin') renderCongesAdmin();
  if (tab === 'teamcal') renderTeamCalendar();
}

function renderCongesPage(){
  _congesState.isManager = _cgIsManager();
  var tabAdmin = document.getElementById('cg-tab-admin');
  if (tabAdmin) tabAdmin.style.display = _congesState.isManager ? '' : 'none';
  if (_congesState.isManager) {
    _ensureTeamCalTab();
    refreshCongesPendingBadge();
  }
  // Charger les fériés globalement
  _cgLoadHolidays().catch(function(){});
  renderCongesMine();
}

// ── Vue collaborateur ──
function renderCongesMine(){
  // Soldes
  apiFetch('api/conges.php?action=balance').then(function(r){
    var d = r.data || r;
    var bal = d.balance || {};
    var usage = d.usage || {};
    var annuels = parseFloat(bal.conges_annuels || 0);
    var mal = parseFloat(bal.maladie || 0);
    var rec = parseFloat(bal.recuperation || 0);
    var pending = 0;
    Object.keys(usage).forEach(function(k){ pending += parseFloat(usage[k].pending || 0); });
    document.getElementById('cg-solde-annuels').textContent = annuels.toFixed(1).replace(/\.0$/,'') + ' j';
    document.getElementById('cg-solde-maladie').textContent = mal.toFixed(1).replace(/\.0$/,'') + ' j';
    document.getElementById('cg-solde-recup').textContent   = rec.toFixed(1).replace(/\.0$/,'') + ' j';
    document.getElementById('cg-solde-pending').textContent = pending.toFixed(1).replace(/\.0$/,'') + ' j';
  }).catch(function(e){ console.warn('[conges] balance', e); });

  // Historique perso
  apiFetch('api/conges.php?action=list').then(function(r){
    var list = r.data || r || [];
    var el = document.getElementById('cg-mes-demandes');
    if (!list.length){
      el.innerHTML = '<div style="color:var(--text-3);padding:1rem;text-align:center">Aucune demande pour le moment.</div>';
      return;
    }
    var html = '<table style="width:100%;border-collapse:collapse;font-size:0.78rem"><thead><tr style="color:var(--text-3);text-align:left;border-bottom:1px solid var(--border)">'
      + '<th style="padding:0.5rem 0.4rem">Période</th><th>Type</th><th>Jours</th><th>Statut</th><th></th></tr></thead><tbody>';
    list.forEach(function(r){
      var color = r.statut === 'Approuvé' ? '#3fa66a' : r.statut === 'Refusé' ? '#d45656' : r.statut === 'Annulé' ? '#888' : '#d4a64a';
      html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">'
        + '<td style="padding:0.55rem 0.4rem">' + _cgFmtDate(r.date_debut) + ' → ' + _cgFmtDate(r.date_fin) + '</td>'
        + '<td>' + _cgEscape(r.type) + '</td>'
        + '<td>' + parseFloat(r.jours||0).toFixed(1).replace(/\.0$/,'') + ' j</td>'
        + '<td><span style="color:' + color + ';font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em">' + _cgEscape(r.statut) + '</span></td>'
        + '<td style="text-align:right">';
      if (r.statut === 'En attente'){
        html += '<button class="btn btn-sm" onclick="cancelConge(\'' + r.id + '\')" style="font-size:0.7rem">Annuler</button>';
      }
      if (r.justificatif_url){
        html += ' <a href="' + _cgEscape(r.justificatif_url) + '" target="_blank" title="Voir le justificatif" style="color:var(--accent);text-decoration:none">📎</a>';
      }
      if (r.commentaire_admin){
        html += ' <span title="' + _cgEscape(r.commentaire_admin) + '" style="cursor:help;color:var(--text-3)">💬</span>';
      }
      html += '</td></tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  }).catch(function(e){
    document.getElementById('cg-mes-demandes').innerHTML = '<div style="color:var(--red);padding:1rem">Erreur : ' + _cgEscape(e.message) + '</div>';
  });

  // Heatmap (période : aujourd'hui → +3 mois)
  var today = new Date();
  var from = today.toISOString().slice(0,10);
  var end = new Date(today.getFullYear(), today.getMonth()+3, 0);
  var to = end.toISOString().slice(0,10);
  Promise.all([
    apiFetch('api/conges.php?action=heatmap&from=' + from + '&to=' + to),
    apiFetch('api/conges.php?action=team_shared&from=' + from + '&to=' + to).catch(function(){ return { data: [] }; })
  ]).then(function(results){
    var d  = results[0].data || results[0];
    var ts = results[1].data || results[1] || [];
    _congesState.heatmap = d.days || {};
    _congesState.teamAbsences = _cgBuildTeamAbsenceMap(ts);
    renderHeatmap('cg-heatmap', _congesState.heatmap, from, to, _congesState.teamAbsences);
  }).catch(function(e){
    document.getElementById('cg-heatmap').innerHTML = '<div style="color:var(--red);padding:1rem;font-size:0.78rem">Erreur heatmap : ' + _cgEscape(e.message) + '</div>';
  });
}

// Construit un index date → [absences équipe] à partir d'une liste de congés partagés
function _cgBuildTeamAbsenceMap(list){
  var map = {};
  (list || []).forEach(function(c){
    var s = new Date(c.date_debut); var e = new Date(c.date_fin);
    if (isNaN(s) || isNaN(e)) return;
    var cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    while (cur <= e) {
      var k = cur.getFullYear() + '-' + String(cur.getMonth()+1).padStart(2,'0') + '-' + String(cur.getDate()).padStart(2,'0');
      if (!map[k]) map[k] = [];
      map[k].push({ name: c.user_name, type: c.type });
      cur.setDate(cur.getDate() + 1);
    }
  });
  return map;
}

// ── Heatmap (calendrier mensuel simplifié) ──
// teamAbsences : map { 'YYYY-MM-DD' => [{name, type}, ...] } pour overlay "sous-effectif"
function renderHeatmap(containerId, days, from, to, teamAbsences){
  var el = document.getElementById(containerId);
  if (!el) return;
  var start = new Date(from); var end = new Date(to);
  if (isNaN(start) || isNaN(end)) { el.innerHTML = ''; return; }
  teamAbsences = teamAbsences || {};

  var monthsHtml = '';
  var cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end){
    var y = cur.getFullYear(); var m = cur.getMonth();
    var first = new Date(y, m, 1);
    var last  = new Date(y, m+1, 0);
    var monthName = cur.toLocaleDateString('fr-FR', { month:'long', year:'numeric' });
    monthsHtml += '<div style="margin-bottom:1rem">';
    monthsHtml += '<div style="font-size:0.75rem;color:var(--text-2);text-transform:capitalize;margin-bottom:0.4rem;font-weight:500">' + monthName + '</div>';
    monthsHtml += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px">';
    // Labels jours
    ['L','M','M','J','V','S','D'].forEach(function(lbl){
      monthsHtml += '<div style="font-size:0.6rem;color:var(--text-3);text-align:center;padding:2px">' + lbl + '</div>';
    });
    // Offset (Lundi = 1)
    var offset = (first.getDay() + 6) % 7;
    for (var i = 0; i < offset; i++) monthsHtml += '<div></div>';
    for (var d = 1; d <= last.getDate(); d++){
      var key = y + '-' + String(m+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
      var info = days[key];
      var lvl = info ? info.level : 'green';
      var bg = lvl === 'red' ? '#d45656' : lvl === 'yellow' ? '#d4a64a' : '#3fa66a';
      var dayDate = new Date(y, m, d);
      var dow = dayDate.getDay();
      var isWeekend = (dow === 0 || dow === 6);
      var hol = (_congesState.holidays || {})[key];
      if (hol) { bg = parseInt(hol.pont||0,10) ? 'rgba(155,107,214,0.25)' : 'rgba(255,255,255,0.12)'; }
      else if (isWeekend){ bg = 'rgba(255,255,255,0.04)'; }
      var items = info && info.items ? info.items : [];
      var tipLines = items.map(function(it){
        return '• ' + it.titre + (it.projet ? ' — ' + it.projet : '') + ' (échéance ' + _cgFmtDate(it.date_echeance) + ')';
      });
      // Overlay "sous-effectif" si au moins un membre en congé partagé ce jour-là
      var absents = teamAbsences[key] || [];
      var extraBorder = '';
      var absentBadge = '';
      if (absents.length && !isWeekend) {
        extraBorder = ';box-shadow:inset 0 0 0 2px #9b6bd6';
        var names = absents.map(function(a){ return a.name + (a.type ? ' (' + a.type + ')' : ''); }).join(', ');
        tipLines.push('');
        tipLines.push('⚠ Sous-effectif : ' + absents.length + ' absent(s) — ' + names);
        absentBadge = '<div style="position:absolute;top:-4px;right:-4px;background:#9b6bd6;color:#fff;font-size:0.55rem;min-width:14px;height:14px;padding:0 3px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-weight:700;border:1px solid var(--bg-1)">' + absents.length + '</div>';
      }
      if (hol) { tipLines.unshift('🏷 ' + hol.libelle + (parseInt(hol.pont||0,10) ? ' (pont)' : ' (férié)')); }
      var tip = tipLines.length
        ? tipLines.join('\n')
        : (isWeekend ? 'Week-end' : 'Aucune deadline majeure — disponibilité normale');
      monthsHtml += '<div class="cg-hm-cell" data-key="' + key + '" title="' + _cgEscape(tip) + '" '
        + 'style="position:relative;background:' + bg + ';color:#fff;font-size:0.65rem;text-align:center;padding:6px 2px;border-radius:3px;cursor:help;font-weight:500;opacity:' + ((isWeekend||hol)?'0.5':'1') + extraBorder + '">'
        + d + absentBadge + '</div>';
    }
    monthsHtml += '</div></div>';
    cur.setMonth(cur.getMonth() + 1);
  }
  el.innerHTML = monthsHtml;
}

// ── Formulaire nouvelle demande ──
function openCongeForm(){
  document.getElementById('cg-type').value = 'Congés annuels';
  document.getElementById('cg-date-debut').value = '';
  document.getElementById('cg-date-fin').value = '';
  document.getElementById('cg-jours').value = '0';
  document.getElementById('cg-motif').value = '';
  document.getElementById('cg-delegation').value = '';
  document.getElementById('cg-warning').style.display = 'none';
  _ensureCongeJustifField();
  var justifInput = document.getElementById('cg-justif-file');
  if (justifInput) justifInput.value = '';
  openModal('modal-conge');

  // Charger la heatmap dans le modal et la rendre cliquable
  var today = new Date();
  var from = today.toISOString().slice(0,10);
  var end = new Date(today.getFullYear(), today.getMonth()+3, 0);
  var to = end.toISOString().slice(0,10);
  var wrap = document.getElementById('cg-modal-heatmap');
  if (wrap) wrap.innerHTML = '<div style="color:var(--text-3);padding:0.5rem">Chargement du calendrier de charge…</div>';
  var useCached = _congesState.heatmap && Object.keys(_congesState.heatmap).length;
  var loader = useCached
    ? Promise.resolve({ data: { days: _congesState.heatmap } })
    : apiFetch('api/conges.php?action=heatmap&from=' + from + '&to=' + to);
  loader.then(function(r){
    var d = r.data || r;
    _congesState.heatmap = d.days || _congesState.heatmap || {};
    renderHeatmap('cg-modal-heatmap', _congesState.heatmap, from, to, _congesState.teamAbsences || {});
    // Rendre les cases cliquables pour sélectionner début / fin
    var cells = document.querySelectorAll('#cg-modal-heatmap .cg-hm-cell');
    cells.forEach(function(cell){
      cell.style.cursor = 'pointer';
      cell.addEventListener('click', function(){
        var key = cell.getAttribute('data-key');
        if (!key) return;
        var d1 = document.getElementById('cg-date-debut');
        var d2 = document.getElementById('cg-date-fin');
        if (!d1.value || (d1.value && d2.value)) {
          d1.value = key; d2.value = '';
        } else if (key < d1.value) {
          d1.value = key;
        } else {
          d2.value = key;
        }
        onCongeDatesChange();
        highlightModalHeatmapSelection();
      });
    });
    highlightModalHeatmapSelection();
  }).catch(function(e){
    if (wrap) wrap.innerHTML = '<div style="color:var(--red);padding:0.5rem;font-size:0.75rem">Erreur : ' + _cgEscape(e.message) + '</div>';
  });
}

function highlightModalHeatmapSelection(){
  var d1 = document.getElementById('cg-date-debut').value;
  var d2 = document.getElementById('cg-date-fin').value;
  document.querySelectorAll('#cg-modal-heatmap .cg-hm-cell').forEach(function(c){
    c.style.outline = '';
    c.style.transform = '';
    c.style.boxShadow = '';
    var k = c.getAttribute('data-key');
    if (!k) return;
    if (d1 && !d2 && k === d1) { c.style.outline = '2px solid #fff'; c.style.transform = 'scale(1.08)'; }
    else if (d1 && d2 && k >= d1 && k <= d2) { c.style.outline = '2px solid #fff'; c.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.3)'; }
  });
}

function onCongeDatesChange(){
  var d1 = document.getElementById('cg-date-debut').value;
  var d2 = document.getElementById('cg-date-fin').value;
  if (!d1 || !d2) { document.getElementById('cg-jours').value = '0'; return; }
  // Compte jours ouvrés (lun-ven)
  var s = new Date(d1); var e = new Date(d2);
  if (e < s) { document.getElementById('cg-jours').value = '0'; return; }
  var count = 0;
  var hols = _congesState.holidays || {};
  var cur = new Date(s);
  while (cur <= e){
    var dow = cur.getDay();
    var kk = cur.getFullYear() + '-' + String(cur.getMonth()+1).padStart(2,'0') + '-' + String(cur.getDate()).padStart(2,'0');
    if (dow !== 0 && dow !== 6 && !hols[kk]) count++;
    cur.setDate(cur.getDate()+1);
  }
  document.getElementById('cg-jours').value = count;

  // Alerte préventive — inspection de la heatmap locale
  var warn = document.getElementById('cg-warning');
  if (_congesState.heatmap){
    var red = 0, yellow = 0, redItems = [];
    var cur2 = new Date(s);
    while (cur2 <= e){
      var k = cur2.toISOString().slice(0,10);
      var info = _congesState.heatmap[k];
      if (info){
        if (info.level === 'red') { red++; (info.items||[]).forEach(function(it){ if (redItems.indexOf(it.titre)===-1) redItems.push(it.titre); }); }
        else if (info.level === 'yellow') yellow++;
      }
      cur2.setDate(cur2.getDate()+1);
    }
    if (red > 0){
      warn.innerHTML = '<strong>⚠ Attention — charge élevée sur cette période.</strong><br>'
        + 'Vous avez ' + redItems.length + ' livrable(s) critique(s) en chevauchement : '
        + redItems.slice(0,3).map(_cgEscape).join(', ')
        + (redItems.length > 3 ? '…' : '')
        + '.<br>Assurez-vous d\'avoir organisé une passation solide avant de soumettre.';
      warn.style.display = '';
    } else if (yellow > 0){
      warn.innerHTML = '<strong>ℹ Charge moyenne</strong> sur cette période — tâches actives en cours, gérable avec passation.';
      warn.style.display = '';
      warn.style.background = 'rgba(212,166,74,0.08)';
      warn.style.borderColor = 'rgba(212,166,74,0.3)';
      warn.style.color = '#d4a64a';
    } else {
      warn.style.display = 'none';
    }
  }
}

function submitCongeRequest(){
  var body = {
    type:        document.getElementById('cg-type').value,
    date_debut:  document.getElementById('cg-date-debut').value,
    date_fin:    document.getElementById('cg-date-fin').value,
    motif:       document.getElementById('cg-motif').value,
    delegation:  document.getElementById('cg-delegation').value.trim(),
  };
  if (!body.date_debut || !body.date_fin) return alert('Dates requises');
  if (!body.delegation)                   return alert('La délégation / passation est obligatoire');
  apiFetch('api/conges.php?action=create', { method:'POST', body: body })
    .then(function(r){
      var d = r.data || r;
      // Upload justificatif si fichier sélectionné
      var uploadP = _uploadCongeJustif(d.id).catch(function(ue){
        console.warn('[conges] upload justif error', ue);
      });
      return uploadP.then(function(){ return d; });
    })
    .then(function(d){
      var msg = 'Demande soumise (' + d.jours + ' jour(s) ouvrés). En attente de validation.';
      if (d.conflicts && d.conflicts.length){
        msg += '\n\n⚠ Conflits potentiels détectés :\n' + d.conflicts.map(function(c){
          return '• ' + c.user_name + ' — ' + c.date_debut + ' → ' + c.date_fin + ' (' + c.statut + ')';
        }).join('\n');
      }
      alert(msg);
      closeModal('modal-conge');
      renderCongesMine();
      refreshCongesPendingBadge();
    })
    .catch(function(e){ alert('Erreur : ' + e.message); });
}

function cancelConge(id){
  if (!confirm('Annuler cette demande ?')) return;
  apiFetch('api/conges.php?action=cancel&id=' + encodeURIComponent(id), { method:'POST', body: {} })
    .then(function(){ renderCongesMine(); refreshCongesPendingBadge(); })
    .catch(function(e){ alert('Erreur : ' + e.message); });
}

// ── Vue admin ──
function renderCongesAdmin(){
  renderCongesHolidays();
  // Demandes en attente + historique
  apiFetch('api/conges.php?action=list').then(function(r){
    var list = r.data || r || [];
    var pending = list.filter(function(x){ return x.statut === 'En attente'; });
    var history = list.filter(function(x){ return x.statut !== 'En attente'; });
    renderCongesAdminTable('cg-admin-pending', pending, true);
    renderCongesAdminTable('cg-admin-history', history, false);
  }).catch(function(e){
    document.getElementById('cg-admin-pending').innerHTML = '<div style="color:var(--red);padding:1rem">' + _cgEscape(e.message) + '</div>';
  });

  // Soldes équipe
  apiFetch('api/conges.php?action=balances').then(function(r){
    var list = r.data || r || [];
    var el = document.getElementById('cg-admin-balances');
    if (!list.length){ el.innerHTML = '<div style="color:var(--text-3);padding:0.8rem">Aucun membre.</div>'; return; }
    var html = '<table style="width:100%;border-collapse:collapse"><thead><tr style="color:var(--text-3);text-align:left;border-bottom:1px solid var(--border)">'
      + '<th style="padding:0.5rem 0.4rem">Collaborateur</th><th>Annuels</th><th>Consommés</th><th>Restants</th><th>Maladie</th><th>Récup.</th></tr></thead><tbody>';
    list.forEach(function(u){
      html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">'
        + '<td style="padding:0.55rem 0.4rem">' + _cgEscape(u.user_name) + '</td>'
        + '<td>' + parseFloat(u.conges_annuels).toFixed(1).replace(/\.0$/,'') + '</td>'
        + '<td>' + parseFloat(u.consomme).toFixed(1).replace(/\.0$/,'') + '</td>'
        + '<td><strong>' + parseFloat(u.restant).toFixed(1).replace(/\.0$/,'') + '</strong></td>'
        + '<td>' + parseFloat(u.maladie).toFixed(1).replace(/\.0$/,'') + '</td>'
        + '<td>' + parseFloat(u.recuperation).toFixed(1).replace(/\.0$/,'') + '</td>'
        + '</tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  }).catch(function(){});
}

function renderCongesAdminTable(containerId, list, withActions){
  var el = document.getElementById(containerId);
  if (!list.length){
    el.innerHTML = '<div style="color:var(--text-3);padding:1rem;text-align:center">' + (withActions ? 'Aucune demande en attente.' : 'Aucun historique.') + '</div>';
    return;
  }
  var html = '<table style="width:100%;border-collapse:collapse"><thead><tr style="color:var(--text-3);text-align:left;border-bottom:1px solid var(--border)">'
    + '<th style="padding:0.5rem 0.4rem">Collab.</th><th>Période</th><th>Type</th><th>Jours</th><th>Délégation</th><th>Statut</th><th></th></tr></thead><tbody>';
  list.forEach(function(r){
    var color = r.statut === 'Approuvé' ? '#3fa66a' : r.statut === 'Refusé' ? '#d45656' : r.statut === 'Annulé' ? '#888' : '#d4a64a';
    // Check conflict : plusieurs demandes qui se chevauchent
    var hasConflict = list.some(function(o){
      if (o.id === r.id) return false;
      if (o.statut !== 'En attente' && o.statut !== 'Approuvé') return false;
      return !(o.date_fin < r.date_debut || o.date_debut > r.date_fin);
    });
    html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">'
      + '<td style="padding:0.55rem 0.4rem">' + _cgEscape(r.user_name) + (hasConflict ? ' <span title="Conflit : chevauchement avec un autre collab." style="color:#d45656">⚠</span>' : '') + '</td>'
      + '<td>' + _cgFmtDate(r.date_debut) + ' → ' + _cgFmtDate(r.date_fin) + '</td>'
      + '<td>' + _cgEscape(r.type) + '</td>'
      + '<td>' + parseFloat(r.jours||0).toFixed(1).replace(/\.0$/,'') + '</td>'
      + '<td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + _cgEscape(r.delegation) + '">' + _cgEscape(r.delegation) + '</td>'
      + '<td><span style="color:' + color + ';font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em">' + _cgEscape(r.statut) + '</span></td>'
      + '<td style="text-align:right">';
    if (withActions){
      html += '<button class="btn btn-sm" onclick="openCongeDecide(\'' + r.id + '\')" style="font-size:0.7rem">Décider</button>';
    } else {
      if (r.statut === 'Approuvé' || r.statut === 'Refusé') {
        html += '<button class="btn btn-sm" onclick="openCongeDecide(\'' + r.id + '\')" style="font-size:0.7rem" title="Modifier la décision">✎ Modifier</button> ';
      }
      if (r.justificatif_url){
        html += ' <a href="' + _cgEscape(r.justificatif_url) + '" target="_blank" title="Justificatif" style="color:var(--accent);text-decoration:none;margin-left:4px">📎</a>';
      }
      if (r.commentaire_admin){
        html += '<span title="' + _cgEscape(r.commentaire_admin) + '" style="cursor:help;color:var(--text-3);margin-left:4px">💬</span>';
      }
      if (r.statut === 'Approuvé' && parseInt(r.partage||0,10) === 0) {
        html += ' <span title="Non partagé avec le calendrier équipe" style="cursor:help;color:var(--text-3);margin-left:4px">🔒</span>';
      }
    }
    html += '</td></tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

// Injecte dynamiquement la case "Partager avec l'équipe" si pas déjà présente dans le DOM
function _ensureDecideExtras(){
  var commentField = document.getElementById('cg-decide-comment');
  if (!commentField) return null;
  if (!document.getElementById('cg-decide-partage-wrap')) {
    var wrap = document.createElement('div');
    wrap.id = 'cg-decide-partage-wrap';
    wrap.className = 'form-field';
    wrap.style.marginTop = '0.6rem';
    wrap.innerHTML =
      '<label style="display:flex;align-items:flex-start;gap:0.55rem;cursor:pointer;font-size:0.8rem;line-height:1.35">'
      + '<input type="checkbox" id="cg-decide-partage" checked style="margin-top:2px">'
      + '<span><strong>Partager avec le calendrier de l\'équipe</strong>'
      + '<span style="display:block;color:var(--text-3);font-size:0.72rem;margin-top:2px">'
      + 'Les autres membres verront ces jours comme <em>sous-effectif</em>. Décocher pour masquer (absence confidentielle).'
      + '</span></span></label>';
    var commentBlock = commentField.closest('.form-field') || commentField.parentNode;
    commentBlock.parentNode.insertBefore(wrap, commentBlock.nextSibling);
  }
  return document.getElementById('cg-decide-partage');
}

function openCongeDecide(id){
  try { console.log('[conges] openCongeDecide', id); } catch(e){}
  // Ouvrir la modale immédiatement avec un état de chargement
  openModal('modal-conge-decide');
  var _tEl = document.getElementById('cg-decide-title');
  var _iEl = document.getElementById('cg-decide-info');
  var _wEl = document.getElementById('cg-decide-workload');
  if (_tEl) _tEl.textContent = 'Chargement…';
  if (_iEl) _iEl.innerHTML = '<div style="color:var(--text-3)">Chargement de la demande…</div>';
  if (_wEl) _wEl.innerHTML = '';

  apiFetch('api/conges.php?action=list').then(function(r){
    var list = r.data || r || [];
    // Comparaison souple string ↔ number pour éviter le strict-equality mismatch
    var req = list.find(function(x){ return String(x.id) === String(id); });
    if (!req) {
      if (_iEl) _iEl.innerHTML = '<div style="color:var(--red)">Demande introuvable (id=' + id + '). Veuillez réessayer.</div>';
      return;
    }
    _congesState.decideId = id;
    var isModif = (req.statut === 'Approuvé' || req.statut === 'Refusé');
    document.getElementById('cg-decide-title').textContent = (isModif ? 'Modifier la décision — ' : 'Demande de ') + req.user_name;
    var statutBadge = '';
    if (isModif) {
      var col = req.statut === 'Approuvé' ? '#3fa66a' : '#d45656';
      statutBadge = '<div style="display:inline-block;padding:2px 8px;border-radius:3px;background:' + col + '22;color:' + col + ';font-size:0.68rem;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.4rem">Décision actuelle : ' + req.statut + '</div><br>';
    }
    document.getElementById('cg-decide-info').innerHTML = statutBadge +
      '<strong>' + _cgEscape(req.type) + '</strong> · ' + _cgFmtDate(req.date_debut) + ' → ' + _cgFmtDate(req.date_fin)
      + ' (' + parseFloat(req.jours||0).toFixed(1).replace(/\.0$/,'') + ' j)'
      + (req.motif ? '<br><em>Motif :</em> ' + _cgEscape(req.motif) : '')
      + '<br><em>Délégation :</em> ' + _cgEscape(req.delegation)
      + (req.justificatif_url ? '<br><a href="' + _cgEscape(req.justificatif_url) + '" target="_blank" style="color:var(--accent)">📎 Voir le justificatif</a>' : '');
    document.getElementById('cg-decide-comment').value = req.commentaire_admin || '';
    // Case "partage" : pré-cocher selon l'état courant (défaut : coché)
    var partageCb = _ensureDecideExtras();
    if (partageCb) {
      var cur = (req.partage == null) ? 1 : parseInt(req.partage, 10);
      partageCb.checked = cur !== 0;
    }
    // Relibeler les boutons si modification
    var btns = document.querySelectorAll('#modal-conge-decide button');
    btns.forEach(function(b){
      if (/Approuver|Basculer → Approuvé/i.test(b.textContent)) b.textContent = isModif ? 'Basculer → Approuvé' : 'Approuver';
      if (/^Refuser$|Basculer → Refusé/i.test(b.textContent))   b.textContent = isModif ? 'Basculer → Refusé'   : 'Refuser';
    });

    // Charger le travail restant du collaborateur pendant la période demandée
    var wl = document.getElementById('cg-decide-workload');
    wl.innerHTML = '<div style="color:var(--text-3)">Analyse de la charge en cours…</div>';
    // Fenêtre élargie : 7 jours avant début → 7 jours après fin (période charrette)
    var from = new Date(req.date_debut); from.setDate(from.getDate() - 7);
    var to   = new Date(req.date_fin);   to.setDate(to.getDate() + 7);
    var fromStr = from.toISOString().slice(0,10);
    var toStr   = to.toISOString().slice(0,10);
    apiFetch('api/conges.php?action=heatmap&user_id=' + encodeURIComponent(req.user_id)
             + '&from=' + fromStr + '&to=' + toStr)
      .then(function(rr){
        var dd = rr.data || rr;
        var days = dd.days || {};
        // Agréger les tâches uniques (par titre+projet)
        var seen = {};
        var tasks = [];
        var redDays = 0, yellowDays = 0;
        Object.keys(days).forEach(function(k){
          if (k < req.date_debut || k > req.date_fin) {
            // Compté uniquement pour le listing, pas pour le decompte
          } else {
            if (days[k].level === 'red') redDays++;
            else if (days[k].level === 'yellow') yellowDays++;
          }
          (days[k].items || []).forEach(function(it){
            var key = (it.titre || '') + '|' + (it.projet || '') + '|' + (it.date_echeance || '');
            if (seen[key]) return;
            seen[key] = true;
            tasks.push(it);
          });
        });

        // Trier par date d'échéance croissante
        tasks.sort(function(a,b){
          return (a.date_echeance || '') > (b.date_echeance || '') ? 1 : -1;
        });

        // Séparer critiques / normales
        var critical = tasks.filter(function(t){ return t.critical; });
        var normal   = tasks.filter(function(t){ return !t.critical; });

        var html = '';
        // Résumé global
        var summary = [];
        if (redDays > 0)    summary.push('<span style="color:#d45656;font-weight:600">' + redDays + ' jour(s) rouge(s)</span>');
        if (yellowDays > 0) summary.push('<span style="color:#d4a64a;font-weight:600">' + yellowDays + ' jour(s) orange</span>');
        if (!summary.length) summary.push('<span style="color:#3fa66a;font-weight:600">Aucune deadline critique sur la période</span>');
        html += '<div style="margin-bottom:0.6rem">' + summary.join(' · ') + '</div>';

        if (!tasks.length) {
          html += '<div style="color:var(--text-3);font-style:italic">Aucune tâche en cours avec deadline dans cette fenêtre.</div>';
        } else {
          if (critical.length) {
            html += '<div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em;color:#d45656;margin:0.4rem 0 0.3rem">⚠ Livrables critiques</div>';
            html += '<ul style="list-style:none;padding:0;margin:0">';
            critical.forEach(function(t){
              html += '<li style="padding:0.35rem 0.5rem;margin-bottom:0.25rem;background:rgba(212,86,86,0.08);border-left:2px solid #d45656;border-radius:2px">'
                + '<strong>' + _cgEscape(t.titre) + '</strong>'
                + (t.projet ? ' <span style="color:var(--text-3)">— ' + _cgEscape(t.projet) + '</span>' : '')
                + '<br><span style="font-size:0.7rem;color:var(--text-3)">Échéance : ' + _cgFmtDate(t.date_echeance) + ' · ' + _cgEscape(t.priorite || 'Normale') + '</span>'
                + '</li>';
            });
            html += '</ul>';
          }
          if (normal.length) {
            html += '<div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-3);margin:0.6rem 0 0.3rem">Autres tâches en cours</div>';
            html += '<ul style="list-style:none;padding:0;margin:0">';
            normal.forEach(function(t){
              html += '<li style="padding:0.3rem 0.5rem;margin-bottom:0.2rem;background:rgba(255,255,255,0.03);border-left:2px solid var(--border);border-radius:2px">'
                + _cgEscape(t.titre)
                + (t.projet ? ' <span style="color:var(--text-3)">— ' + _cgEscape(t.projet) + '</span>' : '')
                + ' <span style="color:var(--text-3);font-size:0.7rem">(' + _cgFmtDate(t.date_echeance) + ')</span>'
                + '</li>';
            });
            html += '</ul>';
          }
        }
        wl.innerHTML = html;
      })
      .catch(function(e){
        wl.innerHTML = '<div style="color:var(--red)">Erreur chargement charge : ' + _cgEscape(e.message) + '</div>';
      });
  }).catch(function(e){
    try { console.error('[conges] openCongeDecide error', e); } catch(_){}
    var _errEl = document.getElementById('cg-decide-info');
    if (_errEl) _errEl.innerHTML = '<div style="color:var(--red)">Erreur chargement : ' + _cgEscape((e && e.message) || 'Inconnu') + '</div>';
  });
}

function submitCongeDecision(decision){
  var id = _congesState.decideId;
  if (!id) return;
  var commentaire = document.getElementById('cg-decide-comment').value.trim();
  var partageCb = document.getElementById('cg-decide-partage');
  var partage = partageCb ? (partageCb.checked ? 1 : 0) : 1;
  apiFetch('api/conges.php?action=decide&id=' + encodeURIComponent(id), {
    method: 'POST', body: { decision: decision, commentaire: commentaire, partage: partage }
  }).then(function(){
    closeModal('modal-conge-decide');
    renderCongesAdmin();
    refreshCongesPendingBadge();
  }).catch(function(e){ alert('Erreur : ' + e.message); });
}

// ── Badge sidebar : nombre de demandes en attente (admin) ──
function refreshCongesPendingBadge(){
  if (!_cgIsManager()) return;
  apiFetch('api/conges.php?action=list&statut=En attente').then(function(r){
    var n = (r.data || r || []).length;
    var b = document.getElementById('conges-badge');
    if (!b) return;
    if (n > 0) { b.textContent = n; b.style.display = ''; }
    else        { b.style.display = 'none'; }
  }).catch(function(){});
}

// Lancer le badge au chargement
setTimeout(function(){ try { refreshCongesPendingBadge(); } catch(e){} }, 2500);

// ═══════════════════════════════════════════════════════════
//  CONGÉS — Jours fériés (CRUD admin + overlay heatmap)
// ═══════════════════════════════════════════════════════════

// Cache global des jours fériés { 'YYYY-MM-DD': { id, libelle, pont } }
_congesState.holidays = {};
_congesState.holidaysList = [];
_congesState.teamCalYear = new Date().getFullYear();
_congesState.teamCalMonth = new Date().getMonth();

function _cgLoadHolidays(annee){
  annee = annee || new Date().getFullYear();
  return apiFetch('api/conges.php?action=holidays_list&annee=' + annee).then(function(r){
    var list = r.data || r || [];
    _congesState.holidaysList = list;
    _congesState.holidays = {};
    list.forEach(function(h){ _congesState.holidays[h.date] = h; });
    return list;
  });
}

// Injecte le panneau "Jours fériés" dans l'admin
function _ensureHolidaysPanel(){
  if (document.getElementById('cg-admin-holidays')) return;
  var hist = document.querySelector('#cg-panel-admin .card:last-child');
  if (!hist) return;
  var card = document.createElement('div');
  card.className = 'card';
  card.id = 'cg-admin-holidays';
  card.style.marginTop = '1rem';
  card.innerHTML = '<div class="card-title" style="display:flex;justify-content:space-between;align-items:center">'
    + '<span>Jours fériés & ponts</span>'
    + '<button class="btn btn-sm" onclick="openHolidayForm()" style="font-size:0.7rem">+ Ajouter</button>'
    + '</div>'
    + '<div id="cg-holidays-list" style="font-size:0.82rem"><div style="color:var(--text-3);padding:0.8rem;text-align:center">Chargement…</div></div>';
  hist.parentNode.insertBefore(card, hist.nextSibling);
}

function renderCongesHolidays(){
  _ensureHolidaysPanel();
  _cgLoadHolidays().then(function(list){
    var el = document.getElementById('cg-holidays-list');
    if (!el) return;
    if (!list.length){
      el.innerHTML = '<div style="color:var(--text-3);padding:0.8rem;text-align:center">Aucun jour férié défini pour ' + new Date().getFullYear() + '.</div>';
      return;
    }
    var html = '<table style="width:100%;border-collapse:collapse"><thead><tr style="color:var(--text-3);text-align:left;border-bottom:1px solid var(--border)">'
      + '<th style="padding:0.4rem">Date</th><th>Libellé</th><th>Pont</th><th></th></tr></thead><tbody>';
    list.forEach(function(h){
      html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">'
        + '<td style="padding:0.45rem 0.4rem">' + _cgFmtDate(h.date) + '</td>'
        + '<td>' + _cgEscape(h.libelle) + '</td>'
        + '<td>' + (parseInt(h.pont,10) ? '<span style="color:#9b6bd6">Pont</span>' : '—') + '</td>'
        + '<td style="text-align:right">'
        + '<button class="btn btn-sm" onclick="openHolidayForm(' + h.id + ')" style="font-size:0.68rem" title="Modifier">✎</button> '
        + '<button class="btn btn-sm" onclick="deleteHoliday(' + h.id + ')" style="font-size:0.68rem;color:var(--red)" title="Supprimer">✕</button>'
        + '</td></tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  }).catch(function(e){
    var el = document.getElementById('cg-holidays-list');
    if (el) el.innerHTML = '<div style="color:var(--red);padding:0.8rem">' + _cgEscape(e.message) + '</div>';
  });
}

function openHolidayForm(id){
  var existing = id ? (_congesState.holidaysList||[]).find(function(h){ return String(h.id) === String(id); }) : null;
  var html = '<div style="padding:1rem;background:var(--bg-2);border:1px solid var(--border);border-radius:6px;margin-bottom:0.8rem">'
    + '<div style="font-size:0.82rem;font-weight:600;margin-bottom:0.6rem">' + (existing ? 'Modifier le jour férié' : 'Nouveau jour férié') + '</div>'
    + '<div class="form-grid" style="gap:0.6rem">'
    + '<div class="form-field"><label class="form-label">Date</label><input id="hol-date" class="form-input" type="date" value="' + (existing ? existing.date : '') + '" /></div>'
    + '<div class="form-field"><label class="form-label">Libellé</label><input id="hol-libelle" class="form-input" value="' + _cgEscape(existing ? existing.libelle : '') + '" /></div>'
    + '</div>'
    + '<div style="margin-top:0.5rem"><label style="font-size:0.78rem;cursor:pointer"><input type="checkbox" id="hol-pont"' + (existing && parseInt(existing.pont,10) ? ' checked' : '') + '> Jour de pont (facultatif)</label></div>'
    + '<div style="display:flex;gap:0.5rem;margin-top:0.8rem;justify-content:flex-end">'
    + '<button class="btn btn-sm" onclick="renderCongesHolidays()">Annuler</button>'
    + '<button class="btn btn-sm btn-primary" onclick="saveHoliday(' + (id||'null') + ')">Enregistrer</button>'
    + '</div></div>';
  var el = document.getElementById('cg-holidays-list');
  if (el) el.innerHTML = html;
}

function saveHoliday(id){
  var body = {
    date: document.getElementById('hol-date').value,
    libelle: document.getElementById('hol-libelle').value.trim(),
    pont: document.getElementById('hol-pont').checked ? 1 : 0
  };
  if (id) body.id = id;
  if (!body.date || !body.libelle) return alert('Date et libellé requis');
  apiFetch('api/conges.php?action=holidays_save', { method:'POST', body: body }).then(function(){
    showToast('Jour férié enregistré');
    renderCongesHolidays();
  }).catch(function(e){ alert('Erreur : ' + e.message); });
}

function deleteHoliday(id){
  if (!confirm('Supprimer ce jour férié ?')) return;
  apiFetch('api/conges.php?action=holidays_delete&id=' + id, { method:'POST', body:{} }).then(function(){
    showToast('Jour férié supprimé');
    renderCongesHolidays();
  }).catch(function(e){ alert('Erreur : ' + e.message); });
}

// ═══════════════════════════════════════════════════════════
//  CONGÉS — Justificatif (upload dans formulaire demande)
// ═══════════════════════════════════════════════════════════

function _ensureCongeJustifField(){
  if (document.getElementById('cg-justif-wrap')) return;
  var deleg = document.getElementById('cg-delegation');
  if (!deleg) return;
  var wrap = document.createElement('div');
  wrap.id = 'cg-justif-wrap';
  wrap.className = 'form-field full';
  wrap.innerHTML = '<label class="form-label">Justificatif <span style="color:var(--text-3);font-weight:400">(optionnel — recommandé pour Maladie)</span></label>'
    + '<input type="file" id="cg-justif-file" class="form-input" accept=".jpg,.jpeg,.png,.webp,.pdf" style="padding:0.4rem">'
    + '<div style="font-size:0.66rem;color:var(--text-3);margin-top:0.25rem">Formats : JPG, PNG, WebP, PDF · Max 15 Mo</div>';
  var delegBlock = deleg.closest('.form-field') || deleg.parentNode;
  delegBlock.parentNode.insertBefore(wrap, delegBlock.nextSibling);
}

function _uploadCongeJustif(requestId){
  var fileInput = document.getElementById('cg-justif-file');
  if (!fileInput || !fileInput.files || !fileInput.files[0]) return Promise.resolve(null);
  var fd = new FormData();
  fd.append('file', fileInput.files[0]);
  fd.append('request_id', requestId);
  var token = sessionStorage.getItem('cortoba_token');
  return fetch('api/conges.php?action=upload_justif', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token },
    body: fd
  }).then(function(resp){ return resp.json(); });
}

// ═══════════════════════════════════════════════════════════
//  CONGÉS — Calendrier d'équipe (vue admin dédiée)
// ═══════════════════════════════════════════════════════════

function _ensureTeamCalTab(){
  if (document.getElementById('cg-tab-teamcal')) return;
  var adminTab = document.getElementById('cg-tab-admin');
  if (!adminTab) return;
  // Onglet
  var btn = document.createElement('button');
  btn.className = 'cg-tab';
  btn.id = 'cg-tab-teamcal';
  btn.setAttribute('data-cg-tab', 'teamcal');
  btn.onclick = function(){ switchCongeTab('teamcal', btn); };
  btn.style.cssText = 'padding:0.7rem 1.2rem;background:none;border:none;color:var(--text-3);cursor:pointer;font-size:0.78rem;letter-spacing:0.1em;text-transform:uppercase;border-bottom:2px solid transparent';
  btn.textContent = 'Calendrier équipe';
  adminTab.parentNode.insertBefore(btn, adminTab.nextSibling);
  // Panel
  var panel = document.createElement('div');
  panel.className = 'cg-panel';
  panel.id = 'cg-panel-teamcal';
  panel.style.display = 'none';
  var adminPanel = document.getElementById('cg-panel-admin');
  if (adminPanel) adminPanel.parentNode.insertBefore(panel, adminPanel.nextSibling);
}

function renderTeamCalendar(year, month){
  if (year == null) year = _congesState.teamCalYear;
  if (month == null) month = _congesState.teamCalMonth;
  // Clamp
  if (month < 0) { month = 11; year--; }
  if (month > 11) { month = 0; year++; }
  _congesState.teamCalYear = year;
  _congesState.teamCalMonth = month;

  var panel = document.getElementById('cg-panel-teamcal');
  if (!panel) return;
  panel.innerHTML = '<div style="color:var(--text-3);padding:1rem;text-align:center">Chargement du calendrier…</div>';

  var first = new Date(year, month, 1);
  var last  = new Date(year, month+1, 0);
  var from = first.toISOString().slice(0,10);
  var to   = last.toISOString().slice(0,10);

  apiFetch('api/conges.php?action=team_calendar&from=' + from + '&to=' + to).then(function(r){
    var data = r.data || r;
    var leaves   = data.leaves   || [];
    var holidays = data.holidays || [];
    var members  = data.members  || [];

    // Build holiday map
    var holMap = {};
    holidays.forEach(function(h){ holMap[h.date] = h; });

    // Build member absence map: { memberId: { 'YYYY-MM-DD': status } }
    var absMap = {};
    leaves.forEach(function(lv){
      var s = new Date(lv.date_debut);
      var e = new Date(lv.date_fin);
      var c = new Date(s.getFullYear(), s.getMonth(), s.getDate());
      while (c <= e) {
        var k = c.getFullYear() + '-' + String(c.getMonth()+1).padStart(2,'0') + '-' + String(c.getDate()).padStart(2,'0');
        if (!absMap[lv.user_id]) absMap[lv.user_id] = {};
        // Approuvé > En attente (en cas de double entrée)
        if (!absMap[lv.user_id][k] || lv.statut === 'Approuvé') {
          absMap[lv.user_id][k] = { statut: lv.statut, type: lv.type, name: lv.user_name };
        }
        c.setDate(c.getDate() + 1);
      }
    });

    var daysInMonth = last.getDate();
    var monthLabel = first.toLocaleDateString('fr-FR', { month:'long', year:'numeric' });
    var todayStr = new Date().toISOString().slice(0,10);

    var html = '<div class="card">';
    // Nav header
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">';
    html += '<button class="btn btn-sm" onclick="renderTeamCalendar(' + year + ',' + (month-1) + ')" style="font-size:0.75rem">◀ Préc.</button>';
    html += '<div style="font-size:0.92rem;font-weight:600;text-transform:capitalize">' + monthLabel + '</div>';
    html += '<button class="btn btn-sm" onclick="renderTeamCalendar(' + year + ',' + (month+1) + ')" style="font-size:0.75rem">Suiv. ▶</button>';
    html += '</div>';

    // Légende
    html += '<div style="display:flex;gap:1rem;font-size:0.68rem;color:var(--text-3);margin-bottom:0.8rem;flex-wrap:wrap">';
    html += '<span><span style="display:inline-block;width:10px;height:10px;background:#3fa66a;border-radius:2px;margin-right:4px;vertical-align:middle"></span>Approuvé</span>';
    html += '<span><span style="display:inline-block;width:10px;height:10px;background:#d4a64a;border-radius:2px;margin-right:4px;vertical-align:middle"></span>En attente</span>';
    html += '<span><span style="display:inline-block;width:10px;height:10px;background:rgba(255,255,255,0.08);border-radius:2px;margin-right:4px;vertical-align:middle"></span>Férié</span>';
    html += '<span><span style="display:inline-block;width:10px;height:10px;background:rgba(155,107,214,0.25);border-radius:2px;margin-right:4px;vertical-align:middle"></span>Pont</span>';
    html += '</div>';

    // Table
    html += '<div style="overflow-x:auto">';
    html += '<table style="border-collapse:collapse;width:100%;min-width:' + (180 + daysInMonth * 32) + 'px;font-size:0.72rem">';
    // Header: days
    html += '<thead><tr style="border-bottom:1px solid var(--border)">';
    html += '<th style="padding:0.4rem 0.5rem;text-align:left;position:sticky;left:0;background:var(--bg-1);z-index:2;min-width:140px">Collaborateur</th>';
    for (var d = 1; d <= daysInMonth; d++){
      var dayDate = new Date(year, month, d);
      var dow = dayDate.getDay();
      var isWE = (dow === 0 || dow === 6);
      var dk = year + '-' + String(month+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
      var isHol = !!holMap[dk];
      var isToday = dk === todayStr;
      var dayLbl = ['D','L','M','M','J','V','S'][dow];
      var thBg = isHol ? 'rgba(255,255,255,0.08)' : isWE ? 'rgba(255,255,255,0.03)' : 'transparent';
      var thBorder = isToday ? '2px solid var(--accent)' : 'none';
      var holTip = isHol ? ' title="' + _cgEscape(holMap[dk].libelle) + '"' : '';
      html += '<th style="padding:0.25rem 0;text-align:center;min-width:28px;background:' + thBg + ';border-bottom:' + thBorder + '"' + holTip + '>'
        + '<div style="font-size:0.6rem;color:var(--text-3)">' + dayLbl + '</div>'
        + '<div style="' + (isToday ? 'color:var(--accent);font-weight:700' : isWE ? 'color:var(--text-3);opacity:0.5' : '') + '">' + d + '</div></th>';
    }
    html += '</tr></thead><tbody>';

    // Rows: each member
    members.forEach(function(m){
      html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">';
      html += '<td style="padding:0.4rem 0.5rem;white-space:nowrap;position:sticky;left:0;background:var(--bg-1);z-index:1;font-weight:500">' + _cgEscape(m.name) + '</td>';
      for (var d2 = 1; d2 <= daysInMonth; d2++){
        var dk2 = year + '-' + String(month+1).padStart(2,'0') + '-' + String(d2).padStart(2,'0');
        var dayDate2 = new Date(year, month, d2);
        var dow2 = dayDate2.getDay();
        var isWE2 = (dow2 === 0 || dow2 === 6);
        var isHol2 = !!holMap[dk2];
        var isPont = isHol2 && parseInt(holMap[dk2].pont||0,10);
        var cell = absMap[m.id] && absMap[m.id][dk2];
        var bg = 'transparent';
        var tip = '';
        if (cell) {
          if (cell.statut === 'Approuvé') { bg = 'rgba(63,166,106,0.35)'; tip = cell.type + ' (Approuvé)'; }
          else { bg = 'rgba(212,166,74,0.35)'; tip = cell.type + ' (En attente)'; }
        }
        if (isHol2) {
          bg = isPont ? 'rgba(155,107,214,0.2)' : 'rgba(255,255,255,0.07)';
          tip = holMap[dk2].libelle + (cell ? ' + ' + tip : '');
        }
        if (isWE2 && !cell) bg = 'rgba(255,255,255,0.02)';
        html += '<td style="padding:0;text-align:center;background:' + bg + '"' + (tip ? ' title="' + _cgEscape(tip) + '"' : '') + '>'
          + (cell ? '<div style="width:100%;height:24px;border-radius:2px;background:' + (cell.statut==='Approuvé'?'#3fa66a55':'#d4a64a55') + '"></div>' : '')
          + '</td>';
      }
      html += '</tr>';
    });

    html += '</tbody></table></div>';

    // Résumé sous-effectif
    var underStaff = [];
    for (var d3 = 1; d3 <= daysInMonth; d3++){
      var dk3 = year + '-' + String(month+1).padStart(2,'0') + '-' + String(d3).padStart(2,'0');
      var dow3 = new Date(year, month, d3).getDay();
      if (dow3 === 0 || dow3 === 6) continue;
      var count = 0;
      var names = [];
      members.forEach(function(m2){
        var c2 = absMap[m2.id] && absMap[m2.id][dk3];
        if (c2 && c2.statut === 'Approuvé') { count++; names.push(m2.name); }
      });
      if (count >= 2) underStaff.push({ date: dk3, count: count, names: names });
    }
    if (underStaff.length) {
      html += '<div style="margin-top:1rem;padding:0.8rem;background:rgba(155,107,214,0.08);border:1px solid rgba(155,107,214,0.25);border-radius:4px;font-size:0.78rem">'
        + '<strong style="color:#9b6bd6">⚠ Jours sous-effectif (≥2 absents)</strong>';
      underStaff.forEach(function(u){
        html += '<div style="margin-top:0.3rem;color:var(--text-2)">' + _cgFmtDate(u.date) + ' — ' + u.count + ' absent(s) : ' + _cgEscape(u.names.join(', ')) + '</div>';
      });
      html += '</div>';
    }

    html += '</div>'; // card close
    panel.innerHTML = html;
  }).catch(function(e){
    panel.innerHTML = '<div style="color:var(--red);padding:1rem">' + _cgEscape(e.message) + '</div>';
  });
}


// ═══════════════════════════════════════════��════════════════════
//  LIVRABLES — Catalogue (paramètres) + checklist par tâche (suivi)
// ════════════════════════════════════════════════════════════════

function getLivrablesCatalogue() {
  var arr = (typeof getSetting === 'function') ? getSetting('cortoba_livrables_catalogue') : null;
  return Array.isArray(arr) ? arr : [];
}

function _paramLivMissions() {
  return (typeof getMissions === 'function') ? getMissions() : [];
}
function _paramLivTachesTypes() {
  return (typeof getTachesTypes === 'function') ? getTachesTypes() : [];
}

function renderParametresLivrables() {
  var wrap = document.getElementById('param-livrables-wrap');
  if (!wrap) return;
  var missions = _paramLivMissions();
  var tachesTypes = _paramLivTachesTypes();
  var cat = getLivrablesCatalogue();
  var cats = (typeof getMissionCategories === 'function') ? getMissionCategories() : [];

  // Options <optgroup> pour le select Mission — groupées par catégorie Paramètres
  function _missionOptions() {
    var h = '';
    cats.forEach(function(c){
      var mList = missions.filter(function(m){ return m.cat === c.id; });
      if (!mList.length) return;
      h += '<optgroup label="'+escHtml(c.label||'')+'">';
      mList.forEach(function(m){ h += '<option value="'+escHtml(m.id||'')+'">'+escHtml(m.nom||'')+'</option>'; });
      h += '</optgroup>';
    });
    var orphans = missions.filter(function(m){ return !m.cat || !cats.find(function(c){ return c.id === m.cat; }); });
    if (orphans.length) {
      h += '<optgroup label="Autres">';
      orphans.forEach(function(m){ h += '<option value="'+escHtml(m.id||'')+'">'+escHtml(m.nom||'')+'</option>'; });
      h += '</optgroup>';
    }
    return h;
  }

  var selMission = document.getElementById('param-livrable-mission');
  var selTache   = document.getElementById('param-livrable-tache');
  if (selMission) {
    var curM = selMission.value;
    selMission.innerHTML = '<option value="">— Mission —</option>' + _missionOptions();
    if (curM) selMission.value = curM;
  }
  if (selTache) {
    var curT = selTache.value;
    var mid = selMission ? selMission.value : '';
    var filtered = mid ? tachesTypes.filter(function(tt){ return (tt.mission_id||'') === mid; }) : tachesTypes;
    selTache.innerHTML = '<option value="">— Toute la mission —</option>' +
      filtered.map(function(tt){ return '<option value="'+escHtml(tt.id||'')+'">'+escHtml(tt.nom||'')+'</option>'; }).join('');
    if (curT) selTache.value = curT;
  }

  var byMission = {};
  cat.forEach(function(e){
    var k = e.mission_id || '';
    (byMission[k] = byMission[k] || []).push(e);
  });
  var html = '';
  if (cat.length === 0) {
    html = '<div style="color:var(--text-3);font-size:0.85rem;padding:0.5rem 0">Aucun livrable au catalogue. Ajoutez-en ci-dessus.</div>';
  } else {
    function _renderGroup(title, list) {
      html += '<div style="margin-top:0.8rem"><div style="font-weight:600;font-size:0.82rem;color:var(--accent);margin-bottom:0.35rem;text-transform:uppercase;letter-spacing:0.03em">'+escHtml(title)+'</div>';
      html += '<div style="display:flex;flex-direction:column;gap:0.2rem">';
      list.forEach(function(e){ html += _paramLivrableRow(e, tachesTypes); });
      html += '</div></div>';
    }
    missions.forEach(function(m){
      var list = byMission[m.id] || [];
      if (!list.length) return;
      _renderGroup(m.nom||'', list);
    });
    if (byMission['']) {
      _renderGroup('(Sans mission)', byMission['']);
    }
  }
  wrap.innerHTML = html;
}

function _paramLivrableRow(e, tachesTypes) {
  var tt = (tachesTypes || []).find(function(x){ return x.id === e.tache_type_id; });
  var ctx = [];
  if (tt) ctx.push(tt.nom);
  if (e.sous_tache) ctx.push(e.sous_tache);
  var ctxTxt = ctx.length ? ' <span style="color:var(--text-3);font-size:0.72rem;font-style:italic">'+escHtml(ctx.join(' › '))+'</span>' : '';
  return '<label style="display:flex;align-items:center;gap:0.5rem;padding:0.35rem 0.6rem;background:var(--bg-2);border-radius:6px;cursor:default;font-size:0.82rem">' +
    '<input type="checkbox" disabled style="accent-color:var(--accent);pointer-events:none" />' +
    '<span style="flex:1">' + escHtml(e.nom||'') + ctxTxt + '</span>' +
    '<button type="button" onclick="removeParamLivrable(\''+escHtml(e.id||'')+'\')" style="background:none;border:none;color:var(--text-3);cursor:pointer;padding:0 0.2rem;font-size:0.85rem;opacity:0.6" title="Supprimer">✕</button>' +
    '</label>';
}

function onParamLivrableMissionChange() { renderParametresLivrables(); }

function addParamLivrable() {
  var selM = document.getElementById('param-livrable-mission');
  var selT = document.getElementById('param-livrable-tache');
  var inpS = document.getElementById('param-livrable-sous');
  var inpN = document.getElementById('param-livrable-nom');
  if (!inpN) return;
  var nom = (inpN.value||'').trim();
  if (!nom) { showToast('Saisir un nom de livrable', 'error'); return; }
  var cat = getLivrablesCatalogue();
  cat.push({
    id: 'liv_' + Date.now() + '_' + Math.floor(Math.random()*1000),
    mission_id: selM ? selM.value : '',
    tache_type_id: selT ? selT.value : '',
    sous_tache: inpS ? (inpS.value||'').trim() : '',
    nom: nom
  });
  if (typeof saveSetting === 'function') {
    saveSetting('cortoba_livrables_catalogue', cat).then(function(){
      inpN.value = '';
      if (inpS) inpS.value = '';
      renderParametresLivrables();
      showToast('Livrable ajouté', 'success');
    }).catch(function(e){ showToast('Erreur : '+e.message, 'error'); });
  }
}

function removeParamLivrable(id) {
  if (!confirm('Supprimer ce livrable du catalogue ?')) return;
  var cat = getLivrablesCatalogue().filter(function(e){ return e.id !== id; });
  if (typeof saveSetting === 'function') {
    saveSetting('cortoba_livrables_catalogue', cat).then(function(){
      renderParametresLivrables();
    }).catch(function(e){ showToast('Erreur : '+e.message, 'error'); });
  }
}

// ── Checklist livrables par tâche (dans modal suivi) ──
var _currentTacheLivrables = [];

function loadTacheLivrables(tacheId) {
  if (!tacheId) { _currentTacheLivrables = []; renderTacheLivrables(); return; }
  apiFetch('api/livrables.php?tache_id=' + encodeURIComponent(tacheId))
    .then(function(r){
      _currentTacheLivrables = r.data || [];
      renderTacheLivrables();
    })
    .catch(function(e){ console.error('[loadTacheLivrables]', e); _currentTacheLivrables = []; renderTacheLivrables(); });
}

function renderTacheLivrables() {
  var list = document.getElementById('tache-livrables-list');
  var cnt  = document.getElementById('tache-livrables-count');
  if (!list) return;
  var items = _currentTacheLivrables || [];
  var done = items.filter(function(i){ return parseInt(i.done,10) === 1; }).length;
  if (cnt) cnt.textContent = items.length ? '(' + done + '/' + items.length + ')' : '';
  if (!items.length) {
    list.innerHTML = '<div style="color:var(--text-3);font-size:0.78rem;padding:0.3rem 0.2rem">Aucun livrable. Ajoutez-en ou appliquez le catalogue.</div>';
    return;
  }
  list.innerHTML = items.map(function(i){
    var checked = parseInt(i.done,10) === 1;
    var meta = '';
    if (checked && i.done_par) meta = ' <span style="color:var(--text-3);font-size:0.65rem">par '+escHtml(i.done_par)+'</span>';
    return '<label style="display:flex;align-items:center;gap:0.45rem;padding:0.22rem 0.3rem;border-radius:4px;cursor:pointer'+(checked?';opacity:0.75':'')+'">'+
      '<input type="checkbox" '+(checked?'checked':'')+' onchange="toggleTacheLivrable(\''+escHtml(i.id)+'\', this.checked)" />'+
      '<span style="flex:1;font-size:0.82rem'+(checked?';text-decoration:line-through':'')+'">'+escHtml(i.label||'')+meta+'</span>'+
      '<button type="button" onclick="deleteTacheLivrable(\''+escHtml(i.id)+'\')" style="background:none;border:none;color:var(--text-3);cursor:pointer;font-size:0.85rem" title="Supprimer">✕</button>'+
    '</label>';
  }).join('');
}

function addTacheLivrable() {
  var inp = document.getElementById('tache-livrables-input');
  var tId = document.getElementById('tache-id');
  if (!inp || !tId || !tId.value) { showToast("Enregistrer la tâche avant d'ajouter des livrables", 'error'); return; }
  var label = (inp.value||'').trim();
  if (!label) return;
  apiFetch('api/livrables.php', { method:'POST', body: JSON.stringify({ tache_id: tId.value, label: label }) })
    .then(function(r){
      _currentTacheLivrables.push(r.data);
      inp.value = '';
      renderTacheLivrables();
      _refreshSuiviLivrablesCount(tId.value);
    })
    .catch(function(e){ showToast('Erreur : '+e.message, 'error'); });
}

function toggleTacheLivrable(id, checked) {
  apiFetch('api/livrables.php?id=' + encodeURIComponent(id), { method:'PUT', body: JSON.stringify({ done: checked ? 1 : 0 }) })
    .then(function(r){
      var idx = _currentTacheLivrables.findIndex(function(i){ return i.id === id; });
      if (idx >= 0) _currentTacheLivrables[idx] = r.data;
      renderTacheLivrables();
      var tId = document.getElementById('tache-id');
      if (tId && tId.value) _refreshSuiviLivrablesCount(tId.value);
    })
    .catch(function(e){ showToast('Erreur : '+e.message, 'error'); });
}

function deleteTacheLivrable(id) {
  if (!confirm('Supprimer ce livrable ?')) return;
  apiFetch('api/livrables.php?id=' + encodeURIComponent(id), { method:'DELETE' })
    .then(function(){
      _currentTacheLivrables = _currentTacheLivrables.filter(function(i){ return i.id !== id; });
      renderTacheLivrables();
      var tId = document.getElementById('tache-id');
      if (tId && tId.value) _refreshSuiviLivrablesCount(tId.value);
    })
    .catch(function(e){ showToast('Erreur : '+e.message, 'error'); });
}

function applyLivrablesCatalogue() {
  var tId = document.getElementById('tache-id');
  if (!tId || !tId.value) { showToast("Enregistrer la tâche avant d'appliquer le catalogue", 'error'); return; }
  apiFetch('api/livrables.php', { method:'POST', body: JSON.stringify({ tache_id: tId.value, action: 'apply_catalogue' }) })
    .then(function(r){
      _currentTacheLivrables = (r.data && r.data.items) || [];
      renderTacheLivrables();
      var added = (r.data && r.data.added) || 0;
      showToast(added > 0 ? (added + ' livrable(s) ajouté(s)') : 'Aucun livrable à ajouter', added > 0 ? 'success' : 'info');
      _refreshSuiviLivrablesCount(tId.value);
    })
    .catch(function(e){ showToast('Erreur : '+e.message, 'error'); });
}

function _refreshSuiviLivrablesCount(tacheId) {
  var t = (_suiviCache || []).find(function(x){ return x.id === tacheId; });
  if (!t) return;
  var items = _currentTacheLivrables || [];
  t.livrables_total = items.length;
  t.livrables_done = items.filter(function(i){ return parseInt(i.done,10) === 1; }).length;
}

// ═══ PAGE NOTIFICATIONS ═══
var _nfState={status:'inbox'},_nfCache=[];
function renderNotificationsPage(){document.querySelectorAll('#page-notifications .nf-tab').forEach(function(t){var a=t.getAttribute('data-nf-status')===_nfState.status;t.classList.toggle('active',a);t.style.color=a?'var(--text-2)':'var(--text-3)';t.style.borderBottom=a?'2px solid var(--accent)':'2px solid transparent';});notifPopulateTypes();notifLoadList();}
function notifPopulateTypes(){var sel=document.getElementById('nf-type');if(!sel||sel.options.length>1)return;apiFetch('api/notifications.php?action=types').then(function(r){var types=(r&&r.data)?r.data:(r||[]);var labels={info:'Info',success:'Succ\u00e8s',warning:'Avertissement',error:'Erreur',conge_pending:'Cong\u00e9 en attente',conge_approved:'Cong\u00e9 approuv\u00e9',conge_refused:'Cong\u00e9 refus\u00e9'};types.forEach(function(t){var o=document.createElement('option');o.value=t;o.textContent=labels[t]||t;sel.appendChild(o);});}).catch(function(){});}
function notifSwitchTab(s,b){_nfState.status=s;document.querySelectorAll('#page-notifications .nf-tab').forEach(function(t){t.classList.remove('active');t.style.color='var(--text-3)';t.style.borderBottom='2px solid transparent';});if(b){b.classList.add('active');b.style.color='var(--text-2)';b.style.borderBottom='2px solid var(--accent)';}notifLoadList();}
function notifApplyFilters(){notifLoadList();}
function notifLoadList(){var el=document.getElementById('nf-list');if(!el)return;el.innerHTML='<div style="color:var(--text-3);padding:1rem;text-align:center">Chargement\u2026</div>';var q=(document.getElementById('nf-search')||{value:''}).value.trim();var tp=(document.getElementById('nf-type')||{value:''}).value;var so=(document.getElementById('nf-sort')||{value:'recent'}).value;var p='action=list&limit=200&status='+encodeURIComponent(_nfState.status)+'&sort='+encodeURIComponent(so);if(tp)p+='&type='+encodeURIComponent(tp);if(q)p+='&q='+encodeURIComponent(q);apiFetch('api/notifications.php?'+p).then(function(r){_nfCache=(r&&r.data)?r.data:(r||[]);notifRenderList(_nfCache);}).catch(function(){el.innerHTML='<div style="color:#d45656;padding:1rem;text-align:center">Erreur</div>';});}
function notifRenderList(notifs){var el=document.getElementById('nf-list');if(!el)return;if(!notifs.length){el.innerHTML='<div style="color:var(--text-3);padding:2rem;text-align:center">Aucune notification</div>';return;}var h='';notifs.forEach(function(n){var ur=!parseInt(n.is_read||0,10),ar=!!parseInt(n.is_archived||0,10),w=n.cree_at?_cgRelativeTime(n.cree_at):'',tc=({info:'#6aa6d4',success:'#5aab6e',warning:'#d4a64a',error:'#d45656'})[n.type]||'var(--accent)';h+='<div data-id="'+_cgEscape(n.id)+'" style="display:flex;gap:0.8rem;align-items:flex-start;padding:0.9rem 1rem;border-bottom:1px solid var(--border);'+(ur?'background:rgba(200,169,110,0.06);border-left:3px solid var(--accent);':'border-left:3px solid transparent;')+'">';h+='<div style="flex:1;cursor:pointer;min-width:0" onclick="notifOpen(\''+_cgEscape(n.id)+'\')">';h+='<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.2rem;flex-wrap:wrap"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+tc+'"></span><span style="font-weight:'+(ur?'600':'500')+';color:var(--text-1);font-size:0.88rem">'+_cgEscape(n.title)+'</span>';if(n.type)h+='<span style="font-size:0.62rem;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em;border:1px solid var(--border);padding:0.1rem 0.35rem;border-radius:3px">'+_cgEscape(n.type)+'</span>';h+='</div>';if(n.message)h+='<div style="color:var(--text-2);font-size:0.78rem;white-space:pre-wrap;margin-bottom:0.25rem">'+_cgEscape(n.message)+'</div>';h+='<div style="color:var(--text-3);font-size:0.68rem">'+w+(n.cree_par?' \u00b7 '+_cgEscape(n.cree_par):'')+'</div></div>';h+='<div style="display:flex;gap:0.35rem;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">';if(ur)h+='<button onclick="notifAction(\'mark_read\',\''+_cgEscape(n.id)+'\')" style="background:none;border:1px solid var(--border);color:var(--text-2);padding:0.3rem 0.55rem;border-radius:4px;cursor:pointer;font-size:0.7rem">Lu</button>';else h+='<button onclick="notifAction(\'mark_unread\',\''+_cgEscape(n.id)+'\')" style="background:none;border:1px solid var(--border);color:var(--text-3);padding:0.3rem 0.55rem;border-radius:4px;cursor:pointer;font-size:0.7rem">Non lu</button>';if(ar)h+='<button onclick="notifAction(\'unarchive\',\''+_cgEscape(n.id)+'\')" style="background:none;border:1px solid var(--border);color:var(--text-2);padding:0.3rem 0.55rem;border-radius:4px;cursor:pointer;font-size:0.7rem">Restaurer</button>';else h+='<button onclick="notifAction(\'archive\',\''+_cgEscape(n.id)+'\')" style="background:none;border:1px solid var(--border);color:var(--text-2);padding:0.3rem 0.55rem;border-radius:4px;cursor:pointer;font-size:0.7rem">Archiver</button>';h+='<button onclick="notifAction(\'delete\',\''+_cgEscape(n.id)+'\')" style="background:none;border:1px solid var(--border);color:#d45656;padding:0.3rem 0.55rem;border-radius:4px;cursor:pointer;font-size:0.7rem">Suppr.</button>';h+='</div></div>';});el.innerHTML=h;}
function notifOpen(id){var n=null;for(var i=0;i<_nfCache.length;i++){if(_nfCache[i].id===id){n=_nfCache[i];break;}}apiFetch('api/notifications.php?action=mark_read&id='+encodeURIComponent(id),{method:'POST',body:{}}).catch(function(){});if(n&&n.link_page)setTimeout(function(){showPage(n.link_page);refreshNotifBadge();},100);else setTimeout(function(){notifLoadList();refreshNotifBadge();},150);}
function notifAction(a,id){if(a==='delete'&&!confirm('Supprimer ?'))return;apiFetch('api/notifications.php?action='+a+'&id='+encodeURIComponent(id),{method:'POST',body:{}}).then(function(){notifLoadList();refreshNotifBadge();}).catch(function(){alert('Erreur');});}
function notifMarkAllReadInbox(){apiFetch('api/notifications.php?action=mark_all_read',{method:'POST',body:{}}).then(function(){notifLoadList();refreshNotifBadge();}).catch(function(){alert('Erreur');});}

// ═══ NOTIFICATION PREFERENCES & PUSH ═══
var _nfPrefsData=null,_nfPrefsShown=false;
function notifShowPrefs(){
  _nfPrefsShown=!_nfPrefsShown;
  var panel=document.getElementById('nf-prefs-panel');
  var listCard=document.getElementById('nf-list-card');
  var tabs=document.querySelectorAll('#page-notifications > div');
  if(_nfPrefsShown){
    if(panel)panel.style.display='block';
    if(listCard)listCard.style.display='none';
    // hide tabs and filter bar
    for(var i=0;i<tabs.length;i++){
      var t=tabs[i];
      if(t.id==='nf-prefs-panel'||t.classList.contains('page-header'))continue;
      if(t.id!=='nf-list-card'&&!t.id)t.style.display='none';
    }
    notifLoadPrefs();
  }else{
    if(panel)panel.style.display='none';
    if(listCard)listCard.style.display='';
    for(var i=0;i<tabs.length;i++){
      var t=tabs[i];
      if(t.id==='nf-prefs-panel')continue;
      t.style.display='';
    }
  }
}
function notifLoadPrefs(){
  apiFetch('api/notification_prefs.php?action=get').then(function(r){
    var d=(r&&r.data)?r.data:r;
    _nfPrefsData=d;
    var ea=document.getElementById('nf-email-addr');
    if(ea)ea.textContent=d.user_email||'Aucun email configuré';
    notifUpdatePushUI();
    notifRenderPrefsTable(d);
  }).catch(function(e){
    showToast('Erreur chargement préférences: '+e.message,'error');
  });
}
function notifRenderPrefsTable(d){
  var tbody=document.getElementById('nf-prefs-tbody');
  if(!tbody)return;
  var types=d.types||{};
  var prefs=d.prefs||{};
  var h='';
  var keys=Object.keys(types);
  keys.forEach(function(k){
    var p=prefs[k]||prefs['_default']||{inapp:1,email:1,push:1,enabled:1};
    var label=types[k]||k;
    var isDefault=(k==='_default');
    h+='<tr style="border-bottom:1px solid var(--border);'+(isDefault?'background:rgba(200,169,110,0.04);':'')+'">';
    h+='<td style="padding:0.5rem 0.8rem;color:var(--text-1);font-weight:'+(isDefault?'600':'400')+'">'+(isDefault?'<strong>'+label+'</strong>':label)+'</td>';
    h+='<td style="text-align:center;padding:0.5rem"><input type="checkbox" data-type="'+k+'" data-ch="inapp" '+(p.inapp?'checked':'')+' style="accent-color:var(--accent);width:16px;height:16px;cursor:pointer"></td>';
    h+='<td style="text-align:center;padding:0.5rem"><input type="checkbox" data-type="'+k+'" data-ch="email" '+(p.email?'checked':'')+' style="accent-color:var(--accent);width:16px;height:16px;cursor:pointer"></td>';
    h+='<td style="text-align:center;padding:0.5rem"><input type="checkbox" data-type="'+k+'" data-ch="push" '+(p.push?'checked':'')+' style="accent-color:var(--accent);width:16px;height:16px;cursor:pointer"></td>';
    h+='<td style="text-align:center;padding:0.5rem"><input type="checkbox" data-type="'+k+'" data-ch="enabled" '+(p.enabled?'checked':'')+' style="accent-color:var(--accent);width:16px;height:16px;cursor:pointer"></td>';
    h+='</tr>';
  });
  tbody.innerHTML=h;
}
function notifSavePrefs(){
  var tbody=document.getElementById('nf-prefs-tbody');
  if(!tbody)return;
  var checks=tbody.querySelectorAll('input[type="checkbox"]');
  var prefs={};
  checks.forEach(function(cb){
    var t=cb.getAttribute('data-type');
    var ch=cb.getAttribute('data-ch');
    if(!prefs[t])prefs[t]={inapp:0,email:0,push:0,enabled:0};
    prefs[t][ch]=cb.checked?1:0;
  });
  apiFetch('api/notification_prefs.php?action=save',{method:'POST',body:{prefs:prefs}}).then(function(){
    showToast('Préférences enregistrées','success');
  }).catch(function(e){
    showToast('Erreur: '+e.message,'error');
  });
}

// ═══ PUSH NOTIFICATIONS ═══
function notifUpdatePushUI(){
  var stateEl=document.getElementById('nf-push-state');
  var btn=document.getElementById('nf-push-btn');
  if(!stateEl||!btn)return;
  if(!('serviceWorker' in navigator)||!('PushManager' in window)){
    stateEl.textContent='Non supporté par ce navigateur';
    stateEl.style.color='#d45656';
    btn.style.display='none';
    return;
  }
  function _pushShowOff(){
    stateEl.textContent='Désactivées';stateEl.style.color='var(--text-3)';
    btn.textContent='Activer les push';btn.style.display='inline-block';btn.style.background='var(--accent)';
  }
  function _pushShowOn(){
    stateEl.textContent='Activées';stateEl.style.color='#5aab6e';
    btn.textContent='Désactiver';btn.style.display='inline-block';btn.style.background='#d45656';
  }
  navigator.serviceWorker.getRegistration('/cortoba-plateforme/').then(function(reg){
    if(!reg){_pushShowOff();return;}
    reg.pushManager.getSubscription().then(function(sub){
      if(sub){_pushShowOn();}else{_pushShowOff();}
    }).catch(function(){_pushShowOff();});
  }).catch(function(){
    stateEl.textContent='Erreur';
    stateEl.style.color='#d45656';
  });
}
function notifTogglePush(){
  if(!('serviceWorker' in navigator))return;
  navigator.serviceWorker.getRegistration('/cortoba-plateforme/').then(function(reg){
    if(!reg){
      return navigator.serviceWorker.register('/cortoba-plateforme/sw.js',{scope:'/cortoba-plateforme/'}).then(function(newReg){
        return _notifPushSubscribe(newReg);
      });
    }
    return reg.pushManager.getSubscription().then(function(sub){
      if(sub)return _notifPushUnsubscribe(sub);
      return _notifPushSubscribe(reg);
    });
  }).catch(function(e){
    showToast('Erreur push: '+e.message,'error');
  });
}
function _notifPushSubscribe(reg){
  return apiFetch('api/notification_prefs.php?action=get_vapid_key').then(function(r){
    var key=(r&&r.data)?r.data.publicKey:null;
    if(!key)throw new Error('Clé VAPID manquante');
    var rawKey=_urlBase64ToUint8Array(key);
    return reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:rawKey});
  }).then(function(sub){
    var json=sub.toJSON();
    return apiFetch('api/notification_prefs.php?action=push_subscribe',{method:'POST',body:{
      endpoint:json.endpoint,
      keys:{p256dh:json.keys.p256dh,auth:json.keys.auth}
    }});
  }).then(function(){
    showToast('Notifications push activées','success');
    notifUpdatePushUI();
  });
}
function _notifPushUnsubscribe(sub){
  var endpoint=sub.endpoint;
  return sub.unsubscribe().then(function(){
    return apiFetch('api/notification_prefs.php?action=push_unsubscribe',{method:'POST',body:{endpoint:endpoint}});
  }).then(function(){
    showToast('Notifications push désactivées','info');
    notifUpdatePushUI();
  });
}
function _urlBase64ToUint8Array(base64String){
  var padding='='.repeat((4-base64String.length%4)%4);
  var base64=(base64String+padding).replace(/\-/g,'+').replace(/_/g,'/');
  var rawData=window.atob(base64);
  var outputArray=new Uint8Array(rawData.length);
  for(var i=0;i<rawData.length;++i)outputArray[i]=rawData.charCodeAt(i);
  return outputArray;
}

// ═══ SERVICE WORKER REGISTRATION ═══
if('serviceWorker' in navigator){
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('/cortoba-plateforme/sw.js',{scope:'/cortoba-plateforme/'}).catch(function(e){
      console.log('[SW] Registration failed:',e);
    });
    navigator.serviceWorker.addEventListener('message',function(event){
      if(event.data&&event.data.type==='NOTIFICATION_CLICK'){
        if(event.data.page)showPage(event.data.page);
        refreshNotifBadge();
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════
//  MODULE GESTION DE CHANTIER
// ═══════════════════════════════════════════════════════════════

var _chCache = { chantiers: [], currentId: '', lots: [], intervenants: [], journal: [], reunions: [], actions: [], reserves: [], rfi: [], visas: [], incidents: [], inspections: [], photos: [], taches: [] };

// ── Helper: populate chantier dropdowns ──
function _chPopulateSelects() {
  var selectors = ['ch-select','chj-chantier-filter','chi-chantier-filter','chr-chantier-filter','chp-chantier-filter','chres-chantier-filter','chv-chantier-filter','chs-chantier-filter'];
  selectors.forEach(function(sid) {
    var el = document.getElementById(sid);
    if (!el) return;
    var val = el.value;
    var h = '<option value="">— Chantier —</option>';
    _chCache.chantiers.forEach(function(c) {
      h += '<option value="' + c.id + '"' + (c.id === val ? ' selected' : '') + '>' + _cgEscape((c.code ? c.code + ' — ' : '') + c.nom) + '</option>';
    });
    el.innerHTML = h;
    if (val) el.value = val;
  });
}

function _chGetCurrentId(filterId) {
  var el = document.getElementById(filterId);
  return el ? el.value : (_chCache.currentId || '');
}

function _chLoadChantiers() {
  return apiFetch('api/chantier.php').then(function(r) {
    _chCache.chantiers = (r && r.data) ? r.data : (r || []);
    _chPopulateSelects();
  });
}

// ── Badge helpers ──
function _chBadge(statut) {
  var m = { 'En préparation': 'badge-gray', 'En cours': 'badge-green', 'Suspendu': 'badge-orange', 'Réceptionné': 'badge-blue', 'Clôturé': 'badge-gray',
    'Ouverte': 'badge-red', 'En cours de reprise': 'badge-orange', 'Levée': 'badge-green', 'Confirmée': 'badge-blue',
    'Ouvert': 'badge-red', 'En traitement': 'badge-orange', 'Clôturé': 'badge-gray', 'Clôturée': 'badge-gray',
    'En attente': 'badge-orange', 'BPE': 'badge-green', 'Bon avec observations': 'badge-blue', 'Refusé': 'badge-red', 'Sans objet': 'badge-gray',
    'Brouillon': 'badge-gray', 'Finalisé': 'badge-blue', 'Diffusé': 'badge-green',
    'Résolue': 'badge-green', 'Annulée': 'badge-gray', 'En cours': 'badge-orange',
    'Planifiée': 'badge-gray', 'Complétée': 'badge-green',
    'Critique': 'badge-red', 'Majeure': 'badge-orange', 'Haute': 'badge-orange', 'Normale': 'badge-gray', 'Basse': 'badge-gray', 'Mineure': 'badge-gray', 'Observation': 'badge-gray', 'Urgente': 'badge-red' };
  return '<span class="badge ' + (m[statut] || 'badge-gray') + '">' + _cgEscape(statut || '') + '</span>';
}

function _chDate(d) { return d ? d.substring(0, 10) : '—'; }
function _chTrunc(s, n) { if (!s) return '—'; return s.length > (n||60) ? s.substring(0, n||60) + '…' : s; }

// ══════════════════════════════════════
//  1. TABLEAU DE BORD CHANTIER
// ══════════════════════════════════════

function _chPopulateProjetSelect() {
  // With the searchable input, just ensure the search text matches the current value
  var hidden = document.getElementById('ch-projet-id');
  var search = document.getElementById('ch-projet-search');
  if (!hidden || !search) return;
  if (hidden.value) {
    var projets = getProjets() || [];
    for (var i = 0; i < projets.length; i++) {
      if (projets[i].id === hidden.value) {
        search.value = (projets[i].code ? projets[i].code + ' — ' : '') + (projets[i].nom || '');
        break;
      }
    }
  }
}

function chProjetSearch(query) {
  var dropdown = document.getElementById('ch-projet-dropdown');
  var projets = getProjets() || [];
  var q = (query || '').toLowerCase().trim();
  var filtered = projets.filter(function(p) {
    if (!q) return true;
    var text = ((p.code || '') + ' ' + (p.nom || '') + ' ' + (p.client_nom || '')).toLowerCase();
    return text.indexOf(q) !== -1;
  });
  if (!filtered.length) {
    dropdown.innerHTML = '<div style="padding:0.6rem 0.8rem;color:var(--text-3);font-size:0.82rem">Aucun projet trouvé</div>';
    dropdown.style.display = 'block';
    return;
  }
  var h = '';
  filtered.slice(0, 30).forEach(function(p) {
    var label = _cgEscape((p.code ? p.code + ' — ' : '') + (p.nom || ''));
    var sub = p.client_nom ? '<span style="color:var(--text-3);font-size:0.75rem;margin-left:0.5rem">' + _cgEscape(p.client_nom) + '</span>' : '';
    h += '<div class="ch-projet-option" data-id="' + p.id + '" data-label="' + _cgEscape((p.code ? p.code + ' — ' : '') + (p.nom || '')) + '" style="padding:0.5rem 0.8rem;cursor:pointer;font-size:0.85rem;border-bottom:1px solid var(--border)" onmousedown="chProjetPick(this)" onmouseenter="this.style.background=\'var(--bg-3)\'" onmouseleave="this.style.background=\'\'">' + label + sub + '</div>';
  });
  dropdown.innerHTML = h;
  dropdown.style.display = 'block';
}

function chProjetPick(el) {
  var id = el.getAttribute('data-id');
  var label = el.getAttribute('data-label');
  document.getElementById('ch-projet-id').value = id;
  document.getElementById('ch-projet-search').value = label;
  document.getElementById('ch-projet-dropdown').style.display = 'none';
}

// Close dropdown on click outside
document.addEventListener('click', function(e) {
  var dd = document.getElementById('ch-projet-dropdown');
  if (dd && !dd.contains(e.target) && e.target.id !== 'ch-projet-search') {
    dd.style.display = 'none';
  }
});

function renderChantierDashboard() {
  _chPopulateProjetSelect();
  _chLoadChantiers().then(function() {
    _chPopulateProjetSelect();
    if (_chCache.currentId) chantierSelected();
  }).catch(function(e) {
    console.warn('[chantier] load error:', e);
    _chPopulateProjetSelect();
  });
}

function chantierSelected() {
  var sel = document.getElementById('ch-select');
  _chCache.currentId = sel ? sel.value : '';
  if (!_chCache.currentId) {
    document.getElementById('ch-dashboard-kpis').innerHTML = '<div style="color:var(--text-3);grid-column:1/-1;text-align:center;padding:2rem">Sélectionnez un chantier pour afficher le tableau de bord</div>';
    document.getElementById('ch-lots-progress').innerHTML = '';
    document.getElementById('ch-indicators').innerHTML = '';
    document.getElementById('ch-gantt-container').innerHTML = '';
    document.getElementById('ch-recent-journal').innerHTML = '';
    return;
  }
  apiFetch('api/chantier.php?action=dashboard&chantier_id=' + _chCache.currentId).then(function(r) {
    var d = (r && r.data) ? r.data : {};
    _renderChDashboardKpis(d);
    _renderChLotsProgress(d);
    _renderChIndicators(d);
    _renderChRecentJournal(d);
  }).catch(function(e) { showToast('Erreur dashboard: ' + e.message, 'error'); });
  // Load gantt tasks
  apiFetch('api/chantier.php?action=taches&chantier_id=' + _chCache.currentId).then(function(r) {
    _chCache.taches = (r && r.data) ? r.data : [];
    _renderChGantt();
  });
}

function _renderChDashboardKpis(d) {
  var el = document.getElementById('ch-dashboard-kpis');
  var avLotsRaw = d.lots_summary ? d.lots_summary.avg_avancement : 0;
  var avLots = avLotsRaw ? Math.round(parseFloat(avLotsRaw)) : 0;
  var resOuv = 0; (d.reserves_stats || []).forEach(function(s) { if (s.statut === 'Ouverte') resOuv = parseInt(s.nb); });
  var rfiOuv = 0; (d.rfi_stats || []).forEach(function(s) { if (s.statut === 'Ouverte') rfiOuv = parseInt(s.nb); });
  var visaAtt = 0; (d.visa_stats || []).forEach(function(s) { if (s.statut === 'En attente') visaAtt = parseInt(s.nb); });
  var incTotal = 0; (d.incidents_stats || []).forEach(function(s) { incTotal += parseInt(s.nb); });

  el.innerHTML = '<div class="kpi-card"><div class="kpi-label">Avancement global</div><div class="kpi-value">' + (d.avancement_global || 0) + '%</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Avancement lots (moy.)</div><div class="kpi-value">' + avLots + '%</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Réserves ouvertes</div><div class="kpi-value" style="color:' + (resOuv > 0 ? 'var(--red)' : 'var(--green)') + '">' + resOuv + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">RFI ouvertes</div><div class="kpi-value">' + rfiOuv + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Visas en attente</div><div class="kpi-value">' + visaAtt + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Actions ouvertes</div><div class="kpi-value">' + (d.actions_ouvertes || 0) + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Incidents</div><div class="kpi-value">' + incTotal + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Statut</div><div class="kpi-value" style="font-size:0.9rem">' + _chBadge(d.statut || '') + '</div></div>';
}

function _renderChLotsProgress(d) {
  var el = document.getElementById('ch-lots-progress');
  // Load lots
  apiFetch('api/chantier.php?action=lots&chantier_id=' + _chCache.currentId).then(function(r) {
    _chCache.lots = (r && r.data) ? r.data : [];
    if (!_chCache.lots.length) { el.innerHTML = '<div style="color:var(--text-3);text-align:center;padding:1rem">Aucun lot défini. <button class="btn btn-sm" onclick="openModal(\'modal-ch-lot\')">+ Lot</button></div>'; return; }
    var h = '<div style="display:flex;justify-content:flex-end;margin-bottom:0.5rem"><button class="btn btn-sm" onclick="openModal(\'modal-ch-lot\')">+ Lot</button></div>';
    _chCache.lots.forEach(function(l) {
      h += '<div style="margin-bottom:0.8rem">' +
        '<div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:0.25rem"><span style="color:var(--text)">' + _cgEscape(l.nom) + '</span><span style="color:var(--text-2)">' + (l.avancement||0) + '%</span></div>' +
        '<div style="background:var(--bg-2);border-radius:4px;height:8px;overflow:hidden"><div style="background:' + (l.couleur||'var(--accent)') + ';height:100%;width:' + (l.avancement||0) + '%;border-radius:4px;transition:width 0.3s"></div></div>' +
        '<div style="font-size:0.72rem;color:var(--text-3);margin-top:0.15rem">' + _cgEscape(l.entreprise||'') + (l.montant_marche ? ' — ' + Number(l.montant_marche).toLocaleString('fr-TN') + ' DT' : '') + '</div></div>';
    });
    el.innerHTML = h;
    // Also populate lot dropdowns
    _chPopulateLotSelects();
  });
}

function _chPopulateLotSelects() {
  var selectors = ['cht-lot-id','chres-lot-id','chv-lot-id'];
  selectors.forEach(function(sid) {
    var el = document.getElementById(sid);
    if (!el) return;
    var h = '<option value="">— Aucun —</option>';
    _chCache.lots.forEach(function(l) { h += '<option value="' + l.id + '">' + _cgEscape(l.nom) + '</option>'; });
    el.innerHTML = h;
  });
}

function _renderChIndicators(d) {
  var el = document.getElementById('ch-indicators');
  el.innerHTML = '<div style="font-size:0.82rem"><div style="color:var(--text-2);margin-bottom:0.3rem">Budget travaux</div><div style="font-size:1.1rem;font-weight:600;color:var(--text)">' + Number(d.budget_travaux||0).toLocaleString('fr-TN') + ' DT</div></div>' +
    '<div style="font-size:0.82rem"><div style="color:var(--text-2);margin-bottom:0.3rem">Montant engagé</div><div style="font-size:1.1rem;font-weight:600;color:var(--text)">' + Number(d.montant_engage||0).toLocaleString('fr-TN') + ' DT</div></div>' +
    '<div style="font-size:0.82rem"><div style="color:var(--text-2);margin-bottom:0.3rem">Début</div><div style="color:var(--text)">' + _chDate(d.date_debut) + '</div></div>' +
    '<div style="font-size:0.82rem"><div style="color:var(--text-2);margin-bottom:0.3rem">Fin prévue</div><div style="color:var(--text)">' + _chDate(d.date_fin_prevue) + '</div></div>';
}

function _renderChRecentJournal(d) {
  var el = document.getElementById('ch-recent-journal');
  var j = d.recent_journal || [];
  if (!j.length) { el.innerHTML = '<div style="color:var(--text-3);padding:1rem;text-align:center">Aucune entrée</div>'; return; }
  var h = '';
  j.forEach(function(e) {
    h += '<div style="padding:0.6rem 0;border-bottom:1px solid var(--border);display:flex;gap:1rem">' +
      '<div style="min-width:80px;color:var(--accent);font-weight:600">' + _chDate(e.date_jour) + '</div>' +
      '<div style="flex:1"><div style="color:var(--text)">' + _chTrunc(e.activites, 120) + '</div>' +
      '<div style="color:var(--text-3);font-size:0.75rem;margin-top:0.2rem">' + _cgEscape(e.meteo||'') + (e.temperature ? ' · ' + _cgEscape(e.temperature) : '') + ' · Effectif: ' + (e.effectif_total||0) + '</div></div></div>';
  });
  el.innerHTML = h;
}

// ── Gantt mini (simple bar chart) ──
function _renderChGantt() {
  var el = document.getElementById('ch-gantt-container');
  var tasks = _chCache.taches;
  if (!tasks.length) { el.innerHTML = '<div style="color:var(--text-3);padding:2rem;text-align:center">Aucune tâche planifiée</div>'; return; }
  // Find min/max dates
  var minD = null, maxD = null;
  tasks.forEach(function(t) {
    if (t.date_debut) { var d = new Date(t.date_debut); if (!minD || d < minD) minD = d; }
    if (t.date_fin) { var d2 = new Date(t.date_fin); if (!maxD || d2 > maxD) maxD = d2; }
  });
  if (!minD || !maxD) { el.innerHTML = '<div style="color:var(--text-3);padding:1rem;text-align:center">Dates non définies</div>'; return; }
  var totalDays = Math.max(1, Math.ceil((maxD - minD) / 86400000));
  var h = '<div style="position:relative;min-height:' + (tasks.length * 36 + 30) + 'px;padding-top:24px">';
  // Month header
  h += '<div style="display:flex;font-size:0.65rem;color:var(--text-3);margin-bottom:4px;border-bottom:1px solid var(--border);padding-bottom:4px">';
  var curMonth = new Date(minD);
  while (curMonth <= maxD) {
    var mStart = Math.max(0, Math.ceil((curMonth - minD) / 86400000));
    var nextM = new Date(curMonth.getFullYear(), curMonth.getMonth() + 1, 1);
    var mEnd = Math.min(totalDays, Math.ceil((nextM - minD) / 86400000));
    var wPct = ((mEnd - mStart) / totalDays * 100);
    h += '<div style="width:' + wPct + '%;text-align:center">' + curMonth.toLocaleDateString('fr-FR', {month: 'short', year: '2-digit'}) + '</div>';
    curMonth = nextM;
  }
  h += '</div>';
  tasks.forEach(function(t, i) {
    var sd = t.date_debut ? new Date(t.date_debut) : minD;
    var ed = t.date_fin ? new Date(t.date_fin) : sd;
    var left = Math.max(0, (sd - minD) / 86400000 / totalDays * 100);
    var width = Math.max(1, (ed - sd) / 86400000 / totalDays * 100);
    var color = t.lot_couleur || (t.est_critique ? '#e07b72' : 'var(--accent)');
    var avW = (t.avancement || 0) / 100 * width;
    h += '<div style="position:relative;height:28px;margin-bottom:8px;display:flex;align-items:center">' +
      '<div style="position:absolute;left:0;width:100%;height:1px;background:var(--border);top:50%"></div>' +
      '<div title="' + _cgEscape(t.titre) + ' (' + (t.avancement||0) + '%)" style="position:absolute;left:' + left + '%;width:' + width + '%;height:' + (t.est_jalon ? '12px' : '20px') + ';background:rgba(200,169,110,0.15);border-radius:3px;border:1px solid ' + color + ';overflow:hidden;cursor:pointer" onclick="editChTache(\'' + t.id + '\')">' +
      '<div style="height:100%;width:' + (t.avancement||0) + '%;background:' + color + ';opacity:0.6;border-radius:2px"></div></div>' +
      '<div style="position:absolute;left:' + Math.max(0, left - 0.5) + '%;transform:translateX(-100%);padding-right:6px;font-size:0.7rem;color:var(--text-2);white-space:nowrap;max-width:25%;overflow:hidden;text-overflow:ellipsis">' + _cgEscape(t.titre) + '</div></div>';
  });
  h += '</div>';
  el.innerHTML = h;
}

// ── Save chantier ──
function saveChantier() {
  var id = document.getElementById('ch-edit-id').value;
  var body = {
    projet_id: document.getElementById('ch-projet-id').value,
    nom: document.getElementById('ch-nom').value,
    code: document.getElementById('ch-code').value,
    adresse: document.getElementById('ch-adresse').value,
    date_debut: document.getElementById('ch-date-debut').value || null,
    date_fin_prevue: document.getElementById('ch-date-fin').value || null,
    budget_travaux: parseFloat(document.getElementById('ch-budget').value) || 0,
    statut: document.getElementById('ch-statut').value,
    description: document.getElementById('ch-description').value
  };
  if (!body.nom) { showToast('Le nom est requis', 'warning'); return; }
  var url = id ? ('api/chantier.php?id=' + id) : 'api/chantier.php';
  var method = id ? 'PUT' : 'POST';
  apiFetch(url, { method: method, body: body }).then(function(r) {
    showToast(id ? 'Chantier mis à jour' : 'Chantier créé', 'success');
    closeModal('modal-chantier');
    _resetChForm();
    renderChantierDashboard();
  }).catch(function(e) { showToast('Erreur: ' + e.message, 'error'); });
}

function _resetChForm() {
  ['ch-edit-id','ch-projet-id','ch-projet-search','ch-nom','ch-code','ch-adresse','ch-date-debut','ch-date-fin','ch-budget','ch-description'].forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
  var st = document.getElementById('ch-statut'); if (st) st.value = 'En préparation';
  var dd = document.getElementById('ch-projet-dropdown'); if (dd) dd.style.display = 'none';
}

function editChantier(id) {
  var ch = null;
  _chCache.chantiers.forEach(function(c) { if (c.id === id) ch = c; });
  if (!ch) return;
  document.getElementById('ch-edit-id').value = ch.id;
  document.getElementById('ch-projet-id').value = ch.projet_id || '';
  // Set search input text for the project
  var projetSearch = document.getElementById('ch-projet-search');
  if (projetSearch && ch.projet_id) {
    var projets = getProjets() || [];
    projetSearch.value = '';
    for (var i = 0; i < projets.length; i++) {
      if (projets[i].id === ch.projet_id) {
        projetSearch.value = (projets[i].code ? projets[i].code + ' — ' : '') + (projets[i].nom || '');
        break;
      }
    }
  } else if (projetSearch) { projetSearch.value = ''; }
  document.getElementById('ch-nom').value = ch.nom || '';
  document.getElementById('ch-code').value = ch.code || '';
  document.getElementById('ch-adresse').value = ch.adresse || '';
  document.getElementById('ch-date-debut').value = (ch.date_debut || '').substring(0, 10);
  document.getElementById('ch-date-fin').value = (ch.date_fin_prevue || '').substring(0, 10);
  document.getElementById('ch-budget').value = ch.budget_travaux || '';
  document.getElementById('ch-statut').value = ch.statut || 'En préparation';
  document.getElementById('ch-description').value = ch.description || '';
  document.getElementById('modal-chantier-title').textContent = 'Modifier le chantier';
  openModal('modal-chantier');
}

// ── Save lot ──
function saveLot() {
  var id = document.getElementById('chl-edit-id').value;
  var body = {
    chantier_id: _chCache.currentId,
    code: document.getElementById('chl-code').value,
    nom: document.getElementById('chl-nom').value,
    entreprise: document.getElementById('chl-entreprise').value,
    montant_marche: parseFloat(document.getElementById('chl-montant').value) || 0,
    date_debut: document.getElementById('chl-date-debut').value || null,
    date_fin_prevue: document.getElementById('chl-date-fin').value || null,
    couleur: document.getElementById('chl-couleur').value || '#c8a96e'
  };
  if (!body.nom) { showToast('Le nom du lot est requis', 'warning'); return; }
  var url = id ? ('api/chantier.php?action=lots&id=' + id) : 'api/chantier.php?action=lots';
  apiFetch(url, { method: id ? 'PUT' : 'POST', body: body }).then(function() {
    showToast('Lot enregistré', 'success');
    closeModal('modal-ch-lot');
    chantierSelected();
  }).catch(function(e) { showToast('Erreur: ' + e.message, 'error'); });
}

// ── Save tâche chantier ──
function saveChTache() {
  var id = document.getElementById('cht-edit-id').value;
  var body = {
    chantier_id: _chCache.currentId,
    lot_id: document.getElementById('cht-lot-id').value || null,
    titre: document.getElementById('cht-titre').value,
    date_debut: document.getElementById('cht-date-debut').value || null,
    date_fin: document.getElementById('cht-date-fin').value || null,
    duree_jours: parseInt(document.getElementById('cht-duree').value) || 0,
    avancement: parseInt(document.getElementById('cht-avancement').value) || 0,
    est_jalon: document.getElementById('cht-jalon').checked ? 1 : 0,
    est_critique: document.getElementById('cht-critique').checked ? 1 : 0
  };
  if (!body.titre) { showToast('Le titre est requis', 'warning'); return; }
  var url = id ? ('api/chantier.php?action=taches&id=' + id) : 'api/chantier.php?action=taches';
  apiFetch(url, { method: id ? 'PUT' : 'POST', body: body }).then(function() {
    showToast('Tâche enregistrée', 'success');
    closeModal('modal-ch-tache');
    chantierSelected();
  }).catch(function(e) { showToast('Erreur: ' + e.message, 'error'); });
}

function editChTache(id) {
  var t = null; _chCache.taches.forEach(function(x) { if (x.id === id) t = x; });
  if (!t) return;
  document.getElementById('cht-edit-id').value = t.id;
  document.getElementById('cht-titre').value = t.titre || '';
  document.getElementById('cht-lot-id').value = t.lot_id || '';
  document.getElementById('cht-date-debut').value = (t.date_debut || '').substring(0, 10);
  document.getElementById('cht-date-fin').value = (t.date_fin || '').substring(0, 10);
  document.getElementById('cht-duree').value = t.duree_jours || '';
  document.getElementById('cht-avancement').value = t.avancement || '';
  document.getElementById('cht-jalon').checked = !!parseInt(t.est_jalon);
  document.getElementById('cht-critique').checked = !!parseInt(t.est_critique);
  openModal('modal-ch-tache');
}

// ══════════════════════════════════════
//  2. JOURNAL DE CHANTIER
// ══════════════════════════════════════

// Phases cache
var _chPhasesCache = [];
function _chLoadPhases() {
  return apiFetch('api/chantier.php?action=phases').then(function(r) {
    _chPhasesCache = (r && r.data) ? r.data : [];
    return _chPhasesCache;
  }).catch(function() { return []; });
}

function _chPopulatePhaseSelects() {
  var selectors = ['chj-phase', 'chj-filter-phase'];
  selectors.forEach(function(sid) {
    var sel = document.getElementById(sid);
    if (!sel) return;
    var val = sel.value;
    var h = '<option value="">-- Phase --</option>';
    _chPhasesCache.forEach(function(p) {
      if (p.actif == 0) return;
      h += '<option value="' + _cgEscape(p.nom) + '"' + (p.nom === val ? ' selected' : '') + '>' + _cgEscape(p.nom) + '</option>';
    });
    sel.innerHTML = h;
    if (val) sel.value = val;
  });
}

function renderChantierJournalPage() {
  _chLoadChantiers().then(function() {
    _chLoadPhases().then(function() { _chPopulatePhaseSelects(); });
    var cid = _chGetCurrentId('chj-chantier-filter');
    if (!cid) { document.getElementById('chj-tbody').innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-3);padding:1.5rem">Selectionnez un chantier</td></tr>'; document.getElementById('chj-count').textContent = ''; return; }
    var params = 'api/chantier.php?action=journal&chantier_id=' + cid;
    var df = document.getElementById('chj-filter-from'); if (df && df.value) params += '&date_from=' + df.value;
    var dt = document.getElementById('chj-filter-to'); if (dt && dt.value) params += '&date_to=' + dt.value;
    var ph = document.getElementById('chj-filter-phase'); if (ph && ph.value) params += '&phase=' + encodeURIComponent(ph.value);
    apiFetch(params).then(function(r) {
      _chCache.journal = (r && r.data) ? r.data : [];
      _renderJournalTable();
    }).catch(function(e) {
      console.error('[journal] list error:', e);
      document.getElementById('chj-tbody').innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--red);padding:1.5rem">Erreur chargement: ' + _cgEscape(e.message||'') + '</td></tr>';
    });
  });
}

function _renderJournalTable() {
  var tbody = document.getElementById('chj-tbody');
  var cnt = document.getElementById('chj-count');
  if (!_chCache.journal.length) { tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-3);padding:1.5rem">Aucune entree</td></tr>'; if(cnt) cnt.textContent = '0 entree'; return; }
  if(cnt) cnt.textContent = _chCache.journal.length + ' entree' + (_chCache.journal.length > 1 ? 's' : '');
  var h = '';
  _chCache.journal.forEach(function(j) {
    var horaires = (j.heure_debut||'') + (j.heure_debut && j.heure_fin ? ' - ' : '') + (j.heure_fin||'');
    var validBadge = j.valide_par ? '<span style="display:inline-block;padding:0.15rem 0.4rem;border-radius:4px;font-size:0.7rem;background:#1a3a1a;color:#4ade80">Valide</span>' : '<span style="display:inline-block;padding:0.15rem 0.4rem;border-radius:4px;font-size:0.7rem;background:#3a2a1a;color:var(--accent)">Brouillon</span>';
    var hasIncident = j.incidents_securite ? ' <span title="Incident signale" style="color:var(--red)">&#9888;</span>' : '';
    h += '<tr>' +
      '<td style="font-weight:600;color:var(--accent)">#' + (j.numero||'') + '</td>' +
      '<td>' + _chDate(j.date_jour) + '</td>' +
      '<td style="font-size:0.78rem">' + _cgEscape(horaires||'--') + '</td>' +
      '<td style="font-size:0.78rem">' + _cgEscape(j.phase_lot||'--') + '</td>' +
      '<td>' + _cgEscape(j.meteo||'--') + '</td>' +
      '<td>' + (j.effectif_total||0) + '</td>' +
      '<td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _cgEscape(j.activites||'') + hasIncident + '</td>' +
      '<td>' + validBadge + '</td>' +
      '<td>' + _cgEscape(j.cree_par||'') + '</td>' +
      '<td style="white-space:nowrap">' +
        '<button class="btn btn-sm" onclick="viewChJournal(\'' + j.id + '\')" title="Voir le detail">&#128065;</button> ' +
        '<button class="btn btn-sm" onclick="editChJournal(\'' + j.id + '\')" title="Modifier">&#9998;</button> ' +
        '<button class="btn btn-sm" onclick="exportChJournalPDF(\'' + j.id + '\')" title="Export PDF">&#128196;</button> ' +
        (j.valide_par ? '' : '<button class="btn btn-sm" onclick="validerChJournal(\'' + j.id + '\')" title="Valider" style="color:var(--green)">&#10003;</button> ') +
        '<button class="btn btn-sm" style="color:var(--red)" onclick="deleteChJournal(\'' + j.id + '\')" title="Supprimer">&#128465;</button>' +
      '</td></tr>';
  });
  tbody.innerHTML = h;
  makeTableSortable(document.getElementById('chj-table'));
}

// Journal photos state
var _chJournalPhotos = [];

function saveChJournal() {
  var id = document.getElementById('chj-edit-id').value;
  var cid = _chGetCurrentId('chj-chantier-filter');
  // Collect effectifs
  var effRows = document.querySelectorAll('#chj-effectifs-rows .chj-eff-row');
  var effectifs = [];
  effRows.forEach(function(row) {
    var inputs = row.querySelectorAll('input');
    if (inputs[0] && inputs[0].value) {
      effectifs.push({ entreprise: inputs[0].value, nb_ouvriers: parseInt(inputs[1].value)||0, nb_cadres: parseInt(inputs[2].value)||0 });
    }
  });
  // Collect intervenants presents
  var intRows = document.querySelectorAll('#chj-intervenants-rows .chj-int-row');
  var intervenants = [];
  intRows.forEach(function(row) {
    var inputs = row.querySelectorAll('input');
    if (inputs[0] && inputs[0].value) {
      intervenants.push({ nom: inputs[0].value, role: inputs[1] ? inputs[1].value : '' });
    }
  });
  // Auto-calc effectif total
  var effTotal = 0;
  effectifs.forEach(function(e) { effTotal += (e.nb_ouvriers||0) + (e.nb_cadres||0); });

  var body = {
    chantier_id: cid,
    date_jour: document.getElementById('chj-date').value,
    heure_debut: document.getElementById('chj-heure-debut').value || null,
    heure_fin: document.getElementById('chj-heure-fin').value || null,
    phase_lot: document.getElementById('chj-phase').value || null,
    meteo: document.getElementById('chj-meteo').value,
    temperature: document.getElementById('chj-temperature').value,
    effectif_total: effTotal,
    activites: document.getElementById('chj-activites').value,
    livraisons: document.getElementById('chj-livraisons').value,
    intervenants_presents: intervenants,
    visiteurs: document.getElementById('chj-visiteurs').value,
    incidents_securite: document.getElementById('chj-incidents').value,
    retards: document.getElementById('chj-retards').value,
    decisions: document.getElementById('chj-decisions').value,
    observations: document.getElementById('chj-observations').value,
    prochaine_date: document.getElementById('chj-prochaine-date').value || null,
    prochaine_desc: document.getElementById('chj-prochaine-desc').value,
    photos: _chJournalPhotos,
    effectifs: effectifs
  };
  if (!cid) { showToast('Selectionnez un chantier dans le filtre', 'warning'); return; }
  if (!body.date_jour) { showToast('La date est requise', 'warning'); return; }
  if (!body.activites) { showToast('Les activites sont requises', 'warning'); return; }
  var url = id ? ('api/chantier.php?action=journal&id=' + id) : 'api/chantier.php?action=journal';
  apiFetch(url, { method: id ? 'PUT' : 'POST', body: body }).then(function() {
    showToast('Journal enregistre', 'success');
    closeModal('modal-ch-journal');
    _chJournalPhotos = [];
    renderChantierJournalPage();
  }).catch(function(e) { showToast('Erreur: ' + e.message, 'error'); });
}

function editChJournal(id) {
  var j = null; _chCache.journal.forEach(function(x) { if (x.id === id) j = x; });
  if (!j) return;
  _chLoadPhases().then(function() {
    _chPopulatePhaseSelects();
    document.getElementById('chj-edit-id').value = j.id;
    document.getElementById('chj-numero').value = j.numero || '';
    document.getElementById('chj-numero-display').value = j.numero ? '#' + j.numero : '';
    document.getElementById('chj-date').value = (j.date_jour || '').substring(0, 10);
    document.getElementById('chj-heure-debut').value = j.heure_debut || '';
    document.getElementById('chj-heure-fin').value = j.heure_fin || '';
    document.getElementById('chj-phase').value = j.phase_lot || '';
    document.getElementById('chj-meteo').value = j.meteo || '';
    document.getElementById('chj-temperature').value = j.temperature || '';
    document.getElementById('chj-effectif').value = j.effectif_total || '';
    document.getElementById('chj-activites').value = j.activites || '';
    document.getElementById('chj-livraisons').value = j.livraisons || '';
    document.getElementById('chj-visiteurs').value = j.visiteurs || '';
    document.getElementById('chj-incidents').value = j.incidents_securite || '';
    document.getElementById('chj-retards').value = j.retards || '';
    document.getElementById('chj-decisions').value = j.decisions || '';
    document.getElementById('chj-observations').value = j.observations || '';
    document.getElementById('chj-prochaine-date').value = (j.prochaine_date || '').substring(0, 10);
    document.getElementById('chj-prochaine-desc').value = j.prochaine_desc || '';
    // Effectifs
    var cont = document.getElementById('chj-effectifs-rows');
    cont.innerHTML = '';
    (j.effectifs || []).forEach(function(e) { addChJEffRow(e.entreprise, e.nb_ouvriers, e.nb_cadres); });
    // Intervenants presents
    var icont = document.getElementById('chj-intervenants-rows');
    icont.innerHTML = '';
    (j.intervenants_presents || []).forEach(function(i) { addChJIntervenantRow(i.nom, i.role); });
    // Photos
    _chJournalPhotos = j.photos || [];
    _renderChJournalPhotos();
    document.getElementById('modal-chj-title').textContent = 'Modifier Journal #' + (j.numero||'') + ' — ' + _chDate(j.date_jour);
    openModal('modal-ch-journal');
  });
}

function viewChJournal(id) {
  var j = null; _chCache.journal.forEach(function(x) { if (x.id === id) j = x; });
  if (!j) return;
  // Open a detail view in a simple modal-like alert (reuses the journal modal in readonly feel)
  editChJournal(id);
}

function deleteChJournal(id) {
  if (!confirm('Supprimer cette entree du journal ?')) return;
  apiFetch('api/chantier.php?action=journal&id=' + id, { method: 'DELETE' }).then(function() {
    showToast('Supprime', 'success');
    renderChantierJournalPage();
  });
}

function validerChJournal(id) {
  if (!confirm('Valider cette entree du journal ? Cette action est irreversible.')) return;
  apiFetch('api/chantier.php?action=journal_valider&id=' + id, { method: 'POST', body: {} }).then(function() {
    showToast('Journal valide', 'success');
    renderChantierJournalPage();
  }).catch(function(e) { showToast('Erreur: ' + e.message, 'error'); });
}

function addChJEffRow(ent, ouv, cad) {
  var cont = document.getElementById('chj-effectifs-rows');
  var row = document.createElement('div');
  row.className = 'chj-eff-row';
  row.style.cssText = 'display:flex;gap:0.5rem;margin-bottom:0.4rem;align-items:center';
  row.innerHTML = '<input type="text" class="form-input" placeholder="Entreprise" value="' + _cgEscape(ent||'') + '" style="flex:2">' +
    '<input type="number" class="form-input" placeholder="Ouvriers" value="' + (ouv||'') + '" style="flex:1;min-width:80px" min="0" oninput="_chJRecalcEffectif()">' +
    '<input type="number" class="form-input" placeholder="Cadres" value="' + (cad||'') + '" style="flex:1;min-width:80px" min="0" oninput="_chJRecalcEffectif()">' +
    '<button class="btn btn-sm" style="color:var(--red)" onclick="this.parentElement.remove();_chJRecalcEffectif()">&#10005;</button>';
  cont.appendChild(row);
  _chJRecalcEffectif();
}

function addChJIntervenantRow(nom, role) {
  var cont = document.getElementById('chj-intervenants-rows');
  var row = document.createElement('div');
  row.className = 'chj-int-row';
  row.style.cssText = 'display:flex;gap:0.5rem;margin-bottom:0.4rem;align-items:center';
  row.innerHTML = '<input type="text" class="form-input" placeholder="Nom" value="' + _cgEscape(nom||'') + '" style="flex:1">' +
    '<input type="text" class="form-input" placeholder="Role (MOE, BET, OPC...)" value="' + _cgEscape(role||'') + '" style="flex:1">' +
    '<button class="btn btn-sm" style="color:var(--red)" onclick="this.parentElement.remove()">&#10005;</button>';
  cont.appendChild(row);
}

function _chResetJournalForm() {
  ['chj-edit-id','chj-numero','chj-date','chj-heure-debut','chj-heure-fin','chj-temperature',
   'chj-activites','chj-livraisons','chj-visiteurs','chj-incidents','chj-retards','chj-decisions',
   'chj-observations','chj-prochaine-date','chj-prochaine-desc'].forEach(function(fid) {
    var el = document.getElementById(fid); if (el) el.value = '';
  });
  var ph = document.getElementById('chj-phase'); if (ph) ph.selectedIndex = 0;
  var mt = document.getElementById('chj-meteo'); if (mt) mt.selectedIndex = 0;
  var ef = document.getElementById('chj-effectif'); if (ef) ef.value = '';
  var nd = document.getElementById('chj-numero-display'); if (nd) nd.value = 'Auto';
  document.getElementById('chj-effectifs-rows').innerHTML = '';
  document.getElementById('chj-intervenants-rows').innerHTML = '';
  _chJournalPhotos = [];
  _renderChJournalPhotos();
  document.getElementById('modal-chj-title').textContent = 'Saisie journal de chantier';
  // Set today's date by default
  document.getElementById('chj-date').value = new Date().toISOString().substring(0, 10);
}

function _chJRecalcEffectif() {
  var effRows = document.querySelectorAll('#chj-effectifs-rows .chj-eff-row');
  var total = 0;
  effRows.forEach(function(row) {
    var inputs = row.querySelectorAll('input[type="number"]');
    total += (parseInt(inputs[0].value)||0) + (parseInt(inputs[1].value)||0);
  });
  var el = document.getElementById('chj-effectif');
  if (el) el.value = total;
}

// Photos handling
function chJournalPhotosSelected(input) {
  var files = input.files;
  if (!files || !files.length) return;
  Array.from(files).forEach(function(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      _chJournalPhotos.push({ data: e.target.result, nom: file.name, legende: '', timestamp: new Date().toISOString() });
      _renderChJournalPhotos();
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function _renderChJournalPhotos() {
  var cont = document.getElementById('chj-photos-preview');
  if (!cont) return;
  if (!_chJournalPhotos.length) { cont.innerHTML = '<div style="color:var(--text-3);font-size:0.78rem">Aucune photo</div>'; return; }
  var h = '';
  _chJournalPhotos.forEach(function(p, i) {
    h += '<div style="position:relative;width:120px">' +
      '<img src="' + (p.data || p.url || '') + '" style="width:120px;height:90px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">' +
      '<input type="text" class="form-input" placeholder="Legende..." value="' + _cgEscape(p.legende||'') + '" style="font-size:0.7rem;margin-top:0.2rem;padding:0.2rem 0.4rem" onchange="_chJournalPhotos[' + i + '].legende=this.value">' +
      '<button onclick="_chJournalPhotos.splice(' + i + ',1);_renderChJournalPhotos()" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.7);color:#fff;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;font-size:0.7rem;line-height:20px;text-align:center">&#10005;</button>' +
      '</div>';
  });
  cont.innerHTML = h;
}

// PDF Export (client-side generation)
function exportChJournalPDF(id) {
  apiFetch('api/chantier.php?action=journal_pdf&id=' + id).then(function(r) {
    if (!r || !r.data || !r.data.journal) { showToast('Erreur export', 'error'); return; }
    var j = r.data.journal;
    var ag = r.data.agence || {};
    _generateJournalPDF(j, ag);
  }).catch(function(e) { showToast('Erreur: ' + e.message, 'error'); });
}

function _generateJournalPDF(j, ag) {
  // Build printable HTML and open in new window
  var intervenants = j.intervenants_presents || [];
  var effectifs = j.effectifs || [];
  var photos = j.photos || [];
  var effTotal = 0; effectifs.forEach(function(e) { effTotal += (e.nb_ouvriers||0) + (e.nb_cadres||0); });

  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Journal de chantier #' + (j.numero||'') + '</title>' +
    '<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;color:#222;padding:20px}' +
    '.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #c8a96e;padding-bottom:10px;margin-bottom:15px}' +
    '.header h1{font-size:16px;color:#c8a96e}.header .agence{text-align:right;font-size:10px;color:#666}' +
    '.info-grid{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:12px;border:1px solid #ddd;padding:10px;border-radius:4px}' +
    '.info-grid .item{}.info-grid .label{font-size:9px;text-transform:uppercase;color:#888;margin-bottom:2px}.info-grid .value{font-weight:600}' +
    '.section{margin-bottom:12px}.section-title{font-size:12px;font-weight:bold;color:#c8a96e;border-bottom:1px solid #eee;padding-bottom:3px;margin-bottom:6px}' +
    '.section-body{white-space:pre-wrap;line-height:1.5}' +
    'table.eff{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:8px}table.eff th,table.eff td{border:1px solid #ddd;padding:4px 6px;text-align:left}table.eff th{background:#f5f5f5}' +
    '.photos{display:flex;flex-wrap:wrap;gap:8px}.photos img{width:140px;height:100px;object-fit:cover;border:1px solid #ddd;border-radius:3px}' +
    '.footer{margin-top:20px;border-top:1px solid #ddd;padding-top:10px;display:flex;justify-content:space-between;font-size:10px;color:#888}' +
    '.incident{color:#c00;font-weight:bold}' +
    '@media print{body{padding:10px}}</style></head><body>' +
    '<div class="header"><div><h1>JOURNAL DE CHANTIER N&#176;' + (j.numero||'') + '</h1>' +
    '<div style="font-size:11px;margin-top:4px">' + _cgEscape(j.chantier_nom||'') + (j.chantier_code ? ' (' + _cgEscape(j.chantier_code) + ')' : '') + '</div>' +
    '<div style="font-size:10px;color:#666">' + _cgEscape(j.projet_nom||'') + '</div></div>' +
    '<div class="agence"><strong>' + _cgEscape(ag['agence_raison']||'Cortoba Architecture') + '</strong><br>' +
    _cgEscape(ag['agence_adresse']||'') + '<br>' + _cgEscape(ag['agence_tel']||'') + '</div></div>';

  html += '<div class="info-grid">' +
    '<div class="item"><div class="label">Date</div><div class="value">' + _chDate(j.date_jour) + '</div></div>' +
    '<div class="item"><div class="label">Horaires</div><div class="value">' + (j.heure_debut||'--') + ' - ' + (j.heure_fin||'--') + '</div></div>' +
    '<div class="item"><div class="label">Phase</div><div class="value">' + _cgEscape(j.phase_lot||'--') + '</div></div>' +
    '<div class="item"><div class="label">Meteo</div><div class="value">' + _cgEscape(j.meteo||'--') + ' ' + _cgEscape(j.temperature ? j.temperature + '&#176;C' : '') + '</div></div>' +
    '<div class="item"><div class="label">Effectif total</div><div class="value">' + effTotal + '</div></div>' +
    '<div class="item"><div class="label">Adresse</div><div class="value">' + _cgEscape(j.chantier_adresse||'--') + '</div></div>' +
    '<div class="item"><div class="label">Redige par</div><div class="value">' + _cgEscape(j.cree_par||'') + '</div></div>' +
    '<div class="item"><div class="label">Statut</div><div class="value">' + (j.valide_par ? 'Valide par ' + _cgEscape(j.valide_par) : 'Brouillon') + '</div></div>' +
    '</div>';

  // Activites
  html += '<div class="section"><div class="section-title">Activites realisees</div><div class="section-body">' + _cgEscape(j.activites||'--') + '</div></div>';

  // Effectifs table
  if (effectifs.length) {
    html += '<div class="section"><div class="section-title">Effectifs par entreprise</div><table class="eff"><tr><th>Entreprise</th><th>Ouvriers</th><th>Cadres</th><th>Total</th></tr>';
    effectifs.forEach(function(e) { html += '<tr><td>' + _cgEscape(e.entreprise) + '</td><td>' + (e.nb_ouvriers||0) + '</td><td>' + (e.nb_cadres||0) + '</td><td>' + ((e.nb_ouvriers||0)+(e.nb_cadres||0)) + '</td></tr>'; });
    html += '<tr style="font-weight:bold"><td>TOTAL</td><td></td><td></td><td>' + effTotal + '</td></tr></table></div>';
  }

  // Intervenants
  if (intervenants.length) {
    html += '<div class="section"><div class="section-title">Intervenants presents</div><div class="section-body">';
    intervenants.forEach(function(i) { html += '&#8226; ' + _cgEscape(i.nom||'') + (i.role ? ' (' + _cgEscape(i.role) + ')' : '') + '<br>'; });
    html += '</div></div>';
  }

  if (j.livraisons) html += '<div class="section"><div class="section-title">Livraisons</div><div class="section-body">' + _cgEscape(j.livraisons) + '</div></div>';
  if (j.visiteurs) html += '<div class="section"><div class="section-title">Visiteurs</div><div class="section-body">' + _cgEscape(j.visiteurs) + '</div></div>';
  if (j.incidents_securite) html += '<div class="section"><div class="section-title incident">Incidents / Securite</div><div class="section-body incident">' + _cgEscape(j.incidents_securite) + '</div></div>';
  if (j.retards) html += '<div class="section"><div class="section-title">Retards / Difficultes</div><div class="section-body">' + _cgEscape(j.retards) + '</div></div>';
  if (j.decisions) html += '<div class="section"><div class="section-title">Decisions prises sur site</div><div class="section-body">' + _cgEscape(j.decisions) + '</div></div>';
  if (j.observations) html += '<div class="section"><div class="section-title">Observations</div><div class="section-body">' + _cgEscape(j.observations) + '</div></div>';
  if (j.prochaine_date || j.prochaine_desc) html += '<div class="section"><div class="section-title">Prochaine intervention</div><div class="section-body">' + (j.prochaine_date ? _chDate(j.prochaine_date) + ' — ' : '') + _cgEscape(j.prochaine_desc||'') + '</div></div>';

  // Photos
  if (photos.length) {
    html += '<div class="section"><div class="section-title">Photos du jour</div><div class="photos">';
    photos.forEach(function(p) { html += '<div><img src="' + (p.data||p.url||'') + '"><div style="font-size:9px;color:#666;margin-top:2px">' + _cgEscape(p.legende||'') + '</div></div>'; });
    html += '</div></div>';
  }

  html += '<div class="footer"><span>Imprime le ' + new Date().toLocaleDateString('fr-FR') + '</span><span>' + _cgEscape(ag['agence_raison']||'Cortoba Architecture') + '</span></div>';
  html += '<script>window.onload=function(){window.print();}<\/script></body></html>';

  var w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
  else { showToast('Popup bloquee — autorisez les popups', 'warning'); }
}

// Parametres — Phases CRUD
function loadParamPhases() {
  _chLoadPhases().then(function() {
    var wrap = document.getElementById('param-phases-wrap');
    if (!wrap) return;
    if (!_chPhasesCache.length) { wrap.innerHTML = '<div style="color:var(--text-3);font-size:0.82rem">Aucune phase configuree</div>'; return; }
    var h = '<div style="display:flex;flex-direction:column;gap:0.3rem">';
    _chPhasesCache.forEach(function(p, i) {
      h += '<div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.6rem;background:var(--bg-2);border-radius:4px;border:1px solid var(--border)">' +
        '<span style="color:var(--text-3);font-size:0.75rem;width:24px">' + (i+1) + '.</span>' +
        '<span style="flex:1;font-size:0.82rem">' + _cgEscape(p.nom) + '</span>' +
        (p.actif == 0 ? '<span style="font-size:0.7rem;color:var(--text-3)">(inactif)</span>' : '') +
        '<button class="btn btn-sm" onclick="toggleParamPhase(\'' + p.id + '\',' + (p.actif == 1 ? 0 : 1) + ')" title="' + (p.actif == 1 ? 'Desactiver' : 'Activer') + '">' + (p.actif == 1 ? '&#128064;' : '&#128683;') + '</button>' +
        '<button class="btn btn-sm" style="color:var(--red)" onclick="deleteParamPhase(\'' + p.id + '\')">&#10005;</button>' +
        '</div>';
    });
    h += '</div>';
    wrap.innerHTML = h;
  });
}

function addParamPhase() {
  var nom = document.getElementById('param-phase-nom').value.trim();
  if (!nom) { showToast('Nom requis', 'warning'); return; }
  apiFetch('api/chantier.php?action=phases', { method: 'POST', body: { nom: nom } }).then(function() {
    document.getElementById('param-phase-nom').value = '';
    showToast('Phase ajoutee', 'success');
    loadParamPhases();
  }).catch(function(e) { showToast('Erreur: ' + e.message, 'error'); });
}

function toggleParamPhase(id, actif) {
  var ph = null; _chPhasesCache.forEach(function(p) { if (p.id === id) ph = p; });
  if (!ph) return;
  apiFetch('api/chantier.php?action=phases&id=' + id, { method: 'PUT', body: { nom: ph.nom, ordre: ph.ordre, actif: actif } }).then(function() {
    loadParamPhases();
  });
}

function deleteParamPhase(id) {
  if (!confirm('Supprimer cette phase ?')) return;
  apiFetch('api/chantier.php?action=phases&id=' + id, { method: 'DELETE' }).then(function() {
    showToast('Phase supprimee', 'success');
    loadParamPhases();
  });
}

// ══════════════════════════════════════
//  3. INTERVENANTS
// ══════════════════════════════════════

function renderChantierIntervenantsPage() {
  _chLoadChantiers().then(function() {
    var cid = _chGetCurrentId('chi-chantier-filter');
    if (!cid) { document.getElementById('chi-tbody').innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-3);padding:1.5rem">Sélectionnez un chantier</td></tr>'; return; }
    apiFetch('api/chantier.php?action=intervenants&chantier_id=' + cid).then(function(r) {
      _chCache.intervenants = (r && r.data) ? r.data : [];
      _renderIntervenantsTable();
    });
  });
}

function _renderIntervenantsTable() {
  var tbody = document.getElementById('chi-tbody');
  if (!_chCache.intervenants.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-3);padding:1.5rem">Aucun intervenant</td></tr>'; return; }
  var h = '';
  _chCache.intervenants.forEach(function(i) {
    h += '<tr><td><strong>' + _cgEscape(i.role||'') + '</strong></td><td>' + _cgEscape(i.nom||'') + '</td><td>' + _cgEscape(i.societe||'—') + '</td>' +
      '<td>' + _cgEscape(i.tel||'—') + '</td><td>' + _cgEscape(i.email||'—') + '</td>' +
      '<td>' + (parseInt(i.acces_portail) ? '<span class="badge badge-green">Oui</span>' : '<span class="badge badge-gray">Non</span>') + '</td>' +
      '<td><button class="btn btn-sm" onclick="editChIntervenant(\'' + i.id + '\')">Modifier</button> <button class="btn btn-sm" style="color:var(--red)" onclick="deleteChIntervenant(\'' + i.id + '\')">Suppr.</button></td></tr>';
  });
  tbody.innerHTML = h;
  makeTableSortable(document.getElementById('chi-table'));
}

function saveChIntervenant() {
  var id = document.getElementById('chi-edit-id').value;
  var cid = _chGetCurrentId('chi-chantier-filter');
  var body = {
    chantier_id: cid,
    role: document.getElementById('chi-role').value,
    nom: document.getElementById('chi-nom').value,
    societe: document.getElementById('chi-societe').value,
    tel: document.getElementById('chi-tel').value,
    email: document.getElementById('chi-email').value,
    acces_portail: document.getElementById('chi-acces').checked ? 1 : 0,
    responsabilites: document.getElementById('chi-responsabilites').value
  };
  if (!body.nom) { showToast('Le nom est requis', 'warning'); return; }
  var url = id ? ('api/chantier.php?action=intervenants&id=' + id) : 'api/chantier.php?action=intervenants';
  apiFetch(url, { method: id ? 'PUT' : 'POST', body: body }).then(function() {
    showToast('Intervenant enregistré', 'success');
    closeModal('modal-ch-intervenant');
    renderChantierIntervenantsPage();
  }).catch(function(e) { showToast('Erreur: ' + e.message, 'error'); });
}

function editChIntervenant(id) {
  var it = null; _chCache.intervenants.forEach(function(x) { if (x.id === id) it = x; });
  if (!it) return;
  document.getElementById('chi-edit-id').value = it.id;
  document.getElementById('chi-role').value = it.role || 'Entreprise';
  document.getElementById('chi-nom').value = it.nom || '';
  document.getElementById('chi-societe').value = it.societe || '';
  document.getElementById('chi-tel').value = it.tel || '';
  document.getElementById('chi-email').value = it.email || '';
  document.getElementById('chi-acces').checked = !!parseInt(it.acces_portail);
  document.getElementById('chi-responsabilites').value = it.responsabilites || '';
  openModal('modal-ch-intervenant');
}

function deleteChIntervenant(id) {
  if (!confirm('Supprimer cet intervenant ?')) return;
  apiFetch('api/chantier.php?action=intervenants&id=' + id, { method: 'DELETE' }).then(function() {
    showToast('Supprimé', 'success');
    renderChantierIntervenantsPage();
  });
}

// ══════════════════════════════════════
//  4. RÉUNIONS & PV
// ══════════════════════════════════════

var _chrTab = 'reunions', _chrActFilter = '';

function renderChantierReunionsPage() {
  _chLoadChantiers().then(function() {
    var cid = _chGetCurrentId('chr-chantier-filter');
    if (!cid) { document.getElementById('chr-tbody').innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-3);padding:1.5rem">Sélectionnez un chantier</td></tr>'; return; }
    apiFetch('api/chantier_reunions.php?action=reunions&chantier_id=' + cid).then(function(r) {
      _chCache.reunions = (r && r.data) ? r.data : [];
      _renderReunionsTable();
    });
    apiFetch('api/chantier_reunions.php?action=actions&chantier_id=' + cid).then(function(r) {
      _chCache.actions = (r && r.data) ? r.data : [];
      _renderActionsTable();
    });
  });
}

function chrSwitchTab(tab, btn) {
  _chrTab = tab;
  document.querySelectorAll('.chr-tab').forEach(function(t) { t.classList.remove('active'); t.style.color = 'var(--text-3)'; t.style.borderBottom = '2px solid transparent'; });
  if (btn) { btn.classList.add('active'); btn.style.color = 'var(--text-2)'; btn.style.borderBottom = '2px solid var(--accent)'; }
  document.getElementById('chr-panel-reunions').style.display = tab === 'reunions' ? '' : 'none';
  document.getElementById('chr-panel-actions').style.display = tab === 'actions' ? '' : 'none';
}

function _renderReunionsTable() {
  var tbody = document.getElementById('chr-tbody');
  if (!_chCache.reunions.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-3);padding:1.5rem">Aucune réunion</td></tr>'; return; }
  var h = '';
  _chCache.reunions.forEach(function(r) {
    var nbPart = (r.participants || []).length;
    var nbAct = (r.actions || []).length;
    h += '<tr><td><strong>' + r.numero + '</strong></td><td>' + _chDate(r.date_reunion) + '</td>' +
      '<td>' + _cgEscape(r.objet||'') + '</td><td>' + nbPart + ' participant' + (nbPart>1?'s':'') + '</td>' +
      '<td>' + _chBadge(r.statut) + '</td><td>' + nbAct + ' action' + (nbAct>1?'s':'') + '</td>' +
      '<td><button class="btn btn-sm" onclick="editChReunion(\'' + r.id + '\')">Ouvrir</button></td></tr>';
  });
  tbody.innerHTML = h;
  makeTableSortable(document.getElementById('chr-table'));
}

function chrFilterActions(f, btn) {
  _chrActFilter = f;
  document.querySelectorAll('.chr-action-filter').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  _renderActionsTable();
}

function _renderActionsTable() {
  var tbody = document.getElementById('chr-actions-tbody');
  var filtered = _chrActFilter ? _chCache.actions.filter(function(a) { return a.statut === _chrActFilter; }) : _chCache.actions;
  if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:1.5rem">Aucune action</td></tr>'; return; }
  var h = '';
  filtered.forEach(function(a) {
    h += '<tr><td>R' + (a.reunion_numero||'?') + '</td><td>' + _cgEscape(a.description||'') + '</td>' +
      '<td>' + _cgEscape(a.responsable||'—') + '</td><td>' + _chDate(a.delai) + '</td>' +
      '<td>' + _chBadge(a.statut) + '</td>' +
      '<td><select class="form-input" style="width:120px;font-size:0.78rem" onchange="updateChAction(\'' + a.id + '\',this.value)"><option' + (a.statut==='Ouverte'?' selected':'') + '>Ouverte</option><option' + (a.statut==='En cours'?' selected':'') + '>En cours</option><option' + (a.statut==='Clôturée'?' selected':'') + '>Clôturée</option></select></td></tr>';
  });
  tbody.innerHTML = h;
}

function updateChAction(id, newStatut) {
  apiFetch('api/chantier_reunions.php?action=actions&id=' + id, { method: 'PUT', body: { statut: newStatut } }).then(function() {
    showToast('Action mise à jour', 'success');
    renderChantierReunionsPage();
  });
}

function saveChReunion() {
  var id = document.getElementById('chr-edit-id').value;
  var cid = _chGetCurrentId('chr-chantier-filter');
  // Collect actions
  var actRows = document.querySelectorAll('#chr-actions-rows .chr-act-row');
  var actions = [];
  actRows.forEach(function(row) {
    var inputs = row.querySelectorAll('input,select');
    if (inputs[0] && inputs[0].value) {
      actions.push({ description: inputs[0].value, responsable: inputs[1].value, delai: inputs[2].value || null, statut: inputs[3] ? inputs[3].value : 'Ouverte' });
    }
  });
  var body = {
    chantier_id: cid,
    date_reunion: document.getElementById('chr-date').value,
    lieu: document.getElementById('chr-lieu').value,
    objet: document.getElementById('chr-objet').value,
    points_discutes: document.getElementById('chr-points').value,
    decisions: document.getElementById('chr-decisions').value,
    actions: actions
  };
  var url = id ? ('api/chantier_reunions.php?action=reunions&id=' + id) : 'api/chantier_reunions.php?action=reunions';
  apiFetch(url, { method: id ? 'PUT' : 'POST', body: body }).then(function() {
    showToast('Réunion enregistrée', 'success');
    closeModal('modal-ch-reunion');
    renderChantierReunionsPage();
  }).catch(function(e) { showToast('Erreur: ' + e.message, 'error'); });
}

function editChReunion(id) {
  var r = null; _chCache.reunions.forEach(function(x) { if (x.id === id) r = x; });
  if (!r) return;
  document.getElementById('chr-edit-id').value = r.id;
  document.getElementById('chr-date').value = (r.date_reunion || '').replace(' ', 'T').substring(0, 16);
  document.getElementById('chr-lieu').value = r.lieu || '';
  document.getElementById('chr-objet').value = r.objet || '';
  document.getElementById('chr-points').value = r.points_discutes || '';
  document.getElementById('chr-decisions').value = r.decisions || '';
  var cont = document.getElementById('chr-actions-rows');
  cont.innerHTML = '';
  (r.actions || []).forEach(function(a) { addChrActionRow(a.description, a.responsable, a.delai, a.statut); });
  document.getElementById('modal-chr-title').textContent = 'Réunion n°' + r.numero;
  openModal('modal-ch-reunion');
}

function addChrActionRow(desc, resp, delai, statut) {
  var cont = document.getElementById('chr-actions-rows');
  var row = document.createElement('div');
  row.className = 'chr-act-row';
  row.style.cssText = 'display:flex;gap:0.4rem;margin-bottom:0.4rem;align-items:center;flex-wrap:wrap';
  row.innerHTML = '<input type="text" class="form-input" placeholder="Description" value="' + _cgEscape(desc||'') + '" style="flex:3;min-width:200px">' +
    '<input type="text" class="form-input" placeholder="Responsable" value="' + _cgEscape(resp||'') + '" style="flex:1;min-width:120px">' +
    '<input type="date" class="form-input" value="' + (delai||'').substring(0,10) + '" style="flex:1;min-width:130px">' +
    '<select class="form-input" style="flex:1;min-width:100px"><option' + ((statut||'Ouverte')==='Ouverte'?' selected':'') + '>Ouverte</option><option' + (statut==='En cours'?' selected':'') + '>En cours</option><option' + (statut==='Clôturée'?' selected':'') + '>Clôturée</option></select>' +
    '<button class="btn btn-sm" style="color:var(--red)" onclick="this.parentElement.remove()">✕</button>';
  cont.appendChild(row);
}

// ══════════════════════════════════════
//  5. PHOTOS & MÉDIAS
// ══════════════════════════════════════

function renderChantierPhotosPage() {
  _chLoadChantiers().then(function() {
    var cid = _chGetCurrentId('chp-chantier-filter');
    if (!cid) { document.getElementById('chp-gallery').innerHTML = '<div style="color:var(--text-3);text-align:center;padding:3rem;grid-column:1/-1">Sélectionnez un chantier</div>'; return; }
    apiFetch('api/chantier.php?action=lots&chantier_id=' + cid).then(function(r) { _chCache.lots = (r && r.data) ? r.data : []; });
    // For now, photos are stored via URL — fetch from a generic endpoint
    // We'll query reserves photos + journal photos
    document.getElementById('chp-gallery').innerHTML = '<div style="color:var(--text-3);text-align:center;padding:3rem;grid-column:1/-1">Galerie photos — fonctionnalité en cours d\'intégration.<br>Les photos ajoutées aux réserves et au journal sont visibles dans leurs sections respectives.</div>';
  });
}

function saveChPhoto() {
  var cid = _chGetCurrentId('chp-chantier-filter');
  // This would normally save to CA_chantier_photos — for now just show toast
  showToast('Photo enregistrée', 'success');
  closeModal('modal-ch-photo');
}

// ══════════════════════════════════════
//  6. RÉSERVES & RFI
// ══════════════════════════════════════

var _chresTab = 'reserves', _chresFilter = '', _chresRfiFilter = '';

function renderChantierReservesPage() {
  _chLoadChantiers().then(function() {
    var cid = _chGetCurrentId('chres-chantier-filter');
    if (!cid) { document.getElementById('chres-reserves-tbody').innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-3);padding:1.5rem">Sélectionnez un chantier</td></tr>'; return; }
    // Load lots for dropdowns
    apiFetch('api/chantier.php?action=lots&chantier_id=' + cid).then(function(r) { _chCache.lots = (r && r.data) ? r.data : []; _chPopulateLotSelects(); });
    apiFetch('api/chantier_reserves.php?action=reserves&chantier_id=' + cid).then(function(r) {
      _chCache.reserves = (r && r.data) ? r.data : [];
      _renderReservesTable();
    });
    apiFetch('api/chantier_reserves.php?action=rfi&chantier_id=' + cid).then(function(r) {
      _chCache.rfi = (r && r.data) ? r.data : [];
      _renderRfiTable();
    });
  });
}

function chresSwitchTab(tab, btn) {
  _chresTab = tab;
  document.querySelectorAll('.chres-tab').forEach(function(t) { t.classList.remove('active'); t.style.color = 'var(--text-3)'; t.style.borderBottom = '2px solid transparent'; });
  if (btn) { btn.classList.add('active'); btn.style.color = 'var(--text-2)'; btn.style.borderBottom = '2px solid var(--accent)'; }
  document.getElementById('chres-panel-reserves').style.display = tab === 'reserves' ? '' : 'none';
  document.getElementById('chres-panel-rfi').style.display = tab === 'rfi' ? '' : 'none';
}

function chresFilterReserves(f, btn) {
  _chresFilter = f;
  document.querySelectorAll('.chres-filter').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  _renderReservesTable();
}

function _renderReservesTable() {
  var tbody = document.getElementById('chres-reserves-tbody');
  var filtered = _chresFilter ? _chCache.reserves.filter(function(r) { return r.statut === _chresFilter; }) : _chCache.reserves;
  if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-3);padding:1.5rem">Aucune réserve</td></tr>'; return; }
  var h = '';
  filtered.forEach(function(r) {
    h += '<tr><td><strong>R' + r.numero + '</strong></td><td>' + _cgEscape(r.titre||'') + '</td>' +
      '<td>' + _cgEscape(r.zone||'—') + '</td><td>' + _cgEscape(r.lot_nom||'—') + '</td>' +
      '<td>' + _cgEscape(r.entreprise||'—') + '</td><td>' + _chBadge(r.priorite) + '</td>' +
      '<td>' + _chBadge(r.statut) + '</td><td>' + _chDate(r.date_delai) + '</td>' +
      '<td><button class="btn btn-sm" onclick="editChReserve(\'' + r.id + '\')">Modifier</button></td></tr>';
  });
  tbody.innerHTML = h;
  makeTableSortable(document.getElementById('chres-reserves-table'));
}

function saveChReserve() {
  var id = document.getElementById('chres-edit-id').value;
  var cid = _chGetCurrentId('chres-chantier-filter');
  var body = {
    chantier_id: cid,
    titre: document.getElementById('chres-titre').value,
    zone: document.getElementById('chres-zone').value,
    lot_id: document.getElementById('chres-lot-id').value || null,
    entreprise: document.getElementById('chres-entreprise').value,
    priorite: document.getElementById('chres-priorite').value,
    statut: document.getElementById('chres-statut').value,
    date_constat: document.getElementById('chres-date-constat').value || null,
    date_delai: document.getElementById('chres-date-delai').value || null,
    plan_ref: document.getElementById('chres-plan-ref').value,
    description: document.getElementById('chres-description').value
  };
  if (!body.titre) { showToast('Le titre est requis', 'warning'); return; }
  var url = id ? ('api/chantier_reserves.php?action=reserves&id=' + id) : 'api/chantier_reserves.php?action=reserves';
  apiFetch(url, { method: id ? 'PUT' : 'POST', body: body }).then(function() {
    showToast('Réserve enregistrée', 'success');
    closeModal('modal-ch-reserve');
    renderChantierReservesPage();
  }).catch(function(e) { showToast('Erreur: ' + e.message, 'error'); });
}

function editChReserve(id) {
  var r = null; _chCache.reserves.forEach(function(x) { if (x.id === id) r = x; });
  if (!r) return;
  document.getElementById('chres-edit-id').value = r.id;
  document.getElementById('chres-titre').value = r.titre || '';
  document.getElementById('chres-zone').value = r.zone || '';
  document.getElementById('chres-lot-id').value = r.lot_id || '';
  document.getElementById('chres-entreprise').value = r.entreprise || '';
  document.getElementById('chres-priorite').value = r.priorite || 'Normale';
  document.getElementById('chres-statut').value = r.statut || 'Ouverte';
  document.getElementById('chres-date-constat').value = (r.date_constat || '').substring(0, 10);
  document.getElementById('chres-date-delai').value = (r.date_delai || '').substring(0, 10);
  document.getElementById('chres-plan-ref').value = r.plan_ref || '';
  document.getElementById('chres-description').value = r.description || '';
  document.getElementById('modal-chres-title').textContent = 'Réserve R' + r.numero;
  openModal('modal-ch-reserve');
}

// ── RFI ──
function _renderRfiTable() {
  var tbody = document.getElementById('chres-rfi-tbody');
  if (!_chCache.rfi.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-3);padding:1.5rem">Aucune RFI</td></tr>'; return; }
  var h = '';
  _chCache.rfi.forEach(function(r) {
    h += '<tr><td><strong>RFI-' + r.numero + '</strong></td><td>' + _cgEscape(r.objet||'') + '</td>' +
      '<td>' + _cgEscape(r.emetteur||'—') + '</td><td>' + _cgEscape(r.destinataire||'—') + '</td>' +
      '<td>' + _chBadge(r.priorite) + '</td><td>' + _chBadge(r.statut) + '</td>' +
      '<td>' + _chDate(r.date_reponse_attendue) + '</td>' +
      '<td><button class="btn btn-sm" onclick="editChRfi(\'' + r.id + '\')">Ouvrir</button></td></tr>';
  });
  tbody.innerHTML = h;
  makeTableSortable(document.getElementById('chres-rfi-table'));
}

function saveChRfi() {
  var id = document.getElementById('chrfi-edit-id').value;
  var cid = _chGetCurrentId('chres-chantier-filter');
  var body = {
    chantier_id: cid,
    objet: document.getElementById('chrfi-objet').value,
    emetteur: document.getElementById('chrfi-emetteur').value,
    destinataire: document.getElementById('chrfi-destinataire').value,
    priorite: document.getElementById('chrfi-priorite').value,
    statut: document.getElementById('chrfi-statut').value,
    date_emission: document.getElementById('chrfi-date-emission').value || null,
    date_reponse_attendue: document.getElementById('chrfi-date-reponse').value || null,
    description: document.getElementById('chrfi-description').value,
    documents_ref: document.getElementById('chrfi-docs').value,
    reponse: document.getElementById('chrfi-reponse').value
  };
  if (!body.objet) { showToast('L\'objet est requis', 'warning'); return; }
  var url = id ? ('api/chantier_reserves.php?action=rfi&id=' + id) : 'api/chantier_reserves.php?action=rfi';
  apiFetch(url, { method: id ? 'PUT' : 'POST', body: body }).then(function() {
    showToast('RFI enregistrée', 'success');
    closeModal('modal-ch-rfi');
    renderChantierReservesPage();
  }).catch(function(e) { showToast('Erreur: ' + e.message, 'error'); });
}

function editChRfi(id) {
  var r = null; _chCache.rfi.forEach(function(x) { if (x.id === id) r = x; });
  if (!r) return;
  document.getElementById('chrfi-edit-id').value = r.id;
  document.getElementById('chrfi-objet').value = r.objet || '';
  document.getElementById('chrfi-emetteur').value = r.emetteur || '';
  document.getElementById('chrfi-destinataire').value = r.destinataire || '';
  document.getElementById('chrfi-priorite').value = r.priorite || 'Normale';
  document.getElementById('chrfi-statut').value = r.statut || 'Ouverte';
  document.getElementById('chrfi-date-emission').value = (r.date_emission || '').substring(0, 10);
  document.getElementById('chrfi-date-reponse').value = (r.date_reponse_attendue || '').substring(0, 10);
  document.getElementById('chrfi-description').value = r.description || '';
  document.getElementById('chrfi-docs').value = r.documents_ref || '';
  document.getElementById('chrfi-reponse').value = r.reponse || '';
  document.getElementById('modal-chrfi-title').textContent = 'RFI-' + r.numero;
  openModal('modal-ch-rfi');
}

// ══════════════════════════════════════
//  7. VISAS
// ══════════════════════════════════════

var _chvFilter = '';

function renderChantierVisasPage() {
  _chLoadChantiers().then(function() {
    var cid = _chGetCurrentId('chv-chantier-filter');
    if (!cid) { document.getElementById('chv-tbody').innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-3);padding:1.5rem">Sélectionnez un chantier</td></tr>'; return; }
    apiFetch('api/chantier.php?action=lots&chantier_id=' + cid).then(function(r) { _chCache.lots = (r && r.data) ? r.data : []; _chPopulateLotSelects(); });
    apiFetch('api/chantier_reserves.php?action=visas&chantier_id=' + cid).then(function(r) {
      _chCache.visas = (r && r.data) ? r.data : [];
      _renderVisasTable();
    });
  });
}

function chvFilterVisas(f, btn) {
  _chvFilter = f;
  document.querySelectorAll('.chv-filter').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  _renderVisasTable();
}

function _renderVisasTable() {
  var tbody = document.getElementById('chv-tbody');
  var filtered = _chvFilter ? _chCache.visas.filter(function(v) { return v.statut === _chvFilter; }) : _chCache.visas;
  if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-3);padding:1.5rem">Aucun visa</td></tr>'; return; }
  var h = '';
  filtered.forEach(function(v) {
    h += '<tr><td><strong>V' + v.numero + '</strong></td><td>' + _cgEscape(v.document_titre||'') + '</td>' +
      '<td>' + _cgEscape(v.document_ref||'—') + '</td><td>' + _cgEscape(v.lot_nom||'—') + '</td>' +
      '<td>' + _cgEscape(v.emetteur||'—') + '</td><td>' + _chBadge(v.statut) + '</td>' +
      '<td>' + _chDate(v.date_reception) + '</td><td>' + _chDate(v.date_visa) + '</td>' +
      '<td><button class="btn btn-sm" onclick="editChVisa(\'' + v.id + '\')">Modifier</button></td></tr>';
  });
  tbody.innerHTML = h;
  makeTableSortable(document.getElementById('chv-table'));
}

function saveChVisa() {
  var id = document.getElementById('chv-edit-id').value;
  var cid = _chGetCurrentId('chv-chantier-filter');
  // Collect circuit
  var circRows = document.querySelectorAll('#chv-circuit-rows .chv-circ-row');
  var circuit = [];
  circRows.forEach(function(row) {
    var inputs = row.querySelectorAll('input,select');
    if (inputs[0] && inputs[0].value) {
      circuit.push({ role: inputs[0].value, nom: inputs[1].value, statut: inputs[2] ? inputs[2].value : 'En attente', commentaire: inputs[3] ? inputs[3].value : '' });
    }
  });
  var body = {
    chantier_id: cid,
    document_titre: document.getElementById('chv-doc-titre').value,
    document_ref: document.getElementById('chv-doc-ref').value,
    lot_id: document.getElementById('chv-lot-id').value || null,
    emetteur: document.getElementById('chv-emetteur').value,
    statut: document.getElementById('chv-statut').value,
    date_reception: document.getElementById('chv-date-reception').value || null,
    date_visa: document.getElementById('chv-date-visa').value || null,
    document_url: document.getElementById('chv-doc-url').value,
    commentaire: document.getElementById('chv-commentaire').value,
    circuit_visa: circuit
  };
  if (!body.document_titre) { showToast('Le titre est requis', 'warning'); return; }
  var url = id ? ('api/chantier_reserves.php?action=visas&id=' + id) : 'api/chantier_reserves.php?action=visas';
  apiFetch(url, { method: id ? 'PUT' : 'POST', body: body }).then(function() {
    showToast('Visa enregistré', 'success');
    closeModal('modal-ch-visa');
    renderChantierVisasPage();
  }).catch(function(e) { showToast('Erreur: ' + e.message, 'error'); });
}

function editChVisa(id) {
  var v = null; _chCache.visas.forEach(function(x) { if (x.id === id) v = x; });
  if (!v) return;
  document.getElementById('chv-edit-id').value = v.id;
  document.getElementById('chv-doc-titre').value = v.document_titre || '';
  document.getElementById('chv-doc-ref').value = v.document_ref || '';
  document.getElementById('chv-lot-id').value = v.lot_id || '';
  document.getElementById('chv-emetteur').value = v.emetteur || '';
  document.getElementById('chv-statut').value = v.statut || 'En attente';
  document.getElementById('chv-date-reception').value = (v.date_reception || '').substring(0, 10);
  document.getElementById('chv-date-visa').value = (v.date_visa || '').substring(0, 10);
  document.getElementById('chv-doc-url').value = v.document_url || '';
  document.getElementById('chv-commentaire').value = v.commentaire || '';
  // Circuit
  var cont = document.getElementById('chv-circuit-rows');
  cont.innerHTML = '';
  (v.circuit_visa || []).forEach(function(c) { addChvCircuitRow(c.role, c.nom, c.statut, c.commentaire); });
  document.getElementById('modal-chv-title').textContent = 'Visa V' + v.numero;
  openModal('modal-ch-visa');
}

function addChvCircuitRow(role, nom, statut, comm) {
  var cont = document.getElementById('chv-circuit-rows');
  var row = document.createElement('div');
  row.className = 'chv-circ-row';
  row.style.cssText = 'display:flex;gap:0.4rem;margin-bottom:0.4rem;align-items:center;flex-wrap:wrap';
  row.innerHTML = '<input type="text" class="form-input" placeholder="Rôle (Architecte, BET...)" value="' + _cgEscape(role||'') + '" style="flex:1;min-width:120px">' +
    '<input type="text" class="form-input" placeholder="Nom" value="' + _cgEscape(nom||'') + '" style="flex:1;min-width:120px">' +
    '<select class="form-input" style="flex:1;min-width:100px"><option' + ((statut||'En attente')==='En attente'?' selected':'') + '>En attente</option><option' + (statut==='Approuvé'?' selected':'') + '>Approuvé</option><option' + (statut==='Avec observations'?' selected':'') + '>Avec observations</option><option' + (statut==='Refusé'?' selected':'') + '>Refusé</option></select>' +
    '<input type="text" class="form-input" placeholder="Commentaire" value="' + _cgEscape(comm||'') + '" style="flex:2;min-width:150px">' +
    '<button class="btn btn-sm" style="color:var(--red)" onclick="this.parentElement.remove()">✕</button>';
  cont.appendChild(row);
}

// ══════════════════════════════════════
//  8. SÉCURITÉ
// ══════════════════════════════════════

var _chsTab = 'incidents', _chsIncFilter = '';

function renderChantierSecuritePage() {
  _chLoadChantiers().then(function() {
    var cid = _chGetCurrentId('chs-chantier-filter');
    if (!cid) { document.getElementById('chs-incidents-tbody').innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-3);padding:1.5rem">Sélectionnez un chantier</td></tr>'; return; }
    apiFetch('api/chantier_securite.php?action=incidents&chantier_id=' + cid).then(function(r) {
      _chCache.incidents = (r && r.data) ? r.data : [];
      _renderIncidentsTable();
    });
    apiFetch('api/chantier_securite.php?action=inspections&chantier_id=' + cid).then(function(r) {
      _chCache.inspections = (r && r.data) ? r.data : [];
      _renderInspectionsTable();
    });
    apiFetch('api/chantier_securite.php?action=stats&chantier_id=' + cid).then(function(r) {
      _renderSecuriteStats((r && r.data) ? r.data : {});
    });
  });
}

function chsSwitchTab(tab, btn) {
  _chsTab = tab;
  document.querySelectorAll('.chs-tab').forEach(function(t) { t.classList.remove('active'); t.style.color = 'var(--text-3)'; t.style.borderBottom = '2px solid transparent'; });
  if (btn) { btn.classList.add('active'); btn.style.color = 'var(--text-2)'; btn.style.borderBottom = '2px solid var(--accent)'; }
  document.getElementById('chs-panel-incidents').style.display = tab === 'incidents' ? '' : 'none';
  document.getElementById('chs-panel-inspections').style.display = tab === 'inspections' ? '' : 'none';
  document.getElementById('chs-panel-stats').style.display = tab === 'stats' ? '' : 'none';
}

function chsFilterIncidents(f, btn) {
  _chsIncFilter = f;
  document.querySelectorAll('.chs-inc-filter').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  _renderIncidentsTable();
}

function _renderIncidentsTable() {
  var tbody = document.getElementById('chs-incidents-tbody');
  var filtered = _chsIncFilter ? _chCache.incidents.filter(function(i) { return i.statut === _chsIncFilter; }) : _chCache.incidents;
  if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-3);padding:1.5rem">Aucun incident</td></tr>'; return; }
  var h = '';
  filtered.forEach(function(i) {
    h += '<tr><td>' + _chDate(i.date_incident) + '</td><td>' + _cgEscape(i.type||'') + '</td>' +
      '<td>' + _chBadge(i.gravite) + '</td><td>' + _cgEscape(i.titre||'') + '</td>' +
      '<td>' + _cgEscape(i.zone||'—') + '</td><td>' + _cgEscape(i.entreprise||'—') + '</td>' +
      '<td>' + _chBadge(i.statut) + '</td>' +
      '<td><button class="btn btn-sm" onclick="editChIncident(\'' + i.id + '\')">Ouvrir</button></td></tr>';
  });
  tbody.innerHTML = h;
  makeTableSortable(document.getElementById('chs-incidents-table'));
}

function saveChIncident() {
  var id = document.getElementById('chinc-edit-id').value;
  var cid = _chGetCurrentId('chs-chantier-filter');
  var body = {
    chantier_id: cid,
    titre: document.getElementById('chinc-titre').value,
    type: document.getElementById('chinc-type').value,
    gravite: document.getElementById('chinc-gravite').value,
    zone: document.getElementById('chinc-zone').value,
    entreprise: document.getElementById('chinc-entreprise').value,
    date_incident: document.getElementById('chinc-date').value,
    statut: document.getElementById('chinc-statut').value,
    description: document.getElementById('chinc-description').value,
    personnes_impliquees: document.getElementById('chinc-personnes').value,
    mesures_immediates: document.getElementById('chinc-mesures-imm').value,
    mesures_correctives: document.getElementById('chinc-mesures-corr').value
  };
  if (!body.titre) { showToast('Le titre est requis', 'warning'); return; }
  var url = id ? ('api/chantier_securite.php?action=incidents&id=' + id) : 'api/chantier_securite.php?action=incidents';
  apiFetch(url, { method: id ? 'PUT' : 'POST', body: body }).then(function() {
    showToast('Incident enregistré', 'success');
    closeModal('modal-ch-incident');
    renderChantierSecuritePage();
  }).catch(function(e) { showToast('Erreur: ' + e.message, 'error'); });
}

function editChIncident(id) {
  var i = null; _chCache.incidents.forEach(function(x) { if (x.id === id) i = x; });
  if (!i) return;
  document.getElementById('chinc-edit-id').value = i.id;
  document.getElementById('chinc-titre').value = i.titre || '';
  document.getElementById('chinc-type').value = i.type || 'Incident';
  document.getElementById('chinc-gravite').value = i.gravite || 'Mineure';
  document.getElementById('chinc-zone').value = i.zone || '';
  document.getElementById('chinc-entreprise').value = i.entreprise || '';
  document.getElementById('chinc-date').value = (i.date_incident || '').replace(' ', 'T').substring(0, 16);
  document.getElementById('chinc-statut').value = i.statut || 'Ouvert';
  document.getElementById('chinc-description').value = i.description || '';
  document.getElementById('chinc-personnes').value = i.personnes_impliquees || '';
  document.getElementById('chinc-mesures-imm').value = i.mesures_immediates || '';
  document.getElementById('chinc-mesures-corr').value = i.mesures_correctives || '';
  document.getElementById('modal-chinc-title').textContent = 'Incident — ' + _cgEscape(i.titre);
  openModal('modal-ch-incident');
}

// ── Inspections ──
function _renderInspectionsTable() {
  var tbody = document.getElementById('chs-inspections-tbody');
  if (!_chCache.inspections.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-3);padding:1.5rem">Aucune inspection</td></tr>'; return; }
  var h = '';
  _chCache.inspections.forEach(function(i) {
    var scoreColor = (i.score >= 80) ? 'var(--green)' : (i.score >= 50 ? 'var(--orange)' : 'var(--red)');
    h += '<tr><td>' + _chDate(i.date_inspection) + '</td><td>' + _cgEscape(i.titre||'') + '</td>' +
      '<td>' + _cgEscape(i.inspecteur||'—') + '</td><td>' + _cgEscape(i.zone||'—') + '</td>' +
      '<td style="font-weight:600;color:' + scoreColor + '">' + (i.score !== null ? i.score + '%' : '—') + '</td>' +
      '<td>' + _chBadge(i.statut) + '</td>' +
      '<td><button class="btn btn-sm" onclick="editChInspection(\'' + i.id + '\')">Ouvrir</button></td></tr>';
  });
  tbody.innerHTML = h;
  makeTableSortable(document.getElementById('chs-inspections-table'));
}

function saveChInspection() {
  var id = document.getElementById('chinsp-edit-id').value;
  var cid = _chGetCurrentId('chs-chantier-filter');
  // Collect checklist
  var checkRows = document.querySelectorAll('#chinsp-checklist-rows .chinsp-check-row');
  var checklist = [];
  checkRows.forEach(function(row) {
    var inputs = row.querySelectorAll('input');
    if (inputs[0] && inputs[0].value) {
      checklist.push({ item: inputs[0].value, conforme: inputs[1].checked ? 1 : 0, commentaire: inputs[2] ? inputs[2].value : '' });
    }
  });
  var body = {
    chantier_id: cid,
    titre: document.getElementById('chinsp-titre').value,
    date_inspection: document.getElementById('chinsp-date').value,
    inspecteur: document.getElementById('chinsp-inspecteur').value,
    zone: document.getElementById('chinsp-zone').value,
    observations: document.getElementById('chinsp-observations').value,
    checklist: checklist
  };
  if (!body.date_inspection) { showToast('La date est requise', 'warning'); return; }
  var url = id ? ('api/chantier_securite.php?action=inspections&id=' + id) : 'api/chantier_securite.php?action=inspections';
  apiFetch(url, { method: id ? 'PUT' : 'POST', body: body }).then(function(r) {
    var score = (r && r.data && r.data.score !== undefined) ? r.data.score : null;
    showToast('Inspection enregistrée' + (score !== null ? ' — Score: ' + score + '%' : ''), 'success');
    closeModal('modal-ch-inspection');
    renderChantierSecuritePage();
  }).catch(function(e) { showToast('Erreur: ' + e.message, 'error'); });
}

function editChInspection(id) {
  var i = null; _chCache.inspections.forEach(function(x) { if (x.id === id) i = x; });
  if (!i) return;
  document.getElementById('chinsp-edit-id').value = i.id;
  document.getElementById('chinsp-titre').value = i.titre || '';
  document.getElementById('chinsp-date').value = (i.date_inspection || '').substring(0, 10);
  document.getElementById('chinsp-inspecteur').value = i.inspecteur || '';
  document.getElementById('chinsp-zone').value = i.zone || '';
  document.getElementById('chinsp-observations').value = i.observations || '';
  var cont = document.getElementById('chinsp-checklist-rows');
  cont.innerHTML = '';
  (i.checklist || []).forEach(function(c) { addChinspCheckRow(c.item, c.conforme, c.commentaire); });
  document.getElementById('modal-chinsp-title').textContent = 'Inspection — ' + _chDate(i.date_inspection);
  openModal('modal-ch-inspection');
}

function addChinspCheckRow(item, conforme, comm) {
  var cont = document.getElementById('chinsp-checklist-rows');
  var row = document.createElement('div');
  row.className = 'chinsp-check-row';
  row.style.cssText = 'display:flex;gap:0.4rem;margin-bottom:0.4rem;align-items:center';
  row.innerHTML = '<input type="text" class="form-input" placeholder="Point à vérifier" value="' + _cgEscape(item||'') + '" style="flex:2">' +
    '<label style="display:flex;align-items:center;gap:0.3rem;font-size:0.8rem;color:var(--text-2);white-space:nowrap"><input type="checkbox"' + (conforme ? ' checked' : '') + '> Conforme</label>' +
    '<input type="text" class="form-input" placeholder="Commentaire" value="' + _cgEscape(comm||'') + '" style="flex:1">' +
    '<button class="btn btn-sm" style="color:var(--red)" onclick="this.parentElement.remove()">✕</button>';
  cont.appendChild(row);
}

// ── Stats sécurité ──
function _renderSecuriteStats(data) {
  var el = document.getElementById('chs-stats-content');
  var h = '';
  // Incidents par type
  h += '<div class="card"><div class="card-title">Incidents par type & gravité</div><div style="padding:0.5rem">';
  if ((data.incidents_par_type || []).length) {
    h += '<table style="width:100%;font-size:0.82rem"><thead><tr><th>Type</th><th>Gravité</th><th>Nombre</th></tr></thead><tbody>';
    data.incidents_par_type.forEach(function(r) { h += '<tr><td>' + _cgEscape(r.type) + '</td><td>' + _chBadge(r.gravite) + '</td><td>' + r.nb + '</td></tr>'; });
    h += '</tbody></table>';
  } else { h += '<div style="color:var(--text-3);text-align:center;padding:1rem">Aucun incident</div>'; }
  h += '</div></div>';
  // Tendance mensuelle
  h += '<div class="card"><div class="card-title">Tendance mensuelle</div><div style="padding:0.5rem">';
  if ((data.tendance_mensuelle || []).length) {
    var maxN = 1; data.tendance_mensuelle.forEach(function(r) { if (parseInt(r.nb) > maxN) maxN = parseInt(r.nb); });
    data.tendance_mensuelle.forEach(function(r) {
      var pct = (parseInt(r.nb) / maxN * 100);
      h += '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem"><span style="min-width:60px;font-size:0.75rem;color:var(--text-2)">' + r.mois + '</span>' +
        '<div style="flex:1;background:var(--bg-2);border-radius:3px;height:16px"><div style="width:' + pct + '%;background:var(--red);height:100%;border-radius:3px;opacity:0.7"></div></div>' +
        '<span style="min-width:30px;font-size:0.8rem;color:var(--text);text-align:right">' + r.nb + '</span></div>';
    });
  } else { h += '<div style="color:var(--text-3);text-align:center;padding:1rem">Pas de données</div>'; }
  h += '</div></div>';
  // Scores inspections
  h += '<div class="card"><div class="card-title">Scores inspections récentes</div><div style="padding:0.5rem">';
  if ((data.scores_inspections || []).length) {
    data.scores_inspections.forEach(function(r) {
      var color = (r.score >= 80) ? 'var(--green)' : (r.score >= 50 ? 'var(--orange)' : 'var(--red)');
      h += '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem"><span style="min-width:80px;font-size:0.75rem;color:var(--text-2)">' + _chDate(r.date_inspection) + '</span>' +
        '<div style="flex:1;background:var(--bg-2);border-radius:3px;height:16px"><div style="width:' + r.score + '%;background:' + color + ';height:100%;border-radius:3px;opacity:0.7"></div></div>' +
        '<span style="min-width:40px;font-size:0.8rem;font-weight:600;color:' + color + ';text-align:right">' + r.score + '%</span></div>';
    });
  } else { h += '<div style="color:var(--text-3);text-align:center;padding:1rem">Pas d\'inspection</div>'; }
  h += '</div></div>';
  // Summary card
  h += '<div class="card"><div class="card-title">Résumé</div><div style="padding:1rem;text-align:center">' +
    '<div style="font-size:2rem;font-weight:700;color:' + ((data.incidents_ouverts||0) > 0 ? 'var(--red)' : 'var(--green)') + '">' + (data.incidents_ouverts||0) + '</div>' +
    '<div style="color:var(--text-2);font-size:0.85rem">incidents ouverts</div></div></div>';
  el.innerHTML = h;
}

// ══════════════════════════════════════════════════════════
//  PORTAIL CLIENT — Gestion interne
// ══════════════════════════════════════════════════════════

var _portalAccounts = [];
var _portalDocs = [];
var _portalMsgRooms = [];
var _portalMsgCurrent = null;
var _portalMsgPoll = null;

// ── Comptes clients ──

function renderPortailAccounts() {
  apiFetch('api/client_portal_admin.php?action=list_accounts').then(function(r) {
    _portalAccounts = r.data || r || [];
    var tbody = document.getElementById('portail-accounts-tbody');
    if (!tbody) return;
    var actifs = _portalAccounts.filter(function(a){ return a.statut === 'actif'; }).length;
    var kpis = document.getElementById('portail-kpis');
    if (kpis) {
      kpis.innerHTML = '<div class="kpi-card"><div class="kpi-value">' + _portalAccounts.length + '</div><div class="kpi-label">Total comptes</div></div>' +
        '<div class="kpi-card"><div class="kpi-value" style="color:var(--green)">' + actifs + '</div><div class="kpi-label">Actifs</div></div>' +
        '<div class="kpi-card"><div class="kpi-value" style="color:var(--text-3)">' + (_portalAccounts.length - actifs) + '</div><div class="kpi-label">Inactifs</div></div>';
    }
    if (_portalAccounts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:2rem">Aucun compte client</td></tr>';
      return;
    }
    tbody.innerHTML = _portalAccounts.map(function(a) {
      var badge = a.statut === 'actif' ? 'badge-green' : 'badge-gray';
      return '<tr>' +
        '<td><strong>' + esc(a.nom) + '</strong><div style="font-size:0.72rem;color:var(--text-3)">' + esc(a.client_display || '') + '</div></td>' +
        '<td><span style="font-family:var(--mono);font-size:0.8rem">' + esc(a.email) + '</span></td>' +
        '<td><span class="badge ' + badge + '">' + esc(a.statut) + '</span></td>' +
        '<td>' + (a.last_login ? fmtDate(a.last_login) : '<span style="color:var(--text-3)">Jamais</span>') + '</td>' +
        '<td>' + fmtDate(a.cree_at) + '</td>' +
        '<td><button class="btn-icon" onclick="editPortailAccount(\'' + a.id + '\')" title="Modifier">✏️</button>' +
        '<button class="btn-icon" onclick="deletePortailAccount(\'' + a.id + '\',\'' + esc(a.nom).replace(/'/g, "\\'") + '\')" title="Supprimer" style="color:var(--red)">🗑️</button></td></tr>';
    }).join('');
  }).catch(function(e) { showToast('Erreur chargement comptes: ' + e.message, 'error'); });
}

function paGenPass() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  var pass = '';
  for (var i = 0; i < 10; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
  document.getElementById('pa-password').value = pass;
}

function openPortailAccountModal(accountId) {
  var isEdit = !!accountId;
  document.getElementById('pa-modal-title').textContent = isEdit ? 'Modifier le compte' : 'Nouveau compte';
  document.getElementById('pa-save-btn').textContent = isEdit ? 'Enregistrer' : 'Créer le compte';
  document.getElementById('pa-id').value = accountId || '';
  document.getElementById('pa-success').style.display = 'none';
  // Populate client dropdown
  var sel = document.getElementById('pa-client');
  var clients = getClients();
  sel.innerHTML = '<option value="">— Sélectionner —</option>' + clients.map(function(c) {
    return '<option value="' + c.id + '">' + esc(c.displayNom || c.display_nom || c.nom || '') + '</option>';
  }).join('');
  if (isEdit) {
    var a = _portalAccounts.find(function(x){ return x.id === accountId; });
    if (a) {
      sel.value = a.client_id || '';
      document.getElementById('pa-nom').value = a.nom || '';
      document.getElementById('pa-email').value = a.email || '';
      document.getElementById('pa-password').value = '';
      document.getElementById('pa-statut').value = a.statut || 'actif';
    }
  } else {
    document.getElementById('pa-nom').value = '';
    document.getElementById('pa-email').value = '';
    document.getElementById('pa-password').value = '';
    document.getElementById('pa-statut').value = 'actif';
  }
  openModal('modal-portail-account');
}

function savePortailAccount() {
  var id = document.getElementById('pa-id').value;
  var isEdit = !!id;
  var clientId = document.getElementById('pa-client').value;
  var nom = document.getElementById('pa-nom').value.trim();
  var email = document.getElementById('pa-email').value.trim();
  var password = document.getElementById('pa-password').value.trim();
  var statut = document.getElementById('pa-statut').value;
  if (!clientId || !nom || !email) { showToast('Client, nom et email requis', 'error'); return; }
  if (!isEdit && password.length < 6) { showToast('Mot de passe min. 6 caractères', 'error'); return; }
  var btn = document.getElementById('pa-save-btn');
  btn.disabled = true; btn.textContent = isEdit ? 'Enregistrement...' : 'Création...';
  if (isEdit) {
    var body = { nom: nom, email: email, statut: statut };
    if (password.length >= 6) body.password = password;
    apiFetch('api/client_portal_admin.php?action=update_account&id=' + encodeURIComponent(id), { method: 'PUT', body: body })
      .then(function() { showToast('Compte mis à jour', 'success'); closeModal('modal-portail-account'); renderPortailAccounts(); })
      .catch(function(e) { showToast(e.message, 'error'); })
      .finally(function() { btn.disabled = false; btn.textContent = 'Enregistrer'; });
  } else {
    apiFetch('api/client_portal_admin.php?action=create_account', { method: 'POST', body: { client_id: clientId, nom: nom, email: email, password: password } })
      .then(function() {
        var portalUrl = window.location.origin + window.location.pathname.replace(/[^/]+$/, '') + 'portail-client.html';
        var succEl = document.getElementById('pa-success');
        succEl.innerHTML = '<div style="font-weight:600;color:var(--green);margin-bottom:0.5rem">✓ Compte créé</div>' +
          '<div style="background:var(--bg-2);border-radius:5px;padding:0.6rem 0.8rem;font-size:0.82rem;font-family:var(--mono)">' +
          '<div><strong>URL :</strong> ' + esc(portalUrl) + '</div>' +
          '<div><strong>Email :</strong> ' + esc(email) + '</div>' +
          '<div><strong>Mot de passe :</strong> ' + esc(password) + '</div></div>' +
          '<button onclick="navigator.clipboard.writeText(\'URL: ' + esc(portalUrl) + '\\nEmail: ' + esc(email) + '\\nMot de passe: ' + esc(password) + '\').then(function(){showToast(\'Copié !\',\'success\')})" ' +
          'style="margin-top:0.5rem;background:var(--bg-3);color:var(--text);border:1px solid var(--border);border-radius:5px;padding:0.35rem 0.8rem;font-size:0.75rem;cursor:pointer;font-family:var(--font)">📋 Copier les identifiants</button>';
        succEl.style.display = 'block';
        btn.style.display = 'none';
        renderPortailAccounts();
      })
      .catch(function(e) { showToast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Créer le compte'; });
  }
}

function editPortailAccount(id) { openPortailAccountModal(id); }

function deletePortailAccount(id, nom) {
  if (!confirm('Supprimer le compte de ' + nom + ' ? Cette action est irréversible.')) return;
  apiFetch('api/client_portal_admin.php?action=delete_account&id=' + encodeURIComponent(id), { method: 'DELETE' })
    .then(function() { showToast('Compte supprimé', 'success'); renderPortailAccounts(); })
    .catch(function(e) { showToast(e.message, 'error'); });
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
  var newBtn = document.getElementById('portail-new-btn');
  if (newBtn) newBtn.addEventListener('click', function() { openPortailAccountModal(null); });
  var saveBtn = document.getElementById('pa-save-btn');
  if (saveBtn) saveBtn.addEventListener('click', savePortailAccount);
  var pubBtn = document.getElementById('portail-pub-btn');
  if (pubBtn) pubBtn.addEventListener('click', function() { openPortailDocModal(); });
  var pdocSubmit = document.getElementById('pdoc-submit');
  if (pdocSubmit) pdocSubmit.addEventListener('click', submitPortailDoc);
  var msgSend = document.getElementById('portail-msg-send');
  if (msgSend) msgSend.addEventListener('click', sendPortailMsg);
  var msgInput = document.getElementById('portail-msg-input');
  if (msgInput) msgInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendPortailMsg(); }
  });
});

// ── Documents partagés ──

var _pdocSource = 'upload';

function pdocSetSource(src) {
  _pdocSource = src;
  ['upload', 'nas', 'url'].forEach(function(s) {
    var el = document.getElementById('pdoc-source-' + s);
    if (el) el.style.display = s === src ? '' : 'none';
    var btn = document.getElementById('pdoc-src-' + s);
    if (btn) btn.style.borderColor = s === src ? 'var(--accent)' : 'var(--border)';
    if (btn) btn.style.color = s === src ? 'var(--accent)' : 'var(--text-2)';
  });
}

function openPortailDocModal() {
  // Populate client dropdown
  var clientSel = document.getElementById('pdoc-client');
  var clients = getClients();
  clientSel.innerHTML = '<option value="">— Sélectionner —</option>' + clients.map(function(c) {
    return '<option value="' + c.id + '">' + esc(c.displayNom || c.display_nom || c.nom || '') + '</option>';
  }).join('');
  clientSel.onchange = function() { pdocUpdateProjets(); };
  document.getElementById('pdoc-projet').innerHTML = '<option value="">— Sélectionner le client d\'abord —</option>';
  document.getElementById('pdoc-titre').value = '';
  document.getElementById('pdoc-description').value = '';
  document.getElementById('pdoc-phase').value = '';
  document.getElementById('pdoc-categorie').value = 'livrable';
  document.getElementById('pdoc-file').value = '';
  document.getElementById('pdoc-nas-path').value = '';
  document.getElementById('pdoc-url').value = '';
  document.getElementById('pdoc-request-validation').checked = false;
  pdocSetSource('upload');
  openModal('modal-portail-doc');
}

function pdocUpdateProjets() {
  var clientId = document.getElementById('pdoc-client').value;
  var projetSel = document.getElementById('pdoc-projet');
  if (!clientId) { projetSel.innerHTML = '<option value="">— Sélectionner le client d\'abord —</option>'; return; }
  var client = getClients().find(function(c){ return c.id === clientId; });
  var code = client ? (client.code || '') : '';
  var projets = getProjets().filter(function(p) { return p.client_code === code || p.clientId === clientId || p.client_id === clientId; });
  projetSel.innerHTML = '<option value="">— Sélectionner —</option>' + projets.map(function(p) {
    return '<option value="' + p.id + '">' + esc(p.code || '') + ' — ' + esc(p.nom || '') + '</option>';
  }).join('');
}

function submitPortailDoc() {
  var clientId = document.getElementById('pdoc-client').value;
  var projetId = document.getElementById('pdoc-projet').value;
  var titre = document.getElementById('pdoc-titre').value.trim();
  if (!clientId || !projetId || !titre) { showToast('Client, projet et titre requis', 'error'); return; }

  var btn = document.getElementById('pdoc-submit');
  btn.disabled = true; btn.textContent = 'Publication...';

  if (_pdocSource === 'upload') {
    var file = document.getElementById('pdoc-file').files[0];
    if (!file) { showToast('Sélectionnez un fichier', 'error'); btn.disabled = false; btn.textContent = 'Publier'; return; }
    var fd = new FormData();
    fd.append('file', file);
    fd.append('projet_id', projetId);
    fd.append('client_id', clientId);
    fd.append('titre', titre);
    fd.append('categorie', document.getElementById('pdoc-categorie').value);
    fd.append('phase', document.getElementById('pdoc-phase').value);
    fd.append('description', document.getElementById('pdoc-description').value);
    var token = sessionStorage.getItem('cortoba_token');
    fetch('api/client_portal_admin.php?action=publish_document', {
      method: 'POST',
      headers: token ? { 'Authorization': 'Bearer ' + token } : {},
      body: fd
    }).then(function(r) { return r.json(); }).then(function(r) {
      if (r.error) throw new Error(r.error);
      afterDocPublish(r, clientId, projetId);
    }).catch(function(e) { showToast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Publier'; });
  } else if (_pdocSource === 'nas' || _pdocSource === 'url') {
    var sourceUrl = _pdocSource === 'nas' ? document.getElementById('pdoc-nas-path').value.trim() : document.getElementById('pdoc-url').value.trim();
    if (!sourceUrl) { showToast('Entrez un chemin ou URL', 'error'); btn.disabled = false; btn.textContent = 'Publier'; return; }
    apiFetch('api/client_portal_admin.php?action=publish_document_url', {
      method: 'POST',
      body: {
        projet_id: projetId, client_id: clientId, titre: titre,
        categorie: document.getElementById('pdoc-categorie').value,
        phase: document.getElementById('pdoc-phase').value,
        description: document.getElementById('pdoc-description').value,
        source_url: sourceUrl, source_type: _pdocSource
      }
    }).then(function(r) {
      afterDocPublish(r, clientId, projetId);
    }).catch(function(e) { showToast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Publier'; });
  }
}

function afterDocPublish(r, clientId, projetId) {
  var requestVal = document.getElementById('pdoc-request-validation').checked;
  if (requestVal && r.data && r.data.id) {
    apiFetch('api/client_portal_admin.php?action=request_validation', {
      method: 'POST',
      body: { document_id: r.data.id, projet_id: projetId, client_id: clientId, type: 'document' }
    }).catch(function() {});
  }
  showToast('Document publié au portail client', 'success');
  closeModal('modal-portail-doc');
  renderPortailDocs();
  var btn = document.getElementById('pdoc-submit');
  btn.disabled = false; btn.textContent = 'Publier';
}

function renderPortailDocs() {
  var clientFilter = (document.getElementById('portail-doc-client-filter') || {}).value || '';
  var catFilter = (document.getElementById('portail-doc-cat-filter') || {}).value || '';
  var url = 'api/client_portal_admin.php?action=client_documents';
  if (clientFilter) url += '&client_id=' + encodeURIComponent(clientFilter);
  apiFetch(url).then(function(r) {
    _portalDocs = r.data || r || [];
    // Populate client filter
    var clientSel = document.getElementById('portail-doc-client-filter');
    if (clientSel && clientSel.options.length <= 1) {
      var seen = {};
      _portalDocs.forEach(function(d) {
        if (d.client_id && !seen[d.client_id]) {
          seen[d.client_id] = true;
          var opt = document.createElement('option');
          opt.value = d.client_id;
          opt.textContent = d.client_display || d.client_id;
          clientSel.appendChild(opt);
        }
      });
    }
    var filtered = _portalDocs;
    if (catFilter) filtered = filtered.filter(function(d){ return d.categorie === catFilter; });
    var tbody = document.getElementById('portail-docs-tbody');
    if (!tbody) return;
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-3);padding:2rem">Aucun document</td></tr>';
      return;
    }
    tbody.innerHTML = filtered.map(function(d) {
      var statBadge = d.statut === 'Valide' ? 'badge-green' : d.statut === 'Refuse' ? 'badge-red' : d.statut === 'En attente validation' ? 'badge-orange' : 'badge-blue';
      return '<tr>' +
        '<td><strong>' + esc(d.titre) + '</strong><div style="font-size:0.7rem;color:var(--text-3)">' + esc(d.fichier_nom || '') + '</div></td>' +
        '<td>' + esc(d.client_display || '') + '</td>' +
        '<td><span style="font-family:var(--mono);font-size:0.78rem">' + esc(d.projet_code || '') + '</span></td>' +
        '<td><span class="badge">' + esc(d.categorie || '') + '</span></td>' +
        '<td>v' + (d.version || 1) + '</td>' +
        '<td><span class="badge ' + statBadge + '">' + esc(d.statut || '') + '</span></td>' +
        '<td>' + fmtDate(d.cree_at) + '</td>' +
        '<td><a href="' + esc(d.fichier_url || '#') + '" target="_blank" class="btn-icon" title="Télécharger">📥</a></td></tr>';
    }).join('');
  }).catch(function(e) { showToast('Erreur docs: ' + e.message, 'error'); });
}

// Filter listeners
document.addEventListener('DOMContentLoaded', function() {
  var cf = document.getElementById('portail-doc-client-filter');
  if (cf) cf.addEventListener('change', renderPortailDocs);
  var catf = document.getElementById('portail-doc-cat-filter');
  if (catf) catf.addEventListener('change', renderPortailDocs);
});

// ── Messages clients (chat) ──

function renderPortailMessages() {
  // Load all client-type chat rooms
  apiFetch('api/client_portal_admin.php?action=client_chat_rooms').then(function(r) {
    _portalMsgRooms = r.data || r || [];
    var container = document.getElementById('portail-msg-rooms');
    if (!container) return;
    if (_portalMsgRooms.length === 0) {
      container.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--text-3);font-size:0.82rem">Aucune discussion client</div>';
      return;
    }
    container.innerHTML = _portalMsgRooms.map(function(room) {
      var unread = room.unread_count || 0;
      var active = _portalMsgCurrent === room.id ? 'background:var(--bg-2);' : '';
      return '<div class="portail-msg-room" data-room="' + room.id + '" style="padding:0.7rem 1rem;cursor:pointer;border-bottom:1px solid var(--border);' + active + '" ' +
        'onclick="openPortailRoom(\'' + room.id + '\')">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<strong style="font-size:0.82rem">' + esc(room.name || 'Discussion') + '</strong>' +
        (unread > 0 ? '<span class="badge badge-accent" style="font-size:0.65rem;min-width:18px;text-align:center">' + unread + '</span>' : '') + '</div>' +
        '<div style="font-size:0.72rem;color:var(--text-3)">' + esc(room.projet_code || '') + ' — ' + esc(room.projet_nom || '') + '</div>' +
        (room.last_msg_at ? '<div style="font-size:0.68rem;color:var(--text-3);margin-top:0.2rem">' + fmtDate(room.last_msg_at) + '</div>' : '') +
        '</div>';
    }).join('');
    // Update badge
    var totalUnread = _portalMsgRooms.reduce(function(s, r){ return s + (r.unread_count || 0); }, 0);
    var badge = document.getElementById('portail-msg-badge');
    if (badge) { badge.textContent = totalUnread; badge.style.display = totalUnread > 0 ? '' : 'none'; }
  }).catch(function(e) { console.error('portail messages', e); });
}

function openPortailRoom(roomId) {
  _portalMsgCurrent = roomId;
  var room = _portalMsgRooms.find(function(r){ return r.id === roomId; });
  document.getElementById('portail-msg-header').textContent = room ? (room.name || 'Discussion') : 'Discussion';
  document.getElementById('portail-msg-composer').style.display = '';
  // Highlight active room
  document.querySelectorAll('.portail-msg-room').forEach(function(el) {
    el.style.background = el.dataset.room === roomId ? 'var(--bg-2)' : '';
  });
  loadPortailRoomMessages(roomId);
  // Start polling
  if (_portalMsgPoll) clearInterval(_portalMsgPoll);
  _portalMsgPoll = setInterval(function() { loadPortailRoomMessages(roomId); }, 5000);
}

function loadPortailRoomMessages(roomId) {
  apiFetch('api/client_portal_admin.php?action=client_chat_messages&room_id=' + encodeURIComponent(roomId)).then(function(r) {
    var msgs = r.data || r || [];
    var container = document.getElementById('portail-msg-messages');
    if (!container) return;
    if (msgs.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:var(--text-3);padding:2rem">Aucun message</div>';
      return;
    }
    var prevLen = container.children.length;
    container.innerHTML = msgs.map(function(m) {
      var isClient = (m.sender_id || '').indexOf('client_') === 0;
      var align = isClient ? 'flex-end' : 'flex-start';
      var bg = isClient ? 'var(--accent)' : 'var(--bg-2)';
      var color = isClient ? '#1a1a1a' : 'var(--text)';
      return '<div style="display:flex;justify-content:' + align + ';margin-bottom:0.5rem">' +
        '<div style="max-width:75%;background:' + bg + ';color:' + color + ';border-radius:8px;padding:0.5rem 0.75rem">' +
        '<div style="font-size:0.7rem;font-weight:600;margin-bottom:0.2rem">' + esc(m.sender_name || '') + '</div>' +
        '<div style="font-size:0.83rem;white-space:pre-wrap">' + esc(m.content || '') + '</div>' +
        '<div style="font-size:0.65rem;opacity:0.7;text-align:right;margin-top:0.2rem">' + fmtDate(m.cree_at) + '</div>' +
        '</div></div>';
    }).join('');
    if (msgs.length !== prevLen) container.scrollTop = container.scrollHeight;
  }).catch(function() {});
}

function sendPortailMsg() {
  if (!_portalMsgCurrent) return;
  var input = document.getElementById('portail-msg-input');
  var content = (input.value || '').trim();
  if (!content) return;
  input.value = '';
  apiFetch('api/client_portal_admin.php?action=client_chat_send', {
    method: 'POST',
    body: { room_id: _portalMsgCurrent, content: content }
  }).then(function() {
    loadPortailRoomMessages(_portalMsgCurrent);
  }).catch(function(e) { showToast(e.message, 'error'); });
}

// ══════════════════════════════════════════════════════════
//  CONFORMITÉ NAS — Comparaison projets / dossiers NAS
// ══════════════════════════════════════════════════════════

var _ncData = []; // résultats de la comparaison

function openNasConformite() {
  openModal('modal-nas-conformite');
  var statusEl = document.getElementById('nas-conformite-status');
  var summaryEl = document.getElementById('nas-conformite-summary');
  var filtersEl = document.getElementById('nas-conformite-filters');
  var tableEl = document.getElementById('nas-conformite-table');
  var applyBtn = document.getElementById('nc-apply-all-btn');
  statusEl.style.display = 'block';
  statusEl.innerHTML = '<div style="font-size:1.5rem;margin-bottom:0.8rem">⏳</div>Analyse en cours — interrogation du NAS via WebDAV…';
  summaryEl.style.display = 'none';
  filtersEl.style.display = 'none';
  tableEl.style.display = 'none';
  if (applyBtn) applyBtn.style.display = 'none';

  // Essayer d'abord via le serveur API, sinon fallback WebDAV direct depuis le navigateur
  apiFetch('api/nas-check.php')
    .then(function(r) {
      var nasFolders = r.data.nas_folders || {};
      var projets = r.data.projets || [];
      _ncData = buildConformiteData(projets, nasFolders);
      renderConformiteResults();
    })
    .catch(function(e) {
      // Fallback : WebDAV PROPFIND direct depuis le navigateur (réseau local)
      statusEl.innerHTML = '<div style="font-size:1.5rem;margin-bottom:0.8rem">⏳</div>Serveur distant indisponible — tentative WebDAV direct (réseau local)…';
      ncFallbackWebDAV(statusEl);
    });
}

// Fallback : ouvrir un popup HTTP sur le NAS pour contourner le mixed-content HTTPS->HTTP
function ncFallbackWebDAV(statusEl) {
  var cfg = getNasConfig();
  var ip = cfg.local || '192.168.1.165';
  var port = cfg.webdavPort || '5005';
  var user = cfg.user || 'CASNAS';
  var pass = cfg.pass || 'Cortoba2026';
  var rootPath = cfg.webdavPath || '/Public/CAS_PROJETS';
  if (rootPath.charAt(0) !== '/') rootPath = '/' + rootPath;

  // Ecouter le message de retour du popup bridge
  var messageHandler = function(evt) {
    if (!evt.data || evt.data.type !== 'nas-conformite-result') return;
    window.removeEventListener('message', messageHandler);

    if (evt.data.data && evt.data.data.success) {
      var nasFolders = evt.data.data.nas_folders || {};
      var projets = getProjets().map(function(p) {
        return { id: p.id, code: p.code || '', nom: p.nom || '', annee: p.annee || '', statut: p.statut || '' };
      });
      _ncData = buildConformiteData(projets, nasFolders);
      renderConformiteResults();
    } else {
      statusEl.innerHTML = '<div style="font-size:1.5rem;margin-bottom:0.8rem">❌</div>Impossible de contacter le NAS :<br><span style="color:#e07b72">' +
        (evt.data.data && evt.data.data.error || 'Erreur inconnue') +
        '</span><br><br><span style="font-size:0.78rem;color:var(--text-3)">Assurez-vous d\'être connecté au même réseau que le NAS QNAP.</span>';
    }
  };
  window.addEventListener('message', messageHandler);

  // Construire l'URL du bridge sur le NAS
  var hash = 'ip=' + encodeURIComponent(ip) +
    '&port=' + encodeURIComponent(port) +
    '&user=' + encodeURIComponent(user) +
    '&pass=' + encodeURIComponent(pass) +
    '&root=' + encodeURIComponent(rootPath);

  var bridgeUrl = 'http://' + ip + ':' + port + '/Public/nas-tools/nas-conformite-bridge.html#' + hash;

  statusEl.innerHTML = '<div style="font-size:1.5rem;margin-bottom:0.8rem">⏳</div>' +
    'Ouverture du scanner NAS (popup)…<br>' +
    '<span style="font-size:0.78rem;color:var(--text-3)">Si le popup est bloqué, autorisez-le dans votre navigateur.</span>';

  var popup = window.open(bridgeUrl, 'nas_conformite', 'width=500,height=400,left=200,top=200');
  if (!popup) {
    window.removeEventListener('message', messageHandler);
    statusEl.innerHTML = '<div style="font-size:1.5rem;margin-bottom:0.8rem">⚠️</div>' +
      'Popup bloqué par le navigateur.<br>' +
      '<span style="color:var(--text-3);font-size:0.82rem">Autorisez les popups pour ce site puis réessayez.</span>';
  }

  // Timeout de sécurité (30s)
  setTimeout(function() {
    window.removeEventListener('message', messageHandler);
    if (statusEl.innerHTML.indexOf('Ouverture') !== -1 || statusEl.innerHTML.indexOf('popup') !== -1) {
      statusEl.innerHTML = '<div style="font-size:1.5rem;margin-bottom:0.8rem">❌</div>' +
        'Délai dépassé — le NAS n\'a pas répondu dans les 30 secondes.<br>' +
        '<span style="font-size:0.78rem;color:var(--text-3)">Le fichier bridge n\'est peut-être pas encore déployé sur le NAS.</span><br><br>' +
        '<button class="btn btn-primary" onclick="ncDeployBridge()" style="font-size:0.82rem">Déployer le bridge sur le NAS</button>';
    }
  }, 30000);
}

// Déployer le fichier bridge sur le NAS via l'API serveur
function ncDeployBridge() {
  var statusEl = document.getElementById('nas-conformite-status');
  statusEl.innerHTML = '<div style="font-size:1.5rem;margin-bottom:0.8rem">⏳</div>Déploiement du bridge sur le NAS…';

  apiFetch('api/nas-upload-bridge.php', { method: 'POST', body: {} })
    .then(function(r) {
      if (r.data && r.data.uploaded) {
        statusEl.innerHTML = '<div style="font-size:1.5rem;margin-bottom:0.8rem">✅</div>' +
          'Bridge déployé avec succès sur le NAS !<br><br>' +
          '<button class="btn btn-primary" onclick="openNasConformite()" style="font-size:0.82rem">Relancer la vérification</button>';
      } else {
        statusEl.innerHTML = '<div style="font-size:1.5rem;margin-bottom:0.8rem">❌</div>' +
          'Échec du déploiement (HTTP ' + (r.data && r.data.http || '?') + ').<br>' +
          '<span style="font-size:0.78rem;color:var(--text-3)">' + (r.data && r.data.error || 'Vérifiez la config NAS') + '</span>';
      }
    })
    .catch(function(e) {
      statusEl.innerHTML = '<div style="font-size:1.5rem;margin-bottom:0.8rem">❌</div>' +
        'Erreur : ' + (e.message || 'impossible de déployer') + '<br>' +
        '<span style="font-size:0.78rem;color:var(--text-3)">Le serveur distant doit pouvoir accéder au NAS (port forwarding requis).</span>';
    });
}

// Nettoyer un nom pour comparaison (minuscule, sans accents, sans caractères spéciaux)
function ncNormalize(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Extraire le code projet d'un nom de dossier NAS (format: CODE_NomProjet ou CODE - NomProjet)
function ncExtractCode(folderName) {
  // Patterns courants : "01_26_ABC_Nom" ou "01_26_ABC - Nom" etc.
  var m = folderName.match(/^(\d{2}_\d{2}_[A-Z0-9]+)/i);
  if (m) return m[1].toUpperCase();
  // Essayer aussi avec tiret : "01_26_ABC-..."
  m = folderName.match(/^(\d{2}_\d{2}_\w+)/i);
  if (m) return m[1].toUpperCase();
  return '';
}

// Construire le nom de dossier attendu pour un projet (comme buildNasBridgeUrl)
function ncExpectedFolder(p) {
  var code = p.code || '';
  var client = p.client || p.nom || '';
  return (code + '_' + client).replace(/[<>:"\/\\|?*]/g, '_').replace(/\s+/g, ' ').trim();
}

function buildConformiteData(projets, nasFolders) {
  var results = [];
  var matchedNasFolders = {}; // année/folder => true

  // Pour chaque projet de la plateforme
  projets.forEach(function(p) {
    var annee = p.annee || '';
    var code = (p.code || '').toUpperCase();
    var expected = ncExpectedFolder(p);
    var yearFolders = nasFolders[annee] || [];

    // Chercher correspondance exacte
    var exactMatch = yearFolders.find(function(f) { return f === expected; });
    if (exactMatch) {
      results.push({ type: 'ok', annee: annee, projet: p, nasFolder: exactMatch, expected: expected });
      matchedNasFolders[annee + '/' + exactMatch] = true;
      return;
    }

    // Chercher par code projet
    var codeMatch = null;
    yearFolders.forEach(function(f) {
      if (matchedNasFolders[annee + '/' + f]) return;
      var fCode = ncExtractCode(f);
      if (fCode && fCode === code) {
        codeMatch = f;
      }
    });

    if (codeMatch) {
      // Même code mais nom différent
      results.push({ type: 'mismatch', annee: annee, projet: p, nasFolder: codeMatch, expected: expected });
      matchedNasFolders[annee + '/' + codeMatch] = true;
      return;
    }

    // Chercher par similarité de nom normalisé
    var normExpected = ncNormalize(expected);
    var fuzzyMatch = null;
    yearFolders.forEach(function(f) {
      if (matchedNasFolders[annee + '/' + f]) return;
      var normF = ncNormalize(f);
      if (normF === normExpected || (normExpected.length > 8 && normF.indexOf(normExpected) !== -1) || (normF.length > 8 && normExpected.indexOf(normF) !== -1)) {
        fuzzyMatch = f;
      }
    });

    if (fuzzyMatch) {
      results.push({ type: 'mismatch', annee: annee, projet: p, nasFolder: fuzzyMatch, expected: expected });
      matchedNasFolders[annee + '/' + fuzzyMatch] = true;
      return;
    }

    // Pas de correspondance → dossier absent sur le NAS
    results.push({ type: 'missing_nas', annee: annee, projet: p, nasFolder: null, expected: expected });
  });

  // Dossiers NAS sans projet correspondant sur la plateforme
  Object.keys(nasFolders).forEach(function(annee) {
    nasFolders[annee].forEach(function(folder) {
      if (matchedNasFolders[annee + '/' + folder]) return;
      // Ignorer les dossiers spéciaux (template, etc.)
      if (folder.indexOf('00-') === 0 || folder.indexOf('_template') !== -1 || folder.indexOf('Dossier Type') !== -1) return;
      results.push({ type: 'missing_plat', annee: annee, projet: null, nasFolder: folder, expected: '' });
    });
  });

  // Trier : anomalies d'abord, puis par année desc
  var typeOrder = { mismatch: 0, missing_nas: 1, missing_plat: 2, ok: 3 };
  results.sort(function(a, b) {
    var ta = typeOrder[a.type] !== undefined ? typeOrder[a.type] : 9;
    var tb = typeOrder[b.type] !== undefined ? typeOrder[b.type] : 9;
    if (ta !== tb) return ta - tb;
    if (a.annee !== b.annee) return b.annee.localeCompare(a.annee);
    return 0;
  });

  return results;
}

function renderConformiteResults() {
  var statusEl = document.getElementById('nas-conformite-status');
  var summaryEl = document.getElementById('nas-conformite-summary');
  var filtersEl = document.getElementById('nas-conformite-filters');
  var tableEl = document.getElementById('nas-conformite-table');
  var tbody = document.getElementById('nas-conformite-tbody');
  var applyBtn = document.getElementById('nc-apply-all-btn');

  statusEl.style.display = 'none';
  summaryEl.style.display = 'block';
  filtersEl.style.display = 'flex';
  tableEl.style.display = 'table';

  // Compteurs
  var ok = 0, missingNas = 0, missingPlat = 0, mismatch = 0;
  _ncData.forEach(function(r) {
    if (r.type === 'ok') ok++;
    else if (r.type === 'missing_nas') missingNas++;
    else if (r.type === 'missing_plat') missingPlat++;
    else if (r.type === 'mismatch') mismatch++;
  });
  document.getElementById('nc-total-ok').textContent = ok;
  document.getElementById('nc-total-missing-nas').textContent = missingNas;
  document.getElementById('nc-total-missing-plat').textContent = missingPlat;
  document.getElementById('nc-total-mismatch').textContent = mismatch;

  var hasActions = missingNas > 0 || missingPlat > 0 || mismatch > 0;
  if (applyBtn) applyBtn.style.display = hasActions ? 'inline-flex' : 'none';

  var footerInfo = document.getElementById('nc-footer-info');
  if (footerInfo) footerInfo.textContent = _ncData.length + ' entrées analysées — ' + ok + ' conformes';

  renderNcTable('all');
}

function renderNcTable(filter) {
  var tbody = document.getElementById('nas-conformite-tbody');
  var items = _ncData;
  if (filter && filter !== 'all') {
    items = items.filter(function(r) { return r.type === filter; });
  }

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:2rem">Aucun élément dans cette catégorie</td></tr>';
    return;
  }

  tbody.innerHTML = items.map(function(r, i) {
    var idx = _ncData.indexOf(r);
    var annee = r.annee || '—';
    var code = r.projet ? (r.projet.code || '—') : '—';
    var nomPlat = r.projet ? (r.projet.nom || '—') : '<span style="color:var(--text-3);font-style:italic">— non référencé —</span>';
    var nasFolder = r.nasFolder || '<span style="color:var(--text-3);font-style:italic">— absent —</span>';
    var statusBadge = '';
    var actionHtml = '';

    switch (r.type) {
      case 'ok':
        statusBadge = '<span style="display:inline-flex;align-items:center;gap:4px;color:var(--green);font-size:0.78rem"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Conforme</span>';
        actionHtml = '<span style="color:var(--text-3);font-size:0.78rem">—</span>';
        break;
      case 'missing_nas':
        statusBadge = '<span style="color:#e07b72;font-size:0.78rem;font-weight:500">Dossier absent</span>';
        actionHtml = '<button class="btn btn-sm" style="font-size:0.72rem;margin-right:4px" onclick="ncCreateFolder(' + idx + ')" title="Créer le dossier sur le NAS">📁 Créer dossier</button>' +
          '<button class="btn btn-sm" style="font-size:0.72rem;color:#e07b72" onclick="ncArchiveProject(' + idx + ')" title="Archiver le projet">Archiver</button>';
        break;
      case 'missing_plat':
        statusBadge = '<span style="color:#d4a54a;font-size:0.78rem;font-weight:500">Absent plateforme</span>';
        actionHtml = '<span style="color:var(--text-3);font-size:0.72rem">Dossier orphelin NAS</span>';
        break;
      case 'mismatch':
        statusBadge = '<span style="color:#7ba1d4;font-size:0.78rem;font-weight:500">Nom divergent</span>';
        actionHtml = '<button class="btn btn-sm" style="font-size:0.72rem;margin-right:4px" onclick="ncRenameNas(' + idx + ')" title="Renommer le dossier NAS pour correspondre à la plateforme">NAS ← Plat.</button>' +
          '<button class="btn btn-sm" style="font-size:0.72rem" onclick="ncRenamePlat(' + idx + ')" title="Modifier le nom sur la plateforme pour correspondre au NAS">Plat. ← NAS</button>';
        break;
    }

    var rowStyle = r.type === 'ok' ? 'opacity:0.6;' : '';
    return '<tr data-nc-type="' + r.type + '" style="' + rowStyle + '">' +
      '<td style="white-space:nowrap">' + annee + '</td>' +
      '<td style="font-family:var(--font-mono,monospace);font-size:0.78rem;white-space:nowrap">' + code + '</td>' +
      '<td>' + nomPlat + '</td>' +
      '<td style="font-size:0.82rem">' + nasFolder + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td style="white-space:nowrap">' + actionHtml + '</td>' +
      '</tr>';
  }).join('');
}

function filterNcTable(filter, btn) {
  // Mettre à jour les boutons actifs
  var btns = document.querySelectorAll('#nas-conformite-filters .nc-filter');
  btns.forEach(function(b) { b.classList.remove('active'); b.style.background = ''; });
  if (btn) { btn.classList.add('active'); btn.style.background = 'var(--bg-2)'; }
  renderNcTable(filter);
}

// ── Actions individuelles ──

// Créer un dossier sur le NAS
function ncCreateFolder(idx) {
  var r = _ncData[idx]; if (!r || !r.projet) return;
  var btn = event.target;
  btn.disabled = true;
  btn.textContent = '⏳…';

  apiFetch('api/nas-mkdir.php', {
    method: 'POST',
    body: { folder: r.expected, annee: r.annee }
  }).then(function(res) {
    if (res.data && res.data.created) {
      r.type = 'ok';
      r.nasFolder = r.expected;
      showToast('Dossier créé : ' + r.expected, '#4caf50');
      renderConformiteResults();
    } else {
      btn.disabled = false;
      btn.textContent = '📁 Créer dossier';
      showToast('Échec de la création du dossier', '#e07b72');
    }
  }).catch(function(e) {
    btn.disabled = false;
    btn.textContent = '📁 Créer dossier';
    showToast('Erreur : ' + (e.message || 'vérifiez le NAS'), '#e07b72');
  });
}

// Archiver un projet sur la plateforme
function ncArchiveProject(idx) {
  var r = _ncData[idx]; if (!r || !r.projet) return;
  if (!confirm('Archiver le projet « ' + (r.projet.nom || r.projet.code) + ' » ?\nLe statut passera à "Archivé".')) return;

  apiFetch('api/projets.php?id=' + r.projet.id)
    .then(function(res) {
      var p = res.data;
      p.statut = 'Archivé';
      return apiFetch('api/projets.php?id=' + r.projet.id, {
        method: 'PUT',
        body: p
      });
    })
    .then(function() {
      r.projet.statut = 'Archivé';
      showToast('Projet archivé : ' + (r.projet.nom || r.projet.code), '#4caf50');
      loadData().then(function() { renderProjets(); });
    })
    .catch(function(e) {
      showToast('Erreur : ' + (e.message || ''), '#e07b72');
    });
}

// Renommer le dossier NAS pour correspondre à la plateforme
function ncRenameNas(idx) {
  var r = _ncData[idx]; if (!r) return;
  var oldName = r.nasFolder;
  var newName = r.expected;
  if (!confirm('Renommer sur le NAS :\n\n« ' + oldName + ' »\n→ « ' + newName + ' »\n\n(Opération WebDAV MOVE)')) return;

  var cfg = getNasConfig();
  var ip = cfg.local || '192.168.1.165';
  var port = cfg.webdavPort || '5005';
  var rootPath = cfg.webdavPath || '/Public/CAS_PROJETS';

  apiFetch('api/nas-rename.php', {
    method: 'POST',
    body: { annee: r.annee, oldName: oldName, newName: newName }
  }).then(function(res) {
    if (res.data && res.data.renamed) {
      r.type = 'ok';
      r.nasFolder = newName;
      showToast('Dossier NAS renommé', '#4caf50');
      renderConformiteResults();
    } else {
      showToast('Échec du renommage NAS', '#e07b72');
    }
  }).catch(function(e) {
    showToast('Erreur : ' + (e.message || ''), '#e07b72');
  });
}

// Renommer le projet sur la plateforme pour correspondre au NAS
function ncRenamePlat(idx) {
  var r = _ncData[idx]; if (!r || !r.projet || !r.nasFolder) return;
  // Extraire le nom du dossier NAS (après le code_)
  var folder = r.nasFolder;
  var code = r.projet.code || '';
  var newNom = folder;
  // Enlever le préfixe code du nom de dossier
  if (code && folder.indexOf(code + '_') === 0) {
    newNom = folder.substring(code.length + 1);
  } else if (code && folder.indexOf(code + ' - ') === 0) {
    newNom = folder.substring(code.length + 3);
  }
  newNom = newNom.replace(/_/g, ' ').trim();

  if (!confirm('Modifier le nom du projet sur la plateforme :\n\n« ' + r.projet.nom + ' »\n→ « ' + newNom + ' »')) return;

  apiFetch('api/projets.php?id=' + r.projet.id)
    .then(function(res) {
      var p = res.data;
      p.nom = newNom;
      return apiFetch('api/projets.php?id=' + r.projet.id, {
        method: 'PUT',
        body: p
      });
    })
    .then(function() {
      r.projet.nom = newNom;
      r.expected = ncExpectedFolder(r.projet);
      r.type = 'ok';
      showToast('Nom du projet mis à jour', '#4caf50');
      renderConformiteResults();
      loadData().then(function() { renderProjets(); });
    })
    .catch(function(e) {
      showToast('Erreur : ' + (e.message || ''), '#e07b72');
    });
}

// Appliquer toutes les actions (créer les dossiers manquants sur le NAS)
function ncApplyAll() {
  var missingNas = _ncData.filter(function(r) { return r.type === 'missing_nas'; });
  if (missingNas.length === 0) { showToast('Aucune action à appliquer', '#d4a54a'); return; }
  if (!confirm('Créer ' + missingNas.length + ' dossier(s) manquant(s) sur le NAS ?')) return;

  var done = 0, errors = 0;
  var total = missingNas.length;

  missingNas.forEach(function(r) {
    apiFetch('api/nas-mkdir.php', {
      method: 'POST',
      body: { folder: r.expected, annee: r.annee }
    }).then(function(res) {
      done++;
      if (res.data && res.data.created) {
        r.type = 'ok';
        r.nasFolder = r.expected;
      } else { errors++; }
      if (done === total) {
        showToast((done - errors) + '/' + total + ' dossiers créés' + (errors ? ' (' + errors + ' erreurs)' : ''), errors ? '#d4a54a' : '#4caf50');
        renderConformiteResults();
      }
    }).catch(function() {
      done++; errors++;
      if (done === total) {
        showToast((done - errors) + '/' + total + ' dossiers créés (' + errors + ' erreurs)', '#e07b72');
        renderConformiteResults();
      }
    });
  });
}
