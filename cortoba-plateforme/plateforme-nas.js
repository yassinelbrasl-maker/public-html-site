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

function loadData(){
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
        if(p.nas_path !== undefined && p.nasPath === undefined) p.nasPath = p.nas_path;
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
  {id:'pj1',nom:'Villa Ben Salah — Hammamet',client:'Ben Salah, Karim',phase:'EXE',honoraires:45000,delai:'2026-09-01',nas:'\\\\NAS\\Projets\\2026\\P001'},
  {id:'pj2',nom:'Immeuble Mahjoub — Sfax',client:'Mahjoub SCI',phase:'APD',honoraires:80000,delai:'2027-03-01',nas:'\\\\NAS\\Projets\\2026\\P002'},
  {id:'pj3',nom:'Villa Hamdi — Tunis',client:'Hamdi, Leila',phase:'PC',honoraires:23000,delai:'2026-12-01',nas:'\\\\NAS\\Projets\\2026\\P003'},
  {id:'pj4',nom:'Bureaux Midoun',client:'Invest Djerba SA',phase:'APS',honoraires:3500,delai:'2026-06-01',nas:'\\\\NAS\\Projets\\2026\\P004'},
  {id:'pj5',nom:'Résidence SARL Méd.',client:'SARL Méditerranée',phase:'DCE',honoraires:55000,delai:'2026-11-01',nas:'\\\\NAS\\Projets\\2026\\P005'},
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
}

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
  var existing = clients.filter(function(c){ return c.code && c.code.startsWith(codeBase); });
  var num = existing.length + 1;
  return codeBase + String(num).padStart(3,'0');
}

function previewCode() {
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
    displayNom = nom + (prenom ? ', '+prenom : '');
  }

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

  var finalCode = _editingClientId
    ? (clients.find(function(c){ return c.id===_editingClientId; })||{}).code || codeGenere
    : codeGenere;

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

// ── Render Clients ──
function renderClients() {
  var tb = document.getElementById('clients-tbody'); if (!tb) return;
  var clients = getClients();
  tb.innerHTML = clients.length === 0
    ? '<tr><td colspan="7" style="text-align:center;color:var(--text-3);padding:2rem">Aucun client. Créez votre premier client.</td></tr>'
    : clients.map(function(c) {
        var wa = c.whatsapp || c.tel || '';
        var waLink = wa
          ? '<a href="https://wa.me/'+wa.replace(/[^0-9]/g,'')+'" target="_blank" style="color:#25D366;text-decoration:none" title="WhatsApp">'+
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:3px"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>'+
            wa+'</a>'
          : '—';
        var mailLink = c.email ? '<a href="mailto:'+c.email+'" style="color:var(--accent)">'+c.email+'</a>' : '—';
        var srcBadge = c.source ? '<span style="font-size:0.7rem;padding:0.15rem 0.4rem;background:var(--bg-2);border-radius:3px;color:var(--text-3)">'+c.source.split('/')[0].split('(')[0].trim()+'</span>' : '—';
        return '<tr onclick="openClientDetail(\''+c.id+'\')" style="cursor:pointer" title="Voir la fiche">'+
          '<td><span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--accent)">'+c.code+'</span></td>'+
          '<td style="font-weight:500">'+(c.displayNom||c.nom||c.raison)+'</td>'+
          '<td onclick="event.stopPropagation()">'+waLink+'</td>'+
          '<td onclick="event.stopPropagation()">'+mailLink+'</td>'+
          '<td>'+srcBadge+'</td>'+
          '<td><span class="'+badgeClass(c.statut)+'">'+c.statut+'</span></td>'+
          '<td onclick="event.stopPropagation()" style="white-space:nowrap">'+
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
  var projets = getProjets().filter(function(p){ return p.client===c.displayNom||p.client===(c.nom+(c.prenom?', '+c.prenom:'')); });
  var devis   = getDevis().filter(function(d){   return d.client===c.displayNom||d.client===(c.nom+(c.prenom?', '+c.prenom:'')); });
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
var _pjSortKey='nom', _pjSortDir=1, _pjColDropOpen=false;
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
    var s = 'padding:0.7rem 0.8rem;white-space:nowrap;user-select:none;'; if(col.sortable) s+='cursor:pointer;';
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
      var col=ALL_PJ_COLUMNS.find(function(x){return x.key===key;}); if(!col) return '<td>—</td>';
      return '<td>'+col.render(p)+'</td>';
    }).join('');
    var editBtn = '<button class="btn btn-sm" onclick="event.stopPropagation();openEditProjet(\''+p.id+'\')" title="Modifier" style="color:var(--accent);margin-right:3px">✎</button>';
    return '<tr onclick="openProjetDetail(\''+p.id+'\')" style="cursor:pointer">'+cells+
      '<td onclick="event.stopPropagation()">'+editBtn+(canDelete() ? '<button class="btn btn-sm" onclick="event.stopPropagation();deleteRow(\'projet\',\''+p.id+'\')" style="color:#e07070">✕</button>' : '')+'</td><td></td></tr>';
  }).join('');
  renderPjPagination(totalFiltered, totalPages);
  if(document.getElementById('page-projets')&&document.getElementById('page-projets').classList.contains('active')){
    if(typeof refreshGlobalMap==='function') setTimeout(refreshGlobalMap,100);
  }
  var b = document.querySelector('[onclick="showPage(\'projets\')"] .nav-badge');
  if(b) b.textContent = list.filter(function(p){ return (p.statut||'')==='Actif'; }).length || '';
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
    L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{attribution:'',maxZoom:19,opacity:0.8}).addTo(_globalMap);
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
  // Exclure le projet en cours d'édition du comptage
  var sameYear = projets.filter(function(p){
    if(_editingProjetId && p.id===_editingProjetId) return false;
    return p.annee==annee || (p.code && p.code.indexOf('_'+yy+'_')!==-1);
  });
  var seq  = String(sameYear.length+1).padStart(2,'0');
  var code = clientCode || '';
  if (!code && clientDisplayNom) {
    var c = getClients().find(function(x){ return x.displayNom===clientDisplayNom||x.display_nom===clientDisplayNom; });
    if (c) code = c.code;
  }
  return seq+'_'+yy+'_'+(code||'XXX');
}

