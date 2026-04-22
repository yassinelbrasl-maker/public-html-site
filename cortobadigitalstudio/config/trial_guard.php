<?php
// ============================================================
//  CORTOBA DIGITAL STUDIO — Trial Guard
//
//  Ce fichier est inclus par chaque config/db.php tenant.
//  Il verifie dans le registre central CDS_clients que :
//    - Le tenant existe
//    - Son statut est 'trial' ou 'active'
//    - La date trial_expires_at n'est pas depassee
//
//  Si la verification echoue, la page affichee bloque tout acces
//  et invite le client a contacter le commerce.
//
//  Optimisation : la verification est mise en cache en session
//  pour eviter une requete BDD a chaque appel API.
// ============================================================

if (!function_exists('trialGuardCheck')) {

    function trialGuardCheck(string $slug): void {
        // Cache de 60 secondes dans un fichier temporaire
        $cacheFile = sys_get_temp_dir() . '/cds_trial_' . preg_replace('/[^a-z0-9_-]/', '', $slug) . '.cache';
        if (is_readable($cacheFile) && (time() - filemtime($cacheFile) < 60)) {
            $cached = @file_get_contents($cacheFile);
            if ($cached === 'ok') return;
            if ($cached === 'expired')  trialGuardBlock($slug, 'expired');
            if ($cached === 'revoked')  trialGuardBlock($slug, 'revoked');
            if ($cached === 'migrated') trialGuardBlock($slug, 'migrated');
            if ($cached === 'missing')  trialGuardBlock($slug, 'missing');
            // Sinon cache invalide, on refait la requete
        }

        try {
            $pdo = getDB();
            $prefix = defined('MASTER_DB_PREFIX') ? MASTER_DB_PREFIX : 'CDS_';
            $stmt = $pdo->prepare("SELECT status, trial_expires_at FROM `{$prefix}tenants` WHERE slug = ? LIMIT 1");
            $stmt->execute([$slug]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            // Si la BDD est injoignable, on laisse passer pour ne pas bloquer en cas d'incident
            // Mais on ne cache pas ce resultat
            return;
        }

        if (!$row) {
            @file_put_contents($cacheFile, 'missing');
            trialGuardBlock($slug, 'missing');
        }

        $status = $row['status'];
        if ($status === 'revoked') {
            @file_put_contents($cacheFile, 'revoked');
            trialGuardBlock($slug, 'revoked');
        }
        if ($status === 'migrated') {
            @file_put_contents($cacheFile, 'migrated');
            trialGuardBlock($slug, 'migrated');
        }

        // Verifier expiration
        $now = new DateTime();
        $expires = new DateTime($row['trial_expires_at']);
        if ($expires < $now && $status === 'trial') {
            @file_put_contents($cacheFile, 'expired');
            trialGuardBlock($slug, 'expired');
        }

        @file_put_contents($cacheFile, 'ok');
    }

    function trialGuardBlock(string $slug, string $reason): void {
        $messages = [
            'expired'  => ['titre' => 'Periode d\'essai terminee',
                           'texte' => 'Votre periode d\'essai de la plateforme Cortoba Digital Studio est arrivee a son terme.'],
            'revoked'  => ['titre' => 'Acces suspendu',
                           'texte' => 'L\'acces a cette instance a ete suspendu.'],
            'migrated' => ['titre' => 'Instance migree',
                           'texte' => 'Cette instance a ete migree vers un nouveau domaine. Cette adresse n\'est plus active.'],
            'missing'  => ['titre' => 'Instance inconnue',
                           'texte' => 'Cette instance n\'est pas enregistree.']
        ];
        $m = $messages[$reason] ?? $messages['missing'];

        // Si c'est un appel API (Content-Type JSON attendu), repondre JSON
        $wantsJson = false;
        if (!empty($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false) {
            $wantsJson = true;
        }
        if (!empty($_SERVER['REQUEST_URI']) && strpos($_SERVER['REQUEST_URI'], '/api/') !== false) {
            $wantsJson = true;
        }

        if ($wantsJson) {
            http_response_code(402); // Payment Required
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'success' => false,
                'error'   => $m['titre'] . ' — ' . $m['texte'],
                'trial_guard' => [
                    'slug'   => $slug,
                    'reason' => $reason
                ]
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        http_response_code(402);
        header('Content-Type: text/html; charset=utf-8');
        $slugEsc = htmlspecialchars($slug);
        $titre   = htmlspecialchars($m['titre']);
        $texte   = htmlspecialchars($m['texte']);
        echo <<<HTML
<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>{$titre}</title>
<style>
  body { font-family:-apple-system,Segoe UI,sans-serif; background:#0e0e0e; color:#e8e8e8;
         padding:60px 20px; max-width:560px; margin:0 auto; text-align:center; line-height:1.6; }
  h1 { color:#c8a96e; font-size:22px; letter-spacing:.1em; text-transform:uppercase;
       border-bottom:1px solid #2a2a2a; padding-bottom:16px; margin-bottom:28px; }
  .box { background:#161616; border:1px solid #2a2a2a; border-radius:6px;
         padding:28px; margin:24px 0; }
  a.cta { display:inline-block; margin-top:24px; padding:12px 24px;
          background:#c8a96e; color:#0e0e0e; text-decoration:none;
          border-radius:4px; font-weight:600; letter-spacing:.05em; }
  p.small { color:#888; font-size:12px; margin-top:32px; }
</style></head><body>
<h1>{$titre}</h1>
<div class="box">
  <p>{$texte}</p>
  <p>Pour prolonger votre essai ou obtenir une version commerciale,
     contactez Cortoba Architecture.</p>
  <a class="cta" href="mailto:cortobaarchitecture@gmail.com?subject=Prolongation essai {$slugEsc}">
    Contacter le commerce
  </a>
</div>
<p class="small">Instance : {$slugEsc} — Statut : {$reason}</p>
</body></html>
HTML;
        exit;
    }
}
