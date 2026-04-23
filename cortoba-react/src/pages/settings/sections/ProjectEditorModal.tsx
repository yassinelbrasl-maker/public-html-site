import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { ImageUploader, type UploadedImage } from "@/components/ImageUploader";
import { apiFetch } from "@/auth/AuthContext";
import type { Project } from "@/api/projects";

interface EditableProject extends Partial<Project> {
  gallery_images?: string[];
}

const GRID_CLASSES: { id: NonNullable<Project["grid_class"]>; label: string }[] = [
  { id: "", label: "1×1 (standard)" },
  { id: "wide", label: "Large (2 col)" },
  { id: "tall", label: "Haute (2 rangées)" },
  { id: "big", label: "Grande (2×2)" },
  { id: "full", label: "Pleine largeur (3 col)" },
];

interface Props {
  open: boolean;
  project: EditableProject | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ProjectEditorModal({ open, project, onClose, onSaved }: Props) {
  const [form, setForm] = useState<EditableProject>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm({
        ...project,
        category: project?.category || "RÉSIDENTIEL",
        grid_class: project?.grid_class ?? "",
        gallery_images: project?.gallery_images || [],
      });
      setError(null);
    }
  }, [open, project]);

  function set<K extends keyof EditableProject>(
    key: K,
    value: EditableProject[K]
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.title || !form.title.trim()) {
      setError("Le titre est obligatoire.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/cortoba-plateforme/api/published_projects.php", {
        method: form.slug ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function addGalleryImage(img: UploadedImage) {
    const current = form.gallery_images || [];
    set("gallery_images", [...current, img.path]);
  }

  function removeGalleryImage(path: string) {
    set(
      "gallery_images",
      (form.gallery_images || []).filter((p) => p !== path)
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={form.slug ? "Éditer le projet" : "Nouveau projet"}
      footer={
        <>
          {error && (
            <span className="text-red-400 text-xs mr-auto">{error}</span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="cta-button text-xs"
            disabled={saving}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="cta-button cta-button-primary text-xs"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Hero image */}
        <div>
          <label className="text-[0.65rem] tracking-[0.2em] uppercase text-fg-muted mb-2 block">
            Image principale (hero)
          </label>
          {form.hero_image ? (
            <div className="relative aspect-[16/9] rounded-md overflow-hidden border border-white/10 mb-2">
              <img
                src={form.hero_image}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => set("hero_image", "")}
                className="absolute top-2 right-2 bg-black/80 text-white rounded-md px-3 py-1 text-xs hover:bg-red-500"
              >
                Retirer
              </button>
            </div>
          ) : (
            <ImageUploader
              onUploaded={(img) => set("hero_image", img.path)}
              onError={setError}
              multiple={false}
              label="Glissez l'image hero ou cliquez"
            />
          )}
        </div>

        {/* Title, slug, category */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField
            label="Titre *"
            value={form.title || ""}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Ex : Villa Oléa"
          />
          <TextField
            label="Slug"
            value={form.slug || ""}
            onChange={(e) =>
              set(
                "slug",
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/(^-|-$)/g, "")
              )
            }
            placeholder="villa-olea (auto depuis titre)"
            hint="Utilisé dans l'URL /projet-{slug}"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <TextField
            label="Catégorie"
            value={form.category || ""}
            onChange={(e) => set("category", e.target.value)}
            placeholder="RÉSIDENTIEL, TERTIAIRE…"
          />
          <TextField
            label="Lieu"
            value={form.location || ""}
            onChange={(e) => set("location", e.target.value)}
            placeholder="Djerba"
          />
          <TextField
            label="Pays"
            value={form.country || ""}
            onChange={(e) => set("country", e.target.value)}
            placeholder="Tunisie"
          />
        </div>

        {/* Grid placement + position */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Format sur la grille"
            value={form.grid_class || ""}
            options={GRID_CLASSES.map((g) => ({
              value: g.id || "",
              label: g.label,
            }))}
            onChange={(v) =>
              set("grid_class", (v as Project["grid_class"]) || "")
            }
          />
          <div>
            <label className="text-[0.65rem] tracking-[0.15em] uppercase text-fg-muted mb-1.5 block">
              Position hero Y (%)
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={
                typeof form.hero_position === "number"
                  ? form.hero_position
                  : parseInt(String(form.hero_position)) || 50
              }
              onChange={(e) => set("hero_position", Number(e.target.value))}
              className="w-full accent-gold"
            />
            <div className="text-[0.65rem] text-gold tabular-nums text-right">
              {form.hero_position ?? 50}%
            </div>
          </div>
        </div>

        {/* Description */}
        <label className="block">
          <span className="text-[0.65rem] tracking-[0.15em] uppercase text-fg-muted mb-1.5 block">
            Description
          </span>
          <textarea
            value={form.description || ""}
            onChange={(e) => set("description", e.target.value)}
            rows={4}
            placeholder="Court paragraphe affiché sur la page détail du projet…"
            className="w-full bg-bg-card border border-white/10 rounded-md px-3 py-2 text-fg placeholder:text-fg-muted text-sm focus:outline-none focus:border-gold transition-colors resize-none"
          />
        </label>

        {/* Gallery */}
        <div>
          <label className="text-[0.65rem] tracking-[0.2em] uppercase text-fg-muted mb-2 block">
            Galerie ({(form.gallery_images || []).length} image
            {(form.gallery_images || []).length > 1 ? "s" : ""})
          </label>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mb-3">
            {(form.gallery_images || []).map((img) => (
              <div
                key={img}
                className="relative aspect-square rounded-md overflow-hidden border border-white/10 group"
              >
                <img src={img} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeGalleryImage(img)}
                  className="absolute inset-0 bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity text-xl"
                  title="Retirer"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <ImageUploader
            onUploaded={addGalleryImage}
            onError={setError}
            label="＋ Ajouter des images à la galerie"
            compact
          />
        </div>
      </div>
    </Modal>
  );
}

function TextField({
  label,
  hint,
  ...props
}: {
  label: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-[0.65rem] tracking-[0.15em] uppercase text-fg-muted block">
        {label}
      </span>
      {hint && (
        <span className="block text-[0.65rem] text-fg-muted/70 mb-1">{hint}</span>
      )}
      <input
        {...props}
        className="w-full bg-bg-card border border-white/10 rounded-md px-3 py-2 text-fg placeholder:text-fg-muted text-sm focus:outline-none focus:border-gold transition-colors mt-1.5"
      />
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[0.65rem] tracking-[0.15em] uppercase text-fg-muted mb-1.5 block">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-bg-card border border-white/10 rounded-md px-3 py-2 text-fg text-sm focus:outline-none focus:border-gold transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
