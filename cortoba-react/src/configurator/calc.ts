/**
 * Moteur de calcul simplifié — portage d'une fraction de cfgCalculate() legacy.
 *
 * Note : le legacy a ~250 lignes de règles très détaillées (types d'immeubles,
 * chambres variantes, suites parentales, piscines à débordement, etc.).
 * Ici on porte uniquement les champs qu'on track déjà dans ConfiguratorState
 * (version simplifiée de Step 5). Le legacy reste la référence pour les
 * variantes avancées — à étendre au fil des ports.
 *
 * Contrat : la formule de coût est la même que le legacy, donc les ordres
 * de grandeur affichés au client restent cohérents.
 */
import { ConfiguratorState } from "./state";

// Surfaces moyennes par pièce (m²), pour standing "confort"
// Le legacy lit ces valeurs depuis /api/data.php (cfg_surfaces) — ici on met
// des valeurs par défaut. À brancher sur l'API plus tard.
const SURFACES: Record<string, number> = {
  salon: 20,
  sejour: 18,
  entree: 8,
  cuisine_ouverte: 8,
  cuisine_independante: 14,
  cuisine_table: 12,
  sdb: 6,
  chambre_simple: 10,
  chambre_double: 12,
  chambre_double_balcon: 14,
  chambre_suite: 16,
  suite_parentale_dressing: 30,
  suite_parentale_placard: 26,
  bureau: 12,
  sport: 20,
  buanderie: 6,
  cellier: 6,
  garage: 20,
  piscine: 35,
  jardin: 0,
};

// Coût par m² en € selon le standing (base "contemporain")
const COST_PER_M2: Record<string, number> = {
  standard: 1800,
  confort: 2400,
  premium: 3600,
};

// Multiplicateur par type d'opération
const OPERATION_MULT: Record<string, number> = {
  neuf: 1,
  reamenagement: 0.65,
  extension: 0.8,
};

// Coefficient pour les circulations (couloirs, escaliers, cloisons)
const CIRCULATION_COEFF = 1.15;

export interface CalcRoom {
  label: string;
  surface: number;
  external?: boolean;
}

export interface CalcExtra {
  label: string;
  cost: number;
  detail?: string;
}

export interface CalcResult {
  surfaceHabitable: number;
  surfaceCouverte: number;
  rooms: CalcRoom[];
  extras: CalcExtra[];
  villaCostLow: number;
  villaCostHigh: number;
  extrasCost: number;
  totalLow: number;
  totalHigh: number;
  cpp: number;
  operationMult: number;
}

