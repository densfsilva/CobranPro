import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, History, Printer, Pencil } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { BUCKETS, fmtDate } from "@/lib/badges";
import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PrintReport, { printTableStyle, printThStyle, printThRightStyle, printTdStyle } from "@/components/PrintReport";
import PeriodFilter, { periodSubtitle } from "@/components/PeriodFilter";

const fmtPaid = (iso) => (iso ? fmtDate(iso.slice(0, 10)) : "—");
const lateLabel = (d) => String(Math.max(d ?? 0, 0));
const lateCls = (d) => (!d || d <= 0 ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : d <= 30 ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : "bg-rose-500/15 text-rose-400 border-rose-500/30");

export default function ReceivedHistory() {
  const { isAdmin } = useAuth();
  const [charges, setCharges] = useState([]);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editing, setEditing] = useState(null);
  const [paidDate, setPaidDate] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const load = () => api.get("/charges").then(({ data }) => setCharges(data));
  useEffect(() => { load(); }, []);

  const recebidos = useMemo(() => {
    return charges
      .filter((c) => c.status === "paga")
      .filter((c) => !search ||
        c.debtor_name.toLowerCase().includes(search.toLowerCase()) ||
        c.invoice_number.toLowerCase().includes(search.toLowerCase()))
      .filter((c) => (!from || c.due_date >= from) && (!to || c.due_date <= to))
      .sort((a, b) => b.due_date.localeCompare(a.due_date));
  }, [charges, search, from, to]);

  const total = recebidos.reduce((s, c) => s + c.amount, 0);
  const avgLate = recebidos.length ? Math.round(recebidos.reduce((s, c) => s + (c.paid_days_late || 0), 0) / recebidos.length) : 0;

  const openEdit = (e, c) => {
    e.stopPropagation();
    setEditing(c);
    setPaidDate((c.paid_at || new Date().toISOString()).slice(0, 10));
  };

  const savePaid = async () => {
    setBusy(true);
    try {
      await api.put(`/charges/${editing.id}`, { ...editing, status: "paga", paid_at: paidDate });
      toast.success("Data de recebimento atualizada");
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6" data-testid="recebidos-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight flex items-center gap-3"><History size={28} className="text-brand" /> Histórico de Recebidos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-mono-num font-semibold text-foreground" data-testid="recebidos-count">{recebidos.length}</span>
            <span> cobranças liquidadas · </span>
            <span className="font-mono-num font-semibold text-emerald-400" data-testid="recebidos-total">{money(total)}</span>
            <span> recuperados · atraso médio </span>
            <span className="font-mono-num font-semibold text-foreground" data-testid="recebidos-avg-late">{avgLate}d</span>
          </p>
        </div>
        <button onClick={() => window.print()} data-testid="recebidos-print-btn"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-brand/50 hover:bg-brand-soft transition-all duration-200">
          <Printer size={16} /> Gerar Relatório PDF
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative max-w-sm flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Pesquisar devedor ou ${t("invoiceLower")}...`} data-testid="recebidos-search-input" className="pl-9 bg-background" />
          </div>
          <PeriodFilter from={from} to={to} onFrom={setFrom} onTo={setTo} testid="recebidos" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="pb-3 font-medium">Devedor</th>
                <th className="pb-3 font-medium">{t("invoice")}</th>
                <th className="pb-3 font-medium">Vencimento</th>
                <th className="pb-3 font-medium">Recebimento</th>
                <th className="pb-3 font-medium text-right">Dias de Atraso</th>
                <th className="pb-3 font-medium text-right">Valor</th>
                <th className="pb-3 font-medium text-right">Estado</th>
              </tr>
            </thead>
            <tbody>
              {recebidos.map((c) => (
                <tr key={c.id} data-testid={`recebido-row-${c.id}`} onClick={() => navigate(`/cobranca/${c.id}`)} className="border-b border-border/50 last:border-0 cursor-pointer hover:bg-secondary/50 transition-colors duration-150">
                  <td className="py-3 pr-3">
                    <p className="font-medium">{c.debtor_name}</p>
                    <p className="text-xs text-muted-foreground">{c.debtor_nif || "—"}</p>
                  </td>
                  <td className="py-3 pr-3 font-mono-num text-xs">{c.invoice_number}</td>
                  <td className="py-3 pr-3 text-muted-foreground">{fmtDate(c.due_date)}</td>
                  <td className="py-3 pr-3 text-emerald-400/90">
                    <span className="inline-flex items-center gap-1.5">
                      <span data-testid={`recebido-paid-at-${c.id}`}>{fmtPaid(c.paid_at)}</span>
                      {isAdmin && (
                        <button onClick={(e) => openEdit(e, c)} data-testid={`recebido-edit-paid-${c.id}`} title="Editar data de recebimento"
                          className="p-1 rounded-md text-muted-foreground hover:text-brand hover:bg-brand-soft transition-colors duration-150"><Pencil size={12} /></button>
                      )}
                    </span>
                  </td>
                  <td className="py-3 pr-3 text-right">
                    <span data-testid={`recebido-late-${c.id}`} className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium border font-mono-num ${lateCls(c.paid_days_late)}`}>{lateLabel(c.paid_days_late)}</span>
                  </td>
                  <td className="py-3 pr-3 text-right font-mono-num font-semibold">{money(c.amount)}</td>
                  <td className="py-3 text-right">
                    <span data-testid={`recebido-badge-${c.id}`} className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium border ${BUCKETS.paga.cls}`}>Paga</span>
                  </td>
                </tr>
              ))}
              {recebidos.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-muted-foreground" data-testid="recebidos-empty-state">Ainda não há cobranças liquidadas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PrintReport title="Histórico de Recebidos" subtitle={`${search ? `Filtro: "${search}"` : "Todas as cobranças liquidadas"}${periodSubtitle(from, to)} · Atraso médio: ${avgLate} dias`} testid="print-report-recebidos">
        <table style={printTableStyle}>
          <thead>
            <tr>{["Devedor", t("invoice"), "Vencimento", "Recebimento", "Dias de Atraso", "Valor", "Estado"].map((h) => <th key={h} style={["Valor", "Dias de Atraso"].includes(h) ? printThRightStyle : printThStyle}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {recebidos.map((c) => (
              <tr key={c.id}>
                <td style={printTdStyle}>{c.debtor_name}</td>
                <td style={{ ...printTdStyle, fontFamily: "monospace" }}>{c.invoice_number}</td>
                <td style={printTdStyle}>{fmtDate(c.due_date)}</td>
                <td style={printTdStyle}>{fmtPaid(c.paid_at)}</td>
                <td style={{ ...printTdStyle, textAlign: "right", fontFamily: "monospace" }}>{lateLabel(c.paid_days_late)}</td>
                <td style={{ ...printTdStyle, textAlign: "right", fontFamily: "monospace" }}>{money(c.amount)}</td>
                <td style={printTdStyle}>Recebido</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} style={{ ...printTdStyle, fontWeight: 700 }}>Total recuperado ({recebidos.length} registos)</td>
              <td style={{ ...printTdStyle, textAlign: "right", fontWeight: 800, fontFamily: "monospace" }}>{money(total)}</td>
              <td style={printTdStyle} />
            </tr>
          </tfoot>
        </table>
      </PrintReport>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="bg-card border-border max-w-sm" data-testid="paid-at-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">Data de Recebimento</DialogTitle>
            <DialogDescription className="text-xs">{editing?.debtor_name} · {editing?.invoice_number} · vencida a {editing ? fmtDate(editing.due_date) : ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="paid_at">Recebido em</Label>
            <Input id="paid_at" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} data-testid="paid-at-input" className="bg-background" />
            {editing && paidDate && (
              <p className="text-xs text-muted-foreground" data-testid="paid-at-preview">
                Dias de atraso: <span className="font-mono-num text-foreground">{Math.max(Math.round((new Date(paidDate) - new Date(editing.due_date)) / 86400000), 0)}</span>
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setEditing(null)} data-testid="paid-at-cancel">Cancelar</Button>
            <Button onClick={savePaid} disabled={busy || !paidDate} data-testid="paid-at-save-btn" className="bg-brand text-white hover:opacity-90">{busy ? "A guardar..." : t("save")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
