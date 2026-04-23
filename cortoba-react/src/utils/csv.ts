/**
 * Export CSV helpers — pas de lib externe, utilitaires légers.
 */

function escapeCsvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Array.from(
    rows.reduce((acc, r) => {
      Object.keys(r).forEach((k) => acc.add(k));
      return acc;
    }, new Set<string>())
  );
  const csvRows = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escapeCsvCell(r[h])).join(",")),
  ];
  return csvRows.join("\n");
}

/** Déclenche le téléchargement du CSV côté navigateur. */
export function downloadCsv(filename: string, content: string) {
  // BOM UTF-8 pour qu'Excel affiche correctement les accents
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + content], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportAsCsv(
  filename: string,
  rows: Record<string, unknown>[]
) {
  downloadCsv(filename, toCsv(rows));
}
