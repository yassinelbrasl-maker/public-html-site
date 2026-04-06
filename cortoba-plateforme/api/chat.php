<?php
// ═══════════════════════════════════════════════════════════════
//  api/chat.php — API messagerie interne Cortoba (Lot 1 + Lot 2)
//  Transport : long polling PHP (pas de WebSocket requis)
//  Dépend de : config/middleware.php, api/chat_helpers.php
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/middleware.php';
require_once __DIR__ . '/chat_helpers.php';
require_once __DIR__ . '/notifications.php';

// ── Lot 7 : actions publiques (token client) sans auth JWT ──
$publicAction = $_GET['action'] ?? '';
if (in_array($publicAction, ['client_view','client_send'], true)) {
    chat_ensure_schema();
    if ($publicAction === 'client_view') { clientView(); exit; }
    if ($publicAction === 'client_send') { clientSend(); exit; }
}

$user = requireAuth();
chat_ensure_schema();

// Heartbeat présence (silencieux)
try {
    $db = getDB();
    $db->prepare("REPLACE INTO CA_chat_presence (user_id, last_seen) VALUES (?, NOW())")
       ->execute([$user['id'] ?? '']);
} catch (\Throwable $e) {}

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($action) {
        case 'rooms':        listRooms($user); break;
        case 'messages':     listMessages($user); break;
        case 'send':         sendMessage($user); break;
        case 'open_direct':  openDirect($user); break;
        case 'add_participant': addParticipant($user); break;
        case 'mark_read':    markRead($user); break;
        case 'unread_count': unreadCount($user); break;
        case 'users':        listUsers($user); break;
        case 'projects_for_chat': listProjectsForChat($user); break;
        case 'create_project_room': createProjectRoomAction($user); break;
        case 'create_canal': createCanal($user); break;
        case 'join_canal':   joinCanal($user); break;
        case 'leave_canal':  leaveCanal($user); break;
        case 'list_canaux':  listCanaux($user); break;
        case 'pin_message':  pinMessage($user); break;
        case 'pinned':       listPinned($user); break;
        case 'response_times': responseTimes($user); break;
        case 'create_client_portal': createClientPortal($user); break;
        default: jsonError('Action inconnue', 404);
    }
} catch (\Throwable $e) {
    jsonError('Erreur chat : ' . $e->getMessage(), 500);
}

// ---------------------------------------------------------------
// Access control : est-ce que $user peut voir/poster dans $room ?
// ---------------------------------------------------------------
function canAccessRoom($db, $user, $room) {
    if (!$room) return false;

    // Participant direct
    $stmt = $db->prepare("SELECT 1 FROM CA_chat_participants WHERE room_id = ? AND user_id = ?");
    $stmt->execute([$room['id'], $user['id'] ?? '']);
    if ($stmt->fetch()) return true;

    // Gérant / admin : lecture sur toutes les rooms projet/canal
    if (chat_is_privileged($user) && in_array($room['type'], ['projet','canal'])) return true;

    return false;
}

