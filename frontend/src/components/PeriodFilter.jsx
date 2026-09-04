import { Input } from "@/components/ui/input";

export default function PeriodFilter({ from, to, onFrom, onTo, testid }) {
  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid={`${testid}-period-filter`}>
      <span className="text-xs text-muted-foreground">Vencimento de</span>
      <Input type="date" value={from} onChange={(e) => onFrom(e.target.value)} data-testid={`${testid}-date-from`} className="bg-background w-[150px] h-9 text-xs" />
      <span className="text-xs text-muted-foreground">até</span>
      <Input type="date" value={to} onChange={(e) => onTo(e.target.value)} data-testid={`${testid}-date-to`} className="bg-background w-[150px] h-9 text-xs" />
    </div>
  );
}

export const periodSubtitle = (from, to) => (from || to ? ` · Vencimento: ${from || "…"} a ${to || "…"}` : "");
