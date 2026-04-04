<?php
// ============================================================
//  CORTOBA ATELIER — API Tâches / Suivi de missions
//  Hiérarchie : Mission (niveau 0) → Tâche (1) → Sous-tâche (2)
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = $_GET['id'] ?? null;
$user   = requireAuth();

try {
    if ($method === 'GET')        $id ? getOne($id) : getAll();
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

    if (!empty($_GET['projet_id'])) {
        $where[]  = 't.projet_id = ?';
        $params[] = $_GET['projet_id'];
    }
    if (isset($_GET['niveau']) && $_GET['niveau'] !== '') {
        $where[]  = 't.niveau = ?';
        $params[] = intval($_GET['niveau']);
    }
    if (!empty($_GET['parent_id'])) {
        $where[]  = 't.parent_id = ?';
        $params[] = $_GET['parent_id'];
    }
    if (!empty($_GET['statut'])) {
        $where[]  = 't.statut = ?';
        $params[] = $_GET['statut'];
    }

    $sql  = 'SELECT t.*, p.nom AS projet_nom, p.code AS projet_code
             FROM CA_taches t
             LEFT JOIN CA_projets p ON p.id = t.projet_id
             WHERE ' . implode(' AND ', $where) . '
             ORDER BY t.ordre ASC, t.cree_at ASC';
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    jsonOk($stmt->fetchAll());
}

function getOne(string $id) {
    $db   = getDB();
    $stmt = $db->prepare('SELECT t.*, p.nom AS projet_nom, p.code AS projet_code
                          FROM CA_taches t
                          LEFT JOIN CA_projets p ON p.id = t.projet_id
                          WHERE t.id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) jsonError('Tâche introuvable', 404);
    jsonOk($row);
}

function create(array $user) {
    $body  = getBody();
    $titre = trim($body['titre'] ?? '');
    if (!$titre) jsonError('Le titre est requis');
    $projetId = $body['projet_id'] ?? '';
    if (!$projetId) jsonError('Le projet est requis');

    $db = getDB();
    $id = bin2hex(random_bytes(16));

    // Calculer l'ordre max pour ce parent
    $parentId = $body['parent_id'] ?? null;
    $stmtOrd  = $db->prepare('SELECT COALESCE(MAX(ordre),0)+1 AS next_ord FROM CA_taches WHERE projet_id = ? AND ' . ($parentId ? 'parent_id = ?' : 'parent_id IS NULL'));
    $ordParams = [$projetId];
    if ($parentId) $ordParams[] = $parentId;
    $stmtOrd->execute($ordParams);
    $ordre = $stmtOrd->fetch()['next_ord'];

    $niveau = intval($body['niveau'] ?? 0);
    if ($niveau < 0 || $niveau > 2) $niveau = 0;

    $db->prepare('
        INSERT INTO CA_taches (id, projet_id, parent_id, niveau, titre, description,
            statut, priorite, assignee, date_debut, date_echeance, progression, ordre, cree_par)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ')->execute([
        $id,
        $projetId,
        $parentId ?: null,
        $niveau,
        $titre,
        $body['description'] ?? null,
        $body['statut']      ?? 'A faire',
        $body['priorite']    ?? 'Normale',
        $body['assignee']    ?? null,
        $body['date_debut']    ?: null,
        $body['date_echeance'] ?: null,
        intval($body['progression'] ?? 0),
        $ordre,
        $user['name'],
    ]);

    // Retourner la tâche créée
    $stmt = $db->prepare('SELECT t.*, p.nom AS projet_nom, p.code AS projet_code
                          FROM CA_taches t LEFT JOIN CA_projets p ON p.id = t.projet_id
                          WHERE t.id = ?');
    $stmt->execute([$id]);
    jsonOk($stmt->fetch());
}

function update($id, array $user) {
    if (!$id) jsonError('ID requis');
    $body = getBody();
    $db   = getDB();

    $stmt = $db->prepare('SELECT id FROM CA_taches WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) jsonError('Tâche introuvable', 404);

    $fields = [];
    $params = [];

    $allowed = ['titre','description','statut','priorite','assignee','date_debut','date_echeance','progression','ordre','parent_id'];
    foreach ($allowed as $f) {
        if (array_key_exists($f, $body)) {
            $fields[] = "$f = ?";
            $val = $body[$f];
            if (($f === 'date_debut' || $f === 'date_echeance' || $f === 'parent_id') && !$val) $val = null;
            if ($f === 'progression') $val = intval($val);
            if ($f === 'ordre') $val = intval($val);
            $params[] = $val;
        }
    }

    if (empty($fields)) jsonError('Aucun champ à mettre à jour');

    $params[] = $id;
    $db->prepare('UPDATE CA_taches SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);

    // Recalculer la progression du parent si c'est un enfant
    recalcParentProgression($db, $id);

    getOne($id);
}

function remove($id, array $user) {
    if (!$id) jsonError('ID requis');
    $db = getDB();

    // Récupérer l'info avant suppression
    $stmt = $db->prepare('SELECT parent_id FROM CA_taches WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) jsonError('Tâche introuvable', 404);
    $parentId = $row['parent_id'];

    // Supprimer tous les enfants récursivement
    deleteChildren($db, $id);
    $db->prepare('DELETE FROM CA_taches WHERE id = ?')->execute([$id]);

    // Recalculer progression du parent
    if ($parentId) {
        recalcParentProgressionById($db, $parentId);
    }

    jsonOk(['deleted' => $id]);
}

function deleteChildren($db, $parentId) {
    $stmt = $db->prepare('SELECT id FROM CA_taches WHERE parent_id = ?');
    $stmt->execute([$parentId]);
    $children = $stmt->fetchAll();
    foreach ($children as $child) {
        deleteChildren($db, $child['id']);
        $db->prepare('DELETE FROM CA_taches WHERE id = ?')->execute([$child['id']]);
    }
}

function recalcParentProgression($db, $childId) {
    $stmt = $db->prepare('SELECT parent_id FROM CA_taches WHERE id = ?');
    $stmt->execute([$childId]);
    $row = $stmt->fetch();
    if (!$row || !$row['parent_id']) return;
    recalcParentProgressionById($db, $row['parent_id']);
}

function recalcParentProgressionById($db, $parentId) {
    $stmt = $db->prepare('SELECT AVG(progression) AS avg_prog FROM CA_taches WHERE parent_id = ?');
    $stmt->execute([$parentId]);
    $row = $stmt->fetch();
    $avg = $row ? intval(round($row['avg_prog'])) : 0;
    $db->prepare('UPDATE CA_taches SET progression = ? WHERE id = ?')->execute([$avg, $parentId]);
}
