import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/auth/AuthContext";
import { useToast } from "@/components/ToastProvider";

/**
 * useDemandesWatcher — poll /demandes_admin.php every `intervalMs` and
 * notify via toast when new demandes arrive (ids unseen in the previous
 * snapshot). Returns a `newCount` that callers can display as a sidebar
 * badge — reset by calling `markAllSeen()`.
 *
 * Stays silent on auth errors (403/401) so the hook can be mounted
 * unconditionally inside PlateformeShell without breaking the login flow.
 */
export function useDemandesWatcher(intervalMs = 60_000) {
  const toast = useToast();
  const seenIds = useRef<Set<string | number> | null>(null);
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const r = await apiFetch("/cortoba-plateforme/api/demandes_admin.php");
        if (!r.ok) return;
        const data = await r.json().catch(() => null);
        if (!data) return;
        const list: Array<{ id: string | number; nom_projet?: string; prenom?: string; nom?: string }> =
          Array.isArray(data) ? data : data.data || [];

        if (cancelled) return;

        const ids = new Set(list.map((d) => d.id));
        if (seenIds.current === null) {
          // First snapshot — just memorize, don't notify.
          seenIds.current = ids;
          return;
        }

        // Find new ids
        const incoming = list.filter((d) => !seenIds.current!.has(d.id));
        if (incoming.length > 0) {
          seenIds.current = ids;
          setNewCount((c) => c + incoming.length);
          for (const d of incoming.slice(0, 3)) {
            const client = [d.prenom, d.nom].filter(Boolean).join(" ");
            const projet = d.nom_projet || "Nouveau projet";
            toast.info(`📥 Nouvelle demande : ${projet}${client ? ` — ${client}` : ""}`);
          }
          if (incoming.length > 3) {
            toast.info(`… et ${incoming.length - 3} autres demandes`);
          }
        } else {
          // Keep seenIds in sync (handles deletions too)
          seenIds.current = ids;
        }
      } catch {
        /* réseau ou auth — silencieux, on retentera au tick suivant */
      }
    }

    // Premier tick immédiat (pour mémoriser l'état initial)
    poll();
    const timer = window.setInterval(poll, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [intervalMs, toast]);

  return {
    newCount,
    markAllSeen: () => setNewCount(0),
  };
}
