import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { ImageUploader, type UploadedImage } from "@/components/ImageUploader";
import { apiFetch } from "@/auth/AuthContext";

export interface EditableLsProject {
  id?: number | string;
  title?: string;
  slug?: string;
  tag?: string;
  location?: string;
  hero_image?: string;
}

interface Props {
  open: boolean;
  project: EditableLsProject | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Éditeur minimal pour un projet landscaping. */
export function LsProjectEditorModal({ open, project, onClose, onSaved }: Props) {
  const [form, setForm] = useState<EditableLsProject>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(project || {});
      setError(null);
    }
  }, [open, project]);

  function set<K extends keyof EditableLsProject>(
    key: K,
    value: EditableLsProject[K]
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.title?.trim()) {
      setError("Le titre est obligatoire.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(
        "/cortoba-plateforme/api/landscaping_projects.php",
        {
          method: form.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const data = await res.json().catch(() => ({}));
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={form.id ? "Éditer le projet" : "Nouveau projet paysager"}
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
      <div className="space-y-4">
        {/* Hero */}
        <div>
          <label className="text-[0.65rem] tracking-[0.2em] uppercase text-fg-muted mb-2 block">
            Image principale
          </label>
          {form.hero_image ? (
            <div className="relative aspect-[16/9] rounded-md overflow-hidden border border-white/10">
              <img src={form.hero_image} className="w-full h-full object-cover" />
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
              onUploaded={(img: UploadedImage) => set("hero_image", img.path)}
              onError={setError}
              multiple={false}
              label="Glissez l'image ou cliquez"
            />
          )}
        </div>

        <Text
          label="Titre *"
          value={form.title || ""}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Ex : Villa Oléa"
        />
        <Text
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
          placeholder="villa-olea"
        />
        <div className="grid grid-cols-2 gap-3">
          <Text
            label="Tag"
            value={form.tag || ""}
            onChange={(e) => set("tag", e.target.value)}
            placeholder="Jardin privé, Terrasse…"
          />
          <Text
            label="Lieu"
            value={form.location || ""}
            onChange={(e) => set("location", e.target.value)}
            placeholder="Djerba, Tunisie"
          />
        </div>
      </div>
    </Modal>
  );
}

function Text({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-[0.65rem] tracking-[0.15em] uppercase text-fg-muted mb-1.5 block">
        {label}
      </span>
      <input
        {...props}
        className="w-full bg-bg-card border border-white/10 rounded-md px-3 py-2 text-fg placeholder:text-fg-muted text-sm focus:outline-none focus:border-gold transition-colors"
      />
    </label>
  );
}
