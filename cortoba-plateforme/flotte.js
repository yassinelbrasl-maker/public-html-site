// ══════════════════════════════════════════════════════════════
//  GESTION DE LA FLOTTE DE VÉHICULES
// ══════════════════════════════════════════════════════════════

var _flotteCache = { vehicules: [], attributions: [], reservations: [], kilometres: [], carburant: [], entretien: [], sinistres: [], assurances: [], controles: [], permis: [], couts: [], tco: [], alertes: [], dashboard: {} };
var _flotteFilter = '';
var _flotteEntFilter = '';

function _flotteFmt(n) { return (n||0).toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2}); }
function _flotteFmtInt(n) { return (n||0).toLocaleString('fr-FR'); }

function _flotteStatutBadge(s) {
  var m = {'Disponible':'badge-green','Attribué':'badge-blue','En réparation':'badge-orange','Hors service':'badge-red',
           'Active':'badge-green','Terminée':'badge-gray','En attente':'badge-orange','Approuvée':'badge-green','Refusée':'badge-red','Annulée':'badge-gray',
           'Planifié':'badge-blue','En cours':'badge-orange','Terminé':'badge-green','Annulé':'badge-gray',
           'Déclaré':'badge-orange','En expertise':'badge-blue','Clôturé':'badge-green',
           'Valide':'badge-green','Expiré':'badge-red','Suspendu':'badge-orange',
           'Favorable':'badge-green','Défavorable':'badge-red','Contre-visite':'badge-orange'};
  var cls = m[s] || 'badge-gray';
  return '<span class="badge '+cls+'">'+s+'</span>';
}

function _flottePopulateVehiculeSelect(selId) {
  var sel = document.getElementById(selId);
  if (!sel) return;
  var html = '<option value="">— Choisir —</option>';
  _flotteCache.vehicules.forEach(function(v) {
    html += '<option value="'+v.id+'">'+v.marque+' '+v.modele+' ('+v.immatriculation+')</option>';
  });
  sel.innerHTML = html;
}

function _flotteLoadVehicules() {
  return apiFetch('api/flotte.php').then(function(r) {
    _flotteCache.vehicules = (r && r.data) ? r.data : [];
  });
}

// Datalist partagée pour tous les champs collaborateur (input + datalist)
function _flottePopulateDatalist(membres) {
  var dl = document.getElementById('flotte-membres-datalist');
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = 'flotte-membres-datalist';
    document.body.appendChild(dl);
  }
  var html = '';
  (membres || []).forEach(function(m) {
    var nom = ((m.prenom || '') + ' ' + (m.nom || '')).trim();
    if (nom) html += '<option value="' + nom.replace(/"/g, '&quot;') + '">';
  });
  dl.innerHTML = html;
}

function _flotteBindCollabInputs() {
  // Bind les attributs list sur les inputs
  var ids = ['flattr-collaborateur', 'flresa-demandeur', 'flkm-conducteur', 'flsin-conducteur', 'flperm-collaborateur'];
  ids.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) {
      el.setAttribute('list', 'flotte-membres-datalist');
      el.setAttribute('autocomplete', 'off');
    }
  });

  // Charger les membres : d'abord le cache, puis l'API si vide
  var cached = (typeof getMembres === 'function') ? getMembres() : [];
  if (cached && cached.length > 0) {
    _flottePopulateDatalist(cached);
  } else if (typeof loadMembresFromAPI === 'function') {
    loadMembresFromAPI().then(function(membres) {
      _flottePopulateDatalist(membres);
    });
  }
}


// ══════════════════════════════════════
//  DASHBOARD FLOTTE
// ══════════════════════════════════════

function renderFlotteDashboard() {
  Promise.all([
    apiFetch('api/flotte.php?action=dashboard').then(function(r) { _flotteCache.dashboard = (r&&r.data)?r.data:{}; }),
    _flotteLoadVehicules(),
    apiFetch('api/flotte.php?action=attributions').then(function(r) { _flotteCache.attributions = (r&&r.data)?r.data:[]; }),
    apiFetch('api/flotte.php?action=alertes').then(function(r) { _flotteCache.alertes = (r&&r.data)?r.data:[]; })
  ]).then(function() {
    _renderFlotteDashboardContent();
  }).catch(function(e) { console.error('[flotte] dashboard error', e); });
}

function _renderFlotteDashboardContent() {
  var d = _flotteCache.dashboard;
  var kpiEl = document.getElementById('flotte-kpis');
  if (kpiEl) kpiEl.innerHTML =
    '<div class="kpi-card"><div class="kpi-label">Véhicules</div><div class="kpi-value">'+_flotteFmtInt(d.total_vehicules)+'</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Disponibles</div><div class="kpi-value" style="color:var(--green)">'+_flotteFmtInt(d.disponibles)+'</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Attribués</div><div class="kpi-value" style="color:var(--blue)">'+_flotteFmtInt(d.attribues)+'</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">En réparation</div><div class="kpi-value" style="color:var(--orange)">'+_flotteFmtInt(d.en_reparation)+'</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Km ce mois</div><div class="kpi-value">'+_flotteFmtInt(d.km_mois)+'</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Coûts ce mois</div><div class="kpi-value">'+_flotteFmt(d.total_couts_mois)+'<span class="kpi-unit"> TND</span></div></div>';

  var alertEl = document.getElementById('flotte-alertes');
  if (alertEl) {
    if (_flotteCache.alertes.length === 0) {
      alertEl.innerHTML = '';
    } else {
      var ah = '<div class="card" style="margin-bottom:1rem"><div class="card-title" style="color:var(--orange)">Alertes ('+_flotteCache.alertes.length+')</div><div style="padding:0.5rem 1rem">';
      _flotteCache.alertes.forEach(function(a) {
        var col = a.urgence === 'error' ? 'var(--red)' : 'var(--orange)';
        ah += '<div style="padding:0.4rem 0;border-bottom:1px solid var(--border);display:flex;gap:0.8rem;align-items:center">' +
          '<span style="width:8px;height:8px;border-radius:50%;background:'+col+';flex-shrink:0"></span>' +
          '<span style="flex:1;font-size:0.85rem"><strong>'+a.vehicule+'</strong> — '+a.message+'</span></div>';
      });
      ah += '</div></div>';
      alertEl.innerHTML = ah;
    }
  }
  _renderFlotteVehiculeTable();
}

function flotteFilterVehicules(statut, btn) {
  _flotteFilter = statut;
  document.querySelectorAll('.flotte-v-filter').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  _renderFlotteVehiculeTable();
}

