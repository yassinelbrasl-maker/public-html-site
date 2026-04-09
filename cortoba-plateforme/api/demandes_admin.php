<?php
// ============================================================
//  CORTOBA ATELIER — API Demandes administratives
//  CRUD courriers vers administrations (AR/FR)
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = $_GET['id'] ?? null;
$action = $_GET['action'] ?? null;
$user   = requireAuth();

// Migrations idempotentes
try {
    $db0 = getDB();
    $extra = [
        "justificatif_url    VARCHAR(500) DEFAULT NULL",
        "date_depot          DATE         DEFAULT NULL",
        "documents_manquants LONGTEXT     DEFAULT NULL",
        "reponse_type        VARCHAR(20)  DEFAULT NULL",
        "parent_demande_id   VARCHAR(32)  DEFAULT NULL",
    ];
    // S'assurer que CA_taches a la colonne demande_admin_id
    try { $db0->exec("ALTER TABLE CA_taches ADD COLUMN IF NOT EXISTS demande_admin_id VARCHAR(32) DEFAULT NULL COMMENT 'Lien vers CA_demandes_admin'"); }
    catch (\Throwable $e) {}
    foreach ($extra as $cdef) {
        try { $db0->exec("ALTER TABLE CA_demandes_admin ADD COLUMN IF NOT EXISTS $cdef"); }
        catch (\Throwable $e) {}
    }
} catch (\Throwable $e) {}

try {
    if ($method === 'POST' && $action === 'clone') { cloneDemande($id, $user); exit; }
    if ($method === 'GET')        getAll();
    elseif ($method === 'POST')   create($user);
    elseif ($method === 'PUT')    update($id, $user);
    elseif ($method === 'DELETE') remove($id, $user);
    else jsonError('Méthode non supportée', 405);
} catch (\Throwable $e) {
    jsonError('Erreur serveur : ' . $e->getMessage(), 500);
}

