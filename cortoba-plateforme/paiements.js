// ============================================================
//  CORTOBA ATELIER — Module Paiements & Honoraires (JS)
//  Suivi honoraires, créances, relances, trésorerie
// ============================================================

var _honProjetId = '';
var _honPhases = [];
var _honEcheancier = [];

// ── HONORAIRES ──

function renderHonorairesPage() {
  var sel = document.getElementById('hon-projet-sel');
  if (!sel) return;
  var projets = getProjets ? getProjets() : [];
  var opts = '<option value="">— Tous les projets (vue globale) —</option>';
  projets.forEach(function(p) {
    var selected = (p.id === _honProjetId) ? ' selected' : '';
    opts += '<option value="' + p.id + '"' + selected + '>' + (p.code ? p.code + ' — ' : '') + (p.nom || '') + '</option>';
  });
  sel.innerHTML = opts;
  if (_honProjetId) { loadHonorairesProjet(); } else { loadHonorairesDashboard(); }
}

function loadHonorairesDashboard() {
  document.getElementById('hon-projet-wrap').style.display = 'none';
  document.getElementById('hon-dashboard-wrap').style.display = '';
  document.getElementById('hon-init-btn').style.display = 'none';
  apiFetch('api/honoraires.php?action=dashboard').then(function(r) {
    var d = r.data;
    document.getElementById('hon-global-kpis').innerHTML =
      '<div class="kpi-card"><div class="kpi-label">Total prévu</div><div class="kpi-val">' + fmtMontant(d.totaux.prevu) + '</div></div>' +
      '<div class="kpi-card"><div class="kpi-label">Total engagé</div><div class="kpi-val">' + fmtMontant(d.totaux.engage) + '</div></div>' +
      '<div class="kpi-card"><div class="kpi-label">Total facturé</div><div class="kpi-val">' + fmtMontant(d.totaux.facture) + '</div></div>' +
      '<div class="kpi-card"><div class="kpi-label">Total encaissé</div><div class="kpi-val">' + fmtMontant(d.totaux.encaisse) + '</div></div>';
    var tbody = document.getElementById('hon-global-tbody');
    if (!d.projets || d.projets.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-3)">Aucun projet avec honoraires initialisés</td></tr>';
      return;
    }
    var html = '';
    d.projets.forEach(function(p) {
      var dot = '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + _alertColor(p.alerte_budget) + '"></span>';
      html += '<tr><td><a href="#" onclick="document.getElementById(\'hon-projet-sel\').value=\'' + p.id + '\';loadHonorairesProjet();return false">' + (p.code || '') + ' ' + (p.nom || '') + '</a></td>' +
        '<td style="text-align:right">' + fmtMontant(p.honoraires_prevus || 0) + '</td>' +
        '<td style="text-align:right">' + fmtMontant(p.honoraires_engages || 0) + '</td>' +
        '<td style="text-align:right">' + fmtMontant(p.honoraires_factures || 0) + '</td>' +
        '<td style="text-align:right">' + fmtMontant(p.honoraires_encaisses || 0) + '</td>' +
        '<td style="text-align:center">' + dot + '</td></tr>';
    });
    tbody.innerHTML = html;
  }).catch(function(e) { console.error('[honoraires] dashboard error', e); });
}

function loadHonorairesProjet() {
  var sel = document.getElementById('hon-projet-sel');
  _honProjetId = sel ? sel.value : '';
  if (!_honProjetId) { loadHonorairesDashboard(); return; }
  document.getElementById('hon-dashboard-wrap').style.display = 'none';
  document.getElementById('hon-projet-wrap').style.display = '';
  document.getElementById('hon-init-btn').style.display = '';
  apiFetch('api/honoraires.php?action=projet&projet_id=' + _honProjetId).then(function(r) {
    var d = r.data; _honPhases = d.phases || [];
    var p = d.projet;
    document.getElementById('hon-kpi-prevu').textContent = fmtMontant(p.honoraires_prevus || 0);
    document.getElementById('hon-kpi-engage').textContent = fmtMontant(p.honoraires_engages || 0);
    document.getElementById('hon-kpi-facture').textContent = fmtMontant(p.honoraires_factures || 0);
    document.getElementById('hon-kpi-encaisse').textContent = fmtMontant(p.honoraires_encaisses || 0);
    renderHonHealthIndicator(p.alerte_budget);
    renderHonBreakdown(_honPhases);
    loadValeurAcquise();
    loadEcheancier();
    document.getElementById('hon-init-btn').style.display = _honPhases.length === 0 ? '' : 'none';
  }).catch(function(e) { showToast('Erreur: ' + e.message, 'var(--red)'); });
}

function _alertColor(level) { return ({green:'#22c55e',yellow:'#eab308',orange:'#f97316',red:'#ef4444'})[level] || '#22c55e'; }

function renderHonHealthIndicator(level) {
  var el = document.getElementById('hon-health');
  if (!el) return;
  if (!level) { el.innerHTML = ''; return; }
  var labels = {green:'Sain',yellow:'Attention',orange:'Alerte',red:'Critique'};
  var c = _alertColor(level);
  el.innerHTML = '<div style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.5rem 1rem;border-radius:6px;background:'+c+'22;border:1px solid '+c+'55;font-size:0.85rem;font-weight:500;color:'+c+'"><span style="width:12px;height:12px;border-radius:50%;background:'+c+'"></span> Santé financière : '+(labels[level]||level)+'</div>';
}