function _renderFlotteVehiculeTable() {
  var tbody = document.getElementById('flotte-vehicules-tbody');
  if (!tbody) return;
  var list = _flotteCache.vehicules;
  if (_flotteFilter) list = list.filter(function(v) { return v.statut === _flotteFilter; });

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-3);padding:2rem">Aucun véhicule</td></tr>';
    return;
  }

  var attrMap = {};
  _flotteCache.attributions.forEach(function(a) {
    if (a.statut === 'Active') attrMap[a.vehicule_id] = a.collaborateur;
  });

  var h = '';
  list.forEach(function(v) {
    h += '<tr>' +
      '<td style="font-weight:600">'+v.marque+' '+v.modele+'</td>' +
      '<td><code style="color:var(--accent)">'+v.immatriculation+'</code></td>' +
      '<td>'+v.type_vehicule+'</td>' +
      '<td>'+_flotteFmtInt(v.kilometrage_actuel)+' km</td>' +
      '<td>'+_flotteStatutBadge(v.statut)+'</td>' +
      '<td>'+(attrMap[v.id]||'—')+'</td>' +
      '<td>'+(v.departement||'—')+'</td>' +
      '<td><button class="btn btn-sm" onclick="editFlotteVehicule(\''+v.id+'\')">&#9998;</button> '+(canDelete() ? '<button class="btn btn-sm" onclick="deleteFlotteVehicule(\''+v.id+'\')" style="color:#e07070" title="Supprimer">&#10005;</button>' : '')+'</td>' +
      '</tr>';
  });
  tbody.innerHTML = h;
}

function saveFlotteVehicule() {
  var id = document.getElementById('flv-edit-id').value;
  var body = {
    marque: document.getElementById('flv-marque').value,
    modele: document.getElementById('flv-modele').value,
    immatriculation: document.getElementById('flv-immatriculation').value,
    vin: document.getElementById('flv-vin').value,
    type_vehicule: document.getElementById('flv-type').value,
    couleur: document.getElementById('flv-couleur').value,
    date_achat: document.getElementById('flv-date-achat').value,
    date_mise_circulation: document.getElementById('flv-date-circ').value,
    valeur_achat: document.getElementById('flv-valeur').value || 0,
    kilometrage_actuel: document.getElementById('flv-km').value || 0,
    statut: document.getElementById('flv-statut').value,
    type_usage: document.getElementById('flv-usage').value,
    departement: document.getElementById('flv-departement').value,
    agence: document.getElementById('flv-agence').value,
    notes: document.getElementById('flv-notes').value
  };
  if (!body.marque || !body.modele || !body.immatriculation) { showToast('Marque, modèle et immatriculation obligatoires', 'error'); return; }
  var url = id ? ('api/flotte.php?id='+id) : 'api/flotte.php';
  apiFetch(url, { method: id ? 'PUT' : 'POST', body: body }).then(function() {
    showToast('Véhicule enregistré', 'success');
    closeModal('modal-flotte-vehicule');
    renderFlotteDashboard();
  }).catch(function(e) { showToast('Erreur: '+e.message, 'error'); });
}

function editFlotteVehicule(id) {
  var v = null; _flotteCache.vehicules.forEach(function(x) { if (x.id === id) v = x; });
  if (!v) return;
  document.getElementById('flv-edit-id').value = v.id;
  document.getElementById('flv-marque').value = v.marque || '';
  document.getElementById('flv-modele').value = v.modele || '';
  document.getElementById('flv-immatriculation').value = v.immatriculation || '';
  document.getElementById('flv-vin').value = v.vin || '';
  document.getElementById('flv-type').value = v.type_vehicule || 'Utilitaire';
  document.getElementById('flv-couleur').value = v.couleur || '';
  document.getElementById('flv-date-achat').value = (v.date_achat || '').substring(0,10);
  document.getElementById('flv-date-circ').value = (v.date_mise_circulation || '').substring(0,10);
  document.getElementById('flv-valeur').value = v.valeur_achat || '';
  document.getElementById('flv-km').value = v.kilometrage_actuel || '';
  document.getElementById('flv-statut').value = v.statut || 'Disponible';
  document.getElementById('flv-usage').value = v.type_usage || 'Professionnel';
  document.getElementById('flv-departement').value = v.departement || '';
  document.getElementById('flv-agence').value = v.agence || '';
  document.getElementById('flv-notes').value = v.notes || '';
  document.getElementById('modal-flv-title').textContent = 'Modifier véhicule';
  openModal('modal-flotte-vehicule');
}

function deleteFlotteVehicule(id) {
  if (!confirm('Supprimer ce véhicule ?')) return;
  apiFetch('api/flotte.php?id='+id, { method: 'DELETE' }).then(function() {
    showToast('Véhicule supprimé', 'success'); renderFlotteDashboard();
  }).catch(function(e) { showToast('Erreur: '+e.message, 'error'); });
}


// ══════════════════════════════════════
//  RÉSERVATIONS & ATTRIBUTIONS
// ══════════════════════════════════════

function renderFlotteResaPage() {
  Promise.all([
    _flotteLoadVehicules(),
    apiFetch('api/flotte.php?action=reservations').then(function(r) { _flotteCache.reservations = (r&&r.data)?r.data:[]; }),
    apiFetch('api/flotte.php?action=attributions').then(function(r) { _flotteCache.attributions = (r&&r.data)?r.data:[]; })
  ]).then(function() {
    _flottePopulateVehiculeSelect('flresa-vehicule');
    _flottePopulateVehiculeSelect('flattr-vehicule');
    _flotteBindCollabInputs();
    _renderFlotteResaTable();
    _renderFlotteAttrTable();
  });
}

function flotteResaTab(tab, btn) {
  document.querySelectorAll('.flr-tab').forEach(function(b) { b.classList.remove('active'); b.style.color='var(--text-3)'; b.style.borderBottomColor='transparent'; });
  btn.classList.add('active'); btn.style.color='var(--text-2)'; btn.style.borderBottomColor='var(--accent)';
  ['reservations','attributions','calendrier'].forEach(function(t) {
    var p = document.getElementById('flr-panel-'+t);
    if (p) p.style.display = (t===tab) ? '' : 'none';
  });
  if (tab === 'calendrier') _renderFlotteCalendrier();
}

function _renderFlotteResaTable() {
  var tbody = document.getElementById('flotte-resa-tbody');
  if (!tbody) return;
  var list = _flotteCache.reservations;
  if (list.length === 0) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-3);padding:2rem">Aucune réservation</td></tr>'; return; }
  var h = '';
  list.forEach(function(r) {
    h += '<tr>' +
      '<td>'+r.marque+' '+r.modele+'</td>' +
      '<td>'+r.demandeur+'</td>' +
      '<td>'+(r.date_debut||'').replace('T',' ')+'</td>' +
      '<td>'+(r.date_fin||'').replace('T',' ')+'</td>' +
      '<td>'+(r.destination||'—')+'</td>' +
      '<td>'+_flotteStatutBadge(r.statut)+'</td>' +
      '<td>';
    if (r.statut === 'En attente') {
      h += '<button class="btn btn-sm" style="color:var(--green)" onclick="flotteResaAction(\''+r.id+'\',\'Approuvée\')">&#10003;</button> ';
      h += '<button class="btn btn-sm" style="color:var(--red)" onclick="flotteResaAction(\''+r.id+'\',\'Refusée\')">&#10005;</button> ';
    }
    h += (canDelete() ? '<button class="btn btn-sm" onclick="deleteFlotteResa(\''+r.id+'\')" style="color:#e07070" title="Supprimer">&#10005;</button>' : '')+'</td></tr>';
  });
  tbody.innerHTML = h;
}

