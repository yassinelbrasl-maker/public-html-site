<?php
// ═══════════════════════════════════════════════════════════════
//  api/chat_helpers.php — Schéma + helpers partagés du module Chat
//  Utilisé par chat.php, projets.php, taches.php
//  Transport : long polling PHP (pas de WebSocket)
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/db.php';

// ---------------------------------------------------------------
// Création idempotente des tables chat (bootstrap auto)
// ---------------------------------------------------------------
function chat_ensure_schema() {
    static $done = false;
    if ($done) return;
    $db = getDB();

    $db->exec("CREATE TABLE IF NOT EXISTS CA_chat_rooms (
        id           VARCHAR(32)  NOT NULL PRIMARY KEY,
        type         VARCHAR(10)  NOT NULL DEFAULT 'direct' COMMENT 'direct | projet | client',
        name         VARCHAR(200) DEFAULT NULL,
        projet_id    VARCHAR(32)  DEFAULT NULL,
        is_archived  TINYINT(1)   NOT NULL DEFAULT 0,
        created_by   VARCHAR(120) DEFAULT NULL,
        cree_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        modifie_at   DATETIME     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_type     (type),
        KEY idx_projet   (projet_id),
        KEY idx_archived (is_archived)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $db->exec("CREATE TABLE IF NOT EXISTS CA_chat_messages (
        id              VARCHAR(32)  NOT NULL PRIMARY KEY,
        room_id         VARCHAR(32)  NOT NULL,
        sender_id       VARCHAR(32)  DEFAULT NULL,
        sender_name     VARCHAR(200) DEFAULT NULL,
        kind            VARCHAR(20)  NOT NULL DEFAULT 'text' COMMENT 'text | system | file',
        content         LONGTEXT     DEFAULT NULL,
        attachment_url  VARCHAR(600) DEFAULT NULL,
        attachment_name VARCHAR(300) DEFAULT NULL,
        cree_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_room_time (room_id, cree_at),
        KEY idx_sender    (sender_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $db->exec("CREATE TABLE IF NOT EXISTS CA_chat_participants (
        room_id      VARCHAR(32)  NOT NULL,
        user_id      VARCHAR(32)  NOT NULL,
        user_name    VARCHAR(200) DEFAULT NULL,
        joined_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_read_at DATETIME     DEFAULT NULL,
        is_favorite  TINYINT(1)   NOT NULL DEFAULT 0,
        PRIMARY KEY (room_id, user_id),
        KEY idx_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $db->exec("CREATE TABLE IF NOT EXISTS CA_chat_pinned (
        id         VARCHAR(32)  NOT NULL PRIMARY KEY,
        message_id VARCHAR(32)  NOT NULL,
        projet_id  VARCHAR(32)  DEFAULT NULL,
        pinned_by  VARCHAR(120) DEFAULT NULL,
        label      VARCHAR(200) DEFAULT NULL,
        cree_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_projet  (projet_id),
        KEY idx_message (message_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // Table "présence" très légère (heartbeat pour online/offline)
    $db->exec("CREATE TABLE IF NOT EXISTS CA_chat_presence (
        user_id  VARCHAR(32) NOT NULL PRIMARY KEY,
        last_seen DATETIME   NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $done = true;
}

// ---------------------------------------------------------------
// Helpers identité
// ---------------------------------------------------------------
function chat_is_privileged($user) {
    if (!$user) return false;
    $role = $user['role'] ?? '';
    if ($role === 'admin') return true;
    if (!empty($user['isMember']) && $role === 'Architecte gérant') return true;
    return false;
}

// Résout un nom "Prénom Nom" vers l'id de la table cortoba_users
function chat_resolve_user_by_name($db, $name) {
    $name = trim($name ?? '');
    if ($name === '') return null;
    try {
        // Match exact sur CONCAT(prenom,' ',nom)
        $stmt = $db->prepare("SELECT id, prenom, nom FROM cortoba_users
                              WHERE CONCAT(prenom,' ',nom) = ? LIMIT 1");
        $stmt->execute([$name]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) return $row;

        // Fallback : match sur prénom seul (nom unique)
        $stmt = $db->prepare("SELECT id, prenom, nom FROM cortoba_users WHERE prenom = ? LIMIT 1");
        $stmt->execute([$name]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    } catch (\Throwable $e) {
        return null;
    }
}

// ---------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------
function chat_genid() {
    return bin2hex(random_bytes(16));
}

// Crée un groupe de discussion pour un projet (idempotent)
// $projet = row CA_projets (array). Retourne room_id ou null.
function chat_create_project_room($db, array $projet, $createdByName = null) {
    chat_ensure_schema();
    if (empty($projet['id'])) return null;

    // Déjà existant ?
    $stmt = $db->prepare("SELECT id FROM CA_chat_rooms WHERE type='projet' AND projet_id = ? LIMIT 1");
    $stmt->execute([$projet['id']]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($existing) return $existing['id'];

    $roomId = chat_genid();
    $code   = $projet['code'] ?? '';
    $nom    = $projet['nom']  ?? 'Projet';
    $label  = trim(($code ? $code . ' - ' : '') . $nom . ' — Discussion');

    $db->prepare("INSERT INTO CA_chat_rooms (id, type, name, projet_id, created_by)
                  VALUES (?, 'projet', ?, ?, ?)")
       ->execute([$roomId, $label, $projet['id'], $createdByName]);

    // Ajouter le créateur comme premier participant s'il est membre
    if ($createdByName) {
        $member = chat_resolve_user_by_name($db, $createdByName);
        if ($member) {
            chat_add_participant_if_missing($db, $roomId, $member['id'],
                trim(($member['prenom'] ?? '') . ' ' . ($member['nom'] ?? '')), null);
        }
    }

    // Message système d'ouverture
    chat_post_system_message($db, $roomId, '💬 Groupe de discussion créé pour le projet ' . $label);

    return $roomId;
}

// Ajoute un user à une room si pas déjà présent. Poste un message système.
// Retourne true si ajout effectif, false si déjà présent.
function chat_add_participant_if_missing($db, $roomId, $userId, $userName, $triggerContext = null) {
    if (!$roomId || !$userId) return false;

    $stmt = $db->prepare("SELECT 1 FROM CA_chat_participants WHERE room_id = ? AND user_id = ?");
    $stmt->execute([$roomId, $userId]);
    if ($stmt->fetch()) return false;

    $db->prepare("INSERT INTO CA_chat_participants (room_id, user_id, user_name) VALUES (?,?,?)")
       ->execute([$roomId, $userId, $userName]);

    if ($triggerContext !== null) {
        $msg = '@' . ($userName ?: 'Membre') . ' a été ajouté au groupe' . ($triggerContext ? ' suite à ' . $triggerContext : '.');
        chat_post_system_message($db, $roomId, $msg);
    }
    return true;
}

// Poste un message système dans une room
function chat_post_system_message($db, $roomId, $content) {
    $mid = chat_genid();
    $db->prepare("INSERT INTO CA_chat_messages (id, room_id, sender_id, sender_name, kind, content)
                  VALUES (?, ?, NULL, 'Système', 'system', ?)")
       ->execute([$mid, $roomId, $content]);
    return $mid;
}

// Hook : appelé depuis taches.php quand une tâche reçoit un assignee
// $projetId : id du projet
// $assigneeName : nom "Prénom Nom" du membre assigné
// $tacheTitre : titre de la tâche (pour le message système)
function chat_hook_task_assignment($projetId, $assigneeName, $tacheTitre) {
    if (!$projetId || !$assigneeName) return;
    try {
        chat_ensure_schema();
        $db = getDB();

        // Chercher la room projet
        $stmt = $db->prepare("SELECT id FROM CA_chat_rooms WHERE type='projet' AND projet_id = ? LIMIT 1");
        $stmt->execute([$projetId]);
        $room = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$room) return; // pas de room créée pour ce projet → on ne force rien

        // Résoudre le membre
        $member = chat_resolve_user_by_name($db, $assigneeName);
        if (!$member) return;

        $fullName = trim(($member['prenom'] ?? '') . ' ' . ($member['nom'] ?? ''));
        $context  = 'son affectation sur la tâche « ' . $tacheTitre . ' »';
        chat_add_participant_if_missing($db, $room['id'], $member['id'], $fullName, $context);
    } catch (\Throwable $e) {
        // Silencieux : ne jamais casser le flux principal (création/update de tâche)
    }
}
