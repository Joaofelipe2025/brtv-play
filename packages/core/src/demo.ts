/**
 * Lista de demonstração usada pelo backend mock.
 * Só streams públicos de teste (Mux, Akamai, Unified Streaming) e fotos livres do Lorem Picsum
 * (Unsplash) como capas temporárias. Nenhum conteúdo comercial: nomes de canais e títulos são fictícios,
 * exceto os filmes abertos da Blender Foundation (Big Buck Bunny, Tears of Steel), que os streams de teste exibem.
 */

const MUX = 'https://test-streams.mux.dev';

/** Streams de teste verificados (HTTP 200 e CORS liberado, para tocar também no navegador). */
export const DEMO_STREAMS = {
  bigBuckBunny: `${MUX}/x36xhzz/x36xhzz.m3u8`,
  sinalTeste: `${MUX}/test_001/stream.m3u8`,
  sinalAlternado: `${MUX}/pts_shift/master.m3u8`,
  tearsOfSteel: `${MUX}/tos_ismc/main.m3u8`,
  intervalos: `${MUX}/dai-discontinuity-deltatre/manifest.m3u8`,
  aoVivo24h: 'https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8',
  tearsOfSteelAlt: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
} as const;

/** Capa temporária (2:3) estável por título: a mesma "semente" devolve sempre a mesma foto. */
export function demoPoster(seed: string): string {
  return `https://picsum.photos/seed/brtv-${seed}/400/600`;
}

interface DemoEntry {
  name: string;
  group: string;
  url: string;
  id?: string;
  logo?: string;
}

const S = DEMO_STREAMS;

const LIVE: DemoEntry[] = [
  { id: 'demo.canal1', name: 'Canal Demo 1', group: 'Demonstração', url: S.bigBuckBunny },
  { id: 'demo.canal2', name: 'Canal Demo 2', group: 'Demonstração', url: S.sinalTeste },
  { id: 'demo.aovivo', name: 'Ao Vivo 24h', group: 'Demonstração', url: S.aoVivo24h },
  { id: 'demo.esporte1', name: 'Esporte Demo', group: 'Esportes (demo)', url: S.intervalos },
  { id: 'demo.esporte2', name: 'Arena Demo', group: 'Esportes (demo)', url: S.sinalAlternado },
  { id: 'demo.noticias1', name: 'Notícias Demo', group: 'Notícias (demo)', url: S.aoVivo24h },
  { id: 'demo.noticias2', name: 'Jornal Demo', group: 'Notícias (demo)', url: S.sinalTeste },
  { id: 'demo.infantil1', name: 'Infantil Demo', group: 'Infantil (demo)', url: S.bigBuckBunny },
  { id: 'demo.infantil2', name: 'Desenhos Demo', group: 'Infantil (demo)', url: S.bigBuckBunny },
  { id: 'demo.musica', name: 'Música Demo', group: 'Música (demo)', url: S.sinalAlternado },
  { id: 'demo.natureza', name: 'Natureza Demo', group: 'Documentários (demo)', url: S.tearsOfSteelAlt },
  { id: 'demo.ciencia', name: 'Ciência Demo', group: 'Documentários (demo)', url: S.tearsOfSteel },
  { id: 'demo.canal3', name: 'Canal Demo 3', group: 'Testes de sinal', url: S.sinalAlternado },
];

const movie = (name: string, genre: string, url: string, seed: string): DemoEntry => ({
  name,
  group: `Filmes | ${genre}`,
  url,
  logo: demoPoster(seed),
});

const MOVIES: DemoEntry[] = [
  movie('Tears of Steel', 'Demonstração', S.tearsOfSteel, 'tears-of-steel'),
  movie('Big Buck Bunny', 'Demonstração', S.bigBuckBunny, 'big-buck-bunny'),
  movie('Tears of Steel (versão alternativa)', 'Demonstração', S.tearsOfSteelAlt, 'tears-alt'),
  movie('A Jornada', 'Aventura (demo)', S.intervalos, 'jornada'),
  movie('Expedição Norte', 'Aventura (demo)', S.sinalAlternado, 'expedicao'),
  movie('Trilha Perdida', 'Aventura (demo)', S.bigBuckBunny, 'trilha'),
  movie('Horizonte', 'Ficção (demo)', S.tearsOfSteel, 'horizonte'),
  movie('Órbita', 'Ficção (demo)', S.tearsOfSteelAlt, 'orbita'),
  movie('Risadas em Família', 'Comédia (demo)', S.bigBuckBunny, 'risadas'),
  movie('Natureza Viva', 'Documentário (demo)', S.tearsOfSteelAlt, 'natureza'),
  movie('Oceano Profundo', 'Documentário (demo)', S.intervalos, 'oceano'),
  movie('Sinal de Teste', 'Testes', S.sinalTeste, 'sinal'),
];

/** Episódios no padrão "Nome S01 E02 Título" (o classificador agrupa em séries e temporadas). */
const episode = (series: string, genre: string, s: number, e: number, title: string, url: string, seed: string): DemoEntry => ({
  name: `${series} S${String(s).padStart(2, '0')} E${String(e).padStart(2, '0')} ${title}`,
  group: `Séries | ${genre}`,
  url,
  logo: demoPoster(seed),
});

const SERIES: DemoEntry[] = [
  episode('Série Demo', 'Demonstração', 1, 1, 'Piloto', S.sinalTeste, 'serie-demo'),
  episode('Série Demo', 'Demonstração', 1, 2, 'O Sinal', S.sinalAlternado, 'serie-demo'),
  episode('Série Demo', 'Demonstração', 2, 1, 'Recomeço', S.bigBuckBunny, 'serie-demo'),
  episode('Aventuras na Floresta', 'Infantil (demo)', 1, 1, 'A Toca', S.bigBuckBunny, 'floresta'),
  episode('Aventuras na Floresta', 'Infantil (demo)', 1, 2, 'O Rio', S.bigBuckBunny, 'floresta'),
  episode('Aventuras na Floresta', 'Infantil (demo)', 1, 3, 'A Tempestade', S.bigBuckBunny, 'floresta'),
  episode('Laboratório Curioso', 'Ciência (demo)', 1, 1, 'Primeiro Experimento', S.tearsOfSteel, 'laboratorio'),
  episode('Laboratório Curioso', 'Ciência (demo)', 1, 2, 'Reação em Cadeia', S.tearsOfSteelAlt, 'laboratorio'),
  episode('Laboratório Curioso', 'Ciência (demo)', 2, 1, 'Nova Fase', S.intervalos, 'laboratorio'),
];

function toM3u(entries: DemoEntry[]): string {
  const lines = ['#EXTM3U'];
  for (const e of entries) {
    const attrs = [
      e.id ? `tvg-id="${e.id}"` : '',
      `tvg-name="${e.name}"`,
      e.logo ? `tvg-logo="${e.logo}"` : '',
      `group-title="${e.group}"`,
    ].filter(Boolean);
    lines.push(`#EXTINF:-1 ${attrs.join(' ')},${e.name}`, e.url);
  }
  return `${lines.join('\n')}\n`;
}

/** Playlist M3U de demonstração (ao vivo, filmes e séries). */
export const DEMO_M3U = toM3u([...LIVE, ...MOVIES, ...SERIES]);
