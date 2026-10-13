/** 754 → "12:34"; 3723 → "1:02:03". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

const hourFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** epoch ms → "20:45" */
export function formatHour(ms: number): string {
  return hourFmt.format(new Date(ms));
}

/** Fração decorrida de um programa (0..1). */
export function elapsed(start: number, stop: number, now = Date.now()): number {
  if (stop <= start) return 0;
  return Math.max(0, Math.min(1, (now - start) / (stop - start)));
}