function _renderFlotteAttrTable() {
  var tbody = document.getElementById('flotte-attr-tbody');
  if (!tbody) return;
  var list = _flotteCache.attributions;
  if (list.length === 0) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-3);padding:2rem">Aucune attribution</td></tr>'; return; }
  var h = '';
  list.forEach(function(a) {
    h += '<tr>' +
      '<td>'+a.marque+' '+a.modele+'</td>' +
      '<td>'+a.type_attribution+'</td>' +
      '<td>'+a.collaborateur+'</td>' +
      '<td>'+(a.date_debut||'')+'</td>' +
      '<td>'+(a.date_fin||'—')+'</td>' +
      '<td>'+(parseInt(a.cles_remises)?'Oui':'Non')+'</td>' +
      '<td>'+_flotteStatutBadge(a.statut)+'</td>' +
      '<td>'+(canDelete() ? '<button class="btn btn-sm" onclick="deleteFlotteAttr(\''+a.id+'\')" style="color:#e07070" title="Supprimer">&#10005;</button>' : '')+'</td></tr>';
  });
  tbody.innerHTML = h;
}

function _renderFlotteCalendrier() {
  var el = document.getElementById('flotte-calendrier-content');
  if (!el) return;
  var all = _flotteCache.reservations.concat(_flotteCache.attributions);
  if (all.length === 0 && _flotteCache.vehicules.length === 0) { el.innerHTML = '<div style="text-align:center;color:var(--text-3);padding:3rem">Aucune donnée</div>'; return; }
  var h = '<div style="display:grid;grid-template-columns:200px 1fr;gap:0;border:1px solid var(--border);border-radius:4px;overflow:hidden">';
  var today = new Date(); var start = new Date(today.getFullYear(), today.getMonth(), 1); var end = new Date(today.getFullYear(), today.getMonth()+1, 0);
  var days = end.getDate();
  h += '<div style="background:var(--bg-2);padding:0.5rem;font-size:0.75rem;font-weight:600;border-bottom:1px solid var(--border)">Véhicule</div>';
  h += '<div style="display:grid;grid-template-columns:repeat('+days+',1fr);background:var(--bg-2);border-bottom:1px solid var(--border)">';
  for (var d=1; d<=days; d++) h += '<div style="text-align:center;font-size:0.65rem;padding:0.3rem;color:var(--text-3)">'+d+'</div>';
  h += '</div>';
  _flotteCache.vehicules.forEach(function(v) {
    var events = all.filter(function(e) { return e.vehicule_id === v.id; });
    h += '<div style="padding:0.4rem 0.5rem;font-size:0.78rem;border-bottom:1px solid var(--border)">'+v.marque+' '+v.modele+'</div>';
    h += '<div style="display:grid;grid-template-columns:repeat('+days+',1fr);border-bottom:1px solid var(--border);position:relative;min-height:28px">';
    for (var d2=1; d2<=days; d2++) {
      var dayStr = start.getFullYear()+'-'+String(start.getMonth()+1).padStart(2,'0')+'-'+String(d2).padStart(2,'0');
      var occupied = events.some(function(e) { var sd=(e.date_debut||'').substring(0,10); var ed=(e.date_fin||sd).substring(0,10); return dayStr>=sd && dayStr<=ed; });
      h += '<div style="background:'+(occupied?'rgba(200,169,110,0.3)':'transparent')+';border-right:1px solid var(--border)"></div>';
    }
    h += '</div>';
  });
  h += '</div>';
  el.innerHTML = h;
}

function saveFlotteReservation() {
  var body = {
    vehicule_id: document.getElementById('flresa-vehicule').value,
    demandeur: document.getElementById('flresa-demandeur').value,
    date_debut: document.getElementById('flresa-debut').value,
    date_fin: document.getElementById('flresa-fin').value,
    destination: document.getElementById('flresa-destination').value,
    motif: document.getElementById('flresa-motif').value
  };
  if (!body.vehicule_id || !body.demandeur || !body.date_debut || !body.date_fin) { showToast('Champs obligatoires manquants', 'error'); return; }
  apiFetch('api/flotte.php?action=reservations', { method: 'POST', body: body }).then(function() {
    showToast('Réservation créée', 'success'); closeModal('modal-flotte-reservation'); renderFlotteResaPage();
  }).catch(function(e) { showToast('Erreur: '+e.message, 'error'); });
}

function saveFlotteAttribution() {
  var body = {
    vehicule_id: document.getElementById('flattr-vehicule').value,
    type_attribution: document.getElementById('flattr-type').value,
    collaborateur: document.getElementById('flattr-collaborateur').value,
    date_debut: document.getElementById('flattr-debut').value,
    date_fin: document.getElementById('flattr-fin').value,
    cles_remises: document.getElementById('flattr-cles').value,
    accessoires: document.getElementById('flattr-accessoires').value,
    motif: document.getElementById('flattr-motif').value
  };
  if (!body.vehicule_id || !body.collaborateur || !body.date_debut) { showToast('Champs obligatoires manquants', 'error'); return; }
  apiFetch('api/flotte.php?action=attributions', { method: 'POST', body: body }).then(function() {
    showToast('Attribution créée', 'success'); closeModal('modal-flotte-attribution'); renderFlotteResaPage();
  }).catch(function(e) { showToast('Erreur: '+e.message, 'error'); });
}

function flotteResaAction(id, statut) {
  apiFetch('api/flotte.php?action=reservations&id='+id, { method: 'PUT', body: { statut: statut } }).then(function() {
    showToast('Réservation '+statut.toLowerCase(), 'success'); renderFlotteResaPage();
  });
}

function deleteFlotteResa(id) {
  if (!confirm('Supprimer cette réservation ?')) return;
  apiFetch('api/flotte.php?action=reservations&id='+id, { method: 'DELETE' }).then(function() {
    showToast('Supprimé', 'success'); renderFlotteResaPage();
  });
}

function deleteFlotteAttr(id) {
  if (!confirm('Supprimer cette attribution ?')) return;
  apiFetch('api/flotte.php?action=attributions&id='+id, { method: 'DELETE' }).then(function() {
    showToast('Supprimé', 'success'); renderFlotteResaPage();
  });
}


