import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PhoneCall, Mail, MessageCircle, StickyNote, CalendarClock, Send, History } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";

const TYPES = {
  chamada: { label: "Chamada", icon: PhoneCall, cls: "text-emerald-400" },
  email: { label: "Email", icon: Mail, cls: "text-sky-400" },
  whatsapp: { label: "WhatsApp", icon: MessageCircle, cls: "text-green-400" },
  nota: { label: "Nota", icon: StickyNote, cls: "text-amber-400" },
};

const fmtDT = (iso) =>
  new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function ChargeTimeline({ charge, onChargeUpdate }) {
  const [items, setItems] = useState([]);
  const [type, setType] = useState("chamada");
  const [note, setNote] = useState("");
  const [nextDate, setNextDate] = useState(charge.next_contact_date || "");
  const [busy, setBusy] = useState(false);

  const load = () => api.get(`/charges/${charge.id}/interactions`).then(({ data }) => setItems(data));
  useEffect(() => { load(); }, [charge.id]);

  const add = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    try {
      await api.post(`/charges/${charge.id}/interactions`, { type, note: note.trim() });
      setNote("");
      await load();
      toast.success("Contacto registado na timeline");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
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
        <History size={18} className="text-brand" /> Timeline de Contactos
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
            <Send size={13} /> Registar
          </button>
        </div>
      </form>

      <div className="space-y-0" data-testid="timeline-list">
        {items.map((it, i) => {
          const T = TYPES[it.type] || TYPES.nota;
          return (
            <div key={it.id} className="flex gap-3 group" data-testid={`timeline-item-${it.id}`}>
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <T.icon size={14} className={T.cls} />
                </div>
                {i < items.length - 1 && <div className="w-px flex-1 bg-border my-1" />}
              </div>
              <div className="pb-5 min-w-0">
                <p className="text-xs text-muted-foreground">{T.label} · {fmtDT(it.created_at)}</p>
                <p className="text-sm mt-0.5 leading-relaxed">{it.note}</p>
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
