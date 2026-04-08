<?php
// ============================================================
//  CORTOBA ATELIER — API Corbeille (trash / recycle bin)
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

// ── Auto-création de la table CA_corbeille ──────────────────────────────────
if (!function_exists('moveToCorbeille')) {
    try {
        $__cdb = getDB();
        $__cdb->exec("CREATE TABLE IF NOT EXISTS `CA_corbeille` (
            `id`           VARCHAR(64)  NOT NULL PRIMARY KEY,
            `table_source` VARCHAR(100) NOT NULL,
            `item_id`      VARCHAR(64)  NOT NULL,
            `item_data`    LONGTEXT     NOT NULL,
            `label`        VARCHAR(255) DEFAULT NULL,
            `deleted_by`   VARCHAR(120) DEFAULT NULL,
            `deleted_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY `idx_table_source` (`table_source`),
            KEY `idx_deleted_at`   (`deleted_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        unset($__cdb);
    } catch (\Exception $e) { /* ignore */ }

    // ═══════════════════════════════════════════════════════════════════════
    //  Helper : moveToCorbeille — appelé depuis les autres APIs
    // ═══════════════════════════════════════════════════════════════════════
    function moveToCorbeille(\PDO $db, string $table, string $id, string $label, string $userName): bool {
        try {
            $stmt = $db->prepare("SELECT * FROM `$table` WHERE id = ?");
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) return false;

            $corbeilleId = bin2hex(random_bytes(16));
            $db->prepare('
                INSERT INTO CA_corbeille (id, table_source, item_id, item_data, label, deleted_by)
                VALUES (?, ?, ?, ?, ?, ?)
            ')->execute([
                $corbeilleId,
                $table,
                $id,
                json_encode($row, JSON_UNESCAPED_UNICODE),
                $label,
                $userName,
            ]);

            $db->prepare("DELETE FROM `$table` WHERE id = ?")->execute([$id]);
            return true;
        } catch (\Exception $e) {
            return false;
        }
    }
}

// ── Routing uniquement si appelé directement ────────────────────────────────
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'corbeille.php') {
    $method = $_SERVER['REQUEST_METHOD'];
    $id     = $_GET['id'] ?? null;
    $action = $_GET['action'] ?? null;
    $user   = requireAuth();

    if ($method === 'GET')                               corbeille_getAll();
    elseif ($method === 'POST' && $action === 'restore') corbeille_restore($id, $user);
    elseif ($method === 'POST' && $action === 'purge')   corbeille_purge($user);
    elseif ($method === 'DELETE')                         corbeille_permanentDelete($id, $user);
    else jsonError('Méthode non supportée', 405);
}

// ── LIST ────────────────────────────────────────────────────────────────────
function corbeille_getAll() {
    $db   = getDB();
    $stmt = $db->query('SELECT * FROM CA_corbeille ORDER BY deleted_at DESC');
    jsonOk($stmt->fetchAll());
}

// ── RESTORE ─────────────────────────────────────────────────────────────────
function corbeille_restore($id, array $user) {
    if (!$id) jsonError('ID requis');
    if (($user['role'] ?? '') !== 'admin') jsonError('Admin requis', 403);

    $db   = getDB();
    $stmt = $db->prepare('SELECT * FROM CA_corbeille WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch(\PDO::FETCH_ASSOC);
    if (!$row) jsonError('Élément introuvable dans la corbeille', 404);

    $tableSource = $row['table_source'];
    $itemData    = json_decode($row['item_data'], true);
    if (!$itemData || !is_array($itemData)) jsonError('Données corrompues', 500);

    $columns      = array_keys($itemData);
    $placeholders = array_fill(0, count($columns), '?');
    $sql = sprintf(
        'INSERT INTO `%s` (%s) VALUES (%s)',
        $tableSource,
        implode(', ', array_map(fn($c) => "`$c`", $columns)),
        implode(', ', $placeholders)
    );

    try {
        $db->prepare($sql)->execute(array_values($itemData));
    } catch (\PDOException $e) {
        jsonError('Erreur restauration : ' . $e->getMessage(), 500);
    }

    $db->prepare('DELETE FROM CA_corbeille WHERE id = ?')->execute([$id]);
    jsonOk(['restored' => $id, 'table' => $tableSource, 'item_id' => $row['item_id']]);
}

// ── DELETE PERMANENT ────────────────────────────────────────────────────────
function corbeille_permanentDelete($id, array $user) {
    if (!$id) jsonError('ID requis');
    if (($user['role'] ?? '') !== 'admin') jsonError('Admin requis', 403);

    $db = getDB();
    $stmt = $db->prepare('SELECT id FROM CA_corbeille WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) jsonError('Élément introuvable', 404);

    $db->prepare('DELETE FROM CA_corbeille WHERE id = ?')->execute([$id]);
    jsonOk(['deleted' => $id]);
}

// ── PURGE +30 jours ─────────────────────────────────────────────────────────
function corbeille_purge(array $user) {
    if (($user['role'] ?? '') !== 'admin') jsonError('Admin requis', 403);

    $db   = getDB();
    $stmt = $db->prepare('DELETE FROM CA_corbeille WHERE deleted_at < DATE_SUB(NOW(), INTERVAL 30 DAY)');
    $stmt->execute();
    jsonOk(['purged' => $stmt->rowCount()]);
}
