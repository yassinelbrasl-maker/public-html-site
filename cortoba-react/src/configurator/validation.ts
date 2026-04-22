/**
 * Règles de validation par étape — portage direct de `cfgValidateStep`
 * de l'ancien configurateur.html. Retourne un message d'erreur ou null.
 */
import { ConfiguratorState } from "./state";

export function validateStep(
  step: 1 | 2 | 3 | 4 | 5 | 6,
  s: ConfiguratorState
): string | null {
  switch (step) {
    case 1:
      if (!s.cfg_nom_projet || s.cfg_nom_projet.trim().length < 2) {
        return "Veuillez donner un nom à votre projet.";
      }
      return null;

    case 2:
      // Pas de validation dure sur les missions — libre choix
      return null;

    case 3:
      if (!s.cfg_type) {
        return "Veuillez choisir un type de bâtiment pour continuer.";
      }
      if (!s.cfg_operation) {
        return "Veuillez choisir la nature de l'opération.";
      }
      return null;

    case 4:
      if (!s.cfg_style) return "Veuillez choisir un style architectural.";
      if (!s.cfg_standing) return "Veuillez sélectionner un niveau de standing.";
      return null;

    case 5:
    case 6:
      return null;

    default:
      return null;
  }
}

export function validateClient(s: ConfiguratorState): string | null {
  if (!s.cfg_f_prenom.trim() || !s.cfg_f_nom.trim() || !s.cfg_f_tel.trim()) {
    return "Veuillez remplir le prénom, le nom et le téléphone.";
  }
  return null;
}
