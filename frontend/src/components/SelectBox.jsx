import { Check, Minus } from "lucide-react";

export function SelectBox({ checked, indeterminate = false, onChange, testid, label }) {
  const state = checked ? "checked" : indeterminate ? "indeterminate" : "unchecked";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      data-testid={testid}
      data-state={state}
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className={`h-4 w-4 rounded-[4px] border flex items-center justify-center transition-all duration-150 ${
        state === "unchecked" ? "border-border bg-background hover:border-brand/70 hover:scale-110" : "bg-brand border-brand text-white"
      }`}
    >
      {state === "checked" && <Check size={12} strokeWidth={3} />}
      {state === "indeterminate" && <Minus size={12} strokeWidth={3} />}
    </button>
  );
}

export function SelectCell({ children, className = "" }) {
  return (
    <td className={`py-3 pr-2 w-8 ${className}`} onClick={(e) => e.stopPropagation()}>
      {children}
    </td>
  );
}
