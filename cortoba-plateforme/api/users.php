<?php
// ═══════════════════════════════════════════════════════════════
//  api/users.php — Gestion des membres de l'équipe Cortoba
//  v2 : photo de profil, double contact, rémunération, projection
//  Compatible PHP 5.6+
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/middleware.php';

function ensureUsersTable() {
    $db = getDB();
    $db->exec("CREATE TABLE IF NOT EXISTS `cortoba_users` (
        `id`         VARCHAR(32)  NOT NULL PRIMARY KEY,
        `prenom`     VARCHAR(100) NOT NULL,
        `nom`        VARCHAR(100) NOT NULL,
        `email`      VARCHAR(191) NOT NULL UNIQUE,
        `role`       VARCHAR(100) NOT NULL DEFAULT '',
        `statut`     VARCHAR(50)  NOT NULL DEFAULT 'Actif',
        `tel`        VARCHAR(50)  DEFAULT '',
        `spec`       VARCHAR(200) DEFAULT '',
        `modules`    TEXT         DEFAULT '[]',
        `pass_hash`  VARCHAR(255) NOT NULL,
        `is_admin`   TINYINT(1)   NOT NULL DEFAULT 0,
        `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Colonnes additionnelles v2 (idempotent — IF NOT EXISTS supporté MySQL 8+/MariaDB 10.0.2+)
    $extraCols = array(
        "profile_picture_url VARCHAR(400) DEFAULT NULL",
        "tel_pro             VARCHAR(50)  DEFAULT ''",
        "tel_perso           VARCHAR(50)  DEFAULT ''",
        "tel_principal       VARCHAR(10)  NOT NULL DEFAULT 'pro'",
        "email_pro           VARCHAR(191) DEFAULT ''",
        "email_perso         VARCHAR(191) DEFAULT ''",
        "email_principal     VARCHAR(10)  NOT NULL DEFAULT 'pro'",
        "salaire_net         DECIMAL(12,2) DEFAULT 0",
        "charges_sociales    DECIMAL(12,2) DEFAULT 0",
        "subventions         DECIMAL(12,2) DEFAULT 0",
        "subv_directe       TINYINT(1)    DEFAULT 0",
        "avantages_nature    DECIMAL(12,2) DEFAULT 0",
        "heures_mois         DECIMAL(6,2)  DEFAULT 160",
        "date_embauche       DATE         DEFAULT NULL",
        "date_derniere_augm  DATE         DEFAULT NULL",
        "taux_augm_pct       DECIMAL(5,2) DEFAULT 5",
        // ── Informations fiche de paie ──
        "cin                 VARCHAR(20)  DEFAULT ''",
        "matricule           VARCHAR(40)  DEFAULT ''",
        "n_cnss              VARCHAR(40)  DEFAULT ''",
        "situation_familiale VARCHAR(20)  DEFAULT 'Célibataire'",
        "enfants_charge      INT          DEFAULT 0",
        "adresse             VARCHAR(300) DEFAULT ''",
        "echelon             VARCHAR(40)  DEFAULT ''",
        "categorie_emploi    VARCHAR(40)  DEFAULT ''",
        "emploi              VARCHAR(120) DEFAULT ''",
        "banque              VARCHAR(120) DEFAULT ''",
        "rib                 VARCHAR(40)  DEFAULT ''",
        "mode_paiement       VARCHAR(30)  DEFAULT 'Virement'",
        "salaire_base        DECIMAL(12,3) DEFAULT 0",
        "show_on_website     TINYINT(1)   NOT NULL DEFAULT 0",
        "color               VARCHAR(9)   DEFAULT '#c8a96e'",
        // ── Taux horaires pour le module Rendement ──
        "hourly_cost_rate    DECIMAL(10,3) DEFAULT NULL",
        "hourly_billing_rate DECIMAL(10,3) DEFAULT NULL",
    );
    foreach ($extraCols as $colDef) {
        try { $db->exec("ALTER TABLE cortoba_users ADD COLUMN IF NOT EXISTS $colDef"); }
        catch (Exception $e) { /* silencieux — déjà présente ou MySQL ancien */ }
    }
}

// Rôles avec accès aux données sensibles (salaire, charges, contact perso)
function canViewSensitiveData($user) {
    if (!$user) return false;
    if (($user['role'] ?? '') === 'admin') return true;
    if (!empty($user['isMember']) && ($user['role'] ?? '') === 'Architecte gérant') return true;
    return false;
}

// Filtre un enregistrement membre selon les droits
function filterMemberRow($row, $viewer) {
    $sensitive = canViewSensitiveData($viewer);

    // Décoder modules
    $decoded = json_decode(isset($row['modules']) ? $row['modules'] : '[]', true);
    $row['modules'] = is_array($decoded) ? $decoded : array();

    // Toujours visibles
    $public = array(
        'id', 'prenom', 'nom', 'email', 'role', 'statut', 'spec', 'modules',
        'profile_picture_url', 'tel', 'created_at', 'show_on_website', 'color',
    );

    // Contact pro visible par tous ; contact perso masqué pour non-privilégiés
    $public[] = 'tel_pro';
    $public[] = 'email_pro';
    $public[] = 'tel_principal';
    $public[] = 'email_principal';

    if ($sensitive) {
        $public = array_merge($public, array(
            'tel_perso', 'email_perso',
            'salaire_net', 'charges_sociales', 'subventions', 'subv_directe', 'avantages_nature',
            'heures_mois', 'date_embauche', 'date_derniere_augm', 'taux_augm_pct',
            // Fiche de paie
            'cin', 'matricule', 'n_cnss', 'situation_familiale', 'enfants_charge',
            'adresse', 'echelon', 'categorie_emploi', 'emploi',
            'banque', 'rib', 'mode_paiement', 'salaire_base',
            'hourly_cost_rate', 'hourly_billing_rate',
        ));
    }

    $out = array();
    foreach ($public as $k) {
        if (array_key_exists($k, $row)) $out[$k] = $row[$k];
    }

    // Calculs dérivés (si privilégié)
    if ($sensitive) {
        $salaire  = (float)($row['salaire_net'] ?? 0);
        $charges  = (float)($row['charges_sociales'] ?? 0);
        $subv     = (float)($row['subventions'] ?? 0);
        $subvDir  = (int)($row['subv_directe'] ?? 0);
        $avant    = (float)($row['avantages_nature'] ?? 0);
        $heures   = max(1, (float)($row['heures_mois'] ?? 160));
        $coutTot  = $subvDir ? ($salaire + $charges + $avant) : (($salaire + $charges) - $subv + $avant);
        $out['cout_total_mensuel'] = round($coutTot, 2);
        $out['cout_horaire']       = round($coutTot / $heures, 2);
    }

    return $out;
}

// Tenter de lire la session (sans forcer) pour décider du filtrage sur GET
function optionalAuth() {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (strpos($authHeader, 'Bearer ') !== 0) return null;
    $token = substr($authHeader, 7);
    return jwtDecode($token);
}

$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'OPTIONS') { http_response_code(204); exit; }

if ($method !== 'GET') {
    requireAuth();
}

try {
    ensureUsersTable();
    $db = getDB();
    $viewer = optionalAuth();

    if ($method === 'GET') {
        // Mode public : listing minimal pour le site vitrine (sans email ni données sensibles)
        if (!empty($_GET['public'])) {
            $stmt = $db->query("SELECT id, prenom, nom, role, spec, profile_picture_url
                                FROM cortoba_users
                                WHERE is_admin = 0 AND show_on_website = 1
                                ORDER BY created_at ASC");
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            jsonOk($rows);
            return;
        }
        $stmt = $db->query("SELECT * FROM cortoba_users WHERE is_admin = 0 ORDER BY created_at ASC");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $out = array();
        foreach ($rows as $r) $out[] = filterMemberRow($r, $viewer);
        jsonOk($out);

    } elseif ($method === 'POST' || $method === 'PUT') {
        $body   = getBody();
        $isEdit = ($method === 'PUT');

        // Champs de base
        $id      = isset($body['id']) ? $body['id'] : ($isEdit ? '' : bin2hex(random_bytes(8)));
        if ($isEdit && !$id) jsonError('ID requis', 400);

        $prenom  = trim($body['prenom']   ?? '');
        $nom     = trim($body['nom']      ?? '');
        $email   = strtolower(trim($body['email'] ?? ''));
        $role    = trim($body['role']     ?? '');
        $statut  = trim($body['statut']   ?? 'Actif');
        $tel     = trim($body['tel']      ?? '');
        $spec    = trim($body['spec']     ?? '');
        $pass    = $body['password']       ?? '';
        $modules = json_encode($body['modules'] ?? array());

        // Nouveaux champs
        $photo      = isset($body['profile_picture_url']) ? trim($body['profile_picture_url']) : null;
        $telPro     = trim($body['tel_pro']         ?? '');
        $telPerso   = trim($body['tel_perso']       ?? '');
        $telPrinc   = in_array($body['tel_principal'] ?? 'pro', array('pro','perso')) ? $body['tel_principal'] : 'pro';
        $emailPro   = trim($body['email_pro']       ?? '');
        $emailPerso = trim($body['email_perso']     ?? '');
        $emailPrinc = in_array($body['email_principal'] ?? 'pro', array('pro','perso')) ? $body['email_principal'] : 'pro';
        $showWeb    = !empty($body['show_on_website']) ? 1 : 0;
        $color      = isset($body['color']) ? trim($body['color']) : '#c8a96e';
        if (!preg_match('/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/', $color)) $color = '#c8a96e';

        // Rémunération — acceptée uniquement si viewer privilégié
        $canEditSalary = canViewSensitiveData($viewer);
        $salaire  = $canEditSalary ? (float)($body['salaire_net']      ?? 0) : null;
        $charges  = $canEditSalary ? (float)($body['charges_sociales'] ?? 0) : null;
        $subv     = $canEditSalary ? (float)($body['subventions']      ?? 0) : null;
        $subvDir  = $canEditSalary ? (int)(!empty($body['subv_directe']) ? 1 : 0) : null;
        $avant    = $canEditSalary ? (float)($body['avantages_nature'] ?? 0) : null;
        $heures   = $canEditSalary ? (float)($body['heures_mois']      ?? 160) : null;
        $dateEmb  = $canEditSalary ? ($body['date_embauche']      ?? null) : null;
        $dateAug  = $canEditSalary ? ($body['date_derniere_augm'] ?? null) : null;
        $tauxAug  = $canEditSalary ? (float)($body['taux_augm_pct']    ?? 5) : null;
        if ($dateEmb === '') $dateEmb = null;
        if ($dateAug === '') $dateAug = null;

        // Fiche de paie (champs partiellement sensibles — nécessitent aussi le droit sensible)
        $cin        = $canEditSalary ? trim($body['cin']                 ?? '') : null;
        $matricule  = $canEditSalary ? trim($body['matricule']           ?? '') : null;
        $nCnss      = $canEditSalary ? trim($body['n_cnss']              ?? '') : null;
        $sitFam     = $canEditSalary ? trim($body['situation_familiale'] ?? 'Célibataire') : null;
        $enfants    = $canEditSalary ? (int)($body['enfants_charge']     ?? 0) : null;
        $adresseP   = $canEditSalary ? trim($body['adresse']             ?? '') : null;
        $echelon    = $canEditSalary ? trim($body['echelon']             ?? '') : null;
        $catEmploi  = $canEditSalary ? trim($body['categorie_emploi']    ?? '') : null;
        $emploi     = $canEditSalary ? trim($body['emploi']              ?? '') : null;
        $banqueP    = $canEditSalary ? trim($body['banque']              ?? '') : null;
        $ribP       = $canEditSalary ? trim($body['rib']                 ?? '') : null;
        $modePaie   = $canEditSalary ? trim($body['mode_paiement']       ?? 'Virement') : null;
        $salaireBas = $canEditSalary ? (float)($body['salaire_base']     ?? 0) : null;
        // Taux horaires Rendement (null = fallback vers taux standard global)
        $hCost    = ($canEditSalary && isset($body['hourly_cost_rate'])    && $body['hourly_cost_rate']    !== '' && $body['hourly_cost_rate']    !== null) ? (float)$body['hourly_cost_rate']    : null;
        $hBilling = ($canEditSalary && isset($body['hourly_billing_rate']) && $body['hourly_billing_rate'] !== '' && $body['hourly_billing_rate'] !== null) ? (float)$body['hourly_billing_rate'] : null;

        if (!$prenom || !$nom || !$email) jsonError('Champs requis manquants', 400);
        if (!$isEdit && !$pass)             jsonError('Mot de passe requis', 400);

        // Construire la requête
        $cols = array(
            'prenom' => $prenom, 'nom' => $nom, 'email' => $email, 'role' => $role,
            'statut' => $statut, 'tel' => $tel, 'spec' => $spec, 'modules' => $modules,
            'profile_picture_url' => $photo,
            'tel_pro' => $telPro, 'tel_perso' => $telPerso, 'tel_principal' => $telPrinc,
            'email_pro' => $emailPro, 'email_perso' => $emailPerso, 'email_principal' => $emailPrinc,
            'show_on_website' => $showWeb,
            'color' => $color,
        );
        if ($canEditSalary) {
            $cols['salaire_net']        = $salaire;
            $cols['charges_sociales']   = $charges;
            $cols['subventions']        = $subv;
            $cols['subv_directe']       = $subvDir;
            $cols['avantages_nature']   = $avant;
            $cols['heures_mois']        = $heures;
            $cols['date_embauche']      = $dateEmb;
            $cols['date_derniere_augm'] = $dateAug;
            $cols['taux_augm_pct']      = $tauxAug;
            // Fiche de paie
            $cols['cin']                 = $cin;
            $cols['matricule']           = $matricule;
            $cols['n_cnss']              = $nCnss;
            $cols['situation_familiale'] = $sitFam;
            $cols['enfants_charge']      = $enfants;
            $cols['adresse']             = $adresseP;
            $cols['echelon']             = $echelon;
            $cols['categorie_emploi']    = $catEmploi;
            $cols['emploi']              = $emploi;
            $cols['banque']              = $banqueP;
            $cols['rib']                 = $ribP;
            $cols['mode_paiement']       = $modePaie;
            $cols['salaire_base']        = $salaireBas;
            $cols['hourly_cost_rate']    = $hCost;
            $cols['hourly_billing_rate'] = $hBilling;
        }

        if ($isEdit) {
            $set = array(); $vals = array();
            foreach ($cols as $c => $v) { $set[] = "`$c`=?"; $vals[] = $v; }
            if ($pass) { $set[] = "pass_hash=?"; $vals[] = password_hash($pass, PASSWORD_DEFAULT); }
            $vals[] = $id;
            $sql = "UPDATE cortoba_users SET " . implode(',', $set) . " WHERE id=?";
            $db->prepare($sql)->execute($vals);
        } else {
            $cols['id']        = $id;
            $cols['pass_hash'] = password_hash($pass, PASSWORD_DEFAULT);
            $cols['is_admin']  = 0;
            $keys = array_keys($cols);
            $ph   = array_fill(0, count($keys), '?');
            $sql  = "INSERT INTO cortoba_users (`" . implode('`,`', $keys) . "`) VALUES (" . implode(',', $ph) . ")";
            $db->prepare($sql)->execute(array_values($cols));
        }
        jsonOk(array('id' => $id, 'email' => $email));

    } elseif ($method === 'DELETE') {
        $id = isset($_GET['id']) ? $_GET['id'] : '';
        if (!$id) jsonError('ID requis', 400);
        $stmt = $db->prepare("DELETE FROM cortoba_users WHERE id = ? AND is_admin = 0");
        $stmt->execute(array($id));
        jsonOk(array('deleted' => true));

    } else {
        jsonError('Méthode non supportée', 405);
    }

} catch (Exception $e) {
    jsonError($e->getMessage(), 500);
}
