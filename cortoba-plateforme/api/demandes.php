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
            $demande['prenom'] = str_replace(',', '', $demande['prenom'] ?? '');
            $demande['nom']    = str_replace(',', '', $demande['nom'] ?? '');
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