// ══════════════════════════════════════
//  KILOMÉTRAGE & CARBURANT
// ══════════════════════════════════════

function renderFlotteKmPage() {
  var vid = document.getElementById('flkm-vehicule-filter') ? document.getElementById('flkm-vehicule-filter').value : '';
  var qKm = vid ? ('api/flotte.php?action=kilometres&vehicule_id='+vid) : 'api/flotte.php?action=kilometres';
  var qCarb = vid ? ('api/flotte.php?action=carburant&vehicule_id='+vid) : 'api/flotte.php?action=carburant';
  Promise.all([
    _flotteLoadVehicules(),
    apiFetch(qKm).then(function(r) { _flotteCache.kilometres = (r&&r.data)?r.data:[]; }),
    apiFetch(qCarb).then(function(r) { _flotteCache.carburant = (r&&r.data)?r.data:[]; })
  ]).then(function() {
    var filterSel = document.getElementById('flkm-vehicule-filter');
    if (filterSel && filterSel.options.length <= 1) {
      _flotteCache.vehicules.forEach(function(v) {
        var o = document.createElement('option'); o.value = v.id; o.textContent = v.marque+' '+v.modele+' ('+v.immatriculation+')';
        filterSel.appendChild(o);
      });
      if (vid) filterSel.value = vid;
    }
    _flottePopulateVehiculeSelect('flkm-vehicule');
    _flottePopulateVehiculeSelect('flcarb-vehicule');
    _flotteBindCollabInputs();
    _renderFlotteKmTable();
    _renderFlotteCarbTable();
    _renderFlotteKmStats();
  });
}

function flotteKmTab(tab, btn) {
  document.querySelectorAll('.flkm-tab').forEach(function(b) { b.classList.remove('active'); b.style.color='var(--text-3)'; b.style.borderBottomColor='transparent'; });
  btn.classList.add('active'); btn.style.color='var(--text-2)'; btn.style.borderBottomColor='var(--accent)';
  ['km','carburant','stats'].forEach(function(t) {
    var p = document.getElementById('flkm-panel-'+t);
    if (p) p.style.display = (t===tab) ? '' : 'none';
  });
}

function _renderFlotteKmTable() {
  var tbody = document.getElementById('flotte-km-tbody');
  if (!tbody) return;
  var list = _flotteCache.kilometres;
  if (list.length === 0) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-3);padding:2rem">Aucun trajet</td></tr>'; return; }
  var h = '';
  list.forEach(function(k) {
    h += '<tr><td>'+k.date_releve+'</td><td>'+k.marque+' '+k.modele+'</td><td>'+(k.conducteur||'—')+'</td>' +
      '<td>'+_flotteFmtInt(k.km_debut)+'</td><td>'+_flotteFmtInt(k.km_fin)+'</td><td><strong>'+_flotteFmtInt(k.distance)+' km</strong></td>' +
      '<td>'+k.type_trajet+'</td><td>'+(k.destination||'—')+'</td>' +
      '<td>'+(canDelete() ? '<button class="btn btn-sm" onclick="deleteFlotteKm(\''+k.id+'\')" style="color:#e07070" title="Supprimer">&#10005;</button>' : '')+'</td></tr>';
  });
  tbody.innerHTML = h;
}

function _renderFlotteCarbTable() {
  var tbody = document.getElementById('flotte-carb-tbody');
  if (!tbody) return;
  var list = _flotteCache.carburant;
  if (list.length === 0) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-3);padding:2rem">Aucun plein</td></tr>'; return; }
  var h = '';
  list.forEach(function(c) {
    h += '<tr><td>'+c.date_plein+'</td><td>'+c.marque+' '+c.modele+'</td>' +
      '<td>'+_flotteFmtInt(c.km_compteur)+'</td><td>'+parseFloat(c.litres).toFixed(1)+' L</td>' +
      '<td>'+parseFloat(c.prix_litre).toFixed(3)+'</td><td><strong>'+_flotteFmt(c.montant_total)+' TND</strong></td>' +
      '<td>'+c.type_carburant+'</td><td>'+(c.station||'—')+'</td>' +
      '<td>'+(canDelete() ? '<button class="btn btn-sm" onclick="deleteFlotteCarb(\''+c.id+'\')" style="color:#e07070" title="Supprimer">&#10005;</button>' : '')+'</td></tr>';
  });
  tbody.innerHTML = h;
}

function _renderFlotteKmStats() {
  var el = document.getElementById('flotte-km-stats');
  if (!el) return;
  var vMap = {};
  _flotteCache.carburant.forEach(function(c) {
    if (!vMap[c.vehicule_id]) vMap[c.vehicule_id] = { nom: c.marque+' '+c.modele, litres: 0, montant: 0 };
    vMap[c.vehicule_id].litres += parseFloat(c.litres||0);
    vMap[c.vehicule_id].montant += parseFloat(c.montant_total||0);
  });
  var kmMap = {};
  _flotteCache.kilometres.forEach(function(k) {
    if (!kmMap[k.vehicule_id]) kmMap[k.vehicule_id] = { nom: k.marque+' '+k.modele, distance: 0 };
    kmMap[k.vehicule_id].distance += parseInt(k.distance||0);
  });
  var h = '<div class="card"><div class="card-title">Consommation par véhicule</div><div style="padding:0.5rem 1rem">';
  var totalLitres = 0, totalMontant = 0;
  Object.keys(vMap).forEach(function(vid) {
    var v = vMap[vid]; totalLitres += v.litres; totalMontant += v.montant;
    var km = kmMap[vid] ? kmMap[vid].distance : 0;
    var conso = km > 0 ? ((v.litres / km) * 100).toFixed(1) : '—';
    h += '<div style="display:flex;justify-content:space-between;padding:0.3rem 0;border-bottom:1px solid var(--border);font-size:0.85rem">' +
      '<span>'+v.nom+'</span><span>'+v.litres.toFixed(1)+' L &middot; '+_flotteFmt(v.montant)+' TND &middot; '+conso+' L/100km</span></div>';
  });
  h += '<div style="display:flex;justify-content:space-between;padding:0.5rem 0;font-weight:600;font-size:0.85rem"><span>Total</span><span>'+totalLitres.toFixed(1)+' L &middot; '+_flotteFmt(totalMontant)+' TND</span></div>';
  h += '</div></div>';

  h += '<div class="card"><div class="card-title">Distance par type de trajet</div><div style="padding:0.5rem 1rem">';
  var typeMap = {};
  _flotteCache.kilometres.forEach(function(k) {
    var t = k.type_trajet || 'Autre';
    typeMap[t] = (typeMap[t]||0) + parseInt(k.distance||0);
  });
  Object.keys(typeMap).forEach(function(t) {
    h += '<div style="display:flex;justify-content:space-between;padding:0.3rem 0;border-bottom:1px solid var(--border);font-size:0.85rem">' +
      '<span>'+t+'</span><span><strong>'+_flotteFmtInt(typeMap[t])+' km</strong></span></div>';
  });
  h += '</div></div>';
  el.innerHTML = h;
}

