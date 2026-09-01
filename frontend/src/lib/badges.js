export const BUCKETS = {
  por_vencer: { label: "Por Vencer", cls: "bg-sky-500/15 text-sky-400 border-sky-500/30", hex: "#0EA5E9" },
  verde: { label: "Atraso Leve (1-15d)", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", hex: "#10B981" },
  amarelo: { label: "Atraso Moderado (16-30d)", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30", hex: "#F59E0B" },
  vermelho: { label: "Atraso Crítico (31-60d)", cls: "bg-rose-500/15 text-rose-400 border-rose-500/30", hex: "#EF4444" },
  roxo: { label: "Contencioso (>60d)", cls: "bg-purple-500/15 text-purple-400 border-purple-500/30", hex: "#8B5CF6" },
  paga: { label: "Paga", cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30", hex: "#71717A" },
};

export function eur(v) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", minimumGroupingDigits: 2 }).format(v || 0);
}

export function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-PT", {
    day: "2-digit", month: "short", year: "numeric",
  });
}
