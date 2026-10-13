/**
 * Lógica de reprodução compartilhada (webOS e Android TV). Tudo puro: sem timers
 * internos — o tempo entra como argumento, para ser testável e portável.
 */

export type StreamKind = 'hls' | 'ts' | 'progressive' | 'unknown';

const PROGRESSIVE_EXTS = new Set(['mp4', 'mkv', 'webm', 'mov', 'm4v', 'avi']);

/** Detecta o tipo de stream pela extensão do caminho (ignora query e fragmento). */
export function detectStreamKind(url: string): StreamKind {
  const path = (url.split('#')[0] ?? '').split('?')[0] ?? '';
  const match = /\.([a-z0-9]+)$/i.exec(path);
  const ext = match?.[1]?.toLowerCase();
  if (ext === 'm3u8') return 'hls';
  if (ext === 'ts') return 'ts';
  if (ext !== undefined && PROGRESSIVE_EXTS.has(ext)) return 'progressive';
  return 'unknown';
}

export const RECONNECT = { maxAttempts: 3, baseDelayMs: 1000 } as const;

export interface ReconnectOptions {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
}

export type ReconnectDecision = { action: 'retry'; attempt: number; delayMs: number } | { action: 'giveUp' };

/** Política de reconexão com backoff exponencial (1s, 2s, 4s) e desistência na 4ª falha. */
export function createReconnector(opts: ReconnectOptions = RECONNECT) {
  let used = 0;
  return {
    fail(): ReconnectDecision {
      if (used >= opts.maxAttempts) return { action: 'giveUp' };
      used += 1;
      return { action: 'retry', attempt: used, delayMs: opts.baseDelayMs * 2 ** (used - 1) };
    },
    succeed(): void {
      used = 0;
    },
    reset(): void {
      used = 0;
    },
    attempts(): number {
      return used;
    },
  };
}

export const STALL_TIMEOUT_MS = 12000;

/** Avanço mínimo de currentTime (segundos) para contar como progresso. */
const STALL_ADVANCE_EPSILON = 0.05;

/** Detecta travamento: tempo parado, sem pausa, por `timeoutMs`. Dispara uma vez por travamento. */
export function createStallDetector(timeoutMs: number = STALL_TIMEOUT_MS) {
  let lastTime: number | null = null;
  let progressAt = 0;
  let fired = false;
  return {
    sample(currentTime: number, paused: boolean, nowMs: number): boolean {
      if (lastTime === null || paused || Math.abs(currentTime - lastTime) > STALL_ADVANCE_EPSILON) {
        lastTime = currentTime;
        progressAt = nowMs;
        fired = false;
        return false;
      }
      if (fired || nowMs - progressAt < timeoutMs) return false;
      fired = true;
      return true;
    },
    reset(): void {
      lastTime = null;
      progressAt = 0;
      fired = false;
    },
  };
}

export const CHANNEL_INPUT = { maxDigits: 4, commitDelayMs: 1500 } as const;

export interface ChannelInputOptions {
  readonly maxDigits: number;
  readonly commitDelayMs: number;
}

/** Buffer de dígitos para troca de canal por número; confirma após inatividade. */
export function createChannelNumberInput(opts: ChannelInputOptions = CHANNEL_INPUT) {
  let buffer = '';
  let lastAt = 0;
  return {
    press(digit: number, nowMs: number): string {
      if (!Number.isInteger(digit) || digit < 0 || digit > 9) return buffer;
      if (buffer.length >= opts.maxDigits) return buffer;
      buffer += String(digit);
      lastAt = nowMs;
      return buffer;
    },
    poll(nowMs: number): number | null {
      if (buffer === '' || nowMs - lastAt < opts.commitDelayMs) return null;
      const n = parseInt(buffer, 10);
      buffer = '';
      return n;
    },
    pending(): string {
      return buffer;
    },
    clear(): void {
      buffer = '';
    },
  };
}

/** Índice 0-based do canal `n` (1-based) numa lista de `total`; null se fora de 1..total. */
export function channelIndexForNumber(n: number, total: number): number | null {
  if (!Number.isInteger(n) || n < 1 || n > total) return null;
  return n - 1;
}
