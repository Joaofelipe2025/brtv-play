import { describe, expect, it } from 'vitest';
import {
  CHANNEL_INPUT,
  RECONNECT,
  STALL_TIMEOUT_MS,
  channelIndexForNumber,
  createChannelNumberInput,
  createReconnector,
  createStallDetector,
  detectStreamKind,
} from '../src/playback';
import { digitOf, mapAndroidKey, mapWebosKey } from '../src/remote';

describe('detectStreamKind', () => {
  it('detecta HLS', () => {
    expect(detectStreamKind('http://x.com/a/b.m3u8')).toBe('hls');
    expect(detectStreamKind('http://x.com/a.M3U8?token=1#f')).toBe('hls');
    expect(detectStreamKind('http://x.com/live/u/p/123.m3u8')).toBe('hls');
  });
  it('detecta TS', () => {
    expect(detectStreamKind('http://x.com/live/u/p/123.ts')).toBe('ts');
    expect(detectStreamKind('http://x.com/a.TS?x=.m3u8')).toBe('ts');
  });
  it('detecta progressivo', () => {
    for (const ext of ['mp4', 'mkv', 'webm', 'mov', 'm4v', 'avi']) {
      expect(detectStreamKind(`http://x.com/movie/u/p/1.${ext}`)).toBe('progressive');
    }
    expect(detectStreamKind('http://x.com/a.MP4?x=1')).toBe('progressive');
  });
  it('devolve unknown nos demais casos', () => {
    expect(detectStreamKind('http://x.com/live/u/p/123')).toBe('unknown');
    expect(detectStreamKind('')).toBe('unknown');
  });
});

describe('createReconnector', () => {
  it('usa os valores padrão', () => {
    expect(RECONNECT).toEqual({ maxAttempts: 3, baseDelayMs: 1000 });
  });
  it('faz backoff exponencial e desiste na 4ª falha', () => {
    const r = createReconnector();
    expect(r.fail()).toEqual({ action: 'retry', attempt: 1, delayMs: 1000 });
    expect(r.fail()).toEqual({ action: 'retry', attempt: 2, delayMs: 2000 });
    expect(r.fail()).toEqual({ action: 'retry', attempt: 3, delayMs: 4000 });
    expect(r.attempts()).toBe(3);
    expect(r.fail()).toEqual({ action: 'giveUp' });
  });
  it('succeed e reset zeram a contagem', () => {
    const r = createReconnector();
    r.fail();
    r.fail();
    r.succeed();
    expect(r.attempts()).toBe(0);
    expect(r.fail()).toEqual({ action: 'retry', attempt: 1, delayMs: 1000 });
    r.fail();
    r.fail();
    expect(r.fail()).toEqual({ action: 'giveUp' });
    r.reset();
    expect(r.attempts()).toBe(0);
    expect(r.fail()).toEqual({ action: 'retry', attempt: 1, delayMs: 1000 });
  });
  it('aceita opções customizadas', () => {
    const r = createReconnector({ maxAttempts: 1, baseDelayMs: 500 });
    expect(r.fail()).toEqual({ action: 'retry', attempt: 1, delayMs: 500 });
    expect(r.fail()).toEqual({ action: 'giveUp' });
  });
});

describe('createStallDetector', () => {
  it('usa 12 s por padrão', () => {
    expect(STALL_TIMEOUT_MS).toBe(12000);
  });
  it('dispara uma única vez quando o tempo não avança', () => {
    const d = createStallDetector();
    expect(d.sample(10, false, 0)).toBe(false);
    expect(d.sample(10, false, 6000)).toBe(false);
    expect(d.sample(10, false, 11999)).toBe(false);
    expect(d.sample(10, false, 12000)).toBe(true);
    expect(d.sample(10, false, 13000)).toBe(false);
    expect(d.sample(10, false, 30000)).toBe(false);
  });
  it('não dispara enquanto pausado e a pausa reinicia a janela', () => {
    const d = createStallDetector();
    d.sample(5, false, 0);
    expect(d.sample(5, true, 20000)).toBe(false);
    expect(d.sample(5, false, 25000)).toBe(false);
    expect(d.sample(5, false, 31999)).toBe(false);
    expect(d.sample(5, false, 32000)).toBe(true);
  });
  it('avanço de currentTime reinicia a janela', () => {
    const d = createStallDetector();
    d.sample(1, false, 0);
    expect(d.sample(2, false, 10000)).toBe(false);
    expect(d.sample(2, false, 21999)).toBe(false);
    expect(d.sample(2, false, 22000)).toBe(true);
  });
  it('avanço de até 0.05 s não conta como progresso', () => {
    const d = createStallDetector();
    d.sample(1, false, 0);
    expect(d.sample(1.04, false, 12000)).toBe(true);
  });
  it('volta a disparar só depois de novo avanço', () => {
    const d = createStallDetector();
    d.sample(1, false, 0);
    expect(d.sample(1, false, 12000)).toBe(true);
    expect(d.sample(1, false, 40000)).toBe(false);
    expect(d.sample(3, false, 41000)).toBe(false);
    expect(d.sample(3, false, 53000)).toBe(true);
  });
  it('reset reinicia o estado', () => {
    const d = createStallDetector();
    d.sample(1, false, 0);
    expect(d.sample(1, false, 12000)).toBe(true);
    d.reset();
    expect(d.sample(1, false, 20000)).toBe(false);
    expect(d.sample(1, false, 32000)).toBe(true);
  });
  it('aceita timeout customizado', () => {
    const d = createStallDetector(1000);
    d.sample(0, false, 0);
    expect(d.sample(0, false, 1000)).toBe(true);
  });
});

