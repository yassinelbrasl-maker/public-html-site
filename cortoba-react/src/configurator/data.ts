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
