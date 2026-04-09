<?php
// ============================================================
//  CORTOBA ATELIER — API Demandes (configurateur public)
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = $_GET['id'] ?? null;

try {
    // POST sans id = soumission publique (pas d'auth)
    if ($method === 'POST' && !$id) {
        createPublic();
    } else {
        // Toutes les autres opérations nécessitent une auth
        $user = requireAuth();
        if ($method === 'GET')        $id ? getOne($id) : getAll();
        elseif ($method === 'PUT')    handlePut($id, $user);
        elseif ($method === 'DELETE') remove($id, $user);
        else jsonError('Méthode non supportée', 405);
    }
} catch (\Throwable $e) {
    jsonError('Erreur serveur : ' . $e->getMessage(), 500);
}

// ── GET : liste ou détail ───────────────────────────────────

function getAll() {
    $db = getDB();
    $where = ['1=1'];
    $params = [];
    if (!empty($_GET['statut'])) { $where[] = 'statut = ?'; $params[] = $_GET['statut']; }
    if (!empty($_GET['q'])) {
        $q = '%' . $_GET['q'] . '%';
        $where[] = '(nom_projet LIKE ? OR prenom LIKE ? OR nom LIKE ? OR tel LIKE ? OR email LIKE ?)';
        array_push($params, $q, $q, $q, $q, $q);
    }
    $stmt = $db->prepare('SELECT * FROM CA_demandes WHERE ' . implode(' AND ', $where) . ' ORDER BY cree_at DESC');
    $stmt->execute($params);
    jsonOk($stmt->fetchAll());
}

function getOne(string $id) {
    $db   = getDB();
    $stmt = $db->prepare('SELECT * FROM CA_demandes WHERE id = ?');
    $stmt->execute([$id]);
    $d = $stmt->fetch();
    if (!$d) jsonError('Demande introuvable', 404);
    jsonOk($d);
}

// ── POST public : soumission depuis le configurateur ────────

function createPublic() {
    $body = getBody();

    // Honeypot anti-spam
    if (!empty($body['website'])) {
        jsonOk(['received' => true]);
    }

    // Validation champs requis
    $nomProjet = trim($body['nom_projet'] ?? '');
    $prenom    = trim($body['prenom'] ?? '');
    $nom       = trim($body['nom'] ?? '');
    $tel       = trim($body['tel'] ?? '');
    if (!$nomProjet) jsonError('Nom du projet requis');
    if (!$prenom)    jsonError('Prénom requis');
    if (!$nom)       jsonError('Nom requis');
    if (!$tel)       jsonError('Téléphone requis');

    $db = getDB();
    $id = bin2hex(random_bytes(16));

    // Fusionner les missions dans cfg_data si présentes
    $cfgRaw = $body['cfg_data'] ?? '{}';
    $cfgObj = json_decode($cfgRaw, true) ?: [];
    if (!empty($body['missions']) && is_array($body['missions'])) {
        $cfgObj['missions'] = $body['missions'];
        $cfgRaw = json_encode($cfgObj, JSON_UNESCAPED_UNICODE);
    }

    $db->prepare('
        INSERT INTO CA_demandes (id, nom_projet, prenom, nom, tel, whatsapp, email,
            cfg_data, surface_estimee, cout_estime_low, cout_estime_high, statut, cree_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW())
    ')->execute([
        $id,
        $nomProjet,
        $prenom,
        $nom,
        $tel,
        $body['whatsapp']        ?? null,
        $body['email']           ?? null,
        $cfgRaw,
        !empty($body['surface_estimee'])  ? floatval($body['surface_estimee'])  : null,
        !empty($body['cout_estime_low'])  ? floatval($body['cout_estime_low'])  : null,
        !empty($body['cout_estime_high']) ? floatval($body['cout_estime_high']) : null,
        'nouvelle',
    ]);

    jsonOk(['id' => $id, 'statut' => 'nouvelle'], 201);
}

// ── PUT : actions authentifiées ─────────────────────────────

