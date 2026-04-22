/**
 * Soumission du configurateur — POST vers /api/demandes.php
 * Mêmes champs que la version vanilla pour compat serveur 1:1.
 */
import { ConfiguratorState } from "./state";

export interface SubmitPayload {
  source: "configurateur";
  nom_projet: string;
  prenom: string;
  nom: string;
  tel: string;
  whatsapp: string;
  email: string;
  cfg_data: string;
  missions: string[];
  surface_estimee: number | null;
  cout_estime_low: number | null;
  cout_estime_high: number | null;
}

export async function submitConfigurator(
  s: ConfiguratorState
): Promise<{ ok: true } | { ok: false; error: string }> {
  const body: SubmitPayload = {
    source: "configurateur",
    nom_projet: s.cfg_nom_projet || "Projet sans nom",
    prenom: s.cfg_f_prenom.trim(),
    nom: s.cfg_f_nom.trim(),
    tel: s.cfg_f_tel.trim(),
    whatsapp: s.cfg_f_whatsapp.trim() || s.cfg_f_tel.trim(),
    email: s.cfg_f_email.trim(),
    cfg_data: JSON.stringify(s),
    missions: s.cfg_missions,
    surface_estimee: s._lastSurfaceInt,
    cout_estime_low: s._lastVillaLow,
    cout_estime_high: s._lastVillaHigh,
  };

  try {
    const res = await fetch("/cortoba-plateforme/api/demandes.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
