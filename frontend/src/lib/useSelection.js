import { useState, useMemo, useEffect, useCallback } from "react";

export function useSelection(items) {
  const [selected, setSelected] = useState(() => new Set());
  const ids = useMemo(() => items.map((i) => i.id), [items]);

  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => ids.includes(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [ids]);

  const toggle = useCallback((id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);

  const setMany = useCallback((list, on) => setSelected((prev) => {
    const next = new Set(prev);
    list.forEach((id) => (on ? next.add(id) : next.delete(id)));
    return next;
  }), []);

  const clear = useCallback(() => setSelected(new Set()), []);
  const allSelected = ids.length > 0 && selected.size === ids.length;
  const toggleAll = useCallback(() => setSelected(allSelected ? new Set() : new Set(ids)), [allSelected, ids]);
  const selectedItems = useMemo(() => items.filter((i) => selected.has(i.id)), [items, selected]);

  return {
    selected,
    count: selected.size,
    has: (id) => selected.has(id),
    toggle,
    setMany,
    toggleAll,
    clear,
    allSelected,
    someSelected: selected.size > 0 && !allSelected,
    selectedItems,
    total: selectedItems.reduce((s, c) => s + c.amount, 0),
  };
}
