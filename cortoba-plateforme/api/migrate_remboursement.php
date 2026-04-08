<?php
// Migration : ajout colonnes remboursement sur CA_depenses
// Exécuter une seule fois via navigateur puis SUPPRIMER ce fichier

require_once dirname(__FILE__) . '/../config/db.php';

header('Content-Type: text/plain; charset=utf-8');

$db = getDB();
$queries = array(
    "ALTER TABLE `CA_depenses` ADD COLUMN IF NOT EXISTS `depense_par`          VARCHAR(120) DEFAULT NULL",
    "ALTER TABLE `CA_depenses` ADD COLUMN IF NOT EXISTS `rembourse_par`        VARCHAR(120) DEFAULT NULL",
    "ALTER TABLE `CA_depenses` ADD COLUMN IF NOT EXISTS `remboursement_statut` VARCHAR(30)  DEFAULT NULL",
    "ALTER TABLE `CA_depenses` ADD COLUMN IF NOT EXISTS `remboursement_date`   DATETIME     DEFAULT NULL",
);

$ok = 0;
$errors = array();
foreach ($queries as $q) {
    try {
        $db->exec($q);
        $ok++;
        echo "OK : $q\n";
    } catch (Exception $e) {
        $errors[] = $e->getMessage();
        echo "ERREUR : " . $e->getMessage() . "\n";
    }
}

echo "\n--- Résultat : $ok/" . count($queries) . " requêtes exécutées ---\n";
if (count($errors) === 0) {
    echo "Migration terminée avec succès. SUPPRIMEZ ce fichier maintenant.\n";
}
