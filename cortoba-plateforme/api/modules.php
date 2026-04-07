<?php
// ═══════════════════════════════════════════════════════════════
//  api/modules.php — Registre dynamique des modules de la plateforme
//  GET    : liste tous les modules actifs
//  POST   : enregistre/upsert un module (auto-registration)
//  DELETE : désactive un module (?id=xxx)
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/middleware.php';

function ensureModulesTable() {
    $db = getDB();
    $db->exec("CREATE TABLE IF NOT EXISTS `cortoba_modules` (
        `id`          VARCHAR(40)  NOT NULL PRIMARY KEY,
        `label`       VARCHAR(120) NOT NULL,
        `route_url`   VARCHAR(200) DEFAULT NULL,
        `categorie`   VARCHAR(60)  DEFAULT 'principal',
        `ordre`       INT          NOT NULL DEFAULT 100,
        `actif`       TINYINT(1)   NOT NULL DEFAULT 1,
        `cree_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Seed initial si vide
    $count = (int)$db->query("SELECT COUNT(*) FROM cortoba_modules")->fetchColumn();
    if ($count === 0) {
        $defaults = array(
            array('dashboard',   'Tableau de bord',  '#dashboard',   'principal',  10),
            array('demandes',    'Demandes',         '#demandes',    'principal',  20),
            array('devis',       'Offres & Devis',   '#devis',       'principal',  30),
            array('projets',     'Projets',          '#projets',     'principal',  40),
            array('suivi',       'Suivi',            '#suivi',       'principal',  50),
            array('journal',     'Journal quotidien','#journal',     'principal',  60),
            array('rendement',   'Rendement',        '#rendement',   'principal',  70),
            array('facturation', 'Facturation',      '#facturation', 'finance',    80),
            array('bilans',      'Bilans',           '#bilans',      'finance',    90),
            array('depenses',    'Dépenses',         '#depenses',    'finance',   100),
            array('fiscalite',   'Fiscalité',        '#fiscalite',   'finance',   110),
            array('equipe',      'Équipe',           '#equipe',      'admin',     130),
            array('clients',     'Clients',          '#clients',     'principal', 140),
            array('parametres',  'Paramètres',       '#parametres',  'admin',     150),
        );
        $stmt = $db->prepare("INSERT INTO cortoba_modules (id, label, route_url, categorie, ordre) VALUES (?, ?, ?, ?, ?)");
        foreach ($defaults as $m) $stmt->execute($m);
    }

    // ── Modules ajoutés après le seed initial : upsert idempotent ──
    // (permet aux nouveaux modules d'apparaître sur les installs existantes)
    $required = array(
        array('timesheet',      'Timesheet',             '#timesheet',      'principal', 55),
        array('gantt',          'Gantt',                 '#gantt',          'principal', 56),
        array('charge',         'Charge de travail',     '#charge',         'principal', 57),
        array('demandes-admin', 'Demandes admin',        '#demandes-admin', 'admin',    135),
        array('conges',         'Congés',                '#conges',         'admin',    138),
        array('flotte',         'Flotte véhicules',      '#flotte',         'flotte',   200),
        array('flotte-reservations','Réservations',      '#flotte-reservations','flotte',202),
        array('flotte-km',      'Kilométrage & Carburant','#flotte-km',    'flotte',   204),
        array('flotte-entretien','Entretien',            '#flotte-entretien','flotte',  206),
        array('flotte-couts',   'Coûts & TCO',           '#flotte-couts',  'flotte',   208),
        array('flotte-conformite','Conformité',          '#flotte-conformite','flotte', 210),
    );
    $up = $db->prepare("INSERT INTO cortoba_modules (id, label, route_url, categorie, ordre)
                        VALUES (?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE actif = 1");
    foreach ($required as $m) { try { $up->execute($m); } catch (\Throwable $e) {} }
}

$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'OPTIONS') { http_response_code(204); exit; }

try {
    ensureModulesTable();
    $db = getDB();

    if ($method === 'GET') {
        $rows = $db->query("SELECT id, label, route_url, categorie, ordre
                            FROM cortoba_modules WHERE actif = 1 ORDER BY ordre ASC, label ASC")
                   ->fetchAll(PDO::FETCH_ASSOC);
        jsonOk($rows);

    } elseif ($method === 'POST') {
        // Auto-registration : upsert d'un module (idempotent)
        requireAuth();
        $body = getBody();
        $id        = isset($body['id'])        ? trim($body['id'])        : '';
        $label     = isset($body['label'])     ? trim($body['label'])     : '';
        $routeUrl  = isset($body['route_url']) ? trim($body['route_url']) : '';
        $categorie = isset($body['categorie']) ? trim($body['categorie']) : 'principal';
        $ordre     = isset($body['ordre'])     ? (int)$body['ordre']      : 100;
        if (!$id || !$label) jsonError('id et label requis', 400);

        $stmt = $db->prepare("INSERT INTO cortoba_modules (id, label, route_url, categorie, ordre)
                              VALUES (?, ?, ?, ?, ?)
                              ON DUPLICATE KEY UPDATE
                                label=VALUES(label), route_url=VALUES(route_url),
                                categorie=VALUES(categorie), ordre=VALUES(ordre), actif=1");
        $stmt->execute(array($id, $label, $routeUrl, $categorie, $ordre));
        jsonOk(array('id' => $id));

    } elseif ($method === 'DELETE') {
        requireAuth();
        $id = isset($_GET['id']) ? $_GET['id'] : '';
        if (!$id) jsonError('id requis', 400);
        $stmt = $db->prepare("UPDATE cortoba_modules SET actif = 0 WHERE id = ?");
        $stmt->execute(array($id));
        jsonOk(array('deactivated' => true));

    } else {
        jsonError('Méthode non supportée', 405);
    }

} catch (Exception $e) {
    jsonError($e->getMessage(), 500);
}
