import { useState } from "react";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { t } from "@/lib/i18n";
import MessageModal from "@/components/MessageModal";

export default function WhatsAppQuickButton({ charge, onLogged }) {
  const [open, setOpen] = useState(false);
  const number = charge.whatsapp || charge.debtor_phone;

  const handle = (e) => {
    e.stopPropagation();
    if (!number) {
      toast.error(`Esta cobrança não tem ${t("mobile").toLowerCase()} do devedor`);
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <button onClick={handle} data-testid={`wa-quick-${charge.id}`} title={number ? `WhatsApp: ${number}` : "Sem telemóvel"}
        className="p-2 rounded-lg text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors duration-200">
        <MessageCircle size={16} />
      </button>
      {open && (
        <div onClick={(e) => e.stopPropagation()}>
          <MessageModal channel="whatsapp" charge={charge} open={open} onOpenChange={setOpen} onLogged={onLogged} defaultTemplate="rapido" />
        </div>
      )}
    </>
  );
}