function saveFlotteKm() {
  var body = {
    vehicule_id: document.getElementById('flkm-vehicule').value,
    date_releve: document.getElementById('flkm-date').value,
    km_debut: document.getElementById('flkm-debut').value,
    km_fin: document.getElementById('flkm-fin').value,
    type_trajet: document.getElementById('flkm-type').value,
    conducteur: document.getElementById('flkm-conducteur').value,
    destination: document.getElementById('flkm-destination').value,
    notes: document.getElementById('flkm-notes').value
  };
  if (!body.vehicule_id || !body.date_releve || !body.km_debut || !body.km_fin) { showToast('Champs obligatoires manquants', 'error'); return; }
  apiFetch('api/flotte.php?action=kilometres', { method: 'POST', body: body }).then(function() {
    showToast('Trajet enregistré', 'success'); closeModal('modal-flotte-km'); renderFlotteKmPage();
  }).catch(function(e) { showToast('Erreur: '+e.message, 'error'); });
}

function saveFlotteCarburant() {
  var body = {
    vehicule_id: document.getElementById('flcarb-vehicule').value,
    date_plein: document.getElementById('flcarb-date').value,
    km_compteur: document.getElementById('flcarb-km').value,
    litres: document.getElementById('flcarb-litres').value,
    prix_litre: document.getElementById('flcarb-prix').value,
    montant_total: document.getElementById('flcarb-montant').value,
    type_carburant: document.getElementById('flcarb-type').value,
    station: document.getElementById('flcarb-station').value,
    carte_carburant: document.getElementById('flcarb-carte').value,
    plein_complet: document.getElementById('flcarb-plein').value
  };
  if (!body.vehicule_id || !body.date_plein) { showToast('Champs obligatoires manquants', 'error'); return; }
  apiFetch('api/flotte.php?action=carburant', { method: 'POST', body: body }).then(function() {
    showToast('Plein enregistré', 'success'); closeModal('modal-flotte-carburant'); renderFlotteKmPage();
  }).catch(function(e) { showToast('Erreur: '+e.message, 'error'); });
}

function deleteFlotteKm(id) {
  if (!confirm('Supprimer ce trajet ?')) return;
  apiFetch('api/flotte.php?action=kilometres&id='+id, { method: 'DELETE' }).then(function() {
    showToast('Supprimé', 'success'); renderFlotteKmPage();
  });
}

function deleteFlotteCarb(id) {
  if (!confirm('Supprimer ce plein ?')) return;
  apiFetch('api/flotte.php?action=carburant&id='+id, { method: 'DELETE' }).then(function() {
    showToast('Supprimé', 'success'); renderFlotteKmPage();
  });
}


// ══════════════════════════════════════
//  ENTRETIEN & SINISTRES
// ══════════════════════════════════════

function renderFlotteEntretienPage() {
  var vid = document.getElementById('flent-vehicule-filter') ? document.getElementById('flent-vehicule-filter').value : '';
  var qEnt = vid ? ('api/flotte.php?action=entretien&vehicule_id='+vid) : 'api/flotte.php?action=entretien';
  var qSin = vid ? ('api/flotte.php?action=sinistres&vehicule_id='+vid) : 'api/flotte.php?action=sinistres';
  Promise.all([
    _flotteLoadVehicules(),
    apiFetch(qEnt).then(function(r) { _flotteCache.entretien = (r&&r.data)?r.data:[]; }),
    apiFetch(qSin).then(function(r) { _flotteCache.sinistres = (r&&r.data)?r.data:[]; })
  ]).then(function() {
    var filterSel = document.getElementById('flent-vehicule-filter');
    if (filterSel && filterSel.options.length <= 1) {
      _flotteCache.vehicules.forEach(function(v) {
        var o = document.createElement('option'); o.value = v.id; o.textContent = v.marque+' '+v.modele+' ('+v.immatriculation+')';
        filterSel.appendChild(o);
      });
      if (vid) filterSel.value = vid;
    }
    _flottePopulateVehiculeSelect('flent-vehicule');
    _flottePopulateVehiculeSelect('flsin-vehicule');
    _flotteBindCollabInputs();
    _renderFlotteEntretienTable();
    _renderFlotteSinistresTable();
  });
}

function flotteEntTab(tab, btn) {
  document.querySelectorAll('.flent-tab').forEach(function(b) { b.classList.remove('active'); b.style.color='var(--text-3)'; b.style.borderBottomColor='transparent'; });
  btn.classList.add('active'); btn.style.color='var(--text-2)'; btn.style.borderBottomColor='var(--accent)';
  ['entretien','sinistres'].forEach(function(t) {
    var p = document.getElementById('flent-panel-'+t);
    if (p) p.style.display = (t===tab) ? '' : 'none';
  });
}

function flotteEntFilter(statut, btn) {
  _flotteEntFilter = statut;
  document.querySelectorAll('.flent-filter').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  _renderFlotteEntretienTable();
}

function _renderFlotteEntretienTable() {
  var tbody = document.getElementById('flotte-entretien-tbody');
  if (!tbody) return;
  var list = _flotteCache.entretien;
  if (_flotteEntFilter) list = list.filter(function(e) { return e.statut === _flotteEntFilter; });
  if (list.length === 0) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-3);padding:2rem">Aucun entretien</td></tr>'; return; }
  var h = '';
  list.forEach(function(e) {
    h += '<tr><td>'+(e.date_realisee||e.date_prevue||'—')+'</td><td>'+e.marque+' '+e.modele+'</td>' +
      '<td>'+e.type_entretien+'</td><td>'+e.titre+'</td><td>'+(e.prestataire||'—')+'</td>' +
      '<td>'+_flotteFmt(e.montant)+' TND</td><td>'+_flotteStatutBadge(e.statut)+'</td>' +
      '<td><button class="btn btn-sm" onclick="editFlotteEntretien(\''+e.id+'\')">&#9998;</button> ' +
      (canDelete() ? '<button class="btn btn-sm" onclick="deleteFlotteEntretien(\''+e.id+'\')" style="color:#e07070" title="Supprimer">&#10005;</button>' : '')+'</td></tr>';
  });
  tbody.innerHTML = h;
}

