import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Handshake } from "lucide-react";
import { api } from "@/lib/api";
import { BUCKETS, fmtDate } from "@/lib/badges";
import { money } from "@/lib/format";
import { Input } from "@/components/ui/input";

export default function NegotiationCharges() {
  const [charges, setCharges] = useState([]);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/charges").then(({ data }) => setCharges(data));
  }, []);

  const negociacao = useMemo(() => {
    return charges
      .filter((c) => c.status === "negociacao")
      .filter((c) => !search ||
        c.debtor_name.toLowerCase().includes(search.toLowerCase()) ||
        c.invoice_number.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.days_overdue - a.days_overdue);
  }, [charges, search]);

  const total = negociacao.reduce((s, c) => s + c.amount, 0);

  return (
    <div className="space-y-6" data-testid="negociacao-page">
      <div>
        <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight flex items-center gap-3">
          <Handshake size={28} className="text-orange-400" /> Em Negociação
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          <span className="font-mono-num font-semibold text-foreground" data-testid="negociacao-count">{negociacao.length}</span> faturas em negociação ·{" "}
          <span className="font-mono-num font-semibold text-orange-400" data-testid="negociacao-total">{money(total)}</span> em acordo
        </p>
        <p className="text-xs text-muted-foreground mt-1">Estas faturas estão fora do fluxo de cobrança ativa — sem lembretes automáticos enquanto durar a negociação.</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="relative max-w-sm mb-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar devedor ou fatura..."
            data-testid="negociacao-search-input"
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
                <th className="pb-3 font-medium">Promessa Pag.</th>
                <th className="pb-3 font-medium text-right">Valor</th>
                <th className="pb-3 font-medium text-right">Estado</th>
              </tr>
            </thead>
            <tbody>
              {negociacao.map((c) => (
                <tr
                  key={c.id}
                  data-testid={`negociacao-row-${c.id}`}
                  onClick={() => navigate(`/cobranca/${c.id}`)}
                  className="border-b border-border/50 last:border-0 cursor-pointer hover:bg-secondary/50 transition-colors duration-150"
                >
                  <td className="py-3 pr-3">
                    <p className="font-medium">{c.debtor_name}</p>
                    <p className="text-xs text-muted-foreground">{c.debtor_nif || "—"}</p>
                  </td>
                  <td className="py-3 pr-3 font-mono-num text-xs">{c.invoice_number}</td>
                  <td className="py-3 pr-3 text-muted-foreground">{fmtDate(c.due_date)}</td>
                  <td className="py-3 pr-3">
                    {c.promise_date ? (
                      <span className={c.promise_date <= new Date().toISOString().slice(0, 10) ? "text-rose-400 font-medium" : "text-muted-foreground"}>
                        {fmtDate(c.promise_date)}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="py-3 pr-3 text-right font-mono-num font-semibold">
                    {money(c.amount)}
                    {c.agreed_amount != null && (
                      <span className="block text-xs text-orange-400 font-normal">acordado {money(c.agreed_amount)}</span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    <span data-testid={`negociacao-badge-${c.id}`} className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium border ${BUCKETS.negociacao.cls}`}>
                      Em Negociação
                    </span>
                  </td>
                </tr>
              ))}
              {negociacao.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-muted-foreground" data-testid="negociacao-empty-state">Nenhuma fatura em negociação. Use o botão "Em Negociação" na ficha de uma cobrança.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
