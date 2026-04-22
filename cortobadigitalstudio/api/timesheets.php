<?php
// ============================================================
//  CORTOBA ATELIER — API Timesheets (saisie de temps)
//  Table : CDS_timesheets
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

function ensureTimesheetsTable() {
    $db = getDB();
    $db->exec("CREATE TABLE IF NOT EXISTS `CDS_timesheets` (
        `id`          VARCHAR(32)   NOT NULL PRIMARY KEY,
        `user_id`     VARCHAR(32)   NOT NULL,
        `user_name`   VARCHAR(120)  DEFAULT NULL,
        `projet_id`   VARCHAR(32)   DEFAULT NULL,
        `tache_id`    VARCHAR(32)   DEFAULT NULL,
        `date_jour`   DATE          NOT NULL,
        `hours_spent` DECIMAL(5,2)  NOT NULL DEFAULT 0,
        `is_billable` TINYINT(1)    NOT NULL DEFAULT 1,
        `commentaire` VARCHAR(400)  DEFAULT NULL,
        `cree_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `modifie_at`  DATETIME      DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        KEY `idx_user_date` (`user_id`,`date_jour`),
        KEY `idx_projet`    (`projet_id`),
        KEY `idx_tache`     (`tache_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
}

$method = $_SERVER['REQUEST_METHOD'];
$id     = $_GET['id'] ?? null;
$user   = requireAuth();

try {
    ensureTimesheetsTable();
    $db = getDB();

    if ($method === 'GET') {
        if ($id) {
            $stmt = $db->prepare('SELECT * FROM CDS_timesheets WHERE id = ?');
            $stmt->execute([$id]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) jsonError('Introuvable', 404);
            jsonOk($row);
            return;
        }
        $where = ['1=1']; $params = [];
        if (!empty($_GET['user_id']))    { $where[] = 'user_id = ?';   $params[] = $_GET['user_id']; }
        if (!empty($_GET['projet_id']))  { $where[] = 'projet_id = ?'; $params[] = $_GET['projet_id']; }
        if (!empty($_GET['tache_id']))   { $where[] = 'tache_id = ?';  $params[] = $_GET['tache_id']; }
        if (!empty($_GET['date_from']))  { $where[] = 'date_jour >= ?';$params[] = $_GET['date_from']; }
        if (!empty($_GET['date_to']))    { $where[] = 'date_jour <= ?';$params[] = $_GET['date_to']; }
        $sql = 'SELECT t.*, p.nom AS projet_nom, p.code AS projet_code, tk.titre AS tache_titre
                FROM CDS_timesheets t
                LEFT JOIN CDS_projets p ON p.id COLLATE utf8mb4_unicode_ci = t.projet_id COLLATE utf8mb4_unicode_ci
                LEFT JOIN CDS_taches tk ON tk.id COLLATE utf8mb4_unicode_ci = t.tache_id COLLATE utf8mb4_unicode_ci
                WHERE ' . implode(' AND ', $where) . '
                ORDER BY t.date_jour DESC, t.cree_at DESC';
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
        return;
    }

    if ($method === 'POST') {
        $body = getBody();
        $newId = bin2hex(random_bytes(16));
        $db->prepare('INSERT INTO CDS_timesheets (id,user_id,user_name,projet_id,tache_id,date_jour,hours_spent,is_billable,commentaire) VALUES (?,?,?,?,?,?,?,?,?)')
           ->execute([
            $newId,
            $body['user_id']  ?? ($user['id'] ?? $user['sub'] ?? ''),
            $body['user_name']?? ($user['name'] ?? ''),
            $body['projet_id']?: null,
            $body['tache_id'] ?: null,
            $body['date_jour']?: date('Y-m-d'),
            floatval($body['hours_spent'] ?? 0),
            !empty($body['is_billable']) ? 1 : 0,
            $body['commentaire'] ?? null,
           ]);
        // Mettre à jour heures_reelles de la tâche si liée
        if (!empty($body['tache_id'])) {
            try {
                $stmtH = $db->prepare('SELECT COALESCE(SUM(hours_spent),0) AS h FROM CDS_timesheets WHERE tache_id = ?');
                $stmtH->execute([$body['tache_id']]);
                $hTotal = floatval($stmtH->fetch()['h']);
                $db->prepare('UPDATE CDS_taches SET heures_reelles = ? WHERE id = ?')->execute([$hTotal, $body['tache_id']]);
            } catch (\Throwable $e) { /* colonne peut ne pas exister */ }
        }
        jsonOk(['id' => $newId]);
        return;
    }

    if ($method === 'PUT') {
        if (!$id) jsonError('ID requis', 400);
        $body = getBody();
        $fields = []; $vals = [];
        foreach (['hours_spent','is_billable','commentaire','date_jour','projet_id','tache_id'] as $k) {
            if (array_key_exists($k, $body)) {
                $fields[] = "`$k` = ?";
                $v = $body[$k];
                if ($k === 'is_billable') $v = !empty($v) ? 1 : 0;
                if ($k === 'hours_spent') $v = floatval($v);
                $vals[] = $v;
            }
        }
        if (!$fields) jsonError('Aucun champ à mettre à jour', 400);
        $vals[] = $id;
        $db->prepare('UPDATE CDS_timesheets SET ' . implode(',', $fields) . ' WHERE id = ?')->execute($vals);
        jsonOk(['updated' => $id]);
        return;
    }

    if ($method === 'DELETE') {
        if (!$id) jsonError('ID requis', 400);
        // Récupérer tache_id pour recalculer heures_reelles
        $stmt = $db->prepare('SELECT tache_id FROM CDS_timesheets WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        $db->prepare('DELETE FROM CDS_timesheets WHERE id = ?')->execute([$id]);
        if ($row && $row['tache_id']) {
            try {
                $stmtH = $db->prepare('SELECT COALESCE(SUM(hours_spent),0) AS h FROM CDS_timesheets WHERE tache_id = ?');
                $stmtH->execute([$row['tache_id']]);
                $hTotal = floatval($stmtH->fetch()['h']);
                $db->prepare('UPDATE CDS_taches SET heures_reelles = ? WHERE id = ?')->execute([$hTotal, $row['tache_id']]);
            } catch (\Throwable $e) {}
        }
        jsonOk(['deleted' => $id]);
        return;
    }

    jsonError('Méthode non supportée', 405);
} catch (\Throwable $e) {
    jsonError($e->getMessage(), 500);
}
