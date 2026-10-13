import { describe, expect, it } from 'vitest';
import { createUserPlaylist, normalizeServer, xtreamFromUrl } from '../src/userPlaylists';

describe('normalizeServer', () => {
  it('aceita host:porta sem protocolo e assume http', () => {
    expect(normalizeServer('exemplo.test:8080')).toBe('http://exemplo.test:8080');
  });

  it('remove a barra final', () => {
    expect(normalizeServer('http://exemplo.test:8080/')).toBe('http://exemplo.test:8080');
  });

  it('mantém https e a porta explícita', () => {
    expect(normalizeServer('https://exemplo.test')).toBe('https://exemplo.test');
    expect(normalizeServer('https://exemplo.test:443/')).toBe('https://exemplo.test:443');
  });

  it('descarta caminho e consulta (get.php, player_api.php)', () => {
    expect(
      normalizeServer('http://exemplo.test:8080/get.php?username=usuario&password=senha&type=m3u_plus'),
    ).toBe('http://exemplo.test:8080');
    expect(normalizeServer('exemplo.test:8080/player_api.php')).toBe('http://exemplo.test:8080');
  });

  it('ignora espaços nas pontas e usa minúsculas no protocolo e no host', () => {
    expect(normalizeServer('  HTTP://Exemplo.Test:8080/  ')).toBe('http://exemplo.test:8080');
  });

  it('aceita IPv4, nome simples de rede local e IPv6 entre colchetes', () => {
    expect(normalizeServer('192.168.0.10:8080')).toBe('http://192.168.0.10:8080');
    expect(normalizeServer('servidor-local')).toBe('http://servidor-local');
    expect(normalizeServer('http://[::1]:8080/')).toBe('http://[::1]:8080');
  });

  it('devolve null para entrada vazia', () => {
    expect(normalizeServer('')).toBeNull();
    expect(normalizeServer('   ')).toBeNull();
  });

  it('devolve null para entrada inválida', () => {
    expect(normalizeServer('http://')).toBeNull();
    expect(normalizeServer('http://:8080')).toBeNull();
    expect(normalizeServer('ftp://exemplo.test')).toBeNull();
    expect(normalizeServer('exemplo test:8080')).toBeNull();
    expect(normalizeServer('exemplo.test:abc')).toBeNull();
    expect(normalizeServer('exemplo.test:')).toBeNull();
    expect(normalizeServer('exemplo.test:0')).toBeNull();
    expect(normalizeServer('exemplo.test:99999')).toBeNull();
    expect(normalizeServer('usuario:senha@exemplo.test')).toBeNull();
    expect(normalizeServer('exemplo..test')).toBeNull();
  });
});

describe('xtreamFromUrl', () => {
  it('extrai servidor, usuário e senha de um get.php', () => {
    expect(
      xtreamFromUrl('http://exemplo.test:8080/get.php?username=usuario&password=senha&type=m3u_plus&output=ts'),
    ).toEqual({ server: 'http://exemplo.test:8080', username: 'usuario', password: 'senha' });
  });

  it('extrai de um player_api.php, em qualquer ordem e sem protocolo', () => {
    expect(xtreamFromUrl('exemplo.test:8080/player_api.php?password=senha&username=usuario')).toEqual({
      server: 'http://exemplo.test:8080',
      username: 'usuario',
      password: 'senha',
    });
  });

  it('decodifica caracteres percentuais e ignora o fragmento', () => {
    expect(
      xtreamFromUrl('https://exemplo.test/get.php?username=us%40uario&password=se%26nha#topo'),
    ).toEqual({ server: 'https://exemplo.test', username: 'us@uario', password: 'se&nha' });
  });

  it('mantém o valor bruto quando a codificação é inválida', () => {
    expect(xtreamFromUrl('http://exemplo.test/get.php?username=usuario&password=100%')).toEqual({
      server: 'http://exemplo.test',
      username: 'usuario',
      password: '100%',
    });
  });

  it('devolve null sem usuário ou sem senha', () => {
    expect(xtreamFromUrl('http://exemplo.test/get.php?password=senha')).toBeNull();
    expect(xtreamFromUrl('http://exemplo.test/get.php?username=usuario')).toBeNull();
    expect(xtreamFromUrl('http://exemplo.test/get.php?username=usuario&password=')).toBeNull();
  });

  it('devolve null para link M3U comum, sem consulta ou com servidor inválido', () => {
    expect(xtreamFromUrl('http://exemplo.test/lista.m3u')).toBeNull();
    expect(xtreamFromUrl('http://exemplo.test/lista.m3u?token=abc')).toBeNull();
    expect(xtreamFromUrl('ftp://exemplo.test/get.php?username=usuario&password=senha')).toBeNull();
    expect(xtreamFromUrl('')).toBeNull();
  });
});

