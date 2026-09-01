import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, UserPlus, Trash2, ShieldCheck, Briefcase } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { t } from "@/lib/i18n";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const EMPTY = { email: "", full_name: "", password: "", role: "cobrador", cargo: "", departamento: "" };

function Avatar({ user, size = "w-11 h-11", text = "text-sm" }) {
  if (user.photo_base64) {
    return <img src={user.photo_base64} alt={user.full_name} className={`${size} rounded-full object-cover shrink-0`} />;
  }
  const initials = (user.full_name || "?").split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return <div className={`${size} rounded-full bg-brand-soft border border-brand/30 text-brand flex items-center justify-center font-heading font-bold ${text} shrink-0`}>{initials}</div>;
}

export default function Team() {
  const { user: me } = useAuth();
  const [members, setMembers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/team").then(({ data }) => setMembers(data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const invite = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/team/invite", form);
      toast.success(`${form.full_name} adicionado à equipa`);
      setForm(EMPTY);
      setOpen(false);
      load();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (m, role) => {
    try {
      await api.put(`/team/${m.id}/role`, { role });
      toast.success("Nível de acesso atualizado");
      load();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const remove = async (m) => {
    if (!window.confirm(`Remover ${m.full_name} da equipa? Esta ação é definitiva.`)) return;
    try {
      await api.delete(`/team/${m.id}`);
      toast.success("Membro removido da equipa");
      load();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="max-w-4xl space-y-6" data-testid="team-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight flex items-center gap-3">
            <Users size={28} className="text-brand" /> Gestão de {t("team")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-mono-num font-semibold text-foreground" data-testid="team-count">{members.length}</span>
            <span>{` ${t("users").toLowerCase()} na sua empresa`}</span>
          </p>
        </div>
        <button onClick={() => setOpen(true)} data-testid="invite-member-btn"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand text-white text-sm font-semibold hover:opacity-90 hover:scale-[1.02] transition-all duration-200">
          <UserPlus size={16} /> Convidar Membro
        </button>
      </div>

      <div className="space-y-3" data-testid="team-list">
        {members.map((m) => (
          <div key={m.id} data-testid={`team-member-${m.id}`}
            className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:border-brand/40 transition-colors duration-200">
            <Avatar user={m} />
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{m.full_name} {m.id === me?.id && <span className="text-xs text-muted-foreground">(você)</span>}</p>
              <p className="text-xs text-muted-foreground truncate">{m.email}</p>
              {(m.cargo || m.departamento) && (
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <Briefcase size={11} /> {[m.cargo, m.departamento].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
              m.role === "admin" ? "bg-brand-soft text-brand border-brand/40" : "bg-secondary text-muted-foreground border-border"
            }`} data-testid={`team-role-${m.id}`}>
              {m.role === "admin" ? "Administrador" : "Cobrador"}
            </span>
            {m.id !== me?.id && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => changeRole(m, m.role === "admin" ? "cobrador" : "admin")}
                  data-testid={`team-toggle-role-${m.id}`}
                  title={m.role === "admin" ? "Alterar para Cobrador" : "Promover a Administrador"}
                  className="p-2 rounded-lg text-muted-foreground hover:text-brand hover:bg-brand-soft transition-colors duration-200"
                >
                  <ShieldCheck size={16} />
                </button>
                <button onClick={() => remove(m)} data-testid={`team-remove-${m.id}`} title="Remover da equipa"
                  className="p-2 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors duration-200">
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-md" data-testid="invite-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">Convidar Membro</DialogTitle>
            <DialogDescription className="sr-only">Formulário para convidar um novo membro para a equipa da empresa.</DialogDescription>
          </DialogHeader>
          <form onSubmit={invite} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="inv-name">Nome Completo</Label>
              <Input id="inv-name" data-testid="invite-name-input" required value={form.full_name} onChange={set("full_name")} placeholder="Ex: Ana Martins" className="bg-background" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">Email</Label>
              <Input id="inv-email" type="email" data-testid="invite-email-input" required value={form.email} onChange={set("email")} placeholder="colega@empresa.pt" className="bg-background" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-password">{t("password")} Inicial</Label>
              <Input id="inv-password" type="text" data-testid="invite-password-input" required minLength={6} value={form.password} onChange={set("password")} placeholder="Mín. 6 caracteres — partilhe com o membro" className="bg-background" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="inv-cargo">Cargo</Label>
                <Input id="inv-cargo" data-testid="invite-cargo-input" value={form.cargo} onChange={set("cargo")} placeholder="Ex: Cobrador" className="bg-background" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-depto">Departamento</Label>
                <Input id="inv-depto" data-testid="invite-departamento-input" value={form.departamento} onChange={set("departamento")} placeholder="Ex: Cobranças" className="bg-background" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Nível de Acesso</Label>
              <div className="grid grid-cols-2 gap-2" data-testid="invite-role-selector">
                {[
                  ["cobrador", "Cobrador", "Vê pendentes e regista atividades"],
                  ["admin", "Administrador", "Acesso total à plataforma"],
                ].map(([value, label, desc]) => (
                  <button key={value} type="button" data-testid={`invite-role-${value}`} onClick={() => setForm({ ...form, role: value })}
                    className={`text-left p-3 rounded-lg border transition-all duration-200 ${
                      form.role === value ? "border-brand bg-brand-soft" : "border-border hover:border-muted-foreground/40"
                    }`}>
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setOpen(false)} data-testid="invite-cancel-btn"
                className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
              <button type="submit" disabled={busy} data-testid="invite-submit-btn"
                className="px-5 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:opacity-90 transition-opacity duration-200 disabled:opacity-50">
                {busy ? "A convidar..." : "Convidar"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
