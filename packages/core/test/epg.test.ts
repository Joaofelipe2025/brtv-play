import { describe, expect, it } from 'vitest';
import { currentAndNext, parseXmltvDate, parseXmltvStream } from '../src/epg';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <programme start="20260108100000 +0000" stop="20260108110000 +0000" channel="globo.br">
    <title lang="pt">Jornal &amp; Notícias</title>
    <desc>Resumo do dia</desc>
  </programme>
  <programme start="20260108110000 +0000" stop="20260108120000 +0000" channel="globo.br">
    <title>Novela</title>
  </programme>
  <programme start="20260108100000 +0000" stop="20260108090000 +0000" channel="invalido">
    <title>Inválido: stop antes do start</title>
  </programme>
</tv>`;

async function* chunksOf(text: string, size: number): AsyncGenerator<string> {
  for (let i = 0; i < text.length; i += size) {
    yield text.slice(i, i + size);
  }
}

describe('parseXmltvDate', () => {
  it('converte data com offset positivo', () => {
    expect(parseXmltvDate('20260108100000 +0200')).toBe(Date.UTC(2026, 0, 8, 8, 0, 0));
  });

  it('converte data sem offset como UTC', () => {
    expect(parseXmltvDate('20260108100000')).toBe(Date.UTC(2026, 0, 8, 10, 0, 0));
  });

  it('retorna null para formato inválido', () => {
    expect(parseXmltvDate('nao-e-data')).toBeNull();
  });
});

describe('parseXmltvStream', () => {
  it('indexa programas por canal e descarta os inválidos', async () => {
    const index = await parseXmltvStream(chunksOf(XML, 1000));
    expect(index.has('invalido')).toBe(false);
    const programmes = index.get('globo.br') ?? [];
    expect(programmes).toHaveLength(2);
    expect(programmes[0]?.title).toBe('Jornal & Notícias');
    expect(programmes[0]?.description).toBe('Resumo do dia');
  });

  it('produz o mesmo resultado com chunks pequenos (leitura incremental)', async () => {
    const big = await parseXmltvStream(chunksOf(XML, 1000));
    const small = await parseXmltvStream(chunksOf(XML, 7));
    expect([...small.get('globo.br')!.map((p) => p.title)]).toEqual(
      [...big.get('globo.br')!.map((p) => p.title)],
    );
  });

  it('ordena a programação por horário de início', async () => {
    const reversed = `<programme start="20260108120000 +0000" stop="20260108130000 +0000" channel="c"><title>B</title></programme>
<programme start="20260108100000 +0000" stop="20260108110000 +0000" channel="c"><title>A</title></programme>`;
    const index = await parseXmltvStream(chunksOf(reversed, 50));
    expect(index.get('c')?.map((p) => p.title)).toEqual(['A', 'B']);
  });
});

describe('currentAndNext', () => {
  it('retorna programa atual e próximo no instante dado', async () => {
    const index = await parseXmltvStream(chunksOf(XML, 500));
    const now = Date.UTC(2026, 0, 8, 10, 30, 0);
    const { current, next } = currentAndNext(index, 'globo.br', now);
    expect(current?.title).toBe('Jornal & Notícias');
    expect(next?.title).toBe('Novela');
  });

  it('retorna nulos para canal desconhecido', async () => {
    const index = await parseXmltvStream(chunksOf(XML, 500));
    expect(currentAndNext(index, 'nada', 0)).toEqual({ current: null, next: null });
  });
});