function renderHonBreakdown(phases) {
  var tbody = document.getElementById('hon-breakdown-tbody'), tfoot = document.getElementById('hon-breakdown-tfoot');
  if (!tbody) return;
  if (!phases || phases.length === 0) { tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-3)">Aucune phase. Cliquez "Initialiser honoraires".</td></tr>'; if(tfoot) tfoot.innerHTML=''; return; }
  var html='', totP=0, totE=0, totF=0, totEnc=0;
  phases.forEach(function(ph) {
    var prevu=parseFloat(ph.montant_prevu)||0, engage=parseFloat(ph.montant_engage)||0, facture=parseFloat(ph.montant_facture)||0, encaisse=parseFloat(ph.montant_encaisse)||0;
    var progP=parseInt(ph.progression_prevue)||0, progR=parseInt(ph.progression_reelle)||0, ecart=progR-progP;
    totP+=prevu; totE+=engage; totF+=facture; totEnc+=encaisse;
    html += '<tr><td><strong>'+(ph.mission_label||ph.mission_phase)+'</strong></td><td style="font-size:0.78rem;color:var(--text-3)">'+(ph.mode||'')+'</td>' +
      '<td style="text-align:right">'+fmtMontant(prevu)+'</td><td style="text-align:right">'+fmtMontant(engage)+'</td>' +
      '<td style="text-align:right">'+fmtMontant(facture)+'</td><td style="text-align:right">'+fmtMontant(encaisse)+'</td>' +
      '<td>'+_progressBar(progP)+'</td><td>'+_progressBar(progR)+'</td>' +
      '<td style="text-align:center;color:'+(ecart>=0?'#22c55e':'#ef4444')+';font-weight:600">'+(ecart>=0?'+':'')+ecart+'%</td>' +
      '<td><button class="btn btn-sm" onclick="openEditHonPhase('+ph.id+')">&#9998;</button></td></tr>';
  });
  tbody.innerHTML = html;
  if(tfoot) tfoot.innerHTML = '<tr style="font-weight:600;border-top:2px solid var(--border)"><td>Total</td><td></td><td style="text-align:right">'+fmtMontant(totP)+'</td><td style="text-align:right">'+fmtMontant(totE)+'</td><td style="text-align:right">'+fmtMontant(totF)+'</td><td style="text-align:right">'+fmtMontant(totEnc)+'</td><td colspan="4"></td></tr>';
}

function _progressBar(pct) {
  var c = pct>=80?'#22c55e':(pct>=40?'#eab308':'#64748b');
  return '<div style="display:flex;align-items:center;gap:0.4rem"><div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:'+c+';border-radius:3px"></div></div><span style="font-size:0.75rem;min-width:28px">'+pct+'%</span></div>';
}

function loadValeurAcquise() {
  if (!_honProjetId) return;
  apiFetch('api/honoraires.php?action=valeur_acquise&projet_id='+_honProjetId).then(function(r) {
    var t=r.data.totaux, i=r.data.indicateurs;
    document.getElementById('ev-bac').textContent=fmtMontant(t.budget);
    document.getElementById('ev-pv').textContent=fmtMontant(t.valeur_planifiee);
    document.getElementById('ev-ev').textContent=fmtMontant(t.valeur_acquise);
    document.getElementById('ev-ac').textContent=fmtMontant(t.cout_reel);
    document.getElementById('ev-eac').textContent=fmtMontant(i.eac);
    var spiEl=document.getElementById('ev-spi'); spiEl.textContent=i.spi.toFixed(2); spiEl.style.color=i.spi>=1?'#22c55e':'#ef4444';
    var cpiEl=document.getElementById('ev-cpi'); cpiEl.textContent=i.cpi.toFixed(2); cpiEl.style.color=i.cpi>=1?'#22c55e':'#ef4444';
    var svEl=document.getElementById('ev-sv'); svEl.textContent=(i.sv>=0?'+':'')+fmtMontant(i.sv); svEl.style.color=i.sv>=0?'#22c55e':'#ef4444';
    var cvEl=document.getElementById('ev-cv'); cvEl.textContent=(i.cv>=0?'+':'')+fmtMontant(i.cv); cvEl.style.color=i.cv>=0?'#22c55e':'#ef4444';
  }).catch(function(e) { console.error('[EV] error', e); });
}

// ── Échéancier ──

function loadEcheancier() {
  if (!_honProjetId) return;
  apiFetch('api/echeancier.php?action=list&projet_id='+_honProjetId).then(function(r) { _honEcheancier=r.data||[]; renderEcheancierTable(); }).catch(function(e) { console.error('[echeancier]', e); });
}

function renderEcheancierTable() {
  var tbody=document.getElementById('hon-echeancier-tbody'); if(!tbody) return;
  if (!_honEcheancier||_honEcheancier.length===0) { tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--text-3)">Aucune échéance.</td></tr>'; return; }
  var html='', today=new Date().toISOString().split('T')[0];
  _honEcheancier.forEach(function(e) {
    var sl = e.statut==='facture'?'<span style="color:#22c55e">Facturé</span>':(e.statut==='annule'?'<span style="color:var(--text-3)">Annulé</span>':'<span style="color:#eab308">Prévu</span>');
    html += '<tr'+(e.statut==='prevu'&&e.date_prevue<today?' style="background:rgba(239,68,68,0.08)"':'')+'><td>'+(e.date_prevue||'')+'</td><td>'+(e.mission_phase||'—')+'</td><td>'+(e.description||'')+'</td><td style="text-align:right">'+fmtMontant(e.montant_prevu||0)+'</td><td>'+sl+(e.facture_numero?' ('+e.facture_numero+')':'')+'</td><td>'+(e.statut==='prevu'?'<button class="btn btn-sm" onclick="deleteEcheance('+e.id+')">&times;</button>':'')+'</td></tr>';
  });
  tbody.innerHTML = html;
}

function generateEcheancier() {
  if(!_honProjetId) return;
  apiFetch('api/echeancier.php?action=generate',{method:'POST',body:{projet_id:_honProjetId,intervalle_mois:2}}).then(function(r) { showToast(r.data.generated+' échéance(s) générée(s)'); loadEcheancier(); }).catch(function(e) { showToast('Erreur: '+e.message,'var(--red)'); });
}

function openAddEcheance() {
  if(!_honProjetId) return;
  document.getElementById('ech-id').value=''; document.getElementById('ech-date').value=''; document.getElementById('ech-phase').value='';
  document.getElementById('ech-desc').value=''; document.getElementById('ech-montant').value='';
  document.getElementById('echeance-modal-title').textContent='Ajouter une échéance';
  document.getElementById('modal-echeance').style.display='flex';
}

function saveEcheance() {
  var body={projet_id:_honProjetId,date_prevue:document.getElementById('ech-date').value,mission_phase:document.getElementById('ech-phase').value||null,description:document.getElementById('ech-desc').value,montant_prevu:parseFloat(document.getElementById('ech-montant').value)||0};
  var id=document.getElementById('ech-id').value; if(id) body.id=parseInt(id);
  apiFetch('api/echeancier.php?action=save',{method:'POST',body:body}).then(function() { document.getElementById('modal-echeance').style.display='none'; showToast('Échéance enregistrée'); loadEcheancier(); }).catch(function(e) { showToast('Erreur: '+e.message,'var(--red)'); });
}

