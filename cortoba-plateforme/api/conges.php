<?php
// ============================================================
//  CORTOBA ATELIER — API Congés
//  GET    ?action=list                 → demandes (toutes pour admin, perso sinon)
//  GET    ?action=balance&user_id=…    → soldes de l'année courante
//  GET    ?action=balances             → soldes tous users (admin)
//  GET    ?action=heatmap&user_id=…&from=…&to=…
//                                      → charge journalière (tasks/deadlines)
//  POST   ?action=create               → nouvelle demande
//  POST   ?action=decide&id=…          → approuver / refuser (admin)
//  POST   ?action=cancel&id=…          → annuler (demandeur, si en attente)
//  POST   ?action=balance_set          → admin : ajuster solde d'un user
//  GET    ?action=holidays_list        → jours fériés de l'année
//  POST   ?action=holidays_save        → ajouter/modifier un jour férié (admin)
//  POST   ?action=holidays_delete&id=… → supprimer un jour férié (admin)
//  GET    ?action=team_calendar&from=…&to=… → calendrier équipe (admin)
//  POST   ?action=upload_justif        → upload justificatif (multipart)
// ============================================================

require_once __DIR__ . '/../config/middleware.php';
require_once __DIR__ . '/notification_dispatch.php'; // expose dispatchNotification() + notifCreate()

$user   = requireAuth();
$action = $_GET['action'] ?? 'list';
$db     = getDB();

