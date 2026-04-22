<?php
// ============================================================
//  CORTOBA ATELIER — API Échéancier de facturation
//  Planification et suivi des facturations à venir
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

function ensureEcheancierSchema() {
    static $done = false;
    if ($done) return;
    $db = getDB();

    $db->exec("CREATE TABLE IF NOT EXISTS `CDS_echeancier` (
      `id` int unsigned NOT NULL AUTO_INCREMENT,
      `projet_id` varchar(32) NOT NULL,
      `mission_phase` varchar(30) DEFAULT NULL,
      `description` varchar(200) DEFAULT NULL,
      `montant_prevu` decimal(14,2) NOT NULL DEFAULT 0,
      `date_prevue` date NOT NULL,
      `facture_id` varchar(32) DEFAULT NULL,
      `statut` enum('prevu','facture','annule') NOT NULL DEFAULT 'prevu',
      `cree_par` varchar(120) DEFAULT NULL,
      `cree_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `modifie_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      KEY `projet_id` (`projet_id`),
      KEY `date_prevue` (`date_prevue`),
      KEY `statut` (`statut`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $done = true;
}

setCorsHeaders();
ensureEcheancierSchema();

$user = requireAuth();
$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($action) {
        case 'list':
            listEcheances();
            break;
        case 'save':
            if ($method !== 'POST') jsonError('POST requis', 405);
            saveEcheance($user);
            break;
        case 'delete':
            if ($method !== 'DELETE') jsonError('DELETE requis', 405);
            deleteEcheance($user);
            break;
        case 'generate':
            if ($method !== 'POST') jsonError('POST requis', 405);
            generateFromHonoraires($user);
            break;
        case 'link_facture':
            if ($method !== 'POST') jsonError('POST requis', 405);
            linkFacture($user);
            break;
        default:
            jsonError('Action inconnue: ' . $action, 400);
    }
} catch (\Throwable $e) {
    jsonError('Erreur serveur: ' . $e->getMessage(), 500);
}

function listEcheances() {
    $db = getDB();
    $projetId = $_GET['projet_id'] ?? '';

    if ($projetId) {
        $stmt = $db->prepare("SELECT e.*, p.code AS projet_code, p.nom AS projet_nom, f.numero AS facture_numero
            FROM CDS_echeancier e
            LEFT JOIN CDS_projets p ON p.id COLLATE utf8mb4_unicode_ci = e.projet_id COLLATE utf8mb4_unicode_ci
            LEFT JOIN CDS_factures f ON f.id COLLATE utf8mb4_unicode_ci = e.facture_id COLLATE utf8mb4_unicode_ci
            WHERE e.projet_id = ?
            ORDER BY e.date_prevue ASC");
        $stmt->execute([$projetId]);
    } else {
        $stmt = $db->query("SELECT e.*, p.code AS projet_code, p.nom AS projet_nom, f.numero AS facture_numero
            FROM CDS_echeancier e
            LEFT JOIN CDS_projets p ON p.id COLLATE utf8mb4_unicode_ci = e.projet_id COLLATE utf8mb4_unicode_ci
            LEFT JOIN CDS_factures f ON f.id COLLATE utf8mb4_unicode_ci = e.facture_id COLLATE utf8mb4_unicode_ci
            ORDER BY e.date_prevue ASC
            LIMIT 500");
    }
    jsonOk($stmt->fetchAll(\PDO::FETCH_ASSOC));
}

function saveEcheance($user) {
    $body = getBody();
    $id = $body['id'] ?? null;
    $db = getDB();

    if ($id) {
        // Update
        $db->prepare("UPDATE CDS_echeancier SET projet_id = ?, mission_phase = ?, description = ?, montant_prevu = ?, date_prevue = ?, statut = ? WHERE id = ?")
           ->execute([
               $body['projet_id'] ?? '',
               $body['mission_phase'] ?? null,
               $body['description'] ?? null,
               (float)($body['montant_prevu'] ?? 0),
               $body['date_prevue'] ?? date('Y-m-d'),
               $body['statut'] ?? 'prevu',
               $id,
           ]);
    } else {
        // Insert
        $db->prepare("INSERT INTO CDS_echeancier (projet_id, mission_phase, description, montant_prevu, date_prevue, statut, cree_par) VALUES (?,?,?,?,?,?,?)")
           ->execute([
               $body['projet_id'] ?? '',
               $body['mission_phase'] ?? null,
               $body['description'] ?? null,
               (float)($body['montant_prevu'] ?? 0),
               $body['date_prevue'] ?? date('Y-m-d'),
               $body['statut'] ?? 'prevu',
               $user['name'] ?? null,
           ]);
        $id = $db->lastInsertId();
    }

    $s = $db->prepare("SELECT * FROM CDS_echeancier WHERE id = ?");
    $s->execute([$id]);
    jsonOk($s->fetch(\PDO::FETCH_ASSOC));
}

function deleteEcheance($user) {
    $id = $_GET['id'] ?? '';
    if (!$id) jsonError('id requis');
    $db = getDB();
    $db->prepare("DELETE FROM CDS_echeancier WHERE id = ?")->execute([$id]);
    jsonOk(['deleted' => $id]);
}

function generateFromHonoraires($user) {
    $body = getBody();
    $projetId = $body['projet_id'] ?? '';
    if (!$projetId) jsonError('projet_id requis');

    $db = getDB();

    // Get project phases
    $s = $db->prepare("SELECT * FROM CDS_projets_honoraires WHERE projet_id = ? ORDER BY ordre ASC");
    $s->execute([$projetId]);
    $phases = $s->fetchAll(\PDO::FETCH_ASSOC);
    if (!$phases) jsonError('Aucune phase d\'honoraires trouvée. Initialisez d\'abord les honoraires du projet.');

    // Delete existing non-invoiced echeances for this project
    $db->prepare("DELETE FROM CDS_echeancier WHERE projet_id = ? AND statut = 'prevu'")->execute([$projetId]);

    $startDate = new \DateTime($body['date_debut'] ?? 'now');
    $intervalMonths = (int)($body['intervalle_mois'] ?? 2);

    $stmt = $db->prepare("INSERT INTO CDS_echeancier (projet_id, mission_phase, description, montant_prevu, date_prevue, cree_par) VALUES (?,?,?,?,?,?)");

    $count = 0;
    foreach ($phases as $p) {
        $montant = (float)$p['montant_prevu'];
        if ($montant <= 0) continue;

        $date = clone $startDate;
        $date->modify("+" . ($count * $intervalMonths) . " months");

        $stmt->execute([
            $projetId,
            $p['mission_phase'],
            'Facturation ' . ($p['mission_label'] ?? $p['mission_phase']),
            $montant,
            $date->format('Y-m-d'),
            $user['name'] ?? null,
        ]);
        $count++;
    }

    jsonOk(['generated' => $count]);
}

function linkFacture($user) {
    $body = getBody();
    $echeanceId = $body['echeance_id'] ?? '';
    $factureId = $body['facture_id'] ?? '';
    if (!$echeanceId || !$factureId) jsonError('echeance_id et facture_id requis');

    $db = getDB();
    $db->prepare("UPDATE CDS_echeancier SET facture_id = ?, statut = 'facture' WHERE id = ?")
       ->execute([$factureId, $echeanceId]);

    jsonOk(['linked' => true]);
}