function deleteEcheance(id) {
  if(!confirm('Supprimer cette échéance ?')) return;
  apiFetch('api/echeancier.php?action=delete&id='+id,{method:'DELETE'}).then(function() { showToast('Échéance supprimée'); loadEcheancier(); }).catch(function(e) { showToast('Erreur: '+e.message,'var(--red)'); });
}

// ── Init honoraires modal ──

function openHonInit() {
  if(!_honProjetId) return;
  document.getElementById('hon-init-mode').value='mop'; document.getElementById('hon-init-custom-wrap').style.display='none'; document.getElementById('hon-init-err').style.display='none';
  document.getElementById('hon-init-mop-preview').innerHTML='<div style="color:var(--text-3);font-size:0.82rem">Chargement...</div>';
  var projets=getProjets?getProjets():[], p=projets.find(function(x){return x.id===_honProjetId;}), cout=p?(parseFloat(p.cout_construction)||0):0;
  if(cout>0) {
    apiFetch('api/honoraires.php?action=calcul_mop&cout_construction='+cout).then(function(r) {
      var d=r.data, html='<div style="font-size:0.82rem;margin-bottom:0.5rem">Coût : <strong>'+fmtMontant(d.cout_construction)+'</strong> — Taux : <strong>'+d.taux_global+'%</strong> — Total : <strong>'+fmtMontant(d.total_honoraires)+'</strong></div>';
      html+='<table class="data-table" style="font-size:0.8rem"><thead><tr><th>Phase</th><th>%</th><th>Montant</th></tr></thead><tbody>';
      d.phases.forEach(function(ph){html+='<tr><td>'+ph.label+'</td><td>'+ph.pct+'%</td><td style="text-align:right">'+fmtMontant(ph.montant)+'</td></tr>';});
      html+='</tbody></table>';
      document.getElementById('hon-init-mop-preview').innerHTML=html;
    }).catch(function(e) { document.getElementById('hon-init-mop-preview').innerHTML='<div style="color:var(--red)">'+e.message+'</div>'; });
  } else { document.getElementById('hon-init-mop-preview').innerHTML='<div style="color:var(--red);font-size:0.82rem">Pas de coût de construction. Utilisez le mode personnalisé.</div>'; }
  document.getElementById('modal-hon-init').style.display='flex';
}

function onHonInitModeChange() {
  var mode=document.getElementById('hon-init-mode').value;
  document.getElementById('hon-init-mop-preview').style.display=mode==='mop'?'':'none';
  document.getElementById('hon-init-custom-wrap').style.display=mode==='custom'?'':'none';
  if(mode==='custom'&&document.getElementById('hon-init-custom-phases').children.length===0) addCustomPhase();
}

var _customPhaseIdx=0;
function addCustomPhase() {
  _customPhaseIdx++;
  var wrap=document.getElementById('hon-init-custom-phases'), div=document.createElement('div');
  div.className='form-row'; div.style.cssText='display:flex;gap:0.5rem;align-items:center';
  div.innerHTML='<input type="text" class="form-input" placeholder="Nom phase" style="flex:2" data-role="label"><input type="number" class="form-input" placeholder="Montant" style="flex:1" step="0.01" data-role="montant"><button class="btn btn-sm" onclick="this.parentElement.remove()" style="padding:0.2rem 0.5rem">&times;</button>';
  wrap.appendChild(div);
}

function saveHonInit() {
  var mode=document.getElementById('hon-init-mode').value, body={projet_id:_honProjetId,mode:mode};
  if(mode==='custom') {
    var rows=document.getElementById('hon-init-custom-phases').children, phases=[];
    for(var i=0;i<rows.length;i++) { var l=rows[i].querySelector('[data-role="label"]').value.trim(), m=parseFloat(rows[i].querySelector('[data-role="montant"]').value)||0; if(l&&m>0) phases.push({mission_label:l,mission_phase:'custom_'+(i+1),montant_prevu:m}); }
    if(phases.length===0){var err=document.getElementById('hon-init-err');err.textContent='Ajoutez au moins une phase';err.style.display='';return;} body.phases=phases;
  }
  apiFetch('api/honoraires.php?action=projet_init',{method:'POST',body:body}).then(function(){document.getElementById('modal-hon-init').style.display='none';showToast('Honoraires initialisés');loadHonorairesProjet();}).catch(function(e){var err=document.getElementById('hon-init-err');err.textContent=e.message;err.style.display='';});
}

function openEditHonPhase(phaseId) {
  var ph=_honPhases.find(function(p){return p.id==phaseId;}); if(!ph) return;
  document.getElementById('hp-id').value=ph.id; document.getElementById('hp-label').value=ph.mission_label||'';
  document.getElementById('hp-montant').value=ph.montant_prevu||''; document.getElementById('hp-taux').value=ph.taux_pct||'';
  document.getElementById('hp-prog-prevue').value=ph.progression_prevue||0; document.getElementById('hp-prog-reelle').value=ph.progression_reelle||0;
  document.getElementById('modal-hon-phase').style.display='flex';
}

function saveHonPhase() {
  var id=document.getElementById('hp-id').value; if(!id) return;
  var body={mission_label:document.getElementById('hp-label').value,montant_prevu:parseFloat(document.getElementById('hp-montant').value)||0,taux_pct:parseFloat(document.getElementById('hp-taux').value)||null,progression_prevue:parseInt(document.getElementById('hp-prog-prevue').value)||0,progression_reelle:parseInt(document.getElementById('hp-prog-reelle').value)||0};
  apiFetch('api/honoraires.php?action=projet_update&id='+id,{method:'PUT',body:body}).then(function(){document.getElementById('modal-hon-phase').style.display='none';showToast('Phase mise à jour');loadHonorairesProjet();}).catch(function(e){showToast('Erreur: '+e.message,'var(--red)');});
}

// ============================================================
//  MODULE : CRÉANCES & RELANCES
// ============================================================

function renderCreancesPage(){loadReceivables();loadCashflowForKPI();renderFacturationKPIs();}

