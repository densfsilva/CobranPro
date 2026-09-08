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

export function maskTaxId(value, country = "PT") {
  if (!value) return "";
  if (country !== "BR") return value.replace(/\D/g, "").slice(0, 9);
  const d = value.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function taxIdComplete(value, country = "PT") {
  return (value || "").replace(/\D/g, "").length === (country === "BR" ? 14 : 9);
}

export function maskCep(value, country = "PT") {
  if (!value) return "";
  const d = value.replace(/\D/g, "").slice(0, country === "BR" ? 8 : 7);
  const split = country === "BR" ? 5 : 4;
  return d.length <= split ? d : `${d.slice(0, split)}-${d.slice(split)}`;
}

export function cepComplete(value, country = "PT") {
  return (value || "").replace(/\D/g, "").length === (country === "BR" ? 8 : 7);
}

export function invoicePrefix(country = "PT") {
  return country === "BR" ? "NF-" : "FT-";
}

export function clientGroupKey(c) {
  const nif = (c.debtor_nif || "").replace(/\D/g, "");
  if (nif) return `nif:${nif}`;
  return `nome:${(c.debtor_name || "").trim().toLowerCase().replace(/\s+/g, " ")}`;
}
