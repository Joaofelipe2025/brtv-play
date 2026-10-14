import { describe, expect, it } from 'vitest';
import { describePlaybackFailure, stalledPlaybackFailure, VOD_STALL_TIMEOUT_MS } from '../src/playback-diagnostics';
import { createStallDetector } from '../src/playback';

describe('diagnóstico de reprodução Android', () => {
  it.each(['401', '403', '404', '410', '429'])('interrompe repetição automática no HTTP %s', (status) => {
    const value = describePlaybackFailure({ error: { errorCode: '22004', errorStackTrace: `Caused by: InvalidResponseCodeException: Response code: ${status}` } });
    expect(value.code).toBe(`HTTP ${status}`);
    expect(value.retryable).toBe(false);
  });
  it('mantém repetição limitada para erro temporário do servidor', () => {
    expect(describePlaybackFailure({ error: { errorException: 'Response code: 503' } })).toMatchObject({ code: 'HTTP 503', retryable: true });
  });
  it.each(['24005', '4005'])('identifica formato sem suporte com código %s', (errorCode) => {
    expect(describePlaybackFailure({ error: { errorCode } })).toMatchObject({ code: 'FORMATO 4005', retryable: false });
  });
  it('distingue HTTP bloqueado pelo APK de bloqueio na fonte', () => {
    expect(describePlaybackFailure({ error: { errorCode: '22007' } })).toMatchObject({ code: 'HTTP BLOQUEADO', retryable: false });
    expect(describePlaybackFailure({ error: { errorCode: 2007 } })).toMatchObject({ code: 'HTTP BLOQUEADO', retryable: false });
    expect(describePlaybackFailure({ error: { errorException: 'Cleartext HTTP traffic not permitted' } })).toMatchObject({ code: 'HTTP BLOQUEADO', retryable: false });
  });
  it('identifica DNS, TLS e licença sem vazar a mensagem nativa', () => {
    for (const [native, code] of [['UnknownHostException', 'DNS'], ['SSLHandshakeException', 'TLS'], ['ERROR_CODE_DRM_LICENSE_ACQUISITION_FAILED', 'DRM']]) {
      const value = describePlaybackFailure({ error: { errorException: `${native}: https://user:senha@servidor/movie?token=segredo` } });
      expect(value.code).toBe(code);
      expect(JSON.stringify(value)).not.toMatch(/senha|segredo|https:|servidor\/movie/);
    }
  });
  it('eventos ausentes ou códigos arbitrários não quebram nem aparecem na tela', () => {
    for (const event of [null, undefined, {}, { error: null }, { error: { errorCode: 'https://user:senha@fonte', errorString: 'segredo' } }]) {
      expect(describePlaybackFailure(event)).toMatchObject({ code: 'REPRODUÇÃO', retryable: true });
    }
  });
  it('permite 45 segundos para VOD sem reiniciar aos 12 e preserva pausa', () => {
    const detector = createStallDetector(VOD_STALL_TIMEOUT_MS);
    expect(detector.sample(0, false, 0)).toBe(false);
    expect(detector.sample(0, false, 12_000)).toBe(false);
    expect(detector.sample(0, false, 44_999)).toBe(false);
    expect(detector.sample(0, false, 45_000)).toBe(true);
    expect(detector.sample(0, true, 100_000)).toBe(false);
    expect(stalledPlaybackFailure(false).message).toContain('45 segundos');
  });
});
