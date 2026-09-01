import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wallet, ArrowRight } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AuthPage() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ company_name: "", full_name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const payload = mode === "login" ? { email: form.email, password: form.password } : form;
      const { data } = await api.post(endpoint, payload);
      login(data.token, data.company, data.user);
      navigate("/");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      <div className="hidden lg:flex w-1/2 flex-col justify-between p-12 border-r border-border relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)", backgroundSize: "28px 28px" }} />
        <div className="relative flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-brand flex items-center justify-center">
            <Wallet size={18} className="text-white" />
          </div>
          <span className="font-heading font-bold text-lg">CobranPro</span>
        </div>
        <div className="relative space-y-6">
          <h1 className="font-heading text-4xl xl:text-5xl font-extrabold tracking-tight leading-tight">
            Recupere o que é seu.<br />
            <span className="text-brand">Sem fricção.</span>
          </h1>
          <p className="text-muted-foreground max-w-md leading-relaxed">
            Plataforma profissional de gestão de cobranças multi-empresa. Dashboards financeiros, alertas por antiguidade de dívida e mensagens de lembrete prontas a enviar.
          </p>
          <div className="flex gap-6 pt-2">
            {[["verde", "1-15d"], ["amarelo", "16-30d"], ["vermelho", "31-60d"], ["roxo", ">60d"]].map(([k, r]) => (
              <div key={k} className="space-y-1">
                <div className={`w-8 h-1.5 rounded-full ${{ verde: "bg-emerald-500", amarelo: "bg-amber-500", vermelho: "bg-rose-500", roxo: "bg-purple-500" }[k]}`} />
                <p className="text-xs text-muted-foreground">{r}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-muted-foreground">© 2026 CobranPro — Gestão de Cobranças Profissional</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <h2 className="font-heading text-3xl font-bold tracking-tight" data-testid="auth-title">
              {mode === "login" ? "Entrar na sua conta" : "Criar conta de empresa"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {mode === "login" ? "Aceda ao seu painel de cobranças." : "Registe a sua empresa e comece a cobrar."}
            </p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <>
              <div className="space-y-1.5">
                <Label htmlFor="full_name">O seu Nome Completo</Label>
                <Input id="full_name" data-testid="register-full-name-input" required value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Ex: Denis Ferreira" className="bg-card" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company_name">Nome da Empresa</Label>
                <Input id="company_name" data-testid="register-company-name-input" required value={form.company_name}
                  onChange={(e) => setForm({ ...form, company_name: e.target.value })} placeholder="Ex: TechFlow Solutions Lda" className="bg-card" />
              </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" data-testid="auth-email-input" required value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="empresa@exemplo.pt" className="bg-card" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Palavra-passe</Label>
              <Input id="password" type="password" data-testid="auth-password-input" required minLength={6} value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" className="bg-card" />
            </div>
            {error && <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2" data-testid="auth-error">{error}</p>}
            <Button type="submit" disabled={busy} data-testid="auth-submit-btn"
              className="w-full bg-brand hover:opacity-90 text-white font-semibold transition-opacity duration-200">
              {busy ? "A processar..." : mode === "login" ? "Entrar" : "Criar Conta"}
              <ArrowRight size={16} className="ml-2" />
            </Button>
          </form>
          <p className="text-sm text-center text-muted-foreground">
            {mode === "login" ? "Ainda não tem conta?" : "Já tem conta?"}{" "}
            <button type="button" data-testid="auth-mode-toggle" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
              className="text-brand font-medium hover:underline">
              {mode === "login" ? "Registar empresa" : "Entrar"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
