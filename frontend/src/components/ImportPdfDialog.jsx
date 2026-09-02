import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileUp, Loader2, CheckCircle2 } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { money } from "@/lib/format";
import { fmtDate } from "@/lib/badges";
import { t, invoiceWord } from "@/lib/i18n";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function ImportPdfDialog({ onImported }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);
  const importedRef = useRef(false);

  const close = (v) => {
    setOpen(v);
    if (!v) {
      setResult(null);
      if (importedRef.current) {
        importedRef.current = false;
        onImported?.();
      }
    }
  };

  const submit = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Selecione um ficheiro PDF");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    setBusy(true);
    try {
      const { data } = await api.post("/charges/import-pdf", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setResult(data);
      if (data.created_count > 0) {
        toast.success(`${data.created_count} ${invoiceWord(data.created_count)} importada(s) com sucesso`);
        importedRef.current = true;
      } else {
        toast.warning(`Nenhuma ${t("invoiceLower")} identificada no PDF`);
      }
    } catch (err) {
      toast.error(formatApiError(err, "Não foi possível importar o PDF"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        data-testid="import-erp-btn"
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-brand/50 hover:bg-brand-soft transition-all duration-200"
      >
        <FileUp size={16} /> Importar Relatório ERP
      </button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="bg-card border-border max-w-lg" data-testid="import-erp-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">Importar Relatório ERP</DialogTitle>
            <DialogDescription className="sr-only">Carregue um PDF do seu ERP para criar faturas automaticamente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Carregue o relatório PDF do seu ERP — incluindo relatórios agrupados por cliente (ex.: Bling, com Nº doc., Vencimento e Valor por bloco de cliente). O sistema lê o ficheiro e cria automaticamente as {t("invoiceLowerPlural")} com <strong>Nome</strong>, <strong>{t("taxId")}</strong>, <strong>Valor</strong> e <strong>Vencimento</strong>.
            </p>
            <input ref={fileRef} type="file" accept=".pdf" data-testid="import-erp-file-input"
              className="w-full text-sm text-muted-foreground file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-brand file:text-white file:text-sm file:font-semibold hover:file:opacity-90 file:cursor-pointer" />
            <div className="flex justify-end">
              <button onClick={submit} disabled={busy} data-testid="import-erp-submit"
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand text-white text-sm font-semibold hover:opacity-90 transition-opacity duration-200 disabled:opacity-50">
                {busy ? <><Loader2 size={15} className="animate-spin" /> A processar dados com inteligência...</> : "Importar"}
              </button>
            </div>
            {result && (
              <div className="rounded-lg border border-border bg-background p-4 space-y-2" data-testid="import-erp-result">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-emerald-400" />
                  {result.created_count} {invoiceWord(result.created_count)} criada(s){result.skipped_count > 0 && ` · ${result.skipped_count} linha(s) ignorada(s)`}
                  {result.engine === "ia" && <span className="ml-2 px-2 py-0.5 rounded-full bg-brand-soft text-brand text-[10px] font-semibold uppercase tracking-wider" data-testid="import-erp-engine">Extração por IA</span>}
                </p>
                <div className="max-h-44 overflow-y-auto space-y-1">
                  {(result.created || []).map((c) => (
                    <p key={c.id} className="text-xs text-muted-foreground" data-testid={`import-erp-item-${c.id}`}>
                      <span className="text-foreground font-medium">{c.debtor_name}</span>
                      <span>{` · ${c.debtor_nif} · ${c.invoice_number} · ${money(c.amount)} · venc. ${fmtDate(c.due_date)}`}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
