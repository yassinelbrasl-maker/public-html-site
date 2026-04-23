/**
 * Constantes d'options du configurateur — portage direct des données du
 * legacy configurateur.html (CFG_TYPES_BATIMENT_DEFAULT, etc.).
 */

export interface TypeSubtype {
  id: string;
  label: string;
  icon: string;
}

export interface TypeGroup {
  id: string; // 'logement' | 'immeuble'
  label: string;
  icon: string;
  subtypes: TypeSubtype[];
}

export const TYPES_BATIMENT: TypeGroup[] = [
  {
    id: "logement",
    label: "Logement",
    icon: "🏠",
    subtypes: [
      { id: "individuel", label: "Individuel", icon: "🏡" },
      { id: "collectif", label: "Collectif", icon: "🏘️" },
    ],
  },
  {
    id: "immeuble",
    label: "Immeuble",
    icon: "🏢",
    subtypes: [
      { id: "residentiel", label: "Résidentiel", icon: "🏠" },
      { id: "commercial", label: "Commercial", icon: "🏪" },
      { id: "bureautique", label: "Bureautique", icon: "💼" },
      { id: "mixte", label: "Mixte", icon: "🔀" },
    ],
  },
];

export interface OperationOption {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
}

export const OPERATIONS: OperationOption[] = [
  {
    id: "neuf",
    icon: "🏗️",
    title: "Nouvelle construction",
    subtitle: "Construire de zéro sur terrain nu",
  },
  {
    id: "reamenagement",
    icon: "🔧",
    title: "Réaménagement",
    subtitle: "Rénover ou transformer l'existant",
  },
  {
    id: "extension",
    icon: "📐",
    title: "Extension",
    subtitle: "Agrandir ou surélever un bâtiment existant",
  },
];

export const TERRAIN_NATURES: OperationOption[] = [
  {
    id: "urbaine",
    icon: "🏙️",
    title: "Zone urbaine",
    subtitle: "Terrain constructible en ville ou périphérie",
  },
  {
    id: "agricole",
    icon: "🌾",
    title: "Zone agricole",
    subtitle: "Terrain en milieu rural ou agricole",
  },
  {
    id: "inconnu",
    icon: "❓",
    title: "Je ne sais pas",
    subtitle: "Nous vérifierons ensemble",
  },
];

export interface StyleOption {
  id: string;
  title: string;
  desc: string;
  photos: string[];
}

export const STYLES: StyleOption[] = [
  {
    id: "contemporain",
    title: "Contemporain",
    desc: "Toit plat, grandes baies vitrées, lignes épurées",
    photos: [
      "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=300&q=60",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=300&q=60",
      "https://images.unsplash.com/photo-1586105449897-20b5efeb3233?w=300&q=60",
    ],
  },
  {
    id: "traditionnel",
    title: "Traditionnel / Méditerranéen",
    desc: "Toit en pente, tuiles, charme intemporel",
    photos: [
      "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=300&q=60",
      "https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=300&q=60",
      "https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?w=300&q=60",
    ],
  },
  {
    id: "industriel",
    title: "Industriel / Loft",
    desc: "Acier, béton brut, verrière, esprit urbain",
    photos: [
      "https://images.unsplash.com/photo-1565182999561-18d7dc61c393?w=300&q=60",
      "https://images.unsplash.com/photo-1503174971373-b1f69850bded?w=300&q=60",
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&q=60",
    ],
  },
  {
    id: "bioclimatique",
    title: "Bioclimatique / Bois",
    desc: "Matériaux naturels, performance énergétique, HQE",
    photos: [
      "https://images.unsplash.com/photo-1558980394-0a06c4631733?w=300&q=60",
      "https://images.unsplash.com/photo-1629140727571-9b5c6f6267b4?w=300&q=60",
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=300&q=60",
    ],
  },
];

export interface StandingOption {
  id: string;
  icon: string;
  title: string;
  blurb: string;
  tooltip: string;
}

// ─── MISSIONS (catégories + missions par défaut — portage direct du legacy) ───

export interface MissionCat {
  id: string;
  label: string;
}
export interface Mission {
  id: string;
  cat: string;
  nom: string;
}

export const MISSION_CATEGORIES: MissionCat[] = [
  { id: "AI", label: "Assistance immobilière" },
  { id: "EP", label: "Études préliminaires" },
  { id: "CON", label: "Conception architecturale" },
  { id: "EXE", label: "Études d'exécution" },
  { id: "AMO", label: "Assistance à la maîtrise d'ouvrage" },
  { id: "MOD", label: "Maîtrise d'ouvrage déléguée" },
  { id: "3D", label: "Visualisation 3D" },
  { id: "DEC", label: "Décoration & Paysage" },
  { id: "DET", label: "Suivi de chantier" },
  { id: "DIAG", label: "Diagnostic & Expertise" },
];

