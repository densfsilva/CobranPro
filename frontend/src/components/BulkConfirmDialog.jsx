import { money } from "@/lib/format";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const COPY = {
  pay: {
    title: "Marcar como pagas?",
    text: (n, total) => `${n} ${n === 1 ? "título" : "títulos"} no valor total de ${total} serão marcados como recebidos hoje e passarão para o Histórico de Recebidos.`,
    action: "Marcar como pago",
    cls: "bg-emerald-600 text-white hover:bg-emerald-600/90",
  },
  delete: {
    title: "Apagar títulos selecionados?",
    text: (n, total) => `${n} ${n === 1 ? "título" : "títulos"} (${total}) e todas as suas atividades e anexos serão eliminados definitivamente. Esta ação não pode ser revertida.`,
    action: "Apagar definitivamente",
    cls: "bg-rose-600 text-white hover:bg-rose-600/90",
  },
};

export default function BulkConfirmDialog({ kind, count, total, onConfirm, onCancel, busy }) {
  const c = COPY[kind] || COPY.pay;
  return (
    <AlertDialog open={!!kind} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent className="bg-card border-border" data-testid="bulk-confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading">{c.title}</AlertDialogTitle>
          <AlertDialogDescription data-testid="bulk-confirm-text">{c.text(count, money(total))}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="bulk-confirm-cancel" disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction data-testid="bulk-confirm-ok" disabled={busy} onClick={(e) => { e.preventDefault(); onConfirm(); }} className={c.cls}>
            {busy ? "A processar..." : c.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
