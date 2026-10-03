import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Mail, MessageCircle, Send, ExternalLink, Check, AlertTriangle } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TEMPLATES, renderTemplate } from "@/components/MessageModal";

const ROW = "flex items-center justify-between gap-3 py-2 border-b border-border/50 last:border-0 text-sm";

function EmailTab({ charges, onDone }) {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const withEmail = charges.filter((c) => c.debtor_email);
  const without = charges.filter((c) => !c.debtor_email);

  const send = async () => {
    setSending(true);
    try {
      const { data } = await api.post("/charges/bulk-email", { ids: withEmail.map((c) => c.id) });
      setResult(data);
      if (data.sent_count) toast.success(`${data.sent_count} ${data.sent_count === 1 ? "email enviado" : "emails enviados"} — registados na timeline`);
      else toast.warning("Nenhum email foi enviado");
      onDone?.();
    } catch (err) {
      toast.error(formatApiError(err, "Não foi possível enviar os emails"));
    } finally { setSending(false); }
  };

  if (result) {
    const groups = [
      ["sent", "Enviados", "text-emerald-400"],
      ["rate_limited", "Já enviado na última hora", "text-amber-400"],
      ["no_email", "Sem email", "text-muted-foreground"],
      ["failed", "Falharam", "text-rose-400"],
    ];
    return (
      <div className="space-y-3" data-testid="bulk-email-result">
        {groups.filter(([k]) => result[k]?.length).map(([k, label, cls]) => (
          <div key={k}>
            <p className={`text-xs font-semibold uppercase tracking-wider ${cls}`}>{label} · {result[k].length}</p>
            {result[k].map((it) => (
              <div key={it.id} className={ROW} data-testid={`bulk-email-${k}-${it.id}`}>
                <span className="truncate">{it.debtor_name} <span className="text-muted-foreground font-mono-num text-xs">{it.invoice_number}</span></span>
                <span className="text-xs text-muted-foreground truncate">{it.email || it.error || "—"}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        O email profissional de cobrança (com dados de pagamento e botão de comprovativo) será enviado a cada destinatário e registado na timeline. Limite: 1 email por cobrança por hora.
      </p>
      <div className="max-h-56 overflow-y-auto pr-1" data-testid="bulk-email-recipients">
        {withEmail.map((c) => (
          <div key={c.id} className={ROW}>
            <span className="truncate">{c.debtor_name} <span className="text-muted-foreground font-mono-num text-xs">{c.invoice_number}</span></span>
            <span className="text-xs text-sky-300 truncate">{c.debtor_email}</span>
          </div>
        ))}
        {without.map((c) => (
          <div key={c.id} className={`${ROW} opacity-60`}>
            <span className="truncate">{c.debtor_name} <span className="text-muted-foreground font-mono-num text-xs">{c.invoice_number}</span></span>
            <span className="text-xs text-amber-400 flex items-center gap-1"><AlertTriangle size={12} /> sem email</span>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button onClick={send} disabled={sending || !withEmail.length} data-testid="bulk-email-send-btn" className="bg-emerald-600 text-white hover:opacity-90">
          <Send size={15} className="mr-2" /> {sending ? "A enviar..." : `Enviar ${withEmail.length} ${withEmail.length === 1 ? "email" : "emails"}`}
        </Button>
      </div>
    </div>
  );
}

function WhatsAppTab({ charges, onDone }) {
  const { company } = useAuth();
  const [template, setTemplate] = useState("rapido");
  const [text, setText] = useState(TEMPLATES.rapido.text);
  const [opened, setOpened] = useState({});

  const changeTemplate = (k) => { setTemplate(k); setText(TEMPLATES[k].text); };
  const numberOf = (c) => c.whatsapp || c.debtor_phone || "";

  const open = async (c) => {
    const msg = renderTemplate(text, c, company);
    window.open(`https://wa.me/${numberOf(c).replace(/[^\d]/g, "")}?text=${encodeURIComponent(msg)}`, "_blank");
    setOpened((o) => ({ ...o, [c.id]: true }));
    try {
      await api.post(`/charges/${c.id}/interactions`, { type: "whatsapp", note: `WhatsApp preparado em lote (template: ${TEMPLATES[template].label}): "${msg.slice(0, 140)}${msg.length > 140 ? "…" : ""}"` });
      onDone?.();
    } catch { /* registo não bloqueia */ }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap" data-testid="bulk-wa-template-selector">
        {Object.entries(TEMPLATES).map(([key, tp]) => (
          <button key={key} type="button" data-testid={`bulk-wa-template-${key}`} onClick={() => changeTemplate(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors duration-200 ${template === key ? "bg-brand-soft text-brand border-brand/40" : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
            {tp.label}
          </button>
        ))}
      </div>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} data-testid="bulk-wa-textarea" className="bg-background font-mono-num text-xs leading-relaxed resize-none" />
      <p className="text-xs text-muted-foreground">Os campos [Nome], [Fatura], [Valor], [Data Vencimento], [Dias], [IBAN] e [Empresa] são preenchidos para cada cliente ao abrir.</p>
      <div className="max-h-52 overflow-y-auto pr-1" data-testid="bulk-wa-list">
        {charges.map((c) => {
          const num = numberOf(c);
          return (
            <div key={c.id} className={ROW}>
              <span className="truncate">
                {c.debtor_name} <span className="text-muted-foreground font-mono-num text-xs">{c.invoice_number} · {money(c.amount)}</span>
                {!num && <span className="block text-xs text-amber-400">sem {t("mobile").toLowerCase()}</span>}
              </span>
              <Button size="sm" variant="ghost" disabled={!num} onClick={() => open(c)} data-testid={`bulk-wa-open-${c.id}`}
                className={opened[c.id] ? "text-emerald-400" : "text-foreground"}>
                {opened[c.id] ? <Check size={14} className="mr-1.5" /> : <ExternalLink size={14} className="mr-1.5" />}
                {opened[c.id] ? "Aberto" : "Abrir"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function BulkMessageDialog({ open, onOpenChange, charges, onDone }) {
  const [tab, setTab] = useState("email");
  useEffect(() => { if (open) setTab("email"); }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-xl" data-testid="bulk-message-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">Mensagem em lote · {charges.length} {charges.length === 1 ? "título" : "títulos"}</DialogTitle>
          <DialogDescription className="text-xs">Escolha o canal para contactar os clientes selecionados.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-2 bg-secondary">
            <TabsTrigger value="email" data-testid="bulk-tab-email" className="gap-2"><Mail size={14} /> Email</TabsTrigger>
            <TabsTrigger value="whatsapp" data-testid="bulk-tab-whatsapp" className="gap-2"><MessageCircle size={14} /> WhatsApp</TabsTrigger>
          </TabsList>
          <TabsContent value="email" className="pt-3"><EmailTab charges={charges} onDone={onDone} /></TabsContent>
          <TabsContent value="whatsapp" className="pt-3"><WhatsAppTab charges={charges} onDone={onDone} /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
