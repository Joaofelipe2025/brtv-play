import { describe, expect, it } from 'vitest';
import { elapsed, formatClock, formatHour } from '../src/format';

describe('formatClock', () => {
  it('formata minutos e segundos', () => {
    expect(formatClock(754)).toBe('12:34');
  });
  it('inclui horas quando passa de 1h', () => {
    expect(formatClock(3723)).toBe('1:02:03');
  });
  it('trata negativos como zero', () => {
    expect(formatClock(-5)).toBe('0:00');
  });
});

describe('formatHour', () => {
  it('devolve HH:MM', () => {
    expect(formatHour(Date.now())).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('elapsed', () => {
  it('calcula a fração decorrida', () => {
    expect(elapsed(0, 100, 25)).toBe(0.25);
  });
  it('limita a 0..1', () => {
    expect(elapsed(100, 200, 50)).toBe(0);
    expect(elapsed(100, 200, 500)).toBe(1);
  });
  it('devolve 0 quando o intervalo é inválido', () => {
    expect(elapsed(100, 100, 100)).toBe(0);
  });
});
