let country = "PT";

export function setCountry(c) {
  country = c === "BR" ? "BR" : "PT";
}

export function getCountry() {
  return country;
}

export function money(v) {
  const opts = { style: "currency", useGrouping: "always" };
  return country === "BR"
    ? new Intl.NumberFormat("pt-BR", { ...opts, currency: "BRL" }).format(v || 0)
    : new Intl.NumberFormat("pt-PT", { ...opts, currency: "EUR" }).format(v || 0);
}

export function idLabel(c = country) {
  return c === "BR" ? "CNPJ" : "NIF";
}

export function idPlaceholder(c = country) {
  return c === "BR" ? "XX.XXX.XXX/XXXX-XX" : "5xxxxxxxx";
}

export function bankLabel(c = country) {
  return c === "BR" ? "Chave PIX / Dados Bancários" : "IBAN (usado nas mensagens de lembrete)";
}
