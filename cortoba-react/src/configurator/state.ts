/**
 * État global du configurateur — équivalent React/TypeScript du `cfgState`
 * de l'ancien configurateur.html. Géré via React Context + useReducer.
 *
 * Le contrat de champs est identique à l'API PHP (/api/demandes.php) pour
 * pouvoir continuer à soumettre sans changer le backend.
 */

export interface NiveauMixte {
  usage: string;
  surface: number;
}

export interface ConfiguratorState {
  // Step 1 — Projet
  cfg_nom_projet: string;

  // Step 2 — Missions (liste d'IDs de missions cochées)
  cfg_missions: string[];

  // Step 3 — Fondations
  cfg_type: string | null; // 'individuel' | 'collectif' | 'residentiel' | 'commercial' | 'bureautique' | 'mixte'
  cfg_type_group: string | null; // 'logement' | 'immeuble'
  cfg_operation: string | null; // 'neuf' | 'reamenagement' | 'extension'
  cfg_budget_custom: number;
  cfg_terrain: number;
  cfg_terrainUnknown: boolean;
  cfg_terrain_nature: string | null;

  // Step 4 — Identité
  cfg_style: string | null;
  cfg_standing: string | null;

  // Step 5 — Programme
  cfg_niveaux: number;
  cfg_chambres: number;
  cfg_salles_bain: number;
  cfg_cuisine_type: string | null;
  cfg_salon: boolean;
  cfg_garage: boolean;
  cfg_piscine: boolean;
  cfg_jardin: boolean;
  cfg_mixte_niveaux: NiveauMixte[];

  // Step 6 — Terrain (géolocalisation)
  cfg_terrain_lat: number | null;
  cfg_terrain_lng: number | null;
  cfg_terrain_adresse: string;

  // Client (après step 6)
  cfg_f_prenom: string;
  cfg_f_nom: string;
  cfg_f_tel: string;
  cfg_f_whatsapp: string;
  cfg_f_email: string;
  cfg_wa_same: boolean;

  // Métadonnées calculées (non envoyées par le user — mises à jour par le flow)
  _lastSurfaceInt: number | null;
  _lastVillaLow: number | null;
  _lastVillaHigh: number | null;
}

export const initialState: ConfiguratorState = {
  cfg_nom_projet: "",
  cfg_missions: [],
  cfg_type: null,
  cfg_type_group: null,
  cfg_operation: null,
  cfg_budget_custom: 200000,
  cfg_terrain: 500,
  cfg_terrainUnknown: false,
  cfg_terrain_nature: null,
  cfg_style: null,
  cfg_standing: null,
  cfg_niveaux: 1,
  cfg_chambres: 3,
  cfg_salles_bain: 2,
  cfg_cuisine_type: null,
  cfg_salon: true,
  cfg_garage: false,
  cfg_piscine: false,
  cfg_jardin: false,
  cfg_mixte_niveaux: [],
  cfg_terrain_lat: null,
  cfg_terrain_lng: null,
  cfg_terrain_adresse: "",
  cfg_f_prenom: "",
  cfg_f_nom: "",
  cfg_f_tel: "",
  cfg_f_whatsapp: "",
  cfg_f_email: "",
  cfg_wa_same: false,
  _lastSurfaceInt: null,
  _lastVillaLow: null,
  _lastVillaHigh: null,
};

export type Action =
  | { type: "SET"; key: keyof ConfiguratorState; value: ConfiguratorState[keyof ConfiguratorState] }
  | { type: "PATCH"; patch: Partial<ConfiguratorState> }
  | { type: "RESET" };

export function reducer(state: ConfiguratorState, action: Action): ConfiguratorState {
  switch (action.type) {
    case "SET":
      return { ...state, [action.key]: action.value };
    case "PATCH":
      return { ...state, ...action.patch };
    case "RESET":
      return { ...initialState };
    default:
      return state;
  }
}

// ─── STEP TYPE & ORDER ───────────────────────────────────────────────────
export type StepKey = 1 | 2 | 3 | 4 | 5 | 6 | "result" | "client" | "success";

export const STEP_ORDER: StepKey[] = [
  1, 2, 3, 4, 5, 6, "result", "client", "success",
];

export const STEP_LABELS: Record<Exclude<StepKey, "client" | "success">, string> = {
  1: "Projet",
  2: "Missions",
  3: "Fondations",
  4: "Identité",
  5: "Programme",
  6: "Terrain",
};