function _renderFlotteSinistresTable() {
  var tbody = document.getElementById('flotte-sinistres-tbody');
  if (!tbody) return;
  var list = _flotteCache.sinistres;
  if (list.length === 0) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-3);padding:2rem">Aucun sinistre</td></tr>'; return; }
  var h = '';
  list.forEach(function(s) {
    h += '<tr><td>'+s.date_sinistre+'</td><td>'+s.marque+' '+s.modele+'</td>' +
      '<td>'+s.type_sinistre+'</td><td>'+(s.lieu||'—')+'</td><td>'+(s.conducteur||'—')+'</td>' +
      '<td>'+_flotteFmt(s.montant_degats)+' TND</td><td>'+_flotteStatutBadge(s.statut)+'</td>' +
      '<td>'+(canDelete() ? '<button class="btn btn-sm" onclick="deleteFlotteSinistre(\''+s.id+'\')" style="color:#e07070" title="Supprimer">&#10005;</button>' : '')+'</td></tr>';
  });
  tbody.innerHTML = h;
}

function saveFlotteEntretien() {
  var id = document.getElementById('flent-edit-id').value;
  var body = {
    vehicule_id: document.getElementById('flent-vehicule').value,
    type_entretien: document.getElementById('flent-type').value,
    categorie: document.getElementById('flent-categorie').value,
    titre: document.getElementById('flent-titre').value,
    description: document.getElementById('flent-description').value,
    date_prevue: document.getElementById('flent-date-prevue').value,
    date_realisee: document.getElementById('flent-date-realisee').value,
    km_prevu: document.getElementById('flent-km-prevu').value,
    km_realise: document.getElementById('flent-km-realise').value,
    prestataire: document.getElementById('flent-prestataire').value,
    montant: document.getElementById('flent-montant').value || 0,
    statut: document.getElementById('flent-statut').value,
    prochaine_echeance_km: document.getElementById('flent-proch-km').value
  };
  if (!body.vehicule_id || !body.titre) { showToast('Véhicule et titre obligatoires', 'error'); return; }
  var url = id ? ('api/flotte.php?action=entretien&id='+id) : 'api/flotte.php?action=entretien';
  apiFetch(url, { method: id ? 'PUT' : 'POST', body: body }).then(function() {
    showToast('Entretien enregistré', 'success'); closeModal('modal-flotte-entretien'); renderFlotteEntretienPage();
  }).catch(function(e) { showToast('Erreur: '+e.message, 'error'); });
}

function editFlotteEntretien(id) {
  var e = null; _flotteCache.entretien.forEach(function(x) { if (x.id === id) e = x; });
  if (!e) return;
  document.getElementById('flent-edit-id').value = e.id;
  _flottePopulateVehiculeSelect('flent-vehicule');
  setTimeout(function() { document.getElementById('flent-vehicule').value = e.vehicule_id; }, 50);
  document.getElementById('flent-type').value = e.type_entretien || 'Préventif';
  document.getElementById('flent-categorie').value = e.categorie || 'Vidange';
  document.getElementById('flent-titre').value = e.titre || '';
  document.getElementById('flent-description').value = e.description || '';
  document.getElementById('flent-date-prevue').value = (e.date_prevue||'').substring(0,10);
  document.getElementById('flent-date-realisee').value = (e.date_realisee||'').substring(0,10);
  document.getElementById('flent-km-prevu').value = e.km_prevu || '';
  document.getElementById('flent-km-realise').value = e.km_realise || '';
  document.getElementById('flent-prestataire').value = e.prestataire || '';
  document.getElementById('flent-montant').value = e.montant || '';
  document.getElementById('flent-statut').value = e.statut || 'Planifié';
  document.getElementById('flent-proch-km').value = e.prochaine_echeance_km || '';
  document.getElementById('modal-flent-title').textContent = 'Modifier entretien';
  openModal('modal-flotte-entretien');
}

function deleteFlotteEntretien(id) {
  if (!confirm('Supprimer cet entretien ?')) return;
  apiFetch('api/flotte.php?action=entretien&id='+id, { method: 'DELETE' }).then(function() {
    showToast('Supprimé', 'success'); renderFlotteEntretienPage();
  });
}

function saveFlotteSinistre() {
  var id = document.getElementById('flsin-edit-id').value;
  var body = {
    vehicule_id: document.getElementById('flsin-vehicule').value,
    date_sinistre: document.getElementById('flsin-date').value,
    type_sinistre: document.getElementById('flsin-type').value,
    lieu: document.getElementById('flsin-lieu').value,
    conducteur: document.getElementById('flsin-conducteur').value,
    tiers_implique: document.getElementById('flsin-tiers').value,
    constat_rempli: document.getElementById('flsin-constat').value,
    numero_dossier: document.getElementById('flsin-dossier').value,
    montant_degats: document.getElementById('flsin-degats').value || 0,
    montant_franchise: document.getElementById('flsin-franchise').value || 0,
    statut: document.getElementById('flsin-statut').value,
    description: document.getElementById('flsin-description').value
  };
  if (!body.vehicule_id || !body.date_sinistre) { showToast('Véhicule et date obligatoires', 'error'); return; }
  var url = id ? ('api/flotte.php?action=sinistres&id='+id) : 'api/flotte.php?action=sinistres';
  apiFetch(url, { method: id ? 'PUT' : 'POST', body: body }).then(function() {
    showToast('Sinistre enregistré', 'success'); closeModal('modal-flotte-sinistre'); renderFlotteEntretienPage();
  }).catch(function(e) { showToast('Erreur: '+e.message, 'error'); });
}

function deleteFlotteSinistre(id) {
  if (!confirm('Supprimer ce sinistre ?')) return;
  apiFetch('api/flotte.php?action=sinistres&id='+id, { method: 'DELETE' }).then(function() {
    showToast('Supprimé', 'success'); renderFlotteEntretienPage();
  });
}


// ══════════════════════════════════════
//  COÛTS & TCO
// ══════════════════════════════════════

function renderFlotteCoutsPage() {
  Promise.all([
    _flotteLoadVehicules(),
    apiFetch('api/flotte.php?action=tco').then(function(r) { _flotteCache.tco = (r&&r.data)?r.data:[]; }),
    apiFetch('api/flotte.php?action=couts').then(function(r) { _flotteCache.couts = (r&&r.data)?r.data:[]; })
  ]).then(function() {
    _flottePopulateVehiculeSelect('flcout-vehicule');
    _renderFlotteTcoTable();
    _renderFlotteCoutsTable();
  });
}

function flotteCoutTab(tab, btn) {
  document.querySelectorAll('.fltco-tab').forEach(function(b) { b.classList.remove('active'); b.style.color='var(--text-3)'; b.style.borderBottomColor='transparent'; });
  btn.classList.add('active'); btn.style.color='var(--text-2)'; btn.style.borderBottomColor='var(--accent)';
  ['tco','couts'].forEach(function(t) {
    var p = document.getElementById('fltco-panel-'+t);
    if (p) p.style.display = (t===tab) ? '' : 'none';
  });
}

