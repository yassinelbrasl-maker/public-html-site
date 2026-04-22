/**
 * Client pour l'API publique des membres d'équipe.
 * L'endpoint PHP (users.php?public=1) filtre les membres cochés "Afficher sur le site".
 */

export interface TeamMember {
  id: number | string;
  prenom?: string;
  nom?: string;
  role?: string;
  spec?: string;
  profile_picture_url?: string | null;
}

interface TeamResponse {
  success?: boolean;
  data?: TeamMember[];
}

export async function fetchPublicTeam(): Promise<TeamMember[]> {
  const res = await fetch("/cortoba-plateforme/api/users.php?public=1", {
    credentials: "omit",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as TeamResponse | TeamMember[];
  // L'endpoint peut renvoyer { data: [...] } OU un array direct (compat legacy)
  if (Array.isArray(json)) return json;
  return json.data || [];
}

export function initialsFor(m: TeamMember): string {
  const first = m.prenom?.[0] || "?";
  const last = m.nom?.[0] || "";
  return (first + last).toUpperCase();
}

export function fullName(m: TeamMember): string {
  return [m.prenom, m.nom].filter(Boolean).join(" ").trim();
}