export function calculate(s: ConfiguratorState): CalcResult {
  const standing = s.cfg_standing || "confort";
  const operation = s.cfg_operation || "neuf";
  const cpp = COST_PER_M2[standing] || COST_PER_M2.confort;
  const operationMult = OPERATION_MULT[operation] || 1;

  const rooms: CalcRoom[] = [];

  // Espaces de vie
  if (s.cfg_salon) rooms.push({ label: "Salon", surface: SURFACES.salon });
  if (s.cfg_sejour) rooms.push({ label: "Séjour", surface: SURFACES.sejour });
  if (s.cfg_entree) rooms.push({ label: "Entrée", surface: SURFACES.entree });

  // Cuisine
  if (s.cfg_cuisine_type === "independante") {
    rooms.push({
      label: "Cuisine indépendante",
      surface: SURFACES.cuisine_independante,
    });
    if (s.cfg_cuisine_table) {
      rooms.push({
        label: "Salle à manger",
        surface: SURFACES.cuisine_table,
      });
    }
  } else if (s.cfg_cuisine_type === "ouverte") {
    rooms.push({
      label: "Cuisine ouverte (incluse)",
      surface: SURFACES.cuisine_ouverte,
    });
  }

  // Chambres — liste dynamique en priorité, fallback sur le compteur simple
  if (s.cfg_chambres_list && s.cfg_chambres_list.length > 0) {
    s.cfg_chambres_list.forEach((c, i) => {
      const key =
        c.type === "simple"
          ? "chambre_simple"
          : c.type === "double"
          ? "chambre_double"
          : c.type === "double_balcon"
          ? "chambre_double_balcon"
          : "chambre_suite";
      rooms.push({
        label: `Chambre ${i + 1} (${c.type.replace("_", " ")})`,
        surface: SURFACES[key],
      });
    });
  } else if (s.cfg_chambres > 0) {
    rooms.push({
      label: `Chambres (×${s.cfg_chambres})`,
      surface: s.cfg_chambres * SURFACES.chambre_double,
    });
  }

  // Suite parentale
  if (s.cfg_suite_parentale) {
    const key =
      s.cfg_suite_parentale_type === "dressing"
        ? "suite_parentale_dressing"
        : "suite_parentale_placard";
    rooms.push({
      label: `Suite parentale (${s.cfg_suite_parentale_type || "placard"})`,
      surface: SURFACES[key],
    });
  }

  // Salles de bain
  if (s.cfg_salles_bain > 0) {
    rooms.push({
      label: `Salles de bain (×${s.cfg_salles_bain})`,
      surface: s.cfg_salles_bain * SURFACES.sdb,
    });
  }

  // Pièces annexes intérieures
  if (s.cfg_bureau) rooms.push({ label: "Bureau", surface: SURFACES.bureau });
  if (s.cfg_sport) rooms.push({ label: "Espace sport", surface: SURFACES.sport });
  if (s.cfg_buanderie)
    rooms.push({ label: "Buanderie", surface: SURFACES.buanderie });
  if (s.cfg_cellier)
    rooms.push({ label: "Cellier", surface: SURFACES.cellier });

  // Garage (compte dans surface couverte mais pas habitable)
  if (s.cfg_garage) {
    rooms.push({
      label: "Garage",
      surface: SURFACES.garage,
      external: true,
    });
  }

  // Calcul surface habitable (pièces non-externes × circulations)
  const habitableBase = rooms
    .filter((r) => !r.external)
    .reduce((a, r) => a + r.surface, 0);
  const surfaceHabitable = Math.round(habitableBase * CIRCULATION_COEFF);
  const surfaceCouverte =
    surfaceHabitable +
    rooms.filter((r) => r.external).reduce((a, r) => a + r.surface, 0);

  // Surface finale — spécial cas mixte : somme des niveaux du builder
  let surfaceFinale: number;
  if (s.cfg_type === "mixte" && s.cfg_mixte_niveaux.length > 0) {
    surfaceFinale = s.cfg_mixte_niveaux.reduce((a, n) => a + n.surface, 0);
    // Ajouter les niveaux mixtes à la liste des rooms pour affichage
    s.cfg_mixte_niveaux.forEach((n, i) => {
      rooms.push({
        label: `Niveau ${i + 1} (${n.usage})`,
        surface: n.surface,
      });
    });
  } else {
    const niveauxMult =
      s.cfg_type_group === "immeuble" ? s.cfg_niveaux + 1 : 1;
    surfaceFinale = surfaceHabitable * niveauxMult;
  }

  // Coût construction de la villa / bâtiment
  const base = surfaceFinale * cpp * operationMult;
  const villaCostLow = Math.round((base * 0.92) / 1000) * 1000;
  const villaCostHigh = Math.round((base * 1.08) / 1000) * 1000;

  // Extras
  const extras: CalcExtra[] = [];
  if (s.cfg_piscine) {
    const piscineCost = SURFACES.piscine * 1500; // DT/m² prix indicatif
    extras.push({
      label: "Piscine",
      detail: `${SURFACES.piscine} m² × 1 500 DT/m² (skimmer)`,
      cost: piscineCost,
    });
  }
  if (s.cfg_jardin) {
    extras.push({
      label: "Aménagement paysager",
      detail: "Végétation + dallage + éclairage",
      cost: 15000,
    });
  }

  const extrasCost = extras.reduce((a, e) => a + e.cost, 0);
  const totalLow = villaCostLow + extrasCost;
  const totalHigh = villaCostHigh + extrasCost;

  return {
    surfaceHabitable: surfaceFinale,
    surfaceCouverte,
    rooms,
    extras,
    villaCostLow,
    villaCostHigh,
    extrasCost,
    totalLow,
    totalHigh,
    cpp,
    operationMult,
  };
}

export function fmtEur(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(".00", "") + " M€";
  return (n / 1000).toFixed(0) + " k€";
}

export function fmtEurFull(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}
