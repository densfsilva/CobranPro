import { useState } from "react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { idLabel, idPlaceholder } from "@/lib/format";
import { t } from "@/lib/i18n";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const EMPTY = {
  debtor_name: "", debtor_email: "", debtor_phone: "", debtor_nif: "",
  invoice_number: "", amount: "", due_date: "", notes: "",
};

export default function ChargeFormDialog({ open, onOpenChange, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/charges", { ...form, amount: parseFloat(form.amount) });
      toast.success("Cobrança criada com sucesso");
      setForm(EMPTY);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const fields = [
    ["debtor_name", "Nome do Devedor", "text", "Ex: Marta Sousa", true],
    ["invoice_number", `Nº ${t("invoice")}`, "text", "FT-2026/001", true],
    ["amount", "Valor (€)", "number", "0.00", true],
    ["due_date", "Data de Vencimento", "date", "", true],
    ["debtor_email", "Email do Devedor", "email", "devedor@email.pt", false],
    ["debtor_phone", t("mobile"), "tel", "+351 9xx xxx xxx", false],
    ["debtor_nif", idLabel(), "text", idPlaceholder(), false],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg" data-testid="charge-form-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">Nova Cobrança</DialogTitle>
          <DialogDescription className="sr-only">Formulário para registar uma nova cobrança e os dados do devedor.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {fields.map(([key, label, type, ph, req]) => (
            <div key={key} className={`space-y-1.5 ${key === "debtor_name" ? "sm:col-span-2" : ""}`}>
              <Label htmlFor={key}>{label}</Label>
              <Input id={key} data-testid={`charge-form-${key.replace(/_/g, "-")}`} type={type} step={type === "number" ? "0.01" : undefined}
                required={req} value={form[key]} onChange={set(key)} placeholder={ph} className="bg-background" />
            </div>
          ))}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" data-testid="charge-form-notes" value={form.notes} onChange={set("notes")} rows={2}
              placeholder="Observações internas..." className="bg-background" />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} data-testid="charge-form-cancel">Cancelar</Button>
            <Button type="submit" disabled={busy} data-testid="charge-form-submit" className="bg-brand text-white hover:opacity-90">
              {busy ? "A guardar..." : "Criar Cobrança"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
