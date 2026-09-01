import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FolderOpen, Upload, Eye, Trash2, FileText, Image as ImageIcon } from "lucide-react";
import { api, formatApiError } from "@/lib/api";

const CATEGORIES = {
  nota_fiscal: "Nota Fiscal",
  comprovativo: "Comprovativo de Pagamento",
  guia_entrega: "Guia de Entrega",
  outro: "Outro",
};

export default function ChargeDocuments({ charge }) {
  const [docs, setDocs] = useState([]);
  const [category, setCategory] = useState("nota_fiscal");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = () => api.get(`/charges/${charge.id}/documents`).then(({ data }) => setDocs(data));
  useEffect(() => { load(); }, [charge.id]);

  const onPick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5_000_000) {
      toast.error("Ficheiro demasiado grande (máx 5MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      setBusy(true);
      try {
        await api.post(`/charges/${charge.id}/documents`, {
          category,
          filename: file.name,
          mime: file.type || "application/octet-stream",
          data_base64: reader.result,
        });
        await load();
        toast.success("Documento carregado");
      } catch (err) {
        toast.error(formatApiError(err));
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const view = async (doc) => {
    try {
      const { data } = await api.get(`/documents/${doc.id}/download`);
      const blob = await (await fetch(data.data_base64)).blob();
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (err) {
      toast.error(formatApiError(err, "Não foi possível abrir o documento"));
    }
  };

  const remove = async (doc) => {
    if (!window.confirm(`Eliminar "${doc.filename}"?`)) return;
    await api.delete(`/documents/${doc.id}`);
    await load();
    toast.success("Documento eliminado");
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4" data-testid="documents-section">
      <h3 className="font-heading text-base font-semibold flex items-center gap-2">
        <FolderOpen size={16} className="text-brand" /> Documentos
      </h3>

      <div className="space-y-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          data-testid="docs-category-select"
          className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 ring-brand"
        >
          {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={onPick} data-testid="docs-upload-input" />
        <button onClick={() => fileRef.current?.click()} disabled={busy} data-testid="docs-upload-btn"
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-brand/50 hover:bg-brand-soft transition-all duration-200 disabled:opacity-50">
          <Upload size={15} /> {busy ? "A carregar..." : "Carregar PDF ou Imagem"}
        </button>
        <p className="text-xs text-muted-foreground">Notas fiscais, comprovativos e guias de entrega · máx 5MB</p>
      </div>

      <div className="space-y-2" data-testid="documents-list">
        {docs.map((doc) => (
          <div key={doc.id} data-testid={`doc-row-${doc.id}`}
            className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-background hover:border-brand/40 transition-colors duration-200">
            {doc.mime?.startsWith("image/") ? <ImageIcon size={16} className="text-sky-400 shrink-0" /> : <FileText size={16} className="text-rose-400 shrink-0" />}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate">{doc.filename}</p>
              <p className="text-[11px] text-muted-foreground">{CATEGORIES[doc.category] || doc.category}</p>
            </div>
            <button onClick={() => view(doc)} data-testid={`doc-view-${doc.id}`}
              className="p-1.5 rounded-md text-muted-foreground hover:text-brand hover:bg-brand-soft transition-colors duration-200" title="Visualizar">
              <Eye size={14} />
            </button>
            <button onClick={() => remove(doc)} data-testid={`doc-delete-${doc.id}`}
              className="p-1.5 rounded-md text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors duration-200" title="Eliminar">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {docs.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4" data-testid="documents-empty-state">Sem documentos anexados.</p>
        )}
      </div>
    </div>
  );
}
