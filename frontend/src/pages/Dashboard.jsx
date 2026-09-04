import { useEffect, useState, useMemo, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, TrendingUp, AlertTriangle, CheckCircle2, Banknote, PhoneCall, MessageCircle, Mail, StickyNote, Printer, ChevronDown, ChevronRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from "recharts";
import { api } from "@/lib/api";
import { notifyDailyTasks } from "@/lib/notifications";
import { BUCKETS, fmtDate } from "@/lib/badges";
import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import ChargeFormDialog from "@/components/ChargeFormDialog";
import ImportPdfDialog from "@/components/ImportPdfDialog";
import WhatsAppQuickButton from "@/components/WhatsAppQuickButton";
import PrintReport, { printTableStyle, printThStyle, printTdStyle } from "@/components/PrintReport";

const KPI_CONFIG = [
  { key: "total_debt", label: "Total em Dívida", icon: Banknote, testid: "dashboard-kpi-total-debt" },
  { key: "recovered", label: "Valor Recuperado", icon: CheckCircle2, testid: "dashboard-kpi-recovered" },
  { key: "critical_debt", label: "Dívida Crítica (>30d)", icon: AlertTriangle, testid: "dashboard-kpi-critical-debt" },
  { key: "success_rate", label: "Taxa de Sucesso", icon: TrendingUp, testid: "dashboard-kpi-success-rate", suffix: "%" },
];

const fmtDT = (iso) => new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const ACT_ICONS = { chamada: PhoneCall, whatsapp: MessageCircle, email: Mail, nota: StickyNote };

export default function Dashboard() {
  const { company } = useAuth();
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
  const [chartReady, setChartReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setChartReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    if (stats) notifyDailyTasks(stats.followups, company?.id);
  }, [stats]);

  const filtered = useMemo(() => {
    return charges.filter((c) => {
      const matchSearch = !search ||
        c.debtor_name.toLowerCase().includes(search.toLowerCase()) ||
        c.invoice_number.toLowerCase().includes(search.toLowerCase());
      const matchFilter = filter === "todas" || c.bucket === filter;
      return matchSearch && matchFilter;
    });
  }, [charges, search, filter]);

  const [expanded, setExpanded] = useState({});
  const groups = useMemo(() => {
    const map = new Map();
    for (const c of filtered) {
      if (!map.has(c.debtor_name)) map.set(c.debtor_name, []);
      map.get(c.debtor_name).push(c);
    }
    return [...map.entries()].map(([name, items]) => ({
      name,
      items,
      doc: items[0]?.debtor_nif || "",
      total: items.reduce((s, c) => s + c.amount, 0),
    }));
  }, [filtered]);

  const chartData = stats
    ? ["verde", "amarelo", "vermelho", "roxo"].map((b) => ({ name: BUCKETS[b].label.split(" (")[0], count: stats.buckets[b] || 0, fill: BUCKETS[b].hex }))
    : [];

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            {company.logo_base64 && (
              <img src={company.logo_base64} alt={company.company_name} className="w-10 h-10 rounded-lg object-contain bg-white/5 border border-border" data-testid="dashboard-logo" />
            )}
            <p className="text-xs font-semibold uppercase tracking-widest text-brand" data-testid="dashboard-company-name">{company.company_name}</p>
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight">Dashboard Financeiro</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão geral das suas cobranças e antiguidade da dívida.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            data-testid="dashboard-print-btn"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-brand/50 hover:bg-brand-soft transition-all duration-200"
          >
            <Printer size={16} /> Gerar Relatório PDF
          </button>
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
                key={`${f.id}-${f.kind}-${f.date}`}
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
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col self-start">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Antiguidade da Dívida Pendente</p>
          <div className="h-[260px] w-full" data-testid="aging-chart">
            {chartReady && chartData.length > 0 && (
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 480, height: 260 }}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#8b94a7" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#8b94a7" }} axisLine={false} tickLine={false} allowDecimals={false} domain={[0, (dataMax) => Math.max(Math.ceil(dataMax) + 1, 5)]} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={{ background: "#111827", border: "1px solid #1F2937", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="xl:col-span-2 bg-card border border-border rounded-xl p-5 min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Pesquisar devedor ou ${t("invoiceLower")}...`}
                data-testid="debtor-search-input"
                className="pl-9 bg-background"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {["todas", "verde", "amarelo", "vermelho", "roxo", "negociacao", "paga", "cancelada"].map((b) => (
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
                  <th className="pb-3 font-medium">{t("invoice")}</th>
                  <th className="pb-3 font-medium">Vencimento</th>
                  <th className="pb-3 font-medium text-right">Valor</th>
                  <th className="pb-3 font-medium text-right">Estado</th>
                  <th className="pb-3 font-medium text-right" aria-label="Ações"></th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g, gi) => {
                  const isOpen = expanded[gi] !== false;
                  return (
                    <Fragment key={g.name}>
                      <tr
                        data-testid={`dash-group-${gi}`}
                        onClick={() => setExpanded({ ...expanded, [gi]: !isOpen })}
                        className="bg-secondary/40 cursor-pointer hover:bg-secondary/70 transition-colors duration-150 border-b border-border"
                      >
                        <td className="py-3 pr-3" colSpan={3}>
                          <span className="flex items-center gap-2 font-semibold">
                            {isOpen ? <ChevronDown size={15} className="text-brand shrink-0" /> : <ChevronRight size={15} className="text-muted-foreground shrink-0" />}
                            {g.name}
                            <span className="text-xs font-normal text-muted-foreground">{g.doc}</span>
                          </span>
                        </td>
                        <td className="py-3 pr-3 text-right font-mono-num font-bold text-brand" data-testid={`dash-group-total-${gi}`}>{money(g.total)}</td>
                        <td className="py-3 text-right text-xs text-muted-foreground">
                          {g.items.length} {g.items.length === 1 ? t("invoiceLower") : t("invoiceLowerPlural")}
                        </td>
                        <td />
                      </tr>
                      {isOpen && g.items.map((c) => (
                        <tr
                          key={c.id}
                          data-testid={`debtor-row-${c.id}`}
                          onClick={() => navigate(`/cobranca/${c.id}`)}
                          className="border-b border-border/50 last:border-0 cursor-pointer hover:bg-secondary/50 transition-colors duration-150"
                        >
                          <td className="py-3 pl-6 pr-3">
                            <p className="font-medium text-sm">{c.debtor_name}</p>
                          </td>
                          <td className="py-3 pr-3 font-mono-num text-xs">{c.invoice_number}</td>
                          <td className="py-3 pr-3 text-muted-foreground">{fmtDate(c.due_date)}</td>
                          <td className="py-3 pr-3 text-right font-mono-num font-semibold">{money(c.amount)}</td>
                          <td className="py-3 text-right">
                            <span data-testid={`debtor-badge-${c.id}`} className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium border ${BUCKETS[c.bucket].cls}`}>
                              {c.status === "paga" ? "Paga" : c.bucket === "por_vencer" ? "Por Vencer" : c.bucket === "negociacao" ? "Em Negociação" : c.bucket === "cancelada" ? "Cancelada" : `${c.days_overdue}d atraso`}
                            </span>
                          </td>
                          <td className="py-3 pl-2 text-right">
                            <WhatsAppQuickButton charge={c} />
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="py-10 text-center text-muted-foreground" data-testid="debtor-empty-state">Sem cobranças para os filtros selecionados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {stats?.recent_activities?.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5" data-testid="dashboard-activity-card">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Últimas 5 Ações</p>
          <div className="divide-y divide-border/50">
            {stats.recent_activities.map((a) => {
              const Icon = ACT_ICONS[a.type] || StickyNote;
              return (
                <div key={a.id} className="flex items-center gap-3 py-2.5" data-testid={`dashboard-activity-${a.id}`}>
                  <div className="w-8 h-8 rounded-full bg-brand-soft flex items-center justify-center shrink-0">
                    <Icon size={14} className="text-brand" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{a.note}</p>
                    {a.debtor_name && <p className="text-xs text-muted-foreground">{a.debtor_name}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 font-mono-num">{fmtDT(a.created_at)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <PrintReport title="Resumo Executivo — Dashboard Financeiro" testid="print-report-dashboard">
        {stats && (
          <>
            <table style={{ ...printTableStyle, marginBottom: 20 }}>
              <tbody>
                <tr>
                  <td style={printTdStyle}>Total em Dívida</td><td style={{ ...printTdStyle, textAlign: "right", fontWeight: 800, fontFamily: "monospace" }}>{money(stats.total_debt)}</td>
                  <td style={printTdStyle}>Valor Recuperado</td><td style={{ ...printTdStyle, textAlign: "right", fontWeight: 800, fontFamily: "monospace" }}>{money(stats.recovered)}</td>
                </tr>
                <tr>
                  <td style={printTdStyle}>Dívida Crítica (&gt;30d)</td><td style={{ ...printTdStyle, textAlign: "right", fontWeight: 800, fontFamily: "monospace" }}>{money(stats.critical_debt)}</td>
                  <td style={printTdStyle}>Taxa de Sucesso</td><td style={{ ...printTdStyle, textAlign: "right", fontWeight: 800, fontFamily: "monospace" }}>{stats.success_rate}%</td>
                </tr>
                <tr>
                  <td style={printTdStyle}>Cobranças Pendentes</td><td style={{ ...printTdStyle, textAlign: "right" }}>{stats.pending_count}</td>
                  <td style={printTdStyle}>Em Negociação</td><td style={{ ...printTdStyle, textAlign: "right" }}>{stats.negotiation_count} ({money(stats.negotiation_amount)})</td>
                </tr>
              </tbody>
            </table>
            <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>Antiguidade da Dívida Pendente</p>
            <table style={printTableStyle}>
              <tbody>
                {["verde", "amarelo", "vermelho", "roxo"].map((b) => (
                  <tr key={b}>
                    <td style={{ ...printTdStyle, width: 24 }}>
                      <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: BUCKETS[b].hex }} />
                    </td>
                    <td style={printTdStyle}>{BUCKETS[b].label}</td>
                    <td style={{ ...printTdStyle, textAlign: "right", fontWeight: 700 }}>{stats.buckets[b] || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </PrintReport>

      <ChargeFormDialog open={formOpen} onOpenChange={setFormOpen} onSaved={load} />
    </div>
  );
}
