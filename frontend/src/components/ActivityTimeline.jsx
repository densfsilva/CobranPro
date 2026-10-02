import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { PhoneCall, Mail, MessageCircle, StickyNote, CalendarClock, Send, History, Pencil, Trash2, X, FileText } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { fmtDateTime } from "@/lib/badges";
import { t } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export const ACTIVITY_TYPES = {
  chamada: { label: "Chamada", icon: PhoneCall, cls: "text-emerald-400" },
  email: { label: "Email", icon: Mail, cls: "text-sky-400" },
  whatsapp: { label: "WhatsApp", icon: MessageCircle, cls: "text-green-400" },
  nota: { label: "Nota", icon: StickyNote, cls: "text-muted-foreground" },
};

export default function ActivityTimeline({ clientKey, charges = [], currentCharge = null, onChargeUpdate, reloadSignal, onChanged }) {
  const [items, setItems] = useState([]);
  const [type, setType] = useState("chamada");
  const [note, setNote] = useState("");
  const [target, setTarget] = useState(currentCharge?.id || "");
  const [editingId, setEditingId] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [nextDate, setNextDate] = useState(currentCharge?.next_contact_date || "");
  const [busy, setBusy] = useState(false);
  const encodedKey = encodeURIComponent(clientKey);

  const load = () => api.get(`/clients/${encodedKey}/interactions`).then(({ data }) => setItems(data)).catch(() => setItems([]));
  useEffect(() => { load(); }, [clientKey, reloadSignal]);

  const submit = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    try {
      if (editingId) {
        await api.put(`/interactions/${editingId}`, { type, note: note.trim() });
        toast.success("Registo atualizado");
      } else if (currentCharge) {
        await api.post(`/charges/${currentCharge.id}/interactions`, { type, note: note.trim() });
        toast.success("Contacto registado na timeline");
      } else {
        await api.post(`/clients/${encodedKey}/interactions`, { type, note: note.trim(), charge_id: target || null });
        toast.success("Contacto registado na timeline do cliente");
      }
      setNote("");
      setEditingId(null);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally { setBusy(false); }
  };

  const startEdit = (it) => { setEditingId(it.id); setType(ACTIVITY_TYPES[it.type] ? it.type : "nota"); setNote(it.note); };
  const cancelEdit = () => { setEditingId(null); setNote(""); setType("chamada"); };

  const confirmDelete = async () => {
    const it = toDelete;
    setToDelete(null);
    try {
      await api.delete(`/interactions/${it.id}`);
      await load();
      onChanged?.();
      toast.success("Registo apagado");
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const saveNext = async () => {
    setBusy(true);
    try {
      const { data } = await api.put(`/charges/${currentCharge.id}`, { ...currentCharge, next_contact_date: nextDate || null });
      onChargeUpdate?.(data);
      toast.success("Próximo contacto atualizado");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally { setBusy(false); }
  };

  const today = new Date().toISOString().slice(0, 10);
  const followupOverdue = currentCharge?.next_contact_date && currentCharge.next_contact_date <= today && currentCharge.status !== "paga";

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-5 h-full" data-testid="timeline-section">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-heading text-lg font-semibold flex items-center gap-2"><History size={18} className="text-brand" /> Timeline Unificada do Cliente</h2>
        <span className="text-xs text-muted-foreground" data-testid="timeline-count">{items.length} {items.length === 1 ? "atividade" : "atividades"} · todas as {t("invoiceLowerPlural")}</span>
      </div>

      {currentCharge && (
        <div className={`rounded-lg border p-3 flex flex-wrap items-center gap-3 ${followupOverdue ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-background"}`} data-testid="next-contact-card">
          <CalendarClock size={18} className={followupOverdue ? "text-amber-400" : "text-muted-foreground"} />
          <div className="flex-1 min-w-[140px]">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Próximo Contacto</p>
            {followupOverdue && <p className="text-xs text-amber-400 font-medium" data-testid="next-contact-overdue-label">Follow-up em atraso — alerta ativo no Dashboard</p>}
          </div>
          <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} data-testid="next-contact-input" className="bg-card w-40" />
          <button onClick={saveNext} disabled={busy} data-testid="next-contact-save-btn" className="px-3 py-2 rounded-lg bg-brand text-white text-xs font-semibold hover:opacity-90 transition-opacity duration-200 disabled:opacity-50">{t("save")}</button>
        </div>
      )}

      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <div className="flex gap-1.5 flex-wrap">
          {Object.entries(ACTIVITY_TYPES).map(([key, T]) => (
            <button key={key} type="button" data-testid={`timeline-type-${key}`} onClick={() => setType(key)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors duration-200 ${type === key ? "bg-brand-soft text-brand border-brand/40" : "border-border text-muted-foreground hover:text-foreground"}`}>
              <T.icon size={13} /> {T.label}
            </button>
          ))}
        </div>
        {!currentCharge && !editingId && charges.length > 0 && (
          <select value={target} onChange={(e) => setTarget(e.target.value)} data-testid="timeline-target-select"
            className="h-9 rounded-lg border border-border bg-background px-2 text-xs text-foreground">
            <option value="">Geral (cliente)</option>
            {charges.map((c) => <option key={c.id} value={c.id}>{c.invoice_number}</option>)}
          </select>
        )}
        <div className="flex gap-2 flex-1 min-w-[220px]">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Ex: Liguei hoje, cliente pediu novo prazo..." data-testid="timeline-note-input" className="bg-background flex-1" />
          <button type="submit" disabled={busy || !note.trim()} data-testid="timeline-add-btn"
            className="px-3 py-2 rounded-lg bg-brand text-white text-xs font-semibold hover:opacity-90 transition-opacity duration-200 disabled:opacity-50 flex items-center gap-1.5">
            <Send size={13} /> {editingId ? t("save") : t("registerVerb")}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} data-testid="timeline-cancel-edit" className="px-3 py-2 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors duration-200 flex items-center gap-1">
              <X size={13} /> Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="space-y-0" data-testid="timeline-list">
        {items.map((it, i) => {
          const T = ACTIVITY_TYPES[it.type] || ACTIVITY_TYPES.nota;
          const other = it.charge_id && it.charge_id !== currentCharge?.id;
          return (
            <div key={it.id} className="flex gap-3 group" data-testid={`timeline-item-${it.id}`}>
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0"><T.icon size={14} className={T.cls} /></div>
                {i < items.length - 1 && <div className="w-px flex-1 bg-border my-1" />}
              </div>
              <div className="pb-5 min-w-0 flex-1">
                <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                  <span>{T.label} · {fmtDateTime(it.created_at)}</span>
                  {it.invoice_number ? (
                    other ? (
                      <Link to={`/cobranca/${it.charge_id}`} data-testid={`timeline-invoice-${it.id}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary text-[10px] font-mono-num hover:text-brand transition-colors duration-150">
                        <FileText size={10} /> {it.invoice_number}
                      </Link>
                    ) : (
                      <span data-testid={`timeline-invoice-${it.id}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-brand-soft text-brand text-[10px] font-mono-num"><FileText size={10} /> {it.invoice_number}</span>
                    )
                  ) : (
                    <span data-testid={`timeline-invoice-${it.id}`} className="px-1.5 py-0.5 rounded bg-secondary text-[10px]">Geral</span>
                  )}
                </p>
                <p className="text-sm mt-0.5 leading-relaxed">{it.note}</p>
              </div>
              <div className="flex gap-1 self-start opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
                <button onClick={() => startEdit(it)} data-testid={`timeline-edit-${it.id}`} title="Editar registo" className="p-1.5 rounded-md text-muted-foreground hover:text-brand hover:bg-brand-soft transition-colors duration-200"><Pencil size={13} /></button>
                <button onClick={() => setToDelete(it)} data-testid={`timeline-delete-${it.id}`} title="Apagar registo" className="p-1.5 rounded-md text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors duration-200"><Trash2 size={13} /></button>
              </div>
            </div>
          );
        })}
        {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-6" data-testid="timeline-empty-state">Ainda não há contactos registados para este cliente. Registe o primeiro acima.</p>}
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent className="bg-card border-border" data-testid="timeline-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">Apagar registo da timeline</AlertDialogTitle>
            <AlertDialogDescription>Esta ação é definitiva. O registo "{toDelete?.note?.slice(0, 80)}" será removido do histórico do cliente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="timeline-delete-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} data-testid="timeline-delete-confirm" className="bg-rose-600 text-white hover:opacity-90">Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
