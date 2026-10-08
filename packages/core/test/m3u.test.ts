import { describe, expect, it } from 'vitest';
import { parseM3u } from '../src/m3u';

describe('parseM3u', () => {
  it('lê atributos tvg e group-title', () => {
    const content = `#EXTM3U
#EXTINF:-1 tvg-id="globo.br" tvg-name="Canal X" tvg-logo="http://logo/x.png" group-title="Notícias",Canal X
http://exemplo.test/x.m3u8`;
    const [channel] = parseM3u(content);
    expect(channel).toEqual({
      id: 'globo.br',
      name: 'Canal X',
      url: 'http://exemplo.test/x.m3u8',
      tvgId: 'globo.br',
      tvgName: 'Canal X',
      tvgLogo: 'http://logo/x.png',
      group: 'Notícias',
    });
  });

  it('não quebra quando o nome contém vírgula dentro de atributo', () => {
    const content = `#EXTINF:-1 tvg-name="A, B" group-title="Grupo, 1",Nome Final
http://exemplo.test/a.m3u8`;
    const [channel] = parseM3u(content);
    expect(channel?.name).toBe('Nome Final');
    expect(channel?.group).toBe('Grupo, 1');
  });

  it('usa "Sem grupo" quando group-title não existe', () => {
    const [channel] = parseM3u(`#EXTINF:-1,Simples\nhttp://exemplo.test/s.ts`);
    expect(channel?.group).toBe('Sem grupo');
    expect(channel?.name).toBe('Simples');
  });

  it('ignora entradas sem URL e linhas desconhecidas', () => {
    const content = `#EXTM3U
#EXTINF:-1,Sem URL
#EXTINF:-1,Válido
http://exemplo.test/v.m3u8
linha qualquer que não é URL`;
    const channels = parseM3u(content);
    expect(channels).toHaveLength(1);
    expect(channels[0]?.name).toBe('Válido');
  });

  it('aceita CRLF e linhas em branco', () => {
    const content = '#EXTM3U\r\n\r\n#EXTINF:-1,A\r\nhttp://exemplo.test/a.m3u8\r\n';
    expect(parseM3u(content)).toHaveLength(1);
  });

  it('gera id único quando tvg-id não existe', () => {
    const channels = parseM3u(
      `#EXTINF:-1,A\nhttp://exemplo.test/1.m3u8\n#EXTINF:-1,B\nhttp://exemplo.test/2.m3u8`,
    );
    expect(channels.map((c) => c.id)).toEqual(['ch-0', 'ch-1']);
  });

  it('retorna lista vazia para conteúdo sem canais', () => {
    expect(parseM3u('')).toEqual([]);
    expect(parseM3u('#EXTM3U')).toEqual([]);
  });
});
