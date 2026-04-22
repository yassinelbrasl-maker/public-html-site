<?php
// ═══════════════════════════════════════════════════════════════
//  api/cron_depenses_check.php
//
//  Script planifié (Cron Job cPanel par URL) qui :
//   1. Identifie les templates dont la notification doit être active
//   2. Optionnel : envoie un email récapitulatif si SMTP configuré
//
//  Configuration côté cPanel → Cron Jobs :
//     curl -s "https://cortobaarchitecture.com/cortobadigitalstudio/api/cron_depenses_check.php?key=CORTOBA_CRON_2026"
//  Fréquence suggérée : 1 fois par jour (ex : 08:00).
//
//  Note : le front-end interroge également /api/depenses_templates.php?action=due
//  à chaque connexion et à l'ouverture de la cloche de notification — ce script
//  est donc un filet de sécurité, pas une dépendance stricte.
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/db.php';

header('Content-Type: text/plain; charset=utf-8');

// Clé partagée simple (à changer si besoin de plus de sécurité)
define('CRON_SECRET', 'CORTOBA_CRON_2026');
$providedKey = isset($_GET['key']) ? $_GET['key'] : '';
if ($providedKey !== CRON_SECRET) {
    http_response_code(403);
    echo "Forbidden\n";
    exit;
}

try {
    $db = getDB();

    // S'assurer que la table existe (idempotent)
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

    // 1. Auto-annuler les templates dépassés (next_due > end_date)
    $stmt = $db->prepare("UPDATE CDS_depenses_templates
                          SET status = 'cancelled'
                          WHERE status = 'active'
                            AND end_date IS NOT NULL
                            AND next_due_date > end_date");
    $stmt->execute();
    $expired = $stmt->rowCount();

    // 2. Compter les templates "due" aujourd'hui
    $sql = "SELECT id, label, next_due_date, base_amount_ttc, amount_type, notify_days_before
            FROM CDS_depenses_templates
            WHERE status = 'active'
              AND DATE_SUB(next_due_date, INTERVAL notify_days_before DAY) <= CURDATE()
              AND next_due_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)";
    $rows = $db->query($sql)->fetchAll(PDO::FETCH_ASSOC);

    echo "=== Cron dépenses récurrentes — " . date('Y-m-d H:i:s') . " ===\n";
    echo "Templates expirés auto-annulés : $expired\n";
    echo "Notifications actives          : " . count($rows) . "\n";
    foreach ($rows as $r) {
        echo sprintf("  - [%s] %s — %.3f TND (échéance %s, type %s)\n",
            $r['id'], $r['label'], (float)$r['base_amount_ttc'],
            $r['next_due_date'], $r['amount_type']);
    }

    // 3. (Optionnel) Log dans un fichier pour traçage
    $logFile = __DIR__ . '/../../logs/cron_depenses.log';
    @mkdir(dirname($logFile), 0755, true);
    @file_put_contents($logFile, "[" . date('c') . "] expired=$expired, due=" . count($rows) . "\n", FILE_APPEND);

    echo "\nOK\n";

} catch (Exception $e) {
    http_response_code(500);
    echo "ERROR: " . $e->getMessage() . "\n";
}
