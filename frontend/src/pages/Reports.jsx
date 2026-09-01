import { useEffect, useMemo, useState } from "react";
import { Printer, FileBarChart, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/badges";
import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const { company } = useAuth();
  const [charges, setCharges] = useState([]);
  const [cliente, setCliente] = useState("");
  const [status, setStatus] = useState("todas");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    api.get("/charges").then(({ data }) => setCharges(data));
  }, []);

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
  const generatedAt = new Date().toLocaleString("pt-PT", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

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
          onClick={() => window.print()}
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

      <div id="print-report" data-testid="print-report">
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
          {company.logo_base64
            ? <img src={company.logo_base64} alt={company.company_name} style={{ width: 48, height: 48, objectFit: "contain" }} />
            : <div style={{ width: 48, height: 48, borderRadius: 8, background: company.primary_color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18 }}>
                {company.company_name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
              </div>}
          <div>
            <p style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{company.company_name}</p>
            <p style={{ fontSize: 12, color: "#475569", margin: 0 }}>{company.nif ? `${company.country === "BR" ? "CNPJ" : "NIF"} ${company.nif} · ` : ""}{company.address ? `${company.address} · ` : ""}{company.email}</p>
          </div>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "16px 0 4px" }}>Relatório de Cobranças</h1>
        <p style={{ fontSize: 12, color: "#475569", margin: "0 0 16px" }}>
          Gerado a {generatedAt} · Estado: {statusText}{cliente ? ` · Cliente: "${cliente}"` : ""}{from || to ? ` · Vencimento: ${from || "…"} a ${to || "…"}` : ""}
        </p>
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
      </div>
    </div>
  );
}
