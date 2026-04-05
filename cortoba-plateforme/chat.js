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
    me: null
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
      '  <div class="chat-rooms-list" id="chat-rooms-list"></div>',
      '</div>',
      '<div class="chat-main" id="chat-main">',
      '  <div class="chat-main-header">',
      '    <div class="chat-main-title">',
      '      <div class="chat-main-name" id="chat-main-name">Sélectionnez une discussion</div>',
      '      <div class="chat-main-sub"  id="chat-main-sub"></div>',
      '    </div>',
      '    <button class="chat-btn-icon" id="chat-info-btn" title="Infos" style="display:none">',
      '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
      '    </button>',
      '  </div>',
      '  <div class="chat-messages" id="chat-messages">',
      '    <div class="chat-empty">Sélectionnez une discussion à gauche.</div>',
      '  </div>',
      '  <div class="chat-composer" id="chat-composer" style="display:none">',
      '    <textarea id="chat-input" placeholder="Écrivez un message… (Entrée pour envoyer, Maj+Entrée pour retour à la ligne)" rows="1"></textarea>',
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
    document.getElementById('chat-new-dm-btn').onclick = openNewDmPicker;
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
    });
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

    var favs    = STATE.rooms.filter(function (r) { return r.is_favorite; });
    var directs = STATE.rooms.filter(function (r) { return r.type === 'direct' && !r.is_favorite; });
    var projets = STATE.rooms.filter(function (r) { return r.type === 'projet' && !r.is_archived; });
    var archive = STATE.rooms.filter(function (r) { return r.is_archived; });

    if (favs.length)    { list.appendChild(sectionHeader('Favoris / Gérants')); favs.forEach(function (r) { list.appendChild(roomItem(r)); }); }
    if (directs.length) { list.appendChild(sectionHeader('Membres'));           directs.forEach(function (r) { list.appendChild(roomItem(r)); }); }
    if (projets.length) { list.appendChild(sectionHeader('Projets'));           projets.forEach(function (r) { list.appendChild(roomItem(r)); }); }
    if (archive.length) { list.appendChild(sectionHeader('Archives'));          archive.forEach(function (r) { list.appendChild(roomItem(r)); }); }

    if (!STATE.rooms.length) {
      list.appendChild(h('div', { style: 'padding:1rem;font-size:0.75rem;color:var(--text-3);text-align:center' },
        'Aucune discussion. Cliquez sur + pour en démarrer une.'));
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
      } else {
        subEl.textContent = '';
      }
      document.getElementById('chat-composer').style.display = room.supervision ? 'none' : 'flex';
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
        c.innerHTML = esc(m.content).replace(/\n/g, '<br>');
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
  //  Nouvelle conversation directe — picker
  // ═══════════════════════════════════════════════════════════
  function openNewDmPicker() {
    api('users').then(function (r) {
      STATE.users = r.data || [];
      var overlay = document.getElementById('chat-dm-picker');
      if (overlay) overlay.remove();
      overlay = h('div', {
        id: 'chat-dm-picker',
        style: 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9600;display:flex;align-items:center;justify-content:center'
      });
      var box = h('div', { style: 'background:var(--bg-1);border:1px solid var(--border);border-radius:8px;min-width:320px;max-width:420px;width:92%;max-height:80vh;display:flex;flex-direction:column;overflow:hidden' });
      box.appendChild(h('div', { style: 'padding:0.8rem 1rem;border-bottom:1px solid var(--border);font-size:0.82rem;font-weight:600;color:var(--text-1)' }, 'Démarrer une conversation'));
      var list = h('div', { style: 'overflow-y:auto;flex:1;padding:0.4rem 0' });
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
            refreshRooms().then(function () {
              selectRoom(r.data.room_id);
            });
          }).catch(function (e) { alert(e.message || 'Erreur'); });
        };
        list.appendChild(row);
      });
      box.appendChild(list);
      var footer = h('div', { style: 'padding:0.6rem;border-top:1px solid var(--border);text-align:right' });
      var cancel = h('button', { class: 'btn' }, 'Annuler');
      cancel.onclick = function () { overlay.remove(); };
      footer.appendChild(cancel);
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
  function boot() {
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
