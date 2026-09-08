import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { idLabel, idPlaceholder, getCountry } from "@/lib/format";
import { maskPhone, maskTaxId, taxIdComplete, maskCep, cepComplete, invoicePrefix } from "@/lib/masks";
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

const MASKS = { debtor_phone: maskPhone, whatsapp: maskPhone, debtor_nif: maskTaxId, addr_cp: maskCep };

export default function ChargeFormDialog({ open, onOpenChange, onSaved, charge = null }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [lookupBusy, setLookupBusy] = useState("");
  const looked = useRef({ nif: "", cep: "" });
  const country = getCountry();
  const isBR = country === "BR";

  useEffect(() => {
    if (!open) return;
    looked.current = { nif: "", cep: "" };
    if (charge) {
      const f = { ...EMPTY };
      for (const k of Object.keys(EMPTY)) f[k] = charge[k] ?? EMPTY[k];
      f.amount = String(charge.amount);
      setForm(f);
    } else {
      setForm({ ...EMPTY, invoice_number: invoicePrefix(getCountry()) });
    }
  }, [open, charge]);

  const set = (k) => (e) => {
    const v = MASKS[k] ? MASKS[k](e.target.value, country) : e.target.value;
    setForm((prev) => ({ ...prev, [k]: v }));
    if (k === "debtor_nif" && taxIdComplete(v, country)) lookupClient(false, v);
    if (k === "addr_cp" && cepComplete(v, country)) cepLookup(false, v);
  };

  const lookupClient = async (showFeedback = false, value = form.debtor_nif) => {
    const nif = (value || "").replace(/\D/g, "");
    if (charge || !nif) return;
    if (!showFeedback && looked.current.nif === nif) return;
    looked.current.nif = nif;
    setLookupBusy("nif");
    try {
      const { data } = await api.get("/charges/lookup-client", { params: { nif } });
      if (data.found && data.client) {
        const c = data.client;
        setForm((prev) => ({
          ...prev,
          ...c,
          debtor_nif: maskTaxId(c.debtor_nif, country) || prev.debtor_nif,
          debtor_phone: c.debtor_phone ? maskPhone(c.debtor_phone, country) : c.debtor_phone,
          whatsapp: c.whatsapp ? maskPhone(c.whatsapp, country) : c.whatsapp,
          addr_cp: c.addr_cp ? maskCep(c.addr_cp, country) : c.addr_cp,
        }));
        toast.success("Cliente existente — dados preenchidos automaticamente");
      } else if (showFeedback) {
        toast.info(`Cliente não encontrado para este ${idLabel()} — preencha manualmente`);
      }
    } catch {
      if (showFeedback) toast.error("Falha na busca do cliente. Tente novamente.");
    } finally { setLookupBusy(""); }
  };

  const cepLookup = async (showFeedback = false, value = form.addr_cp) => {
    const cep = (value || "").replace(/\D/g, "");
    if (!cep) return;
    if (!showFeedback && looked.current.cep === cep) return;
    looked.current.cep = cep;
    setLookupBusy("cep");
    try {
      const { data } = await api.get("/utils/cep-lookup", { params: { cep } });
      if (data.found) {
        setForm((prev) => ({
          ...prev,
          addr_rua: data.rua || prev.addr_rua,
          addr_localidade: data.localidade || prev.addr_localidade,
          addr_estado: data.estado || prev.addr_estado,
        }));
        toast.success(isBR ? "Endereço preenchido pelo CEP" : "Morada preenchida pelo Código Postal");
      } else if (data.unavailable) {
        toast.warning(`Serviço de ${isBR ? "CEP" : "Código Postal"} temporariamente indisponível — preencha manualmente`);
      } else {
        toast.info(`${isBR ? "CEP" : "Código Postal"} não encontrado — preencha manualmente`);
      }
    } catch {
      toast.warning(`Serviço de ${isBR ? "CEP" : "Código Postal"} temporariamente indisponível — preencha manualmente`);
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

  const phonePh = isBR ? "(11) 98765-4321" : "+351 9xx xxx xxx";
  const fields = [
    ["debtor_nif", idLabel(), "text", idPlaceholder(), false],
    ["debtor_name", "Nome do Cliente", "text", isBR ? "Ex: Mercado Bom Preço LTDA" : "Ex: Marta Sousa", true],
    ["invoice_number", `Nº ${t("invoice")}`, "text", isBR ? "NF-000123" : "FT-2026/001", true],
    ["amount", "Valor", "number", "0.00", true],
    ["due_date", "Data de Vencimento", "date", "", true],
    ["debtor_email", "Email", "email", isBR ? "cliente@email.com.br" : "cliente@email.pt", false],
    ["debtor_email2", "Email 2", "email", isBR ? "alternativo@email.com.br" : "alternativo@email.pt", false],
    ["debtor_phone", t("mobile"), "tel", phonePh, false],
    ["whatsapp", "WhatsApp", "tel", phonePh, false],
    ["bank1", isBR ? "Chave PIX / Conta 1" : "Conta Bancária 1 (IBAN)", "text", "", false],
    ["bank2", "Conta Bancária 2", "text", "", false],
    ["addr_cp", isBR ? "CEP" : "Código Postal", "text", isBR ? "00000-000" : "0000-000", false],
    ["addr_rua", isBR ? "Endereço (Rua, nº)" : "Rua", "text", isBR ? "Rua, nº, complemento" : "Rua, nº, andar", false],
    ["addr_localidade", isBR ? "Cidade" : "Localidade", "text", "", false],
    ["addr_estado", isBR ? "Estado (UF)" : "Distrito", "text", "", false],
  ];

  const LOOKUPS = { debtor_nif: lookupClient, addr_cp: cepLookup };
  const busyKey = (key) => (key === "debtor_nif" ? "nif" : "cep");

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
                  <Input id={key} data-testid={`charge-form-${key.replace(/_/g, "-")}`} type={type} inputMode="numeric"
                    required={req} value={form[key]} onChange={set(key)} onBlur={() => LOOKUPS[key]()} placeholder={ph} className="bg-background pr-10" />
                  <button type="button" onClick={() => LOOKUPS[key](true)} disabled={lookupBusy === busyKey(key)}
                    data-testid={`charge-form-${key.replace(/_/g, "-")}-lookup-btn`} title="Procurar"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-brand hover:bg-brand-soft transition-colors duration-150">
                    <Search size={15} className={lookupBusy === busyKey(key) ? "animate-pulse" : ""} />
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
              {busy ? (isBR ? "Salvando..." : "A guardar...") : charge ? (isBR ? "Salvar Alterações" : "Guardar Alterações") : "Criar Cobrança"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
