import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { apiFetch } from "@/auth/AuthContext";

export interface EditableSlide {
  id?: number | string;
  image_path?: string;
  alt_text?: string;
  fit_mode?: "cover" | "contain" | "original" | "fill";
  position_x?: number;
  position_y?: number;
  zoom?: number;
  animation_type?: string;
  sort_order?: number;
}

const FIT_MODES: { id: EditableSlide["fit_mode"]; label: string }[] = [
  { id: "cover", label: "Adapté (cover)" },
  { id: "contain", label: "Contenu (contain)" },
  { id: "original", label: "Original" },
  { id: "fill", label: "Étiré (fill)" },
];

const ANIMATIONS: { id: string; label: string }[] = [
  { id: "none", label: "Aucune" },
  { id: "zoom-in", label: "Zoom avant" },
  { id: "zoom-out", label: "Zoom arrière" },
  { id: "pan-left", label: "Pan gauche" },
  { id: "pan-right", label: "Pan droite" },
  { id: "pan-up", label: "Pan haut" },
  { id: "pan-down", label: "Pan bas" },
  { id: "drift", label: "Drift" },
];

interface Props {
  open: boolean;
  slide: EditableSlide | null;
  onClose: () => void;
  onSaved: () => void;
}

export function SlideEditorModal({ open, slide, onClose, onSaved }: Props) {
  const [form, setForm] = useState<EditableSlide>(slide || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (open && slide) {
      setForm({
        ...slide,
        fit_mode: slide.fit_mode || "cover",
        position_x: slide.position_x ?? 50,
        position_y: slide.position_y ?? 50,
        zoom: slide.zoom ?? 100,
        animation_type: slide.animation_type || "zoom-in",
      });
      setError(null);
    }
  }, [open, slide]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/cortoba-plateforme/api/slider.php", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Erreur serveur");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof EditableSlide>(key: K, value: EditableSlide[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const fit = form.fit_mode || "cover";
  const objFit = fit === "original" ? "none" : fit;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Éditer la slide"
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
        {/* Live preview — drag to reposition */}
        <div>
          <label className="text-[0.65rem] tracking-[0.2em] uppercase text-fg-muted mb-2 block">
            Aperçu <span className="normal-case text-gold">· glissez pour repositionner</span>
          </label>
          <div
            ref={previewRef}
            onPointerDown={(e) => {
              if (!previewRef.current || !form.image_path) return;
              setDragging(true);
              (e.target as Element).setPointerCapture(e.pointerId);
            }}
            onPointerUp={(e) => {
              setDragging(false);
              (e.target as Element).releasePointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!dragging || !previewRef.current) return;
              const rect = previewRef.current.getBoundingClientRect();
              const x = Math.max(
                0,
                Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)
              );
              const y = Math.max(
                0,
                Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)
              );
              set("position_x", Math.round(x));
              set("position_y", Math.round(y));
            }}
            className={`relative w-full aspect-[16/9] bg-black/50 rounded-md overflow-hidden border transition-colors ${
              dragging ? "border-gold cursor-grabbing" : "border-white/10 cursor-grab"
            }`}
          >
            {form.image_path && (
              <img
                src={form.image_path}
                alt={form.alt_text || "Slide"}
                draggable={false}
                className="w-full h-full pointer-events-none select-none"
                style={{
                  objectFit: objFit as React.CSSProperties["objectFit"],
                  objectPosition: `${form.position_x}% ${form.position_y}%`,
                  transform: `scale(${(form.zoom || 100) / 100})`,
                }}
              />
            )}
            {/* Crosshair marker at current position */}
            {form.image_path && (
              <div
                className="absolute pointer-events-none transition-all"
                style={{
                  left: `${form.position_x}%`,
                  top: `${form.position_y}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <div className="w-4 h-4 rounded-full bg-gold shadow-lg ring-4 ring-gold/30" />
              </div>
            )}
            <div className="absolute bottom-2 left-2 text-[0.6rem] bg-black/60 text-fg-muted px-2 py-0.5 rounded tabular-nums">
              {form.position_x}% / {form.position_y}% · {form.zoom}%
            </div>
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
          <Range
            label="Zoom"
            value={form.zoom ?? 100}
            min={50}
            max={150}
            step={1}
            suffix="%"
            onChange={(v) => set("zoom", v)}
          />
          <Select
            label="Mode d'ajustement"
            value={form.fit_mode || "cover"}
            options={FIT_MODES.map((f) => ({
              value: f.id || "cover",
              label: f.label,
            }))}
            onChange={(v) => set("fit_mode", v as EditableSlide["fit_mode"])}
          />
          <Select
            label="Animation"
            value={form.animation_type || "zoom-in"}
            options={ANIMATIONS.map((a) => ({ value: a.id, label: a.label }))}
            onChange={(v) => set("animation_type", v)}
          />
          <TextField
            label="Texte alternatif (SEO / accessibilité)"
            value={form.alt_text || ""}
            onChange={(e) => set("alt_text", e.target.value)}
            placeholder="Ex : Villa contemporaine à Djerba"
          />
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
  step = 1,
  suffix = "%",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-[0.65rem] tracking-[0.15em] uppercase text-fg-muted mb-1">
        <span>{label}</span>
        <span className="tabular-nums text-gold">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-gold"
      />
    </div>
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

function TextField({
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