function _renderFlotteTcoTable() {
  var tbody = document.getElementById('flotte-tco-tbody');
  if (!tbody) return;
  var list = _flotteCache.tco;
  if (list.length === 0) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-3);padding:2rem">Aucune donnée</td></tr>'; return; }
  var h = '';
  var totals = { achat: 0, carb: 0, ent: 0, ass: 0, autres: 0, tco: 0 };
  list.forEach(function(t) {
    var autres = parseFloat(t.total_couts||0) + parseFloat(t.total_sinistres||0);
    totals.achat += parseFloat(t.valeur_achat||0); totals.carb += parseFloat(t.total_carburant||0);
    totals.ent += parseFloat(t.total_entretien||0); totals.ass += parseFloat(t.total_assurance||0);
    totals.autres += autres; totals.tco += parseFloat(t.tco||0);
    h += '<tr><td style="font-weight:600">'+t.marque+' '+t.modele+' <span style="color:var(--text-3)">('+t.immatriculation+')</span></td>' +
      '<td>'+_flotteFmt(t.valeur_achat)+'</td><td>'+_flotteFmt(t.total_carburant)+'</td>' +
      '<td>'+_flotteFmt(t.total_entretien)+'</td><td>'+_flotteFmt(t.total_assurance)+'</td>' +
      '<td>'+_flotteFmt(autres)+'</td><td style="font-weight:700;color:var(--accent)">'+_flotteFmt(t.tco)+' TND</td>' +
      '<td>'+t.cout_km+' TND/km</td></tr>';
  });
  h += '<tr style="font-weight:700;border-top:2px solid var(--accent)"><td>TOTAL</td>' +
    '<td>'+_flotteFmt(totals.achat)+'</td><td>'+_flotteFmt(totals.carb)+'</td>' +
    '<td>'+_flotteFmt(totals.ent)+'</td><td>'+_flotteFmt(totals.ass)+'</td>' +
    '<td>'+_flotteFmt(totals.autres)+'</td><td style="color:var(--accent)">'+_flotteFmt(totals.tco)+' TND</td><td></td></tr>';
  tbody.innerHTML = h;
}

function _renderFlotteCoutsTable() {
  var tbody = document.getElementById('flotte-couts-tbody');
  if (!tbody) return;
  var list = _flotteCache.couts;
  if (list.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:2rem">Aucun coût</td></tr>'; return; }
  var h = '';
  list.forEach(function(c) {
    h += '<tr><td>'+c.date_cout+'</td><td>'+c.marque+' '+c.modele+'</td><td>'+c.categorie+'</td>' +
      '<td>'+c.libelle+'</td><td>'+_flotteFmt(c.montant)+' TND</td>' +
      '<td>'+(canDelete() ? '<button class="btn btn-sm" onclick="deleteFlotteCout(\''+c.id+'\')" style="color:#e07070" title="Supprimer">&#10005;</button>' : '')+'</td></tr>';
  });
  tbody.innerHTML = h;
}

function saveFlotteCout() {
  var body = {
    vehicule_id: document.getElementById('flcout-vehicule').value,
    categorie: document.getElementById('flcout-categorie').value,
    libelle: document.getElementById('flcout-libelle').value,
    date_cout: document.getElementById('flcout-date').value,
    montant: document.getElementById('flcout-montant').value || 0,
    notes: document.getElementById('flcout-notes').value
  };
  if (!body.vehicule_id || !body.libelle || !body.date_cout) { showToast('Champs obligatoires manquants', 'error'); return; }
  apiFetch('api/flotte.php?action=couts', { method: 'POST', body: body }).then(function() {
    showToast('Coût enregistré', 'success'); closeModal('modal-flotte-cout'); renderFlotteCoutsPage();
  }).catch(function(e) { showToast('Erreur: '+e.message, 'error'); });
}

function deleteFlotteCout(id) {
  if (!confirm('Supprimer ce coût ?')) return;
  apiFetch('api/flotte.php?action=couts&id='+id, { method: 'DELETE' }).then(function() {
    showToast('Supprimé', 'success'); renderFlotteCoutsPage();
  });
}


// ══════════════════════════════════════
//  CONFORMITÉ & ASSURANCES
// ══════════════════════════════════════

function renderFlotteConformitePage() {
  Promise.all([
    _flotteLoadVehicules(),
    apiFetch('api/flotte.php?action=assurances').then(function(r) { _flotteCache.assurances = (r&&r.data)?r.data:[]; }),
    apiFetch('api/flotte.php?action=controles').then(function(r) { _flotteCache.controles = (r&&r.data)?r.data:[]; }),
    apiFetch('api/flotte.php?action=permis').then(function(r) { _flotteCache.permis = (r&&r.data)?r.data:[]; })
  ]).then(function() {
    _flottePopulateVehiculeSelect('flass-vehicule');
    _flottePopulateVehiculeSelect('flctrl-vehicule');
    _flotteBindCollabInputs();
    _renderFlotteAssurancesTable();
    _renderFlotteControlesTable();
    _renderFlottePermisTable();
  });
}

function flotteConfTab(tab, btn) {
  document.querySelectorAll('.flconf-tab').forEach(function(b) { b.classList.remove('active'); b.style.color='var(--text-3)'; b.style.borderBottomColor='transparent'; });
  btn.classList.add('active'); btn.style.color='var(--text-2)'; btn.style.borderBottomColor='var(--accent)';
  ['assurances','controles','permis'].forEach(function(t) {
    var p = document.getElementById('flconf-panel-'+t);
    if (p) p.style.display = (t===tab) ? '' : 'none';
  });
}

function _renderFlotteAssurancesTable() {
  var tbody = document.getElementById('flotte-assurances-tbody');
  if (!tbody) return;
  var list = _flotteCache.assurances;
  if (list.length === 0) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-3);padding:2rem">Aucune assurance</td></tr>'; return; }
  var today = new Date().toISOString().substring(0,10);
  var h = '';
  list.forEach(function(a) {
    var expired = a.date_fin && a.date_fin <= today;
    var style = expired ? ' style="background:rgba(224,123,114,0.1)"' : '';
    h += '<tr'+style+'><td>'+a.marque+' '+a.modele+'</td><td>'+a.assureur+'</td><td>'+(a.numero_police||'—')+'</td>' +
      '<td>'+a.type_couverture+'</td><td>'+a.date_debut+'</td><td'+(expired?' style="color:var(--red);font-weight:600"':'')+'>'+a.date_fin+'</td>' +
      '<td>'+_flotteFmt(a.prime_annuelle)+' TND</td><td>'+_flotteStatutBadge(a.statut)+'</td>' +
      '<td>'+(canDelete() ? '<button class="btn btn-sm" onclick="deleteFlotteAssurance(\''+a.id+'\')" style="color:#e07070" title="Supprimer">&#10005;</button>' : '')+'</td></tr>';
  });
  tbody.innerHTML = h;
}

