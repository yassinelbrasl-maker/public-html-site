<?php
// ============================================================
//  CORTOBA ATELIER — Seedeur Projets & Clients Archivés
//  Usage : /cortoba-plateforme/tools/seed_archives.php?key=CAS_SEED_2026
//  Exécuter UNE SEULE FOIS — supprimer après usage
// ============================================================

define('SEED_KEY', 'CAS_SEED_2026');
$isCli = (php_sapi_name() === 'cli');
if (!$isCli && ($_GET['key'] ?? '') !== SEED_KEY) {
    http_response_code(403);
    die(json_encode(['error' => 'Accès refusé']));
}

require_once __DIR__ . '/../config/db.php';

// ────────────────────────────────────────────────────────────
//  DONNÉES — chaque entrée = 1 projet (et 1 client si nouveau)
//  clientKey : clé de déduplication client (même personne = même clé)
//  num       : numéro du projet (les XX reçoivent un numéro assigné)
//  code3     : code 3 lettres du projet
//  folder    : nom exact du dossier NAS existant
//  nom/prenom: pour type physique | raison: pour type morale
// ────────────────────────────────────────────────────────────
$projects = [

    // ══════════ 2026 ══════════
    ['num'=>'01','year'=>2026,'code3'=>'GLM','folder'=>'01_26_GLM_GUELLALI MOEZ',             'type'=>'physique','nom'=>'GUELLALI',        'prenom'=>'MOEZ'],
    ['num'=>'02','year'=>2026,'code3'=>'JBK','folder'=>'02_26_JBK_JIBEHI KHALED',              'type'=>'physique','nom'=>'JIBEHI',          'prenom'=>'KHALED'],
    ['num'=>'03','year'=>2026,'code3'=>'ORW','folder'=>'03_26_ORW_OUERIEMMI WALID',             'type'=>'physique','nom'=>'OUERIEMMI',       'prenom'=>'WALID'],
    ['num'=>'04','year'=>2026,'code3'=>'MES','folder'=>'04-26_MES_MESTIRI SAMIR',               'type'=>'physique','nom'=>'MESTIRI',         'prenom'=>'SAMIR',   'clientKey'=>'mestiri_samir'],
    ['num'=>'05','year'=>2026,'code3'=>'BRA','folder'=>'05_26_BRA_BAROUNI AMIR',                'type'=>'physique','nom'=>'BAROUNI',         'prenom'=>'AMIR'],
    ['num'=>'06','year'=>2026,'code3'=>'SKI','folder'=>'06_26_SKI_SAKAL IDRISS',                'type'=>'physique','nom'=>'SAKAL',           'prenom'=>'IDRISS'],
    ['num'=>'07','year'=>2026,'code3'=>'BLM','folder'=>'07_26_BLM_BELAOUT MONGI',               'type'=>'physique','nom'=>'BELAOUT',         'prenom'=>'MONGI'],
    ['num'=>'08','year'=>2026,'code3'=>'MRI','folder'=>'08_26_MRI_MAAREF ISSAM',                'type'=>'physique','nom'=>'MAAREF',          'prenom'=>'ISSAM'],
    ['num'=>'09','year'=>2026,'code3'=>'BYA','folder'=>'09_26_BYA_BEN YOUNES AMINE',            'type'=>'physique','nom'=>'BEN YOUNES',      'prenom'=>'AMINE'],
    ['num'=>'10','year'=>2026,'code3'=>'CHA','folder'=>'10_26_CHA_AMENI CHLIF',                 'type'=>'physique','nom'=>'AMENI',           'prenom'=>'CHLIF'],

    // ══════════ 2025 ══════════
    ['num'=>'01','year'=>2025,'code3'=>'CHM','folder'=>'01_25_CHM_CHLIF MOHAMED',               'type'=>'physique','nom'=>'CHLIF',           'prenom'=>'MOHAMED'],
    ['num'=>'03','year'=>2025,'code3'=>'ZGM','folder'=>'03_25_ZGM_ZAGHDIDI MOUNIR',              'type'=>'physique','nom'=>'ZAGHDIDI',        'prenom'=>'MOUNIR'],
    ['num'=>'04','year'=>2025,'code3'=>'AZH','folder'=>'04_25_AZH_AZZABI HICHEM',                'type'=>'physique','nom'=>'AZZABI',          'prenom'=>'HICHEM'],
    ['num'=>'06','year'=>2025,'code3'=>'TBN','folder'=>'06_25_TBN_TAIEB NABIL',                  'type'=>'physique','nom'=>'TAIEB',           'prenom'=>'NABIL'],
    ['num'=>'07','year'=>2025,'code3'=>'BSF','folder'=>'07_25_BSF_BEN SALEM FAWZI',              'type'=>'physique','nom'=>'BEN SALEM',       'prenom'=>'FAWZI'],
    ['num'=>'08','year'=>2025,'code3'=>'CHI','folder'=>'08_25_CHI_CHABBAR IMED',                 'type'=>'physique','nom'=>'CHABBAR',         'prenom'=>'IMED'],
    ['num'=>'09','year'=>2025,'code3'=>'BZA','folder'=>'09_25_BZA_BOUZIRI ALI',                  'type'=>'physique','nom'=>'BOUZIRI',         'prenom'=>'ALI'],
    ['num'=>'10','year'=>2025,'code3'=>'ONL','folder'=>'10_25_ONL_OUENNICH LILIA',               'type'=>'physique','nom'=>'OUENNICH',        'prenom'=>'LILIA'],
    ['num'=>'11','year'=>2025,'code3'=>'BOA','folder'=>'11_25_BOA_BEN OMRANE AHLEM',             'type'=>'physique','nom'=>'BEN OMRANE',      'prenom'=>'AHLEM'],
    ['num'=>'12','year'=>2025,'code3'=>'ABB','folder'=>'12_25_ABB_ABICHOU BOCHRA',               'type'=>'physique','nom'=>'ABICHOU',         'prenom'=>'BOCHRA'],
    ['num'=>'13','year'=>2025,'code3'=>'SFF','folder'=>'13_25_SFF_SAFRAOUI FAYCAL',              'type'=>'physique','nom'=>'SAFRAOUI',        'prenom'=>'FAYCAL',  'clientKey'=>'safraoui_faycal'],
    ['num'=>'14','year'=>2025,'code3'=>'MSS','folder'=>'14_25_MSS_MESTIRI SAMIR',                'type'=>'physique','nom'=>'MESTIRI',         'prenom'=>'SAMIR',   'clientKey'=>'mestiri_samir'],
    ['num'=>'15','year'=>2025,'code3'=>'BGT','folder'=>'15_25_BGT_BOUGHZOU TAREK',               'type'=>'physique','nom'=>'BOUGHZOU',        'prenom'=>'TAREK'],
    ['num'=>'16','year'=>2025,'code3'=>'KOC','folder'=>'16_25_KOC_KORTOBBA CHEDLY',              'type'=>'physique','nom'=>'KORTOBBA',        'prenom'=>'CHEDLY'],
    ['num'=>'17','year'=>2025,'code3'=>'BCA','folder'=>'17_25_BCA_BOUCHAMIA AMANI',              'type'=>'physique','nom'=>'BOUCHAMIA',       'prenom'=>'AMANI'],
    ['num'=>'18','year'=>2025,'code3'=>'MHS','folder'=>'18_25_MHS_MHIRI SONIA',                  'type'=>'physique','nom'=>'MHIRI',           'prenom'=>'SONIA'],
    ['num'=>'19','year'=>2025,'code3'=>'KAS','folder'=>'19_25_KAS_GABON',                        'type'=>'morale', 'raison'=>'GABON'],
    ['num'=>'20','year'=>2025,'code3'=>'BTM','folder'=>'20_25_BTM_FRANCE',                       'type'=>'morale', 'raison'=>'FRANCE'],
    ['num'=>'21','year'=>2025,'code3'=>'MBT','folder'=>'21_25_MBT_MBAREK THARWAT',               'type'=>'physique','nom'=>'MBAREK',          'prenom'=>'THARWAT'],
    ['num'=>'22','year'=>2025,'code3'=>'MSA','folder'=>'22_25_MSA_MESTIRI ANIS',                 'type'=>'physique','nom'=>'MESTIRI',         'prenom'=>'ANIS'],
    ['num'=>'23','year'=>2025,'code3'=>'ESZ','folder'=>'23_25_ESZ_ESSAFI ZIED',                  'type'=>'physique','nom'=>'ESSAFI',          'prenom'=>'ZIED'],
    ['num'=>'24','year'=>2025,'code3'=>'CHS','folder'=>'24_25_CHS_CHAFRADA SARA',                'type'=>'physique','nom'=>'CHAFRADA',        'prenom'=>'SARA'],
    ['num'=>'25','year'=>2025,'code3'=>'AJN','folder'=>'25_25_AJN_AJROUDI NACEUR',               'type'=>'physique','nom'=>'AJROUDI',         'prenom'=>'NACEUR'],
    ['num'=>'26','year'=>2025,'code3'=>'LCH','folder'=>'26_25_LCH_LINCOLN HOTEL',                'type'=>'morale', 'raison'=>'LINCOLN HOTEL'],
    ['num'=>'28','year'=>2025,'code3'=>'SLM','folder'=>'28_25_SLM_SYLVAIN MACE',                 'type'=>'physique','nom'=>'MACE',            'prenom'=>'SYLVAIN'],
    ['num'=>'29','year'=>2025,'code3'=>'AZF','folder'=>'29_25_AZF_AZZABI FOUED',                 'type'=>'physique','nom'=>'AZZABI',          'prenom'=>'FOUED'],
    ['num'=>'30','year'=>2025,'code3'=>'BYH','folder'=>'30_25_BYH_BEN YAHIATEN HEDI',            'type'=>'physique','nom'=>'BEN YAHIATEN',    'prenom'=>'HEDI'],
    ['num'=>'31','year'=>2025,'code3'=>'ASM','folder'=>'31_25_ASM_ASSADI MUSTAPHA',              'type'=>'physique','nom'=>'ASSADI',          'prenom'=>'MUSTAPHA'],
    ['num'=>'32','year'=>2025,'code3'=>'ALM','folder'=>'32_25_ALM_ALI MONTASSAR',                'type'=>'physique','nom'=>'ALI',             'prenom'=>'MONTASSAR'],
    ['num'=>'33','year'=>2025,'code3'=>'TRM','folder'=>'33_25_TRM_TRIKI',                        'type'=>'physique','nom'=>'TRIKI',           'prenom'=>''],
    ['num'=>'34','year'=>2025,'code3'=>'LZS','folder'=>'34_25_LZS_LAZHAR SALIM',                 'type'=>'physique','nom'=>'LAZHAR',          'prenom'=>'SALIM'],
    ['num'=>'35','year'=>2025,'code3'=>'ZRT','folder'=>'35_25_ZRT_ZERZERI TAOUFIK',              'type'=>'physique','nom'=>'ZERZERI',         'prenom'=>'TAOUFIK'],
    ['num'=>'36','year'=>2025,'code3'=>'AWS','folder'=>'36_25_AWS_ATLAS WORKING SPACE',          'type'=>'morale', 'raison'=>'ATLAS WORKING SPACE'],
    ['num'=>'37','year'=>2025,'code3'=>'THN','folder'=>'37_25_THN_THAMMOUNI NAJIBA',             'type'=>'physique','nom'=>'THAMMOUNI',       'prenom'=>'NAJIBA'],
    ['num'=>'38','year'=>2025,'code3'=>'HBM','folder'=>'38_25_HBM_MOSQUEE HADHER BECH',          'type'=>'morale', 'raison'=>'MOSQUEE HADHER BECH'],
    ['num'=>'38','year'=>2025,'code3'=>'MRH','folder'=>'38_25_MRH_MRABET HABIB',                 'type'=>'physique','nom'=>'MRABET',          'prenom'=>'HABIB'],
    ['num'=>'39','year'=>2025,'code3'=>'HNS','folder'=>'39_25_HBM_HERNISSI HAIKEL',              'type'=>'physique','nom'=>'HERNISSI',        'prenom'=>'HAIKEL'],
    ['num'=>'40','year'=>2025,'code3'=>'ONH','folder'=>'40_25_ONH_OUENNICH HAIKEL',              'type'=>'physique','nom'=>'OUENNICH',        'prenom'=>'HAIKEL'],
    ['num'=>'41','year'=>2025,'code3'=>'AAJ','folder'=>'41_25_AAJ_ASSOCIATION DES ARCHITECTES DE JERBA', 'type'=>'morale','raison'=>'ASSOCIATION DES ARCHITECTES DE JERBA'],
    ['num'=>'42','year'=>2025,'code3'=>'BZK','folder'=>'42_25_BZK_BAAZIZ KAMEL',                 'type'=>'physique','nom'=>'BAAZIZ',          'prenom'=>'KAMEL'],
    ['num'=>'43','year'=>2025,'code3'=>'LZM','folder'=>'43_25_LZM_LOULIZI MOEZ',                 'type'=>'physique','nom'=>'LOULIZI',         'prenom'=>'MOEZ'],
    ['num'=>'44','year'=>2025,'code3'=>'MLS','folder'=>'44_25_MLS_MILEDI SALEM',                 'type'=>'physique','nom'=>'MILEDI',          'prenom'=>'SALEM'],
    ['num'=>'45','year'=>2025,'code3'=>'BLA','folder'=>'45_25_BLA_BELTAIEF AHLEM',               'type'=>'physique','nom'=>'BELTAIEF',        'prenom'=>'AHLEM'],
    ['num'=>'46','year'=>2025,'code3'=>'HAH','folder'=>'46_25_HAH_HENCHIRI HASSEN',              'type'=>'physique','nom'=>'HENCHIRI',        'prenom'=>'HASSEN'],
    ['num'=>'47','year'=>2025,'code3'=>'TBA','folder'=>'XX_25_TABLE BUREAU AMAL',               'type'=>'morale', 'raison'=>'TABLE BUREAU AMAL'],

    // ══════════ 2024 ══════════
    ['num'=>'01','year'=>2024,'code3'=>'NFR','folder'=>'01_24_NFR_NOURI FRERES',                 'type'=>'morale', 'raison'=>'NOURI FRERES',  'clientKey'=>'nouri_freres'],
    ['num'=>'02','year'=>2024,'code3'=>'IMD','folder'=>'02_24_IMD_SAIDI IMAD',                   'type'=>'physique','nom'=>'SAIDI',           'prenom'=>'IMAD'],
    ['num'=>'03','year'=>2024,'code3'=>'BYA','folder'=>'03_24_BYA_BELHADJ YAHYA ABDERRAHMAN',    'type'=>'physique','nom'=>'BELHADJ YAHYA',   'prenom'=>'ABDERRAHMAN'],
    ['num'=>'04','year'=>2024,'code3'=>'HWF','folder'=>'04_24_HWF_HADDAD WAFA',                  'type'=>'physique','nom'=>'HADDAD',          'prenom'=>'WAFA'],
    ['num'=>'05','year'=>2024,'code3'=>'BOW','folder'=>'05_24_BOW_BEN OMRANE WISSEM',             'type'=>'physique','nom'=>'BEN OMRANE',      'prenom'=>'WISSEM'],
    ['num'=>'12','year'=>2024,'code3'=>'SBS','folder'=>'12_24_SBS_BELHIBA SCHMIDT SARA',          'type'=>'physique','nom'=>'BELHIBA SCHMIDT', 'prenom'=>'SARA'],
    ['num'=>'13','year'=>2024,'code3'=>'ZFR','folder'=>'13_24_ZFR_ZOUARI FRERES',                 'type'=>'morale', 'raison'=>'ZOUARI FRERES'],
    ['num'=>'14','year'=>2024,'code3'=>'AYM','folder'=>'14_24_AYM_AYEYDA MED ALI',                'type'=>'physique','nom'=>'AYEYDA',          'prenom'=>'MED ALI'],
    ['num'=>'16','year'=>2024,'code3'=>'SKI','folder'=>'16_24_SKI_SAKAL IMAD',                    'type'=>'physique','nom'=>'SAKAL',           'prenom'=>'IMAD'],
    ['num'=>'19','year'=>2024,'code3'=>'BKA','folder'=>'19_24_BKA_BOURKHIS AHMED',                'type'=>'physique','nom'=>'BOURKHIS',        'prenom'=>'AHMED'],
    ['num'=>'22','year'=>2024,'code3'=>'ARS','folder'=>'22_24_ARS_SAFRAOUI AROUSSI',              'type'=>'physique','nom'=>'SAFRAOUI',        'prenom'=>'AROUSSI'],
    ['num'=>'23','year'=>2024,'code3'=>'CAT','folder'=>'23_24_CAT_ADOUNI CATHERINE',              'type'=>'physique','nom'=>'ADOUNI',          'prenom'=>'CATHERINE'],
    ['num'=>'25','year'=>2024,'code3'=>'BMM','folder'=>'25_24_BMM_BEN MECHICHI MALEK',            'type'=>'physique','nom'=>'BEN MECHICHI',    'prenom'=>'MALEK'],
    ['num'=>'25','year'=>2024,'code3'=>'SMS','folder'=>'25_24_SMS_SMIDA SABRINE',                 'type'=>'physique','nom'=>'SMIDA',           'prenom'=>'SABRINE'],
    ['num'=>'33','year'=>2024,'code3'=>'KBT','folder'=>'33_24_KBT_KBESS TAHER',                   'type'=>'physique','nom'=>'KBESS',           'prenom'=>'TAHER'],
    ['num'=>'34','year'=>2024,'code3'=>'BKA','folder'=>'34_24_BKA_BELKAHLA ANIS',                 'type'=>'physique','nom'=>'BELKAHLA',        'prenom'=>'ANIS'],
    // XX 2024 → numéros 35–45
    ['num'=>'35','year'=>2024,'code3'=>'BRM','folder'=>'XX_24_BRM_BEN RACHECHE MARWA',            'type'=>'physique','nom'=>'BEN RACHECHE',    'prenom'=>'MARWA'],
    ['num'=>'36','year'=>2024,'code3'=>'BRS','folder'=>'XX_24_BRS_BOURKHIS SASSI',                'type'=>'physique','nom'=>'BOURKHIS',        'prenom'=>'SASSI'],
    ['num'=>'37','year'=>2024,'code3'=>'BSF','folder'=>'XX_24_BSF_BEN SALEM FAOUZI',              'type'=>'physique','nom'=>'BEN SALEM',       'prenom'=>'FAOUZI'],
    ['num'=>'38','year'=>2024,'code3'=>'BYS','folder'=>'XX_24_BYS_BEN YOUSSEF SALIM',             'type'=>'physique','nom'=>'BEN YOUSSEF',     'prenom'=>'SALIM'],
    ['num'=>'39','year'=>2024,'code3'=>'CHA','folder'=>'XX_24_CHA_CHELBA ABDALLAH',               'type'=>'physique','nom'=>'CHELBA',          'prenom'=>'ABDALLAH'],
    ['num'=>'40','year'=>2024,'code3'=>'JLY','folder'=>'XX_24_JLY_JLIDI YOUSSEF',                 'type'=>'physique','nom'=>'JLIDI',           'prenom'=>'YOUSSEF'],
    ['num'=>'41','year'=>2024,'code3'=>'LGA','folder'=>'XX_24_LGA_LAGHOUANE ASMA',                'type'=>'physique','nom'=>'LAGHOUANE',       'prenom'=>'ASMA'],
    ['num'=>'42','year'=>2024,'code3'=>'MBH','folder'=>'XX_24_MBH_MBAREK HEDI',                   'type'=>'physique','nom'=>'MBAREK',          'prenom'=>'HEDI'],
    ['num'=>'43','year'=>2024,'code3'=>'MGA','folder'=>'XX_24_MGA_MAGOURI AMOR',                  'type'=>'physique','nom'=>'MAGOURI',         'prenom'=>'AMOR'],
    ['num'=>'44','year'=>2024,'code3'=>'MZO','folder'=>'XX_24_MZO_MAZOUZ OUSSAMA',                'type'=>'physique','nom'=>'MAZOUZ',          'prenom'=>'OUSSAMA'],
    ['num'=>'45','year'=>2024,'code3'=>'RBJ','folder'=>'XX_24_RBJ_REBAI JIHED',                   'type'=>'physique','nom'=>'REBAI',           'prenom'=>'JIHED'],

    // ══════════ 2023 ══════════
    ['num'=>'01','year'=>2023,'code3'=>'BMA','folder'=>'01_23_BMA_BEN MANSOUR AMANI',             'type'=>'physique','nom'=>'BEN MANSOUR',     'prenom'=>'AMANI'],
    ['num'=>'02','year'=>2023,'code3'=>'BRH','folder'=>'02_23_BRH_BARBOUCH HASSEN',               'type'=>'physique','nom'=>'BARBOUCH',        'prenom'=>'HASSEN'],
    ['num'=>'03','year'=>2023,'code3'=>'KDH','folder'=>'03_23_KDH_DHIF KAMEL',                    'type'=>'physique','nom'=>'DHIF',            'prenom'=>'KAMEL'],
    ['num'=>'04','year'=>2023,'code3'=>'KAK','folder'=>'04_23_KAK_KHLIFI ABOU ELKACEM',           'type'=>'physique','nom'=>'KHLIFI',          'prenom'=>'ABOU ELKACEM'],
    ['num'=>'05','year'=>2023,'code3'=>'BS', 'folder'=>'05_23_BS_BASROUR MALEK',                  'type'=>'physique','nom'=>'BASROUR',         'prenom'=>'MALEK'],
    ['num'=>'07','year'=>2023,'code3'=>'LKC','folder'=>'07_23_LKC_LOURIMI KHALED',                'type'=>'physique','nom'=>'LOURIMI',         'prenom'=>'KHALED'],
    ['num'=>'08','year'=>2023,'code3'=>'HDK','folder'=>'08_23_HDK_HADDEJI KAIS',                  'type'=>'physique','nom'=>'HADDEJI',         'prenom'=>'KAIS'],
    ['num'=>'10','year'=>2023,'code3'=>'BYR','folder'=>'10_23_BYR_BEN YOUNES RAOUF',              'type'=>'physique','nom'=>'BEN YOUNES',      'prenom'=>'RAOUF'],
    ['num'=>'12','year'=>2023,'code3'=>'KSF','folder'=>'12_23_KSF_KOUKEN SOFIENE',                'type'=>'physique','nom'=>'KOUKEN',          'prenom'=>'SOFIENE'],
    ['num'=>'13','year'=>2023,'code3'=>'FRT','folder'=>'13_23_FRT_YAGOUBI FARID',                 'type'=>'physique','nom'=>'YAGOUBI',         'prenom'=>'FARID'],
    ['num'=>'14','year'=>2023,'code3'=>'CHM','folder'=>'14_23_CHM_MEDJEKANE CHAABAN',             'type'=>'physique','nom'=>'MEDJEKANE',       'prenom'=>'CHAABAN'],
    ['num'=>'15','year'=>2023,'code3'=>'LYB','folder'=>'15_23_LYB_LEREFAIT LYNDA',                'type'=>'physique','nom'=>'LEREFAIT',        'prenom'=>'LYNDA'],
    ['num'=>'16','year'=>2023,'code3'=>'BKK','folder'=>'16_23_BKK_BEN KHEMISS KHALIL',            'type'=>'physique','nom'=>'BEN KHEMISS',     'prenom'=>'KHALIL'],
    ['num'=>'17','year'=>2023,'code3'=>'RBD','folder'=>'17_23_RBD_REBAOUI DALILA ET LAZHER',      'type'=>'morale', 'raison'=>'REBAOUI DALILA ET LAZHER'],
    ['num'=>'18','year'=>2023,'code3'=>'BDB','folder'=>'18_23_BDB_BEN DAADOUCH BILEL',            'type'=>'physique','nom'=>'BEN DAADOUCH',    'prenom'=>'BILEL'],
    ['num'=>'19','year'=>2023,'code3'=>'ZRK','folder'=>'19_23_ZRK_ZOUARI KAMEL',                  'type'=>'physique','nom'=>'ZOUARI',          'prenom'=>'KAMEL'],
    ['num'=>'20','year'=>2023,'code3'=>'BYS','folder'=>'20_23_BYS_BEN YAHIATEN SAMI',             'type'=>'physique','nom'=>'BEN YAHIATEN',    'prenom'=>'SAMI'],
    // XX 2023 → numéros 21–30
    ['num'=>'21','year'=>2023,'code3'=>'ASI','folder'=>'XX_23_ASI_ASKRI IMEN',                    'type'=>'physique','nom'=>'ASKRI',           'prenom'=>'IMEN'],
    ['num'=>'22','year'=>2023,'code3'=>'AZF','folder'=>'XX_23_AZF_AZZABI FERDAOUS',               'type'=>'physique','nom'=>'AZZABI',          'prenom'=>'FERDAOUS'],
    ['num'=>'23','year'=>2023,'code3'=>'BJJ','folder'=>'XX_23_BJJ_BEN JEMAA AHMED JAMEL',         'type'=>'physique','nom'=>'BEN JEMAA',       'prenom'=>'AHMED JAMEL'],
    ['num'=>'24','year'=>2023,'code3'=>'CHS','folder'=>'XX_23_CHS_CHOUROU SAMI',                  'type'=>'physique','nom'=>'CHOUROU',         'prenom'=>'SAMI'],
    ['num'=>'25','year'=>2023,'code3'=>'FKA','folder'=>'XX_23_FKA_FEKI AMELIE',                   'type'=>'physique','nom'=>'FEKI',            'prenom'=>'AMELIE'],
    ['num'=>'26','year'=>2023,'code3'=>'HDM','folder'=>'XX_23_HDM_HADDAJI MOUNIRA',               'type'=>'physique','nom'=>'HADDAJI',         'prenom'=>'MOUNIRA'],
    ['num'=>'27','year'=>2023,'code3'=>'NMK','folder'=>'XX_23_NMK_NEMSI KARIM',                   'type'=>'physique','nom'=>'NEMSI',           'prenom'=>'KARIM'],
    ['num'=>'28','year'=>2023,'code3'=>'NRF','folder'=>'XX_23_NRF_NOURI FRERES',                  'type'=>'morale', 'raison'=>'NOURI FRERES',  'clientKey'=>'nouri_freres'],
    ['num'=>'29','year'=>2023,'code3'=>'OMD','folder'=>'XX_23_OMD_OMRI DALI',                     'type'=>'physique','nom'=>'OMRI',            'prenom'=>'DALI'],
    ['num'=>'30','year'=>2023,'code3'=>'SAF','folder'=>'XX_23_SAFRAOU FAYCAL',                    'type'=>'physique','nom'=>'SAFRAOUI',        'prenom'=>'FAYCAL',  'clientKey'=>'safraoui_faycal'],
];