// Unified tab switcher for Facturation & Paiements page
function switchFacturationTab(tab,btn) {
  document.querySelectorAll('.facturation-tab').forEach(function(t){t.style.display='none';});
  document.querySelectorAll('#facturation-tabs .tab-btn').forEach(function(b){b.classList.remove('active');});
  var panel = document.getElementById('facturation-tab-'+tab);
  if(panel) panel.style.display='';
  if(btn) btn.classList.add('active');

  // Show/hide contextual action buttons
  var showForFactures = (tab === 'factures');
  var showForCreances = (tab !== 'factures');
  var el;
  el = document.getElementById('fa-action-export-pdf');   if(el) el.style.display = showForFactures ? '' : 'none';
  el = document.getElementById('fa-action-new-facture');   if(el) el.style.display = showForFactures ? '' : 'none';
  el = document.getElementById('fa-action-export-csv');    if(el) el.style.display = showForCreances ? '' : 'none';
  el = document.getElementById('fa-action-paiement');      if(el) el.style.display = showForCreances ? '' : 'none';

  // Lazy-load tab data
  if(tab==='receivables') loadReceivables();
  if(tab==='aged') loadAgedBalance();
  if(tab==='cashflow') loadCashflow();
  if(tab==='relances') loadRelancesHistory();
}

// Backward compat alias
function switchCreancesTab(tab,btn){ switchFacturationTab(tab,btn); }

// Render unified KPIs from invoice data
function renderFacturationKPIs() {
  var factures = typeof getFactures==='function' ? getFactures() : [];
  var totalFacture = 0, encaisse = 0;
  var yr = new Date().getFullYear();
  factures.forEach(function(f){
    var d = f.dateEmission||f.date_emission||f.date_facture||'';
    if(d && d.indexOf(yr)===0) {
      var ttc = parseFloat(f.montantTtc||f.montant_ttc||f.montant||0);
      totalFacture += ttc;
      if(f.statut==='Payée') encaisse += ttc;
      else encaisse += parseFloat(f.montant_paye||f.montantPaye||0);
    }
  });
  var el;
  el = document.getElementById('fa-kpi-total');    if(el) el.textContent = fmtMontant(totalFacture);
  el = document.getElementById('fa-kpi-encaisse'); if(el) el.textContent = fmtMontant(encaisse);
}

function loadReceivables() {
  apiFetch('api/paiements.php?action=receivables').then(function(r) {
    var d=r.data;
    document.getElementById('cr-kpi-total').textContent=fmtMontant(d.summary.total_creances);
    document.getElementById('cr-kpi-echues').textContent=fmtMontant(d.summary.total_echues);
    document.getElementById('cr-kpi-nb').textContent=d.summary.nb_factures;
    var tbody=document.getElementById('receivables-tbody');
    if(!d.factures||d.factures.length===0){tbody.innerHTML='<tr><td colspan="10" style="text-align:center;color:var(--text-3)">Aucune créance</td></tr>';return;}
    var html='';
    d.factures.forEach(function(f) {
      var ret=parseInt(f.jours_retard)||0, retL=ret>0?'<span style="color:var(--red);font-weight:600">'+ret+'j</span>':'—';
      var sC=f.statut==='Impayée'?'var(--red)':(f.statut==='Partiellement payée'?'#eab308':'var(--text-3)');
      var recuBtn = parseFloat(f.montant_paye||0) > 0 ? ' <button class="btn btn-sm" onclick="openRecuListForFacture(\''+f.id+'\')" title="Reçu de paiement" style="color:#2d7a50">&#9998;</button>' : '';
      html+='<tr'+(ret>30?' style="background:rgba(239,68,68,0.06)"':'')+'><td>'+(f.client_nom||f.client||'')+'</td><td>'+(f.numero||'')+'</td><td style="font-size:0.78rem;color:var(--text-3)">'+(f.projet_code||'')+'</td><td style="text-align:right">'+fmtMontant(f.montant_du||0)+'</td><td style="text-align:right">'+fmtMontant(f.montant_paye||0)+'</td><td style="text-align:right;font-weight:600">'+fmtMontant(f.reste||0)+'</td><td>'+(f.date_echeance||'—')+'</td><td>'+retL+'</td><td style="color:'+sC+'">'+(f.statut||'')+'</td><td style="white-space:nowrap"><button class="btn btn-sm" onclick="openRelanceForFacture(\''+f.id+'\',\''+(f.client_email||'')+'\','+(f.relance_niveau||0)+')" title="Relancer">&#9993;</button> <button class="btn btn-sm btn-primary" onclick="openPaiementForFacture(\''+f.id+'\','+(f.reste||0)+')" title="Paiement">$</button>'+recuBtn+'</td></tr>';
    });
    tbody.innerHTML=html;
    var badge=document.getElementById('creances-badge');
    if(badge){if(d.summary.nb_echues>0){badge.textContent=d.summary.nb_echues;badge.style.display='';}else{badge.style.display='none';}}
  }).catch(function(e){console.error('[receivables]',e);});
}

function loadCashflowForKPI() {
  apiFetch('api/paiements.php?action=cashflow').then(function(r) {
    var ms=r.data||[],t3=0; for(var i=0;i<Math.min(3,ms.length);i++) t3+=ms[i].solde||0;
    var el=document.getElementById('cr-kpi-tresorerie'); if(el) el.textContent=fmtMontant(t3);
  }).catch(function(){});
}

function loadAgedBalance() {
  apiFetch('api/paiements.php?action=aged_balance').then(function(r) {
    var d=r.data,tbody=document.getElementById('aged-balance-tbody'),tfoot=document.getElementById('aged-balance-tfoot');
    if(!d.clients||d.clients.length===0){tbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--text-3)">Aucune créance</td></tr>';tfoot.innerHTML='';return;}
    var html='';
    d.clients.forEach(function(c){html+='<tr><td><strong>'+(c.client_nom||'')+'</strong></td><td style="text-align:right">'+fmtMontant(c.non_echu||0)+'</td><td style="text-align:right;color:#eab308">'+fmtMontant(c.tranche_0_30||0)+'</td><td style="text-align:right;color:#f97316">'+fmtMontant(c.tranche_31_60||0)+'</td><td style="text-align:right;color:#ef4444">'+fmtMontant(c.tranche_61_90||0)+'</td><td style="text-align:right;color:#dc2626;font-weight:600">'+fmtMontant(c.tranche_90_plus||0)+'</td><td style="text-align:right;font-weight:600">'+fmtMontant(c.total||0)+'</td></tr>';});
    tbody.innerHTML=html;
    var t=d.totals;
    tfoot.innerHTML='<tr style="font-weight:700;border-top:2px solid var(--border)"><td>Total</td><td style="text-align:right">'+fmtMontant(t.non_echu||0)+'</td><td style="text-align:right">'+fmtMontant(t.tranche_0_30||0)+'</td><td style="text-align:right">'+fmtMontant(t.tranche_31_60||0)+'</td><td style="text-align:right">'+fmtMontant(t.tranche_61_90||0)+'</td><td style="text-align:right">'+fmtMontant(t.tranche_90_plus||0)+'</td><td style="text-align:right">'+fmtMontant(t.total||0)+'</td></tr>';
  }).catch(function(e){console.error('[aged]',e);});
}

