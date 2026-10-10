import type { Playlist } from './api';
import type { XtreamCredentials } from './xtream';

/**
 * Listas cadastradas pela própria pessoa no aparelho (Xtream Codes ou link M3U).
 * Lógica pura, sem UI: os apps só chamam estas funções e mostram a mensagem dos erros.
 */

const DEFAULT_PLAYLIST_NAME = 'Minha lista';

const SCHEME = /^([a-z][a-z0-9+.-]*):\/\//i;
/** Um rótulo de nome de host: letras, dígitos, "-" e "_", sem "-" nas pontas. */
const HOST_LABEL = /^[a-z0-9_](?:[a-z0-9_-]*[a-z0-9_])?$/;
const IPV6_HOST = /^\[[0-9a-f:.]+\]$/;
const PORT = /^\d{1,5}$/;

function isValidHost(host: string): boolean {
  return IPV6_HOST.test(host) || host.split('.').every((label) => HOST_LABEL.test(label));
}

/**
 * Reduz um endereço de servidor a `protocolo://host[:porta]`, sem barra final.
 * Aceita `exemplo.test:8080`, `https://exemplo.test/` e URLs com caminho/consulta
 * (`/get.php?...`, `/player_api.php`). Sem protocolo vale `http://`.
 * Devolve `null` para entrada vazia ou inválida.
 *
 * Não usa `URL`: a implementação do React Native não traz `hostname` completo.
 */
export function normalizeServer(input: string): string | null {
  const text = input.trim();
  const schemeMatch = SCHEME.exec(text);
  const scheme = schemeMatch ? (schemeMatch[1] ?? '').toLowerCase() : 'http';
  if (scheme !== 'http' && scheme !== 'https') return null;

  const rest = schemeMatch ? text.slice(schemeMatch[0].length) : text;
  const authority = rest.split(/[/?#]/, 1)[0] ?? '';

  // IPv6 entre colchetes termina em "]" quando não há porta; nos demais, a porta vem após o último ":".
  const colon = authority.endsWith(']') ? -1 : authority.lastIndexOf(':');
  const host = (colon === -1 ? authority : authority.slice(0, colon)).toLowerCase();
  if (!isValidHost(host)) return null;
  if (colon === -1) return `${scheme}://${host}`;

  const port = authority.slice(colon + 1);
  if (!PORT.test(port)) return null;
  const portNumber = Number(port);
  if (portNumber < 1 || portNumber > 65535) return null;
  return `${scheme}://${host}:${portNumber}`;
}

/** Decodifica um valor de consulta como o `URLSearchParams` ("+" é espaço); mantém o bruto se for inválido. */
function decodeQueryValue(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

function queryValue(query: string, name: string): string | null {
  for (const pair of query.split('&')) {
    const equals = pair.indexOf('=');
    const key = equals === -1 ? pair : pair.slice(0, equals);
    if (key === name) return decodeQueryValue(equals === -1 ? '' : pair.slice(equals + 1));
  }
  return null;
}

/**
 * Se o link tiver `username` e `password` na consulta (ex.: `get.php?username=…&password=…`
 * ou `player_api.php?…`), é uma conta Xtream: devolve servidor, usuário e senha. Senão, `null`.
 */
export function xtreamFromUrl(url: string): XtreamCredentials | null {
  const withoutFragment = url.trim().split('#', 1)[0] ?? '';
  const queryStart = withoutFragment.indexOf('?');
  if (queryStart === -1) return null;

  const server = normalizeServer(withoutFragment.slice(0, queryStart));
  if (server === null) return null;

  const query = withoutFragment.slice(queryStart + 1);
  const username = queryValue(query, 'username');
  const password = queryValue(query, 'password');
  if (!username || !password) return null;
  return { server, username, password };
}

export type UserPlaylistInput =
  | { kind: 'xtream'; name?: string; server: string; username: string; password: string }
  | { kind: 'm3u'; name?: string; url: string };

/** Fontes do id. Os padrões são o relógio e o `Math.random`; testes injetam valores fixos. */
export interface PlaylistIdSource {
  now?: () => number;
  random?: () => number;
}

function newPlaylistId({ now = Date.now, random = Math.random }: PlaylistIdSource): string {
  return `user-${now().toString(36)}-${random().toString(36).slice(2, 8)}`;
}

/** Valida os campos de uma conta Xtream e devolve o servidor normalizado e os dados sem espaços nas pontas. */
function validateXtream(fields: XtreamCredentials): XtreamCredentials {
  const rawServer = fields.server.trim();
  if (rawServer === '') throw new Error('Informe o servidor.');
  const server = normalizeServer(rawServer);
  if (server === null) throw new Error('Endereço do servidor inválido.');
  const username = fields.username.trim();
  const password = fields.password.trim();
  if (username === '' || password === '') throw new Error('Informe o usuário e a senha.');
  return { server, username, password };
}

/**
 * Monta a `Playlist` a partir do que a pessoa digitou. Lança `Error` com mensagem em pt-BR
 * quando falta ou está inválido algum campo. Um link M3U que na verdade é uma conta Xtream
 * (`get.php?username=…&password=…`) vira uma lista `xtream`.
 */
export function createUserPlaylist(
  input: UserPlaylistInput,
  idSource: PlaylistIdSource = {},
): Playlist {
  const name = input.name?.trim() || DEFAULT_PLAYLIST_NAME;

  if (input.kind === 'xtream') {
    const credentials = validateXtream(input);
    return { id: newPlaylistId(idSource), name, kind: 'xtream', ...credentials };
  }

  const link = input.url.trim();
  if (link === '') throw new Error('Informe o link da lista.');

  const xtream = xtreamFromUrl(link);
  if (xtream !== null) {
    return { id: newPlaylistId(idSource), name, kind: 'xtream', ...validateXtream(xtream) };
  }

  const url = SCHEME.test(link) ? link : `http://${link}`;
  if (normalizeServer(url) === null) throw new Error('Link da lista inválido.');
  return { id: newPlaylistId(idSource), name, kind: 'm3u', url };
}