// ────────────────────────────────────────────────────────────
//  HELPERS
// ────────────────────────────────────────────────────────────
function displayNom(array $p): string {
    if ($p['type'] === 'morale') return $p['raison'];
    $n = trim(($p['nom'] ?? '') . ' ' . ($p['prenom'] ?? ''));
    return $n ?: ($p['raison'] ?? '');
}

function clientKey(array $p): string {
    return $p['clientKey'] ?? strtolower(str_replace(' ', '_', displayNom($p)));
}

// ────────────────────────────────────────────────────────────
//  EXÉCUTION
// ────────────────────────────────────────────────────────────
$db = getDB();

// Récupérer le prochain num_client disponible
$stmt = $db->query('SELECT COALESCE(MAX(num_client), 0) AS mx FROM CA_clients');
$nextNumClient = (int)$stmt->fetchColumn() + 1;

$clientsCreated  = [];
$clientsExisting = [];
$projetsCreated  = [];
$projetsSkipped  = [];
$errors          = [];

// Index des clients déjà créés dans cette session (clientKey → ['id', 'code', 'display_nom'])
$clientsIndex = [];

// ── PHASE 1 : Clients ──────────────────────────────────────
foreach ($projects as $p) {
    $ck = clientKey($p);
    if (isset($clientsIndex[$ck])) continue; // déjà traité

    $displayNom = displayNom($p);

    // Vérifier si le client existe déjà en DB (par display_nom)
    $stmt = $db->prepare('SELECT id, code FROM CA_clients WHERE display_nom = ? LIMIT 1');
    $stmt->execute([$displayNom]);
    $existing = $stmt->fetch();

    if ($existing) {
        $clientsIndex[$ck] = ['id' => $existing['id'], 'code' => $existing['code'], 'display_nom' => $displayNom];
        $clientsExisting[]  = $displayNom;
        // Mettre à jour le compteur projets
        $db->prepare('UPDATE CA_clients SET projets = projets + 0 WHERE id = ?')->execute([$existing['id']]);
        continue;
    }

    // Créer le client
    $clientId   = bin2hex(random_bytes(16));
    $clientCode = $p['code3'];

    try {
        $db->prepare('
            INSERT INTO CA_clients
                (id, code, num_client, type, prenom, nom, raison, display_nom, statut, cree_par)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        ')->execute([
            $clientId,
            $clientCode,
            $nextNumClient++,
            $p['type'],
            $p['type'] === 'physique' ? ($p['prenom'] ?? null)  : null,
            $p['type'] === 'physique' ? ($p['nom']    ?? null)  : null,
            $p['type'] === 'morale'   ? ($p['raison'] ?? null)  : null,
            $displayNom,
            'Client',
            'seed_archives',
        ]);
        $clientsIndex[$ck] = ['id' => $clientId, 'code' => $clientCode, 'display_nom' => $displayNom];
        $clientsCreated[]   = $displayNom;
    } catch (\Throwable $e) {
        $errors[] = "Client [$displayNom] : " . $e->getMessage();
    }
}

