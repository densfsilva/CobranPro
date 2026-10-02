import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Contact, Pencil, Printer, Plus, Mail, Phone, MessageCircle, FileText, Wallet, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { BUCKETS, fmtDate } from "@/lib/badges";
import { money, idLabel } from "@/lib/format";
import { maskPhone } from "@/lib/masks";
import { t } from "@/lib/i18n";
import { useAuth } from "@/context/AuthContext";
import ActivityTimeline from "@/components/ActivityTimeline";
import ClientNotesCard from "@/components/ClientNotesCard";
import ClientReport from "@/components/ClientReport";
import ClientFormDialog from "@/components/ClientFormDialog";
import ChargeFormDialog from "@/components/ChargeFormDialog";
import MessageModal from "@/components/MessageModal";

export default function ClientDetail() {
  const { key } = useParams();
  const navigate = useNavigate();
  const { isAdmin, company } = useAuth();
  const [data, setData] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [tick, setTick] = useState(0);

  const load = async () => {
    try {
      const { data: d } = await api.get(`/clients/${encodeURIComponent(key)}`);
      setData(d);
    } catch (err) {
      toast.error(formatApiError(err, "Cliente não encontrado"));
      navigate("/clientes");
    }
  };
  useEffect(() => { load(); }, [key]);

  if (!data) return <div className="flex justify-center py-24"><div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" /></div>;

  const { profile, stats, charges, interactions, observacoes } = data;
  const country = company?.country || "PT";
  const contactCharge = [...charges].filter((c) => c.status === "pendente").sort((a, b) => b.days_overdue - a.days_overdue)[0] || charges.find((c) => c.status === "negociacao") || null;
  const address = [profile.addr_rua, profile.addr_localidade, profile.addr_cp, profile.addr_estado].filter(Boolean).join(", ");

  const onClientSaved = (d) => {
    if (d.key !== key) navigate(`/clientes/${encodeURIComponent(d.key)}`, { replace: true });
    else setData(d);
  };

  return (
    <div className="space-y-6 max-w-6xl" data-testid="client-detail-page">
      <button onClick={() => navigate("/clientes")} data-testid="back-to-clients-btn" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">
        <ArrowLeft size={16} /> Voltar a Clientes
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight flex items-center gap-3" data-testid="client-name"><Contact size={28} className="text-brand" /> {profile.debtor_name}</h1>
          <p className="text-sm text-muted-foreground">{idLabel()} <span className="font-mono-num" data-testid="client-nif">{profile.debtor_nif || "—"}</span> · {stats.invoice_count} {stats.invoice_count === 1 ? t("invoiceLower") : t("invoiceLowerPlural")}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => window.print()} data-testid="client-print-btn" className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-brand/50 hover:bg-brand-soft transition-all duration-200"><Printer size={16} /> Relatório PDF</button>
          {isAdmin && (<>
            <button onClick={() => setEditOpen(true)} data-testid="client-edit-btn" className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-brand/40 text-brand text-sm font-semibold hover:bg-brand-soft transition-all duration-200"><Pencil size={16} /> Editar Cliente</button>
            <button onClick={() => setNewOpen(true)} data-testid="client-new-charge-btn" className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand text-white text-sm font-semibold hover:opacity-90 hover:scale-[1.02] transition-all duration-200"><Plus size={16} /> Nova Cobrança</button>
          </>)}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          ["Em dívida", money(stats.pending_total), Wallet, "text-rose-400", "client-kpi-debt"],
          ["Recebido", money(stats.paid_total), CheckCircle2, "text-emerald-400", "client-kpi-paid"],
          [`${t("invoicePlural")} pendentes`, `${stats.pending_count}${stats.negotiation_count ? ` · ${stats.negotiation_count} em negociação` : ""}`, FileText, "text-amber-400", "client-kpi-pending"],
          ["Maior atraso", stats.max_days_overdue > 0 ? `${stats.max_days_overdue} dias` : "Em dia", Phone, "text-brand", "client-kpi-overdue"],
        ].map(([label, value, Icon, cls, tid]) => (
          <div key={label} className="bg-card border border-border rounded-xl p-5" data-testid={tid}>
            <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><Icon size={13} className={cls} /> {label}</p>
            <p className="font-heading text-xl font-extrabold font-mono-num mt-2">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-6 lg:col-span-2 space-y-4" data-testid="client-info-card">
          <h2 className="font-heading text-lg font-semibold">Dados do Cliente</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            {[
              ["Email", profile.debtor_email || "—"],
              ["Email 2", profile.debtor_email2 || "—"],
              [t("mobile"), profile.debtor_phone ? maskPhone(profile.debtor_phone, country) : "—"],
              ["WhatsApp", profile.whatsapp ? maskPhone(profile.whatsapp, country) : "—"],
              ["Endereço", address || "—"],
            ].map(([label, value]) => (
              <div key={label}><p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p><p className="font-medium">{value}</p></div>
            ))}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-6 space-y-3" data-testid="client-contact-card">
          <h3 className="font-heading text-base font-semibold flex items-center gap-2"><Phone size={16} className="text-brand" /> Preparar Contacto</h3>
          <p className="text-[11px] text-muted-foreground">{contactCharge ? `Sobre a ${t("invoiceLower")} ${contactCharge.invoice_number} — texto editável antes de enviar.` : `Sem ${t("invoiceLowerPlural")} em aberto para contactar.`}</p>
          <button onClick={() => setModal("whatsapp")} disabled={!contactCharge} data-testid="client-whatsapp-btn" className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-all duration-200 text-sm font-medium disabled:opacity-40">
            <MessageCircle size={18} /> WhatsApp <span className="ml-auto text-xs opacity-70">{profile.whatsapp || profile.debtor_phone || "sem nº"}</span>
          </button>
          <button onClick={() => setModal("email")} disabled={!contactCharge} data-testid="client-email-btn" className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 transition-all duration-200 text-sm font-medium disabled:opacity-40">
            <Mail size={18} /> Email <span className="ml-auto text-xs opacity-70 truncate max-w-[120px]">{profile.debtor_email || "sem email"}</span>
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5" data-testid="client-charges-card">
        <h2 className="font-heading text-lg font-semibold mb-3">{t("invoicePlural")} do Cliente</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="pb-3 font-medium">{t("invoice")}</th><th className="pb-3 font-medium">Vencimento</th><th className="pb-3 font-medium">Recebimento</th>
                <th className="pb-3 font-medium text-right">Valor</th><th className="pb-3 font-medium text-right">Estado</th>
              </tr>
            </thead>
            <tbody>
              {charges.map((c) => (
                <tr key={c.id} data-testid={`client-charge-row-${c.id}`} onClick={() => navigate(`/cobranca/${c.id}`)} className="border-b border-border/50 last:border-0 cursor-pointer hover:bg-secondary/50 transition-colors duration-150">
                  <td className="py-3 pr-3 font-mono-num text-xs">{c.invoice_number}</td>
                  <td className="py-3 pr-3 text-muted-foreground">{fmtDate(c.due_date)}</td>
                  <td className="py-3 pr-3 text-muted-foreground">{c.paid_at ? fmtDate(c.paid_at.slice(0, 10)) : "—"}</td>
                  <td className="py-3 pr-3 text-right font-mono-num font-semibold">{money(c.amount)}</td>
                  <td className="py-3 text-right"><span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium border ${BUCKETS[c.bucket].cls}`}>{c.status === "pendente" && c.days_overdue > 0 ? `${c.days_overdue}d atraso` : BUCKETS[c.bucket].label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ActivityTimeline clientKey={key} charges={charges} reloadSignal={tick} onChanged={load} />
      <ClientNotesCard clientKey={key} value={observacoes} canEdit={isAdmin} onSaved={setData} />

      <ClientReport title={`Ficha do Cliente — ${profile.debtor_name}`} subtitle={`${idLabel()} ${profile.debtor_nif || "—"}`} profile={profile} charges={charges} interactions={interactions} observacoes={observacoes} />

      <ClientFormDialog open={editOpen} onOpenChange={setEditOpen} clientKey={key} profile={profile} onSaved={onClientSaved} />
      {isAdmin && <ChargeFormDialog open={newOpen} onOpenChange={setNewOpen} onSaved={load} initial={profile} />}
      {contactCharge && <MessageModal channel={modal} charge={contactCharge} open={!!modal} onOpenChange={() => setModal(null)} onLogged={() => { setTick((n) => n + 1); load(); }} />}
    </div>
  );
}
