import { useEffect, useState, useMemo, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Clock, Plus, Printer, ChevronDown, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { BUCKETS, fmtDate, statusLabelOf } from "@/lib/badges";
import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import ChargeFormDialog from "@/components/ChargeFormDialog";
import ImportPdfDialog from "@/components/ImportPdfDialog";
import WhatsAppQuickButton from "@/components/WhatsAppQuickButton";
import PrintReport, { printTableStyle, printThStyle, printThRightStyle, printTdStyle } from "@/components/PrintReport";

export default function PendingCharges() {
  const { isAdmin } = useAuth();
  const [charges, setCharges] = useState([]);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    const { data } = await api.get("/charges");
    setCharges(data);
  };

  useEffect(() => { load(); }, []);

  const pendentes = useMemo(() => {
    return charges
      .filter((c) => c.status === "pendente")
      .filter((c) => !search ||
        c.debtor_name.toLowerCase().includes(search.toLowerCase()) ||
        c.invoice_number.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.days_overdue - a.days_overdue);
  }, [charges, search]);

  const total = pendentes.reduce((s, c) => s + c.amount, 0);

  const [expanded, setExpanded] = useState({});
  const groups = useMemo(() => {
    const map = new Map();
    for (const c of pendentes) {
      if (!map.has(c.debtor_name)) map.set(c.debtor_name, []);
      map.get(c.debtor_name).push(c);
    }
    return [...map.entries()].map(([name, items]) => ({
      name,
      items,
      doc: items[0]?.debtor_nif || "",
      total: items.reduce((s, c) => s + c.amount, 0),
    }));
  }, [pendentes]);

  return (
    <div className="space-y-6" data-testid="pendentes-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight flex items-center gap-3">
            <Clock size={28} className="text-brand" /> Cobranças Pendentes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-mono-num font-semibold text-foreground" data-testid="pendentes-count">{pendentes.length}</span>
            <span>{` ${t("invoiceLower") === "factura" ? "cobranças" : "cobranças"} por liquidar · `}</span>
            <span className="font-mono-num font-semibold text-foreground" data-testid="pendentes-total">{money(total)}</span>
            <span> em dívida</span>
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              data-testid="pendentes-print-btn"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-brand/50 hover:bg-brand-soft transition-all duration-200"
            >
              <Printer size={16} /> Gerar Relatório PDF
            </button>
            <ImportPdfDialog onImported={load} />
            <button
              onClick={() => setFormOpen(true)}
              data-testid="pendentes-new-charge-btn"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand text-white text-sm font-semibold hover:opacity-90 hover:scale-[1.02] transition-all duration-200"
            >
              <Plus size={16} /> Nova Cobrança
            </button>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="relative max-w-sm mb-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Pesquisar devedor ou ${t("invoiceLower")}...`}
            data-testid="pendentes-search-input"
            className="pl-9 bg-background"
          />
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
                      data-testid={`debtor-group-${gi}`}
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
                      <td className="py-3 pr-3 text-right font-mono-num font-bold text-brand" data-testid={`debtor-group-total-${gi}`}>{money(g.total)}</td>
                      <td className="py-3 text-right text-xs text-muted-foreground">
                        {g.items.length} {g.items.length === 1 ? t("invoiceLower") : t("invoiceLowerPlural")}
                      </td>
                      <td />
                    </tr>
                    {isOpen && g.items.map((c) => (
                <tr
                  key={c.id}
                  data-testid={`pendente-row-${c.id}`}
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
                    <span data-testid={`pendente-badge-${c.id}`} className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium border ${BUCKETS[c.bucket].cls}`}>
                      {c.bucket === "por_vencer" ? "Por Vencer" : `${c.days_overdue}d atraso`}
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
              {pendentes.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-muted-foreground" data-testid="pendentes-empty-state">Sem cobranças pendentes. Bom trabalho!</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PrintReport
        title={`Listagem de Cobranças Pendentes`}
        subtitle={search ? `Filtro: "${search}"` : "Todas as cobranças por liquidar"}
        testid="print-report-pendentes"
      >
        <table style={printTableStyle}>
          <thead>
            <tr>{["Devedor", "Factura", "Vencimento", "Dias", "Valor", "Estado"].map((h) => <th key={h} style={h === "Valor" ? printThRightStyle : printThStyle}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {pendentes.map((c) => (
              <tr key={c.id}>
                <td style={printTdStyle}>{c.debtor_name}</td>
                <td style={{ ...printTdStyle, fontFamily: "monospace" }}>{c.invoice_number}</td>
                <td style={printTdStyle}>{fmtDate(c.due_date)}</td>
                <td style={printTdStyle}>{c.days_overdue}d</td>
                <td style={{ ...printTdStyle, textAlign: "right", fontFamily: "monospace" }}>{money(c.amount)}</td>
                <td style={printTdStyle}>{statusLabelOf(c)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} style={{ ...printTdStyle, fontWeight: 700 }}>Total ({pendentes.length} registos)</td>
              <td style={{ ...printTdStyle, textAlign: "right", fontWeight: 800, fontFamily: "monospace" }}>{money(total)}</td>
              <td style={printTdStyle} />
            </tr>
          </tfoot>
        </table>
      </PrintReport>

      <ChargeFormDialog open={formOpen} onOpenChange={setFormOpen} onSaved={load} />
    </div>
  );
}
