import { useEffect, useState } from 'react';
import { restoreOrFocusFirst } from './focus';

/**
 * Ao montar a tela (ou quando os dados ficam prontos), restaura o foco salvo
 * ao voltar de outra tela; sem foco salvo, foca o primeiro item.
 */
export function useAutoFocus(ready = true, deps: unknown[] = []): void {
  useEffect(() => {
    if (!ready) return;
    const id = requestAnimationFrame(() => restoreOrFocusFirst());
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ...deps]);
}

/** Relógio que atualiza a cada 15s (suficiente para HH:MM). */
export function useNow(intervalMs = 15_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Valor que só muda depois de `delay` ms parado (ex.: prévia de vídeo ao focar). */
export function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
