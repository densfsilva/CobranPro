import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, MessageCircle, Mail, Phone, User, FileText, Trash2, CheckCircle2, Clock, Handshake } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { BUCKETS, fmtDate } from "@/lib/badges";
import { money, idLabel } from "@/lib/format";
import MessageModal from "@/components/MessageModal";
import ChargeTimeline from "@/components/ChargeTimeline";
import ChargeDocuments from "@/components/ChargeDocuments";
import NegotiationCard from "@/components/NegotiationCard";

export default function ChargeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [charge, setCharge] = useState(null);
  const [modal, setModal] = useState(null); // 'whatsapp' | 'email' | null
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get(`/charges/${id}`);
      setCharge(data);
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

  const setStatus = async (s) => {
    setBusy(true);
    try {
      const { data } = await api.put(`/charges/${id}`, { ...charge, status: s });
      setCharge(data);
      const msgs = { paga: "Cobrança marcada como paga", negociacao: "Cobrança movida para Em Negociação", pendente: "Cobrança de volta ao fluxo ativo" };
      toast.success(msgs[s]);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Eliminar esta cobrança definitivamente?")) return;
    await api.delete(`/charges/${id}`);
    toast.success("Cobrança eliminada");
    navigate("/");
  };

  return (
    <div className="space-y-6 max-w-5xl" data-testid="charge-detail-page">
      <button onClick={() => navigate("/")} data-testid="back-to-dashboard-btn"
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">
        <ArrowLeft size={16} /> Voltar ao Dashboard
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight" data-testid="charge-debtor-name">{charge.debtor_name}</h1>
            <span data-testid="charge-status-badge" className={`px-3 py-1 rounded-full text-xs font-medium border ${badge.cls}`}>{badge.label}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Fatura <span className="font-mono-num">{charge.invoice_number}</span> · vencida a {fmtDate(charge.due_date)}
            {pendente && charge.days_overdue > 0 && <> · <span className="text-rose-400 font-medium">{charge.days_overdue} dias em atraso</span></>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {charge.status !== "paga" && (
            <button onClick={() => setStatus("paga")} disabled={busy} data-testid="toggle-paid-btn"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 transition-all duration-200">
              <CheckCircle2 size={16} /> Marcar como Paga
            </button>
          )}
          {charge.status === "pendente" && (
            <button onClick={() => setStatus("negociacao")} disabled={busy} data-testid="negotiate-btn"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border border-orange-500/40 text-orange-400 hover:bg-orange-500/10 transition-all duration-200">
              <Handshake size={16} /> Em Negociação
            </button>
          )}
          {charge.status === "negociacao" && (
            <button onClick={() => setStatus("pendente")} disabled={busy} data-testid="resume-collection-btn"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border border-border text-muted-foreground hover:bg-secondary transition-all duration-200">
              <Clock size={16} /> Retomar Cobrança
            </button>
          )}
          {charge.status === "paga" && (
            <button onClick={() => setStatus("pendente")} disabled={busy} data-testid="reopen-btn"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border border-border text-muted-foreground hover:bg-secondary transition-all duration-200">
              <Clock size={16} /> Reabrir
            </button>
          )}
          <button onClick={remove} data-testid="delete-charge-btn"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 transition-all duration-200">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-6 lg:col-span-2 space-y-5" data-testid="debtor-info-card">
          <h2 className="font-heading text-lg font-semibold flex items-center gap-2"><User size={18} className="text-brand" /> Dados do Devedor</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            {[
              ["Email", charge.debtor_email || "—"],
              ["Telemóvel", charge.debtor_phone || "—"],
              [idLabel(), charge.debtor_nif || "—"],
              ["Registada em", fmtDate(charge.created_at?.slice(0, 10))],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
                <p className="font-medium">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {charge.status === "negociacao" && <NegotiationCard charge={charge} onUpdate={setCharge} />}
          <div className="bg-card border border-border rounded-xl p-6" data-testid="charge-amount-card">
            <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><FileText size={13} /> Valor em Dívida</p>
            <p className="font-heading text-3xl font-extrabold font-mono-num mt-2" data-testid="charge-amount-value">{money(charge.amount)}</p>
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
              <Clock size={13} /> {pendente ? (charge.days_overdue > 0 ? `${charge.days_overdue} dias de atraso` : "Ainda dentro do prazo") : "Liquidada"}
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 space-y-3" data-testid="messaging-actions-card">
            <h3 className="font-heading text-base font-semibold flex items-center gap-2"><Phone size={16} className="text-brand" /> Preparar Contacto</h3>
            <button
              onClick={() => setModal("whatsapp")}
              data-testid="debtor-detail-whatsapp-btn"
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:scale-[1.01] transition-all duration-200 text-sm font-medium"
            >
              <MessageCircle size={18} /> WhatsApp
              <span className="ml-auto text-xs opacity-70">{charge.debtor_phone || "sem nº"}</span>
            </button>
            <button
              onClick={() => setModal("email")}
              data-testid="debtor-detail-email-btn"
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 hover:scale-[1.01] transition-all duration-200 text-sm font-medium"
            >
              <Mail size={18} /> Email
              <span className="ml-auto text-xs opacity-70 truncate max-w-[120px]">{charge.debtor_email || "sem email"}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ChargeTimeline charge={charge} onChargeUpdate={setCharge} />
        </div>
        <ChargeDocuments charge={charge} />
      </div>

      <MessageModal channel={modal} charge={charge} open={!!modal} onOpenChange={() => setModal(null)} />
    </div>
  );
}
