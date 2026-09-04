export async function notifyDailyTasks(followups, ns = "anon") {
  try {
    if (!("Notification" in window)) return;
    const today = new Date().toISOString().slice(0, 10);
    const tasks = (followups || []).filter((f) => f.kind === "promessa" && f.date <= today);
    if (!tasks.length) return;
    const key = `cobranpro_notified_${ns}_${today}`;
    if (localStorage.getItem(key)) return;
    let permission = Notification.permission;
    if (permission === "default") permission = await Notification.requestPermission();
    if (permission !== "granted") return;
    const names = tasks.slice(0, 3).map((f) => f.debtor_name).join(", ");
    new Notification("Tarefas do Dia — Cobranpro", {
      body: `${tasks.length} promessa(s) de pagamento vencida(s) ou a vencer hoje: ${names}${tasks.length > 3 ? "…" : ""}`,
      icon: "/logo-square.png",
      tag: "cobranpro-daily-tasks",
    });
    localStorage.setItem(key, "1");
  } catch { /* notificações são best-effort */ }
}
