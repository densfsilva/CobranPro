import { X, FileText, Send, CheckCircle2, Trash2 } from "lucide-react";
import { money } from "@/lib/format";

const BTN = "flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent";

export default function BulkActionBar({ count, total, onClear, onPdf, onMessage, onPay, onDelete, disabled = {}, testid = "bulk" }) {
  if (!count) return null;
  const actions = [
    { key: "pdf", label: "Relatório PDF", icon: FileText, onClick: onPdf, cls: "text-foreground hover:bg-secondary" },
    { key: "message", label: "Mensagem em lote", icon: Send, onClick: onMessage, cls: "text-sky-300 hover:bg-sky-500/10" },
    { key: "pay", label: "Marcar como pago", icon: CheckCircle2, onClick: onPay, cls: "text-emerald-400 hover:bg-emerald-500/10" },
    { key: "delete", label: "Apagar", icon: Trash2, onClick: onDelete, cls: "text-rose-400 hover:bg-rose-500/10" },
  ];
  return (
    <div
      data-testid={`${testid}-action-bar`}
      className="fixed bottom-6 left-16 lg:left-60 right-0 z-40 flex justify-center px-4 pointer-events-none print:hidden"
    >
      <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-2xl border border-brand/40 bg-card/90 backdrop-blur-xl shadow-[0_18px_50px_-12px_rgba(0,0,0,0.6)] px-3 py-2 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center gap-3 pl-2 pr-4 border-r border-border mr-1">
          <span className="h-7 min-w-7 px-2 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center font-mono-num" data-testid={`${testid}-selected-count`}>{count}</span>
          <div className="leading-tight">
            <p className="text-xs font-semibold">{count === 1 ? "título selecionado" : "títulos selecionados"}</p>
            <p className="text-xs text-muted-foreground font-mono-num" data-testid={`${testid}-selected-total`}>{money(total)}</p>
          </div>
        </div>
        {actions.map(({ key, label, icon: Icon, onClick, cls }) => (
          <button
            key={key}
            type="button"
            onClick={onClick}
            disabled={!!disabled[key]}
            title={disabled[key] || label}
            data-testid={`${testid}-${key}-btn`}
            className={`${BTN} ${cls}`}
          >
            <Icon size={15} /> <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
        <button type="button" onClick={onClear} data-testid={`${testid}-clear-btn`} title="Limpar seleção"
          className="ml-1 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors duration-200">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
