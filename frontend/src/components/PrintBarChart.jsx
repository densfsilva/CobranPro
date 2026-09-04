export default function PrintBarChart({ title, data }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ margin: "0 0 20px" }} data-testid="print-bar-chart">
      {title && <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>{title}</p>}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 24, height: 140, borderBottom: "2px solid #0f172a", padding: "0 8px" }}>
        {data.map((d) => (
          <div key={d.label} style={{ flex: 1, maxWidth: 90, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
            <span style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{d.value}</span>
            <div style={{ width: "100%", height: Math.max((d.value / max) * 110, d.value > 0 ? 6 : 0), background: d.color || "#2563EB", borderRadius: "4px 4px 0 0" }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 24, padding: "6px 8px 0" }}>
        {data.map((d) => (
          <div key={d.label} style={{ flex: 1, maxWidth: 90, textAlign: "center", fontSize: 10, color: "#475569" }}>{d.label}</div>
        ))}
      </div>
    </div>
  );
}
