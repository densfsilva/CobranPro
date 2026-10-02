import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Contact, Search, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { fmtDateTime } from "@/lib/badges";
import { money, idLabel } from "@/lib/format";
import { maskPhone, testIdSafe } from "@/lib/masks";
import { t } from "@/lib/i18n";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";

const overdueCls = (d) => (d > 60 ? "bg-purple-500/15 text-purple-400 border-purple-500/30" : d > 30 ? "bg-rose-500/15 text-rose-400 border-rose-500/30" : d > 15 ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : d > 0 ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30");

export default function Clients() {
  const { company } = useAuth();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/clients").then(({ data }) => setClients(data)).catch((err) => toast.error(formatApiError(err))).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().replace(/[.\-/\s]/g, "");
    return clients.filter((c) => !q || c.debtor_name.toLowerCase().replace(/\s/g, "").includes(q) || (c.debtor_nif || "").replace(/\D/g, "").includes(q) || (c.debtor_email || "").toLowerCase().includes(q));
  }, [clients, search]);

  const totalDebt = clients.reduce((s, c) => s + c.pending_total, 0);
  const country = company?.country || "PT";

  return (
    <div className="space-y-6" data-testid="clientes-page">
      <div>
        <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight flex items-center gap-3"><Contact size={28} className="text-brand" /> Clientes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          <span className="font-mono-num font-semibold text-foreground" data-testid="clientes-count">{clients.length}</span>
          <span> clientes consolidados por {idLabel()} · </span>
          <span className="font-mono-num font-semibold text-foreground" data-testid="clientes-total-debt">{money(totalDebt)}</span>
          <span> em dívida</span>
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="relative max-w-sm mb-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Pesquisar nome, ${idLabel()} ou email...`} data-testid="clientes-search-input" className="pl-9 bg-background" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="pb-3 font-medium">Cliente</th>
                <th className="pb-3 font-medium">Contactos</th>
                <th className="pb-3 font-medium text-right">{t("invoicePlural")}</th>
                <th className="pb-3 font-medium text-right">Em dívida</th>
                <th className="pb-3 font-medium text-right">Maior atraso</th>
                <th className="pb-3 font-medium">Última atividade</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.key} data-testid={`client-row-${testIdSafe(c.key)}`} onClick={() => navigate(`/clientes/${encodeURIComponent(c.key)}`)}
                  className="border-b border-border/50 last:border-0 cursor-pointer hover:bg-secondary/50 transition-colors duration-150">
                  <td className="py-3 pr-3">
                    <p className="font-medium">{c.debtor_name}</p>
                    <p className="text-xs text-muted-foreground font-mono-num">{c.debtor_nif || "sem " + idLabel()}</p>
                  </td>
                  <td className="py-3 pr-3 text-xs text-muted-foreground space-y-0.5">
                    {c.debtor_email && <p className="flex items-center gap-1.5 truncate max-w-[220px]"><Mail size={11} /> {c.debtor_email}</p>}
                    {(c.whatsapp || c.debtor_phone) && <p className="flex items-center gap-1.5"><Phone size={11} /> {maskPhone(c.whatsapp || c.debtor_phone, country)}</p>}
                    {!c.debtor_email && !c.debtor_phone && !c.whatsapp && <span>—</span>}
                  </td>
                  <td className="py-3 pr-3 text-right font-mono-num">
                    <span className="font-semibold">{c.invoice_count}</span>
                    {c.pending_count > 0 && <span className="text-xs text-muted-foreground"> · {c.pending_count} pend.</span>}
                  </td>
                  <td className="py-3 pr-3 text-right font-mono-num font-semibold" data-testid={`client-debt-${testIdSafe(c.key)}`}>{c.pending_total > 0 ? money(c.pending_total) : <span className="text-muted-foreground">—</span>}</td>
                  <td className="py-3 pr-3 text-right">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium border ${overdueCls(c.max_days_overdue)}`}>
                      {c.pending_count === 0 ? "Sem pendentes" : c.max_days_overdue > 0 ? `${c.max_days_overdue}d` : "Por vencer"}
                    </span>
                  </td>
                  <td className="py-3 text-xs text-muted-foreground">{fmtDateTime(c.last_activity_at)}</td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-muted-foreground" data-testid="clientes-empty-state">Nenhum cliente encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
