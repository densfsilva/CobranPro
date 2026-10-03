import { useState } from "react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import BulkActionBar from "@/components/BulkActionBar";
import BulkConfirmDialog from "@/components/BulkConfirmDialog";
import BulkMessageDialog from "@/components/BulkMessageDialog";

export default function BulkActions({ selection, reload, testid, allowPay = true, allowMessage = true }) {
  const { isAdmin } = useAuth();
  const [msgOpen, setMsgOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const disabled = {
    message: allowMessage ? "" : "Mensagens só se aplicam a títulos por liquidar",
    pay: !isAdmin ? "Apenas administradores" : allowPay ? "" : "Estes títulos já não podem ser marcados como pagos",
    delete: !isAdmin ? "Apenas administradores" : "",
  };

  const run = async () => {
    setBusy(true);
    const ids = selection.selectedItems.map((c) => c.id);
    try {
      const { data } = await api.post("/charges/bulk", { ids, action: confirm === "pay" ? "mark_paid" : "delete" });
      toast.success(confirm === "pay"
        ? `${data.affected} ${data.affected === 1 ? "título marcado" : "títulos marcados"} como pago${data.ignored ? ` · ${data.ignored} ignorado(s)` : ""}`
        : `${data.affected} ${data.affected === 1 ? "título apagado" : "títulos apagados"}`);
      setConfirm(null);
      selection.clear();
      await reload();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally { setBusy(false); }
  };

  return (
    <>
      <BulkActionBar
        count={selection.count}
        total={selection.total}
        onClear={selection.clear}
        onPdf={() => window.print()}
        onMessage={() => setMsgOpen(true)}
        onPay={() => setConfirm("pay")}
        onDelete={() => setConfirm("delete")}
        disabled={disabled}
        testid={testid}
      />
      <BulkMessageDialog open={msgOpen} onOpenChange={setMsgOpen} charges={selection.selectedItems} onDone={reload} />
      <BulkConfirmDialog kind={confirm} count={selection.count} total={selection.total} busy={busy} onConfirm={run} onCancel={() => !busy && setConfirm(null)} />
    </>
  );
}
