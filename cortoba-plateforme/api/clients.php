<?php
// ============================================================
//  CORTOBA ATELIER — API Clients v2 (+ groupe, type groupe)
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = $_GET['id'] ?? null;
$user   = requireAuth();

if ($method === 'GET')        $id ? getOne($id) : getAll();
elseif ($method === 'POST')   create($user);
elseif ($method === 'PUT')    update($id, $user);
elseif ($method === 'PATCH')  patch($id, $user);
elseif ($method === 'DELETE') remove($id, $user);
else jsonError('Méthode non supportée', 405);

function getAll() {
    $db = getDB();
    $where = ['1=1'];
    $params = [];
    if (!empty($_GET['statut'])) { $where[] = 'statut = ?'; $params[] = $_GET['statut']; }
    if (!empty($_GET['q'])) {
        $q = '%' . $_GET['q'] . '%';
        $where[] = '(display_nom LIKE ? OR email LIKE ? OR tel LIKE ? OR code LIKE ?)';
        array_push($params, $q, $q, $q, $q);
    }
    $stmt = $db->prepare('SELECT * FROM CA_clients WHERE ' . implode(' AND ', $where) . ' ORDER BY cree_at DESC');
    $stmt->execute($params);
    $clients = $stmt->fetchAll();
    foreach ($clients as &$c) {
        $c['contactsAux'] = getContactsAux($c['id']);
        // Décoder le groupe JSON si présent
        if (!empty($c['groupe_json'])) {
            $c['groupe'] = json_decode($c['groupe_json'], true);
        }
    }
    jsonOk($clients);
}

function getOne(string $id) {
    $db   = getDB();
    $stmt = $db->prepare('SELECT * FROM CA_clients WHERE id = ?');
    $stmt->execute([$id]);
    $c = $stmt->fetch();
    if (!$c) jsonError('Client introuvable', 404);
    $c['contactsAux'] = getContactsAux($id);
    if (!empty($c['groupe_json'])) {
        $c['groupe'] = json_decode($c['groupe_json'], true);
    }
    jsonOk($c);
}

function create(array $user) {
    $body = getBody();
    $db   = getDB();
    $id   = bin2hex(random_bytes(16));

    // Sérialiser le groupe en JSON string pour stockage
    $groupeJson = null;
    if (!empty($body['groupe'])) {
        $groupeJson = json_encode($body['groupe'], JSON_UNESCAPED_UNICODE);
    }

    // Essayer d'abord avec toutes les colonnes optionnelles
    try {
        $db->prepare('
            INSERT INTO CA_clients (id, code, num_client, type, prenom, nom, raison, matricule,
                cin, date_cin, display_nom, email, tel, whatsapp, adresse, statut, source, source_detail,
                date_contact, remarques, groupe_json, cree_par)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ')->execute([
            $id,
            $body['code']         ?? '',
            $body['numClient']    ?? null,
            $body['type']         ?? 'physique',
            $body['prenom']       ?? null,
            $body['nom']          ?? null,
            $body['raison']       ?? null,
            $body['matricule']    ?? null,
            $body['cin']          ?? null,
            $body['dateCin']      ?: null,
            $body['displayNom']   ?? '',
            $body['email']        ?? null,
            $body['tel']          ?? null,
            $body['whatsapp']     ?? null,
            $body['adresse']      ?? null,
            $body['statut']       ?? 'Prospect',
            $body['source']       ?? null,
            $body['sourceDetail'] ?? null,
            $body['dateContact']  ?: null,
            $body['remarques']    ?? null,
            $groupeJson,
            $user['name'],
        ]);
    } catch (\Exception $e) {
        // Fallback sans cin/date_cin/groupe_json si colonnes absentes
        $db->prepare('
            INSERT INTO CA_clients (id, code, num_client, type, prenom, nom, raison, matricule,
                display_nom, email, tel, whatsapp, adresse, statut, source, source_detail,
                date_contact, remarques, cree_par)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ')->execute([
            $id,
            $body['code']         ?? '',
            $body['numClient']    ?? null,
            $body['type']         ?? 'physique',
            $body['prenom']       ?? null,
            $body['nom']          ?? null,
            $body['raison']       ?? null,
            $body['matricule']    ?? null,
            $body['displayNom']   ?? '',
            $body['email']        ?? null,
            $body['tel']          ?? null,
            $body['whatsapp']     ?? null,
            $body['adresse']      ?? null,
            $body['statut']       ?? 'Prospect',
            $body['source']       ?? null,
            $body['sourceDetail'] ?? null,
            $body['dateContact']  ?: null,
            $body['remarques']    ?? null,
            $user['name'],
        ]);
    }

    saveContactsAux($id, $body['contactsAux'] ?? []);
    getOne($id);
}

