export function maskPhone(value, country = "PT") {
  if (!value) return "";
  let prefix = "";
  let v = value;
  if (v.startsWith("+")) {
    const m = v.match(/^\+(\d{2,3})\s?(.*)$/);
    if (m) {
      prefix = `+${m[1]} `;
      v = m[2];
    }
  }
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (country === "BR") {
    if (d.length <= 2) return prefix + (d.length ? `(${d}` : "");
    if (d.length <= 6) return `${prefix}(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `${prefix}(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `${prefix}(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  return prefix + (d.match(/\d{1,3}/g) || []).join(" ");
}
