/**
 * Client pour l'API publique des projets.
 * L'endpoint PHP reste inchangé — le frontend React consomme le même contrat.
 */

export interface Project {
  /** DB primary key — required for PUT (update) and DELETE. */
  id?: number;
  slug: string;
  title: string;
  category: string;
  location: string;
  country: string;
  hero_image: string;
  hero_position: number | string;
  gallery_images?: string[];
  grid_class?: "big" | "wide" | "tall" | "full" | "";
  description?: string;
  year?: string | number;
  surface?: string | number;
  sort_order?: number;
  published?: number | boolean;
}

/** Récupère un projet par son slug depuis la liste publiée. */
export async function fetchProjectBySlug(slug: string): Promise<Project | null> {
  const all = await fetchPublishedProjects();
  return all.find((p) => p.slug === slug) || null;
}

interface ProjectsResponse {
  success: boolean;
  data?: Project[];
  error?: string;
}

export async function fetchPublishedProjects(): Promise<Project[]> {
  const res = await fetch("/cortoba-plateforme/api/published_projects.php");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as ProjectsResponse;
  if (!json.success || !json.data) return [];
  return json.data;
}

/**
 * Convertit le champ hero_position (parfois encodé comme YYXX) en positions
 * X/Y séparées — identique à la logique vanilla actuelle dans index.html.
 */
export function parseHeroPosition(heroPosition: Project["hero_position"]): {
  x: number;
  y: number;
} {
  const hp = parseInt(String(heroPosition)) || 50;
  const x = hp > 100 ? hp % 1000 : 50;
  const y = hp > 100 ? Math.floor(hp / 1000) : hp;
  return { x, y };
}
