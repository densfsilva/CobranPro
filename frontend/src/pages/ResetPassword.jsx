import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("As palavras-passe não coincidem");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      toast.success("Palavra-passe redefinida com sucesso");
      navigate("/login");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6" data-testid="reset-password-page">
      <img src="/logo-rect.png" alt="Cobranpro" className="h-9 w-auto object-contain mb-10" />
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2">
          <h2 className="font-heading text-3xl font-bold tracking-tight">Redefinir palavra-passe</h2>
          <p className="text-sm text-muted-foreground">Escolha uma nova palavra-passe para a sua conta.</p>
        </div>
        {!token ? (
          <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2" data-testid="reset-error">Link inválido. Peça uma nova recuperação no ecrã de login.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">Nova palavra-passe</Label>
              <Input id="password" type="password" data-testid="reset-password-input" required minLength={6} value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="bg-card" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirmar palavra-passe</Label>
              <Input id="confirm" type="password" data-testid="reset-confirm-input" required minLength={6} value={confirm}
                onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" className="bg-card" />
            </div>
            {error && <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2" data-testid="reset-error">{error}</p>}
            <Button type="submit" disabled={busy} data-testid="reset-submit-btn" className="w-full bg-brand hover:opacity-90 text-white font-semibold transition-opacity duration-200">
              {busy ? "A processar..." : "Guardar nova palavra-passe"}
              <ArrowRight size={16} className="ml-2" />
            </Button>
          </form>
        )}
        <p className="text-sm text-center text-muted-foreground">
          <button type="button" data-testid="reset-back-login" onClick={() => navigate("/login")} className="text-brand font-medium hover:underline">
            Voltar ao login
          </button>
        </p>
      </div>
    </div>
  );
}
