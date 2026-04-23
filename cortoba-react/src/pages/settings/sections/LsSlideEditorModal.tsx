import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { apiFetch } from "@/auth/AuthContext";

export interface EditableLsSlide {
  id?: number | string;
  image_path?: string;
  alt_text?: string;
  bg_color?: string;
  position_x?: number;
  position_y?: number;
  sort_order?: number;
}

interface Props {
  open: boolean;
  slide: EditableLsSlide | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Éditeur pour un slide du slider hero Landscaping.
 * Champs : bg_color, position_x/y, alt_text.
 */
export function LsSlideEditorModal({ open, slide, onClose, onSaved }: Props) {
  const [form, setForm] = useState<EditableLsSlide>(slide || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && slide) {
      setForm({
        ...slide,
        position_x: slide.position_x ?? 50,
        position_y: slide.position_y ?? 50,
        bg_color: slide.bg_color || "#1a2815",
      });
      setError(null);
    }
  }, [open, slide]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(
        "/cortoba-plateforme/api/landscaping_slider.php",
        {
          method: form.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof EditableLsSlide>(
    key: K,
    value: EditableLsSlide[K]
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Éditer la slide Landscaping"
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Preview */}
        <div>
          <label className="text-[0.65rem] tracking-[0.2em] uppercase text-fg-muted mb-2 block">
            Aperçu
          </label>
          <div
            className="relative w-full aspect-[16/9] rounded-md overflow-hidden border border-white/10 bg-cover bg-center"
            style={{
              backgroundImage: form.image_path
                ? `url('${form.image_path}')`
                : undefined,
              backgroundColor: form.bg_color || "#1a2815",
              backgroundPosition: `${form.position_x}% ${form.position_y}%`,
            }}
          />
          <div className="mt-2 text-[0.65rem] text-fg-muted">
            Couleur de fond visible quand l'image ne couvre pas toute la zone
            (transitions, pre-load).
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-4">
          <Range
            label="Position X"
            value={form.position_x ?? 50}
            min={0}
            max={100}
            onChange={(v) => set("position_x", v)}
          />
          <Range
            label="Position Y"
            value={form.position_y ?? 50}
            min={0}
            max={100}
            onChange={(v) => set("position_y", v)}
          />
          <label className="block">
            <span className="text-[0.65rem] tracking-[0.15em] uppercase text-fg-muted mb-1.5 block">
              Couleur de fond
            </span>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.bg_color || "#1a2815"}
                onChange={(e) => set("bg_color", e.target.value)}
                className="w-12 h-10 rounded cursor-pointer bg-transparent border border-white/10"
              />
              <input
                type="text"
                value={form.bg_color || ""}
                onChange={(e) => set("bg_color", e.target.value)}
                placeholder="#1a2815"
                className="flex-1 bg-bg-card border border-white/10 rounded-md px-3 py-2 text-fg text-sm focus:outline-none focus:border-[#8dba78] transition-colors font-mono"
              />
            </div>
          </label>
          <label className="block">
            <span className="text-[0.65rem] tracking-[0.15em] uppercase text-fg-muted mb-1.5 block">
              Texte alternatif
            </span>
            <input
              type="text"
              value={form.alt_text || ""}
              onChange={(e) => set("alt_text", e.target.value)}
              placeholder="Ex : Jardin méditerranéen à Djerba"
              className="w-full bg-bg-card border border-white/10 rounded-md px-3 py-2 text-fg placeholder:text-fg-muted text-sm focus:outline-none focus:border-[#8dba78] transition-colors"
            />
          </label>
        </div>
      </div>
    </Modal>
  );
}

function Range({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-[0.65rem] tracking-[0.15em] uppercase text-fg-muted mb-1">
        <span>{label}</span>
        <span className="tabular-nums text-[#8dba78]">{value}%</span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={1}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#8dba78]"
      />
    </div>
  );
}