function loadCashflow() {
  apiFetch('api/paiements.php?action=cashflow').then(function(r) {
    var ms=r.data||[],tbody=document.getElementById('cashflow-tbody'),html='';
    ms.forEach(function(m){var sc=m.solde>=0?'#22c55e':'#ef4444';html+='<tr><td><strong>'+(m.label||m.mois)+'</strong></td><td style="text-align:right;color:#22c55e">'+fmtMontant(m.entrees_prevues)+'</td><td style="text-align:right;color:#3b82f6">'+fmtMontant(m.entrees_reelles)+'</td><td style="text-align:right;color:#ef4444">'+fmtMontant(m.sorties_prevues)+'</td><td style="text-align:right;font-weight:600;color:'+sc+'">'+fmtMontant(m.solde)+'</td></tr>';});
    tbody.innerHTML=html||'<tr><td colspan="5" style="text-align:center;color:var(--text-3)">Pas de données</td></tr>';
  }).catch(function(e){console.error('[cashflow]',e);});
}

function loadRelancesHistory() {
  apiFetch('api/paiements.php?action=relance_log').then(function(r) {
    var rows=r.data||[],tbody=document.getElementById('relances-tbody');
    if(rows.length===0){tbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--text-3)">Aucune relance</td></tr>';return;}
    var html='';
    rows.forEach(function(rl){var nL=['','Courtoise','Ferme','Urgente'][rl.niveau]||rl.niveau,nC=rl.niveau>=3?'var(--red)':(rl.niveau>=2?'#f97316':'var(--text-2)');html+='<tr><td>'+(rl.date_envoi||'')+'</td><td>'+(rl.facture_numero||'')+'</td><td>'+(rl.client_nom||'')+'</td><td style="color:'+nC+'">'+nL+'</td><td>'+(rl.canal||'')+'</td><td>'+(rl.statut==='sent'?'<span style="color:#22c55e">Envoyé</span>':'<span style="color:var(--red)">Échoué</span>')+'</td><td style="font-size:0.78rem;color:var(--text-3)">'+(rl.cree_par||'')+'</td></tr>';});
    tbody.innerHTML=html;
  }).catch(function(e){console.error('[relances]',e);});
}

// ── Paiement modal ──

function openEnregistrerPaiement() {
  var sel=document.getElementById('pai-facture-sel'), factures=typeof getFactures==='function'?getFactures():[];
  var opts='<option value="">— Sélectionner une facture —</option>';
  factures.forEach(function(f){if(f.statut==='Payée'||f.statut==='Annulée') return; var l=(f.numero||f.ref||'')+' — '+(f.client||'')+' — '+fmtMontant(f.montant_ttc||f.montantTtc||0); var reste=(parseFloat(f.net_payer||f.netPayer||f.montant_ttc||f.montantTtc)||0)-(parseFloat(f.montant_paye||f.montantPaye)||0); opts+='<option value="'+f.id+'" data-reste="'+reste+'">'+l+'</option>';});
  sel.innerHTML=opts; document.getElementById('pai-reste').value=''; document.getElementById('pai-montant').value='';
  document.getElementById('pai-date').value=new Date().toISOString().split('T')[0]; document.getElementById('pai-mode').value='Virement';
  document.getElementById('pai-reference').value=''; document.getElementById('pai-notes').value=''; document.getElementById('pai-err').style.display='none';
  document.getElementById('modal-paiement').style.display='flex';
}

function openPaiementForFacture(factureId,reste) {
  openEnregistrerPaiement();
  setTimeout(function(){document.getElementById('pai-facture-sel').value=factureId;document.getElementById('pai-reste').value=fmtMontant(reste);document.getElementById('pai-montant').value=reste;},100);
}

function onPaiFactureChange() {
  var sel=document.getElementById('pai-facture-sel'),opt=sel.options[sel.selectedIndex],reste=opt?parseFloat(opt.dataset.reste)||0:0;
  document.getElementById('pai-reste').value=reste>0?fmtMontant(reste):''; document.getElementById('pai-montant').value=reste>0?reste:'';
}

function savePaiement() {
  var fid=document.getElementById('pai-facture-sel').value, mt=parseFloat(document.getElementById('pai-montant').value), errEl=document.getElementById('pai-err');
  if(!fid){errEl.textContent='Sélectionnez une facture';errEl.style.display='';return;} if(!mt||mt<=0){errEl.textContent='Montant invalide';errEl.style.display='';return;}
  apiFetch('api/paiements.php?action=create',{method:'POST',body:{facture_id:fid,montant:mt,date_paiement:document.getElementById('pai-date').value,mode_paiement:document.getElementById('pai-mode').value,reference:document.getElementById('pai-reference').value,notes:document.getElementById('pai-notes').value}}).then(function(r){document.getElementById('modal-paiement').style.display='none';showToast('Paiement enregistré');loadReceivables();if(typeof loadData==='function') loadData();var pid=r&&r.data&&r.data.id;if(pid&&confirm('Paiement enregistré avec succès.\n\nVoulez-vous imprimer le reçu de paiement ?')){genRecuPaiementPDF(pid);}}).catch(function(e){errEl.textContent=e.message;errEl.style.display='';});
}

// ── Relance modal ──

