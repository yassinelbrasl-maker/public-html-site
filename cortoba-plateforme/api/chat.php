<?php
// ═══════════════════════════════════════════════════════════════
//  api/chat.php — API messagerie interne Cortoba (Lot 1 + Lot 2)
//  Transport : long polling PHP (pas de WebSocket requis)
//  Dépend de : config/middleware.php, api/chat_helpers.php
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/middleware.php';
require_once __DIR__ . '/chat_helpers.php';

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
        case 'create_project_room': createProjectRoomAction($user); break;
        case 'pin_message':  pinMessage($user); break;
        case 'pinned':       listPinned($user); break;
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

    // Gérant / admin : lecture sur toutes les rooms projet (y compris archivées)
    if (chat_is_privileged($user) && $room['type'] === 'projet') return true;

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

    // Pour chaque room directe, peupler "other_user" (l'interlocuteur)
    foreach ($mine as &$r) {
        $r['unread'] = intval($r['unread']);
        $r['is_favorite'] = !empty($r['is_favorite']) ? 1 : 0;
        if ($r['type'] === 'direct') {
            $st2 = $db->prepare("SELECT cp.user_id, cp.user_name, u.profile_picture_url, u.color, u.role
                                 FROM CA_chat_participants cp
                                 LEFT JOIN cortoba_users u ON u.id = cp.user_id
                                 WHERE cp.room_id = ? AND cp.user_id <> ? LIMIT 1");
            $st2->execute([$r['id'], $uid]);
            $other = $st2->fetch(PDO::FETCH_ASSOC);
            $r['other_user'] = $other ?: null;
            if ($other) {
                $r['name'] = $other['user_name'] ?: 'Membre';
            }
        }
        // Participants (pour les rooms projet)
        if ($r['type'] === 'projet') {
            $st3 = $db->prepare("SELECT cp.user_id, cp.user_name, u.color, u.profile_picture_url
                                 FROM CA_chat_participants cp
                                 LEFT JOIN cortoba_users u ON u.id = cp.user_id
                                 WHERE cp.room_id = ? ORDER BY cp.joined_at ASC");
            $st3->execute([$r['id']]);
            $r['participants'] = $st3->fetchAll(PDO::FETCH_ASSOC);
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
        }
        unset($r);
        $rooms = array_merge($rooms, $extras);
    }

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

    $where  = 'room_id = ?';
    $params = [$roomId];
    if ($since) {
        $where .= ' AND cree_at > ?';
        $params[] = $since;
    }
    $stmt = $db->prepare("SELECT m.*, u.color, u.profile_picture_url
                          FROM CA_chat_messages m
                          LEFT JOIN cortoba_users u ON u.id = m.sender_id
                          WHERE $where ORDER BY cree_at ASC LIMIT 500");
    $stmt->execute($params);
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

    $stmt = $db->prepare("SELECT m.*, u.color, u.profile_picture_url
                          FROM CA_chat_messages m LEFT JOIN cortoba_users u ON u.id = m.sender_id
                          WHERE m.id = ?");
    $stmt->execute([$mid]);
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
    $stmt = $db->query("SELECT id, prenom, nom, role, color, profile_picture_url
                        FROM cortoba_users
                        WHERE is_admin = 0 AND statut <> 'Inactif'
                        ORDER BY prenom, nom");
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
