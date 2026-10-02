import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { idLabel, idPlaceholder, getCountry } from "@/lib/format";
import { maskPhone, maskTaxId, maskCep, cepComplete } from "@/lib/masks";
import { t } from "@/lib/i18n";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const KEYS = ["debtor_nif", "debtor_name", "debtor_email", "debtor_email2", "debtor_phone", "whatsapp", "addr_cp", "addr_rua", "addr_localidade", "addr_estado"];
const MASKS = { debtor_phone: maskPhone, whatsapp: maskPhone, debtor_nif: maskTaxId, addr_cp: maskCep };

export default function ClientFormDialog({ open, onOpenChange, clientKey, profile, onSaved }) {
  const country = getCountry();
  const isBR = country === "BR";
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [cepBusy, setCepBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const f = Object.fromEntries(KEYS.map((k) => [k, profile?.[k] || ""]));
    f.debtor_nif = maskTaxId(f.debtor_nif, country);
    f.addr_cp = maskCep(f.addr_cp, country);
    f.debtor_phone = maskPhone(f.debtor_phone, country);
    f.whatsapp = maskPhone(f.whatsapp, country);
    setForm(f);
  }, [open, profile, country]);

  const cepLookup = async (raw, feedback = false) => {
    const cep = (raw || "").replace(/\D/g, "");
    if (!cep) return;
    setCepBusy(true);
    try {
      const { data } = await api.get("/utils/cep-lookup", { params: { cep } });
      if (data.found) {
        setForm((p) => ({ ...p, addr_rua: data.rua || p.addr_rua, addr_localidade: data.localidade || p.addr_localidade, addr_estado: data.estado || p.addr_estado }));
        toast.success(isBR ? "Endereço preenchido pelo CEP" : "Morada preenchida pelo Código Postal");
      } else if (feedback) toast.info("Código postal não encontrado — preencha manualmente");
    } catch { if (feedback) toast.warning("Serviço de código postal indisponível"); } finally { setCepBusy(false); }
  };

  const set = (k) => (e) => {
    const v = MASKS[k] ? MASKS[k](e.target.value, country) : e.target.value;
    setForm((p) => ({ ...p, [k]: v }));
    if (k === "addr_cp" && cepComplete(v, country)) cepLookup(v);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.put(`/clients/${encodeURIComponent(clientKey)}`, form);
      toast.success(`Dados do cliente atualizados em todas as ${t("invoiceLowerPlural")}`);
      onOpenChange(false);
      onSaved?.(data);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally { setBusy(false); }
  };

  const phonePh = isBR ? "(11) 98765-4321" : "+351 9xx xxx xxx";
  const fields = [
    ["debtor_nif", idLabel(), idPlaceholder(), false],
    ["debtor_name", "Nome do Cliente", "", true],
    ["debtor_email", "Email", isBR ? "cliente@email.com.br" : "cliente@email.pt", false],
    ["debtor_email2", "Email 2", "", false],
    ["debtor_phone", t("mobile"), phonePh, false],
    ["whatsapp", "WhatsApp", phonePh, false],
    ["addr_cp", isBR ? "CEP" : "Código Postal", isBR ? "00000-000" : "0000-000", false],
    ["addr_rua", isBR ? "Endereço (Rua, nº)" : "Rua", "", false],
    ["addr_localidade", isBR ? "Cidade" : "Localidade", "", false],
    ["addr_estado", isBR ? "Estado (UF)" : "Distrito", "", false],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="client-form-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">Editar Cliente</DialogTitle>
          <DialogDescription className="text-xs">As alterações aplicam-se a todas as {t("invoiceLowerPlural")} deste cliente.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {fields.map(([key, label, ph, req]) => (
            <div key={key} className={`space-y-1.5 ${key === "debtor_name" ? "sm:col-span-2" : ""}`}>
              <Label htmlFor={`cf-${key}`}>{label}</Label>
              {key === "addr_cp" ? (
                <div className="relative">
                  <Input id={`cf-${key}`} data-testid={`client-form-${key.replace(/_/g, "-")}`} value={form[key] || ""} onChange={set(key)} onBlur={() => cepLookup(form.addr_cp)} placeholder={ph} className="bg-background pr-10" />
                  <button type="button" onClick={() => cepLookup(form.addr_cp, true)} disabled={cepBusy} data-testid="client-form-addr-cp-lookup-btn" title="Procurar"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-brand hover:bg-brand-soft transition-colors duration-150">
                    <Search size={15} className={cepBusy ? "animate-pulse" : ""} />
                  </button>
                </div>
              ) : (
                <Input id={`cf-${key}`} data-testid={`client-form-${key.replace(/_/g, "-")}`} required={req} value={form[key] || ""} onChange={set(key)} placeholder={ph} className="bg-background" />
              )}
            </div>
          ))}
          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} data-testid="client-form-cancel">Cancelar</Button>
            <Button type="submit" disabled={busy} data-testid="client-form-submit" className="bg-brand text-white hover:opacity-90">{busy ? "A guardar..." : `${t("save")} Cliente`}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
