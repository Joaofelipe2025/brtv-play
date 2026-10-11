import { PAGED_CATALOG_ID, PagedCatalogClient, type M3uPlaylist } from '@brtv/core';
import { asyncAdapter, playlistFetch } from './platform';

/** Arquivos estáticos; pode apontar para uma CDN sem mudar a implementação. */
export const CATALOG_BASE_URL = process.env.EXPO_PUBLIC_CATALOG_BASE_URL
  || 'https://raw.githubusercontent.com/Joaofelipe2025/brtv-play/catalog-data';
export const CATALOG_PLAYLIST: M3uPlaylist = {
  id: PAGED_CATALOG_ID,
  name: 'Filmes e séries · Catálogo',
  kind: 'm3u',
  // Marcador local: App intercepta o ID antes de loadLibrary. Nunca baixa o M3U de origem.
  content: '#EXTM3U\n',
};
export const catalogClient = new PagedCatalogClient(asyncAdapter, playlistFetch);
