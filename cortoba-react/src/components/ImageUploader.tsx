import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { authToken } from "@/auth/AuthContext";
import clsx from "clsx";

/**
 * ImageUploader — drag-and-drop zone pour uploader une ou plusieurs images
 * vers /cortoba-plateforme/api/upload_project_image.php.
 *
 * L'endpoint :
 *   - accepte multipart/form-data avec un champ 'image'
 *   - attend requireAdmin() → Authorization Bearer token
 *   - max 10 Mo, formats jpg/jpeg/png/webp/avif
 *   - retourne { success, data: { path, width, height, size, optimized } }
 *
 * On utilise XMLHttpRequest (pas fetch) pour avoir la progress d'upload.
 */

export interface UploadedImage {
  path: string;
  width?: number;
  height?: number;
  size?: number;
}

interface Props {
  /** Callback pour chaque image uploadée avec succès. */
  onUploaded: (img: UploadedImage) => void;
  /** Callback d'erreur (optionnel). */
  onError?: (message: string) => void;
  /** Accepter plusieurs fichiers d'un coup ? Défaut : true. */
  multiple?: boolean;
  /** Texte du bouton / zone. */
  label?: string;
  /** Taille compacte (pour intégration dans une toolbar). */
  compact?: boolean;
  /** Endpoint d'upload (par défaut upload_project_image.php). */
  endpoint?: string;
}

const DEFAULT_ENDPOINT = "/cortoba-plateforme/api/upload_project_image.php";
const MAX_SIZE_MB = 10;
const ALLOWED = new Set(["jpg", "jpeg", "png", "webp", "avif"]);

export function ImageUploader({
  onUploaded,
  onError,
  multiple = true,
  label = "Glissez une image ou cliquez",
  compact = false,
  endpoint = DEFAULT_ENDPOINT,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<UploadJob[]>([]);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (!arr.length) return;
      const newJobs: UploadJob[] = [];
      for (const file of arr) {
        const err = validateFile(file);
        if (err) {
          onError?.(err);
          continue;
        }
        newJobs.push({
          id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
          file,
          progress: 0,
          status: "pending",
        });
      }
      if (!newJobs.length) return;
      setQueue((q) => [...q, ...newJobs]);
      newJobs.forEach((job) => runUpload(job, endpoint, onUploaded, setQueue, onError));
    },
    [endpoint, onError, onUploaded]
  );

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div className={compact ? "inline-block" : "block"}>
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
      <motion.button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        whileHover={{ scale: compact ? 1 : 1.005 }}
        className={clsx(
          "border-2 border-dashed rounded-md transition-colors cursor-pointer w-full",
          compact
            ? "px-4 py-2 text-xs flex items-center gap-2"
            : "p-10 flex flex-col items-center justify-center gap-2 text-center",
          dragging
            ? "border-gold bg-gold/5"
            : "border-white/15 hover:border-gold-dim text-fg-muted"
        )}
      >
        <span className={compact ? "text-base" : "text-3xl"}>📤</span>
        <span className={compact ? "text-xs" : "text-sm"}>
          {label}
        </span>
        {!compact && (
          <span className="text-[0.65rem] text-fg-muted/70">
            JPG / PNG / WebP — max {MAX_SIZE_MB} Mo
          </span>
        )}
      </motion.button>

      {/* Progress queue */}
      <AnimatePresence>
        {queue.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 space-y-2 overflow-hidden"
          >
            {queue.map((job) => (
              <UploadProgressRow
                key={job.id}
                job={job}
                onDismiss={() => setQueue((q) => q.filter((j) => j.id !== job.id))}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Internal ──────────────────────────────────────────────────────────

interface UploadJob {
  id: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
  result?: UploadedImage;
}

function validateFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (!ALLOWED.has(ext)) {
    return `"${file.name}" : format non supporté (JPG, PNG, WebP attendu).`;
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return `"${file.name}" : trop volumineuse (max ${MAX_SIZE_MB} Mo).`;
  }
  return null;
}

function runUpload(
  job: UploadJob,
  endpoint: string,
  onUploaded: (img: UploadedImage) => void,
  setQueue: React.Dispatch<React.SetStateAction<UploadJob[]>>,
  onError?: (message: string) => void
) {
  const fd = new FormData();
  fd.append("image", job.file);
  const xhr = new XMLHttpRequest();
  xhr.open("POST", endpoint);
  const token = authToken();
  if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

  xhr.upload.addEventListener("progress", (e) => {
    if (!e.lengthComputable) return;
    const pct = Math.round((e.loaded / e.total) * 100);
    setQueue((q) =>
      q.map((j) =>
        j.id === job.id ? { ...j, progress: pct, status: "uploading" } : j
      )
    );
  });

  xhr.onload = () => {
    try {
      const data = JSON.parse(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300 && data.success !== false) {
        const payload = data.data || data;
        const result: UploadedImage = {
          path: payload.path,
          width: payload.width,
          height: payload.height,
          size: payload.size,
        };
        setQueue((q) =>
          q.map((j) =>
            j.id === job.id ? { ...j, status: "done", result, progress: 100 } : j
          )
        );
        onUploaded(result);
        // Auto-dismiss after 2s on success
        setTimeout(() => {
          setQueue((q) => q.filter((j) => j.id !== job.id));
        }, 2000);
      } else {
        const msg = data.error || `HTTP ${xhr.status}`;
        setQueue((q) =>
          q.map((j) =>
            j.id === job.id ? { ...j, status: "error", error: msg } : j
          )
        );
        onError?.(msg);
      }
    } catch {
      setQueue((q) =>
        q.map((j) =>
          j.id === job.id
            ? { ...j, status: "error", error: "Réponse serveur invalide" }
            : j
        )
      );
      onError?.("Réponse serveur invalide");
    }
  };

  xhr.onerror = () => {
    setQueue((q) =>
      q.map((j) =>
        j.id === job.id
          ? { ...j, status: "error", error: "Erreur réseau" }
          : j
      )
    );
    onError?.("Erreur réseau");
  };

  xhr.send(fd);
}

function UploadProgressRow({
  job,
  onDismiss,
}: {
  job: UploadJob;
  onDismiss: () => void;
}) {
  const statusColor =
    job.status === "error"
      ? "text-red-400"
      : job.status === "done"
      ? "text-green-400"
      : "text-gold";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="p-3 bg-bg-card border border-white/5 rounded-md"
    >
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="flex-1 min-w-0">
          <div className="text-xs text-fg truncate">{job.file.name}</div>
          <div className={`text-[0.62rem] ${statusColor}`}>
            {job.status === "pending" && "En attente…"}
            {job.status === "uploading" && `Upload ${job.progress}%`}
            {job.status === "done" && "✓ Uploadée"}
            {job.status === "error" && `✗ ${job.error || "Erreur"}`}
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-fg-muted hover:text-fg text-xs"
          aria-label="Fermer"
        >
          ×
        </button>
      </div>
      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          animate={{ width: `${job.progress}%` }}
          transition={{ duration: 0.2 }}
          className={clsx(
            "h-full",
            job.status === "error" ? "bg-red-400" : "bg-gold"
          )}
        />
      </div>
    </motion.div>
  );
}
