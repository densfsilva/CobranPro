import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/badges";
import { t } from "@/lib/i18n";

export function buildWhatsAppMessage(charge) {
  return `Olá ${charge.debtor_name}, vimos que a ${t("invoiceLower")} ${charge.invoice_number} com vencimento em ${fmtDate(charge.due_date)} ainda está pendente. Podemos ajudar?`;
}

export default function WhatsAppQuickButton({ charge, onLogged }) {
  const handle = async (e) => {
    e.stopPropagation();
    if (!charge.debtor_phone) {
      toast.error(`Esta cobrança não tem ${t("mobile").toLowerCase()} do devedor`);
      return;
    }
    const msg = buildWhatsAppMessage(charge);
    const phone = charge.debtor_phone.replace(/[^\d]/g, "");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
    try {
      await api.post(`/charges/${charge.id}/interactions`, { type: "whatsapp", note: `WhatsApp aberto: "${msg}"` });
      onLogged?.();
      toast.success("WhatsApp aberto — atividade registada na timeline");
    } catch {
      toast.info("WhatsApp aberto");
    }
  };

  return (
    <button
      onClick={handle}
      data-testid={`wa-quick-${charge.id}`}
      title={charge.debtor_phone ? `WhatsApp: ${charge.debtor_phone}` : "Sem telemóvel"}
      className="p-2 rounded-lg text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors duration-200"
    >
      <MessageCircle size={16} />
    </button>
  );
}
