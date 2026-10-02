import PrintReport, { printTableStyle, printThStyle, printThRightStyle, printTdStyle } from "@/components/PrintReport";
import { fmtDate, fmtDateTime, statusLabelOf } from "@/lib/badges";
import { money, idLabel } from "@/lib/format";
import { maskPhone } from "@/lib/masks";
import { t } from "@/lib/i18n";
import { useAuth } from "@/context/AuthContext";

const TYPE_LABEL = { chamada: "Chamada", email: "Email", whatsapp: "WhatsApp", nota: "Nota" };

export default function ClientReport({ profile, charges = [], interactions = [], observacoes = "", title, subtitle, testid = "print-report-cliente" }) {
  const { company } = useAuth();
  const country = company?.country || "PT";
  const open = charges.filter((c) => ["pendente", "negociacao"].includes(c.status));
  const total = open.reduce((s, c) => s + c.amount, 0);
  const last3 = interactions.slice(0, 3);
  const address = [profile.addr_rua, profile.addr_localidade, profile.addr_cp, profile.addr_estado].filter(Boolean).join(", ");
  const block = { fontSize: 12, margin: "0 0 4px" };
  const label = { color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 2px" };

  return (
    <PrintReport title={title} subtitle={subtitle} testid={testid}>
      <h2 style={{ fontSize: 13, fontWeight: 800, margin: "12px 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Dados do Cliente</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px 16px", marginBottom: 16 }}>
        <div><p style={label}>Nome</p><p style={{ ...block, fontWeight: 700 }}>{profile.debtor_name || "—"}</p></div>
        <div><p style={label}>{idLabel()}</p><p style={{ ...block, fontFamily: "monospace" }}>{profile.debtor_nif || "—"}</p></div>
        <div><p style={label}>Email</p><p style={block}>{profile.debtor_email || "—"}</p></div>
        <div><p style={label}>{t("mobile")}</p><p style={block}>{profile.debtor_phone ? maskPhone(profile.debtor_phone, country) : "—"}</p></div>
        <div><p style={label}>WhatsApp</p><p style={block}>{profile.whatsapp ? maskPhone(profile.whatsapp, country) : "—"}</p></div>
        <div><p style={label}>Endereço</p><p style={block}>{address || "—"}</p></div>
      </div>

      <h2 style={{ fontSize: 13, fontWeight: 800, margin: "16px 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("invoicePlural")} em Aberto</h2>
      <table style={printTableStyle}>
        <thead>
          <tr>{[t("invoice"), "Vencimento", "Dias", "Valor", "Estado"].map((h) => <th key={h} style={h === "Valor" ? printThRightStyle : printThStyle}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {open.map((c) => (
            <tr key={c.id}>
              <td style={{ ...printTdStyle, fontFamily: "monospace" }}>{c.invoice_number}</td>
              <td style={printTdStyle}>{fmtDate(c.due_date)}</td>
              <td style={printTdStyle}>{c.days_overdue}d</td>
              <td style={{ ...printTdStyle, textAlign: "right", fontFamily: "monospace" }}>{money(c.amount)}</td>
              <td style={printTdStyle}>{statusLabelOf(c)}</td>
            </tr>
          ))}
          {open.length === 0 && <tr><td colSpan={5} style={{ ...printTdStyle, color: "#64748b" }}>Sem {t("invoiceLowerPlural")} em aberto.</td></tr>}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} style={{ ...printTdStyle, fontWeight: 700 }}>Total em dívida ({open.length} {open.length === 1 ? t("invoiceLower") : t("invoiceLowerPlural")})</td>
            <td style={{ ...printTdStyle, textAlign: "right", fontWeight: 800, fontFamily: "monospace" }}>{money(total)}</td>
            <td style={printTdStyle} />
          </tr>
        </tfoot>
      </table>

      <h2 style={{ fontSize: 13, fontWeight: 800, margin: "20px 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Últimas 3 Atividades da Timeline</h2>
      <table style={printTableStyle} data-testid={`${testid}-activities`}>
        <thead>
          <tr>{["Data", "Tipo", t("invoice"), "O que foi falado"].map((h) => <th key={h} style={printThStyle}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {last3.map((it) => (
            <tr key={it.id}>
              <td style={{ ...printTdStyle, whiteSpace: "nowrap" }}>{fmtDateTime(it.created_at)}</td>
              <td style={printTdStyle}>{TYPE_LABEL[it.type] || "Nota"}</td>
              <td style={{ ...printTdStyle, fontFamily: "monospace" }}>{it.invoice_number || "Geral"}</td>
              <td style={printTdStyle}>{it.note}</td>
            </tr>
          ))}
          {last3.length === 0 && <tr><td colSpan={4} style={{ ...printTdStyle, color: "#64748b" }}>Sem atividades registadas.</td></tr>}
        </tbody>
      </table>

      <h2 style={{ fontSize: 13, fontWeight: 800, margin: "20px 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Observações Gerais</h2>
      <p style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", margin: 0, color: observacoes ? "#0f172a" : "#64748b" }} data-testid={`${testid}-observacoes`}>
        {observacoes || "Sem observações registadas."}
      </p>
    </PrintReport>
  );
}
