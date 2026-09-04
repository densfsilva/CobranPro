import { useEffect, useMemo, useState } from "react";
import { Printer, FileBarChart, RotateCcw, CalendarRange, PhoneCall, MessageCircle, Mail, StickyNote } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/badges";
import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import PrintReport, { printTableStyle, printThStyle, printThRightStyle, printTdStyle } from "@/components/PrintReport";
import PrintBarChart from "@/components/PrintBarChart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ACT_ICONS = { chamada: PhoneCall, whatsapp: MessageCircle, email: Mail, nota: StickyNote };
const fmtDT = (iso) => new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const STATUS_OPTIONS = [
  ["todas", "Todos os estados"],
  ["atrasado", "Atrasado"],
  ["recebido", "Recebido"],
  ["negociando", "Negociando"],
  ["por_vencer", "Por Vencer"],
];

function statusLabel(c) {
  if (c.status === "paga") return "Recebido";
  if (c.status === "negociacao") return "Negociando";
  return c.days_overdue > 0 ? `Atrasado (${c.days_overdue}d)` : "Por Vencer";
}

export default function Reports() {
  const [charges, setCharges] = useState([]);
  const [weekly, setWeekly] = useState(null);
  const [printMode, setPrintMode] = useState("list");
  const [cliente, setCliente] = useState("");
  const [status, setStatus] = useState("todas");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    api.get("/charges").then(({ data }) => setCharges(data));
    api.get("/reports/weekly").then(({ data }) => setWeekly(data)).catch(() => {});
  }, []);

  const printList = () => { setPrintMode("list"); setTimeout(() => window.print(), 60); };
  const printWeekly = () => { setPrintMode("weekly"); setTimeout(() => window.print(), 60); };

  const filtered = useMemo(() => charges.filter((c) => {
    if (cliente && !c.debtor_name.toLowerCase().includes(cliente.toLowerCase())) return false;
    if (status === "atrasado" && !(c.status === "pendente" && c.days_overdue > 0)) return false;
    if (status === "recebido" && c.status !== "paga") return false;
    if (status === "negociando" && c.status !== "negociacao") return false;
    if (status === "por_vencer" && !(c.status === "pendente" && c.days_overdue === 0)) return false;
    if (from && c.due_date < from) return false;
    if (to && c.due_date > to) return false;
    return true;
  }), [charges, cliente, status, from, to]);

  const total = filtered.reduce((s, c) => s + c.amount, 0);
  const reset = () => { setCliente(""); setStatus("todas"); setFrom(""); setTo(""); };
  const statusText = STATUS_OPTIONS.find(([k]) => k === status)?.[1];

  return (
    <div className="space-y-6" data-testid="relatorios-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight flex items-center gap-3">
            <FileBarChart size={28} className="text-brand" /> Relatórios
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Filtre por cliente, estado e período. Exporte para PDF via impressão.</p>
        </div>
        <button
          onClick={printList}
          data-testid="report-print-btn"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand text-white text-sm font-semibold hover:opacity-90 hover:scale-[1.02] transition-all duration-200"
        >
          <Printer size={16} /> Imprimir / Gerar PDF
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl p-5" data-testid="report-filters">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <div className="space-y-1.5">
            <Label htmlFor="f-cliente">Cliente</Label>
            <Input id="f-cliente" value={cliente} onChange={(e) => setCliente(e.target.value)}
              placeholder="Nome do devedor..." data-testid="report-client-filter" className="bg-background" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-status">Estado</Label>
            <select id="f-status" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="report-status-filter"
              className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 ring-brand">
              {STATUS_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-from">Vencimento de</Label>
            <Input id="f-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="report-date-from" className="bg-background" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-to">Vencimento até</Label>
            <Input id="f-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="report-date-to" className="bg-background" />
          </div>
          <button onClick={reset} data-testid="report-reset-btn"
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors duration-200">
            <RotateCcw size={14} /> Limpar
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5" data-testid="report-results">
        <p className="text-sm text-muted-foreground mb-4">
          <span className="font-mono-num font-semibold text-foreground" data-testid="report-count">{filtered.length}</span>
          <span> registos · total </span>
          <span className="font-mono-num font-semibold text-foreground" data-testid="report-total">{money(total)}</span>
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="report-results-table">
            <thead>
              <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="pb-3 font-medium">Devedor</th>
                <th className="pb-3 font-medium">{t("invoice")}</th>
                <th className="pb-3 font-medium">Vencimento</th>
                <th className="pb-3 font-medium text-right">Valor</th>
                <th className="pb-3 font-medium text-right">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-border/50 last:border-0" data-testid={`report-row-${c.id}`}>
                  <td className="py-2.5 pr-3 font-medium">{c.debtor_name}</td>
                  <td className="py-2.5 pr-3 font-mono-num text-xs">{c.invoice_number}</td>
                  <td className="py-2.5 pr-3 text-muted-foreground">{fmtDate(c.due_date)}</td>
                  <td className="py-2.5 pr-3 text-right font-mono-num font-semibold">{money(c.amount)}</td>
                  <td className="py-2.5 text-right text-xs">{statusLabel(c)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="py-10 text-center text-muted-foreground" data-testid="report-empty-state">Sem resultados para os filtros aplicados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-4" data-testid="weekly-report-section">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
              <CalendarRange size={18} className="text-brand" /> Relatórios de Gestão — Resumo Semanal
            </h2>
            <p className="text-xs text-muted-foreground mt-1">Consolidação dos últimos 7 dias: quem ligou, quem enviou email e o que foi acordado.</p>
          </div>
          <button onClick={printWeekly} data-testid="weekly-print-btn"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-brand/50 hover:bg-brand-soft transition-all duration-200">
            <Printer size={16} /> Imprimir Resumo Semanal
          </button>
        </div>
        {weekly ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3" data-testid="weekly-stats">
              {[
                ["Chamadas", weekly.counts.chamada, PhoneCall],
                ["Emails", weekly.counts.email, Mail],
                ["WhatsApp", weekly.counts.whatsapp, MessageCircle],
                ["Recebidas", weekly.paid_this_week, CalendarRange],
                ["Recuperado", money(weekly.recovered_this_week), FileBarChart],
              ].map(([label, value, Icon]) => (
                <div key={label} className="bg-background border border-border rounded-lg p-3 text-center">
                  <Icon size={15} className="text-brand mx-auto mb-1" />
                  <p className="font-heading font-bold text-lg font-mono-num" data-testid={`weekly-stat-${label.toLowerCase()}`}>{value}</p>
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            {weekly.negotiations.length > 0 && (
              <div data-testid="weekly-negotiations">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">O que foi acordado</p>
                <div className="space-y-1.5">
                  {weekly.negotiations.map((n, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm bg-background border border-orange-500/20 rounded-lg px-3 py-2" data-testid={`weekly-negotiation-${i}`}>
                      <span className="font-medium">{n.debtor_name}</span>
                      <span className="font-mono-num text-xs text-muted-foreground">{n.invoice_number}</span>
                      {n.agreed_amount != null && <span className="text-orange-400 font-mono-num text-xs">acordado {money(n.agreed_amount)}</span>}
                      {n.promise_date && <span className="text-xs text-muted-foreground">promessa {fmtDate(n.promise_date)}</span>}
                      {n.notes && <span className="text-xs text-muted-foreground truncate max-w-[280px]">{n.notes}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div data-testid="weekly-activities">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Atividades da semana ({weekly.total_activities})</p>
              <div className="max-h-56 overflow-y-auto divide-y divide-border/50">
                {weekly.activities.map((a) => {
                  const Icon = ACT_ICONS[a.type] || StickyNote;
                  return (
                    <div key={a.id} className="flex items-center gap-3 py-2" data-testid={`weekly-activity-${a.id}`}>
                      <div className="w-7 h-7 rounded-full bg-brand-soft flex items-center justify-center shrink-0"><Icon size={13} className="text-brand" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{a.note}</p>
                        <p className="text-xs text-muted-foreground">{a.debtor_name || "—"}</p>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono-num shrink-0">{fmtDT(a.created_at)}</span>
                    </div>
                  );
                })}
                {weekly.activities.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Sem atividades registadas esta semana.</p>}
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">A carregar resumo semanal...</p>
        )}
      </div>

      <PrintReport
        title="Resumo Semanal de Gestão"
        subtitle={weekly ? `Período: ${fmtDate(weekly.period.from)} a ${fmtDate(weekly.period.to)}` : ""}
        active={printMode === "weekly"}
        testid="print-report-weekly"
      >
        {weekly && (
          <>
            <table style={{ ...printTableStyle, marginBottom: 20 }}>
              <tbody>
                <tr>
                  <td style={printTdStyle}>Chamadas</td><td style={{ ...printTdStyle, textAlign: "right", fontWeight: 700 }}>{weekly.counts.chamada}</td>
                  <td style={printTdStyle}>Emails</td><td style={{ ...printTdStyle, textAlign: "right", fontWeight: 700 }}>{weekly.counts.email}</td>
                  <td style={printTdStyle}>WhatsApp</td><td style={{ ...printTdStyle, textAlign: "right", fontWeight: 700 }}>{weekly.counts.whatsapp}</td>
                </tr>
                <tr>
                  <td style={printTdStyle}>Cobranças recebidas</td><td style={{ ...printTdStyle, textAlign: "right", fontWeight: 700 }}>{weekly.paid_this_week}</td>
                  <td style={printTdStyle}>Valor recuperado</td><td style={{ ...printTdStyle, textAlign: "right", fontWeight: 800, fontFamily: "monospace" }}>{money(weekly.recovered_this_week)}</td>
                  <td style={printTdStyle}>Em negociação</td><td style={{ ...printTdStyle, textAlign: "right", fontWeight: 700 }}>{weekly.negotiations.length}</td>
                </tr>
              </tbody>
            </table>
            <PrintBarChart title="Contactos da Semana" data={[["Chamadas", weekly.counts.chamada, "#2563EB"], ["Emails", weekly.counts.email, "#0EA5E9"], ["WhatsApp", weekly.counts.whatsapp, "#10B981"], ["Notas", weekly.counts.nota, "#8B5CF6"]].map(([label, value, color]) => ({ label, value, color }))} />
            {weekly.negotiations.length > 0 && (
              <>
                <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>Acordos em Negociação</p>
                <table style={{ ...printTableStyle, marginBottom: 20 }}>
                  <thead>
                    <tr>{["Cliente", "Documento", "Valor", "Acordado", "Promessa", "Observações"].map((h) => <th key={h} style={["Valor", "Acordado"].includes(h) ? printThRightStyle : printThStyle}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {weekly.negotiations.map((n, i) => (
                      <tr key={i}>
                        <td style={printTdStyle}>{n.debtor_name}</td>
                        <td style={{ ...printTdStyle, fontFamily: "monospace" }}>{n.invoice_number}</td>
                        <td style={{ ...printTdStyle, fontFamily: "monospace" }}>{money(n.amount)}</td>
                        <td style={{ ...printTdStyle, fontFamily: "monospace" }}>{n.agreed_amount != null ? money(n.agreed_amount) : "—"}</td>
                        <td style={printTdStyle}>{n.promise_date ? fmtDate(n.promise_date) : "—"}</td>
                        <td style={{ ...printTdStyle, fontSize: 11 }}>{n.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>Atividades da Semana</p>
            <table style={printTableStyle}>
              <thead>
                <tr>{["Data", "Tipo", "Cliente", "Resumo"].map((h) => <th key={h} style={printThStyle}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {weekly.activities.map((a) => (
                  <tr key={a.id}>
                    <td style={{ ...printTdStyle, whiteSpace: "nowrap" }}>{fmtDT(a.created_at)}</td>
                    <td style={{ ...printTdStyle, textTransform: "capitalize" }}>{a.type}</td>
                    <td style={printTdStyle}>{a.debtor_name || "—"}</td>
                    <td style={{ ...printTdStyle, fontSize: 11 }}>{a.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </PrintReport>

      <PrintReport
        title="Relatório de Cobranças"
        subtitle={`Estado: ${statusText}${cliente ? ` · Cliente: "${cliente}"` : ""}${from || to ? ` · Vencimento: ${from || "…"} a ${to || "…"}` : ""}`}
        active={printMode === "list"}
        testid="print-report"
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {["Devedor", t("invoice"), "Vencimento", "Valor", "Estado"].map((h) => (
                <th key={h} style={{ textAlign: h === "Valor" ? "right" : "left", borderBottom: "2px solid #0f172a", padding: "6px 8px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td style={{ borderBottom: "1px solid #e2e8f0", padding: "6px 8px" }}>{c.debtor_name}</td>
                <td style={{ borderBottom: "1px solid #e2e8f0", padding: "6px 8px", fontFamily: "monospace" }}>{c.invoice_number}</td>
                <td style={{ borderBottom: "1px solid #e2e8f0", padding: "6px 8px" }}>{fmtDate(c.due_date)}</td>
                <td style={{ borderBottom: "1px solid #e2e8f0", padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}>{money(c.amount)}</td>
                <td style={{ borderBottom: "1px solid #e2e8f0", padding: "6px 8px" }}>{statusLabel(c)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ padding: "8px", fontWeight: 700 }}>Total ({filtered.length} registos)</td>
              <td style={{ padding: "8px", textAlign: "right", fontWeight: 800, fontFamily: "monospace" }}>{money(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </PrintReport>
    </div>
  );
}