// ── PHASE 2 : Projets ─────────────────────────────────────
foreach ($projects as $p) {
    $ck         = clientKey($p);
    $client     = $clientsIndex[$ck] ?? null;
    $displayNom = displayNom($p);

    $yy         = substr((string)$p['year'], -2);
    $projetCode = str_pad($p['num'], 2, '0', STR_PAD_LEFT) . '_' . $yy . '_' . $p['code3'];

    // Vérifier si le projet existe déjà (par code)
    $stmt = $db->prepare('SELECT id FROM CA_projets WHERE code = ? LIMIT 1');
    $stmt->execute([$projetCode]);
    if ($stmt->fetch()) {
        $projetsSkipped[] = $projetCode . ' (' . $displayNom . ')';
        continue;
    }

    $projetId = bin2hex(random_bytes(16));

    try {
        $db->prepare('
            INSERT INTO CA_projets
                (id, code, nom, client, client_code, annee, phase, statut, cree_par)
            VALUES (?,?,?,?,?,?,?,?,?)
        ')->execute([
            $projetId,
            $projetCode,
            $displayNom,
            $displayNom,
            $client ? $client['code'] : $p['code3'],
            $p['year'],
            'APS',
            'Actif',
            'seed_archives',
        ]);

        // Incrémenter compteur projets du client
        if ($client) {
            $db->prepare('UPDATE CA_clients SET projets = projets + 1 WHERE id = ?')
               ->execute([$client['id']]);
        }

        $projetsCreated[] = $projetCode . ' — ' . $displayNom;
    } catch (\Throwable $e) {
        $errors[] = "Projet [$projetCode] : " . $e->getMessage();
    }
}

// ── RAPPORT ───────────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'success'           => empty($errors),
    'clients_created'   => $clientsCreated,
    'clients_existing'  => $clientsExisting,
    'projets_created'   => $projetsCreated,
    'projets_skipped'   => $projetsSkipped,
    'errors'            => $errors,
    'stats' => [
        'clients_new'      => count($clientsCreated),
        'clients_existing' => count($clientsExisting),
        'projets_created'  => count($projetsCreated),
        'projets_skipped'  => count($projetsSkipped),
        'errors'           => count($errors),
    ],
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
