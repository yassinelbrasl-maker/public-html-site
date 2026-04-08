// ═══════════════════════════════════════════════════════════════
//  Cortoba Atelier — Portail Client JS
//  SPA : auth, navigation, 7 modules
// ═══════════════════════════════════════════════════════════════
(function () {
'use strict';

// ── Config ──
var API_BASE = (function () {
  var p = window.location.pathname;
  var dir = p.substring(0, p.lastIndexOf('/') + 1);
  return window.location.origin + dir + 'api/client_portal.php';
})();

var TOKEN = null;
var USER = null;
var PROJECTS = [];
var CURRENT_PROJECT = '';
var _chatPollTimer = null;
var _currentRoom = null;
var _lightboxPhotos = [];
var _lightboxIdx = 0;

// ═══════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════

function apiCall(action, opts) {
  opts = opts || {};
  var url = API_BASE + '?action=' + action;
  if (opts.params) {
    Object.keys(opts.params).forEach(function (k) {
      if (opts.params[k] !== '' && opts.params[k] != null) url += '&' + k + '=' + encodeURIComponent(opts.params[k]);
    });
  }
  var headers = {};
  if (TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN;

  var init = { method: opts.method || 'GET', headers: headers };

  if (opts.body) {
    if (opts.body instanceof FormData) {
      init.body = opts.body;
    } else {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
  }

  return fetch(url, init).then(function (r) {
    return r.json().then(function (j) {
      if (!j.success) throw new Error(j.error || 'Erreur serveur');
      return j.data;
    });
  });
}

/** Upload file via multipart — uses the main client_portal.php endpoint */
function apiUpload(action, formData) {
  var url = API_BASE + '?action=' + action;
  var headers = {};
  if (TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN;
  return fetch(url, { method: 'POST', headers: headers, body: formData }).then(function (r) {
    return r.json().then(function (j) {
      if (!j.success) throw new Error(j.error || 'Erreur upload');
      return j.data;
    });
  });
}

function showToast(msg, type) {
  type = type || 'info';
  var c = document.getElementById('toast-container');
  var t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 350); },
    type === 'error' ? 5000 : 3000);
}

function esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); }
function initials(n) { if (!n) return '?'; var p = n.trim().split(/\s+/); return ((p[0] || '')[0] || '') + ((p[1] || '')[0] || ''); }
function fmtDate(d) { if (!d) return '—'; try { return new Date(d.replace(' ', 'T')).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); } catch (e) { return d; } }
function fmtDateTime(d) { if (!d) return '—'; try { return new Date(d.replace(' ', 'T')).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return d; } }
function fmtMoney(n) { if (n == null) return '—'; return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).replace(/\s/g, '\u2009') + ' DT'; }

function badgeClass(s) {
  if (!s) return 'badge-gray';
  var l = s.toLowerCase();
  if (/actif|active|valide|approuve|pay|termin|done|lev/.test(l)) return 'badge-green';
  if (/refus|impay|retard|annul|expir/.test(l)) return 'badge-red';
  if (/attente|progress|cours|negoc|partiel|reserve/.test(l)) return 'badge-orange';
  if (/nouveau|brouillon|draft|esquisse/.test(l)) return 'badge-blue';
  return 'badge-gray';
}

function docIcon(name) {
  if (!name) return '&#128196;';
  var ext = name.split('.').pop().toLowerCase();
  if (/pdf/.test(ext)) return '&#128213;';
  if (/doc|docx/.test(ext)) return '&#128221;';
  if (/xls|xlsx/.test(ext)) return '&#128202;';
  if (/dwg|dxf/.test(ext)) return '&#128208;';
  if (/jpg|jpeg|png|gif|webp/.test(ext)) return '&#128247;';
  if (/zip|rar|7z/.test(ext)) return '&#128230;';
  return '&#128196;';
}

function $(id) { return document.getElementById(id); }

// ═══════════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════════

function checkSession() {
  TOKEN = localStorage.getItem('cp_token');
  var u = localStorage.getItem('cp_user');
  if (TOKEN && u) {
    try { USER = JSON.parse(u); } catch (e) { USER = null; }
  }
  if (TOKEN && USER) {
    showApp();
  }
}

function doLogin(email, pass) {
  $('login-btn').disabled = true;
  $('login-error').style.display = 'none';
  apiCall('login', { method: 'POST', body: { email: email, password: pass } })
    .then(function (d) {
      TOKEN = d.token;
      USER = d.user;
      localStorage.setItem('cp_token', TOKEN);
      localStorage.setItem('cp_user', JSON.stringify(USER));
      showApp();
    })
    .catch(function (e) {
      $('login-error').textContent = e.message;
      $('login-error').style.display = 'block';
    })
    .finally(function () { $('login-btn').disabled = false; });
}

function doLogout() {
  TOKEN = null; USER = null;
  localStorage.removeItem('cp_token');
  localStorage.removeItem('cp_user');
  location.reload();
}

function showApp() {
  $('login-screen').style.display = 'none';
  $('app').classList.add('active');
  $('user-name').textContent = USER.nom || USER.email;
  $('user-avatar').textContent = initials(USER.nom || USER.email);
  loadProjects();
}

// ═══════════════════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════════════════

function showPage(page) {
  document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
  var el = $('page-' + page);
  if (el) el.classList.add('active');
  var nav = document.querySelector('.nav-item[data-page="' + page + '"]');
  if (nav) nav.classList.add('active');

  // Stop chat polling when leaving communication page
  if (page !== 'communication' && _chatPollTimer) {
    clearInterval(_chatPollTimer);
    _chatPollTimer = null;
    _currentRoom = null;
  }

  // Load page data
  switch (page) {
    case 'dashboard': loadDashboard(); break;
    case 'documents': loadDocuments(); break;
    case 'communication': loadChatRooms(); break;
    case 'finance': loadFinance(); break;
    case 'validations': loadValidations(); break;
    case 'chantier': loadChantier(); break;
    case 'projet-info': loadProjectInfo(); break;
    case 'journal-acces': loadAccessLog(1); break;
  }

  // Close sidebar on mobile
  $('sidebar').classList.remove('open');
}

function loadProjects() {
  apiCall('projects').then(function (data) {
    PROJECTS = data || [];
    var sel = $('project-select');
    sel.innerHTML = '<option value="">Tous les projets</option>';
    PROJECTS.forEach(function (p) {
      var opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = (p.code ? p.code + ' — ' : '') + (p.nom || 'Projet');
      sel.appendChild(opt);
    });
    if (PROJECTS.length === 1) {
      sel.value = PROJECTS[0].id;
      CURRENT_PROJECT = PROJECTS[0].id;
    }
    showPage('dashboard');
  }).catch(function (e) {
    showToast('Erreur chargement projets: ' + e.message, 'error');
  });
}

