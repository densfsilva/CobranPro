import { useAuth } from "@/context/AuthContext";

export default function PrintReport({ title, subtitle, active = true, testid = "print-report", children }) {
  const { company } = useAuth();
  const initials = company.company_name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const generatedAt = new Date().toLocaleString("pt-PT", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`print-report ${active ? "print-active" : ""}`} data-testid={testid}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
        {company.logo_base64
          ? <img src={company.logo_base64} alt={company.company_name} style={{ width: 52, height: 52, objectFit: "contain" }} />
          : <div style={{ width: 52, height: 52, borderRadius: 10, background: company.primary_color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 20 }}>{initials}</div>}
        <div>
          <p style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{company.company_name}</p>
          <p style={{ fontSize: 12, color: "#475569", margin: 0 }}>
            {company.nif ? `${company.country === "BR" ? "CNPJ" : "NIF"} ${company.nif} · ` : ""}
            {company.address ? `${company.address} · ` : ""}{company.email}
          </p>
        </div>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "16px 0 4px" }}>{title}</h1>
      <p style={{ fontSize: 12, color: "#475569", margin: "0 0 16px" }}>
        Gerado a {generatedAt}{subtitle ? ` · ${subtitle}` : ""}
      </p>
      {children}
      <p style={{ fontSize: 10, color: "#94a3b8", marginTop: 24, borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
        Cobranpro — Gestão de Cobranças Profissional
      </p>
    </div>
  );
}

export const printTableStyle = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
export const printThStyle = { textAlign: "left", borderBottom: "2px solid #0f172a", padding: "6px 8px" };
export const printTdStyle = { borderBottom: "1px solid #e2e8f0", padding: "6px 8px" };
