import { useState, useMemo } from "react";
import { toast } from "sonner";
import { MessageCircle, Mail, Copy, ExternalLink, Send } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fmtDate } from "@/lib/badges";
import { money } from "@/lib/format";
import { t } from "@/lib/i18n";

const TEMPLATES = {
  lembrete: {
    label: "1º Lembrete",
    text: "Olá [Nome],\n\nConstatámos que a fatura [Fatura], no valor de [Valor], com vencimento a [Data Vencimento], se encontra em atraso há [Dias] dias.\n\nAgradecemos a regularização para o IBAN [IBAN], com a maior brevidade possível.\n\nCom os melhores cumprimentos,\n[Empresa]",
  },
  aviso: {
    label: "Aviso Formal",
    text: "Exmo.(a) Sr.(a) [Nome],\n\nApesar dos contactos anteriores, a fatura [Fatura] no valor de [Valor] (vencida a [Data Vencimento]) permanece por liquidar, totalizando [Dias] dias de atraso.\n\nSolicitamos o pagamento para o IBAN [IBAN] no prazo de 5 dias úteis, sob pena de custos adicionais de cobrança.\n\nAtenciosamente,\n[Empresa]",
  },
  legal: {
    label: "Pré-Aviso Legal",
    text: "Exmo.(a) Sr.(a) [Nome],\n\nEste é o último aviso antes de encaminharmos o processo da fatura [Fatura] ([Valor], vencida a [Data Vencimento], [Dias] dias em atraso) para a via judicial.\n\nPara evitar custas e honorários adicionais, efetue o pagamento imediato para o IBAN [IBAN].\n\nDepartamento de Cobranças,\n[Empresa]",
  },
};

export function buildMessage(templateKey, charge, company) {
  return TEMPLATES[templateKey].text
    .replaceAll("[Nome]", charge.debtor_name)
    .replaceAll("[Fatura]", charge.invoice_number)
    .replaceAll("[Valor]", money(charge.amount))
    .replaceAll("[Data Vencimento]", fmtDate(charge.due_date))
    .replaceAll("[Dias]", String(charge.days_overdue))
    .replaceAll("[IBAN]", company.iban || "—")
    .replaceAll("[Empresa]", company.company_name)
    .replaceAll("fatura", t("invoiceLower"))
    .replaceAll("o IBAN", t("bankRef"));
}

export default function MessageModal({ channel, charge, open, onOpenChange, onLogged }) {
  const { company } = useAuth();
  const [template, setTemplate] = useState("lembrete");
  const [customText, setCustomText] = useState(null);
  const [sending, setSending] = useState(false);

  const baseText = useMemo(
    () => (charge ? buildMessage(template, charge, company) : ""),
    [template, charge, company]
  );
  const text = customText ?? baseText;

  if (!charge) return null;
  const isWhatsApp = channel === "whatsapp";

  const changeTemplate = (k) => {
    setTemplate(k);
    setCustomText(null);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Mensagem copiada para a área de transferência");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        toast.success("Mensagem copiada para a área de transferência");
      } catch {
        toast.error("Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.");
      }
      document.body.removeChild(ta);
    }
  };

  const logActivity = async (note) => {
    try {
      await api.post(`/charges/${charge.id}/interactions`, { type: channel, note });
      onLogged?.();
    } catch { /* o registo não deve bloquear o envio */ }
  };

  const launch = () => {
    if (isWhatsApp) {
      const phone = (charge.debtor_phone || "").replace(/[^\d]/g, "");
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
    } else {
      const subject = `Lembrete de pagamento — ${t("invoice")} ${charge.invoice_number}`;
      window.open(`mailto:${charge.debtor_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`, "_blank");
    }
    logActivity(`${isWhatsApp ? "WhatsApp" : "Email"} preparado (template: ${TEMPLATES[template].label}): "${text.slice(0, 140)}${text.length > 140 ? "…" : ""}"`);
    toast.info(isWhatsApp ? "A abrir o WhatsApp — atividade registada..." : "A abrir o cliente de email — atividade registada...");
  };

  const sendReal = async () => {
    setSending(true);
    try {
      await api.post(`/charges/${charge.id}/send-email`);
      toast.success(`Email de cobrança enviado para ${charge.debtor_email} — registado na timeline`);
      onLogged?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(formatApiError(err, "Não foi possível enviar o email"));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); setCustomText(null); }}>
      <DialogContent className="bg-card border-border max-w-xl" data-testid="message-modal">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            {isWhatsApp ? <MessageCircle size={20} className="text-emerald-400" /> : <Mail size={20} className="text-sky-400" />}
            Preparar mensagem via {isWhatsApp ? "WhatsApp" : "Email"}
          </DialogTitle>
          <DialogDescription className="sr-only">Janela de preparação de mensagem de lembrete com texto pré-preenchido.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap" data-testid="message-template-selector">
            {Object.entries(TEMPLATES).map(([key, t]) => (
              <button
                key={key}
                type="button"
                data-testid={`template-${key}-btn`}
                onClick={() => changeTemplate(key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors duration-200 ${
                  template === key ? "bg-brand-soft text-brand border-brand/40" : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Textarea
            value={text}
            onChange={(e) => setCustomText(e.target.value)}
            rows={11}
            data-testid="message-modal-textarea"
            className="bg-background font-mono-num text-xs leading-relaxed resize-none"
          />
          <p className="text-xs text-muted-foreground">
            Destinatário: {isWhatsApp ? charge.debtor_phone || "sem telemóvel" : charge.debtor_email || "sem email"} · Edite o texto livremente antes de enviar.
          </p>
          <div className="flex justify-end gap-2 flex-wrap">
            <Button variant="ghost" onClick={copy} data-testid="message-modal-copy-btn">
              <Copy size={15} className="mr-2" /> Copiar
            </Button>
            {!isWhatsApp && (
              <Button onClick={sendReal} disabled={sending || !charge.debtor_email} data-testid="message-modal-send-btn"
                className="bg-emerald-600 text-white hover:opacity-90">
                <Send size={15} className="mr-2" /> {sending ? "A enviar..." : "Enviar Email"}
              </Button>
            )}
            <Button onClick={launch} data-testid="message-modal-launch-btn" className="bg-brand text-white hover:opacity-90">
              <ExternalLink size={15} className="mr-2" />
              {isWhatsApp ? "Abrir no WhatsApp" : "Abrir Email"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
