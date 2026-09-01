import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Clock, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { BUCKETS, fmtDate } from "@/lib/badges";
import { money } from "@/lib/format";
import { Input } from "@/components/ui/input";
import ChargeFormDialog from "@/components/ChargeFormDialog";
import ImportPdfDialog from "@/components/ImportPdfDialog";

export default function PendingCharges() {
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

  return (
    <div className="space-y-6" data-testid="pendentes-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight flex items-center gap-3">
            <Clock size={28} className="text-brand" /> Cobranças Pendentes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-mono-num font-semibold text-foreground" data-testid="pendentes-count">{pendentes.length}</span> cobranças por liquidar ·{" "}
            <span className="font-mono-num font-semibold text-foreground" data-testid="pendentes-total">{money(total)}</span> em dívida
          </p>
        </div>
        <div className="flex gap-2">
          <ImportPdfDialog onImported={load} />
          <button
            onClick={() => setFormOpen(true)}
            data-testid="pendentes-new-charge-btn"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand text-white text-sm font-semibold hover:opacity-90 hover:scale-[1.02] transition-all duration-200"
          >
            <Plus size={16} /> Nova Cobrança
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="relative max-w-sm mb-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar devedor ou fatura..."
            data-testid="pendentes-search-input"
            className="pl-9 bg-background"
          />
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
              {pendentes.map((c) => (
                <tr
                  key={c.id}
                  data-testid={`pendente-row-${c.id}`}
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
                    <span data-testid={`pendente-badge-${c.id}`} className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium border ${BUCKETS[c.bucket].cls}`}>
                      {c.bucket === "por_vencer" ? "Por Vencer" : `${c.days_overdue}d atraso`}
                    </span>
                  </td>
                </tr>
              ))}
              {pendentes.length === 0 && (
                <tr><td colSpan={5} className="py-10 text-center text-muted-foreground" data-testid="pendentes-empty-state">Sem cobranças pendentes. Bom trabalho!</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ChargeFormDialog open={formOpen} onOpenChange={setFormOpen} onSaved={load} />
    </div>
  );
}
