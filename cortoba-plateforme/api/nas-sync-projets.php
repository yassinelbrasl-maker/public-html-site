<?php
// ═══════════════════════════════════════════════════════════════
//  Cortoba Atelier — api/nas-sync-projets.php
//  Supprime tous les projets et les recrée depuis les dossiers NAS
//  Usage unique — à supprimer après utilisation
// ═══════════════════════════════════════════════════════════════

error_reporting(E_ALL);
ini_set('display_errors', '1');
ini_set('max_execution_time', '120');

require_once __DIR__ . '/../config/middleware.php';

setCorsHeaders();

$user = requireAuth();
$body = getBody();

$nasFolders = $body['nas_folders'] ?? [];
if (empty($nasFolders)) jsonError('nas_folders requis (objet {annee: [dossiers]})', 400);

$db = getDB();

// 1. Supprimer tous les projets existants et données liées
try { $db->exec('DELETE FROM CA_projets_missions'); } catch (\Throwable $e) {}
try { $db->exec('DELETE FROM CA_projets_intervenants'); } catch (\Throwable $e) {}
$db->exec('DELETE FROM CA_projets');

$created = [];
$skipped = [];

foreach ($nasFolders as $annee => $folders) {
    if (!preg_match('/^20\d{2}$/', $annee)) continue;
    $yy = substr($annee, -2);

    foreach ($folders as $folderName) {
        // Ignorer les dossiers spéciaux
        if (preg_match('/^00[-_]|Dossier Type|POJETS.*PC|^XX_/', $folderName)) {
            $skipped[] = $annee . '/' . $folderName;
            continue;
        }

        // Parser le nom du dossier pour extraire code et nom
        // Formats possibles:
        // 01_26_GLM_GUELLALI MOEZ  → code=01_26_GLM, nom=GUELLALI MOEZ
        // 01_26_XXX_Salim Azzabi   → code=01_26_XXX, nom=Salim Azzabi
        // Villa Souad lotissement  → code=auto, nom=Villa Souad lotissement
        $code = '';
        $nom = $folderName;
        $clientCode = '';

        if (preg_match('/^(\d{2}_\d{2}_[A-Z0-9]+)[-_ ]+(.+)$/i', $folderName, $m)) {
            $code = strtoupper($m[1]);
            $nom = trim($m[2]);
            // Extraire le code client (3ème segment)
            $parts = explode('_', $code);
            if (count($parts) >= 3) {
                $clientCode = $parts[2];
            }
        } elseif (preg_match('/^(\d{2}_\d{2}_\w+)$/i', $folderName, $m)) {
            // Code seul, pas de nom
            $code = strtoupper($m[1]);
            $nom = $folderName;
        }

        // Si pas de code structuré, générer un code auto
        if (!$code) {
            // Compter les projets déjà créés pour cette année
            $countStmt = $db->prepare('SELECT COUNT(*) FROM CA_projets WHERE annee = ?');
            $countStmt->execute([$annee]);
            $seq = intval($countStmt->fetchColumn()) + 1;
            // Prendre les 3 premières lettres du nom comme code client
            $initials = strtoupper(substr(preg_replace('/[^a-zA-Z]/', '', $nom), 0, 3));
            if (!$initials) $initials = 'XXX';
            $code = str_pad($seq, 2, '0', STR_PAD_LEFT) . '_' . $yy . '_' . $initials;
        }

        $id = bin2hex(random_bytes(16));

        // Déterminer le statut selon l'année
        $statut = 'Actif';
        if (intval($annee) < intval(date('Y')) - 1) {
            $statut = 'Archivé';
        } elseif (intval($annee) < intval(date('Y'))) {
            $statut = 'Archivé';
        }

        try {
            $db->prepare('
                INSERT INTO CA_projets (id, code, nom, client, client_code, annee, phase, statut,
                    honoraires, budget, surface, cree_par)
                VALUES (?,?,?,?,?,?,?,?,0,0,0,?)
            ')->execute([
                $id, $code, $nom, '', $clientCode, $annee, 'APS', $statut, 'sync-nas'
            ]);

            $created[] = [
                'annee' => $annee,
                'code' => $code,
                'nom' => $nom,
                'folder' => $folderName,
                'statut' => $statut,
            ];
        } catch (\Throwable $e) {
            $skipped[] = $annee . '/' . $folderName . ' (err: ' . $e->getMessage() . ')';
        }
    }
}

jsonOk([
    'created_count' => count($created),
    'skipped_count' => count($skipped),
    'created' => $created,
    'skipped' => $skipped,
]);
