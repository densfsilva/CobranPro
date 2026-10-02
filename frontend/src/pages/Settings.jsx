import { useState, useRef } from "react";
import { toast } from "sonner";
import { Palette, Upload, Building2, Save, Globe, Check, Cloud, Landmark, MapPin, BadgeCheck } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { idLabel, idPlaceholder, money } from "@/lib/format";
import { fmtDate } from "@/lib/badges";
import { t } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import CompanyAddressFields from "@/components/CompanyAddressFields";
import BankAccountsEditor from "@/components/BankAccountsEditor";

const PRESET_COLORS = ["#2563EB", "#D97706", "#059669", "#DC2626", "#7C3AED", "#0891B2", "#DB2777", "#65A30D"];

const COUNTRIES = [
  { code: "PT", name: "Portugal", desc: "Euro (€) · NIF" },
  { code: "BR", name: "Brasil", desc: "Real (R$) · CNPJ" },
];

const ADDR_KEYS = ["addr_rua", "addr_numero", "addr_bairro", "addr_cidade", "addr_cp", "addr_estado"];

const STATUS_CLS = {
  ativa: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  expirada: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  bloqueada: "bg-rose-500/10 text-rose-400 border-rose-500/30",
};

function Section({ icon: Icon, title, testid, children }) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4" data-testid={testid}>
      <h2 className="font-heading text-lg font-semibold flex items-center gap-2"><Icon size={18} className="text-brand" /> {title}</h2>
      {children}
    </div>
  );
}

export default function Settings() {
  const { company, updateCompany } = useAuth();
  const [form, setForm] = useState({
    company_name: company.company_name,
    nif: company.nif || "",
    country: company.country || "PT",
    google_client_id: company.google_client_id || "",
    primary_color: company.primary_color,
    logo_base64: company.logo_base64 || "",
    bank_accounts: company.bank_accounts || [],
    ...Object.fromEntries(ADDR_KEYS.map((k) => [k, company[k] || ""])),
  });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const patch = (p) => setForm((f) => ({ ...f, ...p }));

  const onLogoPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) {
      toast.error("Logótipo demasiado grande (máx 1.5MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => patch({ logo_base64: reader.result });
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
  const status = company.license_status || "ativa";

  return (
    <div className="max-w-3xl space-y-6" data-testid="configuracoes-page">
      <div>
        <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">Localização, identidade, endereço, contas bancárias e marca da sua empresa.</p>
      </div>

      <form onSubmit={save} className="space-y-6">
        <Section icon={Globe} title="Localização" testid="settings-country-section">
          <p className="text-xs text-muted-foreground">Ao mudar de país, a moeda e o campo de identificação fiscal adaptam-se automaticamente em toda a aplicação.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {COUNTRIES.map((c) => {
              const active = form.country === c.code;
              return (
                <button key={c.code} type="button" data-testid={`settings-country-${c.code.toLowerCase()}`} onClick={() => patch({ country: c.code })}
                  className={`relative text-left p-4 rounded-xl border transition-all duration-200 hover:scale-[1.01] ${active ? "border-brand bg-brand-soft" : "border-border bg-background hover:border-muted-foreground/40"}`}>
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
        </Section>

        <Section icon={Building2} title="Identidade" testid="branding-identity-section">
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
              <p className="text-xs text-muted-foreground" data-testid="logo-size-hint">Tamanho padrão: 400x120px (PNG transparente)</p>
              {form.logo_base64 && (
                <button type="button" onClick={() => patch({ logo_base64: "" })} data-testid="logo-remove-btn" className="text-xs text-rose-400 hover:underline block">Remover logótipo</button>
              )}
              <p className="text-xs text-muted-foreground">PNG, JPG ou SVG · máx 1.5MB</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="company_name">Nome da Empresa</Label>
              <Input id="company_name" data-testid="branding-company-name-input" required value={form.company_name} onChange={(e) => patch({ company_name: e.target.value })} className="bg-background" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nif" data-testid="branding-id-label">{idLabel(form.country)}</Label>
              <Input id="nif" data-testid="branding-nif-input" value={form.nif} onChange={(e) => patch({ nif: e.target.value })} placeholder={idPlaceholder(form.country)} className="bg-background" />
            </div>
          </div>
        </Section>

        <Section icon={MapPin} title="Endereço" testid="settings-address-section">
          <CompanyAddressFields value={form} onChange={patch} country={form.country} />
        </Section>

        <Section icon={Landmark} title="Contas Bancárias" testid="settings-bank-section">
          <BankAccountsEditor accounts={form.bank_accounts} onChange={(bank_accounts) => patch({ bank_accounts })} country={form.country} />
        </Section>

        <Section icon={Palette} title="Cor de Marca" testid="branding-color-section">
          <div className="flex items-center gap-4 flex-wrap">
            <input type="color" value={form.primary_color} onChange={(e) => patch({ primary_color: e.target.value })} data-testid="company-primary-color-picker"
              className="w-14 h-14 rounded-xl cursor-pointer bg-transparent border border-border p-1" />
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button key={c} type="button" data-testid={`preset-color-${c.slice(1)}`} onClick={() => patch({ primary_color: c })}
                  className={`w-9 h-9 rounded-lg transition-transform duration-200 hover:scale-110 ${form.primary_color === c ? "ring-2 ring-white ring-offset-2 ring-offset-card" : ""}`}
                  style={{ backgroundColor: c }} />
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
        </Section>

        <Section icon={Cloud} title="Integrações" testid="settings-integrations-section">
          <div className="space-y-1.5">
            <Label htmlFor="google_client_id">Google Client ID</Label>
            <Input id="google_client_id" data-testid="settings-google-client-id" value={form.google_client_id} onChange={(e) => patch({ google_client_id: e.target.value })}
              placeholder="xxxx.apps.googleusercontent.com" className="bg-background font-mono-num" />
            <p className="text-xs text-muted-foreground">Preparado para a futura ligação ao Google Drive — os anexos das cobranças passarão a ser guardados no seu Drive.</p>
          </div>
        </Section>

        <div className="flex justify-end">
          <button type="submit" disabled={busy} data-testid="branding-settings-save-btn"
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-brand text-white text-sm font-semibold hover:opacity-90 hover:scale-[1.02] transition-all duration-200 disabled:opacity-50">
            <Save size={16} /> {busy ? "A guardar..." : `${t("save")} Alterações`}
          </button>
        </div>
      </form>

      <Section icon={BadgeCheck} title="Assinatura Cobranpro" testid="settings-subscription-section">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Plano</p><p className="font-semibold" data-testid="subscription-plan">{company.plan || "Trial"}</p></div>
          <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Valor mensal</p><p className="font-mono-num font-semibold">{money(company.plan_price || 0)}</p></div>
          <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Validade</p><p className="font-semibold" data-testid="subscription-valid-until">{company.license_valid_until ? fmtDate(company.license_valid_until) : "Vitalícia"}</p></div>
          <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Estado</p>
            <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_CLS[status]}`} data-testid="subscription-status">{status.charAt(0).toUpperCase() + status.slice(1)}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">ID da licença: <span className="font-mono-num text-foreground" data-testid="subscription-license-id">{company.license_id || "—"}</span></p>
      </Section>
    </div>
  );
}
