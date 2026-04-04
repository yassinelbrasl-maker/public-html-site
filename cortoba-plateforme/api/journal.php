<?php
// ============================================================
//  CORTOBA ATELIER — API Journal quotidien
//  Suivi journalier des tâches par membre
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = $_GET['id'] ?? null;
$user   = requireAuth();

try {
    if ($method === 'GET')        getAll();
    elseif ($method === 'POST')   create($user);
    elseif ($method === 'PUT')    update($id, $user);
    elseif ($method === 'DELETE') remove($id, $user);
    else jsonError('Méthode non supportée', 405);
} catch (\Throwable $e) {
    jsonError('Erreur serveur : ' . $e->getMessage(), 500);
}

function getAll() {
    $db = getDB();
    $where  = ['1=1'];
    $params = [];

    if (!empty($_GET['date'])) {
        $where[]  = 'j.date_jour = ?';
        $params[] = $_GET['date'];
    }
    if (!empty($_GET['membre'])) {
        $where[]  = 'j.membre = ?';
        $params[] = $_GET['membre'];
    }
    if (!empty($_GET['projet_id'])) {
        $where[]  = 'j.projet_id = ?';
        $params[] = $_GET['projet_id'];
    }
    if (!empty($_GET['tache_id'])) {
        $where[]  = 'j.tache_id = ?';
        $params[] = $_GET['tache_id'];
    }
    // Plage de dates
    if (!empty($_GET['date_from'])) {
        $where[]  = 'j.date_jour >= ?';
        $params[] = $_GET['date_from'];
    }
    if (!empty($_GET['date_to'])) {
        $where[]  = 'j.date_jour <= ?';
        $params[] = $_GET['date_to'];
    }

    $sql = 'SELECT j.*,
                   t.titre AS tache_titre, t.niveau AS tache_niveau, t.statut AS tache_statut,
                   p.nom AS projet_nom, p.code AS projet_code
            FROM CA_journal j
            LEFT JOIN CA_taches t ON t.id COLLATE utf8mb4_unicode_ci = j.tache_id COLLATE utf8mb4_unicode_ci
            LEFT JOIN CA_projets p ON p.id COLLATE utf8mb4_unicode_ci = j.projet_id COLLATE utf8mb4_unicode_ci
            WHERE ' . implode(' AND ', $where) . '
            ORDER BY j.date_jour DESC, j.cree_at DESC';

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    jsonOk($stmt->fetchAll());
}

function create(array $user) {
    $body = getBody();
    $tacheId  = $body['tache_id'] ?? '';
    $projetId = $body['projet_id'] ?? '';
    $membre   = trim($body['membre'] ?? '');
    $dateJour = $body['date_jour'] ?? date('Y-m-d');

    if (!$tacheId)  jsonError('La tâche est requise');
    if (!$projetId) jsonError('Le projet est requis');
    if (!$membre)   jsonError('Le membre est requis');

    $db = getDB();
    $id = bin2hex(random_bytes(16));

    $progAvant = intval($body['progression_avant'] ?? 0);
    $progApres = intval($body['progression_apres'] ?? 0);

    $db->prepare('
        INSERT INTO CA_journal (id, tache_id, projet_id, membre, date_jour,
            commentaire, progression_avant, progression_apres, heures)
        VALUES (?,?,?,?,?,?,?,?,?)
    ')->execute([
        $id,
        $tacheId,
        $projetId,
        $membre,
        $dateJour,
        $body['commentaire'] ?? null,
        $progAvant,
        $progApres,
        !empty($body['heures']) ? floatval($body['heures']) : null,
    ]);

    // Mettre à jour la progression de la tâche
    if ($progApres > 0) {
        $db->prepare('UPDATE CA_taches SET progression = ?, statut = ? WHERE id = ?')
           ->execute([
               $progApres,
               $progApres >= 100 ? 'Terminé' : ($progApres > 0 ? 'En cours' : 'A faire'),
               $tacheId
           ]);
        // Recalculer le parent
        recalcParent($db, $tacheId);
    }

    jsonOk(['id' => $id]);
}

function update($id, array $user) {
    if (!$id) jsonError('ID requis');
    $body = getBody();
    $db   = getDB();

    $stmt = $db->prepare('SELECT id, tache_id FROM CA_journal WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) jsonError('Entrée introuvable', 404);

    $fields = [];
    $params = [];
    $allowed = ['commentaire', 'progression_apres', 'heures'];
    foreach ($allowed as $f) {
        if (array_key_exists($f, $body)) {
            $fields[] = "$f = ?";
            $val = $body[$f];
            if ($f === 'progression_apres') $val = intval($val);
            if ($f === 'heures') $val = $val ? floatval($val) : null;
            $params[] = $val;
        }
    }
    if (empty($fields)) jsonError('Aucun champ à mettre à jour');

    $params[] = $id;
    $db->prepare('UPDATE CA_journal SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);

    // Mettre à jour la progression de la tâche
    if (isset($body['progression_apres'])) {
        $progApres = intval($body['progression_apres']);
        $tacheId = $row['tache_id'];
        $db->prepare('UPDATE CA_taches SET progression = ?, statut = ? WHERE id = ?')
           ->execute([
               $progApres,
               $progApres >= 100 ? 'Terminé' : ($progApres > 0 ? 'En cours' : 'A faire'),
               $tacheId
           ]);
        recalcParent($db, $tacheId);
    }

    jsonOk(['updated' => $id]);
}

function remove($id, array $user) {
    if (!$id) jsonError('ID requis');
    $db = getDB();
    $db->prepare('DELETE FROM CA_journal WHERE id = ?')->execute([$id]);
    jsonOk(['deleted' => $id]);
}

function recalcParent($db, $childId) {
    $stmt = $db->prepare('SELECT parent_id FROM CA_taches WHERE id = ?');
    $stmt->execute([$childId]);
    $row = $stmt->fetch();
    if (!$row || !$row['parent_id']) return;
    $parentId = $row['parent_id'];
    $stmt2 = $db->prepare('SELECT AVG(progression) AS avg_prog FROM CA_taches WHERE parent_id = ?');
    $stmt2->execute([$parentId]);
    $r = $stmt2->fetch();
    $avg = $r ? intval(round($r['avg_prog'])) : 0;
    $db->prepare('UPDATE CA_taches SET progression = ? WHERE id = ?')->execute([$avg, $parentId]);
}
