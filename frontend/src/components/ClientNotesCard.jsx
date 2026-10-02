import { useEffect, useState } from "react";
import { toast } from "sonner";
import { NotebookPen, Save } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { t } from "@/lib/i18n";
import { Textarea } from "@/components/ui/textarea";

export default function ClientNotesCard({ clientKey, value, canEdit, onSaved }) {
  const [text, setText] = useState(value || "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setText(value || ""); }, [value]);

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.put(`/clients/${encodeURIComponent(clientKey)}`, { observacoes: text });
      onSaved?.(data);
      toast.success("Observações gerais guardadas");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally { setBusy(false); }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-3" data-testid="client-notes-card">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-heading text-lg font-semibold flex items-center gap-2"><NotebookPen size={18} className="text-brand" /> Observações Gerais do Cliente</h2>
        <span className="text-xs text-muted-foreground">Partilhadas por todas as {t("invoiceLowerPlural")} deste cliente</span>
      </div>
      {canEdit ? (
        <>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={5000} data-testid="client-notes-textarea"
            placeholder="Ex: Cliente prefere contacto por WhatsApp após as 14h. Pagamentos habitualmente por transferência..." className="bg-background text-sm leading-relaxed" />
          <div className="flex justify-end">
            <button onClick={save} disabled={busy || text === (value || "")} data-testid="client-notes-save-btn"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-white text-xs font-semibold hover:opacity-90 transition-opacity duration-200 disabled:opacity-50">
              <Save size={14} /> {busy ? "A guardar..." : `${t("save")} Observações`}
            </button>
          </div>
        </>
      ) : (
        <p className="text-sm leading-relaxed whitespace-pre-wrap" data-testid="client-notes-readonly">{value || "Sem observações registadas."}</p>
      )}
    </div>
  );
}
