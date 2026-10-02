import { Plus, Trash2, Landmark } from "lucide-react";
import { Input } from "@/components/ui/input";

const EMPTY_ACCOUNT = { banco: "", agencia: "", conta: "", iban_pix: "" };

export default function BankAccountsEditor({ accounts, onChange, country }) {
  const isBR = country === "BR";
  const update = (i, k, v) => onChange(accounts.map((a, idx) => (idx === i ? { ...a, [k]: v } : a)));
  const remove = (i) => onChange(accounts.filter((_, idx) => idx !== i));
  const add = () => onChange([...accounts, { ...EMPTY_ACCOUNT }]);

  return (
    <div className="space-y-3" data-testid="bank-accounts-editor">
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Landmark size={13} /> A 1ª conta é a principal e aparece nas mensagens de cobrança (WhatsApp/Email).
      </p>
      {accounts.map((a, i) => (
        <div key={i} data-testid={`bank-account-row-${i}`} className="rounded-lg border border-border bg-background p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${i === 0 ? "bg-brand-soft text-brand" : "bg-secondary text-muted-foreground"}`}>
              {i === 0 ? "Conta principal" : `Conta ${i + 1}`}
            </span>
            <button type="button" onClick={() => remove(i)} data-testid={`bank-account-remove-${i}`} title="Remover conta"
              className="p-1.5 rounded-md text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors duration-150">
              <Trash2 size={14} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <Input value={a.banco} onChange={(e) => update(i, "banco", e.target.value)} placeholder="Banco" data-testid={`bank-account-banco-${i}`} className="bg-card" />
            <Input value={a.agencia} onChange={(e) => update(i, "agencia", e.target.value)} placeholder={isBR ? "Agência" : "Agência / Balcão"} data-testid={`bank-account-agencia-${i}`} className="bg-card" />
            <Input value={a.conta} onChange={(e) => update(i, "conta", e.target.value)} placeholder="Conta" data-testid={`bank-account-conta-${i}`} className="bg-card" />
            <Input value={a.iban_pix} onChange={(e) => update(i, "iban_pix", e.target.value)} placeholder={isBR ? "Chave PIX (opcional)" : "IBAN (opcional)"} data-testid={`bank-account-iban-${i}`} className="bg-card font-mono-num" />
          </div>
        </div>
      ))}
      {accounts.length === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="bank-accounts-empty">Ainda não há contas bancárias registadas.</p>
      )}
      <button type="button" onClick={add} data-testid="bank-account-add-btn" disabled={accounts.length >= 10}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-brand/50 text-brand text-sm font-medium hover:bg-brand-soft transition-colors duration-200 disabled:opacity-50">
        <Plus size={15} /> Adicionar Conta
      </button>
    </div>
  );
}