function openRelanceForFacture(factureId,email,niveau) {
  document.getElementById('rel-facture-id').value=factureId; document.getElementById('rel-email').value=email||'';
  document.getElementById('rel-niveau').value=Math.min((niveau||0)+1,3); document.getElementById('rel-err').style.display='none';
  document.getElementById('modal-relance').style.display='flex';
}

function sendRelanceManuelle() {
  var fid=document.getElementById('rel-facture-id').value,email=document.getElementById('rel-email').value,niv=parseInt(document.getElementById('rel-niveau').value)||1,errEl=document.getElementById('rel-err');
  if(!fid){errEl.textContent='Facture non spécifiée';errEl.style.display='';return;} if(!email){errEl.textContent='Email requis';errEl.style.display='';return;}
  apiFetch('api/paiements.php?action=relance_send',{method:'POST',body:{facture_id:fid,email_to:email,niveau:niv}}).then(function(r){document.getElementById('modal-relance').style.display='none';showToast(r.data.sent?'Relance envoyée':'Échec envoi',r.data.sent?undefined:'var(--red)');loadReceivables();}).catch(function(e){errEl.textContent=e.message;errEl.style.display='';});
}

// ── Export CSV ──

function exportAgedBalanceCSV() {
  apiFetch('api/paiements.php?action=aged_balance').then(function(r) {
    var d=r.data,csv='Client;Non échu;0-30j;31-60j;61-90j;90j+;Total\n';
    (d.clients||[]).forEach(function(c){csv+='"'+(c.client_nom||'')+'";'+(c.non_echu||0)+';'+(c.tranche_0_30||0)+';'+(c.tranche_31_60||0)+';'+(c.tranche_61_90||0)+';'+(c.tranche_90_plus||0)+';'+(c.total||0)+'\n';});
    var t=d.totals||{}; csv+='"TOTAL";'+(t.non_echu||0)+';'+(t.tranche_0_30||0)+';'+(t.tranche_31_60||0)+';'+(t.tranche_61_90||0)+';'+(t.tranche_90_plus||0)+';'+(t.total||0)+'\n';
    var blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='balance_agee_'+new Date().toISOString().split('T')[0]+'.csv';a.click();URL.revokeObjectURL(a.href);showToast('Export CSV téléchargé');
  }).catch(function(e){showToast('Erreur: '+e.message,'var(--red)');});
}

// ── Dashboard Widgets ──

function renderDashCreancesWidget() {
  var el = document.getElementById('dash-creances-widget');
  if (!el) return;
  apiFetch('api/paiements.php?action=aged_balance').then(function(r) {
    var t = r.data.totals || {};
    var total = t.total || 0;
    var echu = (t.tranche_0_30||0) + (t.tranche_31_60||0) + (t.tranche_61_90||0) + (t.tranche_90_plus||0);
    var grave = (t.tranche_61_90||0) + (t.tranche_90_plus||0);
    var clients = r.data.clients || [];
    var nbRetard = clients.filter(function(c){ return (c.tranche_61_90||0)+(c.tranche_90_plus||0) > 0; }).length;
    el.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;margin-bottom:1rem">' +
        '<div style="text-align:center;padding:0.6rem;background:var(--bg-2);border-radius:8px">' +
          '<div style="font-size:1.4rem;font-weight:700;color:var(--text-1)">' + (typeof fmtMontant==='function'?fmtMontant(total):Math.round(total)) + '</div>' +
          '<div style="font-size:0.7rem;color:var(--text-3)">Total créances</div>' +
        '</div>' +
        '<div style="text-align:center;padding:0.6rem;background:var(--bg-2);border-radius:8px">' +
          '<div style="font-size:1.4rem;font-weight:700;color:' + (grave>0?'var(--red)':'var(--green)') + '">' + (typeof fmtMontant==='function'?fmtMontant(echu):Math.round(echu)) + '</div>' +
          '<div style="font-size:0.7rem;color:var(--text-3)">Échues</div>' +
        '</div>' +
      '</div>' +
      (nbRetard > 0 ? '<div style="font-size:0.75rem;color:var(--red);margin-bottom:0.5rem">' + nbRetard + ' client(s) avec retard &gt; 60 jours</div>' : '') +
      '<button class="btn btn-sm" onclick="showPage(\'facturation\');setTimeout(function(){switchFacturationTab(\'receivables\',document.querySelector(\'#facturation-tabs .tab-btn:nth-child(2)\'));},150)" style="width:100%">Voir détails</button>';
  }).catch(function() {
    el.innerHTML = '<div style="font-size:0.8rem;color:var(--text-3)">Données non disponibles</div>';
  });
}

function renderDashHonorairesWidget() {
  var el = document.getElementById('dash-honoraires-widget');
  if (!el) return;
  apiFetch('api/honoraires.php?action=dashboard').then(function(r) {
    var d = r.data || {};
    var projets = d.projets || [];
    var alertes = projets.filter(function(p){ return p.alerte_budget && p.alerte_budget !== 'green'; });
    var html = '';
    if (alertes.length === 0) {
      html = '<div style="text-align:center;padding:1.5rem">' +
        '<div style="font-size:1.8rem;margin-bottom:0.5rem">&#9989;</div>' +
        '<div style="font-size:0.85rem;color:var(--green);font-weight:600">Tous les budgets sont en ordre</div>' +
      '</div>';
    } else {
      html = '<div style="font-size:0.75rem;color:var(--text-3);margin-bottom:0.6rem">' + alertes.length + ' projet(s) en alerte</div>';
      alertes.slice(0, 4).forEach(function(p) {
        var color = p.alerte_budget === 'red' ? 'var(--red)' : (p.alerte_budget === 'orange' ? '#e67e22' : '#f1c40f');
        var pct = p.honoraires_prevus > 0 ? Math.round(p.honoraires_factures / p.honoraires_prevus * 100) : 0;
        html += '<div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;border-bottom:1px solid var(--border)">' +
          '<span style="width:8px;height:8px;border-radius:50%;background:' + color + ';flex-shrink:0"></span>' +
          '<span style="flex:1;font-size:0.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (p.nom || p.code || '') + '</span>' +
          '<span style="font-size:0.75rem;font-weight:600;color:' + color + '">' + pct + '%</span>' +
        '</div>';
      });
      if (alertes.length > 4) html += '<div style="font-size:0.7rem;color:var(--text-3);margin-top:0.4rem">+' + (alertes.length-4) + ' autres</div>';
    }
    html += '<button class="btn btn-sm" onclick="showPage(\'honoraires\')" style="width:100%;margin-top:0.8rem">Voir honoraires</button>';
    el.innerHTML = html;
  }).catch(function() {
    el.innerHTML = '<div style="font-size:0.8rem;color:var(--text-3)">Données non disponibles</div>';
  });
}