// ═══════════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════════

function loadDashboard() {
  var params = {};
  if (CURRENT_PROJECT) params.projet_id = CURRENT_PROJECT;
  apiCall('dashboard', { params: params }).then(function (d) {
    // Stats
    $('dash-stats').innerHTML =
      '<div class="stat-card accent"><div class="stat-value">' + d.projects_count + '</div><div class="stat-label">Projets</div></div>' +
      '<div class="stat-card orange"><div class="stat-value">' + d.pending_validations + '</div><div class="stat-label">Validations en attente</div></div>' +
      '<div class="stat-card red"><div class="stat-value">' + d.pending_invoices + '</div><div class="stat-label">Factures impayees</div></div>' +
      '<div class="stat-card blue"><div class="stat-value">' + (d.recent_documents || []).length + '</div><div class="stat-label">Documents recents</div></div>';

    // Milestones
    var ms = d.milestones || [];
    if (!ms.length) {
      $('dash-milestones').innerHTML = '<div class="empty-state"><div class="empty-text">Aucun jalon</div></div>';
    } else {
      var html = '<ul class="task-tree">';
      ms.forEach(function (t) {
        var prog = parseInt(t.progression) || 0;
        var sc = prog >= 100 ? 'done' : prog > 0 ? 'progress' : 'todo';
        html += '<li class="task-item level-0">' +
          '<span class="task-status ' + sc + '"></span>' +
          '<span class="task-title">' + esc(t.titre) + '</span>' +
          '<span class="task-prog">' + prog + '%</span>' +
          '<span class="task-date">' + fmtDate(t.date_echeance) + '</span>' +
          '</li>';
      });
      html += '</ul>';
      $('dash-milestones').innerHTML = html;
    }

    // Recent docs
    var docs = d.recent_documents || [];
    if (!docs.length) {
      $('dash-recent-docs').innerHTML = '<div class="empty-state"><div class="empty-text">Aucun document</div></div>';
    } else {
      var h2 = '<table class="data-table"><thead><tr><th>Document</th><th>Categorie</th><th>Statut</th><th>Date</th></tr></thead><tbody>';
      docs.forEach(function (doc) {
        h2 += '<tr><td>' + esc(doc.titre) + '</td><td>' + esc(doc.categorie) + '</td>' +
          '<td><span class="badge ' + badgeClass(doc.statut) + '">' + esc(doc.statut) + '</span></td>' +
          '<td>' + fmtDate(doc.cree_at) + '</td></tr>';
      });
      h2 += '</tbody></table>';
      $('dash-recent-docs').innerHTML = h2;
    }

    // Update badge for validations
    if (d.pending_validations > 0) {
      $('badge-val').textContent = d.pending_validations;
      $('badge-val').style.display = '';
    } else {
      $('badge-val').style.display = 'none';
    }
  }).catch(function (e) {
    $('dash-stats').innerHTML = '<div class="empty-state"><div class="empty-text">Erreur: ' + esc(e.message) + '</div></div>';
  });
}

// ═══════════════════════════════════════════════════════════════
//  DOCUMENTS
// ═══════════════════════════════════════════════════════════════

function loadDocuments() {
  var params = {};
  if (CURRENT_PROJECT) params.projet_id = CURRENT_PROJECT;
  var cat = $('doc-filter-cat').value;
  var st  = $('doc-filter-statut').value;
  if (cat) params.categorie = cat;
  if (st) params.statut = st;

  apiCall('documents', { params: params }).then(function (docs) {
    if (!docs.length) {
      $('doc-list').innerHTML = '<div class="empty-state"><div class="empty-icon">&#128196;</div><div class="empty-text">Aucun document</div></div>';
      return;
    }
    var html = '<div class="doc-grid">';
    docs.forEach(function (d) {
      html += '<div class="doc-card" data-id="' + d.id + '">' +
        '<div class="doc-icon">' + docIcon(d.fichier_nom) + '</div>' +
        '<div class="doc-title">' + esc(d.titre) + '</div>' +
        '<div class="doc-meta">' + esc(d.categorie) + (d.phase ? ' / ' + esc(d.phase) : '') +
          ' — v' + (d.version || 1) + ' — ' + fmtDate(d.cree_at) + '</div>' +
        '<span class="badge ' + badgeClass(d.statut) + '">' + esc(d.statut) + '</span>' +
        '<div class="doc-actions">' +
          '<button class="btn-sm accent" onclick="window._cpDownloadDoc(\'' + d.id + '\')">Telecharger</button>' +
          (d.uploaded_by_type === 'team' ? '<button class="btn-sm" onclick="window._cpCommentDoc(\'' + d.id + '\')">Commenter</button>' : '') +
        '</div></div>';
    });
    html += '</div>';
    $('doc-list').innerHTML = html;
  }).catch(function (e) {
    $('doc-list').innerHTML = '<div class="empty-state"><div class="empty-text">Erreur: ' + esc(e.message) + '</div></div>';
  });
}

window._cpDownloadDoc = function (id) {
  var url = API_BASE + '?action=document_download&id=' + encodeURIComponent(id);
  var a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  // Add auth header via fetch and blob
  fetch(url, { headers: { 'Authorization': 'Bearer ' + TOKEN } })
    .then(function (r) {
      if (!r.ok) throw new Error('Erreur telechargement');
      var cd = r.headers.get('Content-Disposition') || '';
      var name = 'document';
      var m = cd.match(/filename="?([^"]+)"?/);
      if (m) name = m[1];
      return r.blob().then(function (b) { return { blob: b, name: name }; });
    })
    .then(function (d) {
      var url2 = URL.createObjectURL(d.blob);
      var a2 = document.createElement('a');
      a2.href = url2; a2.download = d.name;
      document.body.appendChild(a2); a2.click(); a2.remove();
      URL.revokeObjectURL(url2);
    })
    .catch(function (e) { showToast(e.message, 'error'); });
};

window._cpCommentDoc = function (docId) {
  var comment = prompt('Votre commentaire sur ce document :');
  if (!comment) return;
  apiCall('document_comment', { method: 'POST', body: { document_id: docId, content: comment } })
    .then(function () { showToast('Commentaire envoye', 'success'); })
    .catch(function (e) { showToast(e.message, 'error'); });
};