describe('createUserPlaylist', () => {
  const fixed = { now: () => 1_700_000_000_000, random: () => 0.123456789 };
  const expectedId = `user-${(1_700_000_000_000).toString(36)}-${(0.123456789).toString(36).slice(2, 8)}`;

  it('cria uma lista Xtream com servidor normalizado e nome padrão', () => {
    const playlist = createUserPlaylist(
      {
        kind: 'xtream',
        server: 'exemplo.test:8080/',
        username: 'usuario',
        password: 'senha',
      },
      fixed,
    );
    expect(playlist).toEqual({
      id: expectedId,
      name: 'Minha lista',
      kind: 'xtream',
      server: 'http://exemplo.test:8080',
      username: 'usuario',
      password: 'senha',
    });
  });

  it('gera o id no formato user-<timestamp base36>-<aleatório> por padrão', () => {
    const playlist = createUserPlaylist({
      kind: 'm3u',
      url: 'http://exemplo.test/lista.m3u',
    });
    expect(playlist.id).toMatch(/^user-[0-9a-z]+-[0-9a-z]*$/);
    const other = createUserPlaylist({ kind: 'm3u', url: 'http://exemplo.test/lista.m3u' });
    expect(other.id).not.toBe(playlist.id);
  });

  it('usa o nome informado sem espaços nas pontas e cai no padrão se vier em branco', () => {
    const named = createUserPlaylist({
      kind: 'xtream',
      name: '  Casa  ',
      server: 'exemplo.test:8080',
      username: 'usuario',
      password: 'senha',
    });
    expect(named.name).toBe('Casa');
    const blank = createUserPlaylist({
      kind: 'm3u',
      name: '   ',
      url: 'http://exemplo.test/lista.m3u',
    });
    expect(blank.name).toBe('Minha lista');
  });

  it('remove espaços do usuário e da senha', () => {
    const playlist = createUserPlaylist({
      kind: 'xtream',
      server: 'exemplo.test:8080',
      username: ' usuario ',
      password: ' senha\n',
    });
    expect(playlist).toMatchObject({ username: 'usuario', password: 'senha' });
  });

  it('exige o servidor, o usuário e a senha na lista Xtream', () => {
    const base = { kind: 'xtream' as const, server: 'exemplo.test:8080', username: 'usuario', password: 'senha' };
    expect(() => createUserPlaylist({ ...base, server: '  ' })).toThrow(new Error('Informe o servidor.'));
    expect(() => createUserPlaylist({ ...base, server: 'exemplo test' })).toThrow(
      new Error('Endereço do servidor inválido.'),
    );
    expect(() => createUserPlaylist({ ...base, username: '' })).toThrow(
      new Error('Informe o usuário e a senha.'),
    );
    expect(() => createUserPlaylist({ ...base, password: '   ' })).toThrow(
      new Error('Informe o usuário e a senha.'),
    );
  });

  it('cria uma lista M3U por link, sem conteúdo', () => {
    const playlist = createUserPlaylist(
      { kind: 'm3u', name: 'Lista', url: '  http://exemplo.test/lista.m3u  ' },
      fixed,
    );
    expect(playlist).toEqual({
      id: expectedId,
      name: 'Lista',
      kind: 'm3u',
      url: 'http://exemplo.test/lista.m3u',
    });
    expect('content' in playlist).toBe(false);
  });

  it('assume http quando o link M3U não tem protocolo', () => {
    const playlist = createUserPlaylist({ kind: 'm3u', url: 'exemplo.test/lista.m3u' });
    expect(playlist).toMatchObject({ kind: 'm3u', url: 'http://exemplo.test/lista.m3u' });
  });

  it('converte um link M3U no formato Xtream em lista Xtream', () => {
    const playlist = createUserPlaylist(
      {
        kind: 'm3u',
        name: 'Provedor',
        url: 'http://exemplo.test:8080/get.php?username=usuario&password=senha&type=m3u_plus',
      },
      fixed,
    );
    expect(playlist).toEqual({
      id: expectedId,
      name: 'Provedor',
      kind: 'xtream',
      server: 'http://exemplo.test:8080',
      username: 'usuario',
      password: 'senha',
    });
  });

  it('exige um link M3U válido', () => {
    expect(() => createUserPlaylist({ kind: 'm3u', url: '   ' })).toThrow(
      new Error('Informe o link da lista.'),
    );
    expect(() => createUserPlaylist({ kind: 'm3u', url: 'ftp://exemplo.test/lista.m3u' })).toThrow(
      new Error('Link da lista inválido.'),
    );
    expect(() => createUserPlaylist({ kind: 'm3u', url: 'lista com espaço' })).toThrow(
      new Error('Link da lista inválido.'),
    );
  });
});
