<?php
// data.php — version maximalement compatible PHP 5.6+
// Pas de type hints, pas de Throwable, pas de null coalescing imbriqué

// Afficher toutes les erreurs dans la réponse
@ini_set('display_errors', 0);
@ini_set('log_errors', 1);

// Intercepter les erreurs fatales
register_shutdown_function(function() {
    $err = error_get_last();
    if ($err && in_array($err['type'], array(E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR))) {
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
            http_response_code(500);
        }
        echo json_encode(array(
            'success' => false,
            'error'   => 'PHP Fatal: ' . $err['message'],
            'file'    => basename($err['file']),
            'line'    => $err['line']
        ));
    }
});

require_once dirname(__FILE__) . '/../config/middleware.php';
require_once dirname(__FILE__) . '/corbeille.php';

$user   = requireAuth();
$method = $_SERVER['REQUEST_METHOD'];
$table  = isset($_GET['table']) ? $_GET['table'] : '';
$id     = isset($_GET['id'])    ? $_GET['id']    : null;

$TABLES = array(
    'devis' => array(
        'table'    => 'CA_devis',
        'cols'     => array('numero','client','client_id','projet_id','montant_ht','tva',
                            'montant_ttc','statut','date_devis','date_expiry','objet','notes'),
        'cree_par' => true,
    ),
    'factures' => array(
        'table'    => 'CA_factures',
        'cols'     => array(
            'numero','client','client_id','projet_id',
            'client_adresse','client_mf','objet',
            'montant_ht','tva','montant_ttc',
            'statut','date_facture','date_emission','date_echeance','date_paiement',
            'lignes_json','fodec','timbre','ras_taux','ras_amt','net_payer',
            'mode_paiement','rib','ref_elfatoora','signature_elec',
            'montant_lettres','notes',
        ),
        'cree_par' => true,
    ),
    'depenses' => array(
        'table'    => 'CA_depenses',
        'cols'     => array('description','montant','categorie','projet_id','date_dep','justificatif',
                            'fournisseur','reference','code_tva_fournisseur',
                            'montant_ht','montant_tva','timbre','montant_ttc','lignes_json','template_id',
                            'employe_id','paie_mois','paie_snapshot',
                            'depense_par','rembourse_par','remboursement_statut','remboursement_date'),
        'cree_par' => true,
    ),
);

if (!isset($TABLES[$table]) && $table !== 'parametres') {
    jsonError('Table inconnue : ' . $table, 404);
}

if ($table === 'parametres') {
    handleParametres($method, $user);
    exit;
}

$cfg = $TABLES[$table];

if ($method === 'GET') {
    if ($id) { getOne($cfg['table'], $id); } else { getAll($cfg['table']); }
} elseif ($method === 'POST') {
    createRow($cfg, $user);
} elseif ($method === 'PUT') {
    updateRow($cfg, $id, $user);
} elseif ($method === 'DELETE') {
    removeRow($cfg['table'], $id, $user);
} else {
    jsonError('Méthode non supportée', 405);
}

function getAll($table) {
    global $user;
    $db = getDB();
    // Non-admin/non-gérant users only see their own expenses
    if ($table === 'CA_depenses') {
        $role = isset($user['role']) ? $user['role'] : '';
        $isMember = !empty($user['isMember']);
        $isAdmin = ($role === 'admin') || ($role === 'Architecte gérant');
        if ($isMember && !$isAdmin) {
            $stmt = $db->prepare("SELECT * FROM `$table` WHERE cree_par = ? ORDER BY cree_at DESC");
            $stmt->execute(array($user['name']));
            jsonOk($stmt->fetchAll());
            return;
        }
    }
    $stmt = $db->query("SELECT * FROM `$table` ORDER BY cree_at DESC");
    jsonOk($stmt->fetchAll());
}

function getOne($table, $id) {
    $db   = getDB();
    $stmt = $db->prepare("SELECT * FROM `$table` WHERE id = ?");
    $stmt->execute(array($id));
    $row = $stmt->fetch();
    if (!$row) { jsonError('Enregistrement introuvable', 404); }
    jsonOk($row);
}

function createRow($cfg, $user) {
    $role = strtolower(trim($user['role'] ?? ''));
    $table = $cfg['table'];
    if ($role === 'stagiaire' && in_array($table, ['CA_devis', 'CA_factures'])) {
        $label = ($table === 'CA_devis') ? 'devis' : 'factures';
        jsonError('Les stagiaires ne sont pas autorisés à créer des ' . $label, 403);
    }

    $body   = getBody();
    $db     = getDB();
    $id     = bin2hex(random_bytes(16));
    $cols   = $cfg['cols'];
    $values = array();
    foreach ($cols as $c) { $values[] = mapValue($body, $c); }

    if ($cfg['cree_par']) { $cols[] = 'cree_par'; $values[] = $user['name']; }
    $cols[] = 'id'; $values[] = $id;

    $ph     = implode(',', array_fill(0, count($cols), '?'));
    $colArr = array();
    foreach ($cols as $c) { $colArr[] = '`' . $c . '`'; }
    $colStr = implode(',', $colArr);

    $db->prepare("INSERT INTO `$table` ($colStr) VALUES ($ph)")->execute($values);
    getOne($table, $id);
}