function genNasPath(code, clientObj){
  var yy   = (code||'').split('_')[1] || String(new Date().getFullYear()).slice(-2);
  var year = '20'+yy;
  var suffix = '';
  if (clientObj) {
    if (clientObj.type==='morale') suffix = (clientObj.raison||'').trim().replace(/\s+/g,'_');
    else {
      var p=(clientObj.prenom||'').trim(), n=(clientObj.nom||'').trim();
      suffix = (p&&n) ? p+'_'+n : (n||p);
      suffix = suffix.replace(/\s+/g,'_');
    }
  }
  // Utiliser le chemin UNC complet configuré dans les paramètres NAS
  var base = (getSetting('cortoba_nas_local', '') || '\\\\192.168.1.165\\Public\\CAS_PROJETS').replace(/[\\/]+$/, '');
  var folderName = code + (suffix ? '_' + suffix : '');
  return base + '\\' + year + '\\' + folderName;
}

function previewPjCode(){
  var clientSel = document.getElementById('pj-client');
  var anneeEl   = document.getElementById('pj-annee');
  var codeEl    = document.getElementById('pj-code-preview');
  var nasEl     = document.getElementById('pj-nas-preview');
  if (!clientSel||!codeEl) return;
  var clientVal = clientSel.value;
  var annee     = parseInt(anneeEl&&anneeEl.value)||new Date().getFullYear();
  var client    = getClients().find(function(c){ return c.id===clientVal; });
  var clientNom = client ? (client.displayNom||client.display_nom||client.nom||'') : '';
  var clientCode= client ? client.code : '';
  if (!clientVal) { codeEl.textContent='—'; if(nasEl) nasEl.textContent='—'; return; }
  var code    = genProjetCode(annee, clientNom, clientCode);
  var nasPath = client ? genNasPath(code, client) : '—';
  codeEl.textContent = code;
  if (nasEl) nasEl.textContent = nasPath || '—';
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
  L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    {attribution:'', maxZoom:19, opacity:0.85}).addTo(_pjMap);

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

  var err     = document.getElementById('pj-err');     if(err)    err.style.display='none';
  var codeEl  = document.getElementById('pj-code-preview'); if(codeEl) codeEl.textContent='—';
  var nasEl   = document.getElementById('pj-nas-preview');  if(nasEl)  nasEl.textContent='—';
  var latEl   = document.getElementById('pj-lat');      if(latEl)  latEl.value='';
  var lngEl   = document.getElementById('pj-lng');      if(lngEl)  lngEl.value='';
  var coordsD = document.getElementById('pj-coords-display'); if(coordsD) coordsD.style.display='none';
  var intList = document.getElementById('pj-intervenants-list'); if(intList) intList.innerHTML='';
  var mapEl   = document.getElementById('pj-map-container');    if(mapEl)   mapEl.innerHTML='';

  var titleEl = document.getElementById('pj-modal-title');  if(titleEl) titleEl.textContent='Nouveau projet';
  var eyebrow = document.getElementById('pj-modal-eyebrow');if(eyebrow) eyebrow.textContent='NOUVEAU PROJET';
  var saveBtn = document.getElementById('pj-save-btn');     if(saveBtn) saveBtn.textContent='Créer le projet →';

  populateClientSelect();
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
  if (sel && client) sel.value = client.id;
  previewPjCode();

  populateMissionsList(p.missions||[]);
  if (p.intervenants && p.intervenants.length) p.intervenants.forEach(function(i){ addIntervenant(i); });

  document.getElementById('pj-code-preview').textContent = p.code||'—';
  document.getElementById('pj-nas-preview').textContent  = p.nasPath||p.nas_path||p.nas||'—';

  // Ouvrir la modale directement (sans passer par openModal pour éviter le double reset)
  document.getElementById('modal-projet').classList.add('open');
}

function copyNasPath(encoded){
  var path = decodeURIComponent(encoded);
  if (navigator.clipboard) navigator.clipboard.writeText(path);
  else { var t=document.createElement('textarea');t.value=path;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove(); }
  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;background:var(--bg-1);border:1px solid var(--accent);border-radius:6px;padding:0.6rem 1rem;font-size:0.8rem;color:var(--accent);z-index:9999';
  toast.textContent = '📋 Chemin NAS copié';
  document.body.appendChild(toast); setTimeout(function(){ toast.remove(); }, 2000);
}