// Clone une demande rejetée pour redépôt (lien parent conservé)
function cloneDemande($id, $user) {
    if (!$id) jsonError('ID requis');
    $db = getDB();
    $stmt = $db->prepare('SELECT * FROM CA_demandes_admin WHERE id = ?');
    $stmt->execute([$id]);
    $src = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$src) jsonError('Demande introuvable', 404);

    $newId = bin2hex(random_bytes(16));
    $db->prepare('INSERT INTO CA_demandes_admin
        (id, projet_id, client_id, type_demande, langue, administration, gouvernorat,
         delegation, municipalite, objet, contenu, documents_joints, expediteur,
         destinataire, reference, date_demande, statut, remarques, cree_par, parent_demande_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
       ->execute([
        $newId, $src['projet_id'], $src['client_id'], $src['type_demande'], $src['langue'],
        $src['administration'], $src['gouvernorat'], $src['delegation'], $src['municipalite'],
        '[À rectifier] ' . $src['objet'], $src['contenu'], $src['documents_joints'],
        $src['expediteur'], $src['destinataire'], null, date('Y-m-d'), 'Brouillon',
        'Clone de la demande ' . ($src['reference'] ?: $id) . ' suite à rejet.',
        $user['name'] ?? $user['email'] ?? null,
        $id,
    ]);
    jsonOk(['id' => $newId, 'parent' => $id]);
}

function getAll() {
    $db = getDB();
    $where  = ['1=1'];
    $params = [];

    if (!empty($_GET['projet_id'])) {
        $where[]  = 'd.projet_id = ?';
        $params[] = $_GET['projet_id'];
    }
    if (!empty($_GET['statut'])) {
        $where[]  = 'd.statut = ?';
        $params[] = $_GET['statut'];
    }
    if (!empty($_GET['administration'])) {
        $where[]  = 'd.administration = ?';
        $params[] = $_GET['administration'];
    }
    if (!empty($_GET['type_demande'])) {
        $where[]  = 'd.type_demande = ?';
        $params[] = $_GET['type_demande'];
    }
    if (!empty($_GET['date_from'])) {
        $where[]  = 'd.date_demande >= ?';
        $params[] = $_GET['date_from'];
    }
    if (!empty($_GET['date_to'])) {
        $where[]  = 'd.date_demande <= ?';
        $params[] = $_GET['date_to'];
    }

    $sql = 'SELECT d.*,
                   p.nom AS projet_nom, p.code AS projet_code,
                   c.display_nom AS client_nom, c.code AS client_code
            FROM CA_demandes_admin d
            LEFT JOIN CA_projets p ON p.id COLLATE utf8mb4_unicode_ci = d.projet_id COLLATE utf8mb4_unicode_ci
            LEFT JOIN CA_clients c ON c.id COLLATE utf8mb4_unicode_ci = d.client_id COLLATE utf8mb4_unicode_ci
            WHERE ' . implode(' AND ', $where) . '
            ORDER BY d.date_demande DESC, d.cree_at DESC';

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    jsonOk($stmt->fetchAll());
}

function create(array $user) {
    $body = getBody();
    $db   = getDB();
    $id   = bin2hex(random_bytes(16));

    $typeDemande   = trim($body['type_demande'] ?? '');
    $administration = trim($body['administration'] ?? '');
    $objet         = trim($body['objet'] ?? '');

    if (!$typeDemande)   jsonError('Le type de demande est requis');
    if (!$administration) jsonError("L'administration est requise");
    if (!$objet)          jsonError("L'objet est requis");

    $db->prepare('
        INSERT INTO CA_demandes_admin (id, projet_id, client_id, type_demande, langue, administration,
            gouvernorat, delegation, municipalite, objet, contenu, documents_joints,
            expediteur, destinataire, reference, date_demande, statut, remarques, cree_par)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ')->execute([
        $id,
        $body['projet_id'] ?? null,
        $body['client_id'] ?? null,
        $typeDemande,
        $body['langue'] ?? 'fr',
        $administration,
        $body['gouvernorat'] ?? null,
        $body['delegation'] ?? null,
        $body['municipalite'] ?? null,
        $objet,
        $body['contenu'] ?? null,
        !empty($body['documents_joints']) ? json_encode($body['documents_joints']) : null,
        $body['expediteur'] ?? null,
        $body['destinataire'] ?? null,
        $body['reference'] ?? null,
        $body['date_demande'] ?? date('Y-m-d'),
        $body['statut'] ?? 'Brouillon',
        $body['remarques'] ?? null,
        $user['name'] ?? $user['email'] ?? null,
    ]);

    // ── Auto-créer une mission "En cours" dans le suivi ──
    $projetId = $body['projet_id'] ?? null;
    if ($projetId) {
        $missionId = bin2hex(random_bytes(16));
        // Calcul ordre suivant
        $stOrd = $db->prepare('SELECT COALESCE(MAX(ordre),0)+1 AS next_ord FROM CA_taches WHERE projet_id = ? AND parent_id IS NULL');
        $stOrd->execute([$projetId]);
        $nextOrd = intval($stOrd->fetch()['next_ord']);

        $missionTitre = '[Demande admin] ' . $objet;
        $db->prepare('
            INSERT INTO CA_taches (id, projet_id, parent_id, niveau, titre, description,
                statut, priorite, assignee, date_debut, date_echeance, progression, ordre,
                categorie, location_type, location_zone, heures_estimees, heures_reelles,
                progression_planifiee, progression_manuelle, cree_par, demande_admin_id)
            VALUES (?,?,NULL,0,?,?,?,?,NULL,?,NULL,0,?,NULL,?,?,0,0,0,0,?,?)
        ')->execute([
            $missionId,
            $projetId,
            $missionTitre,
            'Demande ' . $typeDemande . ' — ' . $administration,
            'En cours',
            'Normale',
            $body['date_demande'] ?? date('Y-m-d'),
            $nextOrd,
            'Administration',
            $body['gouvernorat'] ?? '',
            $user['name'] ?? $user['email'] ?? null,
            $id,
        ]);
    }

    jsonOk(['id' => $id]);
}

function update($id, array $user) {
    if (!$id) jsonError('ID requis');
    $body = getBody();
    $db   = getDB();

    $stmt = $db->prepare('SELECT id FROM CA_demandes_admin WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) jsonError('Demande introuvable', 404);

    $fields = [];
    $params = [];
    $allowed = ['projet_id','client_id','type_demande','langue','administration','gouvernorat',
                'delegation','municipalite','objet','contenu','documents_joints',
                'expediteur','destinataire','reference','date_demande','statut','remarques',
                'justificatif_url','date_depot','documents_manquants','reponse_type'];

    foreach ($allowed as $f) {
        if (array_key_exists($f, $body)) {
            $fields[] = "$f = ?";
            $val = $body[$f];
            if (($f === 'documents_joints' || $f === 'documents_manquants') && is_array($val)) $val = json_encode($val);
            if ($f === 'date_depot' && !$val) $val = null;
            $params[] = $val;
        }
    }
    if (empty($fields)) jsonError('Aucun champ à mettre à jour');

    $params[] = $id;
    $db->prepare('UPDATE CA_demandes_admin SET ' . implode(', ', $fields) . ' WHERE id = ?')
       ->execute($params);

    jsonOk(['updated' => $id]);
}

function remove($id, array $user) {
    if (!$id) jsonError('ID requis');
    $db = getDB();
    $db->prepare('DELETE FROM CA_demandes_admin WHERE id = ?')->execute([$id]);
    jsonOk(['deleted' => $id]);
}
