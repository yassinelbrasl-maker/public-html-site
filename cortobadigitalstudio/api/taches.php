<?php
// ============================================================
//  CORTOBA ATELIER — API Tâches / Suivi de missions (v3)
//  Hiérarchie : Mission (niveau 0) → Tâche (1) → Sous-tâche (2)
//  v3 : location_type/zone, heures_estimees/reelles, order_index,
//       progression_planifiee, cascade ascendante strictement
//       pilotée par progression_manuelle.
// ============================================================

require_once __DIR__ . '/../config/middleware.php';
require_once __DIR__ . '/chat_helpers.php';
require_once __DIR__ . '/notification_dispatch.php';
require_once __DIR__ . '/corbeille.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = $_GET['id'] ?? null;
$user   = requireAuth();

// Colonnes additionnelles gérées côté API (idempotent)
try {
    $db0 = getDB();
    $addCols = [
        "location_type VARCHAR(20) DEFAULT 'Bureau'",
        "location_zone VARCHAR(120) DEFAULT ''",
        "heures_estimees DECIMAL(6,2) DEFAULT 0",
        "heures_reelles DECIMAL(6,2) DEFAULT 0",
        "progression_planifiee INT DEFAULT 0",
        "progression_manuelle TINYINT(1) DEFAULT 0",
        "categorie VARCHAR(10) DEFAULT NULL COMMENT 'Code catégorie mission'",
        "demande_admin_id VARCHAR(32) DEFAULT NULL COMMENT 'Lien vers CDS_demandes_admin'",
        "assignees TEXT DEFAULT NULL COMMENT 'JSON array des membres assignés (multi-affectation)'",
    ];
    foreach ($addCols as $cdef) {
        try { $db0->exec("ALTER TABLE CDS_taches ADD COLUMN IF NOT EXISTS $cdef"); }
        catch (\Throwable $e) { /* déjà présent */ }
    }
    // Table livrables (utilisée pour le LEFT JOIN du compteur) — créée si absente
    try {
        $db0->exec("
            CREATE TABLE IF NOT EXISTS CDS_tache_livrables (
                id            VARCHAR(32)  NOT NULL PRIMARY KEY,
                tache_id      VARCHAR(32)  NOT NULL,
                label         VARCHAR(300) NOT NULL,
                done          TINYINT(1)   NOT NULL DEFAULT 0,
                catalogue_id  VARCHAR(40)  DEFAULT NULL,
                ordre         INT          NOT NULL DEFAULT 0,
                done_par      VARCHAR(120) DEFAULT NULL,
                done_at       DATETIME     DEFAULT NULL,
                cree_par      VARCHAR(120) DEFAULT NULL,
                cree_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                modifie_at    DATETIME     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
                KEY idx_tache (tache_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
    } catch (\Throwable $e) { /* silencieux */ }
} catch (\Throwable $e) { /* silencieux */ }

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

    if (!empty($_GET['projet_id']))             { $where[] = 't.projet_id = ?';     $params[] = $_GET['projet_id']; }
    if (isset($_GET['niveau']) && $_GET['niveau'] !== '') { $where[] = 't.niveau = ?'; $params[] = intval($_GET['niveau']); }
    if (!empty($_GET['parent_id']))             { $where[] = 't.parent_id = ?';     $params[] = $_GET['parent_id']; }
    if (!empty($_GET['statut']))                { $where[] = 't.statut = ?';        $params[] = $_GET['statut']; }
    if (!empty($_GET['assignee'])) {
        // Match legacy single-assignee field OU présence dans le JSON assignees (multi-affectation)
        $where[]  = '(t.assignee = ? OR JSON_SEARCH(t.assignees, "one", ?) IS NOT NULL)';
        $params[] = $_GET['assignee'];
        $params[] = $_GET['assignee'];
    }
    if (!empty($_GET['location_type']))         { $where[] = 't.location_type = ?'; $params[] = $_GET['location_type']; }

    $sql  = 'SELECT t.*, p.nom AS projet_nom, p.code AS projet_code, p.client AS projet_client,
                    COALESCE(lv.total,0) AS livrables_total,
                    COALESCE(lv.done,0)  AS livrables_done
             FROM CDS_taches t
             LEFT JOIN CDS_projets p ON p.id COLLATE utf8mb4_unicode_ci = t.projet_id COLLATE utf8mb4_unicode_ci
             LEFT JOIN (
                 SELECT tache_id, COUNT(*) AS total, SUM(done) AS done
                 FROM CDS_tache_livrables GROUP BY tache_id
             ) lv ON lv.tache_id = t.id
             WHERE ' . implode(' AND ', $where) . '
             ORDER BY t.ordre ASC, t.cree_at ASC';
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    jsonOk($stmt->fetchAll());
}

function getOne(string $id) {
    $db   = getDB();
    $stmt = $db->prepare('SELECT t.*, p.nom AS projet_nom, p.code AS projet_code, p.client AS projet_client
                          FROM CDS_taches t
                          LEFT JOIN CDS_projets p ON p.id COLLATE utf8mb4_unicode_ci = t.projet_id COLLATE utf8mb4_unicode_ci
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

    $parentId = $body['parent_id'] ?? null;
    // order_index explicite (drag&drop) sinon MAX+1 sur le même parent
    $ordre = null;
    if (isset($body['order_index']) && $body['order_index'] !== '') $ordre = intval($body['order_index']);
    if ($ordre === null && isset($body['ordre']) && $body['ordre'] !== '') $ordre = intval($body['ordre']);
    if ($ordre === null) {
        $stmtOrd  = $db->prepare('SELECT COALESCE(MAX(ordre),0)+1 AS next_ord FROM CDS_taches WHERE projet_id = ? AND ' . ($parentId ? 'parent_id = ?' : 'parent_id IS NULL'));
        $ordParams = [$projetId];
        if ($parentId) $ordParams[] = $parentId;
        $stmtOrd->execute($ordParams);
        $ordre = intval($stmtOrd->fetch()['next_ord']);
    }

    $niveau = intval($body['niveau'] ?? 0);
    if ($niveau < 0 || $niveau > 2) $niveau = 0;

    // Normaliser la liste d'affectés : accepte body.assignees (array) ou body.assignee (string legacy)
    [$assigneeLegacy, $assigneesJson] = _normalizeAssignees($body);

    $db->prepare('
        INSERT INTO CDS_taches (id, projet_id, parent_id, niveau, titre, description,
            statut, priorite, assignee, assignees, date_debut, date_echeance, progression, ordre,
            categorie, location_type, location_zone, heures_estimees, heures_reelles,
            progression_planifiee, progression_manuelle, cree_par)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ')->execute([
        $id,
        $projetId,
        $parentId ?: null,
        $niveau,
        $titre,
        $body['description'] ?? null,
        $body['statut']      ?? 'A faire',
        $body['priorite']    ?? 'Normale',
        $assigneeLegacy,
        $assigneesJson,
        $body['date_debut']    ?: null,
        $body['date_echeance'] ?: null,
        intval($body['progression'] ?? 0),
        $ordre,
        $body['categorie'] ?? null,
        $body['location_type']     ?? 'Bureau',
        $body['location_zone']     ?? '',
        floatval($body['heures_estimees'] ?? 0),
        floatval($body['heures_reelles']  ?? 0),
        intval($body['progression_planifiee'] ?? 0),
        intval(!empty($body['progression_manuelle']) ? 1 : 0),
        $user['name'],
    ]);

    // Cascade ascendante : recalculer le parent si enfant
    recalcParentProgression($db, $id);

    // Hook chat + notifications : pour chaque assignee de la liste
    $assigneeList = _assigneesFromJson($assigneesJson, $assigneeLegacy);
    if (!empty($assigneeList)) {
        $pNom = '';
        try { $pSt = $db->prepare('SELECT nom FROM CDS_projets WHERE id = ?'); $pSt->execute([$projetId]); $pRow = $pSt->fetch(); $pNom = $pRow['nom'] ?? ''; } catch (\Throwable $e) {}
        foreach ($assigneeList as $assName) {
            chat_hook_task_assignment($projetId, $assName, $titre);
            if ($assName !== ($user['name'] ?? '') && $assName !== ($user['id'] ?? '')) {
                try {
                    dispatchNotification($db, $assName, 'tache_assigned',
                        'Nouvelle tâche assignée : ' . $titre,
                        'Projet : ' . ($pNom ?: $projetId) . "\nPriorité : " . ($body['priorite'] ?? 'Normale')
                        . ($body['date_echeance'] ? "\nÉchéance : " . date('d/m/Y', strtotime($body['date_echeance'])) : ''),
                        'suivi', $id, $user['name'] ?? null);
                } catch (\Throwable $e) { /* silencieux */ }
            }
        }
    }

    $stmt = $db->prepare('SELECT t.*, p.nom AS projet_nom, p.code AS projet_code, p.client AS projet_client
                          FROM CDS_taches t LEFT JOIN CDS_projets p ON p.id COLLATE utf8mb4_unicode_ci = t.projet_id COLLATE utf8mb4_unicode_ci
                          WHERE t.id = ?');
    $stmt->execute([$id]);
    jsonOk($stmt->fetch());
}

function update($id, array $user) {
    if (!$id) jsonError('ID requis');
    $body = getBody();
    $db   = getDB();

    $stmt = $db->prepare('SELECT id FROM CDS_taches WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) jsonError('Tâche introuvable', 404);

    $fields = [];
    $params = [];

    $allowed = ['projet_id','titre','description','statut','priorite','assignee','date_debut','date_echeance',
                'progression','ordre','parent_id','categorie','location_type','location_zone',
                'heures_estimees','heures_reelles','progression_planifiee','progression_manuelle'];

    // Alias order_index → ordre
    if (array_key_exists('order_index', $body) && !array_key_exists('ordre', $body)) {
        $body['ordre'] = $body['order_index'];
    }

    // Multi-affectation : si le client envoie un tableau, synchroniser assignee (legacy) + assignees (JSON)
    if (array_key_exists('assignees', $body)) {
        [$legacyForUpd, $jsonForUpd] = _normalizeAssignees($body);
        $fields[] = 'assignee = ?';  $params[] = $legacyForUpd;
        $fields[] = 'assignees = ?'; $params[] = $jsonForUpd;
        // Ignorer 'assignee' scalaire si présent en parallèle — la liste fait foi
        unset($body['assignee']);
    }

    foreach ($allowed as $f) {
        if (array_key_exists($f, $body)) {
            $fields[] = "$f = ?";
            $val = $body[$f];
            if (($f === 'date_debut' || $f === 'date_echeance' || $f === 'parent_id') && !$val) $val = null;
            if (in_array($f, ['progression','ordre','progression_planifiee'], true)) $val = intval($val);
            if ($f === 'progression_manuelle') $val = !empty($val) ? 1 : 0;
            if (in_array($f, ['heures_estimees','heures_reelles'], true)) $val = floatval($val);
            $params[] = $val;
            // Cas scalaire legacy : si on nous passe uniquement 'assignee' (sans 'assignees'),
            // on synchronise aussi la colonne JSON pour rester cohérent
            if ($f === 'assignee' && !array_key_exists('assignees', $body)) {
                $fields[] = 'assignees = ?';
                $params[] = $val ? json_encode([$val], JSON_UNESCAPED_UNICODE) : null;
            }
        }
    }

    // Si l'utilisateur a poussé progression manuellement ET pas spécifié progression_manuelle,
    // on NE FORCE PAS le flag. Le front passe progression_manuelle=1 lorsqu'il le veut.
    if (empty($fields)) jsonError('Aucun champ à mettre à jour');

    $params[] = $id;
    $db->prepare('UPDATE CDS_taches SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);

    // Cascade ascendante après update
    recalcParentProgression($db, $id);

    // Hook chat + notifications : itérer sur tous les affectés définis
    $newAssignees = [];
    if (array_key_exists('assignees', $body)) {
        $newAssignees = _normalizeAssigneeArray($body['assignees']);
    } elseif (array_key_exists('assignee', $body) && !empty($body['assignee'])) {
        $newAssignees = [trim($body['assignee'])];
    }
    if (!empty($newAssignees)) {
        try {
            $st = $db->prepare('SELECT projet_id, titre FROM CDS_taches WHERE id = ?');
            $st->execute([$id]);
            $tRow = $st->fetch();
            if ($tRow) {
                $pNom = '';
                try { $pSt = $db->prepare('SELECT nom FROM CDS_projets WHERE id = ?'); $pSt->execute([$tRow['projet_id']]); $pRow = $pSt->fetch(); $pNom = $pRow['nom'] ?? ''; } catch (\Throwable $e2) {}
                foreach ($newAssignees as $assName) {
                    chat_hook_task_assignment($tRow['projet_id'], $assName, $tRow['titre']);
                    if ($assName !== ($user['name'] ?? '') && $assName !== ($user['id'] ?? '')) {
                        dispatchNotification($db, $assName, 'tache_assigned',
                            'Tâche réassignée : ' . $tRow['titre'],
                            'Projet : ' . ($pNom ?: $tRow['projet_id']),
                            'suivi', $id, $user['name'] ?? null);
                    }
                }
            }
        } catch (\Throwable $e) { /* silencieux */ }
    }

    // Notifier si tâche terminée (statut = Terminé/done)
    if (array_key_exists('statut', $body) && in_array(strtolower($body['statut']), ['terminé','terminée','done'], true)) {
        try {
            $st2 = $db->prepare('SELECT projet_id, titre, assignee FROM CDS_taches WHERE id = ?');
            $st2->execute([$id]);
            $tInfo = $st2->fetch();
            if ($tInfo) {
                $pNom2 = '';
                try { $pSt2 = $db->prepare('SELECT nom FROM CDS_projets WHERE id = ?'); $pSt2->execute([$tInfo['projet_id']]); $pRow2 = $pSt2->fetch(); $pNom2 = $pRow2['nom'] ?? ''; } catch (\Throwable $e2) {}
                // Notifier les managers
                $mgrs = $db->query("SELECT id FROM cds_users WHERE LOWER(role) IN ('admin','gerant','gérant','manager','directeur') AND statut <> 'Inactif'")->fetchAll();
                foreach ($mgrs as $m) {
                    if ($m['id'] === ($user['id'] ?? '')) continue;
                    dispatchNotification($db, $m['id'], 'tache_completed',
                        'Tâche terminée : ' . $tInfo['titre'],
                        'Projet : ' . ($pNom2 ?: $tInfo['projet_id']) . "\nMarquée par : " . ($user['name'] ?? '—'),
                        'suivi', $id, $user['name'] ?? null);
                }
            }
        } catch (\Throwable $e) { /* silencieux */ }
    }

    getOne($id);
}

function remove($id, array $user) {
    if (!$id) jsonError('ID requis');
    if (($user['role'] ?? '') !== 'admin') jsonError('Admin requis', 403);
    $db = getDB();

    $stmt = $db->prepare('SELECT parent_id, titre FROM CDS_taches WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) jsonError('Tâche introuvable', 404);
    $parentId = $row['parent_id'];
    $label = $row['titre'] ?? 'Tâche';

    deleteChildren($db, $id);
    if (!moveToCorbeille($db, 'CDS_taches', $id, $label, $user['name'] ?? 'unknown')) {
        jsonError('Impossible de déplacer vers la corbeille', 500);
    }

    if ($parentId) {
        recalcParentProgressionById($db, $parentId);
    }

    jsonOk(['deleted' => $id]);
}

function deleteChildren($db, $parentId) {
    $stmt = $db->prepare('SELECT id FROM CDS_taches WHERE parent_id = ?');
    $stmt->execute([$parentId]);
    $children = $stmt->fetchAll();
    foreach ($children as $child) {
        deleteChildren($db, $child['id']);
        $db->prepare('DELETE FROM CDS_taches WHERE id = ?')->execute([$child['id']]);
    }
}

// ────────────────────────────────────────────────────────────────
//  Cascade ascendante — règle : si tous les enfants sont terminés,
//  parent passe à 100% + statut "Terminé" AUTOMATIQUEMENT ; sinon
//  moyenne des progressions enfants. Mais on respecte le flag
//  progression_manuelle du parent : s'il est à 1, on ne touche
//  ni à sa progression ni à son statut.
// ────────────────────────────────────────────────────────────────
function recalcParentProgression($db, $childId) {
    $stmt = $db->prepare('SELECT parent_id FROM CDS_taches WHERE id = ?');
    $stmt->execute([$childId]);
    $row = $stmt->fetch();
    if (!$row || !$row['parent_id']) return;
    recalcParentProgressionById($db, $row['parent_id']);
}

function recalcParentProgressionById($db, $parentId) {
    // Ne rien faire si le parent est en override manuel
    $stmtP = $db->prepare('SELECT progression_manuelle, parent_id FROM CDS_taches WHERE id = ?');
    $stmtP->execute([$parentId]);
    $parent = $stmtP->fetch();
    if (!$parent) return;
    if (!empty($parent['progression_manuelle'])) {
        // Remonter encore plus haut au cas où
        if (!empty($parent['parent_id'])) recalcParentProgressionById($db, $parent['parent_id']);
        return;
    }

    $stmt = $db->prepare('SELECT COUNT(*) AS n, SUM(CASE WHEN statut=? THEN 1 ELSE 0 END) AS done, AVG(progression) AS avg_prog FROM CDS_taches WHERE parent_id = ?');
    $stmt->execute(['Terminé', $parentId]);
    $row = $stmt->fetch();
    $n    = intval($row['n']);
    $done = intval($row['done']);
    $avg  = $row ? intval(round($row['avg_prog'])) : 0;

    if ($n > 0 && $done === $n) {
        // Tous enfants terminés → parent 100% + statut Terminé
        $db->prepare('UPDATE CDS_taches SET progression = 100, statut = ? WHERE id = ?')
           ->execute(['Terminé', $parentId]);
    } else {
        $db->prepare('UPDATE CDS_taches SET progression = ? WHERE id = ?')
           ->execute([$avg, $parentId]);
    }

    // Remonter la chaîne
    if (!empty($parent['parent_id'])) recalcParentProgressionById($db, $parent['parent_id']);
}

// ────────────────────────────────────────────────────────────────
//  Helpers multi-affectation
// ────────────────────────────────────────────────────────────────
function _normalizeAssigneeArray($raw) {
    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) $raw = $decoded;
        else $raw = array_filter(array_map('trim', explode(',', $raw)));
    }
    if (!is_array($raw)) return [];
    $clean = [];
    foreach ($raw as $n) {
        $n = trim((string)$n);
        if ($n !== '' && !in_array($n, $clean, true)) $clean[] = $n;
    }
    return $clean;
}

// Retourne [legacyString, jsonOrNull] pour un body créant/éditant une tâche.
function _normalizeAssignees(array $body): array {
    $list = [];
    if (array_key_exists('assignees', $body)) {
        $list = _normalizeAssigneeArray($body['assignees']);
    } elseif (!empty($body['assignee'])) {
        $list = [trim((string)$body['assignee'])];
    }
    if (empty($list)) return [null, null];
    $json = json_encode($list, JSON_UNESCAPED_UNICODE);
    return [$list[0], $json];
}

// Extrait la liste des affectés depuis la ligne (JSON prioritaire, sinon legacy)
function _assigneesFromJson(?string $assigneesJson, ?string $legacy): array {
    if ($assigneesJson) {
        $arr = json_decode($assigneesJson, true);
        if (is_array($arr) && !empty($arr)) return _normalizeAssigneeArray($arr);
    }
    return $legacy ? [trim($legacy)] : [];
}