// Auto-load widgets when dashboard renders
(function() {
  var origRender = window.renderDashboard;
  if (origRender) {
    window.renderDashboard = function() {
      origRender.apply(this, arguments);
      setTimeout(function() { renderDashCreancesWidget(); renderDashHonorairesWidget(); }, 200);
    };
  }
})();

// ── Reçu de paiement ──

function openRecuListForFacture(factureId) {
  apiFetch('api/paiements.php?action=list&facture_id=' + factureId).then(function(r) {
    var paiements = r.data || [];
    if (paiements.length === 0) { showToast('Aucun paiement enregistré pour cette facture', 'var(--red)'); return; }
    if (paiements.length === 1) { genRecuPaiementPDF(paiements[0].id); return; }
    // Multiple payments: let user choose
    var msg = 'Plusieurs paiements trouvés. Choisissez :\n';
    paiements.forEach(function(p, i) {
      msg += '\n' + (i+1) + ') ' + (parseFloat(p.montant)||0).toFixed(3) + ' TND — ' + (p.date_paiement||'') + ' — ' + (p.mode_paiement||'');
    });
    msg += '\n\nEntrez le numéro (1-' + paiements.length + ') :';
    var choice = prompt(msg);
    var idx = parseInt(choice) - 1;
    if (idx >= 0 && idx < paiements.length) { genRecuPaiementPDF(paiements[idx].id); }
  }).catch(function(e) { showToast('Erreur: ' + e.message, 'var(--red)'); });
}

// ── Reçu de paiement PDF ──

