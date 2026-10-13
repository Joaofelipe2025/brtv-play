import { describe, expect, it } from 'vitest';
import { createSourceRound } from '../src/vod-sources';

describe('rodada de fontes VOD', () => {
  it('remove duplicatas, rejeita protocolos e encerra sem ciclo automático', () => {
    const round = createSourceRound('https://example.org/a', [
      { url: 'https://example.org/a', label: 'Dublado' },
      { url: 'https://example.org/a', label: 'Repetido' },
      { url: 'file:///local', label: 'Inválido' },
      { url: 'https://example.org/b', label: 'Legendado' },
    ]);
    expect(round.sources).toHaveLength(2);
    expect(round.next(0)).toBe(true);
    expect(round.next(0)).toBe(false); // callback atrasado da fonte anterior
    expect(round.current().index).toBe(1);
    expect(round.next(1)).toBe(false);
    round.restart();
    expect(round.current()).toMatchObject({ index: 0, generation: 2 });
    expect(round.next(1)).toBe(false);
    expect(round.next(2)).toBe(true);
  });
  it('mantém a URL única dos catálogos anteriores', () => {
    const round = createSourceRound('https://example.org/old.mp4');
    expect(round.sources[0]?.url).toBe('https://example.org/old.mp4');
    expect(round.next(0)).toBe(false);
  });
});
