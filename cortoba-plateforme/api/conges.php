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
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

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
} catch (\Throwable $e) { /* silencieux */ }

// ── Helper : est-ce un gérant / admin ? ──
function isManager(array $u): bool {
    $role = strtolower($u['role'] ?? '');
    if (in_array($role, ['admin','gerant','gérant','manager','directeur'], true)) return true;
    if (empty($u['isMember'])) return true; // comptes CA_accounts = admins
    return false;
}

// ── Helper : nombre de jours ouvrés entre deux dates (inclus, hors week-end) ──
function workingDays(string $d1, string $d2): float {
    $start = new DateTime($d1);
    $end   = new DateTime($d2);
    if ($end < $start) return 0;
    $days = 0;
    $cur = clone $start;
    while ($cur <= $end) {
        $dow = (int)$cur->format('N'); // 1..7
        if ($dow < 6) $days++;
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

            $jours = workingDays($dateDebut, $dateFin);
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
            jsonOk(['id'=>$id, 'jours'=>$jours, 'conflicts'=>$conflicts]);
            break;
        }

        // ────────────────────────────── DECIDE (admin)
        case 'decide': {
            if (!isManager($user)) jsonError('Accès refusé', 403);
            $id      = $_GET['id'] ?? '';
            $body    = getBody();
            $decision= $body['decision'] ?? ''; // 'approve' | 'refuse'
            $commentaire = trim($body['commentaire'] ?? '');
            if (!$id) jsonError('ID requis');
            if (!in_array($decision, ['approve','refuse'], true)) jsonError('Décision invalide');

            $stmt = $db->prepare('SELECT * FROM CA_leave_requests WHERE id = ?');
            $stmt->execute([$id]);
            $req = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$req) jsonError('Demande introuvable', 404);
            if ($req['statut'] !== 'En attente') jsonError('Demande déjà traitée');

            $newStatut = $decision === 'approve' ? 'Approuvé' : 'Refusé';

            $db->prepare('UPDATE CA_leave_requests SET statut=?, commentaire_admin=?, decision_par=?, decision_at=NOW() WHERE id=?')
               ->execute([$newStatut, $commentaire ?: null, $user['name'] ?? '', $id]);

            // Décrémenter le solde si approuvé
            if ($decision === 'approve') {
                $annee = intval(substr($req['date_debut'], 0, 4));
                $bal   = ensureBalance($db, $req['user_id'], $annee);
                $col   = null;
                if ($req['type'] === 'Congés annuels') $col = 'conges_annuels';
                elseif ($req['type'] === 'Maladie')      $col = 'maladie';
                elseif ($req['type'] === 'Récupération') $col = 'recuperation';
                if ($col) {
                    $db->prepare("UPDATE CA_leave_balances SET $col = GREATEST(0, $col - ?) WHERE user_id = ? AND annee = ?")
                       ->execute([$req['jours'], $req['user_id'], $annee]);
                }
            }
            jsonOk(['id'=>$id,'statut'=>$newStatut]);
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

        default:
            jsonError('Action inconnue', 404);
    }
} catch (\Throwable $e) {
    jsonError('Erreur serveur : ' . $e->getMessage(), 500);
}
