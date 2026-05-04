// ═══════════════════════════════════════════════════════════
//  CORTOBA CHAT — Widget messagerie interne
//  Lot 1 (socle) + Lot 2 (groupes projet + auto-adhésion)
//  Transport : long polling (1.5 s quand fenêtre ouverte, 6 s quand fermée)
//  Dépend de : apiFetch, getSession, window._currentUser (plateforme-nas.js — fichier principal)
// ═══════════════════════════════════════════════════════════

(function () {
  'use strict';

  // Éviter double init
  if (window.__cortobaChatInited) return;
  window.__cortobaChatInited = true;

  // ── État global ──
  var STATE = {
    rooms: [],
    users: [],
    currentRoomId: null,
    messages: [],
    lastMessageAt: null,
    pollTimer: null,
    badgeTimer: null,
    isOpen: false,
    me: null,
    searchQuery: ''
  };

  // ── Utils ──
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'style') el.setAttribute('style', attrs[k]);
      else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') el[k] = attrs[k];
      else el.setAttribute(k, attrs[k]);
    }
    if (children != null) {
      if (Array.isArray(children)) children.forEach(function (c) { if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
      else if (typeof children === 'string') el.textContent = children;
      else el.appendChild(children);
    }
    return el;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); }
  function initials(name) {
    if (!name) return '?';
    var parts = String(name).trim().split(/\s+/);
    return ((parts[0] || '')[0] || '') + ((parts[1] || '')[0] || '');
  }
  function fmtTime(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso.replace(' ', 'T'));
      var now = new Date();
      var sameDay = d.toDateString() === now.toDateString();
      if (sameDay) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso; }
  }
  function getMe() {
    if (STATE.me && STATE.me.id) return STATE.me;
    var u = window._currentUser || null;
    if (!u) {
      try { u = JSON.parse(sessionStorage.getItem('cortoba_session') || 'null'); } catch (e) {}
    }
    // Ne pas mettre null en cache (empêche la reprise après login)
    if (u) STATE.me = u;
    return u;
  }
  function api(action, method, body) {
    var url = 'api/chat.php?action=' + encodeURIComponent(action);
    return apiFetch(url, { method: method || 'GET', body: body });
  }

  // ═══════════════════════════════════════════════════════════
  //  UI : construction du widget (bouton flottant + panneau)
  // ═══════════════════════════════════════════════════════════
  function buildUI() {
    if (document.getElementById('chat-fab')) return;

    // FAB
    var fab = h('button', { id: 'chat-fab', title: 'Messagerie', 'aria-label': 'Messagerie' });
    fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span class="chat-fab-badge" id="chat-fab-badge">0</span>';
    fab.onclick = toggleChat;
    document.body.appendChild(fab);

    // Panel
    var panel = h('div', { id: 'chat-panel' });
    panel.innerHTML = [
      '<div class="chat-sidebar">',
      '  <div class="chat-sidebar-header">',
      '    <div class="chat-sidebar-title">Messagerie</div>',
      '    <div style="display:flex;gap:4px">',
      '      <button class="chat-btn-icon" id="chat-new-dm-btn" title="Nouvelle conversation">',
      '        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
      '      </button>',
      '      <button class="chat-btn-icon" id="chat-close-btn" title="Fermer">',
      '        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
      '      </button>',
      '    </div>',
      '  </div>',
      '  <div class="chat-search-wrap">',
      '    <svg class="chat-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
      '    <input type="text" id="chat-search-input" class="chat-search-input" placeholder="Rechercher une discussion…" autocomplete="off">',
      '    <button class="chat-search-clear" id="chat-search-clear" title="Effacer" type="button" style="display:none">',
      '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
      '    </button>',
      '  </div>',
      '  <div class="chat-rooms-list" id="chat-rooms-list"></div>',
      '</div>',
      '<div class="chat-main" id="chat-main">',
      '  <div class="chat-main-header">',
      '    <button class="chat-btn-icon chat-back-btn" id="chat-back-btn" title="Retour">',
      '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="15 18 9 12 15 6"/></svg>',
      '    </button>',
      '    <div class="chat-main-title">',
      '      <div class="chat-main-name" id="chat-main-name">Sélectionnez une discussion</div>',
      '      <div class="chat-main-sub"  id="chat-main-sub"></div>',
      '    </div>',
      '    <button class="chat-btn-icon" id="chat-add-member-btn" title="Ajouter un membre" style="display:none">',
      '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>',
      '    </button>',
      '    <button class="chat-btn-icon" id="chat-info-btn" title="Infos" style="display:none">',
      '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
      '    </button>',
      '  </div>',
      '  <div class="chat-messages" id="chat-messages">',
      '    <div class="chat-empty">Sélectionnez une discussion à gauche.</div>',
      '  </div>',
      '  <div class="chat-composer" id="chat-composer" style="display:none">',
      '    <input type="file" id="chat-file-input" style="display:none">',
      '    <button class="chat-btn-icon" id="chat-attach-btn" title="Joindre un fichier">',
      '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
      '    </button>',
      '    <textarea id="chat-input" placeholder="Écrivez un message… (Entrée pour envoyer)" rows="1"></textarea>',
      '    <button id="chat-send-btn">Envoyer</button>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(panel);

    // Toast
    var toast = h('div', { id: 'chat-toast' });
    toast.innerHTML = '<div class="chat-toast-title"></div><div class="chat-toast-body"></div>';
    document.body.appendChild(toast);
    toast.onclick = function () {
      toast.style.display = 'none';
      openChat();
    };

    // Event bindings
    document.getElementById('chat-close-btn').onclick  = closeChat;
    document.getElementById('chat-back-btn').onclick   = function () {
      var p = document.getElementById('chat-panel');
      if (p) p.classList.remove('viewing-room');
    };
    document.getElementById('chat-new-dm-btn').onclick = openNewConversationPicker;
    document.getElementById('chat-add-member-btn').onclick = openAddMemberPicker;
    document.getElementById('chat-send-btn').onclick   = sendCurrentMessage;
    var input = document.getElementById('chat-input');
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        sendCurrentMessage();
      }
    });
    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(120, input.scrollHeight) + 'px';
      handleMentionInput(input);
    });

    // Recherche dans la liste des discussions
    var searchInput = document.getElementById('chat-search-input');
    var searchClear = document.getElementById('chat-search-clear');
    searchInput.addEventListener('input', function () {
      STATE.searchQuery = searchInput.value || '';
      searchClear.style.display = STATE.searchQuery ? 'flex' : 'none';
      renderRooms();
    });
    searchClear.onclick = function () {
      searchInput.value = '';
      STATE.searchQuery = '';
      searchClear.style.display = 'none';
      renderRooms();
      searchInput.focus();
    };

    // Bouton pièce jointe (trombone)
    document.getElementById('chat-attach-btn').onclick = function () {
      document.getElementById('chat-file-input').click();
    };
    document.getElementById('chat-file-input').onchange = function () {
      var file = this.files && this.files[0];
      if (!file) return;
      handleFileUpload(file);
      this.value = '';
    };
  }

  // ═══════════════════════════════════════════════════════════
  //  Ouverture / fermeture
  // ═══════════════════════════════════════════════════════════
  function toggleChat() { STATE.isOpen ? closeChat() : openChat(); }
  function openChat() {
    STATE.isOpen = true;
    var panel = document.getElementById('chat-panel');
    if (panel) panel.classList.add('open');
    refreshRooms().then(function () {
      if (!STATE.currentRoomId && STATE.rooms.length > 0) {
        selectRoom(STATE.rooms[0].id);
      } else if (STATE.currentRoomId) {
        loadMessages(true);
      }
    });
    startFastPoll();
  }
  function closeChat() {
    STATE.isOpen = false;
    var panel = document.getElementById('chat-panel');
    if (panel) panel.classList.remove('open');
    startSlowPoll();
  }

  // ═══════════════════════════════════════════════════════════
  //  Rooms : listing + sélection
  // ═══════════════════════════════════════════════════════════
  function refreshRooms() {
    return api('rooms').then(function (r) {
      STATE.rooms = r.data || [];
      renderRooms();
      updateGlobalBadge();
    }).catch(function () { /* silencieux */ });
  }

  function renderRooms() {
    var list = document.getElementById('chat-rooms-list');
    if (!list) return;
    list.innerHTML = '';

    var q = (STATE.searchQuery || '').trim().toLowerCase();
    var rooms = STATE.rooms;
    if (q) {
      rooms = rooms.filter(function (r) {
        var name = r.name || (r.other_user && r.other_user.user_name) || '';
        var last = r.last_message || '';
        return name.toLowerCase().indexOf(q) !== -1 || last.toLowerCase().indexOf(q) !== -1;
      });
    }

    var favs    = rooms.filter(function (r) { return r.is_favorite; });
    var directs = rooms.filter(function (r) { return r.type === 'direct' && !r.is_favorite; });
    var canaux  = rooms.filter(function (r) { return r.type === 'canal' && !r.is_archived; });
    var projets = rooms.filter(function (r) { return r.type === 'projet' && !r.is_archived; });
    var archive = rooms.filter(function (r) { return r.is_archived; });

    if (favs.length)    { list.appendChild(sectionHeader('Favoris / Gérants')); favs.forEach(function (r) { list.appendChild(roomItem(r)); }); }
    if (canaux.length)  { list.appendChild(sectionHeader('Canaux'));            canaux.forEach(function (r) { list.appendChild(roomItem(r)); }); }
    if (directs.length) { list.appendChild(sectionHeader('Membres'));           directs.forEach(function (r) { list.appendChild(roomItem(r)); }); }
    if (projets.length) { list.appendChild(sectionHeader('Projets'));           projets.forEach(function (r) { list.appendChild(roomItem(r)); }); }
    if (archive.length) { list.appendChild(sectionHeader('Archives'));          archive.forEach(function (r) { list.appendChild(roomItem(r)); }); }

    if (!rooms.length) {
      var msg = q
        ? 'Aucune discussion ne correspond à « ' + esc(STATE.searchQuery) + ' ».'
        : (STATE.rooms.length ? '' : 'Aucune discussion. Cliquez sur + pour en démarrer une.');
      if (msg) {
        list.appendChild(h('div', { style: 'padding:1rem;font-size:0.75rem;color:var(--text-3);text-align:center' }, msg));
      }
    }
  }
  function sectionHeader(label) { return h('div', { class: 'chat-section' }, label); }

  function roomItem(room) {
    var name = room.name || (room.other_user && room.other_user.user_name) || 'Discussion';
    var sub  = room.last_message || (room.type === 'projet' ? 'Groupe projet' : '');
    if (sub && sub.length > 60) sub = sub.slice(0, 60) + '…';

    var avatar = h('div', { class: 'chat-room-avatar' });
    if (room.type === 'direct' && room.other_user) {
      if (room.other_user.profile_picture_url) {
        avatar.innerHTML = '<img src="' + esc(room.other_user.profile_picture_url) + '" alt="">';
      } else {
        avatar.style.background = room.other_user.color || 'var(--accent)';
        avatar.textContent = initials(name);
      }
    } else if (room.type === 'projet') {
      avatar.textContent = '#';
    } else if (room.type === 'canal') {
      avatar.style.background = '#5b6eae';
      avatar.textContent = '📢';
      avatar.style.fontSize = '0.9rem';
    } else {
      avatar.textContent = initials(name);
    }

    var nameEl = h('div', { class: 'chat-room-name' }, name);
    if (room.supervision) nameEl.appendChild(h('span', { class: 'chat-supervision-tag' }, 'superviseur'));

    var info = h('div', { class: 'chat-room-info' }, [
      nameEl,
      h('div', { class: 'chat-room-sub' }, sub)
    ]);

    var item = h('div', { class: 'chat-room-item' + (room.id === STATE.currentRoomId ? ' active' : '') }, [avatar, info]);
    if (room.unread > 0) item.appendChild(h('div', { class: 'chat-room-badge' }, String(room.unread)));

    item.onclick = function () { selectRoom(room.id); };
    return item;
  }

  function selectRoom(roomId) {
    STATE.currentRoomId = roomId;
    STATE.messages = [];
    STATE.lastMessageAt = null;
    renderRooms();

    // Mobile : basculer vers la vue messages
    var panel = document.getElementById('chat-panel');
    if (panel) panel.classList.add('viewing-room');

    var room = STATE.rooms.find(function (r) { return r.id === roomId; });
    var nameEl = document.getElementById('chat-main-name');
    var subEl  = document.getElementById('chat-main-sub');
    if (room) {
      var displayName = room.name || (room.other_user && room.other_user.user_name) || 'Discussion';
      nameEl.textContent = displayName;
      if (room.type === 'direct' && room.other_user) {
        subEl.textContent = (room.other_user.role || '') + (room.other_user.online ? ' · En ligne' : '');
      } else if (room.type === 'projet') {
        var count = (room.participants || []).length;
        subEl.textContent = count + ' participant' + (count > 1 ? 's' : '') + (room.supervision ? ' · accès supervision' : '');
      } else if (room.type === 'canal') {
        subEl.textContent = (room.topic || '') + (room.member_count ? ' · ' + room.member_count + ' membres' : '');
      } else {
        subEl.textContent = '';
      }
      document.getElementById('chat-composer').style.display = room.supervision ? 'none' : 'flex';
      // Bouton ajouter membre : visible uniquement sur projet et canal (et pas supervision)
      var addMemberBtn = document.getElementById('chat-add-member-btn');
      if (addMemberBtn) {
        addMemberBtn.style.display = (!room.supervision && (room.type === 'projet' || room.type === 'canal')) ? 'flex' : 'none';
      }
    }
    loadMessages(true);

    // Marquer comme lu
    api('mark_read', 'POST', { room_id: roomId }).then(function () {
      var r = STATE.rooms.find(function (x) { return x.id === roomId; });
      if (r) r.unread = 0;
      renderRooms();
      updateGlobalBadge();
    }).catch(function () {});
  }

  // ═══════════════════════════════════════════════════════════
  //  Messages : chargement + polling + envoi
  // ═══════════════════════════════════════════════════════════
  function loadMessages(reset) {
    if (!STATE.currentRoomId) return Promise.resolve();
    var params = 'room_id=' + encodeURIComponent(STATE.currentRoomId);
    if (!reset && STATE.lastMessageAt) params += '&since=' + encodeURIComponent(STATE.lastMessageAt);
    return apiFetch('api/chat.php?action=messages&' + params).then(function (r) {
      var data = r.data || {};
      var msgs = data.messages || [];
      if (reset) STATE.messages = msgs;
      else if (msgs.length) STATE.messages = STATE.messages.concat(msgs);
      if (msgs.length) STATE.lastMessageAt = msgs[msgs.length - 1].cree_at;
      renderMessages(reset || msgs.length > 0);
    }).catch(function () {});
  }

  function renderMessages(scroll) {
    var box = document.getElementById('chat-messages');
    if (!box) return;
    if (!STATE.messages.length) {
      box.innerHTML = '<div class="chat-empty">Aucun message pour le moment. Lancez la discussion !</div>';
      return;
    }
    var me = getMe();
    var meId = (me && me.id) || '';
    box.innerHTML = '';
    STATE.messages.forEach(function (m) {
      if (m.kind === 'system') {
        box.appendChild(h('div', { class: 'chat-msg system' }, [
          h('div', { class: 'chat-msg-body' }, m.content || '')
        ]));
        return;
      }
      var mine = m.sender_id === meId;
      var av = h('div', { class: 'chat-msg-avatar' });
      if (m.profile_picture_url) {
        av.innerHTML = '<img src="' + esc(m.profile_picture_url) + '" alt="">';
      } else {
        av.style.background = m.color || '#555';
        av.textContent = initials(m.sender_name);
      }
      var bodyChildren = [];
      if (!mine) bodyChildren.push(h('div', { class: 'chat-msg-sender' }, m.sender_name || ''));
      if (m.content) {
        var c = h('div', { class: 'chat-msg-content' });
        var escaped = esc(m.content).replace(/\n/g, '<br>');
        // Highlight @mentions
        escaped = escaped.replace(/@([A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ]+(?:\s+[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ]+)*)/g, '<span class="chat-mention-tag">@$1</span>');
        c.innerHTML = escaped;
        bodyChildren.push(c);
      }
      if (m.attachment_url) {
        var a = h('a', { href: m.attachment_url, target: '_blank', style: 'color:var(--accent);font-size:0.72rem;display:inline-block;margin-top:0.2rem' }, '📎 ' + (m.attachment_name || 'Pièce jointe'));
        bodyChildren.push(a);
      }
      bodyChildren.push(h('div', { class: 'chat-msg-time' }, fmtTime(m.cree_at) + (mine ? ' ✓' : '')));
      var body = h('div', { class: 'chat-msg-body' }, bodyChildren);
      var msgEl = h('div', { class: 'chat-msg' + (mine ? ' me' : '') }, [av, body]);
      // Clic droit sur message (groupe projet uniquement) → épingler comme info critique
      msgEl.oncontextmenu = function (ev) {
        ev.preventDefault();
        var room = STATE.rooms.find(function (r) { return r.id === STATE.currentRoomId; });
        if (!room || room.type !== 'projet') return;
        var label = prompt('Épingler comme information critique.\nLibellé (optionnel) :', '');
        if (label === null) return;
        api('pin_message', 'POST', { message_id: m.id, label: label || '' }).then(function () {
          loadMessages(false);
          showToast('Épinglé', 'Message ajouté au Decision Log');
        }).catch(function (e) { alert(e.message || 'Erreur'); });
      };
      box.appendChild(msgEl);
    });
    if (scroll) box.scrollTop = box.scrollHeight;
  }

  function sendCurrentMessage() {
    var input = document.getElementById('chat-input');
    var text = (input.value || '').trim();
    if (!text) return;
    if (!STATE.currentRoomId) return;
    var btn = document.getElementById('chat-send-btn');
    btn.disabled = true;
    var payload = { room_id: STATE.currentRoomId, content: text };
    api('send', 'POST', payload).then(function () {
      input.value = '';
      input.style.height = 'auto';
      loadMessages(false);
      refreshRooms();
    }).catch(function (e) {
      alert('Erreur envoi : ' + (e.message || e));
    }).then(function () { btn.disabled = false; });
  }

  // ═══════════════════════════════════════════════════════════
  //  Ajouter un membre à la discussion
  // ═══════════════════════════════════════════════════════════
  function openAddMemberPicker() {
    if (!STATE.currentRoomId) return;
    var room = STATE.rooms.find(function (r) { return r.id === STATE.currentRoomId; });
    if (!room) return;

    // Charger la liste des utilisateurs
    api('users').then(function (r) {
      STATE.users = r.data || [];

      // Récupérer les participants actuels de la room
      var currentParticipants = {};
      if (room.participants) {
        room.participants.forEach(function (p) { currentParticipants[p.user_id] = true; });
      }
      // Pour les DM / canal sans participants chargés, on filtre côté serveur (add_participant est idempotent)

      var overlay = document.getElementById('chat-add-member-overlay');
      if (overlay) overlay.remove();
      overlay = h('div', {
        id: 'chat-add-member-overlay',
        style: 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9600;display:flex;align-items:center;justify-content:center'
      });
      var box = h('div', { style: 'background:var(--bg-1);border:1px solid var(--border);border-radius:8px;min-width:300px;max-width:400px;width:90%;max-height:70vh;display:flex;flex-direction:column;overflow:hidden' });
      box.appendChild(h('div', { style: 'padding:0.8rem 1rem;border-bottom:1px solid var(--border);font-size:0.82rem;font-weight:600;color:var(--text-1)' }, 'Gérer les membres'));

      // Barre de recherche
      var searchInput = h('input', {
        type: 'text',
        placeholder: 'Rechercher un membre…',
        style: 'margin:0.5rem 0.8rem;padding:0.4rem 0.6rem;background:var(--bg-2);border:1px solid var(--border);color:var(--text-1);border-radius:5px;font-size:0.78rem;outline:none'
      });
      box.appendChild(searchInput);

      var list = h('div', { style: 'overflow-y:auto;flex:1;padding:0.3rem 0' });

      function renderMembers(query) {
        list.innerHTML = '';
        var q = (query || '').toLowerCase();
        var filtered = STATE.users.filter(function (u) {
          if (q && u.name.toLowerCase().indexOf(q) === -1) return false;
          return true;
        });
        if (!filtered.length) {
          list.appendChild(h('div', { style: 'padding:1rem;text-align:center;color:var(--text-3);font-size:0.75rem' }, 'Aucun membre trouvé'));
          return;
        }
        filtered.forEach(function (u) {
          var alreadyIn = currentParticipants[u.id];
          var avatar = h('div', {
            class: 'chat-room-avatar',
            style: 'width:28px;height:28px;font-size:0.64rem;background:' + (u.color || 'var(--accent)')
          }, u.profile_picture_url
            ? h('img', { src: u.profile_picture_url, alt: '', style: 'width:100%;height:100%;object-fit:cover' })
            : initials(u.name));
          var info = h('div', { style: 'flex:1;min-width:0' }, [
            h('div', { style: 'font-size:0.78rem;color:var(--text-1)' }, u.name),
            h('div', { style: 'font-size:0.66rem;color:var(--text-3)' }, alreadyIn ? '✓ Membre' : (u.role || ''))
          ]);
          var children = [avatar, info];

          // Bouton retirer (si déjà membre)
          if (alreadyIn) {
            var removeBtn = h('button', {
              style: 'background:none;border:1px solid #d45656;color:#d45656;border-radius:4px;padding:0.2rem 0.5rem;font-size:0.66rem;cursor:pointer;white-space:nowrap'
            }, 'Retirer');
            removeBtn.onclick = function (ev) {
              ev.stopPropagation();
              if (!confirm('Retirer ' + u.name + ' de cette discussion ?')) return;
              removeBtn.disabled = true;
              removeBtn.textContent = '…';
              api('remove_participant', 'POST', { room_id: STATE.currentRoomId, user_id: u.id }).then(function () {
                delete currentParticipants[u.id];
                renderMembers(searchInput.value);
                refreshRooms();
                loadMessages(true);
              }).catch(function (e) {
                alert(e.message || 'Erreur');
                removeBtn.disabled = false;
                removeBtn.textContent = 'Retirer';
              });
            };
            children.push(removeBtn);
          }

          var row = h('div', {
            style: 'display:flex;align-items:center;gap:0.6rem;padding:0.5rem 1rem;cursor:' + (alreadyIn ? 'default' : 'pointer')
          }, children);

          if (!alreadyIn) {
            // Bouton ajouter
            var addBtn = h('button', {
              style: 'background:none;border:1px solid var(--accent);color:var(--accent);border-radius:4px;padding:0.2rem 0.5rem;font-size:0.66rem;cursor:pointer;white-space:nowrap'
            }, 'Ajouter');
            addBtn.onclick = function (ev) {
              ev.stopPropagation();
              addBtn.disabled = true;
              addBtn.textContent = '…';
              api('add_participant', 'POST', { room_id: STATE.currentRoomId, user_id: u.id }).then(function () {
                currentParticipants[u.id] = true;
                renderMembers(searchInput.value);
                refreshRooms();
                loadMessages(true);
              }).catch(function (e) {
                alert(e.message || 'Erreur');
                addBtn.disabled = false;
                addBtn.textContent = 'Ajouter';
              });
            };
            row.appendChild(addBtn);
            row.onmouseenter = function () { row.style.background = 'rgba(255,255,255,0.04)'; };
            row.onmouseleave = function () { row.style.background = ''; };
          }
          list.appendChild(row);
        });
      }
      renderMembers('');
      searchInput.addEventListener('input', function () { renderMembers(this.value); });

      var footer = h('div', { style: 'padding:0.5rem 0.8rem;border-top:1px solid var(--border);text-align:right' });
      var closeBtn = h('button', { class: 'btn', style: 'font-size:0.76rem' }, 'Fermer');
      closeBtn.onclick = function () { overlay.remove(); };
      footer.appendChild(closeBtn);
      box.appendChild(list);
      box.appendChild(footer);
      overlay.appendChild(box);
      overlay.onclick = function (ev) { if (ev.target === overlay) overlay.remove(); };
      document.body.appendChild(overlay);
    }).catch(function (e) { alert(e.message || 'Erreur'); });
  }

  // ═══════════════════════════════════════════════════════════
  //  Upload fichier (trombone)
  // ═══════════════════════════════════════════════════════════
  function handleFileUpload(file) {
    if (!STATE.currentRoomId) return;
    if (file.size > 15 * 1024 * 1024) { alert('Fichier trop volumineux (max 15 Mo)'); return; }

    var btn = document.getElementById('chat-send-btn');
    var attachBtn = document.getElementById('chat-attach-btn');
    btn.disabled = true;
    attachBtn.disabled = true;

    var formData = new FormData();
    formData.append('file', file);

    var token = sessionStorage.getItem('cortoba_token');
    fetch('api/upload_chat_file.php', {
      method: 'POST',
      headers: token ? { 'Authorization': 'Bearer ' + token } : {},
      body: formData
    })
    .then(function (resp) { return resp.json(); })
    .then(function (r) {
      if (!r.success && r.error) throw new Error(r.error);
      var data = r.data || r;
      // Envoyer le message avec pièce jointe
      return api('send', 'POST', {
        room_id: STATE.currentRoomId,
        content: '',
        attachment_url: data.url,
        attachment_name: data.name || file.name
      });
    })
    .then(function () {
      loadMessages(false);
      refreshRooms();
    })
    .catch(function (e) { alert('Erreur upload : ' + (e.message || e)); })
    .then(function () { btn.disabled = false; attachBtn.disabled = false; });
  }

  // ═══════════════════════════════════════════════════════════
  //  @mentions — autocomplete
  // ═══════════════════════════════════════════════════════════
  function handleMentionInput(input) {
    var val = input.value;
    var pos = input.selectionStart;
    // Chercher un @ suivi de texte avant la position du curseur
    var before = val.substring(0, pos);
    var match = before.match(/@([A-Za-zÀ-ÖØ-öø-ÿ]{1,})$/);
    if (!match) { closeMentionPopup(); return; }
    var query = match[1].toLowerCase();
    if (!STATE.users || !STATE.users.length) {
      api('users').then(function (r) { STATE.users = r.data || []; showMentionPopup(query, match.index, input); });
    } else {
      showMentionPopup(query, match.index, input);
    }
  }

  function showMentionPopup(query, atIndex, input) {
    var filtered = STATE.users.filter(function (u) {
      return u.name && u.name.toLowerCase().indexOf(query) !== -1;
    }).slice(0, 6);
    if (!filtered.length) { closeMentionPopup(); return; }

    var popup = document.getElementById('chat-mention-popup');
    if (!popup) {
      popup = h('div', { id: 'chat-mention-popup', class: 'chat-mention-popup' });
      document.body.appendChild(popup);
    }
    popup.innerHTML = '';
    filtered.forEach(function (u) {
      var row = h('div', { class: 'chat-mention-item' }, [
        h('span', { class: 'chat-mention-avatar', style: 'background:' + (u.color || '#c8a96e') }, initials(u.name)),
        h('span', null, u.name)
      ]);
      row.onclick = function () {
        // Remplacer @query par @Prénom Nom
        var before = input.value.substring(0, atIndex);
        var after  = input.value.substring(input.selectionStart);
        input.value = before + '@' + u.name + ' ' + after;
        input.focus();
        var newPos = atIndex + u.name.length + 2;
        input.setSelectionRange(newPos, newPos);
        closeMentionPopup();
      };
      popup.appendChild(row);
    });

    // Position : juste au-dessus du textarea
    var rect = input.getBoundingClientRect();
    popup.style.left = rect.left + 'px';
    popup.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    popup.style.display = 'block';
  }

  function closeMentionPopup() {
    var popup = document.getElementById('chat-mention-popup');
    if (popup) popup.style.display = 'none';
  }

  // ═══════════════════════════════════════════════════════════
  //  Créer un canal thématique
  // ═══════════════════════════════════════════════════════════
  function promptCreateCanal() {
    var name = prompt('Nom du canal (ex: coordination-chantier, veille-technique) :');
    if (!name || !name.trim()) return;
    var topic = prompt('Sujet / description (optionnel) :') || '';
    api('create_canal', 'POST', { name: name.trim(), topic: topic.trim() }).then(function (r) {
      refreshRooms().then(function () { selectRoom(r.data.room_id); });
    }).catch(function (e) { alert(e.message || 'Erreur'); });
  }

  // ═══════════════════════════════════════════════════════════
  //  Nouvelle conversation — picker (DM + Projet + Canal)
  // ═══════════════════════════════════════════════════════════
  function openNewConversationPicker() {
    // Charger utilisateurs et projets en parallèle (projets optionnel)
    var pUsers   = api('users');
    var pProjets = api('projects_for_chat').catch(function () { return { data: [] }; });
    var pCanaux  = api('list_canaux').catch(function () { return { data: [] }; });
    Promise.all([pUsers, pProjets, pCanaux]).then(function (results) {
      STATE.users = results[0].data || [];
      var projets = results[1].data || [];
      var canaux  = results[2].data || [];

      var overlay = document.getElementById('chat-dm-picker');
      if (overlay) overlay.remove();
      overlay = h('div', {
        id: 'chat-dm-picker',
        style: 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9600;display:flex;align-items:center;justify-content:center'
      });
      var box = h('div', { style: 'background:var(--bg-1);border:1px solid var(--border);border-radius:8px;min-width:320px;max-width:440px;width:92%;max-height:80vh;display:flex;flex-direction:column;overflow:hidden' });
      box.appendChild(h('div', { style: 'padding:0.8rem 1rem;border-bottom:1px solid var(--border);font-size:0.82rem;font-weight:600;color:var(--text-1)' }, 'Nouvelle conversation'));
      var list = h('div', { style: 'overflow-y:auto;flex:1;padding:0.4rem 0' });

      // ── Section Canaux ──
      list.appendChild(h('div', { class: 'chat-section' }, 'Canaux thématiques'));
      // Bouton créer un canal
      var createRow = h('div', {
        style: 'display:flex;align-items:center;gap:0.6rem;padding:0.55rem 1rem;cursor:pointer'
      }, [
        h('div', { class: 'chat-room-avatar', style: 'background:#5b6eae;font-size:0.9rem' }, '+'),
        h('div', { style: 'flex:1;min-width:0' }, [
          h('div', { style: 'font-size:0.8rem;color:var(--accent);font-weight:600' }, 'Créer un canal'),
          h('div', { style: 'font-size:0.68rem;color:var(--text-3)' }, 'Discussion thématique ouverte')
        ])
      ]);
      createRow.onmouseenter = function () { createRow.style.background = 'rgba(255,255,255,0.04)'; };
      createRow.onmouseleave = function () { createRow.style.background = ''; };
      createRow.onclick = function () {
        overlay.remove();
        promptCreateCanal();
      };
      list.appendChild(createRow);

      // Canaux existants (non-membre uniquement, pour rejoindre)
      canaux.filter(function (c) { return !c.is_member && !c.is_archived; }).forEach(function (c) {
        var row = h('div', {
          style: 'display:flex;align-items:center;gap:0.6rem;padding:0.55rem 1rem;cursor:pointer'
        }, [
          h('div', { class: 'chat-room-avatar', style: 'background:#5b6eae;font-size:0.9rem' }, '📢'),
          h('div', { style: 'flex:1;min-width:0' }, [
            h('div', { style: 'font-size:0.8rem;color:var(--text-1)' }, c.name || 'Canal'),
            h('div', { style: 'font-size:0.68rem;color:var(--text-3)' }, (c.topic || '') + ' · ' + (c.member_count || 0) + ' membres')
          ])
        ]);
        row.onmouseenter = function () { row.style.background = 'rgba(255,255,255,0.04)'; };
        row.onmouseleave = function () { row.style.background = ''; };
        row.onclick = function () {
          api('join_canal', 'POST', { room_id: c.id }).then(function () {
            overlay.remove();
            refreshRooms().then(function () { selectRoom(c.id); });
          }).catch(function (e) { alert(e.message || 'Erreur'); });
        };
        list.appendChild(row);
      });

      // ── Section Projets ──
      if (projets.length) {
        list.appendChild(h('div', { class: 'chat-section' }, 'Groupes projet'));
        projets.forEach(function (p) {
          var label = (p.code ? p.code + ' — ' : '') + (p.nom || 'Projet');
          var row = h('div', {
            style: 'display:flex;align-items:center;gap:0.6rem;padding:0.55rem 1rem;cursor:pointer'
          }, [
            h('div', { class: 'chat-room-avatar', style: 'background:var(--accent);font-size:0.8rem' }, '#'),
            h('div', { style: 'flex:1;min-width:0' }, [
              h('div', { style: 'font-size:0.8rem;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, label),
              h('div', { style: 'font-size:0.68rem;color:var(--text-3)' }, p.statut || 'En cours')
            ])
          ]);
          row.onmouseenter = function () { row.style.background = 'rgba(255,255,255,0.04)'; };
          row.onmouseleave = function () { row.style.background = ''; };
          row.onclick = function () {
            api('create_project_room', 'POST', { projet_id: p.id }).then(function (r) {
              overlay.remove();
              refreshRooms().then(function () { selectRoom(r.data.room_id); });
            }).catch(function (e) { alert(e.message || 'Erreur'); });
          };
          list.appendChild(row);
        });
      }

      // ── Section Membres ──
      list.appendChild(h('div', { class: 'chat-section' }, 'Message direct'));
      STATE.users.forEach(function (u) {
        var row = h('div', {
          style: 'display:flex;align-items:center;gap:0.6rem;padding:0.55rem 1rem;cursor:pointer'
        }, [
          h('div', {
            class: 'chat-room-avatar',
            style: 'background:' + (u.color || 'var(--accent)')
          }, u.profile_picture_url
            ? h('img', { src: u.profile_picture_url, alt: '', style: 'width:100%;height:100%;object-fit:cover' })
            : initials(u.name)),
          h('div', { style: 'flex:1;min-width:0' }, [
            h('div', { style: 'font-size:0.8rem;color:var(--text-1)' }, u.name),
            h('div', { style: 'font-size:0.68rem;color:var(--text-3)' }, (u.role || '') + (u.online ? ' · En ligne' : ''))
          ])
        ]);
        row.onmouseenter = function () { row.style.background = 'rgba(255,255,255,0.04)'; };
        row.onmouseleave = function () { row.style.background = ''; };
        row.onclick = function () {
          api('open_direct', 'POST', { user_id: u.id }).then(function (r) {
            overlay.remove();
            refreshRooms().then(function () { selectRoom(r.data.room_id); });
          }).catch(function (e) { alert(e.message || 'Erreur'); });
        };
        list.appendChild(row);
      });

      var footer = h('div', { style: 'padding:0.6rem;border-top:1px solid var(--border);text-align:right' });
      var cancel = h('button', { class: 'btn' }, 'Annuler');
      cancel.onclick = function () { overlay.remove(); };
      footer.appendChild(cancel);
      box.appendChild(list);
      box.appendChild(footer);
      overlay.appendChild(box);
      overlay.onclick = function (ev) { if (ev.target === overlay) overlay.remove(); };
      document.body.appendChild(overlay);
    }).catch(function (e) { alert(e.message || 'Erreur'); });
  }

  // ═══════════════════════════════════════════════════════════
  //  Polling (long polling côté front)
  // ═══════════════════════════════════════════════════════════
  function stopPoll() {
    if (STATE.pollTimer) { clearInterval(STATE.pollTimer); STATE.pollTimer = null; }
  }
  function startFastPoll() {
    stopPoll();
    STATE.pollTimer = setInterval(function () {
      if (STATE.currentRoomId) loadMessages(false);
      refreshRooms();
    }, 2500);
  }
  function startSlowPoll() {
    stopPoll();
    STATE.pollTimer = setInterval(function () {
      checkForNewBackground();
    }, 8000);
  }

  // Background check : détecter nouveaux messages + afficher toast
  function checkForNewBackground() {
    api('unread_count').then(function (r) {
      var n = (r.data && r.data.unread) || 0;
      setBadge(n);
      if (n > 0) {
        // Rafraîchir pour voir s'il y a une room avec un nouveau dernier message
        refreshRoomsSilent();
      }
    }).catch(function () {});
  }

  function refreshRoomsSilent() {
    api('rooms').then(function (r) {
      var newRooms = r.data || [];
      // Détecter un nouveau message (au moins une room avec unread > 0 et last_message_at > last known)
      var toast = null;
      for (var i = 0; i < newRooms.length; i++) {
        var nr = newRooms[i];
        var old = STATE.rooms.find(function (o) { return o.id === nr.id; });
        if (nr.unread > 0 && (!old || nr.last_message_at !== old.last_message_at)) {
          toast = {
            title: nr.name || (nr.other_user && nr.other_user.user_name) || 'Nouveau message',
            body: nr.last_message || ''
          };
          break;
        }
      }
      STATE.rooms = newRooms;
      if (toast && !STATE.isOpen) showToast(toast.title, toast.body);
    }).catch(function () {});
  }

  function showToast(title, body) {
    var el = document.getElementById('chat-toast');
    if (!el) return;
    el.querySelector('.chat-toast-title').textContent = title;
    el.querySelector('.chat-toast-body').textContent  = body;
    el.style.display = 'block';
    clearTimeout(el._hideT);
    el._hideT = setTimeout(function () { el.style.display = 'none'; }, 5000);
  }

  // ═══════════════════════════════════════════════════════════
  //  Badge global (cloche navbar + FAB)
  // ═══════════════════════════════════════════════════════════
  function updateGlobalBadge() {
    var total = 0;
    STATE.rooms.forEach(function (r) { total += (r.unread || 0); });
    setBadge(total);
  }
  function setBadge(n) {
    var b = document.getElementById('chat-fab-badge');
    if (b) {
      b.textContent = n > 99 ? '99+' : String(n);
      b.style.display = n > 0 ? 'flex' : 'none';
    }
    // Expose globalement pour que la navbar/cloche puisse lire
    window.__chatUnread = n;
    // Dispatch event pour intégration cloche navbar existante
    try { document.dispatchEvent(new CustomEvent('chat-unread', { detail: { count: n } })); } catch (e) {}
  }

  // ═══════════════════════════════════════════════════════════
  //  Entrée publique : intégration depuis d'autres modules
  // ═══════════════════════════════════════════════════════════
  window.CortobaChat = {
    open: openChat,
    close: closeChat,
    toggle: toggleChat,
    // Ouvrir directement la discussion d'un projet (depuis la fiche Suivi)
    openProjectRoom: function (projetId) {
      if (!projetId) return;
      // Créer/récupérer la room projet côté serveur, puis la sélectionner
      api('create_project_room', 'POST', { projet_id: projetId }).then(function (r) {
        var rid = r.data && r.data.room_id;
        if (!rid) return;
        openChat();
        refreshRooms().then(function () { selectRoom(rid); });
      }).catch(function (e) { alert(e.message || 'Impossible d\'ouvrir la discussion'); });
    },
    refresh: refreshRooms,
    getUnread: function () { return window.__chatUnread || 0; }
  };

  // ═══════════════════════════════════════════════════════════
  //  Boot : attendre qu'il y ait une session
  // ═══════════════════════════════════════════════════════════
  function isLoginVisible() {
    var ls = document.getElementById('login-screen');
    return ls && ls.style.display !== 'none';
  }

  function boot() {
    // Ne pas démarrer si la page de login est affichée
    if (isLoginVisible()) {
      setTimeout(boot, 2000);
      return;
    }
    var token = sessionStorage.getItem('cortoba_token');
    if (!token) {
      // Pas encore connecté → retenter
      setTimeout(boot, 1500);
      return;
    }
    // Récupérer le profil complet (avec id) via /auth.php?action=me
    apiFetch('api/auth.php?action=me').then(function (r) {
      var me = r.data || r;
      if (!me || !me.id) throw new Error('Profil incomplet');
      // Fusionner avec la session existante pour conserver isAdmin/modules
      var sess = null;
      try { sess = JSON.parse(sessionStorage.getItem('cortoba_session') || 'null'); } catch (e) {}
      STATE.me = {
        id:      me.id,
        name:    me.name || (sess && sess.name) || '',
        email:   me.email || (sess && sess.email) || '',
        role:    me.role || (sess && sess.role) || '',
        isAdmin: (sess && sess.isAdmin) || me.isAdmin || false,
        profile_picture_url: me.profile_picture_url || null
      };
      window._currentUser = window._currentUser || STATE.me;

      buildUI();
      var fab = document.getElementById('chat-fab');
      if (fab) fab.style.display = 'flex';
      refreshRooms();
      startSlowPoll();
    }).catch(function () {
      // Token invalide ou pas encore prêt → retenter
      setTimeout(boot, 2500);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