function update($id, array $user) {
    if (!$id) jsonError('ID requis');
    $body = getBody();
    $db   = getDB();

    $groupeJson = null;
    if (!empty($body['groupe'])) {
        $groupeJson = json_encode($body['groupe'], JSON_UNESCAPED_UNICODE);
    }

    // Lire l'ancien code client AVANT la mise à jour (pour sync projets)
    $stOldCl = $db->prepare('SELECT code, display_nom FROM CA_clients WHERE id = ?');
    $stOldCl->execute([$id]);
    $oldClient = $stOldCl->fetch(\PDO::FETCH_ASSOC);

    try {
        $db->prepare('
            UPDATE CA_clients SET
                code=?, num_client=?, type=?, prenom=?, nom=?, raison=?, matricule=?,
                cin=?, date_cin=?, display_nom=?, email=?, tel=?, whatsapp=?, adresse=?, statut=?,
                source=?, source_detail=?, date_contact=?, remarques=?, groupe_json=?, modifie_par=?
            WHERE id=?
        ')->execute([
            $body['code']         ?? '',
            $body['numClient']    ?? null,
            $body['type']         ?? 'physique',
            $body['prenom']       ?? null,
            $body['nom']          ?? null,
            $body['raison']       ?? null,
            $body['matricule']    ?? null,
            $body['cin']          ?? null,
            $body['dateCin']      ?: null,
            $body['displayNom']   ?? '',
            $body['email']        ?? null,
            $body['tel']          ?? null,
            $body['whatsapp']     ?? null,
            $body['adresse']      ?? null,
            $body['statut']       ?? 'Prospect',
            $body['source']       ?? null,
            $body['sourceDetail'] ?? null,
            $body['dateContact']  ?: null,
            $body['remarques']    ?? null,
            $groupeJson,
            $user['name'],
            $id,
        ]);
    } catch (\Exception $e) {
        // Fallback sans cin/date_cin/groupe_json
        $db->prepare('
            UPDATE CA_clients SET
                code=?, num_client=?, type=?, prenom=?, nom=?, raison=?, matricule=?,
                display_nom=?, email=?, tel=?, whatsapp=?, adresse=?, statut=?,
                source=?, source_detail=?, date_contact=?, remarques=?, modifie_par=?
            WHERE id=?
        ')->execute([
            $body['code']         ?? '',
            $body['numClient']    ?? null,
            $body['type']         ?? 'physique',
            $body['prenom']       ?? null,
            $body['nom']          ?? null,
            $body['raison']       ?? null,
            $body['matricule']    ?? null,
            $body['displayNom']   ?? '',
            $body['email']        ?? null,
            $body['tel']          ?? null,
            $body['whatsapp']     ?? null,
            $body['adresse']      ?? null,
            $body['statut']       ?? 'Prospect',
            $body['source']       ?? null,
            $body['sourceDetail'] ?? null,
            $body['dateContact']  ?: null,
            $body['remarques']    ?? null,
            $user['name'],
            $id,
        ]);
    }

    saveContactsAux($id, $body['contactsAux'] ?? []);

    // Synchroniser le nom client et le code dans les projets liés
    $newDisplayNom = $body['displayNom'] ?? '';
    $newCode       = $body['code'] ?? '';
    $oldCode       = $oldClient ? ($oldClient['code'] ?? '') : '';
    if ($oldCode && ($newDisplayNom || $newCode)) {
        $db->prepare('UPDATE CA_projets SET client = ?, client_code = ? WHERE client_code = ?')
           ->execute([$newDisplayNom, $newCode, $oldCode]);
    }

    getOne($id);
}

// ── PATCH : mise à jour partielle (cin / date_cin uniquement) ─────────────────
function patch($id, array $user) {
    if (!$id) jsonError('ID requis');
    $body = getBody();
    $db   = getDB();
    $cin     = array_key_exists('cin', $body)     ? ($body['cin'] ?: null)     : false;
    $dateCin = array_key_exists('dateCin', $body) ? ($body['dateCin'] ?: null) : false;
    if ($cin === false && $dateCin === false) jsonError('Aucun champ à mettre à jour');

    // Tenter avec les deux colonnes
    $sets = []; $params = [];
    if ($cin !== false)     { $sets[] = 'cin=?';      $params[] = $cin; }
    if ($dateCin !== false) { $sets[] = 'date_cin=?'; $params[] = $dateCin; }
    $sets[] = 'modifie_par=?'; $params[] = $user['name'];
    $params[] = $id;

    try {
        $db->prepare('UPDATE CA_clients SET ' . implode(', ', $sets) . ' WHERE id=?')->execute($params);
    } catch (\PDOException $e) {
        if ($e->getCode() === '42S22' || strpos($e->getMessage(), 'Unknown column') !== false) {
            // Colonnes cin/date_cin absentes : migration non encore exécutée
            // Retourner un succès partiel pour ne pas bloquer l'UX
            jsonOk(['id' => $id, 'notice' => 'Colonnes cin/date_cin absentes — exécutez la migration SQL']);
        }
        jsonError('Erreur mise à jour CIN : ' . $e->getMessage(), 500);
    }
    getOne($id);
}

function remove($id, array $user) {
    if (!$id) jsonError('ID requis');
    if (($user['role'] ?? '') !== 'admin') jsonError('Admin requis', 403);
    getDB()->prepare('DELETE FROM CA_clients WHERE id = ?')->execute([$id]);
    getDB()->prepare('DELETE FROM CA_clients_contacts_aux WHERE client_id = ?')->execute([$id]);
    jsonOk(['deleted' => $id]);
}

function getContactsAux(string $clientId) {
    $stmt = getDB()->prepare('SELECT prenom, nom, email, tel FROM CA_clients_contacts_aux WHERE client_id = ?');
    $stmt->execute([$clientId]);
    return $stmt->fetchAll();
}

function saveContactsAux(string $clientId, array $contacts) {
    $db = getDB();
    $db->prepare('DELETE FROM CA_clients_contacts_aux WHERE client_id = ?')->execute([$clientId]);
    $stmt = $db->prepare('INSERT INTO CA_clients_contacts_aux (client_id, prenom, nom, email, tel) VALUES (?,?,?,?,?)');
    foreach ($contacts as $c) {
        if (!empty($c['nom']) || !empty($c['email'])) {
            $stmt->execute([$clientId, $c['prenom'] ?? '', $c['nom'] ?? '', $c['email'] ?? '', $c['tel'] ?? '']);
        }
    }
}