function genRecuPaiementPDF(paiementId) {
  apiFetch('api/paiements.php?action=receipt&id=' + paiementId).then(function(r) {
    var p = r.data;
    var ag = {
      raison:  getSetting('cortoba_agence_raison','Cortoba Architecture Studio'),
      adresse: getSetting('cortoba_agence_adresse','Midoun, Djerba, Tunisie'),
      tel:     getSetting('cortoba_agence_tel',''),
      email:   getSetting('cortoba_agence_email',''),
      mf:      getSetting('cortoba_agence_mf',''),
      cnoa:    getSetting('cortoba_agence_cnoa',''),
      banque:  getSetting('cortoba_banque',''),
      rib:     getSetting('cortoba_rib','')
    };
    var logo = getSetting('cortoba_logo','');
    var logoH = logo
      ? '<img src="'+logo+'" style="max-height:55px;max-width:180px;object-fit:contain" />'
      : '<div style="font-size:1.2rem;font-weight:700;color:#111">'+ag.raison+'</div>';

    function fN(n){ return (parseFloat(n)||0).toFixed(3).replace('.',',')+' TND'; }
    function fD(d){ if(!d) return '\u2014'; try{ return new Date(d).toLocaleDateString('fr-FR'); }catch(e){return String(d);} }

    var recuNum = 'REC-' + (p.facture_numero || '').replace(/^FA-?/i,'') + '-' + (p.date_paiement||'').replace(/-/g,'').slice(4);

    var netFacture = parseFloat(p.net_payer) || parseFloat(p.montant_ttc) || 0;
    var resteApayer = Math.max(0, netFacture - (parseFloat(p.total_paye_facture)||0));

    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Reçu de paiement — '+ag.raison+'</title><style>'
      + '@page{size:A4;margin:14mm 13mm 16mm}*{box-sizing:border-box}'
      + 'body{font-family:Helvetica,Arial,sans-serif;font-size:9pt;color:#222;margin:0}'
      + '.page{max-width:184mm;margin:0 auto}'
      + '.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10pt}'
      + '.hdr-r{text-align:right}'
      + '.agaddr{display:flex;flex-direction:column;gap:1pt;margin-top:5pt}'
      + '.agaddr span{font-size:7.5pt;color:#555}'
      + '.recunum{font-size:18pt;font-weight:700;color:#2d7a50}'
      + '.sl{border-top:1.5pt solid #2d7a50;margin:10pt 0}'
      + '.parties{display:flex;gap:18pt;margin-bottom:14pt}'
      + '.party{flex:1;padding:8pt;background:#f9f9f9;border-radius:3pt}'
      + '.pdest{background:#e8f5e9}'
      + '.plbl{font-size:6.5pt;text-transform:uppercase;letter-spacing:.1em;color:#888;margin-bottom:4pt}'
      + '.section-title{font-size:10pt;font-weight:700;color:#2d7a50;margin:14pt 0 8pt;padding-bottom:4pt;border-bottom:1pt solid #c8e6c9}'
      + '.detail-table{width:100%;border-collapse:collapse;margin-bottom:12pt}'
      + '.detail-table td{padding:5pt 8pt;font-size:8.5pt;border-bottom:.5pt solid #eee}'
      + '.detail-table td:first-child{color:#555;width:40%}'
      + '.detail-table td:last-child{font-weight:600}'
      + '.amount-box{background:#e8f5e9;border:1.5pt solid #2d7a50;border-radius:6pt;padding:12pt 16pt;text-align:center;margin:16pt 0}'
      + '.amount-box .label{font-size:8pt;color:#555;margin-bottom:4pt}'
      + '.amount-box .value{font-size:20pt;font-weight:700;color:#2d7a50}'
      + '.summary-table{width:260pt;margin-left:auto;border-collapse:collapse;margin-bottom:14pt}'
      + '.summary-table td{padding:3pt 6pt;font-size:8.5pt}'
      + '.summary-table .sep td{border-top:1pt solid #2d7a50;padding-top:4pt}'
      + '.stamp{margin-top:20pt;display:flex;justify-content:space-between;align-items:flex-end}'
      + '.stamp-box{text-align:center;padding:8pt 16pt;border:1pt dashed #aaa;border-radius:4pt;min-width:160pt;min-height:70pt}'
      + '.stamp-box .lbl{font-size:7pt;color:#888;text-transform:uppercase;letter-spacing:.1em}'
      + '.footer-note{margin-top:16pt;font-size:7.5pt;color:#888;border-top:.5pt solid #eee;padding-top:5pt}'
      + '.fw{font-weight:700}.gray{color:#777}.sm{font-size:7.5pt}.green{color:#2d7a50}'
      + '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'
      + '</style></head><body>'
      + '<div class="page">'

      // Header
      + '<div class="hdr"><div>'+logoH
      + '<div class="agaddr">'
      + (ag.adresse?'<span>'+ag.adresse+'</span>':'')
      + (ag.tel?'<span>'+ag.tel+'</span>':'')
      + (ag.email?'<span>'+ag.email+'</span>':'')
      + (ag.mf?'<span>MF\u00a0: '+ag.mf+'</span>':'')
      + (ag.cnoa?'<span>CNOA\u00a0: '+ag.cnoa+'</span>':'')
      + '</div></div>'
      + '<div class="hdr-r">'
      + '<div class="recunum">'+recuNum+'</div>'
      + '<div class="gray sm">Date\u00a0: '+fD(p.date_paiement)+'</div>'
      + '<div style="display:inline-block;margin-top:4pt;padding:2pt 7pt;border:1pt solid #2d7a50;border-radius:3pt;font-size:7.5pt;font-weight:600;color:#2d7a50">REÇU DE PAIEMENT</div>'
      + '</div></div>'

      + '<div class="sl"></div>'

      // Parties
      + '<div class="parties">'
      + '<div class="party"><div class="plbl">Émetteur</div><div class="fw">'+ag.raison+'</div>'
      + (ag.adresse?'<div class="gray sm">'+ag.adresse+'</div>':'')
      + '</div>'
      + '<div class="party pdest"><div class="plbl">Payeur</div>'
      + '<div class="fw">'+(p.client_nom||'\u2014')+'</div>'
      + (p.client_adresse?'<div class="gray sm">'+p.client_adresse+'</div>':'')
      + (p.client_mf?'<div class="gray sm">MF\u00a0: '+p.client_mf+'</div>':'')
      + '</div></div>'

      // Amount box
      + '<div class="amount-box">'
      + '<div class="label">Montant reçu</div>'
      + '<div class="value">'+fN(p.montant)+'</div>'
      + '</div>'

      // Payment details
      + '<div class="section-title">Détails du paiement</div>'
      + '<table class="detail-table"><tbody>'
      + '<tr><td>Mode de paiement</td><td>'+(p.mode_paiement||'\u2014')+'</td></tr>'
      + '<tr><td>Date du paiement</td><td>'+fD(p.date_paiement)+'</td></tr>'
      + (p.reference?'<tr><td>Référence</td><td>'+p.reference+'</td></tr>':'')
      + (p.notes?'<tr><td>Notes</td><td>'+p.notes+'</td></tr>':'')
      + '</tbody></table>'

      // Invoice reference
      + '<div class="section-title">Facture associée</div>'
      + '<table class="detail-table"><tbody>'
      + '<tr><td>Numéro de facture</td><td>'+(p.facture_numero||'\u2014')+'</td></tr>'
      + (p.facture_objet?'<tr><td>Objet</td><td>'+p.facture_objet+'</td></tr>':'')
      + ((p.projet_code||p.projet_nom)?'<tr><td>Projet</td><td>'+(p.projet_code?p.projet_code+' — ':'')+(p.projet_nom||'')+'</td></tr>':'')
      + '</tbody></table>'

      // Financial summary
      + '<table class="summary-table"><tbody>'
      + '<tr><td class="gray">Montant facture</td><td style="text-align:right">'+fN(netFacture)+'</td></tr>'
      + '<tr><td class="gray">Total payé à ce jour</td><td style="text-align:right;color:#2d7a50;font-weight:600">'+fN(p.total_paye_facture)+'</td></tr>'
      + '<tr class="sep"><td class="fw">Reste à payer</td><td style="text-align:right;font-weight:700;color:'+(resteApayer>0?'#c0392b':'#2d7a50')+'">'+fN(resteApayer)+'</td></tr>'
      + '</tbody></table>'

      // Stamp and signature
      + '<div class="stamp">'
      + '<div class="stamp-box"><div class="lbl">Cachet & Signature</div></div>'
      + '<div style="text-align:right;font-size:8pt;color:#555">Fait à '+(ag.adresse?ag.adresse.split(',')[0]:'')+'<br>Le '+fD(p.date_paiement)+'</div>'
      + '</div>'

      + '<div class="footer-note">Ce reçu atteste du paiement indiqué ci-dessus. Il ne constitue pas une facture et ne remplace pas la facture correspondante.</div>'

      + '</div>'
      + '<scr'+'ipt>window.addEventListener("load",function(){setTimeout(function(){window.print();},400);});<\/scr'+'ipt>'
      + '</body></html>';

    var win = null;
    try { win = window.open('','_blank'); } catch(e){}
    if(win && win.document){ win.document.write(html); win.document.close(); }
    else {
      var blob = new Blob([html], {type:'text/html;charset=utf-8'});
      var blobUrl = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href=blobUrl; a.target='_blank'; a.rel='noopener';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(blobUrl); }, 10000);
    }
  }).catch(function(e){
    showToast('Erreur chargement reçu: '+e.message, 'var(--red)');
  });
}

// ── Devis Acceptance Hook ──
// When a devis status changes to 'Accepté', refresh projet honoraires

(function() {
  var origSaveDevis = window.saveDevis;
  if (!origSaveDevis) return;
  // Hook into devis status update flow via data table inline edit
  var origApiFetch = window.apiFetch;
  if (!origApiFetch) return;

  // Monitor PUT requests on devis that set statut=Accepté
  window._paiementsOrigApiFetch = origApiFetch;
  window.apiFetch = function(url, opts) {
    var result = origApiFetch.apply(this, arguments);
    if (url && url.indexOf('table=devis') !== -1 && opts && (opts.method === 'PUT' || opts.method === 'put')) {
      result.then(function(r) {
        var body = opts.body || {};
        if (body.statut === 'Accepté' && body.projet_id) {
          // Refresh honoraires for the linked project
          origApiFetch('api/honoraires.php?action=projet_refresh', {method:'POST', body:{projet_id: body.projet_id}}).catch(function(){});
        }
      });
    }
    return result;
  };
})();
