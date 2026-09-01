import { getCountry } from "./format";

const DICT = {
  PT: {
    invoice: "Factura",
    invoicePlural: "Facturas",
    invoiceLower: "factura",
    invoiceLowerPlural: "facturas",
    mobile: "Telemóvel",
    user: "Utilizador",
    screen: "Ecrã",
    taxId: "NIF",
    bankRef: "o IBAN",
  },
  BR: {
    invoice: "Fatura",
    invoicePlural: "Faturas",
    invoiceLower: "fatura",
    invoiceLowerPlural: "faturas",
    mobile: "Celular",
    user: "Usuário",
    screen: "Tela",
    taxId: "CNPJ",
    bankRef: "a chave PIX / dados bancários",
  },
};

export function t(key) {
  return (DICT[getCountry()] || DICT.PT)[key] || key;
}

export function invoiceWord(count) {
  return count === 1 ? t("invoiceLower") : t("invoiceLowerPlural");
}
