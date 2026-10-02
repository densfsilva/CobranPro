import { useRef, useState } from "react";
import { toast } from "sonner";
import { Search, MapPin } from "lucide-react";
import { api } from "@/lib/api";
import { maskCep, cepComplete } from "@/lib/masks";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function CompanyAddressFields({ value, onChange, country }) {
  const isBR = country === "BR";
  const [busy, setBusy] = useState(false);
  const looked = useRef("");

  const lookup = async (raw, feedback = false) => {
    const cep = (raw || "").replace(/\D/g, "");
    if (!cep || (!feedback && looked.current === cep)) return;
    looked.current = cep;
    setBusy(true);
    try {
      const { data } = await api.get("/utils/cep-lookup", { params: { cep } });
      if (data.found) {
        onChange({ addr_rua: data.rua || value.addr_rua, addr_bairro: data.bairro || value.addr_bairro, addr_cidade: data.localidade || value.addr_cidade, addr_estado: data.estado || value.addr_estado });
        toast.success(isBR ? "Endereço preenchido pelo CEP" : "Morada preenchida pelo Código Postal");
      } else if (feedback) {
        toast.info(data.unavailable ? "Serviço de código postal indisponível — preencha manualmente" : "Código postal não encontrado");
      }
    } catch {
      if (feedback) toast.warning("Serviço de código postal indisponível — preencha manualmente");
    } finally { setBusy(false); }
  };

  const set = (k) => (e) => {
    let v = e.target.value;
    if (k === "addr_cp") {
      v = maskCep(v, country);
      if (cepComplete(v, country)) lookup(v);
    }
    onChange({ [k]: v });
  };

  const FIELDS = [
    ["addr_rua", "Rua", "sm:col-span-2", isBR ? "Av. Paulista" : "Rua Augusta"],
    ["addr_numero", "Número", "", "123"],
    ["addr_bairro", isBR ? "Bairro" : "Freguesia", "", isBR ? "Bela Vista" : "Santa Maria Maior"],
    ["addr_cidade", "Cidade", "", isBR ? "São Paulo" : "Lisboa"],
    ["addr_estado", isBR ? "Estado (UF)" : "Distrito", "", isBR ? "SP" : "Lisboa"],
  ];

  return (
    <div className="space-y-3" data-testid="company-address-fields">
      <p className="text-xs text-muted-foreground flex items-center gap-1.5"><MapPin size={13} /> Endereço da empresa (aparece nos relatórios e emails)</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="addr_cp">{isBR ? "CEP" : "Código Postal"}</Label>
          <div className="relative">
            <Input id="addr_cp" data-testid="settings-addr-cp" value={value.addr_cp || ""} onChange={set("addr_cp")} onBlur={() => lookup(value.addr_cp)}
              placeholder={isBR ? "00000-000" : "0000-000"} inputMode="numeric" className="bg-background pr-10" />
            <button type="button" onClick={() => lookup(value.addr_cp, true)} disabled={busy} data-testid="settings-addr-cp-lookup-btn" title="Procurar"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-brand hover:bg-brand-soft transition-colors duration-150">
              <Search size={15} className={busy ? "animate-pulse" : ""} />
            </button>
          </div>
        </div>
        {FIELDS.map(([k, label, span, ph]) => (
          <div key={k} className={`space-y-1.5 ${span}`}>
            <Label htmlFor={k}>{label}</Label>
            <Input id={k} data-testid={`settings-${k.replace(/_/g, "-")}`} value={value[k] || ""} onChange={set(k)} placeholder={ph} className="bg-background" />
          </div>
        ))}
      </div>
    </div>
  );
}
