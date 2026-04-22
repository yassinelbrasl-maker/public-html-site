<?php
// ============================================================
//  CORTOBA ATELIER — Installation (une seule fois)
//  1. Créer la BDD et les tables (via phpMyAdmin avec schema.sql)
//  2. Configurer config/db.php avec vos identifiants cPanel
//  3. Ouvrir ce fichier dans le navigateur : https://votresite.com/install.php
//  4. SUPPRIMER install.php après utilisation (sécurité)
// ============================================================

require_once __DIR__ . '/config/db.php';

header('Content-Type: text/html; charset=utf-8');

// Vérifier si l'admin existe déjà
$db = getDB();
$stmt = $db->prepare('SELECT id FROM CDS_accounts WHERE email = ?');
$stmt->execute([ADMIN_EMAIL]);
if ($stmt->fetch()) {
    echo '<h2>✓ Admin déjà créé</h2><p>Le compte <strong>' . htmlspecialchars(ADMIN_EMAIL) . '</strong> existe déjà. Supprimez ce fichier install.php.</p>';
    exit;
}

// Créer l'admin
$id = bin2hex(random_bytes(16));
$hash = password_hash('Yassine2026', PASSWORD_BCRYPT, ['cost' => 12]);

$db->prepare('INSERT INTO CDS_accounts (id, email, name, role, password, approved) VALUES (?,?,?,?,?,1)')
   ->execute([$id, ADMIN_EMAIL, 'Administrateur Cortoba', 'admin', $hash]);

echo '<h2>✓ Installation terminée</h2>';
echo '<p>Compte administrateur créé :</p>';
echo '<ul>';
echo '<li><strong>Email :</strong> ' . htmlspecialchars(ADMIN_EMAIL) . '</li>';
echo '<li><strong>Mot de passe :</strong> Yassine2026</li>';
echo '</ul>';
echo '<p style="color:#e07b72;font-weight:bold">⚠️ Supprimez ce fichier install.php immédiatement après la première connexion.</p>';