function _renderFlotteControlesTable() {
  var tbody = document.getElementById('flotte-controles-tbody');
  if (!tbody) return;
  var list = _flotteCache.controles;
  if (list.length === 0) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-3);padding:2rem">Aucun contrôle</td></tr>'; return; }
  var today = new Date().toISOString().substring(0,10);
  var h = '';
  list.forEach(function(c) {
    var expired = c.date_expiration && c.date_expiration <= today;
    var style = expired ? ' style="background:rgba(224,123,114,0.1)"' : '';
    h += '<tr'+style+'><td>'+c.marque+' '+c.modele+'</td><td>'+c.type_controle+'</td>' +
      '<td>'+c.date_controle+'</td><td'+(expired?' style="color:var(--red);font-weight:600"':'')+'>'+c.date_expiration+'</td>' +
      '<td>'+_flotteStatutBadge(c.resultat)+'</td><td>'+(c.organisme||'—')+'</td><td>'+_flotteFmt(c.montant)+' TND</td>' +
      '<td>'+(canDelete() ? '<button class="btn btn-sm" onclick="deleteFlotteControle(\''+c.id+'\')" style="color:#e07070" title="Supprimer">&#10005;</button>' : '')+'</td></tr>';
  });
  tbody.innerHTML = h;
}

function _renderFlottePermisTable() {
  var tbody = document.getElementById('flotte-permis-tbody');
  if (!tbody) return;
  var list = _flotteCache.permis;
  if (list.length === 0) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-3);padding:2rem">Aucun permis</td></tr>'; return; }
  var today = new Date().toISOString().substring(0,10);
  var h = '';
  list.forEach(function(p) {
    var expired = p.date_expiration && p.date_expiration <= today;
    var style = expired ? ' style="background:rgba(224,123,114,0.1)"' : '';
    h += '<tr'+style+'><td style="font-weight:600">'+p.collaborateur+'</td><td>'+(p.numero_permis||'—')+'</td>' +
      '<td>'+p.categorie+'</td><td>'+(p.date_delivrance||'—')+'</td>' +
      '<td'+(expired?' style="color:var(--red);font-weight:600"':'')+'>'+((p.date_expiration)||'—')+'</td>' +
      '<td>'+_flotteStatutBadge(p.statut)+'</td>' +
      '<td>'+(canDelete() ? '<button class="btn btn-sm" onclick="deleteFlottePermis(\''+p.id+'\')" style="color:#e07070" title="Supprimer">&#10005;</button>' : '')+'</td></tr>';
  });
  tbody.innerHTML = h;
}

function saveFlotteAssurance() {
  var id = document.getElementById('flass-edit-id').value;
  var body = {
    vehicule_id: document.getElementById('flass-vehicule').value,
    assureur: document.getElementById('flass-assureur').value,
    numero_police: document.getElementById('flass-police').value,
    type_couverture: document.getElementById('flass-couverture').value,
    date_debut: document.getElementById('flass-debut').value,
    date_fin: document.getElementById('flass-fin').value,
    prime_annuelle: document.getElementById('flass-prime').value || 0,
    franchise: document.getElementById('flass-franchise').value || 0,
    notes: document.getElementById('flass-notes').value
  };
  if (!body.vehicule_id || !body.assureur || !body.date_debut || !body.date_fin) { showToast('Champs obligatoires manquants', 'error'); return; }
  var url = id ? ('api/flotte.php?action=assurances&id='+id) : 'api/flotte.php?action=assurances';
  apiFetch(url, { method: id ? 'PUT' : 'POST', body: body }).then(function() {
    showToast('Assurance enregistrée', 'success'); closeModal('modal-flotte-assurance'); renderFlotteConformitePage();
  }).catch(function(e) { showToast('Erreur: '+e.message, 'error'); });
}

function saveFlotteControle() {
  var body = {
    vehicule_id: document.getElementById('flctrl-vehicule').value,
    type_controle: document.getElementById('flctrl-type').value,
    date_controle: document.getElementById('flctrl-date').value,
    date_expiration: document.getElementById('flctrl-expiration').value,
    resultat: document.getElementById('flctrl-resultat').value,
    organisme: document.getElementById('flctrl-organisme').value,
    montant: document.getElementById('flctrl-montant').value || 0,
    observations: document.getElementById('flctrl-observations').value
  };
  if (!body.vehicule_id || !body.date_controle || !body.date_expiration) { showToast('Champs obligatoires manquants', 'error'); return; }
  apiFetch('api/flotte.php?action=controles', { method: 'POST', body: body }).then(function() {
    showToast('Contrôle enregistré', 'success'); closeModal('modal-flotte-controle'); renderFlotteConformitePage();
  }).catch(function(e) { showToast('Erreur: '+e.message, 'error'); });
}

function saveFlottePermis() {
  var id = document.getElementById('flperm-edit-id').value;
  var body = {
    collaborateur: document.getElementById('flperm-collaborateur').value,
    numero_permis: document.getElementById('flperm-numero').value,
    categorie: document.getElementById('flperm-categorie').value,
    date_delivrance: document.getElementById('flperm-delivrance').value,
    date_expiration: document.getElementById('flperm-expiration').value,
    autorite_delivrance: document.getElementById('flperm-autorite').value,
    notes: document.getElementById('flperm-notes').value
  };
  if (!body.collaborateur) { showToast('Collaborateur obligatoire', 'error'); return; }
  var url = id ? ('api/flotte.php?action=permis&id='+id) : 'api/flotte.php?action=permis';
  apiFetch(url, { method: id ? 'PUT' : 'POST', body: body }).then(function() {
    showToast('Permis enregistré', 'success'); closeModal('modal-flotte-permis'); renderFlotteConformitePage();
  }).catch(function(e) { showToast('Erreur: '+e.message, 'error'); });
}

function deleteFlotteAssurance(id) {
  if (!confirm('Supprimer cette assurance ?')) return;
  apiFetch('api/flotte.php?action=assurances&id='+id, { method: 'DELETE' }).then(function() {
    showToast('Supprimé', 'success'); renderFlotteConformitePage();
  });
}

function deleteFlotteControle(id) {
  if (!confirm('Supprimer ce contrôle ?')) return;
  apiFetch('api/flotte.php?action=controles&id='+id, { method: 'DELETE' }).then(function() {
    showToast('Supprimé', 'success'); renderFlotteConformitePage();
  });
}

function deleteFlottePermis(id) {
  if (!confirm('Supprimer ce permis ?')) return;
  apiFetch('api/flotte.php?action=permis&id='+id, { method: 'DELETE' }).then(function() {
    showToast('Supprimé', 'success'); renderFlotteConformitePage();
  });
}