function handlePut($id, array $user) {
    if (!$id) jsonError('ID requis');
    $body = getBody();
    $db   = getDB();

    // Vérifier que la demande existe
    $stmt = $db->prepare('SELECT * FROM CA_demandes WHERE id = ?');
    $stmt->execute([$id]);
    $demande = $stmt->fetch();
    if (!$demande) jsonError('Demande introuvable', 404);

    $action = $body['action'] ?? null;

    switch ($action) {
        case 'update_statut':
            $statut = trim($body['statut'] ?? '');
            if (!$statut) jsonError('Statut requis');
            $db->prepare('UPDATE CA_demandes SET statut=?, traite_par=?, traite_at=NOW() WHERE id=?')
               ->execute([$statut, $user['name'], $id]);
            break;

        case 'convertir_client':
            $clientId = bin2hex(random_bytes(16));
            $demande['prenom'] = mb_strtoupper(str_replace(',', '', $demande['prenom'] ?? ''), 'UTF-8');
            $demande['nom']    = mb_strtoupper(str_replace(',', '', $demande['nom'] ?? ''), 'UTF-8');
            $displayNom = trim($demande['prenom'] . ' ' . $demande['nom']);

            try {
                $db->prepare('
                    INSERT INTO CA_clients (id, code, num_client, type, prenom, nom, raison, matricule,
                        cin, date_cin, display_nom, email, tel, whatsapp, adresse, statut, source, source_detail,
                        date_contact, remarques, groupe_json, cree_par)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ')->execute([
                    $clientId,
                    '',                        // code
                    null,                      // num_client
                    'physique',                // type
                    $demande['prenom'],        // prenom
                    $demande['nom'],           // nom
                    null,                      // raison
                    null,                      // matricule
                    null,                      // cin
                    null,                      // date_cin
                    $displayNom,               // display_nom
                    $demande['email'],         // email
                    $demande['tel'],           // tel
                    $demande['whatsapp'],      // whatsapp
                    null,                      // adresse
                    'Prospect',                // statut
                    'Configurateur',           // source
                    'Demande #' . $id,         // source_detail
                    date('Y-m-d'),             // date_contact
                    null,                      // remarques
                    null,                      // groupe_json
                    $user['name'],             // cree_par
                ]);
            } catch (\Exception $e) {
                // Fallback sans cin/date_cin/groupe_json si colonnes absentes
                $db->prepare('
                    INSERT INTO CA_clients (id, code, num_client, type, prenom, nom, raison, matricule,
                        display_nom, email, tel, whatsapp, adresse, statut, source, source_detail,
                        date_contact, remarques, cree_par)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ')->execute([
                    $clientId,
                    '',                        // code
                    null,                      // num_client
                    'physique',                // type
                    $demande['prenom'],        // prenom
                    $demande['nom'],           // nom
                    null,                      // raison
                    null,                      // matricule
                    $displayNom,               // display_nom
                    $demande['email'],         // email
                    $demande['tel'],           // tel
                    $demande['whatsapp'],      // whatsapp
                    null,                      // adresse
                    'Prospect',                // statut
                    'Configurateur',           // source
                    'Demande #' . $id,         // source_detail
                    date('Y-m-d'),             // date_contact
                    null,                      // remarques
                    $user['name'],             // cree_par
                ]);
            }

            $db->prepare('UPDATE CA_demandes SET client_id=?, statut=?, traite_par=?, traite_at=NOW() WHERE id=?')
               ->execute([$clientId, 'client_cree', $user['name'], $id]);

            jsonOk(['id' => $id, 'client_id' => $clientId]);

        case 'convertir_projet':
            if (empty($demande['client_id'])) jsonError('Le client doit être créé en premier (convertir_client)');

            // Récupérer les infos client pour le projet
            $stmtCli = $db->prepare('SELECT display_nom, code FROM CA_clients WHERE id = ?');
            $stmtCli->execute([$demande['client_id']]);
            $client = $stmtCli->fetch();

            $projetId = bin2hex(random_bytes(16));
            $annee = date('Y');

            $db->prepare('
                INSERT INTO CA_projets (id, code, nom, client, client_code, annee, phase, statut, type_bat,
                    delai, honoraires, budget, surface, description, adresse, lat, lng,
                    surface_shon, surface_shob, surface_terrain, standing, zone, cout_construction, cout_m2,
                    cree_par)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ')->execute([
                $projetId,
                '',                                          // code
                $demande['nom_projet'],                      // nom
                $client ? $client['display_nom'] : '',       // client
                $client ? ($client['code'] ?? '') : '',      // client_code
                $annee,                                      // annee
                'APS',                                       // phase
                'Actif',                                     // statut
                null,                                        // type_bat
                null,                                        // delai
                0,                                           // honoraires
                0,                                           // budget
                $demande['surface_estimee'] ? floatval($demande['surface_estimee']) : 0, // surface
                null,                                        // description
                null,                                        // adresse
                null,                                        // lat
                null,                                        // lng
                null,                                        // surface_shon
                null,                                        // surface_shob
                null,                                        // surface_terrain
                null,                                        // standing
                null,                                        // zone
                $demande['cout_estime_high'] ? floatval($demande['cout_estime_high']) : null, // cout_construction
                null,                                        // cout_m2
                $user['name'],                               // cree_par
            ]);

            // Incrémenter le compteur projets du client
            if ($client && !empty($client['code'])) {
                $db->prepare('UPDATE CA_clients SET projets = projets + 1 WHERE code = ?')->execute([$client['code']]);
            }

            $db->prepare('UPDATE CA_demandes SET projet_id=?, statut=?, traite_par=?, traite_at=NOW() WHERE id=?')
               ->execute([$projetId, 'projet_cree', $user['name'], $id]);

            jsonOk(['id' => $id, 'projet_id' => $projetId]);

        case 'creer_devis':
            // Stub : mettre à jour le devis_id si fourni
            $devisId = $body['devis_id'] ?? null;
            if ($devisId) {
                $db->prepare('UPDATE CA_demandes SET devis_id=?, statut=?, traite_par=?, traite_at=NOW() WHERE id=?')
                   ->execute([$devisId, 'devis_cree', $user['name'], $id]);
            }
            break;

        case 'accepter_demande':
            // ── One-click: create client + project + auto-generate devis ──
            $db->beginTransaction();
            try {
                // 1. Create client (if not already created)
                $clientId = $demande['client_id'];
                if (!$clientId) {
                    $clientId = bin2hex(random_bytes(16));
                    $prenomU = mb_strtoupper(str_replace(',', '', $demande['prenom'] ?? ''), 'UTF-8');
                    $nomU    = mb_strtoupper(str_replace(',', '', $demande['nom'] ?? ''), 'UTF-8');
                    $displayNom = trim($prenomU . ' ' . $nomU);

                    try {
                        $db->prepare('
                            INSERT INTO CA_clients (id, code, num_client, type, prenom, nom, raison, matricule,
                                cin, date_cin, display_nom, email, tel, whatsapp, adresse, statut, source, source_detail,
                                date_contact, remarques, groupe_json, cree_par)
                            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                        ')->execute([
                            $clientId, '', null, 'physique', $prenomU, $nomU, null, null, null, null,
                            $displayNom, $demande['email'], $demande['tel'], $demande['whatsapp'],
                            null, 'Prospect', 'Configurateur', 'Demande #' . $id,
                            date('Y-m-d'), null, null, $user['name'],
                        ]);
                    } catch (\Exception $e) {
                        $db->prepare('
                            INSERT INTO CA_clients (id, code, num_client, type, prenom, nom, raison, matricule,
                                display_nom, email, tel, whatsapp, adresse, statut, source, source_detail,
                                date_contact, remarques, cree_par)
                            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                        ')->execute([
                            $clientId, '', null, 'physique', $prenomU, $nomU, null, null,
                            $displayNom, $demande['email'], $demande['tel'], $demande['whatsapp'],
                            null, 'Prospect', 'Configurateur', 'Demande #' . $id,
                            date('Y-m-d'), null, $user['name'],
                        ]);
                    }
                }

                // 2. Create project (if not already created)
                $projetId = $demande['projet_id'];
                if (!$projetId) {
                    $stmtCli = $db->prepare('SELECT display_nom, code FROM CA_clients WHERE id = ?');
                    $stmtCli->execute([$clientId]);
                    $client = $stmtCli->fetch();

                    $projetId = bin2hex(random_bytes(16));
                    $db->prepare('
                        INSERT INTO CA_projets (id, code, nom, client, client_code, annee, phase, statut, type_bat,
                            delai, honoraires, budget, surface, description, adresse, lat, lng,
                            surface_shon, surface_shob, surface_terrain, standing, zone, cout_construction, cout_m2,
                            cree_par)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    ')->execute([
                        $projetId, '', $demande['nom_projet'],
                        $client ? $client['display_nom'] : '', $client ? ($client['code'] ?? '') : '',
                        date('Y'), 'APS', 'Actif', null, null, 0, 0,
                        $demande['surface_estimee'] ? floatval($demande['surface_estimee']) : 0,
                        null, null, null, null, null, null, null, null, null,
                        $demande['cout_estime_high'] ? floatval($demande['cout_estime_high']) : null,
                        null, $user['name'],
                    ]);
                }

                // 3. Auto-generate devis from cfg_data missions + MOP
                $cfgData = json_decode($demande['cfg_data'] ?? '{}', true) ?: [];
                $missions = $cfgData['missions'] ?? [];
                $coutConstruction = floatval($demande['cout_estime_high'] ?? 0);

                // Calculate MOP if cost is available
                require_once __DIR__ . '/honoraires.php';
                ensureHonorairesSchema();
                $mopResult = null;
                if ($coutConstruction > 0) {
                    $mopResult = calculMOP($coutConstruction);
                }

                // Build devis lines from missions
                $lignes = [];
                $montantHT = 0;
                if (!empty($missions) && $mopResult) {
                    $mopPhases = $mopResult['phases'];
                    $missionPhaseMap = [];
                    foreach ($mopPhases as $ph) {
                        $missionPhaseMap[$ph['phase']] = $ph;
                    }

                    foreach ($missions as $m) {
                        $mId = $m['id'] ?? ($m['nom'] ?? '');
                        $mNom = $m['nom'] ?? $mId;
                        // Try to match mission to MOP phase
                        $phaseMontant = 0;
                        $phaseKey = strtolower(str_replace([' ', '-', '_', "'"], '', $mNom));
                        foreach ($missionPhaseMap as $pk => $pv) {
                            $pkNorm = strtolower(str_replace([' ', '-', '_', "'"], '', $pv['label']));
                            if (strpos($pkNorm, $phaseKey) !== false || strpos($phaseKey, $pk) !== false) {
                                $phaseMontant = $pv['montant'];
                                break;
                            }
                        }
                        // If no match, distribute total equally among missions
                        if ($phaseMontant == 0 && count($missions) > 0) {
                            $phaseMontant = round($mopResult['total_honoraires'] / count($missions), 2);
                        }
                        $lignes[] = [
                            'description' => $mNom,
                            'quantite' => 1,
                            'unite' => 'forfait',
                            'prix_unitaire' => $phaseMontant,
                            'montant' => $phaseMontant,
                        ];
                        $montantHT += $phaseMontant;
                    }
                } elseif ($mopResult) {
                    // No specific missions: use all MOP phases
                    foreach ($mopResult['phases'] as $ph) {
                        $lignes[] = [
                            'description' => $ph['label'],
                            'quantite' => 1,
                            'unite' => 'forfait',
                            'prix_unitaire' => $ph['montant'],
                            'montant' => $ph['montant'],
                        ];
                        $montantHT += $ph['montant'];
                    }
                } else {
                    // Fallback: rough estimate (8% of cost)
                    $montantHT = $coutConstruction > 0 ? round($coutConstruction * 0.08, 2) : 0;
                    $lignes[] = [
                        'description' => 'Honoraires architecte — ' . $demande['nom_projet'],
                        'quantite' => 1,
                        'unite' => 'forfait',
                        'prix_unitaire' => $montantHT,
                        'montant' => $montantHT,
                    ];
                }

                // Get client display name
                $stmtCli2 = $db->prepare('SELECT display_nom FROM CA_clients WHERE id = ?');
                $stmtCli2->execute([$clientId]);
                $clientNom = $stmtCli2->fetchColumn() ?: trim(($demande['prenom'] ?? '') . ' ' . ($demande['nom'] ?? ''));

                // Count existing devis for numbering
                $devisCount = (int)$db->query('SELECT COUNT(*) FROM CA_devis')->fetchColumn();
                $devisNumero = 'DV-' . date('Y') . '-' . str_pad($devisCount + 1, 3, '0', STR_PAD_LEFT);

                $tva = round($montantHT * 0.19, 2); // TVA 19% Tunisia
                $montantTTC = round($montantHT + $tva, 2);

                $devisId = bin2hex(random_bytes(16));
                $cfgParts = [$demande['nom_projet']];
                if (!empty($cfgData['cfg_type'])) $cfgParts[] = $cfgData['cfg_type'];
                if (!empty($cfgData['cfg_operation'])) $cfgParts[] = $cfgData['cfg_operation'];
                $devisObjet = implode(' — ', $cfgParts);

                $missionNames = array_map(function($l) { return $l['description']; }, $lignes);
                $devisNotes = "Missions incluses :\n- " . implode("\n- ", $missionNames);

                $db->prepare('
                    INSERT INTO CA_devis (id, numero, client, client_id, projet_id, montant_ht, tva, montant_ttc,
                        statut, date_devis, date_expiry, objet, notes, cree_par)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ')->execute([
                    $devisId, $devisNumero, $clientNom, $clientId, $projetId,
                    $montantHT, $tva, $montantTTC,
                    'En attente', date('Y-m-d'), date('Y-m-d', strtotime('+30 days')),
                    $devisObjet, $devisNotes, $user['name'],
                ]);

                // Update demande with all references
                $db->prepare('UPDATE CA_demandes SET client_id=?, projet_id=?, devis_id=?, statut=?, traite_par=?, traite_at=NOW() WHERE id=?')
                   ->execute([$clientId, $projetId, $devisId, 'devis_cree', $user['name'], $id]);

                // Init project honoraires if MOP available
                if ($mopResult && $coutConstruction > 0) {
                    $stmtH = $db->prepare("INSERT INTO CA_projets_honoraires (projet_id, mission_phase, mission_label, mode, taux_pct, montant_prevu, ordre) VALUES (?,?,?,?,?,?,?)");
                    foreach ($mopResult['phases'] as $p) {
                        $stmtH->execute([$projetId, $p['phase'], $p['label'], 'mop', $p['pct'], $p['montant'], $p['ordre']]);
                    }
                    $db->prepare("UPDATE CA_projets SET honoraires_mode = 'mop', honoraires = ?, honoraires_prevus = ?, cout_construction = ? WHERE id = ?")
                       ->execute([$mopResult['total_honoraires'], $mopResult['total_honoraires'], $coutConstruction, $projetId]);
                }

                $db->commit();

                // Send notification
                try {
                    require_once __DIR__ . '/notification_dispatch.php';
                    $admins = $db->query("SELECT id FROM CA_accounts WHERE role = 'admin'")->fetchAll(\PDO::FETCH_COLUMN);
                    foreach ($admins as $adminId) {
                        dispatchNotification($db, $adminId, 'success',
                            'Demande acceptée',
                            'Client, projet et devis ' . $devisNumero . ' créés automatiquement pour ' . $demande['nom_projet'],
                            'devis', $devisId, $user['name']);
                    }
                } catch (\Throwable $e) { /* non-critique */ }

                // Send email to client
                try {
                    $clientEmail = $demande['email'] ?? '';
                    if ($clientEmail && filter_var($clientEmail, FILTER_VALIDATE_EMAIL)) {
                        $subject = 'Votre devis ' . $devisNumero . ' — CORTOBA Architecture';
                        $htmlMsg = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:20px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
  <tr><td style="background:#1b1b1f;padding:20px 30px">
    <h1 style="color:#c8a96e;margin:0;font-size:18px">CORTOBA ATELIER D\'ARCHITECTURE</h1>
  </td></tr>
  <tr><td style="padding:30px">
    <h2 style="color:#222;margin:0 0 12px;font-size:16px">Votre devis est prêt</h2>
    <p style="color:#555;line-height:1.6;font-size:14px">Bonjour ' . htmlspecialchars(trim(($demande['prenom'] ?? '') . ' ' . ($demande['nom'] ?? ''))) . ',</p>
    <p style="color:#555;line-height:1.6;font-size:14px">Suite à votre demande pour le projet <strong>' . htmlspecialchars($demande['nom_projet']) . '</strong>, nous avons le plaisir de vous transmettre votre devis n° <strong>' . $devisNumero . '</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px 12px;background:#f8f8f8;border:1px solid #eee;font-size:13px;color:#666">Montant HT</td><td style="padding:8px 12px;background:#f8f8f8;border:1px solid #eee;font-size:13px;font-weight:bold">' . number_format($montantHT, 2, ',', ' ') . ' TND</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #eee;font-size:13px;color:#666">TVA (19%)</td><td style="padding:8px 12px;border:1px solid #eee;font-size:13px">' . number_format($tva, 2, ',', ' ') . ' TND</td></tr>
      <tr><td style="padding:8px 12px;background:#f8f8f8;border:1px solid #eee;font-size:13px;color:#666;font-weight:bold">Total TTC</td><td style="padding:8px 12px;background:#f8f8f8;border:1px solid #eee;font-size:14px;font-weight:bold;color:#c8a96e">' . number_format($montantTTC, 2, ',', ' ') . ' TND</td></tr>
    </table>
    <p style="color:#555;line-height:1.6;font-size:14px">Ce devis est valable 30 jours. N\'hésitez pas à nous contacter pour toute question.</p>
    <p style="color:#555;line-height:1.6;font-size:14px">Cordialement,<br><strong>CORTOBA Atelier d\'Architecture</strong></p>
  </td></tr>
  <tr><td style="padding:16px 30px;background:#f8f8f8;border-top:1px solid #eee">
    <p style="color:#999;font-size:11px;margin:0">CORTOBA Atelier d\'Architecture · Tunis, Tunisie<br>cortobaarchitecture@gmail.com</p>
  </td></tr>
</table></body></html>';
                        $headers  = "MIME-Version: 1.0\r\n";
                        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
                        $headers .= "From: CORTOBA Architecture <cortobaarchitecture@gmail.com>\r\n";
                        @mail($clientEmail, $subject, $htmlMsg, $headers);
                    }
                } catch (\Throwable $e) { /* non-critique */ }

                jsonOk(['id' => $id, 'client_id' => $clientId, 'projet_id' => $projetId, 'devis_id' => $devisId, 'devis_numero' => $devisNumero, 'montant_ht' => $montantHT, 'montant_ttc' => $montantTTC]);

            } catch (\Throwable $e) {
                $db->rollBack();
                jsonError('Erreur lors de l\'acceptation : ' . $e->getMessage(), 500);
            }

        case 'update_remarques':
            $remarques = $body['remarques'] ?? '';
            $db->prepare('UPDATE CA_demandes SET remarques=?, traite_par=?, traite_at=NOW() WHERE id=?')
               ->execute([$remarques, $user['name'], $id]);
            break;

        default:
            // Mise à jour générale
            $db->prepare('
                UPDATE CA_demandes SET statut=?, remarques=?, traite_par=?, traite_at=NOW() WHERE id=?
            ')->execute([
                $body['statut']     ?? $demande['statut'],
                $body['remarques']  ?? $demande['remarques'],
                $user['name'],
                $id,
            ]);
            break;
    }

    // Retourner la demande mise à jour
    $stmt = $db->prepare('SELECT * FROM CA_demandes WHERE id = ?');
    $stmt->execute([$id]);
    jsonOk($stmt->fetch());
}

// ── DELETE ───────────────────────────────────────────────────

function remove($id, array $user) {
    if (!$id) jsonError('ID requis');
    $role = $user['role'] ?? '';
    if ($role !== 'admin' && $role !== 'Architecte gérant') jsonError('Seul un admin peut supprimer', 403);
    getDB()->prepare('DELETE FROM CA_demandes WHERE id = ?')->execute([$id]);
    jsonOk(['deleted' => $id]);
}
