<?php
// ============================================================
//  CORTOBA ATELIER — API Notifications
//  GET  ?action=list              → notifications de l'user connecté
//  GET  ?action=count             → nombre de non lues
//  POST ?action=mark_read&id=…    → marquer comme lue
//  POST ?action=mark_all_read     → tout marquer comme lu
//  POST ?action=create            → créer (réservé gérant)
//
//  Ce fichier est aussi importable via require_once depuis d'autres APIs
//  pour accéder à notifCreate().
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

// Bootstrap idempotent de la table (toujours exécuté, même en mode lib)
try {
    $_db0 = getDB();
    $_db0->exec("CREATE TABLE IF NOT EXISTS `CA_notifications` (
        `id`         VARCHAR(32)  NOT NULL PRIMARY KEY,
        `user_id`    VARCHAR(32)  NOT NULL,
        `type`       VARCHAR(40)  NOT NULL DEFAULT 'info',
        `title`      VARCHAR(200) NOT NULL,
        `message`    TEXT         DEFAULT NULL,
        `link_page`  VARCHAR(80)  DEFAULT NULL,
        `link_id`    VARCHAR(40)  DEFAULT NULL,
        `is_read`    TINYINT(1)   NOT NULL DEFAULT 0,
        `is_archived` TINYINT(1)  NOT NULL DEFAULT 0,
        `cree_par`   VARCHAR(120) DEFAULT NULL,
        `cree_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY `idx_user_unread` (`user_id`,`is_read`),
        KEY `idx_cree_at`     (`cree_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    try { $_db0->exec("ALTER TABLE CA_notifications ADD COLUMN IF NOT EXISTS `is_archived` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_read`"); }
    catch (\Throwable $e) { /* colonne déjà présente */ }
} catch (\Throwable $e) { /* silencieux */ }

/**
 * Helper : créer une notification (utilisable depuis d'autres APIs).
 */
if (!function_exists('notifCreate')) {
    function notifCreate(PDO $db, string $userId, string $type, string $title,
                         ?string $message = null, ?string $linkPage = null,
                         ?string $linkId = null, ?string $creePar = null): string {
        $id = bin2hex(random_bytes(16));
        $db->prepare("INSERT INTO CA_notifications
            (id, user_id, type, title, message, link_page, link_id, is_read, cree_par)
            VALUES (?,?,?,?,?,?,?,0,?)")
           ->execute([$id, $userId, $type, $title, $message, $linkPage, $linkId, $creePar]);
        return $id;
    }
}

// Si le fichier est inclus comme bibliothèque (require_once), ne pas exécuter
// le handler HTTP ci-dessous.
if (basename($_SERVER['SCRIPT_NAME'] ?? '') !== 'notifications.php') {
    return;
}

// ───────────── Handler HTTP ─────────────
$user   = requireAuth();
$db     = getDB();
$action = $_GET['action'] ?? 'list';

try {
    switch ($action) {
        case 'list': {
            $limit  = min(200, max(1, intval($_GET['limit'] ?? 20)));
            $status = $_GET['status'] ?? 'inbox'; // inbox | unread | read | archived | all
            $type   = trim($_GET['type'] ?? '');
            $q      = trim($_GET['q'] ?? '');
            $sort   = $_GET['sort'] ?? 'recent';  // recent | old | unread_first

            $where  = 'user_id = ?';
            $params = [$user['id']];
            if ($status === 'inbox')         $where .= ' AND is_archived = 0';
            elseif ($status === 'unread')    $where .= ' AND is_archived = 0 AND is_read = 0';
            elseif ($status === 'read')      $where .= ' AND is_archived = 0 AND is_read = 1';
            elseif ($status === 'archived')  $where .= ' AND is_archived = 1';
            // 'all' = pas de filtre archivage
            if ($type !== '') { $where .= ' AND type = ?'; $params[] = $type; }
            if ($q !== '')    { $where .= ' AND (title LIKE ? OR message LIKE ?)'; $params[] = "%$q%"; $params[] = "%$q%"; }

            $orderBy = 'cree_at DESC';
            if ($sort === 'old')          $orderBy = 'cree_at ASC';
            if ($sort === 'unread_first') $orderBy = 'is_read ASC, cree_at DESC';

            $stmt = $db->prepare("SELECT * FROM CA_notifications WHERE $where ORDER BY $orderBy LIMIT $limit");
            $stmt->execute($params);
            jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;
        }

        case 'count': {
            $stmt = $db->prepare("SELECT COUNT(*) FROM CA_notifications WHERE user_id = ? AND is_read = 0 AND is_archived = 0");
            $stmt->execute([$user['id']]);
            jsonOk(['unread' => intval($stmt->fetchColumn())]);
            break;
        }

        case 'mark_read': {
            $id = $_GET['id'] ?? '';
            if (!$id) jsonError('ID requis');
            $db->prepare("UPDATE CA_notifications SET is_read = 1 WHERE id = ? AND user_id = ?")
               ->execute([$id, $user['id']]);
            jsonOk(['id' => $id]);
            break;
        }

        case 'mark_unread': {
            $id = $_GET['id'] ?? '';
            if (!$id) jsonError('ID requis');
            $db->prepare("UPDATE CA_notifications SET is_read = 0 WHERE id = ? AND user_id = ?")
               ->execute([$id, $user['id']]);
            jsonOk(['id' => $id]);
            break;
        }

        case 'mark_all_read': {
            $db->prepare("UPDATE CA_notifications SET is_read = 1 WHERE user_id = ? AND is_archived = 0")
               ->execute([$user['id']]);
            jsonOk(['ok' => true]);
            break;
        }

        case 'archive': {
            $id = $_GET['id'] ?? '';
            if (!$id) jsonError('ID requis');
            $db->prepare("UPDATE CA_notifications SET is_archived = 1 WHERE id = ? AND user_id = ?")
               ->execute([$id, $user['id']]);
            jsonOk(['id' => $id]);
            break;
        }

        case 'unarchive': {
            $id = $_GET['id'] ?? '';
            if (!$id) jsonError('ID requis');
            $db->prepare("UPDATE CA_notifications SET is_archived = 0 WHERE id = ? AND user_id = ?")
               ->execute([$id, $user['id']]);
            jsonOk(['id' => $id]);
            break;
        }

        case 'delete': {
            $id = $_GET['id'] ?? '';
            if (!$id) jsonError('ID requis');
            $db->prepare("DELETE FROM CA_notifications WHERE id = ? AND user_id = ?")
               ->execute([$id, $user['id']]);
            jsonOk(['id' => $id]);
            break;
        }

        case 'create': {
            $role = strtolower($user['role'] ?? '');
            $isManager = in_array($role, ['admin','gerant','gérant','manager','directeur'], true) || empty($user['isMember']);
            if (!$isManager) jsonError('Accès refusé', 403);
            $body = getBody();
            $target = $body['user_id'] ?? '';
            $title  = trim($body['title'] ?? '');
            if (!$target || !$title) jsonError('user_id et title requis');
            $id = notifCreate(
                $db, $target,
                $body['type'] ?? 'info',
                $title,
                $body['message'] ?? null,
                $body['link_page'] ?? null,
                $body['link_id'] ?? null,
                $user['name'] ?? null
            );
            jsonOk(['id' => $id]);
            break;
        }

        default:
            jsonError('Action inconnue', 404);
    }
} catch (\Throwable $e) {
    jsonError('Erreur serveur : ' . $e->getMessage(), 500);
}
