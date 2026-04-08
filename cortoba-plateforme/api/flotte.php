<?php
// ═══════════════════════════════════════════════════════════════
//  api/flotte.php — Gestion de la flotte de véhicules
//  CRUD véhicules, attributions, réservations, kilométrage,
//  carburant, entretien, coûts, assurances, permis
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/middleware.php';
require_once __DIR__ . '/corbeille.php';
setCorsHeaders();

// Helper : nettoyer le body — convertir '' en null pour éviter les erreurs MySQL sur DATE/INT
function getCleanBody() {
    $b = getBody();
    foreach ($b as $k => &$v) {
        if ($v === '') $v = null;
    }
    return $b;
}

// ── Auto-création des tables ──
function ensureFlotteTables() {
    $db = getDB();

    // 1. Registre des véhicules
    $db->exec("CREATE TABLE IF NOT EXISTS `CA_flotte_vehicules` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `marque` VARCHAR(100) NOT NULL,
      `modele` VARCHAR(100) NOT NULL,
      `immatriculation` VARCHAR(30) NOT NULL,
      `vin` VARCHAR(40) DEFAULT NULL,
      `type_vehicule` VARCHAR(60) DEFAULT 'Utilitaire',
      `couleur` VARCHAR(40) DEFAULT NULL,
      `date_achat` DATE DEFAULT NULL,
      `date_mise_circulation` DATE DEFAULT NULL,
      `valeur_achat` DECIMAL(14,2) DEFAULT 0,
      `valeur_residuelle` DECIMAL(14,2) DEFAULT 0,
      `kilometrage_actuel` INT DEFAULT 0,
      `statut` VARCHAR(40) NOT NULL DEFAULT 'Disponible',
      `departement` VARCHAR(120) DEFAULT NULL,
      `agence` VARCHAR(120) DEFAULT NULL,
      `type_usage` VARCHAR(60) DEFAULT 'Professionnel',
      `photo_url` TEXT DEFAULT NULL,
      `carte_grise_url` TEXT DEFAULT NULL,
      `notes` TEXT DEFAULT NULL,
      `cree_par` VARCHAR(120) DEFAULT NULL,
      `cree_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `modifie_at` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY `idx_statut` (`statut`),
      KEY `idx_immat` (`immatriculation`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 2. Attributions (permanentes ou temporaires)
    $db->exec("CREATE TABLE IF NOT EXISTS `CA_flotte_attributions` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `vehicule_id` VARCHAR(32) NOT NULL,
      `type_attribution` VARCHAR(30) NOT NULL DEFAULT 'permanent',
      `collaborateur` VARCHAR(200) DEFAULT NULL,
      `projet_id` VARCHAR(32) DEFAULT NULL,
      `date_debut` DATE NOT NULL,
      `date_fin` DATE DEFAULT NULL,
      `motif` TEXT DEFAULT NULL,
      `cles_remises` TINYINT(1) DEFAULT 0,
      `accessoires` TEXT DEFAULT NULL,
      `statut` VARCHAR(30) NOT NULL DEFAULT 'Active',
      `cree_par` VARCHAR(120) DEFAULT NULL,
      `cree_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `modifie_at` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY `idx_vehicule` (`vehicule_id`),
      KEY `idx_collab` (`collaborateur`(100)),
      KEY `idx_statut` (`statut`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 3. Réservations (calendrier)
    $db->exec("CREATE TABLE IF NOT EXISTS `CA_flotte_reservations` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `vehicule_id` VARCHAR(32) NOT NULL,
      `demandeur` VARCHAR(200) NOT NULL,
      `date_debut` DATETIME NOT NULL,
      `date_fin` DATETIME NOT NULL,
      `destination` VARCHAR(300) DEFAULT NULL,
      `motif` TEXT DEFAULT NULL,
      `statut` VARCHAR(30) NOT NULL DEFAULT 'En attente',
      `approuve_par` VARCHAR(120) DEFAULT NULL,
      `cree_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `modifie_at` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY `idx_vehicule` (`vehicule_id`),
      KEY `idx_dates` (`date_debut`, `date_fin`),
      KEY `idx_statut` (`statut`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 4. Relevés kilométriques et trajets
    $db->exec("CREATE TABLE IF NOT EXISTS `CA_flotte_kilometres` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `vehicule_id` VARCHAR(32) NOT NULL,
      `date_releve` DATE NOT NULL,
      `km_debut` INT DEFAULT 0,
      `km_fin` INT DEFAULT 0,
      `distance` INT DEFAULT 0,
      `type_trajet` VARCHAR(30) DEFAULT 'Professionnel',
      `destination` VARCHAR(300) DEFAULT NULL,
      `projet_id` VARCHAR(32) DEFAULT NULL,
      `client_id` VARCHAR(32) DEFAULT NULL,
      `conducteur` VARCHAR(200) DEFAULT NULL,
      `notes` TEXT DEFAULT NULL,
      `cree_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY `idx_vehicule` (`vehicule_id`),
      KEY `idx_date` (`date_releve`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 5. Carburant
    $db->exec("CREATE TABLE IF NOT EXISTS `CA_flotte_carburant` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `vehicule_id` VARCHAR(32) NOT NULL,
      `date_plein` DATE NOT NULL,
      `km_compteur` INT DEFAULT 0,
      `litres` DECIMAL(8,2) DEFAULT 0,
      `prix_litre` DECIMAL(8,3) DEFAULT 0,
      `montant_total` DECIMAL(10,2) DEFAULT 0,
      `type_carburant` VARCHAR(40) DEFAULT 'Diesel',
      `station` VARCHAR(200) DEFAULT NULL,
      `carte_carburant` VARCHAR(60) DEFAULT NULL,
      `plein_complet` TINYINT(1) DEFAULT 1,
      `cree_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY `idx_vehicule` (`vehicule_id`),
      KEY `idx_date` (`date_plein`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 6. Entretien et maintenance
    $db->exec("CREATE TABLE IF NOT EXISTS `CA_flotte_entretien` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `vehicule_id` VARCHAR(32) NOT NULL,
      `type_entretien` VARCHAR(80) NOT NULL DEFAULT 'Préventif',
      `categorie` VARCHAR(80) DEFAULT NULL,
      `titre` VARCHAR(200) NOT NULL,
      `description` TEXT DEFAULT NULL,
      `date_prevue` DATE DEFAULT NULL,
      `date_realisee` DATE DEFAULT NULL,
      `km_prevu` INT DEFAULT NULL,
      `km_realise` INT DEFAULT NULL,
      `prestataire` VARCHAR(200) DEFAULT NULL,
      `lieu` VARCHAR(200) DEFAULT NULL,
      `montant` DECIMAL(12,2) DEFAULT 0,
      `statut` VARCHAR(40) NOT NULL DEFAULT 'Planifié',
      `pieces_jointes` LONGTEXT DEFAULT NULL,
      `prochaine_echeance_km` INT DEFAULT NULL,
      `prochaine_echeance_date` DATE DEFAULT NULL,
      `cree_par` VARCHAR(120) DEFAULT NULL,
      `cree_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `modifie_at` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY `idx_vehicule` (`vehicule_id`),
      KEY `idx_statut` (`statut`),
      KEY `idx_date_prevue` (`date_prevue`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 7. Sinistres
    $db->exec("CREATE TABLE IF NOT EXISTS `CA_flotte_sinistres` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `vehicule_id` VARCHAR(32) NOT NULL,
      `date_sinistre` DATE NOT NULL,
      `type_sinistre` VARCHAR(80) DEFAULT 'Accident',
      `lieu` VARCHAR(300) DEFAULT NULL,
      `description` TEXT DEFAULT NULL,
      `conducteur` VARCHAR(200) DEFAULT NULL,
      `tiers_implique` TINYINT(1) DEFAULT 0,
      `constat_rempli` TINYINT(1) DEFAULT 0,
      `numero_dossier` VARCHAR(60) DEFAULT NULL,
      `montant_degats` DECIMAL(12,2) DEFAULT 0,
      `montant_franchise` DECIMAL(12,2) DEFAULT 0,
      `montant_rembourse` DECIMAL(12,2) DEFAULT 0,
      `statut` VARCHAR(40) NOT NULL DEFAULT 'Déclaré',
      `photos` LONGTEXT DEFAULT NULL,
      `cree_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `modifie_at` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY `idx_vehicule` (`vehicule_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 8. Assurances
    $db->exec("CREATE TABLE IF NOT EXISTS `CA_flotte_assurances` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `vehicule_id` VARCHAR(32) NOT NULL,
      `assureur` VARCHAR(200) NOT NULL,
      `numero_police` VARCHAR(80) DEFAULT NULL,
      `type_couverture` VARCHAR(80) DEFAULT 'Tous risques',
      `date_debut` DATE NOT NULL,
      `date_fin` DATE NOT NULL,
      `prime_annuelle` DECIMAL(12,2) DEFAULT 0,
      `franchise` DECIMAL(12,2) DEFAULT 0,
      `statut` VARCHAR(30) NOT NULL DEFAULT 'Active',
      `document_url` TEXT DEFAULT NULL,
      `notes` TEXT DEFAULT NULL,
      `cree_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `modifie_at` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY `idx_vehicule` (`vehicule_id`),
      KEY `idx_date_fin` (`date_fin`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 9. Contrôles techniques
    $db->exec("CREATE TABLE IF NOT EXISTS `CA_flotte_controles` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `vehicule_id` VARCHAR(32) NOT NULL,
      `type_controle` VARCHAR(80) NOT NULL DEFAULT 'Visite technique',
      `date_controle` DATE NOT NULL,
      `date_expiration` DATE NOT NULL,
      `resultat` VARCHAR(40) DEFAULT 'Favorable',
      `organisme` VARCHAR(200) DEFAULT NULL,
      `observations` TEXT DEFAULT NULL,
      `montant` DECIMAL(10,2) DEFAULT 0,
      `document_url` TEXT DEFAULT NULL,
      `cree_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY `idx_vehicule` (`vehicule_id`),
      KEY `idx_expiration` (`date_expiration`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 10. Permis de conduire des collaborateurs
    $db->exec("CREATE TABLE IF NOT EXISTS `CA_flotte_permis` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `collaborateur` VARCHAR(200) NOT NULL,
      `numero_permis` VARCHAR(60) DEFAULT NULL,
      `categorie` VARCHAR(20) DEFAULT 'B',
      `date_delivrance` DATE DEFAULT NULL,
      `date_expiration` DATE DEFAULT NULL,
      `autorite_delivrance` VARCHAR(200) DEFAULT NULL,
      `statut` VARCHAR(30) NOT NULL DEFAULT 'Valide',
      `document_url` TEXT DEFAULT NULL,
      `notes` TEXT DEFAULT NULL,
      `cree_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `modifie_at` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY `idx_collab` (`collaborateur`(100)),
      KEY `idx_expiration` (`date_expiration`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 11. Coûts divers (taxes, amendes, péages, etc.)
    $db->exec("CREATE TABLE IF NOT EXISTS `CA_flotte_couts` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `vehicule_id` VARCHAR(32) NOT NULL,
      `categorie` VARCHAR(80) NOT NULL DEFAULT 'Autre',
      `libelle` VARCHAR(200) NOT NULL,
      `date_cout` DATE NOT NULL,
      `montant` DECIMAL(12,2) DEFAULT 0,
      `notes` TEXT DEFAULT NULL,
      `cree_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY `idx_vehicule` (`vehicule_id`),
      KEY `idx_date` (`date_cout`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
}
ensureFlotteTables();

$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? $_GET['action'] : '';
$id     = isset($_GET['id']) ? $_GET['id'] : null;
$user   = requireAuth();

try {
    // ── Véhicules ──
    if ($action === '' || $action === 'vehicules') {
        if ($method === 'GET' && $id)     getVehicule($id);
        elseif ($method === 'GET')        listVehicules();
        elseif ($method === 'POST')       createVehicule($user);
        elseif ($method === 'PUT')        updateVehicule($id);
        elseif ($method === 'DELETE')     deleteVehicule($id);
    }
    // ── Attributions ──
    elseif ($action === 'attributions') {
        if ($method === 'GET')            listAttributions();
        elseif ($method === 'POST')       createAttribution($user);
        elseif ($method === 'PUT')        updateAttribution($id);
        elseif ($method === 'DELETE')     deleteAttribution($id);
    }
    // ── Réservations ──
    elseif ($action === 'reservations') {
        if ($method === 'GET')            listReservations();
        elseif ($method === 'POST')       createReservation($user);
        elseif ($method === 'PUT')        updateReservation($id);
        elseif ($method === 'DELETE')     deleteReservation($id);
    }
    // ── Kilométrage ──
    elseif ($action === 'kilometres') {
        if ($method === 'GET')            listKilometres();
        elseif ($method === 'POST')       createKilometrage($user);
        elseif ($method === 'DELETE')     deleteKilometrage($id);
    }
    // ── Carburant ──
    elseif ($action === 'carburant') {
        if ($method === 'GET')            listCarburant();
        elseif ($method === 'POST')       createCarburant($user);
        elseif ($method === 'DELETE')     deleteCarburant($id);
    }
    // ── Entretien ──
    elseif ($action === 'entretien') {
        if ($method === 'GET')            listEntretien();
        elseif ($method === 'POST')       createEntretien($user);
        elseif ($method === 'PUT')        updateEntretien($id);
        elseif ($method === 'DELETE')     deleteEntretien($id);
    }
    // ── Sinistres ──
    elseif ($action === 'sinistres') {
        if ($method === 'GET')            listSinistres();
        elseif ($method === 'POST')       createSinistre($user);
        elseif ($method === 'PUT')        updateSinistre($id);
        elseif ($method === 'DELETE')     deleteSinistre($id);
    }
    // ── Assurances ──
    elseif ($action === 'assurances') {
        if ($method === 'GET')            listAssurances();
        elseif ($method === 'POST')       createAssurance($user);
        elseif ($method === 'PUT')        updateAssurance($id);
        elseif ($method === 'DELETE')     deleteAssurance($id);
    }
    // ── Contrôles techniques ──
    elseif ($action === 'controles') {
        if ($method === 'GET')            listControles();
        elseif ($method === 'POST')       createControle($user);
        elseif ($method === 'DELETE')     deleteControle($id);
    }
    // ── Permis ──
    elseif ($action === 'permis') {
        if ($method === 'GET')            listPermis();
        elseif ($method === 'POST')       createPermis($user);
        elseif ($method === 'PUT')        updatePermis($id);
        elseif ($method === 'DELETE')     deletePermis($id);
    }
    // ── Coûts divers ──
    elseif ($action === 'couts') {
        if ($method === 'GET')            listCouts();
        elseif ($method === 'POST')       createCout($user);
        elseif ($method === 'DELETE')     deleteCout($id);
    }
    // ── Dashboard ──
    elseif ($action === 'dashboard') {
        getFlotteDashboard();
    }
    // ── TCO (Coût total de possession) ──
    elseif ($action === 'tco') {
        getTCO();
    }
    // ── Alertes ──
    elseif ($action === 'alertes') {
        getAlertes();
    }
    else {
        jsonError('Action inconnue', 404);
    }
} catch (Exception $e) {
    jsonError($e->getMessage(), 500);
}


// ══════════════════════════════════════
//  VÉHICULES
// ══════════════════════════════════════

function listVehicules() {
    $db = getDB();
    $rows = $db->query("SELECT * FROM CA_flotte_vehicules ORDER BY marque, modele")->fetchAll(PDO::FETCH_ASSOC);
    jsonOk($rows);
}

function getVehicule($id) {
    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM CA_flotte_vehicules WHERE id = ?");
    $stmt->execute([$id]);
    $v = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$v) jsonError('Véhicule introuvable', 404);

    // Attribution active
    $s2 = $db->prepare("SELECT * FROM CA_flotte_attributions WHERE vehicule_id = ? AND statut = 'Active' ORDER BY date_debut DESC LIMIT 1");
    $s2->execute([$id]);
    $v['attribution_active'] = $s2->fetch(PDO::FETCH_ASSOC) ?: null;

    // Assurance active
    $s3 = $db->prepare("SELECT * FROM CA_flotte_assurances WHERE vehicule_id = ? AND statut = 'Active' ORDER BY date_fin DESC LIMIT 1");
    $s3->execute([$id]);
    $v['assurance_active'] = $s3->fetch(PDO::FETCH_ASSOC) ?: null;

    // Dernier contrôle technique
    $s4 = $db->prepare("SELECT * FROM CA_flotte_controles WHERE vehicule_id = ? ORDER BY date_controle DESC LIMIT 1");
    $s4->execute([$id]);
    $v['dernier_controle'] = $s4->fetch(PDO::FETCH_ASSOC) ?: null;

    // Prochain entretien planifié
    $s5 = $db->prepare("SELECT * FROM CA_flotte_entretien WHERE vehicule_id = ? AND statut = 'Planifié' ORDER BY date_prevue ASC LIMIT 1");
    $s5->execute([$id]);
    $v['prochain_entretien'] = $s5->fetch(PDO::FETCH_ASSOC) ?: null;

    jsonOk($v);
}

function createVehicule($user) {
    $b = getCleanBody(); $db = getDB();
    $id = bin2hex(random_bytes(16));
    $db->prepare("INSERT INTO CA_flotte_vehicules (id, marque, modele, immatriculation, vin, type_vehicule, couleur,
                  date_achat, date_mise_circulation, valeur_achat, kilometrage_actuel, statut,
                  departement, agence, type_usage, notes, cree_par)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
       ->execute([
           $id,
           $b['marque'] ?? '', $b['modele'] ?? '', $b['immatriculation'] ?? '',
           $b['vin'] ?? null, $b['type_vehicule'] ?? 'Utilitaire', $b['couleur'] ?? null,
           $b['date_achat'] ?? null, $b['date_mise_circulation'] ?? null,
           $b['valeur_achat'] ?? 0, $b['kilometrage_actuel'] ?? 0,
           $b['statut'] ?? 'Disponible',
           $b['departement'] ?? null, $b['agence'] ?? null,
           $b['type_usage'] ?? 'Professionnel', $b['notes'] ?? null,
           $user['name'] ?? ''
       ]);
    jsonOk(['id' => $id]);
}

function updateVehicule($id) {
    $b = getCleanBody(); $db = getDB();
    $db->prepare("UPDATE CA_flotte_vehicules SET
                  marque=?, modele=?, immatriculation=?, vin=?, type_vehicule=?, couleur=?,
                  date_achat=?, date_mise_circulation=?, valeur_achat=?, valeur_residuelle=?,
                  kilometrage_actuel=?, statut=?, departement=?, agence=?, type_usage=?, notes=?
                  WHERE id=?")
       ->execute([
           $b['marque'] ?? '', $b['modele'] ?? '', $b['immatriculation'] ?? '',
           $b['vin'] ?? null, $b['type_vehicule'] ?? 'Utilitaire', $b['couleur'] ?? null,
           $b['date_achat'] ?? null, $b['date_mise_circulation'] ?? null,
           $b['valeur_achat'] ?? 0, $b['valeur_residuelle'] ?? 0,
           $b['kilometrage_actuel'] ?? 0, $b['statut'] ?? 'Disponible',
           $b['departement'] ?? null, $b['agence'] ?? null,
           $b['type_usage'] ?? 'Professionnel', $b['notes'] ?? null,
           $id
       ]);
    jsonOk(['updated' => true]);
}

function deleteVehicule($id) {
    global $user;
    if (($user['role'] ?? '') !== 'admin') jsonError('Admin requis', 403);
    $db = getDB();
    $stmt = $db->prepare("SELECT immatriculation, marque, modele FROM CA_flotte_vehicules WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $label = $row ? trim(($row['immatriculation'] ?? '') . ' ' . ($row['marque'] ?? '') . ' ' . ($row['modele'] ?? '')) : 'Véhicule';
    if (!moveToCorbeille($db, 'CA_flotte_vehicules', $id, $label, $user['name'] ?? 'unknown')) {
        jsonError('Impossible de déplacer vers la corbeille', 500);
    }
    jsonOk(['deleted' => true]);
}


// ══════════════════════════════════════
//  ATTRIBUTIONS
// ══════════════════════════════════════

function listAttributions() {
    $db = getDB();
    $vid = isset($_GET['vehicule_id']) ? $_GET['vehicule_id'] : '';
    if ($vid) {
        $stmt = $db->prepare("SELECT a.*, v.marque, v.modele, v.immatriculation
                              FROM CA_flotte_attributions a
                              LEFT JOIN CA_flotte_vehicules v ON v.id = a.vehicule_id
                              WHERE a.vehicule_id = ? ORDER BY a.date_debut DESC");
        $stmt->execute([$vid]);
    } else {
        $stmt = $db->prepare("SELECT a.*, v.marque, v.modele, v.immatriculation
                              FROM CA_flotte_attributions a
                              LEFT JOIN CA_flotte_vehicules v ON v.id = a.vehicule_id
                              ORDER BY a.date_debut DESC");
        $stmt->execute();
    }
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function createAttribution($user) {
    $b = getCleanBody(); $db = getDB();
    $id = bin2hex(random_bytes(16));
    $db->prepare("INSERT INTO CA_flotte_attributions (id, vehicule_id, type_attribution, collaborateur, projet_id,
                  date_debut, date_fin, motif, cles_remises, accessoires, statut, cree_par)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
       ->execute([
           $id, $b['vehicule_id'] ?? '', $b['type_attribution'] ?? 'permanent',
           $b['collaborateur'] ?? null, $b['projet_id'] ?? null,
           $b['date_debut'] ?? date('Y-m-d'), $b['date_fin'] ?? null,
           $b['motif'] ?? null, $b['cles_remises'] ?? 0, $b['accessoires'] ?? null,
           $b['statut'] ?? 'Active', $user['name'] ?? ''
       ]);
    // Mettre à jour le statut du véhicule
    $db->prepare("UPDATE CA_flotte_vehicules SET statut = 'Attribué' WHERE id = ?")->execute([$b['vehicule_id'] ?? '']);
    jsonOk(['id' => $id]);
}

function updateAttribution($id) {
    $b = getCleanBody(); $db = getDB();
    $db->prepare("UPDATE CA_flotte_attributions SET
                  type_attribution=?, collaborateur=?, projet_id=?, date_debut=?, date_fin=?,
                  motif=?, cles_remises=?, accessoires=?, statut=?
                  WHERE id=?")
       ->execute([
           $b['type_attribution'] ?? 'permanent', $b['collaborateur'] ?? null,
           $b['projet_id'] ?? null, $b['date_debut'] ?? date('Y-m-d'), $b['date_fin'] ?? null,
           $b['motif'] ?? null, $b['cles_remises'] ?? 0, $b['accessoires'] ?? null,
           $b['statut'] ?? 'Active', $id
       ]);
    // Si terminée, libérer le véhicule
    if (($b['statut'] ?? '') === 'Terminée') {
        $stmt = $db->prepare("SELECT vehicule_id FROM CA_flotte_attributions WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $db->prepare("UPDATE CA_flotte_vehicules SET statut = 'Disponible' WHERE id = ?")->execute([$row['vehicule_id']]);
        }
    }
    jsonOk(['updated' => true]);
}

function deleteAttribution($id) {
    global $user;
    if (($user['role'] ?? '') !== 'admin') jsonError('Admin requis', 403);
    $db = getDB();
    $stmt = $db->prepare("SELECT collaborateur, type_attribution FROM CA_flotte_attributions WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $label = $row ? trim(($row['type_attribution'] ?? '') . ' — ' . ($row['collaborateur'] ?? '')) : 'Attribution';
    if (!moveToCorbeille($db, 'CA_flotte_attributions', $id, $label, $user['name'] ?? 'unknown')) {
        jsonError('Impossible de déplacer vers la corbeille', 500);
    }
    jsonOk(['deleted' => true]);
}


// ══════════════════════════════════════
//  RÉSERVATIONS
// ══════════════════════════════════════

function listReservations() {
    $db = getDB();
    $vid = isset($_GET['vehicule_id']) ? $_GET['vehicule_id'] : '';
    if ($vid) {
        $stmt = $db->prepare("SELECT r.*, v.marque, v.modele, v.immatriculation
                              FROM CA_flotte_reservations r
                              LEFT JOIN CA_flotte_vehicules v ON v.id = r.vehicule_id
                              WHERE r.vehicule_id = ? ORDER BY r.date_debut DESC");
        $stmt->execute([$vid]);
    } else {
        $stmt = $db->prepare("SELECT r.*, v.marque, v.modele, v.immatriculation
                              FROM CA_flotte_reservations r
                              LEFT JOIN CA_flotte_vehicules v ON v.id = r.vehicule_id
                              ORDER BY r.date_debut DESC");
        $stmt->execute();
    }
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function createReservation($user) {
    $b = getCleanBody(); $db = getDB();
    $id = bin2hex(random_bytes(16));
    // Vérifier conflit de réservation
    $stmt = $db->prepare("SELECT COUNT(*) FROM CA_flotte_reservations
                          WHERE vehicule_id = ? AND statut IN ('En attente','Approuvée')
                          AND date_debut < ? AND date_fin > ?");
    $stmt->execute([$b['vehicule_id'] ?? '', $b['date_fin'] ?? '', $b['date_debut'] ?? '']);
    if ((int)$stmt->fetchColumn() > 0) {
        jsonError('Ce véhicule est déjà réservé sur cette période', 409);
        return;
    }
    $db->prepare("INSERT INTO CA_flotte_reservations (id, vehicule_id, demandeur, date_debut, date_fin,
                  destination, motif, statut)
                  VALUES (?,?,?,?,?,?,?,?)")
       ->execute([
           $id, $b['vehicule_id'] ?? '', $b['demandeur'] ?? $user['name'] ?? '',
           $b['date_debut'] ?? '', $b['date_fin'] ?? '',
           $b['destination'] ?? null, $b['motif'] ?? null,
           $b['statut'] ?? 'En attente'
       ]);
    jsonOk(['id' => $id]);
}

function updateReservation($id) {
    $b = getCleanBody(); $db = getDB();
    $db->prepare("UPDATE CA_flotte_reservations SET statut=?, approuve_par=? WHERE id=?")
       ->execute([$b['statut'] ?? 'En attente', $b['approuve_par'] ?? null, $id]);
    jsonOk(['updated' => true]);
}

function deleteReservation($id) {
    global $user;
    if (($user['role'] ?? '') !== 'admin') jsonError('Admin requis', 403);
    $db = getDB();
    $stmt = $db->prepare("SELECT demandeur, destination FROM CA_flotte_reservations WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $label = $row ? trim(($row['demandeur'] ?? '') . ' — ' . ($row['destination'] ?? '')) : 'Réservation';
    if (!moveToCorbeille($db, 'CA_flotte_reservations', $id, $label, $user['name'] ?? 'unknown')) {
        jsonError('Impossible de déplacer vers la corbeille', 500);
    }
    jsonOk(['deleted' => true]);
}


// ══════════════════════════════════════
//  KILOMÉTRAGE
// ══════════════════════════════════════

function listKilometres() {
    $db = getDB();
    $vid = isset($_GET['vehicule_id']) ? $_GET['vehicule_id'] : '';
    if ($vid) {
        $stmt = $db->prepare("SELECT k.*, v.marque, v.modele, v.immatriculation
                              FROM CA_flotte_kilometres k
                              LEFT JOIN CA_flotte_vehicules v ON v.id = k.vehicule_id
                              WHERE k.vehicule_id = ? ORDER BY k.date_releve DESC");
        $stmt->execute([$vid]);
    } else {
        $stmt = $db->prepare("SELECT k.*, v.marque, v.modele, v.immatriculation
                              FROM CA_flotte_kilometres k
                              LEFT JOIN CA_flotte_vehicules v ON v.id = k.vehicule_id
                              ORDER BY k.date_releve DESC");
        $stmt->execute();
    }
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function createKilometrage($user) {
    $b = getCleanBody(); $db = getDB();
    $id = bin2hex(random_bytes(16));
    $distance = (int)($b['km_fin'] ?? 0) - (int)($b['km_debut'] ?? 0);
    $db->prepare("INSERT INTO CA_flotte_kilometres (id, vehicule_id, date_releve, km_debut, km_fin, distance,
                  type_trajet, destination, projet_id, client_id, conducteur, notes)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
       ->execute([
           $id, $b['vehicule_id'] ?? '', $b['date_releve'] ?? date('Y-m-d'),
           $b['km_debut'] ?? 0, $b['km_fin'] ?? 0, $distance,
           $b['type_trajet'] ?? 'Professionnel', $b['destination'] ?? null,
           $b['projet_id'] ?? null, $b['client_id'] ?? null,
           $b['conducteur'] ?? $user['name'] ?? '', $b['notes'] ?? null
       ]);
    // Mettre à jour km du véhicule
    if (($b['km_fin'] ?? 0) > 0) {
        $db->prepare("UPDATE CA_flotte_vehicules SET kilometrage_actuel = GREATEST(kilometrage_actuel, ?) WHERE id = ?")
           ->execute([$b['km_fin'], $b['vehicule_id'] ?? '']);
    }
    jsonOk(['id' => $id]);
}

function deleteKilometrage($id) {
    global $user;
    if (($user['role'] ?? '') !== 'admin') jsonError('Admin requis', 403);
    $db = getDB();
    $stmt = $db->prepare("SELECT date_releve, destination FROM CA_flotte_kilometres WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $label = $row ? trim(($row['date_releve'] ?? '') . ' ' . ($row['destination'] ?? '')) : 'Kilométrage';
    if (!moveToCorbeille($db, 'CA_flotte_kilometres', $id, $label, $user['name'] ?? 'unknown')) {
        jsonError('Impossible de déplacer vers la corbeille', 500);
    }
    jsonOk(['deleted' => true]);
}


// ══════════════════════════════════════
//  CARBURANT
// ══════════════════════════════════════

function listCarburant() {
    $db = getDB();
    $vid = isset($_GET['vehicule_id']) ? $_GET['vehicule_id'] : '';
    if ($vid) {
        $stmt = $db->prepare("SELECT c.*, v.marque, v.modele, v.immatriculation
                              FROM CA_flotte_carburant c
                              LEFT JOIN CA_flotte_vehicules v ON v.id = c.vehicule_id
                              WHERE c.vehicule_id = ? ORDER BY c.date_plein DESC");
        $stmt->execute([$vid]);
    } else {
        $stmt = $db->prepare("SELECT c.*, v.marque, v.modele, v.immatriculation
                              FROM CA_flotte_carburant c
                              LEFT JOIN CA_flotte_vehicules v ON v.id = c.vehicule_id
                              ORDER BY c.date_plein DESC");
        $stmt->execute();
    }
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function createCarburant($user) {
    $b = getCleanBody(); $db = getDB();
    $id = bin2hex(random_bytes(16));
    $montant = (float)($b['litres'] ?? 0) * (float)($b['prix_litre'] ?? 0);
    if (isset($b['montant_total']) && (float)$b['montant_total'] > 0) $montant = (float)$b['montant_total'];
    $db->prepare("INSERT INTO CA_flotte_carburant (id, vehicule_id, date_plein, km_compteur, litres, prix_litre,
                  montant_total, type_carburant, station, carte_carburant, plein_complet)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?)")
       ->execute([
           $id, $b['vehicule_id'] ?? '', $b['date_plein'] ?? date('Y-m-d'),
           $b['km_compteur'] ?? 0, $b['litres'] ?? 0, $b['prix_litre'] ?? 0,
           $montant, $b['type_carburant'] ?? 'Diesel',
           $b['station'] ?? null, $b['carte_carburant'] ?? null,
           $b['plein_complet'] ?? 1
       ]);
    // Mettre à jour km
    if (($b['km_compteur'] ?? 0) > 0) {
        $db->prepare("UPDATE CA_flotte_vehicules SET kilometrage_actuel = GREATEST(kilometrage_actuel, ?) WHERE id = ?")
           ->execute([$b['km_compteur'], $b['vehicule_id'] ?? '']);
    }
    jsonOk(['id' => $id]);
}

function deleteCarburant($id) {
    global $user;
    if (($user['role'] ?? '') !== 'admin') jsonError('Admin requis', 403);
    $db = getDB();
    $stmt = $db->prepare("SELECT date_plein, station FROM CA_flotte_carburant WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $label = $row ? trim(($row['date_plein'] ?? '') . ' ' . ($row['station'] ?? '')) : 'Carburant';
    if (!moveToCorbeille($db, 'CA_flotte_carburant', $id, $label, $user['name'] ?? 'unknown')) {
        jsonError('Impossible de déplacer vers la corbeille', 500);
    }
    jsonOk(['deleted' => true]);
}


// ══════════════════════════════════════
//  ENTRETIEN
// ══════════════════════════════════════

function listEntretien() {
    $db = getDB();
    $vid = isset($_GET['vehicule_id']) ? $_GET['vehicule_id'] : '';
    if ($vid) {
        $stmt = $db->prepare("SELECT e.*, v.marque, v.modele, v.immatriculation
                              FROM CA_flotte_entretien e
                              LEFT JOIN CA_flotte_vehicules v ON v.id = e.vehicule_id
                              WHERE e.vehicule_id = ? ORDER BY COALESCE(e.date_prevue, e.date_realisee) DESC");
        $stmt->execute([$vid]);
    } else {
        $stmt = $db->prepare("SELECT e.*, v.marque, v.modele, v.immatriculation
                              FROM CA_flotte_entretien e
                              LEFT JOIN CA_flotte_vehicules v ON v.id = e.vehicule_id
                              ORDER BY COALESCE(e.date_prevue, e.date_realisee) DESC");
        $stmt->execute();
    }
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function createEntretien($user) {
    $b = getCleanBody(); $db = getDB();
    $id = bin2hex(random_bytes(16));
    $db->prepare("INSERT INTO CA_flotte_entretien (id, vehicule_id, type_entretien, categorie, titre, description,
                  date_prevue, date_realisee, km_prevu, km_realise, prestataire, lieu, montant, statut,
                  prochaine_echeance_km, prochaine_echeance_date, cree_par)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
       ->execute([
           $id, $b['vehicule_id'] ?? '', $b['type_entretien'] ?? 'Préventif',
           $b['categorie'] ?? null, $b['titre'] ?? '', $b['description'] ?? null,
           $b['date_prevue'] ?? null, $b['date_realisee'] ?? null,
           $b['km_prevu'] ?? null, $b['km_realise'] ?? null,
           $b['prestataire'] ?? null, $b['lieu'] ?? null,
           $b['montant'] ?? 0, $b['statut'] ?? 'Planifié',
           $b['prochaine_echeance_km'] ?? null, $b['prochaine_echeance_date'] ?? null,
           $user['name'] ?? ''
       ]);
    jsonOk(['id' => $id]);
}

function updateEntretien($id) {
    $b = getCleanBody(); $db = getDB();
    $db->prepare("UPDATE CA_flotte_entretien SET
                  type_entretien=?, categorie=?, titre=?, description=?,
                  date_prevue=?, date_realisee=?, km_prevu=?, km_realise=?,
                  prestataire=?, lieu=?, montant=?, statut=?,
                  prochaine_echeance_km=?, prochaine_echeance_date=?
                  WHERE id=?")
       ->execute([
           $b['type_entretien'] ?? 'Préventif', $b['categorie'] ?? null,
           $b['titre'] ?? '', $b['description'] ?? null,
           $b['date_prevue'] ?? null, $b['date_realisee'] ?? null,
           $b['km_prevu'] ?? null, $b['km_realise'] ?? null,
           $b['prestataire'] ?? null, $b['lieu'] ?? null,
           $b['montant'] ?? 0, $b['statut'] ?? 'Planifié',
           $b['prochaine_echeance_km'] ?? null, $b['prochaine_echeance_date'] ?? null,
           $id
       ]);
    // Si en réparation, mettre à jour statut véhicule
    if (($b['statut'] ?? '') === 'En cours') {
        $db->prepare("UPDATE CA_flotte_vehicules SET statut = 'En réparation' WHERE id = ?")->execute([$b['vehicule_id'] ?? '']);
    } elseif (($b['statut'] ?? '') === 'Terminé') {
        $db->prepare("UPDATE CA_flotte_vehicules SET statut = 'Disponible' WHERE id = ?")->execute([$b['vehicule_id'] ?? '']);
    }
    jsonOk(['updated' => true]);
}

function deleteEntretien($id) {
    global $user;
    if (($user['role'] ?? '') !== 'admin') jsonError('Admin requis', 403);
    $db = getDB();
    $stmt = $db->prepare("SELECT titre FROM CA_flotte_entretien WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $label = $row ? ($row['titre'] ?: 'Entretien') : 'Entretien';
    if (!moveToCorbeille($db, 'CA_flotte_entretien', $id, $label, $user['name'] ?? 'unknown')) {
        jsonError('Impossible de déplacer vers la corbeille', 500);
    }
    jsonOk(['deleted' => true]);
}


// ══════════════════════════════════════
//  SINISTRES
// ══════════════════════════════════════

function listSinistres() {
    $db = getDB();
    $vid = isset($_GET['vehicule_id']) ? $_GET['vehicule_id'] : '';
    if ($vid) {
        $stmt = $db->prepare("SELECT s.*, v.marque, v.modele, v.immatriculation
                              FROM CA_flotte_sinistres s
                              LEFT JOIN CA_flotte_vehicules v ON v.id = s.vehicule_id
                              WHERE s.vehicule_id = ? ORDER BY s.date_sinistre DESC");
        $stmt->execute([$vid]);
    } else {
        $stmt = $db->prepare("SELECT s.*, v.marque, v.modele, v.immatriculation
                              FROM CA_flotte_sinistres s
                              LEFT JOIN CA_flotte_vehicules v ON v.id = s.vehicule_id
                              ORDER BY s.date_sinistre DESC");
        $stmt->execute();
    }
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function createSinistre($user) {
    $b = getCleanBody(); $db = getDB();
    $id = bin2hex(random_bytes(16));
    $db->prepare("INSERT INTO CA_flotte_sinistres (id, vehicule_id, date_sinistre, type_sinistre, lieu,
                  description, conducteur, tiers_implique, constat_rempli, numero_dossier,
                  montant_degats, montant_franchise, statut)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
       ->execute([
           $id, $b['vehicule_id'] ?? '', $b['date_sinistre'] ?? date('Y-m-d'),
           $b['type_sinistre'] ?? 'Accident', $b['lieu'] ?? null,
           $b['description'] ?? null, $b['conducteur'] ?? null,
           $b['tiers_implique'] ?? 0, $b['constat_rempli'] ?? 0,
           $b['numero_dossier'] ?? null, $b['montant_degats'] ?? 0,
           $b['montant_franchise'] ?? 0, $b['statut'] ?? 'Déclaré'
       ]);
    jsonOk(['id' => $id]);
}

function updateSinistre($id) {
    $b = getCleanBody(); $db = getDB();
    $db->prepare("UPDATE CA_flotte_sinistres SET
                  type_sinistre=?, lieu=?, description=?, conducteur=?,
                  tiers_implique=?, constat_rempli=?, numero_dossier=?,
                  montant_degats=?, montant_franchise=?, montant_rembourse=?, statut=?
                  WHERE id=?")
       ->execute([
           $b['type_sinistre'] ?? 'Accident', $b['lieu'] ?? null,
           $b['description'] ?? null, $b['conducteur'] ?? null,
           $b['tiers_implique'] ?? 0, $b['constat_rempli'] ?? 0,
           $b['numero_dossier'] ?? null, $b['montant_degats'] ?? 0,
           $b['montant_franchise'] ?? 0, $b['montant_rembourse'] ?? 0,
           $b['statut'] ?? 'Déclaré', $id
       ]);
    jsonOk(['updated' => true]);
}

function deleteSinistre($id) {
    $db = getDB();
    $db->prepare("DELETE FROM CA_flotte_sinistres WHERE id=?")->execute([$id]);
    jsonOk(['deleted' => true]);
}


// ══════════════════════════════════════
//  ASSURANCES
// ══════════════════════════════════════

function listAssurances() {
    $db = getDB();
    $vid = isset($_GET['vehicule_id']) ? $_GET['vehicule_id'] : '';
    if ($vid) {
        $stmt = $db->prepare("SELECT a.*, v.marque, v.modele, v.immatriculation
                              FROM CA_flotte_assurances a
                              LEFT JOIN CA_flotte_vehicules v ON v.id = a.vehicule_id
                              WHERE a.vehicule_id = ? ORDER BY a.date_fin DESC");
        $stmt->execute([$vid]);
    } else {
        $stmt = $db->prepare("SELECT a.*, v.marque, v.modele, v.immatriculation
                              FROM CA_flotte_assurances a
                              LEFT JOIN CA_flotte_vehicules v ON v.id = a.vehicule_id
                              ORDER BY a.date_fin DESC");
        $stmt->execute();
    }
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function createAssurance($user) {
    $b = getCleanBody(); $db = getDB();
    $id = bin2hex(random_bytes(16));
    $db->prepare("INSERT INTO CA_flotte_assurances (id, vehicule_id, assureur, numero_police, type_couverture,
                  date_debut, date_fin, prime_annuelle, franchise, statut, notes)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?)")
       ->execute([
           $id, $b['vehicule_id'] ?? '', $b['assureur'] ?? '', $b['numero_police'] ?? null,
           $b['type_couverture'] ?? 'Tous risques',
           $b['date_debut'] ?? date('Y-m-d'), $b['date_fin'] ?? '',
           $b['prime_annuelle'] ?? 0, $b['franchise'] ?? 0,
           $b['statut'] ?? 'Active', $b['notes'] ?? null
       ]);
    jsonOk(['id' => $id]);
}

function updateAssurance($id) {
    $b = getCleanBody(); $db = getDB();
    $db->prepare("UPDATE CA_flotte_assurances SET
                  assureur=?, numero_police=?, type_couverture=?,
                  date_debut=?, date_fin=?, prime_annuelle=?, franchise=?, statut=?, notes=?
                  WHERE id=?")
       ->execute([
           $b['assureur'] ?? '', $b['numero_police'] ?? null,
           $b['type_couverture'] ?? 'Tous risques',
           $b['date_debut'] ?? date('Y-m-d'), $b['date_fin'] ?? '',
           $b['prime_annuelle'] ?? 0, $b['franchise'] ?? 0,
           $b['statut'] ?? 'Active', $b['notes'] ?? null, $id
       ]);
    jsonOk(['updated' => true]);
}

function deleteAssurance($id) {
    $db = getDB();
    $db->prepare("DELETE FROM CA_flotte_assurances WHERE id=?")->execute([$id]);
    jsonOk(['deleted' => true]);
}


// ══════════════════════════════════════
//  CONTRÔLES TECHNIQUES
// ══════════════════════════════════════

function listControles() {
    $db = getDB();
    $vid = isset($_GET['vehicule_id']) ? $_GET['vehicule_id'] : '';
    if ($vid) {
        $stmt = $db->prepare("SELECT c.*, v.marque, v.modele, v.immatriculation
                              FROM CA_flotte_controles c
                              LEFT JOIN CA_flotte_vehicules v ON v.id = c.vehicule_id
                              WHERE c.vehicule_id = ? ORDER BY c.date_controle DESC");
        $stmt->execute([$vid]);
    } else {
        $stmt = $db->prepare("SELECT c.*, v.marque, v.modele, v.immatriculation
                              FROM CA_flotte_controles c
                              LEFT JOIN CA_flotte_vehicules v ON v.id = c.vehicule_id
                              ORDER BY c.date_controle DESC");
        $stmt->execute();
    }
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function createControle($user) {
    $b = getCleanBody(); $db = getDB();
    $id = bin2hex(random_bytes(16));
    $db->prepare("INSERT INTO CA_flotte_controles (id, vehicule_id, type_controle, date_controle, date_expiration,
                  resultat, organisme, observations, montant)
                  VALUES (?,?,?,?,?,?,?,?,?)")
       ->execute([
           $id, $b['vehicule_id'] ?? '', $b['type_controle'] ?? 'Visite technique',
           $b['date_controle'] ?? date('Y-m-d'), $b['date_expiration'] ?? '',
           $b['resultat'] ?? 'Favorable', $b['organisme'] ?? null,
           $b['observations'] ?? null, $b['montant'] ?? 0
       ]);
    jsonOk(['id' => $id]);
}

function deleteControle($id) {
    $db = getDB();
    $db->prepare("DELETE FROM CA_flotte_controles WHERE id=?")->execute([$id]);
    jsonOk(['deleted' => true]);
}


// ══════════════════════════════════════
//  PERMIS
// ══════════════════════════════════════

function listPermis() {
    $db = getDB();
    $rows = $db->query("SELECT * FROM CA_flotte_permis ORDER BY collaborateur")->fetchAll(PDO::FETCH_ASSOC);
    jsonOk($rows);
}

function createPermis($user) {
    $b = getCleanBody(); $db = getDB();
    $id = bin2hex(random_bytes(16));
    $db->prepare("INSERT INTO CA_flotte_permis (id, collaborateur, numero_permis, categorie, date_delivrance,
                  date_expiration, autorite_delivrance, statut, notes)
                  VALUES (?,?,?,?,?,?,?,?,?)")
       ->execute([
           $id, $b['collaborateur'] ?? '', $b['numero_permis'] ?? null,
           $b['categorie'] ?? 'B', $b['date_delivrance'] ?? null,
           $b['date_expiration'] ?? null, $b['autorite_delivrance'] ?? null,
           $b['statut'] ?? 'Valide', $b['notes'] ?? null
       ]);
    jsonOk(['id' => $id]);
}

function updatePermis($id) {
    $b = getCleanBody(); $db = getDB();
    $db->prepare("UPDATE CA_flotte_permis SET
                  collaborateur=?, numero_permis=?, categorie=?, date_delivrance=?,
                  date_expiration=?, autorite_delivrance=?, statut=?, notes=?
                  WHERE id=?")
       ->execute([
           $b['collaborateur'] ?? '', $b['numero_permis'] ?? null,
           $b['categorie'] ?? 'B', $b['date_delivrance'] ?? null,
           $b['date_expiration'] ?? null, $b['autorite_delivrance'] ?? null,
           $b['statut'] ?? 'Valide', $b['notes'] ?? null, $id
       ]);
    jsonOk(['updated' => true]);
}

function deletePermis($id) {
    $db = getDB();
    $db->prepare("DELETE FROM CA_flotte_permis WHERE id=?")->execute([$id]);
    jsonOk(['deleted' => true]);
}


// ══════════════════════════════════════
//  COÛTS DIVERS
// ══════════════════════════════════════

function listCouts() {
    $db = getDB();
    $vid = isset($_GET['vehicule_id']) ? $_GET['vehicule_id'] : '';
    if ($vid) {
        $stmt = $db->prepare("SELECT c.*, v.marque, v.modele, v.immatriculation
                              FROM CA_flotte_couts c
                              LEFT JOIN CA_flotte_vehicules v ON v.id = c.vehicule_id
                              WHERE c.vehicule_id = ? ORDER BY c.date_cout DESC");
        $stmt->execute([$vid]);
    } else {
        $stmt = $db->prepare("SELECT c.*, v.marque, v.modele, v.immatriculation
                              FROM CA_flotte_couts c
                              LEFT JOIN CA_flotte_vehicules v ON v.id = c.vehicule_id
                              ORDER BY c.date_cout DESC");
        $stmt->execute();
    }
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function createCout($user) {
    $b = getCleanBody(); $db = getDB();
    $id = bin2hex(random_bytes(16));
    $db->prepare("INSERT INTO CA_flotte_couts (id, vehicule_id, categorie, libelle, date_cout, montant, notes)
                  VALUES (?,?,?,?,?,?,?)")
       ->execute([
           $id, $b['vehicule_id'] ?? '', $b['categorie'] ?? 'Autre',
           $b['libelle'] ?? '', $b['date_cout'] ?? date('Y-m-d'),
           $b['montant'] ?? 0, $b['notes'] ?? null
       ]);
    jsonOk(['id' => $id]);
}

function deleteCout($id) {
    $db = getDB();
    $db->prepare("DELETE FROM CA_flotte_couts WHERE id=?")->execute([$id]);
    jsonOk(['deleted' => true]);
}


// ══════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════

function getFlotteDashboard() {
    $db = getDB();

    $total = (int)$db->query("SELECT COUNT(*) FROM CA_flotte_vehicules")->fetchColumn();
    $disponibles = (int)$db->query("SELECT COUNT(*) FROM CA_flotte_vehicules WHERE statut = 'Disponible'")->fetchColumn();
    $attribues = (int)$db->query("SELECT COUNT(*) FROM CA_flotte_vehicules WHERE statut = 'Attribué'")->fetchColumn();
    $enReparation = (int)$db->query("SELECT COUNT(*) FROM CA_flotte_vehicules WHERE statut = 'En réparation'")->fetchColumn();
    $horsService = (int)$db->query("SELECT COUNT(*) FROM CA_flotte_vehicules WHERE statut = 'Hors service'")->fetchColumn();

    // Coûts du mois
    $mois = date('Y-m');
    $carburantMois = (float)$db->query("SELECT COALESCE(SUM(montant_total),0) FROM CA_flotte_carburant WHERE date_plein LIKE '$mois%'")->fetchColumn();
    $entretienMois = (float)$db->query("SELECT COALESCE(SUM(montant),0) FROM CA_flotte_entretien WHERE (date_realisee LIKE '$mois%' OR date_prevue LIKE '$mois%') AND statut != 'Annulé'")->fetchColumn();
    $coutsMois = (float)$db->query("SELECT COALESCE(SUM(montant),0) FROM CA_flotte_couts WHERE date_cout LIKE '$mois%'")->fetchColumn();

    // KM total du mois
    $kmMois = (int)$db->query("SELECT COALESCE(SUM(distance),0) FROM CA_flotte_kilometres WHERE date_releve LIKE '$mois%'")->fetchColumn();

    // Réservations en attente
    $resaEnAttente = (int)$db->query("SELECT COUNT(*) FROM CA_flotte_reservations WHERE statut = 'En attente'")->fetchColumn();

    jsonOk([
        'total_vehicules' => $total,
        'disponibles' => $disponibles,
        'attribues' => $attribues,
        'en_reparation' => $enReparation,
        'hors_service' => $horsService,
        'carburant_mois' => $carburantMois,
        'entretien_mois' => $entretienMois,
        'couts_mois' => $coutsMois,
        'km_mois' => $kmMois,
        'reservations_en_attente' => $resaEnAttente,
        'total_couts_mois' => $carburantMois + $entretienMois + $coutsMois
    ]);
}


// ══════════════════════════════════════
//  TCO (Coût Total de Possession)
// ══════════════════════════════════════

function getTCO() {
    $db = getDB();
    $vid = isset($_GET['vehicule_id']) ? $_GET['vehicule_id'] : '';

    $where = $vid ? "WHERE v.id = ?" : "";
    $params = $vid ? [$vid] : [];

    $sql = "SELECT v.id, v.marque, v.modele, v.immatriculation, v.valeur_achat, v.date_achat, v.kilometrage_actuel,
            COALESCE(carb.total, 0) AS total_carburant,
            COALESCE(ent.total, 0) AS total_entretien,
            COALESCE(ass.total, 0) AS total_assurance,
            COALESCE(ct.total, 0) AS total_couts,
            COALESCE(sin.total, 0) AS total_sinistres
            FROM CA_flotte_vehicules v
            LEFT JOIN (SELECT vehicule_id, SUM(montant_total) AS total FROM CA_flotte_carburant GROUP BY vehicule_id) carb ON carb.vehicule_id = v.id
            LEFT JOIN (SELECT vehicule_id, SUM(montant) AS total FROM CA_flotte_entretien WHERE statut != 'Annulé' GROUP BY vehicule_id) ent ON ent.vehicule_id = v.id
            LEFT JOIN (SELECT vehicule_id, SUM(prime_annuelle) AS total FROM CA_flotte_assurances GROUP BY vehicule_id) ass ON ass.vehicule_id = v.id
            LEFT JOIN (SELECT vehicule_id, SUM(montant) AS total FROM CA_flotte_couts GROUP BY vehicule_id) ct ON ct.vehicule_id = v.id
            LEFT JOIN (SELECT vehicule_id, SUM(montant_degats) - SUM(montant_rembourse) AS total FROM CA_flotte_sinistres GROUP BY vehicule_id) sin ON sin.vehicule_id = v.id
            $where
            ORDER BY v.marque, v.modele";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as &$r) {
        $r['tco'] = (float)$r['valeur_achat'] + (float)$r['total_carburant'] + (float)$r['total_entretien']
                   + (float)$r['total_assurance'] + (float)$r['total_couts'] + (float)$r['total_sinistres'];
        $km = (int)$r['kilometrage_actuel'];
        $r['cout_km'] = $km > 0 ? round($r['tco'] / $km, 3) : 0;
    }

    jsonOk($rows);
}


// ══════════════════════════════════════
//  ALERTES
// ══════════════════════════════════════

function getAlertes() {
    $db = getDB();
    $alertes = [];
    $today = date('Y-m-d');
    $dans30j = date('Y-m-d', strtotime('+30 days'));

    // Assurances expirant bientôt
    $stmt = $db->prepare("SELECT a.*, v.marque, v.modele, v.immatriculation
                          FROM CA_flotte_assurances a
                          LEFT JOIN CA_flotte_vehicules v ON v.id = a.vehicule_id
                          WHERE a.date_fin BETWEEN ? AND ? AND a.statut = 'Active'");
    $stmt->execute([$today, $dans30j]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $alertes[] = ['type' => 'assurance', 'urgence' => 'warning', 'vehicule' => $row['marque'].' '.$row['modele'].' ('.$row['immatriculation'].')',
                      'message' => 'Assurance expire le '.$row['date_fin'], 'date' => $row['date_fin']];
    }

    // Contrôles techniques expirant bientôt
    $stmt = $db->prepare("SELECT c.*, v.marque, v.modele, v.immatriculation
                          FROM CA_flotte_controles c
                          LEFT JOIN CA_flotte_vehicules v ON v.id = c.vehicule_id
                          WHERE c.date_expiration BETWEEN ? AND ?");
    $stmt->execute([$today, $dans30j]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $alertes[] = ['type' => 'controle', 'urgence' => 'warning', 'vehicule' => $row['marque'].' '.$row['modele'].' ('.$row['immatriculation'].')',
                      'message' => 'Contrôle technique expire le '.$row['date_expiration'], 'date' => $row['date_expiration']];
    }

    // Permis expirant bientôt
    $stmt = $db->prepare("SELECT * FROM CA_flotte_permis WHERE date_expiration BETWEEN ? AND ?");
    $stmt->execute([$today, $dans30j]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $alertes[] = ['type' => 'permis', 'urgence' => 'warning', 'vehicule' => $row['collaborateur'],
                      'message' => 'Permis expire le '.$row['date_expiration'], 'date' => $row['date_expiration']];
    }

    // Entretiens planifiés en retard
    $stmt = $db->prepare("SELECT e.*, v.marque, v.modele, v.immatriculation
                          FROM CA_flotte_entretien e
                          LEFT JOIN CA_flotte_vehicules v ON v.id = e.vehicule_id
                          WHERE e.statut = 'Planifié' AND e.date_prevue < ?");
    $stmt->execute([$today]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $alertes[] = ['type' => 'entretien', 'urgence' => 'error', 'vehicule' => $row['marque'].' '.$row['modele'].' ('.$row['immatriculation'].')',
                      'message' => 'Entretien en retard: '.$row['titre'], 'date' => $row['date_prevue']];
    }

    // Éléments déjà expirés
    $stmt = $db->prepare("SELECT a.*, v.marque, v.modele, v.immatriculation
                          FROM CA_flotte_assurances a
                          LEFT JOIN CA_flotte_vehicules v ON v.id = a.vehicule_id
                          WHERE a.date_fin < ? AND a.statut = 'Active'");
    $stmt->execute([$today]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $alertes[] = ['type' => 'assurance', 'urgence' => 'error', 'vehicule' => $row['marque'].' '.$row['modele'].' ('.$row['immatriculation'].')',
                      'message' => 'Assurance EXPIRÉE depuis le '.$row['date_fin'], 'date' => $row['date_fin']];
    }

    usort($alertes, function($a, $b) {
        $urgOrder = ['error' => 0, 'warning' => 1, 'info' => 2];
        $ua = $urgOrder[$a['urgence']] ?? 2;
        $ub = $urgOrder[$b['urgence']] ?? 2;
        return $ua - $ub ?: strcmp($a['date'], $b['date']);
    });

    jsonOk($alertes);
}
