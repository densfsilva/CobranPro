import { useState } from "react";
import { toast } from "sonner";
import { Handshake, Save } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { money } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function NegotiationCard({ charge, onUpdate }) {
  const [promiseDate, setPromiseDate] = useState(charge.promise_date || "");
  const [agreed, setAgreed] = useState(charge.agreed_amount ?? "");
  const [busy, setBusy] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const broken = charge.promise_date && charge.promise_date <= today;

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.put(`/charges/${charge.id}`, {
        ...charge,
        promise_date: promiseDate || null,
        agreed_amount: agreed === "" ? null : parseFloat(agreed),
      });
      onUpdate(data);
      toast.success("Condições da negociação guardadas");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`bg-card border rounded-xl p-6 space-y-4 ${broken ? "border-amber-500/40" : "border-border"}`} data-testid="negotiation-card">
      <h3 className="font-heading text-base font-semibold flex items-center gap-2">
        <Handshake size={16} className="text-orange-400" /> Negociação
      </h3>
      {broken && (
        <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2" data-testid="promise-broken-warning">
          Promessa de pagamento em atraso — sem baixa registada. Alerta ativo no Dashboard.
        </p>
      )}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="promise_date">Promessa de Pagamento (Data)</Label>
          <Input id="promise_date" type="date" value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)}
            data-testid="promise-date-input" className="bg-background" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="agreed_amount">Valor Acordado</Label>
          <Input id="agreed_amount" type="number" step="0.01" min="0" value={agreed} onChange={(e) => setAgreed(e.target.value)}
            placeholder={String(charge.amount)} data-testid="agreed-amount-input" className="bg-background font-mono-num" />
          {charge.agreed_amount != null && (
            <p className="text-xs text-muted-foreground" data-testid="agreed-amount-display">
              Acordado: <span className="text-orange-400 font-mono-num">{money(charge.agreed_amount)}</span> de {money(charge.amount)}
            </p>
          )}
        </div>
        <button onClick={save} disabled={busy} data-testid="negotiation-save-btn"
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand text-white text-sm font-semibold hover:opacity-90 transition-opacity duration-200 disabled:opacity-50">
          <Save size={15} /> {busy ? "A guardar..." : "Guardar Negociação"}
        </button>
      </div>
    </div>
  );
}
