import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PhoneCall, Mail, MessageCircle, StickyNote, CalendarClock, Send, History, Pencil, Trash2, X } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { t } from "@/lib/i18n";
import { Input } from "@/components/ui/input";

const TYPES = {
  chamada: { label: "Chamada", icon: PhoneCall, cls: "text-emerald-400" },
  email: { label: "Email", icon: Mail, cls: "text-sky-400" },
  whatsapp: { label: "WhatsApp", icon: MessageCircle, cls: "text-green-400" },
};

const fmtDT = (iso) =>
  new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function ChargeTimeline({ charge, onChargeUpdate, reloadSignal }) {
  const [items, setItems] = useState([]);
  const [type, setType] = useState("chamada");
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [nextDate, setNextDate] = useState(charge.next_contact_date || "");
  const [busy, setBusy] = useState(false);

  const load = () => api.get(`/charges/${charge.id}/interactions`).then(({ data }) => setItems(data));
  useEffect(() => { load(); }, [charge.id, reloadSignal]);

  const add = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    try {
      if (editingId) {
        await api.put(`/interactions/${editingId}`, { type, note: note.trim() });
        toast.success("Registo atualizado");
      } else {
        await api.post(`/charges/${charge.id}/interactions`, { type, note: note.trim() });
        toast.success("Contacto registado na timeline");
      }
      setNote("");
      setEditingId(null);
      await load();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (it) => {
    setEditingId(it.id);
    setType(TYPES[it.type] ? it.type : "chamada");
    setNote(it.note);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setNote("");
    setType("chamada");
  };

  const removeItem = async (it) => {
    if (!window.confirm("Apagar este registo da timeline?")) return;
    try {
      await api.delete(`/interactions/${it.id}`);
      await load();
      toast.success("Registo apagado");
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const saveNext = async () => {
    setBusy(true);
    try {
      const { data } = await api.put(`/charges/${charge.id}`, { ...charge, next_contact_date: nextDate || null });
      onChargeUpdate(data);
      toast.success("Próximo contacto atualizado");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const followupOverdue = charge.next_contact_date && charge.next_contact_date <= today && charge.status !== "paga";

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-5 h-full" data-testid="timeline-section">
      <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
        <History size={18} className="text-brand" /> Timeline de Atividades
      </h2>

      <div className={`rounded-lg border p-3 flex flex-wrap items-center gap-3 ${followupOverdue ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-background"}`}
        data-testid="next-contact-card">
        <CalendarClock size={18} className={followupOverdue ? "text-amber-400" : "text-muted-foreground"} />
        <div className="flex-1 min-w-[140px]">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Próximo Contacto</p>
          {followupOverdue && <p className="text-xs text-amber-400 font-medium" data-testid="next-contact-overdue-label">Follow-up em atraso — alerta ativo no Dashboard</p>}
        </div>
        <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)}
          data-testid="next-contact-input" className="bg-card w-40" />
        <button onClick={saveNext} disabled={busy} data-testid="next-contact-save-btn"
          className="px-3 py-2 rounded-lg bg-brand text-white text-xs font-semibold hover:opacity-90 transition-opacity duration-200 disabled:opacity-50">
          Guardar
        </button>
      </div>

      <form onSubmit={add} className="flex flex-wrap gap-2">
        <div className="flex gap-1.5">
          {Object.entries(TYPES).map(([key, t]) => (
            <button key={key} type="button" data-testid={`timeline-type-${key}`} onClick={() => setType(key)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors duration-200 ${
                type === key ? "bg-brand-soft text-brand border-brand/40" : "border-border text-muted-foreground hover:text-foreground"
              }`}>
              <t.icon size={13} /> {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-1 min-w-[220px]">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000}
            placeholder="Ex: Liguei hoje, cliente pediu novo prazo..." data-testid="timeline-note-input" className="bg-background flex-1" />
          <button type="submit" disabled={busy || !note.trim()} data-testid="timeline-add-btn"
            className="px-3 py-2 rounded-lg bg-brand text-white text-xs font-semibold hover:opacity-90 transition-opacity duration-200 disabled:opacity-50 flex items-center gap-1.5">
            <Send size={13} /> {editingId ? t("save") : t("registerVerb")}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} data-testid="timeline-cancel-edit"
              className="px-3 py-2 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors duration-200 flex items-center gap-1">
              <X size={13} /> Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="space-y-0" data-testid="timeline-list">
        {items.map((it, i) => {
          const T = TYPES[it.type] || { label: "Nota", icon: StickyNote, cls: "text-muted-foreground" };
          return (
            <div key={it.id} className="flex gap-3 group" data-testid={`timeline-item-${it.id}`}>
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <T.icon size={14} className={T.cls} />
                </div>
                {i < items.length - 1 && <div className="w-px flex-1 bg-border my-1" />}
              </div>
              <div className="pb-5 min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{T.label} · {fmtDT(it.created_at)}</p>
                <p className="text-sm mt-0.5 leading-relaxed">{it.note}</p>
              </div>
              <div className="flex gap-1 self-start opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <button onClick={() => startEdit(it)} data-testid={`timeline-edit-${it.id}`} title="Editar registo"
                  className="p-1.5 rounded-md text-muted-foreground hover:text-brand hover:bg-brand-soft transition-colors duration-200">
                  <Pencil size={13} />
                </button>
                <button onClick={() => removeItem(it)} data-testid={`timeline-delete-${it.id}`} title="Apagar registo"
                  className="p-1.5 rounded-md text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors duration-200">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6" data-testid="timeline-empty-state">
            Ainda não há contactos registados. Registe o primeiro acima.
          </p>
        )}
      </div>
    </div>
  );
}