// Upload
function initUpload() {
  var zone = $('upload-zone');
  var input = $('upload-input');
  var selectedFile = null;

  zone.addEventListener('click', function () { input.click(); });
  zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', function () { zone.classList.remove('dragover'); });
  zone.addEventListener('drop', function (e) {
    e.preventDefault(); zone.classList.remove('dragover');
    if (e.dataTransfer.files.length) { selectedFile = e.dataTransfer.files[0]; showUploadFields(selectedFile); }
  });
  input.addEventListener('change', function () {
    if (input.files.length) { selectedFile = input.files[0]; showUploadFields(selectedFile); }
  });

  function showUploadFields(f) {
    $('upload-form-fields').style.display = 'block';
    $('upload-titre').value = f.name.replace(/\.[^.]+$/, '');
    zone.innerHTML = '<div style="font-size:1.2rem">&#128196;</div><div>' + esc(f.name) + ' (' + Math.round(f.size / 1024) + ' Ko)</div>';
  }

  $('upload-submit').addEventListener('click', function () {
    if (!selectedFile) return;
    var pid = CURRENT_PROJECT || (PROJECTS.length === 1 ? PROJECTS[0].id : '');
    if (!pid) { showToast('Selectionnez un projet', 'warning'); return; }

    var fd = new FormData();
    fd.append('file', selectedFile);
    fd.append('projet_id', pid);
    fd.append('titre', $('upload-titre').value || selectedFile.name);
    fd.append('description', $('upload-desc').value || '');

    $('upload-submit').disabled = true;
    apiUpload('document_upload', fd)
      .then(function () {
        showToast('Document envoye', 'success');
        selectedFile = null;
        $('upload-form-fields').style.display = 'none';
        zone.innerHTML = '<div style="font-size:1.5rem;margin-bottom:0.5rem">&#128228;</div><div>Cliquez ou glissez un fichier ici</div><div style="font-size:0.72rem;color:var(--text-3);margin-top:0.3rem">PDF, JPG, PNG, DOCX, DWG, ZIP — max 20 Mo</div><input type="file" id="upload-input">';
        // Re-bind file input after DOM replacement
        input = $('upload-input');
        input.addEventListener('change', function () {
          if (input.files.length) { selectedFile = input.files[0]; showUploadFields(selectedFile); }
        });
        loadDocuments();
      })
      .catch(function (e) { showToast(e.message, 'error'); })
      .finally(function () { $('upload-submit').disabled = false; });
  });
}

// ═══════════════════════════════════════════════════════════════
//  COMMUNICATION (CHAT)
// ═══════════════════════════════════════════════════════════════

