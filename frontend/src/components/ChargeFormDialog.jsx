import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { idLabel, idPlaceholder, getCountry } from "@/lib/format";
import { maskPhone } from "@/lib/masks";
import { t } from "@/lib/i18n";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const EMPTY = {
  debtor_name: "", debtor_email: "", debtor_email2: "", debtor_phone: "", whatsapp: "", debtor_nif: "",
  bank1: "", bank2: "", addr_rua: "", addr_localidade: "", addr_cp: "", addr_estado: "",
  invoice_number: "", amount: "", due_date: "", notes: "",
};

export default function ChargeFormDialog({ open, onOpenChange, onSaved, charge = null }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [lookupBusy, setLookupBusy] = useState("");

  useEffect(() => {
    if (!open) return;
    if (charge) {
      const f = { ...EMPTY };
      for (const k of Object.keys(EMPTY)) f[k] = charge[k] ?? EMPTY[k];
      f.amount = String(charge.amount);
      setForm(f);
    } else {
      setForm(EMPTY);
    }
  }, [open, charge]);

  const set = (k) => (e) => {
    const v = (k === "debtor_phone" || k === "whatsapp") ? maskPhone(e.target.value, getCountry()) : e.target.value;
    setForm({ ...form, [k]: v });
  };

  const lookupClient = async (showFeedback = false) => {
    if (charge || !form.debtor_nif.trim()) return;
    setLookupBusy("nif");
    try {
      const nif = form.debtor_nif.replace(/[^\dA-Za-z]/g, "");
      const { data } = await api.get("/charges/lookup-client", { params: { nif } });
      if (data.found && data.client) {
        const c = data.client;
        const country = getCountry();
        setForm((prev) => ({
          ...prev,
          ...c,
          debtor_phone: c.debtor_phone ? maskPhone(c.debtor_phone, country) : c.debtor_phone,
          whatsapp: c.whatsapp ? maskPhone(c.whatsapp, country) : c.whatsapp,
        }));
        toast.success("Cliente existente — dados preenchidos automaticamente");
      } else if (showFeedback) {
        toast.info(`Cliente não encontrado para este ${idLabel()} — preencha manualmente`);
      }
    } catch {
      if (showFeedback) toast.error("Falha na busca do cliente. Tente novamente.");
    } finally { setLookupBusy(""); }
  };

  const cepLookup = async () => {
    if (!form.addr_cp.trim()) return;
    setLookupBusy("cep");
    try {
      const { data } = await api.get("/utils/cep-lookup", { params: { cep: form.addr_cp } });
      if (data.found) {
        setForm((prev) => ({
          ...prev,
          addr_rua: data.rua || prev.addr_rua,
          addr_localidade: data.localidade || prev.addr_localidade,
          addr_estado: data.estado || prev.addr_estado,
        }));
        toast.success("Morada preenchida pelo Código Postal");
      } else if (data.unavailable) {
        toast.warning("Serviço de Código Postal temporariamente indisponível — preencha manualmente");
      } else {
        toast.info("Código Postal não encontrado — preencha manualmente");
      }
    } catch {
      toast.warning("Serviço de Código Postal temporariamente indisponível — preencha manualmente");
    } finally { setLookupBusy(""); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form, amount: parseFloat(form.amount) };
      if (charge) {
        await api.put(`/charges/${charge.id}`, { ...charge, ...payload });
        toast.success("Cobrança atualizada");
      } else {
        await api.post("/charges", payload);
        toast.success("Cobrança criada com sucesso");
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const fields = [
    ["debtor_nif", idLabel(), "text", idPlaceholder(), false],
    ["debtor_name", "Nome do Cliente", "text", "Ex: Marta Sousa", true],
    ["invoice_number", `Nº ${t("invoice")}`, "text", "FT-2026/001", true],
    ["amount", "Valor", "number", "0.00", true],
    ["due_date", "Data de Vencimento", "date", "", true],
    ["debtor_email", "Email", "email", "cliente@email.pt", false],
    ["debtor_email2", "Email 2", "email", "alternativo@email.pt", false],
    ["debtor_phone", t("mobile"), "tel", "+351 9xx xxx xxx", false],
    ["whatsapp", "WhatsApp", "tel", "+351 9xx xxx xxx", false],
    ["bank1", "Conta Bancária 1 (IBAN/PIX)", "text", "", false],
    ["bank2", "Conta Bancária 2", "text", "", false],
    ["addr_cp", getCountry() === "BR" ? "CEP" : "Código Postal", "text", "", false],
    ["addr_rua", "Rua", "text", "Rua, nº, andar", false],
    ["addr_localidade", "Localidade", "text", "", false],
    ["addr_estado", getCountry() === "BR" ? "Estado (UF)" : "Distrito", "text", "", false],
  ];

  const LOOKUPS = { debtor_nif: lookupClient, addr_cp: cepLookup };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="charge-form-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">{charge ? "Editar Cobrança" : "Nova Cobrança"}</DialogTitle>
          <DialogDescription className="sr-only">Formulário da cobrança e dados do cliente.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {fields.map(([key, label, type, ph, req]) => (
            <div key={key} className={`space-y-1.5 ${key === "debtor_name" ? "sm:col-span-2" : ""}`}>
              <Label htmlFor={key}>{label}</Label>
              {LOOKUPS[key] ? (
                <div className="relative">
                  <Input id={key} data-testid={`charge-form-${key.replace(/_/g, "-")}`} type={type}
                    required={req} value={form[key]} onChange={set(key)} onBlur={() => LOOKUPS[key]()} placeholder={ph} className="bg-background pr-10" />
                  <button type="button" onClick={() => LOOKUPS[key](true)} disabled={lookupBusy === (key === "debtor_nif" ? "nif" : "cep")}
                    data-testid={`charge-form-${key.replace(/_/g, "-")}-lookup-btn`} title="Procurar"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-brand hover:bg-brand-soft transition-colors duration-150">
                    <Search size={15} className={lookupBusy === (key === "debtor_nif" ? "nif" : "cep") ? "animate-pulse" : ""} />
                  </button>
                </div>
              ) : (
                <Input id={key} data-testid={`charge-form-${key.replace(/_/g, "-")}`} type={type} step={type === "number" ? "0.01" : undefined}
                  required={req} value={form[key]} onChange={set(key)} placeholder={ph} className="bg-background" />
              )}
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
              {busy ? "A guardar..." : charge ? "Guardar Alterações" : "Criar Cobrança"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
