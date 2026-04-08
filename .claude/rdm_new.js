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
  document.querySelectorAll('.rdm-tab-panel').forEach(function(p) {
    p.classList.toggle('active', p.id === 'rdm-panel-' + tab);
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