// ---------------------------------------------------------------
// GET ?action=rooms
//   Retourne : mes rooms (direct + projet où je suis participant)
//   + rooms projet supplémentaires si gérant
// ---------------------------------------------------------------
function listRooms($user) {
    $db  = getDB();
    $uid = $user['id'] ?? '';

    $rooms = [];

    // Mes rooms (participant)
    $sql = "SELECT r.*, p.is_favorite, p.last_read_at,
                   (SELECT COUNT(*) FROM CA_chat_messages m
                    WHERE m.room_id = r.id
                      AND m.cree_at > COALESCE(p.last_read_at, '1970-01-01')
                      AND m.sender_id <> ?) AS unread,
                   (SELECT m2.content FROM CA_chat_messages m2
                    WHERE m2.room_id = r.id ORDER BY m2.cree_at DESC LIMIT 1) AS last_message,
                   (SELECT m2.cree_at FROM CA_chat_messages m2
                    WHERE m2.room_id = r.id ORDER BY m2.cree_at DESC LIMIT 1) AS last_message_at
            FROM CA_chat_rooms r
            INNER JOIN CA_chat_participants p ON p.room_id = r.id
            WHERE p.user_id = ?
            ORDER BY r.is_archived ASC, last_message_at DESC, r.cree_at DESC";
    $stmt = $db->prepare($sql);
    $stmt->execute([$uid, $uid]);
    $mine = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Précharger les infos projet (nom/code) pour les rooms projet
    $projetInfos = [];
    try {
        $stP = $db->query("SELECT id, nom, code FROM CA_projets");
        while ($pr = $stP->fetch(PDO::FETCH_ASSOC)) {
            $projetInfos[$pr['id']] = ['nom'=>$pr['nom'], 'code'=>$pr['code']];
        }
    } catch (\Throwable $e) {}

    // Pour chaque room directe, peupler "other_user" (l'interlocuteur)
    foreach ($mine as &$r) {
        $r['unread'] = intval($r['unread']);
        $r['is_favorite'] = !empty($r['is_favorite']) ? 1 : 0;
        if ($r['type'] === 'projet' && !empty($r['projet_id']) && isset($projetInfos[$r['projet_id']])) {
            $r['projet_nom']  = $projetInfos[$r['projet_id']]['nom'];
            $r['projet_code'] = $projetInfos[$r['projet_id']]['code'];
        }
        if ($r['type'] === 'direct') {
            try {
                $st2 = $db->prepare("SELECT cp.user_id, cp.user_name, u.profile_picture_url, u.color, u.role
                                     FROM CA_chat_participants cp
                                     LEFT JOIN cortoba_users u ON u.id = cp.user_id
                                     WHERE cp.room_id = ? AND cp.user_id <> ? LIMIT 1");
                $st2->execute([$r['id'], $uid]);
                $other = $st2->fetch(PDO::FETCH_ASSOC);
            } catch (\Throwable $e) {
                $st2 = $db->prepare("SELECT cp.user_id, cp.user_name FROM CA_chat_participants cp WHERE cp.room_id = ? AND cp.user_id <> ? LIMIT 1");
                $st2->execute([$r['id'], $uid]);
                $other = $st2->fetch(PDO::FETCH_ASSOC);
                if ($other) { $other['profile_picture_url'] = null; $other['color'] = null; $other['role'] = null; }
            }
            $r['other_user'] = $other ?: null;
            if ($other) {
                $r['name'] = $other['user_name'] ?: 'Membre';
            }
        }
        // Participants (pour les rooms projet et canal)
        if ($r['type'] === 'projet' || $r['type'] === 'canal') {
            try {
                $st3 = $db->prepare("SELECT cp.user_id, cp.user_name, u.color, u.profile_picture_url
                                     FROM CA_chat_participants cp
                                     LEFT JOIN cortoba_users u ON u.id = cp.user_id
                                     WHERE cp.room_id = ? ORDER BY cp.joined_at ASC");
                $st3->execute([$r['id']]);
                $r['participants'] = $st3->fetchAll(PDO::FETCH_ASSOC);
            } catch (\Throwable $e) {
                $st3 = $db->prepare("SELECT cp.user_id, cp.user_name FROM CA_chat_participants cp WHERE cp.room_id = ? ORDER BY cp.joined_at ASC");
                $st3->execute([$r['id']]);
                $r['participants'] = $st3->fetchAll(PDO::FETCH_ASSOC);
            }
        }
    }
    unset($r);
    $rooms = $mine;

    // Si gérant : ajouter les rooms projet où il n'est pas participant
    if (chat_is_privileged($user)) {
        $myIds = array_column($rooms, 'id');
        $placeholders = $myIds ? implode(',', array_fill(0, count($myIds), '?')) : '';
        $sql2 = "SELECT r.*, 0 AS is_favorite, NULL AS last_read_at,
                        0 AS unread,
                        (SELECT m2.content FROM CA_chat_messages m2 WHERE m2.room_id = r.id ORDER BY m2.cree_at DESC LIMIT 1) AS last_message,
                        (SELECT m2.cree_at FROM CA_chat_messages m2 WHERE m2.room_id = r.id ORDER BY m2.cree_at DESC LIMIT 1) AS last_message_at
                 FROM CA_chat_rooms r
                 WHERE r.type = 'projet' "
                 . ($myIds ? " AND r.id NOT IN ($placeholders) " : "")
                 . " ORDER BY r.is_archived ASC, last_message_at DESC";
        $stmt2 = $db->prepare($sql2);
        $stmt2->execute($myIds);
        $extras = $stmt2->fetchAll(PDO::FETCH_ASSOC);
        foreach ($extras as &$r) {
            $r['supervision'] = 1; // marqueur lecture-seule superviseur
            $r['unread']      = 0;
            $r['is_favorite'] = 0;
            if (!empty($r['projet_id']) && isset($projetInfos[$r['projet_id']])) {
                $r['projet_nom']  = $projetInfos[$r['projet_id']]['nom'];
                $r['projet_code'] = $projetInfos[$r['projet_id']]['code'];
            }
        }
        unset($r);
        $rooms = array_merge($rooms, $extras);
    }

    // Ajouter topic pour les canaux
    foreach ($rooms as &$r) {
        if ($r['type'] === 'canal') {
            try {
                $stT = $db->prepare("SELECT topic FROM CA_chat_rooms WHERE id = ?");
                $stT->execute([$r['id']]);
                $topicRow = $stT->fetch(PDO::FETCH_ASSOC);
                $r['topic'] = $topicRow['topic'] ?? null;
            } catch (\Throwable $e) { $r['topic'] = null; }
            // Participants count
            try {
                $stC = $db->prepare("SELECT COUNT(*) FROM CA_chat_participants WHERE room_id = ?");
                $stC->execute([$r['id']]);
                $r['member_count'] = intval($stC->fetchColumn());
            } catch (\Throwable $e) { $r['member_count'] = 0; }
        }
    }
    unset($r);

    jsonOk($rooms);
}

// ---------------------------------------------------------------
// GET ?action=messages&room_id=X&since=TIMESTAMP
//   Retourne les messages de la room (triés ASC), + participants
// ---------------------------------------------------------------
function listMessages($user) {
    $db     = getDB();
    $roomId = $_GET['room_id'] ?? '';
    $since  = $_GET['since']   ?? '';
    if (!$roomId) jsonError('room_id requis');

    $stmt = $db->prepare("SELECT * FROM CA_chat_rooms WHERE id = ?");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$room) jsonError('Room introuvable', 404);
    if (!canAccessRoom($db, $user, $room)) jsonError('Accès refusé', 403);

    $where  = 'm.room_id = ?';
    $params = [$roomId];
    if ($since) {
        $where .= ' AND m.cree_at > ?';
        $params[] = $since;
    }
    try {
        $stmt = $db->prepare("SELECT m.*, u.color, u.profile_picture_url
                              FROM CA_chat_messages m
                              LEFT JOIN cortoba_users u ON u.id = m.sender_id
                              WHERE $where ORDER BY m.cree_at ASC LIMIT 500");
        $stmt->execute($params);
    } catch (\Throwable $e) {
        $stmt = $db->prepare("SELECT m.* FROM CA_chat_messages m WHERE $where ORDER BY m.cree_at ASC LIMIT 500");
        $stmt->execute($params);
    }
    $messages = $stmt->fetchAll(PDO::FETCH_ASSOC);

    jsonOk(['room' => $room, 'messages' => $messages, 'server_time' => date('Y-m-d H:i:s')]);
}

// ---------------------------------------------------------------
// POST ?action=send  body: {room_id, content, attachment_url?, attachment_name?}
// ---------------------------------------------------------------
function sendMessage($user) {
    $db   = getDB();
    $body = getBody();
    $roomId  = $body['room_id'] ?? '';
    $content = trim($body['content'] ?? '');
    $attUrl  = trim($body['attachment_url']  ?? '');
    $attName = trim($body['attachment_name'] ?? '');

    if (!$roomId) jsonError('room_id requis');
    if ($content === '' && $attUrl === '') jsonError('Message vide');

    $stmt = $db->prepare("SELECT * FROM CA_chat_rooms WHERE id = ?");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$room) jsonError('Room introuvable', 404);

    // Supervision gérant : lecture seule sur rooms où il n'est pas participant
    $isParticipant = false;
    $stmt = $db->prepare("SELECT 1 FROM CA_chat_participants WHERE room_id = ? AND user_id = ?");
    $stmt->execute([$roomId, $user['id'] ?? '']);
    $isParticipant = (bool)$stmt->fetch();
    if (!$isParticipant) jsonError('Vous n\'êtes pas membre de cette discussion', 403);
    if (!empty($room['is_archived'])) jsonError('Discussion archivée (lecture seule)', 403);

    $mid  = chat_genid();
    $kind = $attUrl ? 'file' : 'text';
    $db->prepare("INSERT INTO CA_chat_messages (id, room_id, sender_id, sender_name, kind, content, attachment_url, attachment_name)
                  VALUES (?,?,?,?,?,?,?,?)")
       ->execute([$mid, $roomId, $user['id'] ?? '', $user['name'] ?? '', $kind, $content, $attUrl ?: null, $attName ?: null]);

    // Marquer la room comme lue pour l'expéditeur
    $db->prepare("UPDATE CA_chat_participants SET last_read_at = NOW()
                  WHERE room_id = ? AND user_id = ?")
       ->execute([$roomId, $user['id'] ?? '']);

    // @mentions : détecter les @Prénom Nom dans le contenu
    $mentionedUserIds = [];
    if ($content !== '') {
        // Chercher tous les @Prénom Nom (au moins 2 mots après @)
        if (preg_match_all('/@([A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ]+(?:\s+[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ]+)+)/u', $content, $matches)) {
            foreach ($matches[1] as $mentionName) {
                $resolved = chat_resolve_user_by_name($db, $mentionName);
                if ($resolved) $mentionedUserIds[$resolved['id']] = trim(($resolved['prenom'] ?? '') . ' ' . ($resolved['nom'] ?? ''));
            }
        }
        // Fallback : @Prénom seul (1 mot)
        if (preg_match_all('/@([A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ]+)(?=\s|$|[,;.!?])/u', $content, $matches2)) {
            foreach ($matches2[1] as $mentionFirst) {
                $resolved = chat_resolve_user_by_name($db, $mentionFirst);
                if ($resolved && !isset($mentionedUserIds[$resolved['id']])) {
                    $mentionedUserIds[$resolved['id']] = trim(($resolved['prenom'] ?? '') . ' ' . ($resolved['nom'] ?? ''));
                }
            }
        }
    }

    // Notification pour chaque participant (sauf l'expéditeur)
    try {
        $stPart = $db->prepare("SELECT user_id FROM CA_chat_participants WHERE room_id = ? AND user_id <> ?");
        $stPart->execute([$roomId, $user['id'] ?? '']);
        $recipients = $stPart->fetchAll(PDO::FETCH_COLUMN);
        $roomName = $room['name'] ?? 'Discussion';
        $senderName = $user['name'] ?? 'Quelqu\'un';
        $preview = mb_strlen($content) > 80 ? mb_substr($content, 0, 80) . '…' : $content;

        foreach ($recipients as $rid) {
            $isMentioned = isset($mentionedUserIds[$rid]);
            $type  = $isMentioned ? 'chat_mention' : 'chat';
            $title = $isMentioned
                ? '🔔 ' . $senderName . ' vous a mentionné — ' . $roomName
                : $senderName . ' — ' . $roomName;
            notifCreate($db, $rid, $type, $title, $preview ?: '📎 Pièce jointe', null, $roomId, $senderName);
        }

        // Si un @mentionné n'est pas participant (ex: canal public), notifier quand même
        foreach ($mentionedUserIds as $muid => $muname) {
            if ($muid === ($user['id'] ?? '')) continue;
            if (in_array($muid, $recipients)) continue;
            notifCreate($db, $muid, 'chat_mention',
                '🔔 ' . $senderName . ' vous a mentionné — ' . $roomName,
                $preview ?: '📎 Pièce jointe', null, $roomId, $senderName);
        }
    } catch (\Throwable $e) { /* silencieux — ne pas bloquer l'envoi */ }

    try {
        $stmt = $db->prepare("SELECT m.*, u.color, u.profile_picture_url FROM CA_chat_messages m LEFT JOIN cortoba_users u ON u.id = m.sender_id WHERE m.id = ?");
        $stmt->execute([$mid]);
    } catch (\Throwable $e) {
        $stmt = $db->prepare("SELECT m.* FROM CA_chat_messages m WHERE m.id = ?");
        $stmt->execute([$mid]);
    }
    jsonOk($stmt->fetch(PDO::FETCH_ASSOC));
}

// ---------------------------------------------------------------
// POST ?action=open_direct  body: {user_id}
//   Crée (ou récupère) une room directe entre moi et user_id
// ---------------------------------------------------------------
function openDirect($user) {
    $db   = getDB();
    $body = getBody();
    $other = $body['user_id'] ?? '';
    $me    = $user['id'] ?? '';
    if (!$other || $other === $me) jsonError('user_id invalide');

    // Chercher une room directe existante entre les deux
    $sql = "SELECT r.id FROM CA_chat_rooms r
            INNER JOIN CA_chat_participants p1 ON p1.room_id = r.id AND p1.user_id = ?
            INNER JOIN CA_chat_participants p2 ON p2.room_id = r.id AND p2.user_id = ?
            WHERE r.type = 'direct' LIMIT 1";
    $stmt = $db->prepare($sql);
    $stmt->execute([$me, $other]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row) { jsonOk(['room_id' => $row['id']]); return; }

    // Créer
    $otherRow = null;
    try {
        $st = $db->prepare("SELECT id, prenom, nom FROM cortoba_users WHERE id = ? LIMIT 1");
        $st->execute([$other]);
        $otherRow = $st->fetch(PDO::FETCH_ASSOC);
    } catch (\Throwable $e) {}
    if (!$otherRow) jsonError('Utilisateur introuvable', 404);

    $roomId = chat_genid();
    $db->prepare("INSERT INTO CA_chat_rooms (id, type, name, created_by) VALUES (?, 'direct', NULL, ?)")
       ->execute([$roomId, $user['name'] ?? '']);

    $db->prepare("INSERT INTO CA_chat_participants (room_id, user_id, user_name) VALUES (?,?,?)")
       ->execute([$roomId, $me, $user['name'] ?? '']);
    $db->prepare("INSERT INTO CA_chat_participants (room_id, user_id, user_name) VALUES (?,?,?)")
       ->execute([$roomId, $other, trim(($otherRow['prenom'] ?? '') . ' ' . ($otherRow['nom'] ?? ''))]);

    jsonOk(['room_id' => $roomId]);
}

// ---------------------------------------------------------------
// POST ?action=add_participant  body: {room_id, user_id}
// ---------------------------------------------------------------
function addParticipant($user) {
    $db   = getDB();
    $body = getBody();
    $roomId = $body['room_id'] ?? '';
    $target = $body['user_id'] ?? '';
    if (!$roomId || !$target) jsonError('room_id et user_id requis');

    $stmt = $db->prepare("SELECT * FROM CA_chat_rooms WHERE id = ?");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$room) jsonError('Room introuvable', 404);

    // Seul un participant existant (ou gérant) peut ajouter quelqu'un
    $stmt = $db->prepare("SELECT 1 FROM CA_chat_participants WHERE room_id=? AND user_id=?");
    $stmt->execute([$roomId, $user['id'] ?? '']);
    if (!$stmt->fetch() && !chat_is_privileged($user)) jsonError('Accès refusé', 403);

    $st = $db->prepare("SELECT id, prenom, nom FROM cortoba_users WHERE id = ?");
    $st->execute([$target]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) jsonError('Utilisateur introuvable', 404);

    $name = trim(($row['prenom'] ?? '') . ' ' . ($row['nom'] ?? ''));
    $added = chat_add_participant_if_missing($db, $roomId, $target, $name, 'un ajout manuel par ' . ($user['name'] ?? ''));
    jsonOk(['added' => $added]);
}

// ---------------------------------------------------------------
// POST ?action=mark_read  body: {room_id}
// ---------------------------------------------------------------
function markRead($user) {
    $db   = getDB();
    $body = getBody();
    $roomId = $body['room_id'] ?? '';
    if (!$roomId) jsonError('room_id requis');
    $db->prepare("UPDATE CA_chat_participants SET last_read_at = NOW()
                  WHERE room_id = ? AND user_id = ?")
       ->execute([$roomId, $user['id'] ?? '']);
    jsonOk(['ok' => true]);
}

// ---------------------------------------------------------------
// GET ?action=unread_count
// ---------------------------------------------------------------
function unreadCount($user) {
    $db  = getDB();
    $uid = $user['id'] ?? '';
    $sql = "SELECT COALESCE(SUM(x.n),0) AS total FROM (
              SELECT COUNT(*) AS n
              FROM CA_chat_messages m
              INNER JOIN CA_chat_participants p ON p.room_id = m.room_id AND p.user_id = ?
              WHERE m.cree_at > COALESCE(p.last_read_at, '1970-01-01')
                AND m.sender_id <> ?
              GROUP BY m.room_id
            ) x";
    $stmt = $db->prepare($sql);
    $stmt->execute([$uid, $uid]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    jsonOk(['unread' => intval($row['total'] ?? 0)]);
}

// ---------------------------------------------------------------
// GET ?action=users
//   Liste des membres utilisables pour démarrer un DM
// ---------------------------------------------------------------
function listUsers($user) {
    $db = getDB();
    $me = $user['id'] ?? '';
    try {
        $stmt = $db->query("SELECT id, prenom, nom, role, color, profile_picture_url
                            FROM cortoba_users
                            WHERE is_admin = 0 AND statut <> 'Inactif'
                            ORDER BY prenom, nom");
    } catch (\Throwable $e) {
        $stmt = $db->query("SELECT id, prenom, nom, role
                            FROM cortoba_users
                            WHERE is_admin = 0 AND statut <> 'Inactif'
                            ORDER BY prenom, nom");
    }
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $out = [];
    foreach ($rows as $r) {
        if ($r['id'] === $me) continue;
        $out[] = [
            'id'    => $r['id'],
            'name'  => trim(($r['prenom'] ?? '') . ' ' . ($r['nom'] ?? '')),
            'role'  => $r['role'] ?? '',
            'color' => $r['color'] ?? '#c8a96e',
            'profile_picture_url' => $r['profile_picture_url'] ?? null,
        ];
    }

    // Présence : considéré online si last_seen < 90 s
    try {
        $stmt2 = $db->query("SELECT user_id FROM CA_chat_presence WHERE last_seen > (NOW() - INTERVAL 90 SECOND)");
        $online = array_flip(array_column($stmt2->fetchAll(PDO::FETCH_ASSOC), 'user_id'));
        foreach ($out as &$u) $u['online'] = isset($online[$u['id']]);
    } catch (\Throwable $e) {}

    jsonOk($out);
}

// ---------------------------------------------------------------
// GET ?action=projects_for_chat
//   Liste des projets actifs sans room existante (pour le picker)
// ---------------------------------------------------------------
function listProjectsForChat($user) {
    $db = getDB();
    try {
        // Projets actifs qui n'ont pas encore de room chat
        $sql = "SELECT p.id, p.nom, p.code, p.statut
                FROM CA_projets p
                WHERE NOT EXISTS (
                    SELECT 1 FROM CA_chat_rooms r WHERE r.type='projet' AND r.projet_id = p.id
                )
                AND (p.statut IS NULL OR p.statut NOT IN ('Terminé','Archivé','Clôturé'))
                ORDER BY p.code ASC, p.nom ASC";
        $stmt = $db->query($sql);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (\Throwable $e) {
        // Fallback sans filtre statut
        try {
            $sql2 = "SELECT p.id, p.nom, p.code FROM CA_projets p
                     WHERE NOT EXISTS (SELECT 1 FROM CA_chat_rooms r WHERE r.type='projet' AND r.projet_id = p.id)
                     ORDER BY p.code ASC, p.nom ASC";
            $stmt = $db->query($sql2);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Throwable $e2) {
            $rows = [];
        }
    }
    jsonOk($rows);
}

// ---------------------------------------------------------------
// POST ?action=create_project_room  body: {projet_id}
//   (peut aussi être invoqué directement depuis le front)
// ---------------------------------------------------------------
function createProjectRoomAction($user) {
    $db   = getDB();
    $body = getBody();
    $pid  = $body['projet_id'] ?? '';
    if (!$pid) jsonError('projet_id requis');

    $stmt = $db->prepare("SELECT * FROM CA_projets WHERE id = ?");
    $stmt->execute([$pid]);
    $projet = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$projet) jsonError('Projet introuvable', 404);

    $roomId = chat_create_project_room($db, $projet, $user['name'] ?? null);
    jsonOk(['room_id' => $roomId]);
}

// ---------------------------------------------------------------
// POST ?action=create_canal  body: {name, topic?}
//   Crée un canal thématique (type Slack)
// ---------------------------------------------------------------
function createCanal($user) {
    $db   = getDB();
    $body = getBody();
    $name  = trim($body['name'] ?? '');
    $topic = trim($body['topic'] ?? '');
    if ($name === '') jsonError('Nom du canal requis');

    $roomId = chat_genid();
    $db->prepare("INSERT INTO CA_chat_rooms (id, type, name, topic, created_by) VALUES (?, 'canal', ?, ?, ?)")
       ->execute([$roomId, $name, $topic ?: null, $user['name'] ?? '']);

    // Le créateur est automatiquement participant
    $db->prepare("INSERT INTO CA_chat_participants (room_id, user_id, user_name) VALUES (?,?,?)")
       ->execute([$roomId, $user['id'] ?? '', $user['name'] ?? '']);

    chat_post_system_message($db, $roomId, '📢 Canal « ' . $name . ' » créé par ' . ($user['name'] ?? '') . ($topic ? ' — ' . $topic : ''));

    jsonOk(['room_id' => $roomId]);
}

// ---------------------------------------------------------------
// POST ?action=join_canal  body: {room_id}
// ---------------------------------------------------------------
function joinCanal($user) {
    $db   = getDB();
    $body = getBody();
    $roomId = $body['room_id'] ?? '';
    if (!$roomId) jsonError('room_id requis');

    $stmt = $db->prepare("SELECT * FROM CA_chat_rooms WHERE id = ? AND type = 'canal'");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$room) jsonError('Canal introuvable', 404);
    if (!empty($room['is_archived'])) jsonError('Canal archivé', 403);

    $name = $user['name'] ?? '';
    $added = chat_add_participant_if_missing($db, $roomId, $user['id'] ?? '', $name, null);
    if ($added) {
        chat_post_system_message($db, $roomId, '@' . $name . ' a rejoint le canal.');
    }
    jsonOk(['joined' => $added]);
}

// ---------------------------------------------------------------
// POST ?action=leave_canal  body: {room_id}
// ---------------------------------------------------------------
function leaveCanal($user) {
    $db   = getDB();
    $body = getBody();
    $roomId = $body['room_id'] ?? '';
    if (!$roomId) jsonError('room_id requis');

    $db->prepare("DELETE FROM CA_chat_participants WHERE room_id = ? AND user_id = ?")
       ->execute([$roomId, $user['id'] ?? '']);

    $name = $user['name'] ?? '';
    chat_post_system_message($db, $roomId, '@' . $name . ' a quitté le canal.');

    jsonOk(['left' => true]);
}

// ---------------------------------------------------------------
// GET ?action=list_canaux — tous les canaux (pour le picker)
// ---------------------------------------------------------------
function listCanaux($user) {
    $db = getDB();
    try {
        $stmt = $db->query("SELECT r.id, r.name, r.topic, r.is_archived,
                                   (SELECT COUNT(*) FROM CA_chat_participants WHERE room_id = r.id) AS member_count
                            FROM CA_chat_rooms r
                            WHERE r.type = 'canal'
                            ORDER BY r.name ASC");
    } catch (\Throwable $e) {
        $stmt = $db->query("SELECT r.id, r.name, r.is_archived,
                                   (SELECT COUNT(*) FROM CA_chat_participants WHERE room_id = r.id) AS member_count
                            FROM CA_chat_rooms r
                            WHERE r.type = 'canal'
                            ORDER BY r.name ASC");
    }
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Marquer si l'utilisateur est déjà membre
    $uid = $user['id'] ?? '';
    foreach ($rows as &$r) {
        $st = $db->prepare("SELECT 1 FROM CA_chat_participants WHERE room_id = ? AND user_id = ?");
        $st->execute([$r['id'], $uid]);
        $r['is_member'] = (bool)$st->fetch();
    }
    unset($r);

    jsonOk($rows);
}

// ---------------------------------------------------------------
// POST ?action=pin_message  body: {message_id, label?}
//   Decision Log — épingler un message sur la fiche projet
// ---------------------------------------------------------------
function pinMessage($user) {
    $db   = getDB();
    $body = getBody();
    $mid  = $body['message_id'] ?? '';
    $label = trim($body['label'] ?? '');
    if (!$mid) jsonError('message_id requis');

    $stmt = $db->prepare("SELECT m.*, r.type, r.projet_id FROM CA_chat_messages m
                          INNER JOIN CA_chat_rooms r ON r.id = m.room_id
                          WHERE m.id = ?");
    $stmt->execute([$mid]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) jsonError('Message introuvable', 404);
    if ($row['type'] !== 'projet') jsonError('Seuls les messages de groupe projet peuvent être épinglés', 400);

    $id = chat_genid();
    $db->prepare("INSERT INTO CA_chat_pinned (id, message_id, projet_id, pinned_by, label) VALUES (?,?,?,?,?)")
       ->execute([$id, $mid, $row['projet_id'], $user['name'] ?? '', $label ?: null]);

    chat_post_system_message($db, $row['room_id'],
        '📌 Message épinglé comme information critique par ' . ($user['name'] ?? '') . ($label ? ' — ' . $label : ''));

    jsonOk(['id' => $id]);
}

// ═══════════════════════════════════════════════════════════════
//  Lot 7 — Portail client externe (groupe dédié + lien tokenisé)
// ═══════════════════════════════════════════════════════════════

// POST ?action=create_client_portal
//   body: { projet_id, client_name, client_email }
//   → crée une room type='client' liée au projet, avec access_token,
//     ajoute le user courant comme participant, retourne l'URL publique.
function createClientPortal($user) {
    $db   = getDB();
    $body = getBody();
    $pid  = $body['projet_id'] ?? '';
    $cname = trim($body['client_name']  ?? '');
    $cmail = trim($body['client_email'] ?? '');
    if (!$pid) jsonError('projet_id requis');

    $stmt = $db->prepare("SELECT * FROM CA_projets WHERE id = ?");
    $stmt->execute([$pid]);
    $projet = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$projet) jsonError('Projet introuvable', 404);

    // Room client existante ?
    $stmt = $db->prepare("SELECT * FROM CA_chat_rooms WHERE type='client' AND projet_id = ? LIMIT 1");
    $stmt->execute([$pid]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($existing) {
        $roomId = $existing['id'];
        $token  = $existing['access_token'];
        // MAJ optionnelle des infos client
        if ($cname || $cmail) {
            $db->prepare("UPDATE CA_chat_rooms SET client_name = COALESCE(NULLIF(?,''), client_name),
                          client_email = COALESCE(NULLIF(?,''), client_email) WHERE id = ?")
               ->execute([$cname, $cmail, $roomId]);
        }
    } else {
        $roomId = chat_genid();
        $token  = bin2hex(random_bytes(24));
        $label  = trim(($projet['code'] ? $projet['code'] . ' - ' : '') . $projet['nom'] . ' — Espace client');
        $db->prepare("INSERT INTO CA_chat_rooms (id, type, name, projet_id, created_by, access_token, client_name, client_email)
                      VALUES (?, 'client', ?, ?, ?, ?, ?, ?)")
           ->execute([$roomId, $label, $pid, $user['name'] ?? '', $token, $cname ?: null, $cmail ?: null]);

        // Ajouter le créateur comme participant
        $db->prepare("INSERT INTO CA_chat_participants (room_id, user_id, user_name) VALUES (?,?,?)")
           ->execute([$roomId, $user['id'] ?? '', $user['name'] ?? '']);

        chat_post_system_message($db, $roomId,
            '🔐 Espace de discussion client créé par ' . ($user['name'] ?? '') .
            ($cname ? ' pour ' . $cname : '') . '. Le client peut valider les phases et échanger via un lien sécurisé.');
    }

    // URL publique (basée sur l'hôte du serveur)
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host   = $_SERVER['HTTP_HOST'] ?? '';
    $dir    = rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/'); // .../cortoba-plateforme
    $url    = $scheme . '://' . $host . $dir . '/client-portal.html?token=' . urlencode($token);

    jsonOk(['room_id' => $roomId, 'token' => $token, 'url' => $url]);
}

// GET ?action=client_view&token=...
//   Retourne les messages + métadonnées projet pour l'espace client.
function clientView() {
    $db    = getDB();
    $token = $_GET['token'] ?? '';
    if (!$token) jsonError('token requis', 400);

    $stmt = $db->prepare("SELECT r.*, p.nom AS projet_nom, p.code AS projet_code, p.phase AS projet_phase
                          FROM CA_chat_rooms r
                          LEFT JOIN CA_projets p ON p.id COLLATE utf8mb4_unicode_ci = r.projet_id COLLATE utf8mb4_unicode_ci
                          WHERE r.type = 'client' AND r.access_token = ? LIMIT 1");
    $stmt->execute([$token]);
    $room = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$room) jsonError('Lien invalide ou expiré', 404);

    $stmt = $db->prepare("SELECT id, sender_id, sender_name, kind, content, cree_at
                          FROM CA_chat_messages WHERE room_id = ? ORDER BY cree_at ASC LIMIT 500");
    $stmt->execute([$room['id']]);
    $messages = $stmt->fetchAll(PDO::FETCH_ASSOC);

    jsonOk([
        'room' => [
            'id'           => $room['id'],
            'name'         => $room['name'],
            'projet_nom'   => $room['projet_nom'],
            'projet_code'  => $room['projet_code'],
            'projet_phase' => $room['projet_phase'],
            'client_name'  => $room['client_name'],
            'is_archived'  => $room['is_archived'],
        ],
        'messages' => $messages,
    ]);
}

// POST ?action=client_send  body: { token, content }
function clientSend() {
    $db   = getDB();
    $body = getBody();
    $token = $body['token'] ?? '';
    $content = trim($body['content'] ?? '');
    if (!$token || $content === '') jsonError('token et content requis', 400);

    $stmt = $db->prepare("SELECT * FROM CA_chat_rooms WHERE type='client' AND access_token = ? LIMIT 1");
    $stmt->execute([$token]);
    $room = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$room) jsonError('Lien invalide', 404);
    if (!empty($room['is_archived'])) jsonError('Discussion clôturée', 403);

    $mid = chat_genid();
    $clientName = $room['client_name'] ?: 'Client';
    $db->prepare("INSERT INTO CA_chat_messages (id, room_id, sender_id, sender_name, kind, content)
                  VALUES (?, ?, NULL, ?, 'text', ?)")
       ->execute([$mid, $room['id'], $clientName, $content]);

    jsonOk(['id' => $mid]);
}

// ---------------------------------------------------------------
// GET ?action=response_times
//   Calcule le temps moyen de réponse (en minutes) par membre sur
//   les groupes projet : délai entre un message d'un tiers et la
//   première réponse de l'utilisateur dans la même room.
//   Retour : [ { user_id, user_name, avg_minutes, samples } ]
// ---------------------------------------------------------------
function responseTimes($user) {
    $db = getDB();
    // Récupérer tous les messages des rooms projet, triés par room + temps
    $sql = "SELECT m.room_id, m.sender_id, m.sender_name, m.cree_at
            FROM CA_chat_messages m
            INNER JOIN CA_chat_rooms r ON r.id = m.room_id
            WHERE r.type = 'projet' AND m.kind <> 'system' AND m.sender_id IS NOT NULL
            ORDER BY m.room_id, m.cree_at ASC";
    $rows = $db->query($sql)->fetchAll(PDO::FETCH_ASSOC);

    // Grouper par room
    $byRoom = [];
    foreach ($rows as $r) $byRoom[$r['room_id']][] = $r;

    // Pour chaque room, calculer les deltas : quand un user répond après un tiers
    $stats = []; // user_id => ['name'=>..., 'sum'=>sec, 'count'=>int]
    foreach ($byRoom as $msgs) {
        $prev = null;
        foreach ($msgs as $m) {
            if ($prev && $prev['sender_id'] !== $m['sender_id']) {
                $delta = strtotime($m['cree_at']) - strtotime($prev['cree_at']);
                // Ignorer délais > 48h (pas une vraie "réponse")
                if ($delta > 0 && $delta <= 48 * 3600) {
                    $uid = $m['sender_id'];
                    if (!isset($stats[$uid])) $stats[$uid] = ['user_id'=>$uid, 'user_name'=>$m['sender_name'], 'sum'=>0, 'count'=>0];
                    $stats[$uid]['sum']   += $delta;
                    $stats[$uid]['count'] += 1;
                }
            }
            $prev = $m;
        }
    }
    $out = [];
    foreach ($stats as $s) {
        if ($s['count'] < 1) continue;
        $out[] = [
            'user_id'     => $s['user_id'],
            'user_name'   => $s['user_name'],
            'avg_minutes' => round(($s['sum'] / $s['count']) / 60, 1),
            'samples'     => $s['count'],
        ];
    }
    jsonOk($out);
}

// ---------------------------------------------------------------
// GET ?action=pinned&projet_id=X
// ---------------------------------------------------------------
function listPinned($user) {
    $db = getDB();
    $pid = $_GET['projet_id'] ?? '';
    if (!$pid) jsonError('projet_id requis');
    $stmt = $db->prepare("SELECT pin.*, m.content, m.sender_name, m.cree_at AS message_at
                          FROM CA_chat_pinned pin
                          INNER JOIN CA_chat_messages m ON m.id = pin.message_id
                          WHERE pin.projet_id = ? ORDER BY pin.cree_at DESC");
    $stmt->execute([$pid]);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}
