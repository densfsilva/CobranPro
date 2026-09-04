import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Ban, CheckCircle2, Search } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const fmtRegisto = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-PT") : "—");

export default function SuperAdmin() {
  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [target, setTarget] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get("/superadmin/companies");
      setCompanies(data);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return companies.filter((c) => !q || c.company_name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
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
    } finally {
      setBusy("");
    }
  };

  const ativas = companies.filter((c) => !c.blocked).length;

  return (
    <div className="space-y-6" data-testid="superadmin-page">
      <div>
        <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight flex items-center gap-3">
          <ShieldCheck size={28} className="text-brand" /> Super Admin — Assinaturas
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          <span className="font-mono-num font-semibold text-foreground" data-testid="tenants-count">{companies.length}</span>
          <span> empresas registadas · </span>
          <span className="font-mono-num font-semibold text-emerald-400" data-testid="tenants-active-count">{ativas}</span>
          <span> ativas</span>
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="relative max-w-sm mb-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar empresa ou email..."
            data-testid="tenants-search-input"
            className="pl-9 bg-background"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="pb-3 font-medium">Empresa</th>
                <th className="pb-3 font-medium">País</th>
                <th className="pb-3 font-medium text-right">Utilizadores</th>
                <th className="pb-3 font-medium text-right">Cobranças</th>
                <th className="pb-3 font-medium">Registada em</th>
                <th className="pb-3 font-medium text-right">Estado</th>
                <th className="pb-3 font-medium text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} data-testid={`tenant-row-${c.id}`} className="border-b border-border/50 last:border-0">
                  <td className="py-3 pr-3">
                    <p className="font-medium">{c.company_name}</p>
                    <p className="text-xs text-muted-foreground">{c.email}</p>
                  </td>
                  <td className="py-3 pr-3 text-muted-foreground">{c.country}</td>
                  <td className="py-3 pr-3 text-right font-mono-num">{c.user_count}</td>
                  <td className="py-3 pr-3 text-right font-mono-num">{c.charge_count}</td>
                  <td className="py-3 pr-3 text-muted-foreground">{fmtRegisto(c.created_at)}</td>
                  <td className="py-3 text-right">
                    <span data-testid={`tenant-status-${c.id}`} className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium border ${c.blocked ? "bg-rose-500/10 text-rose-400 border-rose-500/30" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"}`}>
                      {c.blocked ? "Bloqueada" : "Ativa"}
                    </span>
                  </td>
                  <td className="py-3 pl-2 text-right">
                    <button
                      onClick={() => setTarget(c)}
                      disabled={busy === c.id}
                      data-testid={`tenant-toggle-${c.id}`}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${c.blocked ? "bg-emerald-600 text-white hover:opacity-90" : "border border-rose-500/40 text-rose-400 hover:bg-rose-500/10"}`}
                    >
                      {c.blocked ? <CheckCircle2 size={13} /> : <Ban size={13} />}
                      {busy === c.id ? "A processar..." : c.blocked ? "Ativar" : "Bloquear"}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-muted-foreground" data-testid="tenants-empty-state">Nenhuma empresa encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog open={!!target} onOpenChange={(v) => !v && setTarget(null)}>
        <AlertDialogContent className="bg-card border-border" data-testid="tenant-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">
              {target?.blocked ? "Reativar empresa" : "Bloquear empresa"}
            </AlertDialogTitle>
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