describe('createChannelNumberInput', () => {
  it('usa os valores padrão', () => {
    expect(CHANNEL_INPUT).toEqual({ maxDigits: 4, commitDelayMs: 1500 });
  });
  it('acumula dígitos e confirma após 1500 ms', () => {
    const c = createChannelNumberInput();
    expect(c.press(1, 0)).toBe('1');
    expect(c.press(2, 500)).toBe('12');
    expect(c.pending()).toBe('12');
    expect(c.poll(1999)).toBeNull();
    expect(c.poll(2000)).toBe(12);
    expect(c.pending()).toBe('');
    expect(c.poll(5000)).toBeNull();
  });
  it('limita a 4 dígitos', () => {
    const c = createChannelNumberInput();
    c.press(1, 0);
    c.press(2, 1);
    c.press(3, 2);
    c.press(4, 3);
    expect(c.press(5, 4)).toBe('1234');
    expect(c.poll(1503)).toBe(1234);
  });
  it('ignora dígito fora de 0-9', () => {
    const c = createChannelNumberInput();
    expect(c.press(10, 0)).toBe('');
    expect(c.press(-1, 0)).toBe('');
    expect(c.press(1.5, 0)).toBe('');
    expect(c.poll(5000)).toBeNull();
  });
  it('remove zeros à esquerda', () => {
    const c = createChannelNumberInput();
    c.press(0, 0);
    c.press(0, 1);
    c.press(7, 2);
    expect(c.poll(2000)).toBe(7);
  });
  it('clear limpa o buffer', () => {
    const c = createChannelNumberInput();
    c.press(9, 0);
    c.clear();
    expect(c.pending()).toBe('');
    expect(c.poll(9999)).toBeNull();
  });
});

describe('channelIndexForNumber', () => {
  it('converte para índice 0-based', () => {
    expect(channelIndexForNumber(1, 5)).toBe(0);
    expect(channelIndexForNumber(5, 5)).toBe(4);
  });
  it('devolve null fora de 1..total', () => {
    expect(channelIndexForNumber(0, 5)).toBeNull();
    expect(channelIndexForNumber(6, 5)).toBeNull();
    expect(channelIndexForNumber(-1, 5)).toBeNull();
    expect(channelIndexForNumber(1.5, 5)).toBeNull();
  });
});

describe('novas teclas do controle', () => {
  it('mapeia mídia e dígitos do webOS', () => {
    expect(mapWebosKey(415)).toBe('play');
    expect(mapWebosKey(19)).toBe('pause');
    expect(mapWebosKey(413)).toBe('stop');
    expect(mapWebosKey(417)).toBe('fastForward');
    expect(mapWebosKey(412)).toBe('rewind');
    expect(mapWebosKey(48)).toBe('digit0');
    expect(mapWebosKey(57)).toBe('digit9');
  });
  it('mapeia teclas do Android', () => {
    expect(mapAndroidKey('playPause')).toBe('playPause');
    expect(mapAndroidKey('play')).toBe('play');
    expect(mapAndroidKey('pause')).toBe('pause');
    expect(mapAndroidKey('stop')).toBe('stop');
    expect(mapAndroidKey('fastForward')).toBe('fastForward');
    expect(mapAndroidKey('rewind')).toBe('rewind');
    expect(mapAndroidKey('up')).toBe('up');
    expect(mapAndroidKey('down')).toBe('down');
    expect(mapAndroidKey('left')).toBe('left');
    expect(mapAndroidKey('right')).toBe('right');
    expect(mapAndroidKey('select')).toBe('ok');
    expect(mapAndroidKey('channelUp')).toBe('channelUp');
    expect(mapAndroidKey('channelDown')).toBe('channelDown');
    expect(mapAndroidKey('DPadUp')).toBe('up');
    expect(mapAndroidKey('menu')).toBeNull();
  });
  it('mapeia dígitos do Android (eventType "0"…"9")', () => {
    for (let d = 0; d <= 9; d++) {
      const action = mapAndroidKey(String(d));
      expect(action).toBe(`digit${d}`);
      expect(action && digitOf(action)).toBe(d);
    }
  });
  it('digitOf extrai o dígito', () => {
    expect(digitOf('digit0')).toBe(0);
    expect(digitOf('digit7')).toBe(7);
    expect(digitOf('ok')).toBeNull();
  });
});
