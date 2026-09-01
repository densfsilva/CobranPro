import { useState, useRef } from "react";
import { toast } from "sonner";
import { UserCircle, Upload, Save, KeyRound } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({
    full_name: user.full_name || "",
    cargo: user.cargo || "",
    departamento: user.departamento || "",
    photo_base64: user.photo_base64 || "",
  });
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [busy, setBusy] = useState(false);
  const [busyPw, setBusyPw] = useState(false);
  const fileRef = useRef(null);

  const onPhotoPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) {
      toast.error("Fotografia demasiado grande (máx 1.5MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, photo_base64: reader.result }));
    reader.readAsDataURL(file);
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.put("/profile", form);
      updateUser(data);
      toast.success("Perfil atualizado");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const changePw = async (e) => {
    e.preventDefault();
    setBusyPw(true);
    try {
      await api.put("/profile/password", pw);
      setPw({ current_password: "", new_password: "" });
      toast.success("Palavra-passe alterada com sucesso");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusyPw(false);
    }
  };

  const initials = (form.full_name || "?").split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  return (
    <div className="max-w-2xl space-y-6" data-testid="profile-page">
      <div>
        <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight flex items-center gap-3">
          <UserCircle size={28} className="text-brand" /> O Meu Perfil
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {user.email} · <span className={user.role === "admin" ? "text-brand font-medium" : ""}>{user.role === "admin" ? "Administrador" : "Cobrador"}</span>
        </p>
      </div>

      <form onSubmit={save} className="bg-card border border-border rounded-xl p-6 space-y-5" data-testid="profile-form">
        <div className="flex items-center gap-5">
          {form.photo_base64 ? (
            <img src={form.photo_base64} alt="Fotografia" className="w-20 h-20 rounded-full object-cover border border-border" data-testid="profile-photo-preview" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-brand-soft border border-brand/30 text-brand flex items-center justify-center font-heading font-bold text-2xl" data-testid="profile-photo-preview">{initials}</div>
          )}
          <div className="space-y-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhotoPick} data-testid="profile-photo-input" />
            <button type="button" onClick={() => fileRef.current?.click()} data-testid="profile-photo-btn"
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors duration-200">
              <Upload size={15} /> Carregar Fotografia
            </button>
            {form.photo_base64 && (
              <button type="button" onClick={() => setForm({ ...form, photo_base64: "" })} data-testid="profile-photo-remove"
                className="text-xs text-rose-400 hover:underline block">Remover fotografia</button>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="full_name">Nome Completo</Label>
          <Input id="full_name" data-testid="profile-full-name-input" required value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="bg-background" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cargo">Cargo</Label>
            <Input id="cargo" data-testid="profile-cargo-input" value={form.cargo}
              onChange={(e) => setForm({ ...form, cargo: e.target.value })} placeholder="Ex: Gestor de Cobranças" className="bg-background" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="departamento">Departamento</Label>
            <Input id="departamento" data-testid="profile-departamento-input" value={form.departamento}
              onChange={(e) => setForm({ ...form, departamento: e.target.value })} placeholder="Ex: Financeiro" className="bg-background" />
          </div>
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={busy} data-testid="profile-save-btn"
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand text-white text-sm font-semibold hover:opacity-90 transition-opacity duration-200 disabled:opacity-50">
            <Save size={15} /> {busy ? "A guardar..." : "Guardar Perfil"}
          </button>
        </div>
      </form>

      <form onSubmit={changePw} className="bg-card border border-border rounded-xl p-6 space-y-4" data-testid="password-form">
        <h2 className="font-heading text-lg font-semibold flex items-center gap-2"><KeyRound size={18} className="text-brand" /> Alterar Palavra-passe</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="current_password">Palavra-passe Atual</Label>
            <Input id="current_password" type="password" data-testid="profile-current-password-input" required value={pw.current_password}
              onChange={(e) => setPw({ ...pw, current_password: e.target.value })} className="bg-background" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new_password">Nova Palavra-passe</Label>
            <Input id="new_password" type="password" data-testid="profile-new-password-input" required minLength={6} value={pw.new_password}
              onChange={(e) => setPw({ ...pw, new_password: e.target.value })} placeholder="Mín. 6 caracteres" className="bg-background" />
          </div>
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={busyPw} data-testid="profile-password-save-btn"
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border text-sm font-semibold hover:bg-secondary transition-colors duration-200 disabled:opacity-50">
            {busyPw ? "A alterar..." : "Alterar Palavra-passe"}
          </button>
        </div>
      </form>
    </div>
  );
}
