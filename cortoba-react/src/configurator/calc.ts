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
  cuisine_ouverte: 8, // comptée dans le salon
  cuisine_independante: 14,
  sdb: 6,
  chambre: 12,
  garage: 20,
  piscine: 35, // surface moyenne si sélectionné
  jardin: 0, // pas de surface couverte
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
  if (s.cfg_salon) {
    rooms.push({ label: "Salon / séjour", surface: SURFACES.salon });
  }

  // Cuisine
  if (s.cfg_cuisine_type === "independante") {
    rooms.push({
      label: "Cuisine indépendante",
      surface: SURFACES.cuisine_independante,
    });
  } else if (s.cfg_cuisine_type === "ouverte") {
    // Cuisine ouverte : comptée dans salon, juste une ligne visuelle
    rooms.push({
      label: "Cuisine ouverte (incluse)",
      surface: SURFACES.cuisine_ouverte,
    });
  }

  // Chambres
  if (s.cfg_chambres > 0) {
    rooms.push({
      label: `Chambres (×${s.cfg_chambres})`,
      surface: s.cfg_chambres * SURFACES.chambre,
    });
  }

  // Salles de bain
  if (s.cfg_salles_bain > 0) {
    rooms.push({
      label: `Salles de bain (×${s.cfg_salles_bain})`,
      surface: s.cfg_salles_bain * SURFACES.sdb,
    });
  }

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

  // Multiplicateur niveaux (le legacy multiplie par nb_niveaux pour certains types)
  const niveauxMult = s.cfg_type_group === "immeuble" ? s.cfg_niveaux + 1 : 1;
  const surfaceFinale = surfaceHabitable * niveauxMult;

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
