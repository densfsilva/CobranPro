import { useState, useRef } from "react";
import { toast } from "sonner";
import { Palette, Upload, Building2, Save, Globe, Check, Cloud } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { idLabel, idPlaceholder, bankLabel } from "@/lib/format";
import { t } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PRESET_COLORS = ["#2563EB", "#D97706", "#059669", "#DC2626", "#7C3AED", "#0891B2", "#DB2777", "#65A30D"];

const COUNTRIES = [
  { code: "PT", name: "Portugal", desc: "Euro (€) · NIF" },
  { code: "BR", name: "Brasil", desc: "Real (R$) · CNPJ" },
];

export default function Settings() {
  const { company, updateCompany } = useAuth();
  const [form, setForm] = useState({
    company_name: company.company_name,
    nif: company.nif || "",
    iban: company.iban || "",
    address: company.address || "",
    country: company.country || "PT",
    google_client_id: company.google_client_id || "",
    primary_color: company.primary_color,
    logo_base64: company.logo_base64 || "",
  });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const onLogoPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) {
      toast.error("Logótipo demasiado grande (máx 1.5MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, logo_base64: reader.result }));
    reader.readAsDataURL(file);
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.put("/branding", form);
      updateCompany(data);
      toast.success("Configurações guardadas — a marca e a localização foram aplicadas a toda a app");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const initials = form.company_name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  return (
    <div className="max-w-3xl space-y-6" data-testid="configuracoes-page">
      <div>
        <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">Localização, identidade e marca da sua empresa.</p>
      </div>

      <form onSubmit={save} className="space-y-6">
        <div className="bg-card border border-border rounded-xl p-6 space-y-4" data-testid="settings-country-section">
          <h2 className="font-heading text-lg font-semibold flex items-center gap-2"><Globe size={18} className="text-brand" /> Localização</h2>
          <p className="text-xs text-muted-foreground">Ao mudar de país, a moeda e o campo de identificação fiscal adaptam-se automaticamente em toda a aplicação.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {COUNTRIES.map((c) => {
              const active = form.country === c.code;
              return (
                <button
                  key={c.code}
                  type="button"
                  data-testid={`settings-country-${c.code.toLowerCase()}`}
                  onClick={() => setForm({ ...form, country: c.code })}
                  className={`relative text-left p-4 rounded-xl border transition-all duration-200 hover:scale-[1.01] ${
                    active ? "border-brand bg-brand-soft" : "border-border bg-background hover:border-muted-foreground/40"
                  }`}
                >
                  {active && (
                    <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-brand flex items-center justify-center" data-testid={`settings-country-${c.code.toLowerCase()}-check`}>
                      <Check size={12} className="text-white" />
                    </span>
                  )}
                  <p className="font-heading font-semibold">{c.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{c.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 space-y-5" data-testid="branding-identity-section">
          <h2 className="font-heading text-lg font-semibold flex items-center gap-2"><Building2 size={18} className="text-brand" /> Identidade</h2>
          <div className="flex items-center gap-5">
            {form.logo_base64 ? (
              <img src={form.logo_base64} alt="Logótipo" className="w-20 h-20 rounded-xl object-contain bg-white/5 border border-border" data-testid="logo-preview" />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-brand flex items-center justify-center font-heading font-bold text-2xl text-white" data-testid="logo-preview">{initials}</div>
            )}
            <div className="space-y-2">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onLogoPick} data-testid="logo-upload-input" />
              <button type="button" onClick={() => fileRef.current?.click()} data-testid="logo-upload-btn"
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors duration-200">
                <Upload size={15} /> Carregar Logótipo
              </button>
              {form.logo_base64 && (
                <button type="button" onClick={() => setForm({ ...form, logo_base64: "" })} data-testid="logo-remove-btn"
                  className="text-xs text-rose-400 hover:underline block">Remover logótipo</button>
              )}
              <p className="text-xs text-muted-foreground">PNG, JPG ou SVG · máx 1.5MB</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="company_name">Nome da Empresa</Label>
              <Input id="company_name" data-testid="branding-company-name-input" required value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })} className="bg-background" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nif" data-testid="branding-id-label">{idLabel(form.country)}</Label>
              <Input id="nif" data-testid="branding-nif-input" value={form.nif}
                onChange={(e) => setForm({ ...form, nif: e.target.value })} placeholder={idPlaceholder(form.country)} className="bg-background" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="address">Endereço</Label>
              <Input id="address" data-testid="settings-address-input" value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder={form.country === "BR" ? "Rua, número, cidade - UF" : "Rua, nº, código postal, cidade"} className="bg-background" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="iban" data-testid="branding-bank-label">{bankLabel(form.country)}</Label>
              <Input id="iban" data-testid="branding-iban-input" value={form.iban}
                onChange={(e) => setForm({ ...form, iban: e.target.value })}
                placeholder={form.country === "BR" ? "email@pix.com.br ou dados bancários" : "PT50 .... .... .... .... ."}
                className="bg-background font-mono-num" />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 space-y-4" data-testid="branding-color-section">
          <h2 className="font-heading text-lg font-semibold flex items-center gap-2"><Palette size={18} className="text-brand" /> Cor de Marca</h2>
          <div className="flex items-center gap-4 flex-wrap">
            <input
              type="color"
              value={form.primary_color}
              onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
              data-testid="company-primary-color-picker"
              className="w-14 h-14 rounded-xl cursor-pointer bg-transparent border border-border p-1"
            />
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  data-testid={`preset-color-${c.slice(1)}`}
                  onClick={() => setForm({ ...form, primary_color: c })}
                  className={`w-9 h-9 rounded-lg transition-transform duration-200 hover:scale-110 ${form.primary_color === c ? "ring-2 ring-white ring-offset-2 ring-offset-card" : ""}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <span className="font-mono-num text-sm text-muted-foreground" data-testid="color-hex-display">{form.primary_color}</span>
          </div>
          <div className="rounded-lg border border-border p-4 flex items-center gap-3 bg-background">
            <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: form.primary_color }} />
            <div>
              <p className="text-sm font-medium">Pré-visualização</p>
              <p className="text-xs text-muted-foreground">Esta cor passa a ser a cor principal dos botões e menus após guardar.</p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 space-y-4" data-testid="settings-integrations-section">
          <h2 className="font-heading text-lg font-semibold flex items-center gap-2"><Cloud size={18} className="text-brand" /> Integrações</h2>
          <div className="space-y-1.5">
            <Label htmlFor="google_client_id">Google Client ID</Label>
            <Input id="google_client_id" data-testid="settings-google-client-id" value={form.google_client_id}
              onChange={(e) => setForm({ ...form, google_client_id: e.target.value })}
              placeholder="xxxx.apps.googleusercontent.com" className="bg-background font-mono-num" />
            <p className="text-xs text-muted-foreground">Preparado para a futura ligação ao Google Drive — os anexos das cobranças passarão a ser guardados no seu Drive.</p>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={busy} data-testid="branding-settings-save-btn"
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-brand text-white text-sm font-semibold hover:opacity-90 hover:scale-[1.02] transition-all duration-200 disabled:opacity-50">
            <Save size={16} /> {busy ? "A guardar..." : `${t("save")} Alterações`}
          </button>
        </div>
      </form>
    </div>
  );
}
