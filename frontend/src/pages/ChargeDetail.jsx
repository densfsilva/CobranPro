import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, MessageCircle, Mail, Phone, User, FileText, Trash2, CheckCircle2, Clock, Handshake, Pencil, XCircle, Printer, Contact } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { BUCKETS, fmtDate } from "@/lib/badges";
import { money, idLabel } from "@/lib/format";
import { t } from "@/lib/i18n";
import { maskPhone, clientGroupKey, clientPath } from "@/lib/masks";
import { useAuth } from "@/context/AuthContext";
import MessageModal from "@/components/MessageModal";
import ActivityTimeline from "@/components/ActivityTimeline";
import ChargeDocuments from "@/components/ChargeDocuments";
import NegotiationCard from "@/components/NegotiationCard";
import ChargeFormDialog from "@/components/ChargeFormDialog";
import ClientNotesCard from "@/components/ClientNotesCard";
import ClientReport from "@/components/ClientReport";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const ACTION_CLS = "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-all duration-200";

export default function ChargeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, company } = useAuth();
  const [charge, setCharge] = useState(null);
  const [client, setClient] = useState(null);
  const [modal, setModal] = useState(null);
  const [timelineTick, setTimelineTick] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadClient = (c) => api.get(`/clients/${encodeURIComponent(clientGroupKey(c))}`).then(({ data }) => setClient(data)).catch(() => setClient(null));

  const load = async () => {
    try {
      const { data } = await api.get(`/charges/${id}`);
      setCharge(data);
      loadClient(data);
    } catch {
      toast.error("Cobrança não encontrada");
      navigate("/");
    }
  };

  useEffect(() => { load(); }, [id]);

  if (!charge) {
    return <div className="flex justify-center py-24"><div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" /></div>;
  }

  const badge = BUCKETS[charge.bucket];
  const pendente = charge.status === "pendente";
  const country = company?.country || "PT";

  const setStatus = async (s) => {
    setBusy(true);
    try {
      const { data } = await api.put(`/charges/${id}`, { ...charge, status: s });
      setCharge(data);
      loadClient(data);
      const msgs = { paga: "Cobrança marcada como paga", negociacao: "Cobrança movida para Em Negociação", pendente: "Cobrança de volta ao fluxo ativo", cancelada: "Cobrança cancelada" };
      toast.success(msgs[s]);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally { setBusy(false); }
  };

  const remove = async () => {
    setConfirmDelete(false);
    await api.delete(`/charges/${id}`);
    toast.success("Cobrança eliminada");
    navigate("/");
  };

  const onTimelineChanged = () => { setTimelineTick((n) => n + 1); loadClient(charge); };

  const tel = (num, testid) => num ? (
    <a href={`tel:+${num.replace(/[^\d]/g, "")}`} data-testid={testid} className="text-brand hover:underline inline-flex items-center gap-1.5"><Phone size={13} /> {maskPhone(num, country)}</a>
  ) : "—";

  return (
    <div className="space-y-6 max-w-5xl" data-testid="charge-detail-page">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button onClick={() => navigate(-1)} data-testid="back-to-dashboard-btn" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">
          <ArrowLeft size={16} /> Voltar
        </button>
        <Link to={clientPath(charge)} data-testid="view-client-link" className="flex items-center gap-2 text-sm text-brand hover:underline">
          <Contact size={15} /> Ver ficha completa do cliente
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight" data-testid="charge-debtor-name">{charge.debtor_name}</h1>
            <span data-testid="charge-status-badge" className={`px-3 py-1 rounded-full text-xs font-medium border ${badge.cls}`}>{badge.label}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("invoice")} <span className="font-mono-num">{charge.invoice_number}</span> · vencida a {fmtDate(charge.due_date)}
            {pendente && charge.days_overdue > 0 && <> · <span className="text-rose-400 font-medium">{charge.days_overdue} dias em atraso</span></>}
            {charge.status === "paga" && charge.paid_at && <> · <span className="text-emerald-400 font-medium" data-testid="charge-paid-at">recebida a {fmtDate(charge.paid_at.slice(0, 10))}{charge.paid_days_late > 0 ? ` (${charge.paid_days_late}d de atraso)` : " (em dia)"}</span></>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => window.print()} data-testid="charge-print-btn" className={`${ACTION_CLS} border-border text-muted-foreground hover:text-foreground hover:border-brand/50 hover:bg-brand-soft`}>
            <Printer size={16} /> Relatório PDF
          </button>
          {isAdmin && (<>
            {!["paga", "cancelada"].includes(charge.status) && (
              <button onClick={() => setStatus("paga")} disabled={busy} data-testid="toggle-paid-btn" className={`${ACTION_CLS} border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10`}><CheckCircle2 size={16} /> Marcar como Paga</button>
            )}
            {charge.status === "pendente" && (
              <button onClick={() => setStatus("negociacao")} disabled={busy} data-testid="negotiate-btn" className={`${ACTION_CLS} border-orange-500/40 text-orange-400 hover:bg-orange-500/10`}><Handshake size={16} /> Em Negociação</button>
            )}
            {charge.status === "negociacao" && (
              <button onClick={() => setStatus("pendente")} disabled={busy} data-testid="resume-collection-btn" className={`${ACTION_CLS} border-border text-muted-foreground hover:bg-secondary`}><Clock size={16} /> Retomar Cobrança</button>
            )}
            {(charge.status === "paga" || charge.status === "cancelada") && (
              <button onClick={() => setStatus("pendente")} disabled={busy} data-testid="reopen-btn" className={`${ACTION_CLS} border-border text-muted-foreground hover:bg-secondary`}><Clock size={16} /> Reabrir</button>
            )}
            <button onClick={() => setFormOpen(true)} disabled={busy} data-testid="edit-charge-btn" className={`${ACTION_CLS} border-brand/40 text-brand hover:bg-brand-soft`}><Pencil size={16} /> Editar</button>
            {!["paga", "cancelada"].includes(charge.status) && (
              <button onClick={() => setStatus("cancelada")} disabled={busy} data-testid="cancel-charge-btn" className={`${ACTION_CLS} border-slate-500/40 text-slate-400 hover:bg-slate-500/10`}><XCircle size={16} /> Cancelar</button>
            )}
            <button onClick={() => setConfirmDelete(true)} data-testid="delete-charge-btn" className={`${ACTION_CLS} border-rose-500/40 text-rose-400 hover:bg-rose-500/10`}><Trash2 size={16} /></button>
          </>)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-6 lg:col-span-2 space-y-5" data-testid="debtor-info-card">
          <h2 className="font-heading text-lg font-semibold flex items-center gap-2"><User size={18} className="text-brand" /> Dados do Cliente</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            {[
              [idLabel(), charge.debtor_nif || "—"],
              ["Email", charge.debtor_email || "—"],
              ["Email 2", charge.debtor_email2 || "—"],
              [t("mobile"), tel(charge.debtor_phone, "debtor-phone-tel")],
              ["WhatsApp", tel(charge.whatsapp, "debtor-whatsapp-tel")],
              ["Endereço", [charge.addr_rua, charge.addr_localidade, charge.addr_cp, charge.addr_estado].filter(Boolean).join(", ") || "—"],
              ["Registada em", fmtDate(charge.created_at?.slice(0, 10))],
              [`${t("invoicePlural")} do cliente`, client ? `${client.stats.invoice_count} · ${money(client.stats.pending_total)} em dívida` : "—"],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
                <p className="font-medium">{value}</p>
              </div>
            ))}
          </div>
          {charge.notes && <p className="text-xs text-muted-foreground border-t border-border pt-3" data-testid="charge-notes">Nota desta {t("invoiceLower")}: {charge.notes}</p>}
        </div>

        <div className="space-y-4">
          {charge.status === "negociacao" && isAdmin && <NegotiationCard charge={charge} onUpdate={setCharge} />}
          <div className="bg-card border border-border rounded-xl p-6" data-testid="charge-amount-card">
            <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><FileText size={13} /> Valor em Dívida</p>
            <p className="font-heading text-3xl font-extrabold font-mono-num mt-2" data-testid="charge-amount-value">{money(charge.amount)}</p>
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
              <Clock size={13} /> {pendente ? (charge.days_overdue > 0 ? `${charge.days_overdue} dias de atraso` : "Ainda dentro do prazo") : "Liquidada"}
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 space-y-3" data-testid="messaging-actions-card">
            <h3 className="font-heading text-base font-semibold flex items-center gap-2"><Phone size={16} className="text-brand" /> Preparar Contacto</h3>
            <p className="text-[11px] text-muted-foreground">O texto abre numa caixa editável antes de enviar.</p>
            <button onClick={() => setModal("whatsapp")} data-testid="debtor-detail-whatsapp-btn"
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:scale-[1.01] transition-all duration-200 text-sm font-medium">
              <MessageCircle size={18} /> WhatsApp
              <span className="ml-auto text-xs opacity-70">{charge.whatsapp || charge.debtor_phone || "sem nº"}</span>
            </button>
            <button onClick={() => setModal("email")} data-testid="debtor-detail-email-btn"
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 hover:scale-[1.01] transition-all duration-200 text-sm font-medium">
              <Mail size={18} /> Email
              <span className="ml-auto text-xs opacity-70 truncate max-w-[120px]">{charge.debtor_email || "sem email"}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ActivityTimeline clientKey={clientGroupKey(charge)} charges={client?.charges || [charge]} currentCharge={charge} onChargeUpdate={setCharge} reloadSignal={timelineTick} onChanged={() => loadClient(charge)} />
        </div>
        <ChargeDocuments charge={charge} />
      </div>

      <ClientNotesCard clientKey={clientGroupKey(charge)} value={client?.observacoes || ""} canEdit={isAdmin} onSaved={setClient} />

      <ClientReport
        title={`Relatório de Cobrança — ${t("invoice")} ${charge.invoice_number}`}
        subtitle={`${charge.debtor_name} · ${money(charge.amount)} · ${badge.label}`}
        profile={client?.profile || charge}
        charges={client?.charges || [charge]}
        interactions={client?.interactions || []}
        observacoes={client?.observacoes || ""}
        testid="print-report-cobranca"
      />

      <MessageModal channel={modal} charge={charge} open={!!modal} onOpenChange={() => setModal(null)} onLogged={onTimelineChanged} />
      <ChargeFormDialog open={formOpen} onOpenChange={setFormOpen} charge={charge} onSaved={load} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="bg-card border-border" data-testid="delete-charge-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">Eliminar cobrança</AlertDialogTitle>
            <AlertDialogDescription>A {t("invoiceLower")} {charge.invoice_number} e os seus anexos serão eliminados definitivamente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="delete-charge-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove} data-testid="delete-charge-confirm" className="bg-rose-600 text-white hover:opacity-90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
