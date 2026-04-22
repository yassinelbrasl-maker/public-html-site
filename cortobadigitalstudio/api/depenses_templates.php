<?php
// ═══════════════════════════════════════════════════════════════
//  api/depenses_templates.php — Dépenses récurrentes (modèles)
//  GET    ?action=list    : tous les templates actifs
//  GET    ?action=due     : templates dont la notification doit apparaître
//  GET    ?id=xxx         : un template précis
//  POST                   : créer un nouveau template
//  PUT    ?id=xxx         : mettre à jour
//  POST   ?action=advance&id=xxx : décaler next_due_date au cycle suivant
//  DELETE ?id=xxx         : annuler (status=cancelled)
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/middleware.php';

function ensureTemplatesTable() {
    $db = getDB();
    $db->exec("CREATE TABLE IF NOT EXISTS `CDS_depenses_templates` (
        `id`                 VARCHAR(32)  NOT NULL PRIMARY KEY,
        `label`              VARCHAR(300) NOT NULL,
        `categorie`          VARCHAR(80)  DEFAULT NULL,
        `fournisseur`        VARCHAR(200) DEFAULT NULL,
        `code_tva`           VARCHAR(80)  DEFAULT NULL,
        `frequency`          VARCHAR(20)  NOT NULL DEFAULT 'monthly',
        `amount_type`        VARCHAR(20)  NOT NULL DEFAULT 'fixed',
        `base_amount_ht`     DECIMAL(14,3) NOT NULL DEFAULT 0,
        `vat_rate`           DECIMAL(5,2)  NOT NULL DEFAULT 19,
        `stamp_duty`         DECIMAL(14,3) NOT NULL DEFAULT 0,
        `base_amount_ttc`    DECIMAL(14,3) NOT NULL DEFAULT 0,
        `lignes_json`        LONGTEXT     DEFAULT NULL,
        `next_due_date`      DATE         NOT NULL,
        `notify_days_before` INT          NOT NULL DEFAULT 5,
        `end_date`           DATE         DEFAULT NULL,
        `status`             VARCHAR(20)  NOT NULL DEFAULT 'active',
        `cree_par`           VARCHAR(120) DEFAULT NULL,
        `cree_at`            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `modifie_at`         DATETIME     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        KEY `idx_status`     (`status`),
        KEY `idx_next_due`   (`next_due_date`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
}

// Ajoute un intervalle à une date YYYY-MM-DD selon la fréquence
function advanceDateByFrequency($dateStr, $frequency) {
    $d = new DateTime($dateStr);
    switch ($frequency) {
        case 'weekly':     $d->modify('+7 days'); break;
        case 'monthly':    $d->modify('+1 month'); break;
        case 'quarterly':  $d->modify('+3 months'); break;
        case 'semiannual': $d->modify('+6 months'); break;
        case 'yearly':     $d->modify('+1 year'); break;
        default:           $d->modify('+1 month');
    }
    return $d->format('Y-m-d');
}

function decodeTemplate(array $row) {
    if (isset($row['lignes_json']) && $row['lignes_json']) {
        $arr = json_decode($row['lignes_json'], true);
        $row['lignes'] = is_array($arr) ? $arr : array();
    } else {
        $row['lignes'] = array();
    }
    // cast numériques
    foreach (array('base_amount_ht','vat_rate','stamp_duty','base_amount_ttc') as $k) {
        if (isset($row[$k])) $row[$k] = (float)$row[$k];
    }
    if (isset($row['notify_days_before'])) $row['notify_days_before'] = (int)$row['notify_days_before'];
    return $row;
}

$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'OPTIONS') { http_response_code(204); exit; }

$user   = requireAuth();
$action = isset($_GET['action']) ? $_GET['action'] : '';
$id     = isset($_GET['id'])     ? $_GET['id']     : '';

try {
    ensureTemplatesTable();
    $db = getDB();

    // ── GET : lister ou récupérer ou calculer les "due" ──
    if ($method === 'GET') {
        if ($action === 'due') {
            // Templates dont la notification doit apparaître aujourd'hui
            // Condition : (next_due_date - notify_days_before) <= TODAY <= next_due_date + 7j
            // et status='active' et (end_date IS NULL OR end_date >= next_due_date)
            $sql = "SELECT * FROM CDS_depenses_templates
                    WHERE status = 'active'
                      AND DATE_SUB(next_due_date, INTERVAL notify_days_before DAY) <= CURDATE()
                      AND next_due_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                      AND (end_date IS NULL OR end_date >= next_due_date)
                    ORDER BY next_due_date ASC";
            $rows = $db->query($sql)->fetchAll(PDO::FETCH_ASSOC);
            $out = array();
            foreach ($rows as $r) $out[] = decodeTemplate($r);
            jsonOk($out);
        }
        if ($id) {
            $stmt = $db->prepare("SELECT * FROM CDS_depenses_templates WHERE id = ?");
            $stmt->execute(array($id));
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) jsonError('Template introuvable', 404);
            jsonOk(decodeTemplate($row));
        }
        // Liste complète (active + paused)
        $rows = $db->query("SELECT * FROM CDS_depenses_templates WHERE status != 'cancelled' ORDER BY next_due_date ASC")
                   ->fetchAll(PDO::FETCH_ASSOC);
        $out = array();
        foreach ($rows as $r) $out[] = decodeTemplate($r);
        jsonOk($out);

    // ── POST : créer OU action=advance ──
    } elseif ($method === 'POST') {
        if ($action === 'advance') {
            if (!$id) jsonError('ID requis', 400);
            $stmt = $db->prepare("SELECT next_due_date, frequency, end_date FROM CDS_depenses_templates WHERE id = ?");
            $stmt->execute(array($id));
            $t = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$t) jsonError('Template introuvable', 404);
            $nextDue = advanceDateByFrequency($t['next_due_date'], $t['frequency']);
            // Si la nouvelle date dépasse end_date → passer en cancelled
            if (!empty($t['end_date']) && $nextDue > $t['end_date']) {
                $db->prepare("UPDATE CDS_depenses_templates SET status = 'cancelled' WHERE id = ?")->execute(array($id));
                jsonOk(array('id' => $id, 'status' => 'cancelled', 'next_due_date' => $nextDue));
            }
            $db->prepare("UPDATE CDS_depenses_templates SET next_due_date = ? WHERE id = ?")
               ->execute(array($nextDue, $id));
            jsonOk(array('id' => $id, 'next_due_date' => $nextDue));
        }

        // Création
        $body = getBody();
        $newId = isset($body['id']) && $body['id'] ? $body['id'] : bin2hex(random_bytes(16));
        $fields = array(
            'id'                 => $newId,
            'label'              => trim($body['label']         ?? ''),
            'categorie'          => trim($body['categorie']     ?? ''),
            'fournisseur'        => trim($body['fournisseur']   ?? ''),
            'code_tva'           => trim($body['code_tva']      ?? ''),
            'frequency'          => trim($body['frequency']     ?? 'monthly'),
            'amount_type'        => trim($body['amount_type']   ?? 'fixed'),
            'base_amount_ht'     => (float)($body['base_amount_ht']  ?? 0),
            'vat_rate'           => (float)($body['vat_rate']        ?? 19),
            'stamp_duty'         => (float)($body['stamp_duty']      ?? 0),
            'base_amount_ttc'    => (float)($body['base_amount_ttc'] ?? 0),
            'lignes_json'        => isset($body['lignes']) ? json_encode($body['lignes'], JSON_UNESCAPED_UNICODE) : null,
            'next_due_date'      => $body['next_due_date'] ?? date('Y-m-d'),
            'notify_days_before' => (int)($body['notify_days_before'] ?? 5),
            'end_date'           => !empty($body['end_date']) ? $body['end_date'] : null,
            'status'             => 'active',
            'cree_par'           => $user['name'] ?? 'inconnu',
        );
        if (!$fields['label']) jsonError('Libellé requis', 400);

        $keys = array_keys($fields);
        $ph   = array_fill(0, count($keys), '?');
        $sql  = "INSERT INTO CDS_depenses_templates (`" . implode('`,`', $keys) . "`) VALUES (" . implode(',', $ph) . ")";
        $db->prepare($sql)->execute(array_values($fields));
        jsonOk(array('id' => $newId));

    // ── PUT : mise à jour ──
    } elseif ($method === 'PUT') {
        if (!$id) jsonError('ID requis', 400);
        $body = getBody();
        $updatable = array('label','categorie','fournisseur','code_tva','frequency','amount_type',
                           'base_amount_ht','vat_rate','stamp_duty','base_amount_ttc',
                           'next_due_date','notify_days_before','end_date','status');
        $set = array(); $vals = array();
        foreach ($updatable as $k) {
            if (array_key_exists($k, $body)) {
                $set[] = "`$k` = ?";
                $vals[] = ($k === 'end_date' && empty($body[$k])) ? null : $body[$k];
            }
        }
        if (isset($body['lignes'])) {
            $set[]  = "`lignes_json` = ?";
            $vals[] = json_encode($body['lignes'], JSON_UNESCAPED_UNICODE);
        }
        if (!$set) jsonError('Aucun champ à mettre à jour', 400);
        $vals[] = $id;
        $db->prepare("UPDATE CDS_depenses_templates SET " . implode(', ', $set) . " WHERE id = ?")->execute($vals);
        jsonOk(array('updated' => true));

    // ── DELETE : annuler (soft) ──
    } elseif ($method === 'DELETE') {
        if (!$id) jsonError('ID requis', 400);
        $db->prepare("UPDATE CDS_depenses_templates SET status = 'cancelled' WHERE id = ?")->execute(array($id));
        jsonOk(array('cancelled' => true));

    } else {
        jsonError('Méthode non supportée', 405);
    }

} catch (Exception $e) {
    jsonError($e->getMessage(), 500);
}