function updateRow($cfg, $id, $user) {
    if (!$id) { jsonError('ID requis'); }
    $body   = getBody();
    $db     = getDB();
    $table  = $cfg['table'];
    $cols   = $cfg['cols'];
    $values = array();
    foreach ($cols as $c) { $values[] = mapValue($body, $c); }
    $values[] = $id;

    $setArr = array();
    foreach ($cols as $c) { $setArr[] = '`' . $c . '`=?'; }
    $setStr = implode(',', $setArr);

    $db->prepare("UPDATE `$table` SET $setStr WHERE id=?")->execute($values);
    getOne($table, $id);
}

function removeRow($table, $id, $user) {
    if (!$id) { jsonError('ID requis'); }
    if (!isset($user['role']) || $user['role'] !== 'admin') { jsonError('Admin requis', 403); }
    $db = getDB();
    // Récupérer un label significatif depuis la ligne
    $stmt = $db->prepare("SELECT * FROM `$table` WHERE id = ?");
    $stmt->execute(array($id));
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $label = '';
    if ($row) {
        foreach (array('numero', 'libelle', 'nom', 'objet', 'description') as $f) {
            if (!empty($row[$f])) { $label = $row[$f]; break; }
        }
    }
    if (!$label) { $label = $table . ' #' . substr($id, 0, 8); }
    $userName = isset($user['name']) ? $user['name'] : 'unknown';
    if (!moveToCorbeille($db, $table, $id, $label, $userName)) {
        jsonError('Impossible de déplacer vers la corbeille', 500);
    }
    jsonOk(array('deleted' => $id));
}

function handleParametres($method, $user) {
    $db = getDB();
    if ($method === 'GET') {
        $stmt = $db->query('SELECT cle, valeur FROM CA_parametres');
        $out  = array();
        foreach ($stmt->fetchAll() as $r) {
            $decoded = json_decode($r['valeur'], true);
            $out[$r['cle']] = ($decoded !== null) ? $decoded : $r['valeur'];
        }
        jsonOk($out);
        return;
    }
    if ($method === 'POST' || $method === 'PUT') {
        $body = getBody();
        $stmt = $db->prepare('INSERT INTO CA_parametres (cle, valeur) VALUES (?,?) ON DUPLICATE KEY UPDATE valeur=?');
        foreach ($body as $key => $val) {
            $enc = json_encode($val, JSON_UNESCAPED_UNICODE);
            $stmt->execute(array($key, $enc, $enc));
        }
        jsonOk(array('saved' => count($body)));
        return;
    }
    if ($method === 'DELETE') {
        $key = isset($_GET['key']) ? $_GET['key'] : '';
        if ($key) { $db->prepare('DELETE FROM CA_parametres WHERE cle=?')->execute(array($key)); }
        jsonOk(array('deleted' => $key));
        return;
    }
    jsonError('Méthode non supportée', 405);
}

function mapValue($body, $col) {
    $camel = lcfirst(str_replace('_', '', ucwords($col, '_')));
    $val   = isset($body[$camel]) ? $body[$camel] : (isset($body[$col]) ? $body[$col] : null);

    // Dates vides → NULL
    $dateCols = array('date_devis','date_expiry','date_facture','date_echeance',
                      'date_paiement','date_dep','date_emission','remboursement_date');
    if (in_array($col, $dateCols) && ($val === '' || $val === null)) { return null; }

    // Champs numériques → float
    $numCols = array('montant_ht','tva','montant_ttc','montant','montant_tva',
                     'fodec','timbre','ras_taux','ras_amt','net_payer');
    if (in_array($col, $numCols)) { return ($val !== null && $val !== '') ? floatval($val) : 0; }

    // lignes_json : accepter tableau ou string JSON
    if ($col === 'lignes_json') {
        if ($val === null || $val === '') { return null; }
        if (is_array($val)) { return json_encode($val, JSON_UNESCAPED_UNICODE); }
        return $val; // déjà une string JSON
    }

    // Autres tableaux → JSON
    if (is_array($val)) { return json_encode($val, JSON_UNESCAPED_UNICODE); }

    return $val;
}