function loadChatRooms() {
  apiCall('chat_rooms').then(function (rooms) {
    if (!rooms.length) {
      $('chat-rooms-list').innerHTML = '<div class="empty-state"><div class="empty-icon">&#128172;</div><div class="empty-text">Aucune discussion disponible</div></div>';
      $('chat-box').style.display = 'none';
      return;
    }
    var html = '';
    rooms.forEach(function (r) {
      var name = r.name || (r.projet_code ? r.projet_code + ' — ' + r.projet_nom : 'Discussion');
      html += '<div class="card" style="cursor:pointer;padding:0.75rem 1rem" onclick="window._cpOpenRoom(\'' + r.id + '\',\'' + esc(name).replace(/'/g, "\\'") + '\')">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<div><strong>' + esc(name) + '</strong>' +
        '<div style="font-size:0.72rem;color:var(--text-3)">' + r.msg_count + ' messages' + (r.is_archived ? ' — archive' : '') + '</div></div>' +
        '<div style="font-size:0.72rem;color:var(--text-3)">' + fmtDateTime(r.last_msg_at) + '</div>' +
        '</div></div>';
    });
    $('chat-rooms-list').innerHTML = html;

    // Auto-open first room
    if (rooms.length === 1) {
      var name = rooms[0].name || (rooms[0].projet_code + ' — ' + rooms[0].projet_nom);
      window._cpOpenRoom(rooms[0].id, name);
    }
  }).catch(function (e) {
    $('chat-rooms-list').innerHTML = '<div class="empty-state"><div class="empty-text">Erreur: ' + esc(e.message) + '</div></div>';
  });
}

window._cpOpenRoom = function (roomId, name) {
  _currentRoom = roomId;
  $('chat-box').style.display = 'flex';
  $('chat-room-name').textContent = name;
  $('chat-messages').innerHTML = '<div class="loading-block"><span class="spinner"></span></div>';
  loadChatMessages();
  // Start polling
  if (_chatPollTimer) clearInterval(_chatPollTimer);
  _chatPollTimer = setInterval(loadChatMessages, 5000);
};

function loadChatMessages() {
  if (!_currentRoom) return;
  apiCall('chat_messages', { params: { room_id: _currentRoom, limit: 100 } }).then(function (msgs) {
    if (!msgs.length) {
      $('chat-messages').innerHTML = '<div class="empty-state"><div class="empty-text">Aucun message. Commencez la discussion.</div></div>';
      return;
    }
    var html = '';
    msgs.forEach(function (m) {
      if (m.kind === 'system') {
        html += '<div class="chat-msg system"><div class="msg-bubble">' + esc(m.content) + '</div></div>';
        return;
      }
      var mine = m.sender_id && m.sender_id.indexOf('client_') === 0;
      html += '<div class="chat-msg' + (mine ? ' mine' : '') + '">' +
        '<div class="msg-avatar">' + esc(initials(m.sender_name)) + '</div>' +
        '<div>' +
        (!mine ? '<div class="msg-sender">' + esc(m.sender_name) + '</div>' : '') +
        '<div class="msg-bubble">' + esc(m.content || '').replace(/\n/g, '<br>') +
        (m.attachment_url ? '<br><a href="' + esc(m.attachment_url) + '" target="_blank" style="font-size:0.75rem">' + esc(m.attachment_name || 'Piece jointe') + '</a>' : '') +
        '</div>' +
        '<div class="msg-time">' + fmtDateTime(m.cree_at) + '</div>' +
        '</div></div>';
    });
    var el = $('chat-messages');
    var wasAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    el.innerHTML = html;
    if (wasAtBottom) el.scrollTop = el.scrollHeight;
  });
}

function sendChatMessage() {
  if (!_currentRoom) return;
  var input = $('chat-input');
  var text = (input.value || '').trim();
  if (!text) return;

  $('chat-send-btn').disabled = true;
  apiCall('chat_send', { method: 'POST', body: { room_id: _currentRoom, content: text } })
    .then(function () {
      input.value = '';
      loadChatMessages();
    })
    .catch(function (e) { showToast(e.message, 'error'); })
    .finally(function () { $('chat-send-btn').disabled = false; });
}

// ═══════════════════════════════════════════════════════════════
//  FINANCE
// ═══════════════════════════════════════════════════════════════

function loadFinance() {
  Promise.all([
    apiCall('devis'),
    apiCall('factures')
  ]).then(function (results) {
    var devis = results[0] || [];
    var factures = results[1] || [];

    // Summary
    var totalHT = 0, totalPaye = 0, totalImpaye = 0;
    factures.forEach(function (f) {
      totalHT += parseFloat(f.montant_ttc || f.net_payer || 0);
      if (f.statut === 'Payee' || f.statut === 'Payée') totalPaye += parseFloat(f.net_payer || f.montant_ttc || 0);
      else totalImpaye += parseFloat(f.net_payer || f.montant_ttc || 0);
    });

    $('finance-summary').innerHTML =
      '<div class="stat-card"><div class="stat-value mono">' + fmtMoney(totalHT) + '</div><div class="stat-label">Total facture</div></div>' +
      '<div class="stat-card green"><div class="stat-value mono">' + fmtMoney(totalPaye) + '</div><div class="stat-label">Paye</div></div>' +
      '<div class="stat-card red"><div class="stat-value mono">' + fmtMoney(totalImpaye) + '</div><div class="stat-label">Reste a payer</div></div>';

    // Devis table
    if (!devis.length) {
      $('finance-devis').innerHTML = '<div class="empty-state"><div class="empty-text">Aucun devis</div></div>';
    } else {
      var h = '<table class="data-table"><thead><tr><th>N.</th><th>Projet</th><th>Objet</th><th>Montant TTC</th><th>Statut</th><th>Date</th></tr></thead><tbody>';
      devis.forEach(function (d) {
        h += '<tr><td class="mono">' + esc(d.numero) + '</td><td>' + esc(d.projet_code || '') + '</td>' +
          '<td>' + esc(d.objet || '') + '</td><td class="mono">' + fmtMoney(d.montant_ttc) + '</td>' +
          '<td><span class="badge ' + badgeClass(d.statut) + '">' + esc(d.statut) + '</span></td>' +
          '<td>' + fmtDate(d.date_devis) + '</td></tr>';
      });
      h += '</tbody></table>';
      $('finance-devis').innerHTML = h;
    }

    // Factures table
    if (!factures.length) {
      $('finance-factures').innerHTML = '<div class="empty-state"><div class="empty-text">Aucune facture</div></div>';
    } else {
      var h2 = '<table class="data-table"><thead><tr><th>N.</th><th>Projet</th><th>Montant TTC</th><th>Net a payer</th><th>Statut</th><th>Echeance</th><th>Paiement</th></tr></thead><tbody>';
      factures.forEach(function (f) {
        h2 += '<tr><td class="mono">' + esc(f.numero) + '</td><td>' + esc(f.projet_code || '') + '</td>' +
          '<td class="mono">' + fmtMoney(f.montant_ttc) + '</td><td class="mono">' + fmtMoney(f.net_payer) + '</td>' +
          '<td><span class="badge ' + badgeClass(f.statut) + '">' + esc(f.statut) + '</span></td>' +
          '<td>' + fmtDate(f.date_echeance) + '</td>' +
          '<td>' + (f.date_paiement ? fmtDate(f.date_paiement) : '—') + '</td></tr>';
      });
      h2 += '</tbody></table>';
      $('finance-factures').innerHTML = h2;
    }
  }).catch(function (e) {
    $('finance-summary').innerHTML = '<div class="empty-state"><div class="empty-text">Erreur: ' + esc(e.message) + '</div></div>';
  });
}

// ═══════════════════════════════════════════════════════════════
//  VALIDATIONS
// ═══════════════════════════════════════════════════════════════

var _currentValidation = null;

function loadValidations() {
  loadPendingValidations();
  loadValidationHistory();
}

function loadPendingValidations() {
  apiCall('pending_validations').then(function (vals) {
    if (!vals.length) {
      $('val-pending').innerHTML = '<div class="empty-state"><div class="empty-icon">&#9989;</div><div class="empty-text">Aucune validation en attente</div></div>';
      return;
    }
    var html = '';
    vals.forEach(function (v) {
      html += '<div class="validation-card">' +
        '<div class="val-header"><div class="val-title">' + esc(v.doc_titre || v.reference_label || 'Document') + '</div>' +
        '<span class="badge badge-orange">En attente</span></div>' +
        '<div class="val-meta">' + esc(v.projet_code || '') + ' — ' + esc(v.doc_categorie || v.type) + ' — ' + fmtDate(v.cree_at) + '</div>' +
        (v.fichier_url ? '<div style="margin-bottom:0.5rem"><a href="' + esc(v.fichier_url) + '" target="_blank" class="btn-sm">Voir le document</a></div>' : '') +
        '<div class="val-actions">' +
        '<button class="btn-approve" onclick="window._cpOpenValidation(\'' + v.id + '\',\'' + esc(v.doc_titre || 'Document').replace(/'/g, "\\'") + '\')">Traiter</button>' +
        '</div></div>';
    });
    $('val-pending').innerHTML = html;
  }).catch(function (e) {
    $('val-pending').innerHTML = '<div class="empty-state"><div class="empty-text">Erreur: ' + esc(e.message) + '</div></div>';
  });
}

function loadValidationHistory() {
  var params = {};
  if (CURRENT_PROJECT) params.projet_id = CURRENT_PROJECT;
  apiCall('validation_history', { params: params }).then(function (vals) {
    if (!vals.length) {
      $('val-history').innerHTML = '<div class="empty-state"><div class="empty-text">Aucun historique</div></div>';
      return;
    }
    var h = '<table class="data-table"><thead><tr><th>Document</th><th>Projet</th><th>Statut</th><th>Commentaire</th><th>Date</th></tr></thead><tbody>';
    vals.forEach(function (v) {
      h += '<tr><td>' + esc(v.doc_titre || v.reference_label || '—') + '</td>' +
        '<td>' + esc(v.projet_code || '') + '</td>' +
        '<td><span class="badge ' + badgeClass(v.statut) + '">' + esc(v.statut) + '</span></td>' +
        '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">' + esc(v.commentaire || '—') + '</td>' +
        '<td>' + fmtDate(v.signe_at || v.modifie_at || v.cree_at) + '</td></tr>';
    });
    h += '</tbody></table>';
    $('val-history').innerHTML = h;
  });
}

// Validation modal
window._cpOpenValidation = function (id, title) {
  _currentValidation = id;
  $('modal-val-title').textContent = title;
  $('modal-val-comment').value = '';
  sigClear();
  $('modal-validation').classList.add('active');
};

function submitValidation(statut) {
  if (!_currentValidation) return;
  var body = {
    validation_id: _currentValidation,
    statut: statut,
    commentaire: $('modal-val-comment').value,
    signature_data: sigGetData()
  };

  apiCall('validate', { method: 'POST', body: body })
    .then(function () {
      showToast('Validation enregistree', 'success');
      $('modal-validation').classList.remove('active');
      _currentValidation = null;
      loadPendingValidations();
      loadValidationHistory();
      loadDashboard();
    })
    .catch(function (e) { showToast(e.message, 'error'); });
}

// Signature pad (simple canvas)
var _sigCanvas, _sigCtx, _sigDrawing = false;

function sigInit() {
  _sigCanvas = $('signature-canvas');
  _sigCtx = _sigCanvas.getContext('2d');
  _sigCtx.strokeStyle = '#333';
  _sigCtx.lineWidth = 2;
  _sigCtx.lineCap = 'round';

  _sigCanvas.addEventListener('mousedown', function (e) { _sigDrawing = true; _sigCtx.beginPath(); _sigCtx.moveTo(e.offsetX, e.offsetY); });
  _sigCanvas.addEventListener('mousemove', function (e) { if (!_sigDrawing) return; _sigCtx.lineTo(e.offsetX, e.offsetY); _sigCtx.stroke(); });
  _sigCanvas.addEventListener('mouseup', function () { _sigDrawing = false; });
  _sigCanvas.addEventListener('mouseleave', function () { _sigDrawing = false; });

  // Touch support
  _sigCanvas.addEventListener('touchstart', function (e) {
    e.preventDefault(); _sigDrawing = true;
    var r = _sigCanvas.getBoundingClientRect();
    _sigCtx.beginPath(); _sigCtx.moveTo(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top);
  });
  _sigCanvas.addEventListener('touchmove', function (e) {
    e.preventDefault(); if (!_sigDrawing) return;
    var r = _sigCanvas.getBoundingClientRect();
    _sigCtx.lineTo(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top); _sigCtx.stroke();
  });
  _sigCanvas.addEventListener('touchend', function () { _sigDrawing = false; });
}

function sigClear() {
  if (_sigCtx) _sigCtx.clearRect(0, 0, _sigCanvas.width, _sigCanvas.height);
}

function sigGetData() {
  if (!_sigCanvas) return null;
  // Check if blank
  var data = _sigCtx.getImageData(0, 0, _sigCanvas.width, _sigCanvas.height).data;
  var hasContent = false;
  for (var i = 3; i < data.length; i += 4) { if (data[i] > 0) { hasContent = true; break; } }
  return hasContent ? _sigCanvas.toDataURL('image/png') : null;
}

// ═══════════════════════════════════════════════════════════════
//  CHANTIER
// ═══════════════════════════════════════════════════════════════

function loadChantier() {
  loadChantierAvancement();
}

function loadChantierAvancement() {
  var pid = CURRENT_PROJECT || (PROJECTS.length === 1 ? PROJECTS[0].id : '');
  if (!pid) { $('chantier-avancement').innerHTML = '<div class="empty-state"><div class="empty-text">Selectionnez un projet</div></div>'; return; }

  apiCall('chantier_info', { params: { projet_id: pid } }).then(function (data) {
    var ch = data.chantier || {};
    var lots = data.lots || [];
    var phases = data.phases || [];
    var html = '';

    // Info generale
    html += '<div class="card"><div class="card-title">Informations du chantier</div>' +
      '<table class="data-table"><tbody>';
    if (ch.adresse) html += '<tr><td>Adresse</td><td>' + esc(ch.adresse) + '</td></tr>';
    if (ch.date_debut) html += '<tr><td>Date de debut</td><td>' + fmtDate(ch.date_debut) + '</td></tr>';
    if (ch.date_fin_prevue) html += '<tr><td>Date de fin prevue</td><td>' + fmtDate(ch.date_fin_prevue) + '</td></tr>';
    if (ch.statut) html += '<tr><td>Statut</td><td><span class="badge ' + badgeClass(ch.statut) + '">' + esc(ch.statut) + '</span></td></tr>';
    if (ch.avancement_global != null) html += '<tr><td>Avancement global</td><td><div class="progress-bar-wrap"><div class="progress-fill" style="width:' + (ch.avancement_global || 0) + '%"></div></div><span style="margin-left:0.5rem;font-weight:600">' + (ch.avancement_global || 0) + '%</span></td></tr>';
    html += '</tbody></table></div>';

    // Phases
    if (phases.length) {
      html += '<div class="card"><div class="card-title">Phases du chantier</div>';
      phases.forEach(function (p) {
        var pct = p.avancement || 0;
        html += '<div style="padding:0.6rem 0;border-bottom:1px solid var(--border-light)">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem">' +
          '<strong style="font-size:0.85rem">' + esc(p.nom || p.titre || 'Phase') + '</strong>' +
          '<span style="font-size:0.82rem;font-weight:600">' + pct + '%</span></div>' +
          '<div class="progress-bar-wrap"><div class="progress-bar" style="width:' + pct + '%"></div></div>';
        if (p.date_debut || p.date_fin) {
          html += '<div style="font-size:0.72rem;color:var(--text-3);margin-top:0.2rem">';
          if (p.date_debut) html += fmtDate(p.date_debut);
          if (p.date_debut && p.date_fin) html += ' → ';
          if (p.date_fin) html += fmtDate(p.date_fin);
          html += '</div>';
        }
        html += '</div>';
      });
      html += '</div>';
    }

    // Lots
    if (lots.length) {
      html += '<div class="card"><div class="card-title">Lots</div><div class="data-table"><table>' +
        '<thead><tr><th>Lot</th><th>Entreprise</th><th>Avancement</th><th>Statut</th></tr></thead><tbody>';
      lots.forEach(function (l) {
        var lpct = l.avancement || 0;
        html += '<tr><td><strong>' + esc(l.nom || l.titre || '') + '</strong></td>' +
          '<td>' + esc(l.entreprise || l.intervenant || '—') + '</td>' +
          '<td><div style="display:flex;align-items:center;gap:0.5rem"><div class="progress-bar-wrap" style="flex:1;min-width:60px"><div class="progress-bar" style="width:' + lpct + '%"></div></div><span style="font-size:0.8rem">' + lpct + '%</span></div></td>' +
          '<td><span class="badge ' + badgeClass(l.statut || '') + '">' + esc(l.statut || '—') + '</span></td></tr>';
      });
      html += '</tbody></table></div></div>';
    }

    if (!html || html === '') html = '<div class="empty-state"><div class="empty-text">Aucune donnee de chantier</div></div>';
    $('chantier-avancement').innerHTML = html;
  }).catch(function (e) {
    $('chantier-avancement').innerHTML = '<div class="empty-state"><div class="empty-icon">&#127959;</div><div class="empty-text">Pas de chantier pour ce projet</div></div>';
  });
}

function loadChantierPhotos() {
  var pid = CURRENT_PROJECT || (PROJECTS.length === 1 ? PROJECTS[0].id : '');
  if (!pid) { $('chantier-photos').innerHTML = '<div class="empty-state"><div class="empty-text">Selectionnez un projet</div></div>'; return; }

  apiCall('chantier_photos', { params: { projet_id: pid } }).then(function (photos) {
    if (!photos.length) {
      $('chantier-photos').innerHTML = '<div class="empty-state"><div class="empty-icon">&#128247;</div><div class="empty-text">Aucune photo</div></div>';
      return;
    }
    _lightboxPhotos = photos;
    var html = '<div class="photo-grid">';
    photos.forEach(function (p, i) {
      var src = p.thumbnail_url || p.url;
      html += '<div class="photo-thumb" onclick="window._cpOpenLightbox(' + i + ')">' +
        '<img src="' + esc(src) + '" alt="' + esc(p.titre || '') + '" loading="lazy">' +
        '<div class="photo-label">' + esc(p.titre || p.zone || fmtDate(p.date_prise)) + '</div></div>';
    });
    html += '</div>';
    $('chantier-photos').innerHTML = html;
  }).catch(function (e) {
    $('chantier-photos').innerHTML = '<div class="empty-state"><div class="empty-text">Erreur ou pas de chantier</div></div>';
  });
}

function loadChantierReunions() {
  var pid = CURRENT_PROJECT || (PROJECTS.length === 1 ? PROJECTS[0].id : '');
  if (!pid) { $('chantier-reunions').innerHTML = '<div class="empty-state"><div class="empty-text">Selectionnez un projet</div></div>'; return; }

  apiCall('chantier_reunions', { params: { projet_id: pid } }).then(function (reunions) {
    if (!reunions.length) {
      $('chantier-reunions').innerHTML = '<div class="empty-state"><div class="empty-text">Aucune reunion</div></div>';
      return;
    }
    var html = '';
    reunions.forEach(function (r) {
      html += '<div class="reunion-card">' +
        '<div class="reunion-title">' + esc(r.titre || r.type_reunion || 'Reunion') + ' #' + esc(r.numero || '') + '</div>' +
        '<div class="reunion-date">' + fmtDate(r.date_reunion) + (r.lieu ? ' — ' + esc(r.lieu) : '') + '</div>' +
        (r.ordre_du_jour ? '<div style="font-size:0.82rem;color:var(--text-2);margin-bottom:0.5rem">' + esc(r.ordre_du_jour) + '</div>' : '');

      if (r.actions && r.actions.length) {
        html += '<div class="card-title" style="margin-top:0.5rem">Actions (' + r.actions.length + ')</div><ul class="reunion-actions-list">';
        r.actions.forEach(function (a) {
          var done = a.statut === 'Termine' || a.statut === 'Terminé';
          html += '<li><span class="task-status ' + (done ? 'done' : 'progress') + '"></span>' +
            esc(a.description || a.titre || '') + (a.responsable ? ' — ' + esc(a.responsable) : '') + '</li>';
        });
        html += '</ul>';
      }
      html += '</div>';
    });
    $('chantier-reunions').innerHTML = html;
  }).catch(function (e) {
    $('chantier-reunions').innerHTML = '<div class="empty-state"><div class="empty-text">Erreur: ' + esc(e.message) + '</div></div>';
  });
}

function loadChantierReserves() {
  var pid = CURRENT_PROJECT || (PROJECTS.length === 1 ? PROJECTS[0].id : '');
  if (!pid) { $('chantier-reserves').innerHTML = '<div class="empty-state"><div class="empty-text">Selectionnez un projet</div></div>'; return; }

  apiCall('chantier_reserves', { params: { projet_id: pid } }).then(function (reserves) {
    if (!reserves.length) {
      $('chantier-reserves').innerHTML = '<div class="empty-state"><div class="empty-text">Aucune reserve</div></div>';
      return;
    }
    var html = '';
    reserves.forEach(function (r) {
      html += '<div class="reserve-item">' +
        '<span class="task-status ' + (r.statut === 'Levee' || r.statut === 'Levée' ? 'done' : 'progress') + '"></span>' +
        '<div style="flex:1"><div>' + esc(r.description || r.titre || 'Reserve') + '</div>' +
        '<div class="reserve-loc">' + esc(r.localisation || r.zone || '') + ' — ' + esc(r.lot_nom || '') + '</div></div>' +
        '<span class="badge ' + badgeClass(r.statut) + '">' + esc(r.statut) + '</span>' +
        '<span style="font-size:0.72rem;color:var(--text-3)">' + fmtDate(r.date_constat || r.cree_at) + '</span>' +
        '</div>';
    });
    $('chantier-reserves').innerHTML = html;
  }).catch(function (e) {
    $('chantier-reserves').innerHTML = '<div class="empty-state"><div class="empty-text">Erreur: ' + esc(e.message) + '</div></div>';
  });
}

// Lightbox
window._cpOpenLightbox = function (idx) {
  _lightboxIdx = idx;
  showLightboxImage();
  $('lightbox').classList.add('active');
};

function showLightboxImage() {
  var p = _lightboxPhotos[_lightboxIdx];
  if (p) $('lightbox-img').src = p.url;
}

// ═══════════════════════════════════════════════════════════════
//  INFOS PROJET
// ═══════════════════════════════════════════════════════════════

function loadProjectInfo() {
  var pid = CURRENT_PROJECT || (PROJECTS.length === 1 ? PROJECTS[0].id : '');
  if (!pid) {
    $('projet-info-content').innerHTML = '<div class="empty-state"><div class="empty-text">Selectionnez un projet</div></div>';
    return;
  }

  Promise.all([
    apiCall('project_detail', { params: { projet_id: pid } }),
    apiCall('project_team', { params: { projet_id: pid } })
  ]).then(function (results) {
    var detail = results[0];
    var team = results[1] || [];
    var p = detail.projet;

    var html = '<div class="info-grid"><div class="card">' +
      '<div class="card-title">Fiche projet</div>' +
      infoRow('Code', p.code) +
      infoRow('Nom', p.nom) +
      infoRow('Phase', p.phase) +
      infoRow('Statut', p.statut) +
      infoRow('Type', p.type_bat) +
      infoRow('Surface', p.surface ? p.surface + ' m2' : null) +
      infoRow('Adresse', p.adresse) +
      infoRow('Delai', p.delai) +
      infoRow('Budget', p.budget ? fmtMoney(p.budget) : null) +
      infoRow('Honoraires', p.honoraires ? fmtMoney(p.honoraires) : null) +
      '</div>';

    // Progression
    html += '<div class="card"><div class="card-title">Progression globale</div>' +
      '<div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem">' +
      '<div class="progress-bar" style="flex:1"><div class="fill" style="width:' + detail.progression + '%"></div></div>' +
      '<span class="progress-label">' + detail.progression + '%</span></div>';

    // Missions
    if (detail.missions && detail.missions.length) {
      html += '<div class="card-title" style="margin-top:0.75rem">Missions</div>';
      detail.missions.forEach(function (m) {
        html += '<div style="padding:0.3rem 0;font-size:0.82rem;border-bottom:1px solid var(--border)">' + esc(m.label || m.mission || '') + '</div>';
      });
    }
    html += '</div>';

    // Intervenants
    if (detail.intervenants && detail.intervenants.length) {
      html += '<div class="card"><div class="card-title">Intervenants</div>';
      detail.intervenants.forEach(function (iv) {
        html += '<div class="team-member">' +
          '<div class="tm-avatar">' + esc(initials(iv.nom || iv.entreprise || '')) + '</div>' +
          '<div><div class="tm-name">' + esc(iv.nom || iv.entreprise || '') + '</div>' +
          '<div class="tm-role">' + esc(iv.role || iv.fonction || '') + (iv.tel ? ' — ' + esc(iv.tel) : '') + '</div></div></div>';
      });
      html += '</div>';
    }

    // Equipe Cortoba
    if (team.length) {
      html += '<div class="card"><div class="card-title">Equipe projet Cortoba</div>';
      team.forEach(function (t) {
        html += '<div class="team-member">' +
          '<div class="tm-avatar">' + esc(initials(t.nom || t.entreprise || '')) + '</div>' +
          '<div><div class="tm-name">' + esc(t.nom || t.entreprise || '') + '</div>' +
          '<div class="tm-role">' + esc(t.role || t.fonction || '') + '</div></div></div>';
      });
      html += '</div>';
    }

    html += '</div>'; // close info-grid
    $('projet-info-content').innerHTML = html;
  }).catch(function (e) {
    $('projet-info-content').innerHTML = '<div class="empty-state"><div class="empty-text">Erreur: ' + esc(e.message) + '</div></div>';
  });
}

function infoRow(label, value) {
  if (!value) return '';
  return '<div class="info-item"><div class="info-label">' + esc(label) + '</div><div class="info-value">' + esc(value) + '</div></div>';
}

// ═══════════════════════════════════════════════════════════════
//  JOURNAL D'ACCES
// ═══════════════════════════════════════════════════════════════

var _accessLogLabels = {
  login:             'Connexion',
  logout:            'Deconnexion',
  view_document:     'Consultation document',
  download_document: 'Telechargement document',
  upload_document:   'Envoi document',
  chat_send:         'Message envoye',
  validate:          'Validation',
  change_password:   'Changement mot de passe',
  reset_password:    'Reinitialisation mot de passe'
};

function accessActionLabel(action) {
  return _accessLogLabels[action] || action;
}

function accessActionIcon(action) {
  switch (action) {
    case 'login':             return '&#128275;';
    case 'logout':            return '&#128682;';
    case 'view_document':     return '&#128065;';
    case 'download_document': return '&#128229;';
    case 'upload_document':   return '&#128228;';
    case 'chat_send':         return '&#128172;';
    case 'validate':          return '&#9989;';
    case 'change_password':   return '&#128273;';
    default:                  return '&#128196;';
  }
}

function loadAccessLog(page) {
  page = page || 1;
  var container = $('access-log-list');
  container.innerHTML = '<div class="loading-block"><span class="spinner"></span></div>';

  apiCall('access_log', { params: { page: page } })
    .then(function (data) {
      var entries = data.entries || [];
      if (!entries.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-text">Aucune activite enregistree</div></div>';
        $('access-log-pagination').innerHTML = '';
        return;
      }

      var html = '<div class="card"><div class="card-title">Activite recente</div>' +
        '<table class="data-table"><thead><tr>' +
        '<th>Date</th><th>Action</th><th>Utilisateur</th><th>Adresse IP</th><th>Details</th>' +
        '</tr></thead><tbody>';

      entries.forEach(function (e) {
        var detailStr = '';
        if (e.details) {
          if (typeof e.details === 'object') {
            var parts = [];
            Object.keys(e.details).forEach(function (k) {
              parts.push(esc(k) + ': ' + esc(e.details[k]));
            });
            detailStr = parts.join(', ');
          } else {
            detailStr = esc(String(e.details));
          }
        }
        html += '<tr>' +
          '<td class="nowrap">' + fmtDateTime(e.cree_at) + '</td>' +
          '<td>' + accessActionIcon(e.action) + ' ' + esc(accessActionLabel(e.action)) + '</td>' +
          '<td>' + esc(e.account_nom || e.account_email || '—') + '</td>' +
          '<td class="mono">' + esc(e.ip_address || '—') + '</td>' +
          '<td class="detail-cell">' + (detailStr || '—') + '</td>' +
          '</tr>';
      });

      html += '</tbody></table></div>';
      container.innerHTML = html;

      // Pagination
      var pag = '';
      if (data.total_pages > 1) {
        pag += '<div class="pag-bar">';
        if (page > 1) pag += '<button class="btn-sm" data-alpage="' + (page - 1) + '">&laquo; Precedent</button> ';
        pag += '<span class="pag-info">Page ' + page + ' / ' + data.total_pages + '</span>';
        if (page < data.total_pages) pag += ' <button class="btn-sm" data-alpage="' + (page + 1) + '">Suivant &raquo;</button>';
        pag += '</div>';
      }
      $('access-log-pagination').innerHTML = pag;
      $('access-log-pagination').querySelectorAll('[data-alpage]').forEach(function (btn) {
        btn.addEventListener('click', function () { loadAccessLog(parseInt(this.dataset.alpage)); });
      });
    })
    .catch(function (e) {
      container.innerHTML = '<div class="empty-state"><div class="empty-text">Erreur : ' + esc(e.message) + '</div></div>';
    });
}

// ═══════════════════════════════════════════════════════════════
//  TASKS VIEW (used from dashboard)
// ═══════════════════════════════════════════════════════════════

window._cpViewTasks = function (projetId) {
  apiCall('project_tasks', { params: { projet_id: projetId } }).then(function (tasks) {
    // Build tree
    var html = '<ul class="task-tree">';
    tasks.forEach(function (t) {
      var prog = parseInt(t.progression) || 0;
      var sc = prog >= 100 ? 'done' : prog > 0 ? 'progress' : 'todo';
      html += '<li class="task-item level-' + t.niveau + '">' +
        '<span class="task-status ' + sc + '"></span>' +
        '<span class="task-title">' + esc(t.titre) + '</span>' +
        '<span class="task-prog">' + prog + '%</span>' +
        '<span class="task-date">' + fmtDate(t.date_echeance) + '</span>' +
        '</li>';
    });
    html += '</ul>';
    // Show in a modal or replace milestones
    $('dash-milestones').innerHTML = html;
  });
};

// ═══════════════════════════════════════════════════════════════
//  EVENT BINDINGS
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function () {
  // Login form
  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    doLogin($('login-email').value, $('login-pass').value);
  });

  // Forgot password
  $('forgot-link').addEventListener('click', function (e) {
    e.preventDefault();
    var email = prompt('Entrez votre adresse email :');
    if (!email) return;
    apiCall('reset_password_request', { method: 'POST', body: { email: email } })
      .then(function () { showToast('Si ce compte existe, un email a ete envoye', 'info'); })
      .catch(function (er) { showToast(er.message, 'error'); });
  });

  // Logout
  $('btn-logout').addEventListener('click', doLogout);

  // Sidebar navigation
  document.querySelectorAll('.nav-item[data-page]').forEach(function (nav) {
    nav.addEventListener('click', function () { showPage(this.dataset.page); });
  });

  // Sidebar toggle (mobile)
  $('sidebar-toggle').addEventListener('click', function () {
    $('sidebar').classList.toggle('open');
  });

  // Project selector
  $('project-select').addEventListener('change', function () {
    CURRENT_PROJECT = this.value;
    // Reload current page
    var activePage = document.querySelector('.nav-item.active');
    if (activePage) showPage(activePage.dataset.page);
  });

  // Document filters
  $('doc-filter-cat').addEventListener('change', loadDocuments);
  $('doc-filter-statut').addEventListener('change', loadDocuments);

  // Chat send
  $('chat-send-btn').addEventListener('click', sendChatMessage);
  $('chat-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });
  $('chat-input').addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(100, this.scrollHeight) + 'px';
  });

  // Finance tabs
  document.querySelectorAll('#page-finance .tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('#page-finance .tab').forEach(function (t) { t.classList.remove('active'); });
      this.classList.add('active');
      $('finance-devis').style.display = this.dataset.tab === 'devis' ? '' : 'none';
      $('finance-factures').style.display = this.dataset.tab === 'factures' ? '' : 'none';
    });
  });

  // Validation tabs
  document.querySelectorAll('#page-validations .tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('#page-validations .tab').forEach(function (t) { t.classList.remove('active'); });
      this.classList.add('active');
      $('val-pending').style.display = this.dataset.tab === 'pending' ? '' : 'none';
      $('val-history').style.display = this.dataset.tab === 'history' ? '' : 'none';
    });
  });

  // Chantier tabs
  document.querySelectorAll('#page-chantier .tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('#page-chantier .tab').forEach(function (t) { t.classList.remove('active'); });
      this.classList.add('active');
      $('chantier-avancement').style.display = this.dataset.tab === 'avancement' ? '' : 'none';
      $('chantier-photos').style.display = this.dataset.tab === 'photos' ? '' : 'none';
      $('chantier-reunions').style.display = this.dataset.tab === 'reunions' ? '' : 'none';
      $('chantier-reserves').style.display = this.dataset.tab === 'reserves' ? '' : 'none';
      if (this.dataset.tab === 'avancement') loadChantierAvancement();
      if (this.dataset.tab === 'photos') loadChantierPhotos();
      if (this.dataset.tab === 'reunions') loadChantierReunions();
      if (this.dataset.tab === 'reserves') loadChantierReserves();
    });
  });

  // Validation modal
  $('modal-val-cancel').addEventListener('click', function () { $('modal-validation').classList.remove('active'); });
  $('modal-val-approve').addEventListener('click', function () { submitValidation('approuve'); });
  $('modal-val-refuse').addEventListener('click', function () { submitValidation('refuse'); });
  $('modal-val-reserve').addEventListener('click', function () { submitValidation('approuve_avec_reserves'); });
  $('modal-validation').addEventListener('click', function (e) { if (e.target === this) this.classList.remove('active'); });

  // Signature
  sigInit();
  $('sig-clear').addEventListener('click', sigClear);

  // Lightbox
  $('lightbox-close').addEventListener('click', function () { $('lightbox').classList.remove('active'); });
  $('lightbox').addEventListener('click', function (e) { if (e.target === this) this.classList.remove('active'); });
  $('lightbox-prev').addEventListener('click', function () {
    _lightboxIdx = (_lightboxIdx - 1 + _lightboxPhotos.length) % _lightboxPhotos.length;
    showLightboxImage();
  });
  $('lightbox-next').addEventListener('click', function () {
    _lightboxIdx = (_lightboxIdx + 1) % _lightboxPhotos.length;
    showLightboxImage();
  });
  document.addEventListener('keydown', function (e) {
    if (!$('lightbox').classList.contains('active')) return;
    if (e.key === 'Escape') $('lightbox').classList.remove('active');
    if (e.key === 'ArrowLeft') $('lightbox-prev').click();
    if (e.key === 'ArrowRight') $('lightbox-next').click();
  });

  // Upload
  initUpload();

  // Check session
  checkSession();
});

})();