export const DEFAULT_MISSIONS: Mission[] = [
  { id: "m01", cat: "AI", nom: "Recherche de bien immobilier" },
  { id: "m02", cat: "AI", nom: "Assistance à l'achat immobilier" },
  { id: "m03", cat: "AI", nom: "Visite et expertise de terrain" },
  { id: "m04", cat: "EP", nom: "Relevé architectural (gros œuvres)" },
  { id: "m05", cat: "EP", nom: "Relevé détaillé" },
  { id: "m06", cat: "EP", nom: "Livraison de fichier source" },
  { id: "m07", cat: "EP", nom: "Élaboration de programme" },
  { id: "m08", cat: "EP", nom: "Estimation sommaire (surface & coût)" },
  { id: "m09", cat: "CON", nom: "Avant-projet sommaire (APS)" },
  { id: "m10", cat: "CON", nom: "Avant-projet développé (APD)" },
  { id: "m11", cat: "CON", nom: "Permis de construire" },
  { id: "m12", cat: "EXE", nom: "Dossier d'exécution" },
  { id: "m13", cat: "EXE", nom: "Consultation des ingénieurs" },
  { id: "m14", cat: "EXE", nom: "Coordination des études" },
  { id: "m15", cat: "EXE", nom: "Bordereau des prix" },
  { id: "m16", cat: "AMO", nom: "Assistance à la maîtrise d'ouvrage" },
  { id: "m17", cat: "AMO", nom: "Assistance à la passation de marchés" },
  { id: "m18", cat: "AMO", nom: "Consultation fournisseurs & prestataires" },
  { id: "m19", cat: "AMO", nom: "Étude comparative" },
  { id: "m20", cat: "AMO", nom: "Assistance à l'échantillonnage" },
  { id: "m21", cat: "AMO", nom: "Visite des fournisseurs" },
  { id: "m22", cat: "MOD", nom: "Validation des paiements" },
  { id: "m23", cat: "MOD", nom: "Paiement des prestataires & fournisseurs" },
  { id: "m24", cat: "MOD", nom: "Gestion financière" },
  { id: "m25", cat: "MOD", nom: "Gestion d'approvisionnement" },
  { id: "m26", cat: "MOD", nom: "Gestion des ressources humaines" },
  { id: "m27", cat: "MOD", nom: "Journal de suivi" },
  { id: "m28", cat: "3D", nom: "3D extérieure" },
  { id: "m29", cat: "3D", nom: "3D intérieure" },
  { id: "m30", cat: "3D", nom: "Animation 3D" },
  { id: "m31", cat: "DEC", nom: "Décoration d'intérieur" },
  { id: "m32", cat: "DEC", nom: "Assistance choix ameublement & décoration" },
  { id: "m33", cat: "DEC", nom: "Étude paysagère & aménagement extérieur" },
  { id: "m34", cat: "DEC", nom: "Plan de plantation" },
  { id: "m35", cat: "DEC", nom: "Plan d'arrosage" },
  { id: "m36", cat: "DEC", nom: "Plan d'éclairage" },
  { id: "m37", cat: "DEC", nom: "Choix des palettes végétales" },
  { id: "m38", cat: "DEC", nom: "Rendu 3D paysager" },
  { id: "m39", cat: "DET", nom: "Suivi de chantier" },
  { id: "m40", cat: "DET", nom: "Pilotage" },
  { id: "m41", cat: "DET", nom: "Assistance à la réception des travaux" },
  { id: "m42", cat: "DIAG", nom: "Diagnostic / Expertise" },
];

export const STANDINGS: StandingOption[] = [
  {
    id: "standard",
    icon: "🔑",
    title: "Standard",
    blurb: "Matériaux classiques, normes de base, fonctionnel",
    tooltip:
      "Idéal pour les projets à budget maîtrisé. Comprend : carrelage standard, menuiseries aluminium thermolaqué, plomberie et électricité aux normes, enduit simple-couche, cuisine équipée basique. Finitions soignées mais sans sur-mesure.",
  },
  {
    id: "confort",
    icon: "⭐",
    title: "Confort",
    blurb: "Belles finitions, équipements connectés, isolation renforcée",
    tooltip:
      "Le meilleur rapport qualité/prix. Comprend : faïence premium, menuiseries à rupture de pont thermique, VMC double-flux, volets roulants électriques, cuisine semi-aménagée haut de gamme, parquet flottant ou carrelage grand format, domotique basique.",
  },
  {
    id: "premium",
    icon: "💎",
    title: "Premium / Luxe",
    blurb: "Matériaux nobles, domotique complète, sur-mesure",
    tooltip:
      "Pour les projets d'exception. Comprend : pierres naturelles, bois massif, verrières sur mesure, domotique KNX complète, SPA / hammam, cuisine Bulthaup ou équivalent, menuiseries aluminium laqué mat sur-mesure, éclairage architectural, home cinéma, finitions architecte.",
  },
];
