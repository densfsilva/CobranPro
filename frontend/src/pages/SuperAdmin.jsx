import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Ban, CheckCircle2, Search, Building2, Users, Wallet, TrendingUp, BadgeCheck, Settings2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { api, formatApiError } from "@/lib/api";
import { money } from "@/lib/format";
import { fmtDate } from "@/lib/badges";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import SubscriptionDialog from "@/components/SubscriptionDialog";

const STATUS = {
  ativa: { label: "Ativa", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  expirada: { label: "Expirada", cls: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  bloqueada: { label: "Bloqueada", cls: "bg-rose-500/10 text-rose-400 border-rose-500/30" },
};
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const monthLabel = (m) => `${MONTHS[parseInt(m.slice(5, 7), 10) - 1]}/${m.slice(2, 4)}`;
const tooltipStyle = { background: "#111827", border: "1px solid #1F2937", borderRadius: 8, fontSize: 12 };

function Kpi({ icon: Icon, label, value, sub, testid, cls = "text-brand" }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5" data-testid={testid}>
      <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><Icon size={13} className={cls} /> {label}</p>
      <p className="font-heading text-2xl font-extrabold font-mono-num mt-2">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function Chart({ title, data, dataKey, color, fmt, testid }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5" data-testid={testid}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">{title}</p>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 480, height: 220 }}>
          <BarChart data={data} margin={{ top: 4, right: 0, left: -16, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8b94a7" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#8b94a7" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={tooltipStyle} formatter={(v) => [fmt ? fmt(v) : v, title]} />
            <Bar dataKey={dataKey} radius={[6, 6, 0, 0]}>{data.map((_, i) => <Cell key={i} fill={color} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function SuperAdmin() {
  const [overview, setOverview] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [target, setTarget] = useState(null);
  const [subTarget, setSubTarget] = useState(null);
  const [chartReady, setChartReady] = useState(false);

  const load = async () => {
    try {
      const [o, c] = await Promise.all([api.get("/superadmin/overview"), api.get("/superadmin/companies")]);
      setOverview(o.data);
      setCompanies(c.data);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  useEffect(() => { load(); const id = requestAnimationFrame(() => setChartReady(true)); return () => cancelAnimationFrame(id); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return companies.filter((c) => !q || c.company_name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || (c.license_id || "").toLowerCase().includes(q) || (c.plan || "").toLowerCase().includes(q));
  }, [companies, search]);

  const confirmToggle = async () => {
    const c = target;
    setTarget(null);
    if (!c) return;
    setBusy(c.id);
    try {
      await api.put(`/superadmin/companies/${c.id}/status`, { blocked: !c.blocked });
      toast.success(c.blocked ? "Empresa reativada" : "Empresa bloqueada — login suspenso");
      await load();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally { setBusy(""); }
  };

  const series = (overview?.series || []).map((s) => ({ ...s, label: monthLabel(s.month) }));

  return (
    <div className="space-y-6" data-testid="superadmin-page">
      <div>
        <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight flex items-center gap-3"><ShieldCheck size={28} className="text-brand" /> Gestão da Plataforma</h1>
        <p className="text-sm text-muted-foreground mt-1">Visão global do Cobranpro: faturamento das assinaturas, utilizadores e licenças de cada empresa.</p>
      </div>

      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Kpi icon={Building2} label="Empresas" value={overview.companies_total} sub={`${overview.companies_active} ativas · ${overview.companies_expired} expiradas · ${overview.companies_blocked} bloqueadas`} testid="sa-kpi-companies" />
          <Kpi icon={Users} label="Utilizadores" value={overview.users_total} sub="em todas as empresas" testid="sa-kpi-users" cls="text-sky-400" />
          <Kpi icon={TrendingUp} label="MRR" value={money(overview.mrr)} sub={`ARR ${money(overview.arr)}`} testid="sa-kpi-mrr" cls="text-emerald-400" />
          <Kpi icon={Wallet} label="Volume gerido" value={money(overview.volume_total)} sub={`${overview.charges_total} cobranças registadas`} testid="sa-kpi-volume" cls="text-amber-400" />
          <Kpi icon={BadgeCheck} label="Planos" value={overview.plans.length} sub={overview.plans.slice(0, 3).map((p) => `${p.plan} (${p.count})`).join(" · ")} testid="sa-kpi-plans" cls="text-purple-400" />
        </div>
      )}

      {chartReady && series.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Chart title="Faturamento mensal (MRR)" data={series} dataKey="mrr" color="#10B981" fmt={money} testid="sa-chart-mrr" />
          <Chart title="Empresas ativas por mês" data={series} dataKey="companies" color="var(--brand)" testid="sa-chart-companies" />
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="relative max-w-sm mb-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar empresa, email, plano ou licença..." data-testid="tenants-search-input" className="pl-9 bg-background" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="pb-3 font-medium">Empresa</th>
                <th className="pb-3 font-medium">Plano</th>
                <th className="pb-3 font-medium text-right">Mensal</th>
                <th className="pb-3 font-medium">Validade</th>
                <th className="pb-3 font-medium">Licença</th>
                <th className="pb-3 font-medium text-right">Utiliz.</th>
                <th className="pb-3 font-medium text-right">Cobranças</th>
                <th className="pb-3 font-medium text-right">Estado</th>
                <th className="pb-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const st = STATUS[c.license_status] || STATUS.ativa;
                return (
                  <tr key={c.id} data-testid={`tenant-row-${c.id}`} className="border-b border-border/50 last:border-0">
                    <td className="py-3 pr-3">
                      <p className="font-medium">{c.company_name} <span className="text-[10px] text-muted-foreground font-normal">{c.country}</span></p>
                      <p className="text-xs text-muted-foreground">{c.email} · desde {fmtDate(c.created_at?.slice(0, 10))}</p>
                    </td>
                    <td className="py-3 pr-3"><span className="inline-block px-2 py-0.5 rounded-md bg-secondary text-xs font-medium" data-testid={`tenant-plan-${c.id}`}>{c.plan || "Trial"}</span></td>
                    <td className="py-3 pr-3 text-right font-mono-num" data-testid={`tenant-price-${c.id}`}>{money(c.plan_price || 0)}</td>
                    <td className="py-3 pr-3 text-muted-foreground" data-testid={`tenant-valid-${c.id}`}>{c.license_valid_until ? fmtDate(c.license_valid_until) : "Vitalícia"}</td>
                    <td className="py-3 pr-3 font-mono-num text-xs" data-testid={`tenant-license-${c.id}`}>{c.license_id || "—"}</td>
                    <td className="py-3 pr-3 text-right font-mono-num">{c.user_count}</td>
                    <td className="py-3 pr-3 text-right font-mono-num">{c.charge_count}<span className="text-xs text-muted-foreground"> · {money(c.volume)}</span></td>
                    <td className="py-3 text-right">
                      <span data-testid={`tenant-status-${c.id}`} className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium border ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="py-3 pl-2 text-right">
                      <div className="inline-flex gap-1.5">
                        <button onClick={() => setSubTarget(c)} data-testid={`tenant-subscription-${c.id}`} title="Gerir assinatura"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-brand/40 text-brand hover:bg-brand-soft transition-all duration-200">
                          <Settings2 size={13} /> Assinatura
                        </button>
                        <button onClick={() => setTarget(c)} disabled={busy === c.id} data-testid={`tenant-toggle-${c.id}`}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${c.blocked ? "bg-emerald-600 text-white hover:opacity-90" : "border border-rose-500/40 text-rose-400 hover:bg-rose-500/10"}`}>
                          {c.blocked ? <CheckCircle2 size={13} /> : <Ban size={13} />}
                          {busy === c.id ? "..." : c.blocked ? "Ativar" : "Bloquear"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-muted-foreground" data-testid="tenants-empty-state">Nenhuma empresa encontrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <SubscriptionDialog company={subTarget} open={!!subTarget} onOpenChange={(v) => !v && setSubTarget(null)} onSaved={load} />

      <AlertDialog open={!!target} onOpenChange={(v) => !v && setTarget(null)}>
        <AlertDialogContent className="bg-card border-border" data-testid="tenant-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">{target?.blocked ? "Reativar empresa" : "Bloquear empresa"}</AlertDialogTitle>
            <AlertDialogDescription>
              {target?.blocked
                ? `"${target?.company_name}" vai recuperar o acesso imediato à plataforma.`
                : `"${target?.company_name}" vai perder o acesso imediato à plataforma. Os utilizadores verão a mensagem para atualizar o plano.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="tenant-confirm-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmToggle} data-testid="tenant-confirm-action" className={target?.blocked ? "bg-emerald-600 text-white hover:opacity-90" : "bg-rose-600 text-white hover:opacity-90"}>
              {target?.blocked ? "Ativar" : "Bloquear"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