// ── Bootstrap idempotent des tables (au cas où migration non jouée) ──
try {
    $db->exec("CREATE TABLE IF NOT EXISTS `CA_leave_requests` (
        `id` VARCHAR(32) NOT NULL PRIMARY KEY,
        `user_id` VARCHAR(32) NOT NULL,
        `user_name` VARCHAR(120) DEFAULT NULL,
        `type` VARCHAR(30) NOT NULL DEFAULT 'Congés annuels',
        `date_debut` DATE NOT NULL,
        `date_fin` DATE NOT NULL,
        `jours` DECIMAL(5,1) NOT NULL DEFAULT 0,
        `motif` VARCHAR(400) DEFAULT NULL,
        `delegation` VARCHAR(400) NOT NULL,
        `statut` VARCHAR(20) NOT NULL DEFAULT 'En attente',
        `commentaire_admin` VARCHAR(500) DEFAULT NULL,
        `decision_par` VARCHAR(120) DEFAULT NULL,
        `decision_at` DATETIME DEFAULT NULL,
        `partage` TINYINT(1) NOT NULL DEFAULT 1,
        `cree_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `modifie_at` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        KEY `idx_user`(`user_id`), KEY `idx_statut`(`statut`), KEY `idx_dates`(`date_debut`,`date_fin`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->exec("CREATE TABLE IF NOT EXISTS `CA_leave_balances` (
        `user_id` VARCHAR(32) NOT NULL,
        `annee` INT NOT NULL,
        `conges_annuels` DECIMAL(5,1) NOT NULL DEFAULT 22,
        `maladie` DECIMAL(5,1) NOT NULL DEFAULT 15,
        `recuperation` DECIMAL(5,1) NOT NULL DEFAULT 0,
        `modifie_at` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`user_id`,`annee`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    // ── Jours fériés ──
    $db->exec("CREATE TABLE IF NOT EXISTS `CA_jours_feries` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `date` DATE NOT NULL,
        `libelle` VARCHAR(200) NOT NULL,
        `pont` TINYINT(1) NOT NULL DEFAULT 0,
        `paye` TINYINT(1) NOT NULL DEFAULT 1,
        `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY `uq_date` (`date`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    // Migration : ajouter colonne paye si absente
    try {
        $col = $db->query("SHOW COLUMNS FROM CA_jours_feries LIKE 'paye'")->fetch();
        if (!$col) {
            $db->exec("ALTER TABLE CA_jours_feries ADD COLUMN `paye` TINYINT(1) NOT NULL DEFAULT 1 AFTER `pont`");
        }
    } catch (\Throwable $e) { /* silencieux */ }

    // Pré-alimenter les jours fériés tunisiens de l'année courante (idempotent)
    // Secteur : Privés soumis au Code du Travail et à la Convention Collective Cadre
    $yr = (int)date('Y');
    $cnt = $db->query("SELECT COUNT(*) FROM CA_jours_feries WHERE YEAR(date) = $yr")->fetchColumn();
    if (!$cnt) {
        $feries = [
            // Fêtes nationales (chômées et payées)
            ["$yr-01-01", 'Nouvel An', 1],
            ["$yr-03-20", "Fête de l'Indépendance", 1],
            ["$yr-04-09", 'Journée des Martyrs', 1],
            ["$yr-05-01", 'Fête du Travail', 1],
            ["$yr-07-25", 'Fête de la République', 1],
            ["$yr-08-13", 'Journée de la Femme', 1],
            ["$yr-10-15", "Fête de l'Évacuation", 1],
            ["$yr-12-17", 'Fête de la Révolution', 1],
            // Fêtes religieuses (chômées et non payées) : dates approximatives à ajuster chaque année
            ["$yr-03-30", 'Aïd el-Fitr (à ajuster)', 0],
            ["$yr-03-31", 'Aïd el-Fitr 2e jour (à ajuster)', 0],
            ["$yr-06-06", 'Aïd el-Adha (à ajuster)', 0],
            ["$yr-06-07", 'Aïd el-Adha 2e jour (à ajuster)', 0],
            ["$yr-06-26", 'Ras El Am El Hijri (à ajuster)', 0],
            ["$yr-09-04", 'Mouled (à ajuster)', 0],
            ["$yr-09-05", 'Mouled 2e jour (à ajuster)', 0],
        ];
        $ins = $db->prepare("INSERT IGNORE INTO CA_jours_feries (date, libelle, paye) VALUES (?, ?, ?)");
        foreach ($feries as $f) $ins->execute($f);
    }
} catch (\Throwable $e) { /* silencieux */ }

// Migration idempotente : ajouter la colonne `partage` si absente
try {
    $col = $db->query("SHOW COLUMNS FROM CA_leave_requests LIKE 'partage'")->fetch();
    if (!$col) {
        $db->exec("ALTER TABLE CA_leave_requests ADD COLUMN `partage` TINYINT(1) NOT NULL DEFAULT 1 AFTER `decision_at`");
    }
} catch (\Throwable $e) { /* silencieux */ }

// Migration idempotente : colonne justificatif_url
try {
    $col = $db->query("SHOW COLUMNS FROM CA_leave_requests LIKE 'justificatif_url'")->fetch();
    if (!$col) {
        $db->exec("ALTER TABLE CA_leave_requests ADD COLUMN `justificatif_url` VARCHAR(500) DEFAULT NULL AFTER `partage`");
    }
} catch (\Throwable $e) { /* silencieux */ }

// ── Auto-rappel fériés : dernière semaine de décembre → notifier les gérants ──
// Exécuté une seule fois par an (vérifie l'existence d'une notif déjà envoyée)
function checkHolidayReminder(PDO $db): void {
    $day   = (int)date('j');
    $month = (int)date('n');
    if ($month !== 12 || $day < 25) return; // hors dernière semaine de décembre

    $nextYear = (int)date('Y') + 1;
    $refId    = 'holiday_reminder_' . $nextYear;

    // Vérifier si la notif a déjà été envoyée cette année
    try {
        $stmt = $db->prepare("SELECT COUNT(*) FROM CA_notifications WHERE type = 'holiday_reminder' AND link_id = ?");
        $stmt->execute([$refId]);
        if ((int)$stmt->fetchColumn() > 0) return; // déjà envoyé
    } catch (\Throwable $e) { return; }

    // Compter les fériés existants pour l'année prochaine
    $feriesCount = 0;
    try {
        $stmt = $db->prepare("SELECT COUNT(*) FROM CA_jours_feries WHERE YEAR(date) = ?");
        $stmt->execute([$nextYear]);
        $feriesCount = (int)$stmt->fetchColumn();
    } catch (\Throwable $e) {}

    $title = "📅 Rappel : mise à jour des jours fériés $nextYear";
    $msg   = "L'année $nextYear approche. Pensez à vérifier et mettre à jour le calendrier des jours fériés "
           . "(notamment les fêtes religieuses dont les dates changent chaque année).\n\n"
           . "Jours fériés actuellement définis pour $nextYear : $feriesCount."
           . "\n\n→ Congés > Administration > Jours fériés & ponts";

    // Envoyer à tous les gérants / admins
    if (!function_exists('notifCreate')) return;
    $admins = [];
    try {
        $q = $db->query("SELECT id FROM cortoba_users WHERE LOWER(role) IN ('admin','gerant','gérant','manager','directeur') AND statut <> 'Inactif'");
        foreach ($q->fetchAll(PDO::FETCH_COLUMN) as $aid) $admins[$aid] = true;
    } catch (\Throwable $e) {}
    try {
        $q2 = $db->query("SELECT id FROM CA_accounts WHERE role = 'admin' AND approved = 1");
        foreach ($q2->fetchAll(PDO::FETCH_COLUMN) as $aid) $admins[$aid] = true;
    } catch (\Throwable $e) {}

    foreach (array_keys($admins) as $aid) {
        try {
            dispatchNotification($db, $aid, 'holiday_reminder', $title, $msg, 'conges', $refId, 'Système');
        } catch (\Throwable $e) { /* silencieux */ }
    }
}

// Déclencher le check (léger — une seule requête SQL si hors période ou déjà envoyé)
try { checkHolidayReminder($db); } catch (\Throwable $e) { /* silencieux */ }

// ── Helper : est-ce un gérant / admin ? ──
function isManager(array $u): bool {
    $role = strtolower($u['role'] ?? '');
    if (in_array($role, ['admin','gerant','gérant','manager','directeur'], true)) return true;
    if (empty($u['isMember'])) return true; // comptes CA_accounts = admins
    return false;
}

// ── Helper : nombre de jours ouvrés entre deux dates (inclus, hors week-end ET jours fériés) ──
function workingDays(string $d1, string $d2, ?PDO $db = null): float {
    $holidays = [];
    if ($db) {
        try {
            $stmt = $db->prepare("SELECT date FROM CA_jours_feries WHERE date BETWEEN ? AND ?");
            $stmt->execute([$d1, $d2]);
            $holidays = array_column($stmt->fetchAll(PDO::FETCH_ASSOC), 'date');
        } catch (\Throwable $e) { /* table pas encore créée */ }
    }
    $start = new DateTime($d1);
    $end   = new DateTime($d2);
    if ($end < $start) return 0;
    $days = 0;
    $cur = clone $start;
    while ($cur <= $end) {
        $dow = (int)$cur->format('N'); // 1..7
        $key = $cur->format('Y-m-d');
        if ($dow < 6 && !in_array($key, $holidays)) $days++;
        $cur->modify('+1 day');
    }
    return $days;
}

// ── Helper : charge d'une journée (heatmap) pour un user ──
// Retourne un array [ 'YYYY-MM-DD' => ['level'=>'green|yellow|red','items'=>[{title, projet, date}...]] ]
function computeHeatmap(PDO $db, string $userName, string $from, string $to): array {
    // Récupérer toutes les tâches assignées à l'user avec une échéance
    $stmt = $db->prepare("SELECT t.id, t.titre, t.date_echeance, t.date_debut, t.priorite, t.statut,
                                 p.nom AS projet_nom, p.code AS projet_code
                          FROM CA_taches t
                          LEFT JOIN CA_projets p ON p.id COLLATE utf8mb4_unicode_ci = t.projet_id COLLATE utf8mb4_unicode_ci
                          WHERE t.assignee = ? AND t.date_echeance IS NOT NULL
                            AND t.statut <> 'Terminé'
                            AND t.date_echeance BETWEEN DATE_SUB(?, INTERVAL 14 DAY) AND DATE_ADD(?, INTERVAL 14 DAY)");
    $stmt->execute([$userName, $from, $to]);
    $tasks = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $map = [];
    $start = new DateTime($from);
    $end   = new DateTime($to);
    $cur   = clone $start;
    while ($cur <= $end) {
        $key = $cur->format('Y-m-d');
        $map[$key] = ['level'=>'green','score'=>0,'items'=>[]];
        $cur->modify('+1 day');
    }

    foreach ($tasks as $t) {
        $dueStr = $t['date_echeance'];
        if (!$dueStr) continue;
        $due = new DateTime($dueStr);
        // Zone d'influence : 7j avant → 2j après (période charrette)
        $influenceStart = (clone $due)->modify('-7 days');
        $influenceEnd   = (clone $due)->modify('+2 days');
        // Intersection avec [from,to]
        if ($influenceEnd < $start || $influenceStart > $end) continue;
        $iStart = $influenceStart < $start ? clone $start : clone $influenceStart;
        $iEnd   = $influenceEnd   > $end   ? clone $end   : clone $influenceEnd;

        $priorite = $t['priorite'] ?? 'Normale';
        $titre    = strtolower($t['titre'] ?? '');

        // Critique si priorité Haute/Critique OU titre contient rendu/APD/APS/DCE/permis/concours
        $isCritical = in_array($priorite, ['Haute','Critique','Urgente'], true)
            || preg_match('/\b(rendu|apd|aps|dce|permis|concours|charrette|dépôt|livraison)\b/i', $titre);

        $c = clone $iStart;
        while ($c <= $iEnd) {
            $k = $c->format('Y-m-d');
            $daysToD = (int) round((strtotime($dueStr) - strtotime($k)) / 86400);
            // Score : proche de la deadline → fort
            if ($daysToD >= 0 && $daysToD <= 2)      $add = $isCritical ? 8 : 4;
            elseif ($daysToD >= -1 && $daysToD <= 7) $add = $isCritical ? 5 : 2;
            else                                      $add = 1;
            if (isset($map[$k])) {
                $map[$k]['score'] += $add;
                $map[$k]['items'][] = [
                    'titre'        => $t['titre'],
                    'projet'       => $t['projet_nom'] ?: $t['projet_code'],
                    'date_echeance'=> $dueStr,
                    'priorite'     => $priorite,
                    'critical'     => $isCritical,
                ];
            }
            $c->modify('+1 day');
        }
    }

    // Attribution des niveaux de couleur en fonction du score
    foreach ($map as $k => $v) {
        $s = $v['score'];
        if     ($s >= 6) $map[$k]['level'] = 'red';
        elseif ($s >= 2) $map[$k]['level'] = 'yellow';
        else             $map[$k]['level'] = 'green';
    }
    return $map;
}

// ── Helper : détection de conflit (autres membres déjà approuvés/en attente sur même période) ──
function detectConflicts(PDO $db, string $userId, string $from, string $to, ?string $excludeId = null): array {
    $sql = "SELECT id, user_id, user_name, type, date_debut, date_fin, statut
            FROM CA_leave_requests
            WHERE user_id <> ?
              AND statut IN ('En attente','Approuvé')
              AND NOT (date_fin < ? OR date_debut > ?)";
    $params = [$userId, $from, $to];
    if ($excludeId) { $sql .= ' AND id <> ?'; $params[] = $excludeId; }
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

// ── Helper : solde d'un user pour une année (auto-init) ──
function ensureBalance(PDO $db, string $userId, int $annee): array {
    $stmt = $db->prepare('SELECT * FROM CA_leave_balances WHERE user_id = ? AND annee = ?');
    $stmt->execute([$userId, $annee]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        $db->prepare('INSERT INTO CA_leave_balances (user_id, annee, conges_annuels, maladie, recuperation) VALUES (?,?,?,?,?)')
           ->execute([$userId, $annee, 22, 15, 0]);
        $row = ['user_id'=>$userId,'annee'=>$annee,'conges_annuels'=>22,'maladie'=>15,'recuperation'=>0];
    }
    return $row;
}

try {
    switch ($action) {
        // ────────────────────────────── LIST
        case 'list': {
            if (isManager($user)) {
                $where  = '1=1';
                $params = [];
                if (!empty($_GET['statut'])) { $where .= ' AND statut = ?'; $params[] = $_GET['statut']; }
                if (!empty($_GET['user_id'])){ $where .= ' AND user_id = ?'; $params[] = $_GET['user_id']; }
                $stmt = $db->prepare("SELECT * FROM CA_leave_requests WHERE $where ORDER BY
                                      FIELD(statut,'En attente','Approuvé','Refusé','Annulé'), date_debut DESC");
                $stmt->execute($params);
            } else {
                $stmt = $db->prepare('SELECT * FROM CA_leave_requests WHERE user_id = ? ORDER BY cree_at DESC');
                $stmt->execute([$user['id']]);
            }
            jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;
        }

        // ────────────────────────────── BALANCE (perso)
        case 'balance': {
            $uid   = $_GET['user_id'] ?? $user['id'];
            if ($uid !== $user['id'] && !isManager($user)) jsonError('Accès refusé', 403);
            $annee = intval($_GET['annee'] ?? date('Y'));
            $bal   = ensureBalance($db, $uid, $annee);

            // Calcul des jours consommés / en attente
            $stmt = $db->prepare("SELECT type, statut, SUM(jours) AS total
                                  FROM CA_leave_requests
                                  WHERE user_id = ? AND YEAR(date_debut) = ?
                                  GROUP BY type, statut");
            $stmt->execute([$uid, $annee]);
            $usage = ['Congés annuels'=>['approved'=>0,'pending'=>0],
                      'Maladie'=>['approved'=>0,'pending'=>0],
                      'Récupération'=>['approved'=>0,'pending'=>0]];
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $t = $r['type'];
                if (!isset($usage[$t])) $usage[$t] = ['approved'=>0,'pending'=>0];
                if ($r['statut'] === 'Approuvé')   $usage[$t]['approved'] += floatval($r['total']);
                elseif ($r['statut'] === 'En attente') $usage[$t]['pending'] += floatval($r['total']);
            }
            jsonOk(['balance'=>$bal, 'usage'=>$usage]);
            break;
        }

        // ────────────────────────────── BALANCES (admin — tous les membres)
        case 'balances': {
            if (!isManager($user)) jsonError('Accès refusé', 403);
            $annee = intval($_GET['annee'] ?? date('Y'));
            // Récupérer tous les membres
            try {
                $users = $db->query("SELECT id, CONCAT(prenom,' ',nom) AS name FROM cortoba_users WHERE statut <> 'Inactif'")->fetchAll(PDO::FETCH_ASSOC);
            } catch (\Throwable $e) { $users = []; }
            $out = [];
            foreach ($users as $u) {
                $bal = ensureBalance($db, $u['id'], $annee);
                $stmt = $db->prepare("SELECT COALESCE(SUM(jours),0) FROM CA_leave_requests WHERE user_id = ? AND YEAR(date_debut) = ? AND statut = 'Approuvé' AND type = 'Congés annuels'");
                $stmt->execute([$u['id'], $annee]);
                $consomme = floatval($stmt->fetchColumn());
                $out[] = [
                    'user_id'        => $u['id'],
                    'user_name'      => $u['name'],
                    'conges_annuels' => $bal['conges_annuels'],
                    'maladie'        => $bal['maladie'],
                    'recuperation'   => $bal['recuperation'],
                    'consomme'       => $consomme,
                    'restant'        => floatval($bal['conges_annuels']) - $consomme,
                ];
            }
            jsonOk($out);
            break;
        }

        // ────────────────────────────── HEATMAP
        case 'heatmap': {
            $uid  = $_GET['user_id'] ?? $user['id'];
            if ($uid !== $user['id'] && !isManager($user)) jsonError('Accès refusé', 403);
            // Récupérer le nom du user (les tâches sont assignées par nom)
            $name = $user['name'] ?? '';
            if ($uid !== $user['id']) {
                try {
                    $stmt = $db->prepare("SELECT CONCAT(prenom,' ',nom) FROM cortoba_users WHERE id = ?");
                    $stmt->execute([$uid]);
                    $name = $stmt->fetchColumn() ?: '';
                } catch (\Throwable $e) { /* */ }
            }
            $from = $_GET['from'] ?? date('Y-m-01');
            $to   = $_GET['to']   ?? date('Y-m-t', strtotime('+2 months'));
            jsonOk(['user_id'=>$uid,'user_name'=>$name,'days'=>computeHeatmap($db, $name, $from, $to)]);
            break;
        }

        // ────────────────────────────── CREATE
        case 'create': {
            $body = getBody();
            $type      = trim($body['type'] ?? 'Congés annuels');
            $dateDebut = trim($body['date_debut'] ?? '');
            $dateFin   = trim($body['date_fin']   ?? '');
            $motif     = trim($body['motif'] ?? '');
            $delegation= trim($body['delegation'] ?? '');
            if (!$dateDebut || !$dateFin) jsonError('Dates requises');
            if ($dateFin < $dateDebut)    jsonError('Date de fin avant le début');
            if (!$delegation)             jsonError('La délégation / passation est obligatoire');

            $jours = workingDays($dateDebut, $dateFin, $db);
            $id    = bin2hex(random_bytes(16));

            $db->prepare("INSERT INTO CA_leave_requests
                (id,user_id,user_name,type,date_debut,date_fin,jours,motif,delegation,statut)
                VALUES (?,?,?,?,?,?,?,?,?, 'En attente')")
               ->execute([
                   $id, $user['id'], $user['name'] ?? '',
                   $type, $dateDebut, $dateFin, $jours, $motif, $delegation,
               ]);

            // Détection de conflits
            $conflicts = detectConflicts($db, $user['id'], $dateDebut, $dateFin);

            // Notifier les gérants / admins de la nouvelle demande
            if (function_exists('notifCreate')) {
                try {
                    $admins = [];
                    // Membres avec rôle gérant
                    try {
                        $q = $db->query("SELECT id FROM cortoba_users WHERE LOWER(role) IN ('admin','gerant','gérant','manager','directeur') AND statut <> 'Inactif'");
                        foreach ($q->fetchAll(PDO::FETCH_COLUMN) as $aid) $admins[$aid] = true;
                    } catch (\Throwable $e) {}
                    // Comptes CA_accounts admin
                    try {
                        $q2 = $db->query("SELECT id FROM CA_accounts WHERE role = 'admin' AND approved = 1");
                        foreach ($q2->fetchAll(PDO::FETCH_COLUMN) as $aid) $admins[$aid] = true;
                    } catch (\Throwable $e) {}
                    $periode = date('d/m/Y', strtotime($dateDebut)) . ' → ' . date('d/m/Y', strtotime($dateFin));
                    $title = '🗓 Nouvelle demande de congé — ' . ($user['name'] ?? '');
                    $msg   = $type . ' · ' . $periode . ' (' . $jours . ' j)'
                           . ($motif ? "\nMotif : " . $motif : '')
                           . "\nDélégation : " . $delegation;
                    foreach (array_keys($admins) as $aid) {
                        if ($aid === $user['id']) continue; // ne pas se notifier soi-même
                        try { dispatchNotification($db, $aid, 'conge_pending', $title, $msg, 'conges', $id, $user['name'] ?? null); }
                        catch (\Throwable $e) { /* */ }
                    }
                } catch (\Throwable $e) { /* */ }
            }

            jsonOk(['id'=>$id, 'jours'=>$jours, 'conflicts'=>$conflicts]);
            break;
        }

        // ────────────────────────────── DECIDE (admin) — initial OU modification
        case 'decide': {
            if (!isManager($user)) jsonError('Accès refusé', 403);
            $id      = $_GET['id'] ?? '';
            $body    = getBody();
            $decision= $body['decision'] ?? ''; // 'approve' | 'refuse'
            $commentaire = trim($body['commentaire'] ?? '');
            // Partagé avec le calendrier de l'équipe (sous-effectif). Par défaut : partagé.
            $partage = array_key_exists('partage', $body) ? (intval($body['partage']) ? 1 : 0) : 1;
            if (!$id) jsonError('ID requis');
            if (!in_array($decision, ['approve','refuse'], true)) jsonError('Décision invalide');

            $stmt = $db->prepare('SELECT * FROM CA_leave_requests WHERE id = ?');
            $stmt->execute([$id]);
            $req = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$req) jsonError('Demande introuvable', 404);
            if ($req['statut'] === 'Annulé') jsonError('Demande annulée — non modifiable');

            $isModification = in_array($req['statut'], ['Approuvé','Refusé'], true);
            $previousStatut = $req['statut'];
            $newStatut      = $decision === 'approve' ? 'Approuvé' : 'Refusé';

            // Si modification d'une décision précédemment "Approuvé" : restituer le solde avant re-application
            $colFromType = function(string $type): ?string {
                if ($type === 'Congés annuels') return 'conges_annuels';
                if ($type === 'Maladie')         return 'maladie';
                if ($type === 'Récupération')    return 'recuperation';
                return null;
            };
            $annee = intval(substr($req['date_debut'], 0, 4));
            if ($isModification && $previousStatut === 'Approuvé') {
                $col = $colFromType($req['type']);
                if ($col) {
                    ensureBalance($db, $req['user_id'], $annee);
                    $db->prepare("UPDATE CA_leave_balances SET $col = $col + ? WHERE user_id = ? AND annee = ?")
                       ->execute([$req['jours'], $req['user_id'], $annee]);
                }
            }

            $db->prepare('UPDATE CA_leave_requests SET statut=?, commentaire_admin=?, decision_par=?, decision_at=NOW(), partage=? WHERE id=?')
               ->execute([$newStatut, $commentaire ?: null, $user['name'] ?? '', $partage, $id]);

            // Décrémenter le solde si approuvé
            if ($decision === 'approve') {
                $col = $colFromType($req['type']);
                if ($col) {
                    ensureBalance($db, $req['user_id'], $annee);
                    $db->prepare("UPDATE CA_leave_balances SET $col = GREATEST(0, $col - ?) WHERE user_id = ? AND annee = ?")
                       ->execute([$req['jours'], $req['user_id'], $annee]);
                }
            }

            // Notifier le collaborateur (initial OU modification)
            if (function_exists('notifCreate')) {
                $periode = date('d/m/Y', strtotime($req['date_debut'])) . ' → ' . date('d/m/Y', strtotime($req['date_fin']));
                if ($isModification) {
                    $title = $decision === 'approve'
                        ? '🔄 Décision modifiée : votre congé est désormais approuvé'
                        : '🔄 Décision modifiée : votre congé est désormais refusé';
                } else {
                    $title = $decision === 'approve'
                        ? '✅ Votre demande de congé a été approuvée'
                        : '❌ Votre demande de congé a été refusée';
                }
                $jStr = rtrim(rtrim(number_format(floatval($req['jours']),1,'.',''),'0'),'.');
                $msg = $req['type'] . ' — ' . $periode . ' (' . $jStr . ' j)'
                     . ($commentaire ? "\n\nCommentaire : " . $commentaire : '')
                     . ($decision === 'approve'
                         ? "\n\nVisibilité équipe : " . ($partage ? 'partagé (affiché dans le calendrier équipe)' : 'masqué (non visible dans le calendrier équipe)')
                         : '');
                try {
                    dispatchNotification($db, $req['user_id'], 'conge_' . $decision, $title, $msg, 'conges', $id, $user['name'] ?? null);
                } catch (\Throwable $e) { /* silencieux : ne pas bloquer la décision */ }
            }

            jsonOk(['id'=>$id,'statut'=>$newStatut,'partage'=>$partage,'modification'=>$isModification]);
            break;
        }

        // ────────────────────────────── TEAM_SHARED (calendrier équipe)
        // Retourne les congés approuvés ET partagés des AUTRES membres sur une plage,
        // pour afficher "sous-effectif" dans le heatmap personnel.
        case 'team_shared': {
            $from = $_GET['from'] ?? date('Y-m-01');
            $to   = $_GET['to']   ?? date('Y-m-t', strtotime('+2 months'));
            $stmt = $db->prepare("SELECT id, user_id, user_name, type, date_debut, date_fin
                                  FROM CA_leave_requests
                                  WHERE statut = 'Approuvé' AND partage = 1
                                    AND user_id <> ?
                                    AND NOT (date_fin < ? OR date_debut > ?)
                                  ORDER BY date_debut ASC");
            $stmt->execute([$user['id'], $from, $to]);
            jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;
        }

        // ────────────────────────────── CANCEL (demandeur)
        case 'cancel': {
            $id = $_GET['id'] ?? '';
            if (!$id) jsonError('ID requis');
            $stmt = $db->prepare('SELECT * FROM CA_leave_requests WHERE id = ?');
            $stmt->execute([$id]);
            $req = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$req) jsonError('Demande introuvable', 404);
            if ($req['user_id'] !== $user['id'] && !isManager($user)) jsonError('Accès refusé', 403);
            if ($req['statut'] !== 'En attente') jsonError('Impossible d\'annuler (déjà traitée)');

            $db->prepare("UPDATE CA_leave_requests SET statut='Annulé', decision_par=?, decision_at=NOW() WHERE id=?")
               ->execute([$user['name'] ?? '', $id]);
            jsonOk(['id'=>$id,'statut'=>'Annulé']);
            break;
        }

        // ────────────────────────────── BALANCE SET (admin)
        case 'balance_set': {
            if (!isManager($user)) jsonError('Accès refusé', 403);
            $body  = getBody();
            $uid   = $body['user_id'] ?? '';
            $annee = intval($body['annee'] ?? date('Y'));
            if (!$uid) jsonError('user_id requis');
            ensureBalance($db, $uid, $annee);
            $fields = [];
            $params = [];
            foreach (['conges_annuels','maladie','recuperation'] as $f) {
                if (array_key_exists($f, $body)) {
                    $fields[] = "$f = ?";
                    $params[] = floatval($body[$f]);
                }
            }
            if (!$fields) jsonError('Aucun champ à mettre à jour');
            $params[] = $uid; $params[] = $annee;
            $db->prepare("UPDATE CA_leave_balances SET ".implode(',', $fields)." WHERE user_id = ? AND annee = ?")
               ->execute($params);
            jsonOk(['user_id'=>$uid,'annee'=>$annee]);
            break;
        }

        // ────────────────────────────── HOLIDAYS LIST
        case 'holidays_list': {
            $annee = intval($_GET['annee'] ?? date('Y'));
            $stmt = $db->prepare("SELECT * FROM CA_jours_feries WHERE YEAR(date) = ? ORDER BY date ASC");
            $stmt->execute([$annee]);
            jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;
        }

        // ────────────────────────────── HOLIDAYS SAVE (admin)
        case 'holidays_save': {
            if (!isManager($user)) jsonError('Accès refusé', 403);
            $body = getBody();
            $date    = trim($body['date'] ?? '');
            $libelle = trim($body['libelle'] ?? '');
            $pont    = !empty($body['pont']) ? 1 : 0;
            $paye    = isset($body['paye']) ? (intval($body['paye']) ? 1 : 0) : 1;
            if (!$date || !$libelle) jsonError('Date et libellé requis');
            $id = $body['id'] ?? null;
            if ($id) {
                $db->prepare("UPDATE CA_jours_feries SET date=?, libelle=?, pont=?, paye=? WHERE id=?")
                   ->execute([$date, $libelle, $pont, $paye, $id]);
            } else {
                $db->prepare("INSERT INTO CA_jours_feries (date, libelle, pont, paye) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE libelle=VALUES(libelle), pont=VALUES(pont), paye=VALUES(paye)")
                   ->execute([$date, $libelle, $pont, $paye]);
                $id = $db->lastInsertId();
            }
            jsonOk(['id' => $id]);
            break;
        }

        // ────────────────────────────── HOLIDAYS DELETE (admin)
        case 'holidays_delete': {
            if (!isManager($user)) jsonError('Accès refusé', 403);
            $id = $_GET['id'] ?? '';
            if (!$id) jsonError('ID requis');
            $db->prepare("DELETE FROM CA_jours_feries WHERE id = ?")->execute([$id]);
            jsonOk(['deleted' => true]);
            break;
        }

        // ────────────────────────────── TEAM CALENDAR (admin — vue calendrier équipe)
        case 'team_calendar': {
            if (!isManager($user)) jsonError('Accès refusé', 403);
            $from = $_GET['from'] ?? date('Y-m-01');
            $to   = $_GET['to']   ?? date('Y-m-t');
            // Tous les congés (approuvés + en attente) chevauchant la période
            $stmt = $db->prepare("SELECT id, user_id, user_name, type, date_debut, date_fin, statut, partage
                                  FROM CA_leave_requests
                                  WHERE statut IN ('Approuvé','En attente')
                                    AND NOT (date_fin < ? OR date_debut > ?)
                                  ORDER BY user_name ASC, date_debut ASC");
            $stmt->execute([$from, $to]);
            $leaves = $stmt->fetchAll(PDO::FETCH_ASSOC);
            // Jours fériés
            $hStmt = $db->prepare("SELECT id, date, libelle, pont FROM CA_jours_feries WHERE date BETWEEN ? AND ?");
            $hStmt->execute([$from, $to]);
            $holidays = $hStmt->fetchAll(PDO::FETCH_ASSOC);
            // Membres actifs
            $members = [];
            try {
                $members = $db->query("SELECT id, CONCAT(prenom,' ',nom) AS name FROM cortoba_users WHERE statut <> 'Inactif' ORDER BY prenom ASC")->fetchAll(PDO::FETCH_ASSOC);
            } catch (\Throwable $e) {}
            jsonOk(['leaves' => $leaves, 'holidays' => $holidays, 'members' => $members]);
            break;
        }

        // ────────────────────────────── UPLOAD JUSTIFICATIF (multipart)
        case 'upload_justif': {
            if (empty($_FILES['file'])) jsonError('Aucun fichier reçu');
            $file = $_FILES['file'];
            $reqId = $_POST['request_id'] ?? '';
            if (!$reqId) jsonError('request_id requis');
            if ($file['error'] !== UPLOAD_ERR_OK) jsonError('Erreur upload: code ' . $file['error']);
            if ($file['size'] > 15 * 1024 * 1024) jsonError('Fichier trop volumineux (max 15 Mo)');
            $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            $allowed = ['jpg','jpeg','png','webp','pdf'];
            if (!in_array($ext, $allowed)) jsonError('Format non supporté (jpg, png, webp, pdf)');
            $dir = realpath(__DIR__ . '/../../') . '/img/conge_justifs/';
            if (!is_dir($dir)) @mkdir($dir, 0755, true);
            $filename = 'conge_' . $reqId . '_' . time() . '.' . $ext;
            $dest = $dir . $filename;
            if (!move_uploaded_file($file['tmp_name'], $dest)) jsonError("Erreur d'enregistrement");
            $url = '/img/conge_justifs/' . $filename;
            $db->prepare("UPDATE CA_leave_requests SET justificatif_url = ? WHERE id = ?")->execute([$url, $reqId]);
            jsonOk(['url' => $url, 'filename' => $filename]);
            break;
        }

        default:
            jsonError('Action inconnue', 404);
    }
} catch (\Throwable $e) {
    jsonError('Erreur serveur : ' . $e->getMessage(), 500);
}