function openProjetDetail(id){
  var p = getProjets().find(function(x){ return x.id===id; }); if(!p) return;
  var typeBatVal = p.typeBat||p.type_bat||'';
  var nasPath = p.nasPath||p.nas_path||p.nas||'';
  var nasBtn = nasPath
    ? '<button class="btn btn-sm" onclick="copyNasPath(\''+encodeURIComponent(nasPath)+'\')" title="'+nasPath+'">📋 Copier</button> '
      + '<button class="btn btn-sm" onclick="createNasFolderForProjet(\''+p.id+'\')" title="Créer le dossier sur le NAS">📁 Créer dossier</button>'
    : '';
  var rows = [
    ['Code dossier','<span style="font-family:var(--mono);color:var(--accent);font-weight:700">'+(p.code||'—')+'</span>'],
    ['Statut','<span class="'+badgeClass(p.statut)+'">'+(p.statut||'—')+'</span>'],
    ['Client', p.client||'—'],
    typeBatVal ? ['Type de bâtiment', typeBatVal] : null,
    p.description ? ['Description','<em style="color:var(--text-2)">'+p.description+'</em>'] : null,
    ['Honoraires HT','<strong>'+fmtMontant(p.honoraires||0)+'</strong>'],
    p.budget  ? ['Budget client', fmtMontant(p.budget)] : null,
    p.surface ? ['Surface', p.surface+' m²'] : null,
    p.adresse ? ['Lieu', p.adresse] : null,
    (p.nasPath||p.nas_path||p.nas) ? ['Chemin NAS','<span style="font-family:var(--mono);font-size:0.72rem;color:var(--text-2)">'+(p.nasPath||p.nas_path||p.nas)+'</span> '+nasBtn] : null
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
    '<div style="padding:1.2rem 1.5rem"><table style="width:100%;border-collapse:collapse">'+tr+'</table></div></div>';
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
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
  var code        = _editingProjetId
    ? (document.getElementById('pj-code-preview').textContent || genProjetCode(annee, displayNom, client.code))
    : genProjetCode(annee, displayNom, client.code);
  var nasPath     = genNasPath(code, client);

  var body = {
    nom:nom, client:displayNom, clientId:clientId,
    code:code, annee:annee, statut:statut,
    typeBat: typeBat||null,            // camelCase envoyé; PHP doit accepter les deux
    type_bat: typeBat||null,           // snake_case aussi pour compatibilité API
    honoraires:honoraires,
    budget:budget||null, surface:surface||null,
    description:description||null, adresse:adresse||null,
    lat:lat, lng:lng, nasPath:nasPath,
    nas_path:nasPath,                  // compatibilité snake_case
    surface_shon: parseFloat((document.getElementById('pj-shon')||{}).value)||null,
    surface_shob: parseFloat((document.getElementById('pj-shob')||{}).value)||null,
    surface_terrain: parseFloat((document.getElementById('pj-terrain')||{}).value)||null,
    standing: (document.getElementById('pj-standing')||{}).value||null,
    zone: (document.getElementById('pj-zone')||{}).value||null,
    cout_construction: parseFloat((document.getElementById('pj-cout-construction')||{}).value)||null,
    cout_m2: parseFloat((document.getElementById('pj-cout-m2')||{}).value)||null,
    missions:getSelectedMissions(),
    intervenants:getIntervenants()
  };

  var method, url;
  if (_editingProjetId) {
    // A5 — Modification : PUT avec id dans l'URL
    body.id = _editingProjetId;
    method  = 'PUT';
    url     = 'api/projets.php?id=' + _editingProjetId;
  } else {
    method = 'POST';
    url    = 'api/projets.php';
  }

  var isCreation = !_editingProjetId;

  apiFetch(url, {method:method, body:body})
    .then(function(resp){
      // Créer le dossier NAS côté navigateur (iframe caché vers le NAS local)
      // Le PHP ne peut pas atteindre le NAS (serveur distant) — c'est le navigateur qui le fait
      if (isCreation && nasPath && nasPath !== '—') {
        createNasFolder(nasPath);
      }
      loadData().then(function(){ renderProjets(); populateProjetSelect(); });
      closeModal('modal-projet');
      resetProjetForm();
    })
    .catch(function(e){ err.textContent=e.message||'Erreur'; err.style.display='block'; });
}

// ── Colonnes projets ──
var ALL_PJ_COLUMNS = [
  {key:'code',      label:'Code',       default:true, locked:false,sortable:true, render:function(p){return'<span style="font-family:var(--mono);font-size:0.72rem;color:var(--accent);font-weight:700;letter-spacing:0.08em">'+(p.code||'—')+'</span>';}},
  {key:'nom',       label:'Projet',     default:true, locked:true, sortable:true, render:function(p){return'<span style="font-weight:500">'+(p.nom||'—')+'</span>';}},
  {key:'client',    label:'Client',     default:true, locked:false,sortable:true, render:function(p){return p.client||'—';}},
  {key:'statut',    label:'Statut',     default:true, locked:false,sortable:true, render:function(p){return'<span class="'+badgeClass(p.statut||'')+'">'+(p.statut||'—')+'</span>';}},
  {key:'typeBat',   label:'Type bât.',  default:false,locked:false,sortable:true, render:function(p){return p.typeBat||p.type_bat||'—';}},
  {key:'honoraires',label:'Honoraires', default:true, locked:false,sortable:true, render:function(p){return'<span class="inline-val">'+fmtMontant(p.honoraires||0)+'</span>';}},
  {key:'adresse',   label:'Lieu',       default:false,locked:false,sortable:true, render:function(p){return p.adresse||'—';}},
  {key:'nas',       label:'NAS',        default:true, locked:false,sortable:false,render:function(p){var path=p.nasPath||p.nas_path||p.nas;if(!path)return'—';return'<button class="btn btn-sm" onclick="event.stopPropagation();copyNasPath(\''+encodeURIComponent(path)+'\')" title="'+path+'" style="font-size:0.7rem">'+(p.code||'NAS')+'</button>';}}
];
var _pjActiveColumns = null;

function getPjActiveColumns(){
  if (_pjActiveColumns) return _pjActiveColumns;
  var saved = getLS('cortoba_pj_col_order', null);
  _pjActiveColumns = (saved&&Array.isArray(saved)) ? saved : ALL_PJ_COLUMNS.filter(function(c){return c.default;}).map(function(c){return c.key;});
  return _pjActiveColumns;
}
function savePjColumnPrefs(){ setLS('cortoba_pj_col_order', _pjActiveColumns); }
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
  document.querySelectorAll('#dep-lignes-wrap > div').forEach(function(div){
    var htEl  = div.querySelector('.dep-l-ht');
    var tvaEl = div.querySelector('.dep-l-tva');
    var dEl   = div.querySelector('.dep-l-desc');
    if(!htEl) return;
    var ht  = parseFloat(htEl.value)||0;
    var tva = parseFloat((tvaEl?tvaEl.value:'0').replace('%',''))||0;
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

  var body = {
    description: libelle, montant: ttc, dateDep: date||null,
    categorie: cat, reference: ref||null,
    fournisseur: fourn||null, codeTvaFournisseur: codeTva||null,
    montantHT: totalHT, montantTVA: totalTVA, timbre: timbre,
    montantTTC: ttc, lignes: lignes
  };
  var method = 'POST';
  var url    = 'api/data.php?table=depenses';
  if (_editingDepenseId) {
    method = 'PUT';
    url    = 'api/data.php?table=depenses&id=' + _editingDepenseId;
    body.id = _editingDepenseId;
  }
  apiFetch(url, {method:method, body:body})
    .then(function(){ loadData().then(function(){renderDepenses();}); closeModal('modal-depense'); resetDepenseForm(); })
    .catch(function(e){ alert(e.message||'Erreur'); });
}

function resetDepenseForm(){
  _depLigneCount = 0;
  _editingDepenseId = null;
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
  if (catEl) catEl.value = d.cat || d.categorie || '';
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
function showNotifications(){
  var factures = getFactures();
  var now = new Date();
  var retards = factures.filter(function(f){
    if (f.statut === 'Payée') return false;
    var ech = new Date(f.echeance||f.dateEcheance||f.date_echeance||'');
    return !isNaN(ech) && ech < now;
  });
  var devis = getDevis().filter(function(d){ return d.statut === 'En attente'; });
  var lines2 = [];
  if (retards.length) lines2.push('\ud83d\udd34 ' + retards.length + ' facture(s) implay\u00e9e(s) en retard');
  if (devis.length)   lines2.push('\ud83d\udfe1 ' + devis.length + ' devis en attente de r\u00e9ponse');
  if (!lines2.length) lines2.push('\u2705 Aucune notification en attente');
  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:flex-start;justify-content:flex-end;padding:4rem 1.5rem 0';
  var box = document.createElement('div');
  box.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:1.2rem 1.5rem;min-width:280px;max-width:360px;box-shadow:0 8px 32px rgba(0,0,0,.5)';
  var header = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">'
    + '<div style="font-size:0.72rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-3)">Notifications</div>'
    + '<button id="notif-close" style="background:none;border:none;color:var(--text-3);font-size:1.1rem;cursor:pointer;line-height:1">\u2715</button>'
    + '</div>';
  var items = lines2.map(function(l){ return '<div style="font-size:0.85rem;padding:0.5rem 0;border-bottom:1px solid var(--border)">'+l+'</div>'; }).join('');
  box.innerHTML = header + items;
  if (retards.length) {
    var btn = document.createElement('button');
    btn.className = 'btn btn-sm';
    btn.style.cssText = 'margin-top:0.8rem;width:100%';
    btn.textContent = 'Voir les factures \u2192';
    btn.addEventListener('click', function(){ showPage('facturation'); ov.remove(); });
    box.appendChild(btn);
  }
  box.querySelector('#notif-close').addEventListener('click', function(){ ov.remove(); });
  ov.appendChild(box);
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
  document.body.appendChild(ov);
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
var NAV_MODULE_IDS = ['dashboard','demandes','devis','projets','suivi','facturation','bilans','depenses','fiscalite','nas','equipe','clients','parametres'];

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
      var nameEl = document.getElementById('user-display');
      if (nameEl) nameEl.innerHTML = '<div class="header-user-dot"></div><span>'+(d.user.name||'')+'</span>';
      var ls = document.getElementById('login-screen');
      var ap = document.getElementById('app');
      if (ls) ls.style.display = 'none';
      if (ap) ap.style.display = 'block';
      applyModuleAccess();
      loadData().then(function(){ renderAll(); showPage('dashboard'); });
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
var pageLabels={dashboard:'Tableau de bord',demandes:'Demandes',devis:'Offres & Devis',projets:'Projets',suivi:'Suivi des missions',facturation:'Facturation',bilans:'Bilans',depenses:'Dépenses',fiscalite:'Fiscalité & Impôts',nas:'Serveur NAS',equipe:'Équipe',clients:'Clients',parametres:'Paramètres'};
function showPage(id){
  // Contrôle d'accès : rediriger si module non autorisé
  var _allowed = getAllowedModules();
  if (_allowed !== null && _allowed.indexOf(id) === -1) {
    var _first = _allowed[0] || 'dashboard';
    if (_first !== id) showPage(_first);
    return;
  }
  document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.remove('active'); });
  document.getElementById('page-'+id).classList.add('active');
  var btn=document.querySelector('[onclick="showPage(\''+id+'\')"]');
  if(btn) btn.classList.add('active');
  var _secLabel = document.getElementById('section-label');
  if (_secLabel) _secLabel.textContent=pageLabels[id]||'';
  if(id==='demandes')   setTimeout(renderDemandes,80);
  if(id==='projets')    setTimeout(refreshGlobalMap,300);
  if(id==='suivi')      setTimeout(function(){ loadTaches().then(function(){ renderSuiviPage(); }).catch(function(e){ console.error('[suivi] init error', e); }); },80);
  if(id==='nas')        setTimeout(renderNasPage,80);
  if(id==='equipe')     setTimeout(renderEquipePage,80);
  if(id==='fiscalite')  setTimeout(renderFiscalitePage,100);
  if(id==='parametres') {
    // Attendre que loadSettings soit terminé avant de remplir les champs
    var fillParams = function(){
      renderParametresListes();
      renderCfgTypesParams();
      renderParametresMissions();
      if (typeof renderParametresRoles === 'function') renderParametresRoles();
      loadAgenceParams();
      loadNasParams();
      loadLogoParam();
      loadCfgParams();
      var ribEl = document.getElementById('param-rib');
      if(ribEl) ribEl.value = getSetting('cortoba_rib', '');
      var banqueEl = document.getElementById('param-banque');
      if(banqueEl) banqueEl.value = getSetting('cortoba_banque', '');
      var mentEl = document.getElementById('param-fa-mentions');
      if(mentEl) mentEl.value = getSetting('cortoba_fa_mentions', '');
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
}
function closeModal(id){ document.getElementById(id).classList.remove('open'); }

// ── NAS — remplacé par nasOpenLocal/nasOpenCloud dans le nouveau module ──
function nasConnect(){
  nasOpenLocal();
}

// ── Charts ──
function renderCharts(){
  // CA mensuel dynamique depuis les factures
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
  // Afficher Jan→mois courant + 3 mois futurs
  var curMonth = now.getMonth();
  var caData = [];
  for (var i=0; i<=Math.min(curMonth+3, 11); i++){
    var val = Math.round(caParMois[i]*10)/10;
    var maxVal = Math.max.apply(null, caParMois.map(function(v){ return v||1; })) * 1.2;
    caData.push({label:mois[i], val:val, max:maxVal, future: i > curMonth});
  }
  if (caData.length === 0) caData = [{label:'Jan',val:0,max:10}];
  renderBarChart('ca-chart', caData, 'k');

  // Trésorerie prévisionnelle (CA encaissé cumulé)
  var cumul = 0;
  var trData = [];
  for (var j=0; j<=Math.min(curMonth+3, 11); j++){
    if (j <= curMonth) cumul += caParMois[j];
    var maxCumul = Math.max(cumul * 1.3, 10);
    trData.push({label:mois[j], val:Math.round(cumul*10)/10, max:maxCumul, future: j > curMonth});
  }
  renderBarChart('tresorerie-chart', trData, 'k', true);
}
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
        var nameEl = document.getElementById('user-display');
        if (nameEl) nameEl.innerHTML = '<div class="header-user-dot"></div><span>'+(u.name||'Utilisateur')+'</span>';
        if (loginScreen) loginScreen.style.display = 'none';
        if (appEl)       appEl.style.display       = 'block';
        applyModuleAccess();
        loadData().then(function(){ renderAll(); showPage('dashboard'); });
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

// ── Modules disponibles dans la plateforme ──
var MODULES_PLATEFORME = [
  { id: 'dashboard',   label: 'Tableau de bord' },
  { id: 'demandes',   label: 'Demandes' },
  { id: 'devis',       label: 'Offres & Devis' },
  { id: 'projets',     label: 'Projets' },
  { id: 'facturation', label: 'Facturation' },
  { id: 'bilans',      label: 'Bilans' },
  { id: 'depenses',    label: 'Dépenses' },
  { id: 'fiscalite',   label: 'Fiscalité' },
  { id: 'nas',         label: 'Serveur NAS' },
  { id: 'equipe',      label: 'Équipe' },
  { id: 'clients',     label: 'Clients' },
  { id: 'parametres',  label: 'Paramètres' },
];

// Modules par défaut selon rôle (pré-coché automatiquement à la sélection)
var MODULES_PAR_ROLE = {
  'Architecte gérant':       ['dashboard','demandes','devis','projets','suivi','facturation','bilans','depenses','fiscalite','nas','equipe','clients','parametres'],
  'Architecte collaborateur':['dashboard','devis','projets','suivi','nas','clients'],
  'Décorateur':              ['dashboard','projets','suivi','nas','clients'],
  'Comptable':               ['dashboard','facturation','bilans','depenses','fiscalite'],
  'Ingénieur paysagiste':    ['dashboard','projets','suivi','nas','clients'],
  'Stagiaire':               ['dashboard','projets','suivi'],
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
    + '<div style="width:44px;height:44px;background:var(--bg-3);border:1px solid var(--border);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:0.9rem;font-weight:600;color:var(--text-2);flex-shrink:0">' + ini + '</div>'
    + '<div>'
    + '<div style="font-weight:500;color:var(--text);font-size:0.9rem">' + escHtml(m.prenom + ' ' + m.nom) + '</div>'
    + '<div style="font-size:0.72rem;color:var(--text-3);margin-top:2px">' + escHtml(m.role || '—') + (m.spec ? ' · ' + escHtml(m.spec) : '') + '</div>'
    + '<div style="font-size:0.7rem;color:var(--text-3);margin-top:2px">' + escHtml(m.email || '') + '</div>'
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
var _editingMembreId = null;

function openModal_membre_reset() {
  _editingMembreId = null;
  document.getElementById('modal-membre-title').textContent = 'Nouveau membre';
  ['mb-prenom','mb-nom','mb-email','mb-tel','mb-spec','mb-pass','mb-pass2'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  var statEl = document.getElementById('mb-statut');
  if (statEl) statEl.value = 'Actif';
  var roleEl = document.getElementById('mb-role');
  if (roleEl) roleEl.value = '';
  document.getElementById('mb-error').style.display = 'none';

  renderRoleSelectModal();
  renderModulesCheckboxes([]);
}

function editMembre(id) {
  var m = getMembres().find(function(x){ return x.id === id; });
  if (!m) return;
  _editingMembreId = id;
  document.getElementById('modal-membre-title').textContent = 'Modifier le membre';
  document.getElementById('mb-prenom').value = m.prenom || '';
  document.getElementById('mb-nom').value    = m.nom    || '';
  document.getElementById('mb-email').value  = m.email  || '';
  document.getElementById('mb-tel').value    = m.tel    || '';
  document.getElementById('mb-spec').value   = m.spec   || '';
  document.getElementById('mb-pass').value   = '';
  document.getElementById('mb-pass2').value  = '';
  var statEl = document.getElementById('mb-statut');
  if (statEl) statEl.value = m.statut || 'Actif';

  document.getElementById('mb-error').style.display = 'none';

  renderRoleSelectModal();
  setTimeout(function(){
    var roleEl = document.getElementById('mb-role');
    if (roleEl && m.role) roleEl.value = m.role;
    renderModulesCheckboxes(m.modules || []);
  }, 50);

  // Ouvrir le modal directement sans reset (openModal appellerait openModal_membre_reset)
  document.getElementById('modal-membre').classList.add('open');
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

// ── Checkboxes modules ──
function renderModulesCheckboxes(preChecked) {
  var wrap = document.getElementById('mb-modules-wrap');
  if (!wrap) return;
  preChecked = preChecked || [];
  wrap.innerHTML = MODULES_PLATEFORME.map(function(mod) {
    var checked = preChecked.indexOf(mod.id) !== -1;
    return '<label style="display:flex;align-items:center;gap:0.6rem;padding:0.55rem 0.8rem;border:1px solid var(--border);border-radius:6px;cursor:pointer;transition:border-color .15s;background:var(--bg-2)" '
      + 'onmouseover="this.style.borderColor=\'var(--accent)\'" onmouseout="this.style.borderColor=\'var(--border)\'">'
      + '<input type="checkbox" name="mb-mod" value="'+mod.id+'" '+(checked?'checked':'')+' style="accent-color:var(--accent);width:14px;height:14px;flex-shrink:0">'
      + '<span style="font-size:0.8rem;color:var(--text-2)">'+mod.label+'</span>'
      + '</label>';
  }).join('');
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
  var prenom = (document.getElementById('mb-prenom').value||'').trim();
  var nom    = (document.getElementById('mb-nom').value||'').trim();
  var email  = (document.getElementById('mb-email').value||'').trim().toLowerCase();
  var role   = (document.getElementById('mb-role').value||'').trim();
  var statut = (document.getElementById('mb-statut').value||'Actif');
  var tel    = (document.getElementById('mb-tel').value||'').trim();
  var spec   = (document.getElementById('mb-spec').value||'').trim();
  var pass   = document.getElementById('mb-pass').value||'';
  var pass2  = document.getElementById('mb-pass2').value||'';
  var errEl  = document.getElementById('mb-error');

  function showErr(msg) {
    errEl.textContent = msg;
    errEl.style.display = 'block';
  }

  errEl.style.display = 'none';

  // Validation
  if (!prenom || !nom) { showErr('Le prénom et le nom sont requis.'); return; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showErr('Email invalide.'); return; }
  if (!role) { showErr('Veuillez sélectionner un rôle.'); return; }

  var membres = getMembres();

  // Vérification email unique
  var duplicate = membres.find(function(m){
    return m.email === email && m.id !== _editingMembreId;
  });
  if (duplicate) { showErr('Cet email est déjà utilisé par un autre membre.'); return; }

  // Vérification mot de passe si nouveau
  if (!_editingMembreId || pass) {
    if (!_editingMembreId && !pass) { showErr('Un mot de passe initial est requis pour un nouveau membre.'); return; }
    if (pass && pass.length < 6)   { showErr('Le mot de passe doit contenir au moins 6 caractères.'); return; }
    if (pass && pass !== pass2)    { showErr('Les mots de passe ne correspondent pas.'); return; }
  }

  // Modules cochés
  var modules = [];
  document.querySelectorAll('input[name="mb-mod"]:checked').forEach(function(c){
    modules.push(c.value);
  });

  var membreId = _editingMembreId || uid();
  var isEdit   = !!_editingMembreId;

  var payload = {
    id:       membreId,
    prenom:   prenom,
    nom:      nom,
    email:    email,
    role:     role,
    statut:   statut,
    tel:      tel,
    spec:     spec,
    modules:  modules,
    password: pass
  };

  var saveBtn = document.querySelector('#modal-membre .btn-primary');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Enregistrement…'; }

  var apiMethod = isEdit ? 'PUT' : 'POST';

  apiFetch('api/users.php', { method: apiMethod, body: payload })
    .then(function() {
      var membres = getMembres();
      if (isEdit) {
        var idx = membres.findIndex(function(m){ return m.id === membreId; });
        if (idx !== -1) {
          membres[idx].prenom=prenom; membres[idx].nom=nom; membres[idx].email=email;
          membres[idx].role=role; membres[idx].statut=statut; membres[idx].tel=tel;
          membres[idx].spec=spec; membres[idx].modules=modules;
        }
      } else {
        membres.push({ id:membreId, prenom:prenom, nom:nom, email:email,
          role:role, statut:statut, tel:tel, spec:spec, modules:modules,
          createdAt: new Date().toISOString() });
      }
      saveMembresData(membres);
      closeModal('modal-membre');
      renderEquipePage();
      showToast(isEdit ? 'Membre mis à jour ✓' : 'Compte créé — connexion possible immédiatement ✓');
    })
    .catch(function(e) {
      var msg = (e && e.message) || '';
      var isNetErr = !msg || msg.indexOf('404') !== -1 || msg.indexOf('Failed') !== -1;
      if (isNetErr) {
        // Fallback localStorage si api/users.php non encore déployé
        var membres = getMembres();
        if (isEdit) {
          var idx = membres.findIndex(function(m){ return m.id === membreId; });
          if (idx !== -1) { membres[idx].prenom=prenom; membres[idx].nom=nom; membres[idx].email=email; membres[idx].role=role; membres[idx].statut=statut; membres[idx].tel=tel; membres[idx].spec=spec; membres[idx].modules=modules; }
        } else {
          membres.push({ id:membreId, prenom:prenom, nom:nom, email:email, role:role, statut:statut, tel:tel, spec:spec, modules:modules, createdAt:new Date().toISOString() });
        }
        saveMembresData(membres);
        closeModal('modal-membre');
        renderEquipePage();
        showToast('⚠️ Sauvegardé localement — déployez api/users.php pour activer la connexion', '#e07b72');
      } else {
        var errEl = document.getElementById('mb-error');
        if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
      }
    })
    .finally(function(){
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Enregistrer'; }
      _editingMembreId = null;
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

// ══════════════════════════════════════════════════════════
//  CRÉATION DOSSIER NAS (via nas-mkdir.php hébergé sur le NAS)
// ══════════════════════════════════════════════════════════

// Extraire l'IP pure d'une valeur qui peut contenir un chemin UNC
function extractNasIp(val) {
  if (!val) return '';
  var s = val.replace(/\\/g, '/').replace(/^\/+/, '');
  if (s.indexOf('/') === -1) return s;
  var m = s.match(/^([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/);
  if (m) return m[1];
  return s.split('/')[0];
}

function createNasFolder(nasPath, callback) {
  if (!nasPath || nasPath === '—') {
    if (callback) callback(false, 'Chemin NAS non défini');
    return;
  }

  var cfg = getNasConfig();
  var nasIp = cfg.local || '192.168.1.165';

  // Convertir le chemin UNC en chemin relatif : Public/CAS_PROJETS/2026/XX
  var foldersPath = nasPath.replace(/\\\\/g, '/').replace(/\\/g, '/');
  foldersPath = foldersPath.replace(/^\/\/[^\/]+\//, '');

  if (!nasIp) {
    _nasCopyClipboard(nasPath, callback);
    return;
  }

  // Appel direct au PHP hébergé sur le NAS (nas-mkdir.php)
  // Essayer HTTPS d'abord (port 8081), puis HTTP (port 80) en fallback
  var httpsUrl = 'https://' + nasIp + ':8081/nas-mkdir.php?folders=' + encodeURIComponent(foldersPath);
  var httpUrl  = 'http://' + nasIp + '/nas-mkdir.php?folders=' + encodeURIComponent(foldersPath);

  console.log('[NAS] Création dossier:', foldersPath);

  _nasFetchCreate(httpsUrl, nasPath, callback, function() {
    // HTTPS échoué (cert self-signed non accepté) → essayer HTTP
    console.log('[NAS] HTTPS échoué, essai HTTP...');
    _nasFetchCreate(httpUrl, nasPath, callback, function() {
      // HTTP aussi échoué (mixed content) → fallback clipboard
      console.warn('[NAS] HTTP aussi échoué — fallback clipboard');
      _nasCopyClipboard(nasPath, callback);
    });
  });
}

function _nasFetchCreate(url, nasPath, callback, onError) {
  fetch(url, { mode: 'cors', cache: 'no-cache' })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.success) {
        var msg = d.created ? 'Dossier NAS créé' : 'Dossier NAS existe déjà';
        if (d.template_copied && d.template_copied.length) {
          msg += ' + ' + d.template_copied.length + ' sous-dossiers copiés';
        }
        console.log('[NAS] Succès:', d);
        showToast(msg);
        if (callback) callback(true, msg);
      } else {
        console.warn('[NAS] Erreur serveur:', d.error);
        showToast('Erreur NAS : ' + (d.error || 'inconnue'), 'error');
        if (callback) callback(false, d.error);
      }
    })
    .catch(function(e) {
      console.warn('[NAS] fetch échoué:', e.message);
      if (onError) onError();
    });
}

// Fallback : copier le chemin NAS dans le presse-papier
function _nasCopyClipboard(nasPath, callback) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(nasPath).then(function() {
      showToast('Chemin NAS copié — collez dans l\'Explorateur Windows (Ctrl+V)');
    }).catch(function() {
      showToast('Chemin NAS : ' + nasPath);
    });
  }
  if (callback) callback('clipboard', nasPath);
}

function createNasFolderForProjet(projetId) {
  var p = getProjets().find(function(x){ return x.id === projetId; });
  if (!p) return;
  var path = p.nasPath || p.nas_path || '';
  if (!path) { showToast('Aucun chemin NAS pour ce projet', 'error'); return; }
  createNasFolder(path);
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

function suiviProgressBar(val) {
  var color = val >= 100 ? 'var(--green)' : val >= 50 ? 'var(--accent)' : 'var(--blue)';
  return '<div class="suivi-progress-wrap">' +
    '<div class="suivi-progress-bar" style="width:' + val + '%;background:' + color + '"></div>' +
    '</div>' +
    '<span class="suivi-progress-text">' + val + '%</span>';
}

// ── Vue arborescente (liste) ──
function renderSuiviTree(items) {
  var tree = document.getElementById('suivi-tree');
  var empty = document.getElementById('suivi-empty');

  // Build hierarchy: group by projet, then missions → taches → sous-taches
  var projetMap = {};
  items.forEach(function(t) {
    var pid = t.projet_id;
    if (!projetMap[pid]) projetMap[pid] = { nom: t.projetNom || 'Projet inconnu', code: t.projetCode || '', items: [] };
    projetMap[pid].items.push(t);
  });

  if (Object.keys(projetMap).length === 0) {
    tree.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  var html = '';
  Object.keys(projetMap).forEach(function(pid) {
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
      html += suiviProgressBar(m.progression);
      if (m.dateEcheance) html += '<span class="suivi-date" title="Échéance">' + fD(m.dateEcheance) + '</span>';
      if (m.assignee) html += '<span class="suivi-assignee" title="' + m.assignee + '">' + m.assignee.split(' ')[0] + '</span>';
      html += '<div class="suivi-actions">';
      html += '<button class="suivi-action-btn" onclick="event.stopPropagation();openSuiviModal(1, \'' + m.id + '\', \'' + pid + '\')" title="Ajouter tâche">+ Tâche</button>';
      html += '<button class="suivi-action-btn" onclick="event.stopPropagation();editTache(\'' + m.id + '\')" title="Modifier">✎</button>';
      html += '<button class="suivi-action-btn suivi-del" onclick="event.stopPropagation();deleteTache(\'' + m.id + '\')" title="Supprimer">✕</button>';
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
        html += '</div>';
        html += '<div class="suivi-tache-right">';
        html += suiviStatutBadge(tache.statut);
        html += suiviProgressBar(tache.progression);
        if (tache.dateEcheance) html += '<span class="suivi-date">' + fD(tache.dateEcheance) + '</span>';
        if (tache.assignee) html += '<span class="suivi-assignee">' + tache.assignee.split(' ')[0] + '</span>';
        html += '<div class="suivi-actions">';
        html += '<button class="suivi-action-btn" onclick="event.stopPropagation();openSuiviModal(2, \'' + tache.id + '\', \'' + pid + '\')" title="Ajouter sous-tâche">+</button>';
        html += '<button class="suivi-action-btn" onclick="event.stopPropagation();editTache(\'' + tache.id + '\')" title="Modifier">✎</button>';
        html += '<button class="suivi-action-btn suivi-del" onclick="event.stopPropagation();deleteTache(\'' + tache.id + '\')" title="Supprimer">✕</button>';
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
            html += '<div style="margin-left:auto;display:flex;align-items:center;gap:0.4rem">';
            html += suiviStatutBadge(st.statut);
            if (st.assignee) html += '<span class="suivi-assignee">' + st.assignee.split(' ')[0] + '</span>';
            html += '<button class="suivi-action-btn" onclick="editTache(\'' + st.id + '\')" title="Modifier">✎</button>';
            html += '<button class="suivi-action-btn suivi-del" onclick="deleteTache(\'' + st.id + '\')" title="Supprimer">✕</button>';
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
  });

  tree.innerHTML = html;
}

// ── Vue Kanban ──
function renderSuiviKanban(items) {
  var kanban = document.getElementById('suivi-kanban');
  var statuts = ['A faire', 'En cours', 'Bloqué', 'Terminé'];
  var colors = { 'A faire': 'var(--yellow)', 'En cours': 'var(--blue)', 'Bloqué': 'var(--red)', 'Terminé': 'var(--green)' };

  var html = '';
  statuts.forEach(function(st) {
    var col = items.filter(function(t){ return t.statut === st; });
    html += '<div class="suivi-kanban-col">';
    html += '<div class="suivi-kanban-col-header" style="border-top-color:' + colors[st] + '">';
    html += '<span>' + st + '</span><span class="suivi-kanban-count">' + col.length + '</span>';
    html += '</div>';
    html += '<div class="suivi-kanban-col-body">';
    col.forEach(function(t) {
      var niveauLabel = t.niveau === 0 ? 'Mission' : t.niveau === 1 ? 'Tâche' : 'Sous-tâche';
      html += '<div class="suivi-kanban-card" onclick="editTache(\'' + t.id + '\')">';
      html += '<div class="suivi-kanban-card-top">';
      html += '<span class="suivi-kanban-niveau">' + niveauLabel + '</span>';
      html += suiviPrioriteBadge(t.priorite);
      html += '</div>';
      html += '<div class="suivi-kanban-card-titre">' + (t.titre||'') + '</div>';
      if (t.projetNom) html += '<div class="suivi-kanban-card-projet">' + (t.projetCode ? t.projetCode + ' — ' : '') + t.projetNom + '</div>';
      html += '<div class="suivi-kanban-card-bottom">';
      if (t.assignee) html += '<span class="suivi-assignee">' + t.assignee + '</span>';
      if (t.dateEcheance) html += '<span class="suivi-date">' + fD(t.dateEcheance) + '</span>';
      html += '</div>';
      html += '</div>';
    });
    html += '</div></div>';
  });
  kanban.innerHTML = html;
}

// ── Toggle vue liste/kanban ──
function suiviToggleView() {
  var btn = document.getElementById('suivi-toggle-view');
  if (_suiviView === 'list') {
    _suiviView = 'kanban';
    document.getElementById('suivi-list-view').style.display = 'none';
    document.getElementById('suivi-kanban-view').style.display = '';
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> Vue Liste';
  } else {
    _suiviView = 'list';
    document.getElementById('suivi-list-view').style.display = '';
    document.getElementById('suivi-kanban-view').style.display = 'none';
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> Vue Kanban';
  }
  renderSuiviPage();
}

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

// ── Remplir le select missions groupé par catégorie ──
function _populateMissionsSelect(selectedValue) {
  var sel = document.getElementById('tache-titre-select');
  sel.innerHTML = '<option value="">— Choisir une mission —</option>';
  var missions = getMissions();
  var cats = getMissionCategories();

  cats.forEach(function(cat) {
    var catMissions = missions.filter(function(m) { return m.cat === cat.id; });
    if (catMissions.length === 0) return;
    var optgroup = document.createElement('optgroup');
    optgroup.label = cat.label;
    catMissions.forEach(function(m) {
      var opt = document.createElement('option');
      opt.value = m.nom;
      opt.textContent = m.nom;
      optgroup.appendChild(opt);
    });
    sel.appendChild(optgroup);
  });

  // Missions orphelines (sans catégorie)
  var orphans = missions.filter(function(m) { return !m.cat || !cats.find(function(c){ return c.id === m.cat; }); });
  orphans.forEach(function(m) {
    var opt = document.createElement('option');
    opt.value = m.nom;
    opt.textContent = m.nom;
    sel.appendChild(opt);
  });

  if (selectedValue) sel.value = selectedValue;
}

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
  // Afficher select mission ou input titre selon le niveau
  _toggleTitreField(t.niveau, t.titre || '');
  document.getElementById('tache-desc').value = t.description || '';
  document.getElementById('tache-statut').value = t.statut || 'A faire';
  document.getElementById('tache-priorite').value = t.priorite || 'Normale';
  document.getElementById('tache-progression').value = t.progression || 0;
  document.getElementById('tache-prog-val').textContent = (t.progression||0) + '%';
  document.getElementById('tache-date-debut').value = t.dateDebut || t.date_debut || '';
  document.getElementById('tache-date-echeance').value = t.dateEcheance || t.date_echeance || '';
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

  // Populate assignee select with team members
  _populateAssigneeSelect(t.assignee || '');

  openModal('modal-tache');
}

// ── Sauvegarder tâche (create / update) ──
function saveTache() {
  var id       = document.getElementById('tache-id').value;
  var niveau   = parseInt(document.getElementById('tache-niveau').value) || 0;
  var titre    = niveau === 0
    ? document.getElementById('tache-titre-select').value.trim()
    : document.getElementById('tache-titre').value.trim();
  var projetId = document.getElementById('tache-projet').value;
  var errEl    = document.getElementById('tache-err');

  if (!titre) { errEl.textContent = niveau === 0 ? 'Veuillez choisir une mission.' : 'Le titre est requis.'; errEl.style.display = 'block'; return; }
  if (!projetId) { errEl.textContent = 'Veuillez choisir un projet.'; errEl.style.display = 'block'; return; }

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
    date_echeance: document.getElementById('tache-date-echeance').value || null
  };

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

