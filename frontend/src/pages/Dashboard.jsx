import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, TrendingUp, AlertTriangle, CheckCircle2, Banknote } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { api } from "@/lib/api";
import { BUCKETS, fmtDate } from "@/lib/badges";
import { money } from "@/lib/format";
import { Input } from "@/components/ui/input";
import ChargeFormDialog from "@/components/ChargeFormDialog";
import ImportPdfDialog from "@/components/ImportPdfDialog";

const KPI_CONFIG = [
  { key: "total_debt", label: "Total em Dívida", icon: Banknote, testid: "dashboard-kpi-total-debt" },
  { key: "recovered", label: "Valor Recuperado", icon: CheckCircle2, testid: "dashboard-kpi-recovered" },
  { key: "critical_debt", label: "Dívida Crítica (>30d)", icon: AlertTriangle, testid: "dashboard-kpi-critical-debt" },
  { key: "success_rate", label: "Taxa de Sucesso", icon: TrendingUp, testid: "dashboard-kpi-success-rate", suffix: "%" },
];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [charges, setCharges] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todas");
  const [formOpen, setFormOpen] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    const [s, c] = await Promise.all([api.get("/dashboard"), api.get("/charges")]);
    setStats(s.data);
    setCharges(c.data);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return charges.filter((c) => {
      const matchSearch = !search ||
        c.debtor_name.toLowerCase().includes(search.toLowerCase()) ||
        c.invoice_number.toLowerCase().includes(search.toLowerCase());
      const matchFilter = filter === "todas" || c.bucket === filter;
      return matchSearch && matchFilter;
    });
  }, [charges, search, filter]);

  const chartData = stats
    ? ["verde", "amarelo", "vermelho", "roxo"].map((b) => ({ name: BUCKETS[b].label.split(" (")[0], count: stats.buckets[b] || 0, fill: BUCKETS[b].hex }))
    : [];

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight">Dashboard Financeiro</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão geral das suas cobranças e antiguidade da dívida.</p>
        </div>
        <div className="flex gap-2">
          <ImportPdfDialog onImported={load} />
          <button
            onClick={() => setFormOpen(true)}
            data-testid="new-charge-btn"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand text-white text-sm font-semibold hover:opacity-90 hover:scale-[1.02] transition-all duration-200"
          >
            <Plus size={16} /> Nova Cobrança
          </button>
        </div>
      </div>

      {stats?.followups?.length > 0 && (
        <div data-testid="dashboard-followup-alert" className="border border-amber-500/40 bg-amber-500/10 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-300 flex items-center gap-2">
            <AlertTriangle size={16} /> {stats.followups.length} alerta(s): follow-ups e promessas de pagamento em atraso
          </p>
          <div className="flex flex-wrap gap-2">
            {stats.followups.map((f) => (
              <button
                key={f.id}
                onClick={() => navigate(`/cobranca/${f.id}`)}
                data-testid={`followup-item-${f.id}`}
                className="px-3 py-1.5 rounded-lg bg-background/60 border border-amber-500/30 text-xs hover:border-amber-400 hover:scale-[1.02] transition-all duration-200"
              >
                <span className="font-medium">{f.debtor_name}</span>
                <span className="text-muted-foreground">
                  {" "}· {f.invoice_number} · {f.kind === "promessa"
                    ? `promessa falhada ${fmtDate(f.date)}${f.agreed_amount ? ` (${money(f.agreed_amount)})` : ""}`
                    : `contacto previsto ${fmtDate(f.date)}`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {KPI_CONFIG.map(({ key, label, icon: Icon, testid, suffix }, i) => (
          <div
            key={key}
            data-testid={testid}
            className="bg-card border border-border rounded-xl p-5 hover:border-brand/50 hover:scale-[1.01] transition-all duration-200"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
              <Icon size={16} className="text-brand" />
            </div>
            <p className="font-heading text-2xl font-bold mt-2 font-mono-num" data-testid={`${testid}-value`}>
              {stats ? (suffix ? `${stats[key]}${suffix}` : money(stats[key])) : "—"}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Antiguidade da Dívida Pendente</p>
          <div className="h-52" data-testid="aging-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#8b94a7" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#8b94a7" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={{ background: "#111827", border: "1px solid #1F2937", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="xl:col-span-2 bg-card border border-border rounded-xl p-5 min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar devedor ou fatura..."
                data-testid="debtor-search-input"
                className="pl-9 bg-background"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {["todas", "verde", "amarelo", "vermelho", "roxo", "negociacao", "paga"].map((b) => (
                <button
                  key={b}
                  data-testid={`debtor-filter-${b}`}
                  onClick={() => setFilter(b)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors duration-200 ${
                    filter === b ? "bg-brand-soft text-brand border-brand/40" : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {b === "todas" ? "Todas" : BUCKETS[b].label.split(" (")[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="pb-3 font-medium">Devedor</th>
                  <th className="pb-3 font-medium">Fatura</th>
                  <th className="pb-3 font-medium">Vencimento</th>
                  <th className="pb-3 font-medium text-right">Valor</th>
                  <th className="pb-3 font-medium text-right">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    data-testid={`debtor-row-${c.id}`}
                    onClick={() => navigate(`/cobranca/${c.id}`)}
                    className="border-b border-border/50 last:border-0 cursor-pointer hover:bg-secondary/50 transition-colors duration-150"
                  >
                    <td className="py-3 pr-3">
                      <p className="font-medium">{c.debtor_name}</p>
                      <p className="text-xs text-muted-foreground">{c.debtor_nif || "—"}</p>
                    </td>
                    <td className="py-3 pr-3 font-mono-num text-xs">{c.invoice_number}</td>
                    <td className="py-3 pr-3 text-muted-foreground">{fmtDate(c.due_date)}</td>
                    <td className="py-3 pr-3 text-right font-mono-num font-semibold">{money(c.amount)}</td>
                    <td className="py-3 text-right">
                      <span data-testid={`debtor-badge-${c.id}`} className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium border ${BUCKETS[c.bucket].cls}`}>
                        {c.status === "paga" ? "Paga" : c.bucket === "por_vencer" ? "Por Vencer" : c.bucket === "negociacao" ? "Em Negociação" : `${c.days_overdue}d atraso`}
                      </span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="py-10 text-center text-muted-foreground" data-testid="debtor-empty-state">Sem cobranças para os filtros selecionados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ChargeFormDialog open={formOpen} onOpenChange={setFormOpen} onSaved={load} />
    </div>
  );
}
