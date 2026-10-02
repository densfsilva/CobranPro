import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const PLAN_SUGGESTIONS = ["Trial", "Essencial", "Profissional", "Enterprise", "Proprietário"];

export default function SubscriptionDialog({ company, open, onOpenChange, onSaved }) {
  const [form, setForm] = useState({ plan: "", plan_price: "", license_valid_until: "", regenerate_license: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && company) {
      setForm({ plan: company.plan || "Trial", plan_price: String(company.plan_price ?? 0), license_valid_until: company.license_valid_until || "", regenerate_license: false });
    }
  }, [open, company]);

  if (!company) return null;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put(`/superadmin/companies/${company.id}/subscription`, {
        plan: form.plan.trim(),
        plan_price: parseFloat(form.plan_price || "0"),
        license_valid_until: form.license_valid_until,
        regenerate_license: form.regenerate_license,
      });
      toast.success(`Assinatura de "${company.company_name}" atualizada`);
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md" data-testid="subscription-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">Gerir Assinatura</DialogTitle>
          <DialogDescription className="text-xs">{company.company_name} · {company.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="plan">Plano</Label>
            <Input id="plan" list="plan-suggestions" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} required data-testid="subscription-plan-input" className="bg-background" />
            <datalist id="plan-suggestions">{PLAN_SUGGESTIONS.map((p) => <option key={p} value={p} />)}</datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="plan_price">Valor mensal</Label>
              <Input id="plan_price" type="number" min="0" step="0.01" value={form.plan_price} onChange={(e) => setForm({ ...form, plan_price: e.target.value })} data-testid="subscription-price-input" className="bg-background font-mono-num" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="valid_until">Validade</Label>
              <Input id="valid_until" type="date" value={form.license_valid_until} onChange={(e) => setForm({ ...form, license_valid_until: e.target.value })} data-testid="subscription-valid-until-input" className="bg-background" />
              <p className="text-[10px] text-muted-foreground">Vazio = licença vitalícia</p>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">ID da licença</p>
              <p className="font-mono-num text-sm" data-testid="subscription-license-id">{company.license_id || "—"}</p>
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input type="checkbox" checked={form.regenerate_license} onChange={(e) => setForm({ ...form, regenerate_license: e.target.checked })} data-testid="subscription-regenerate-checkbox" className="accent-[var(--brand)]" />
              <RefreshCw size={12} /> Gerar novo ID
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} data-testid="subscription-cancel">Cancelar</Button>
            <Button type="submit" disabled={busy} data-testid="subscription-save-btn" className="bg-brand text-white hover:opacity-90">{busy ? "A guardar..." : "Guardar Assinatura"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
