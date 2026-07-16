const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDay(value) {
  const text = String(value || "").trim();
  if (!ISO_DATE.test(text)) return null;
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === text ? date : null;
}

export function validateDateRange(startDate, endDate, maxDays = 15) {
  const start = parseIsoDay(startDate);
  const end = parseIsoDay(endDate);
  if (!start || !end) return { ok: false, error: "Datas devem usar o formato YYYY-MM-DD." };
  const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  if (days < 1) return { ok: false, error: "start_date deve ser anterior ou igual a end_date." };
  if (days > maxDays) return { ok: false, error: `O intervalo maximo permitido e de ${maxDays} dias.` };
  return { ok: true, days, start, end };
}
