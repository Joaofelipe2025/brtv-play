import { useMemo } from 'react';
import { useStore } from 'zustand';
import { FREE_TV_PLAYLIST, type DeviceStatus, type Playlist } from '@brtv/core';
import { store } from './platform';
import { useApp } from './navigation';
import { CATALOG_PLAYLIST, SAIMO_CATALOG_PLAYLIST } from './catalog';

/** Rótulo de procedência do catálogo público de testes (Free-TV), mostrado na escolha de lista e nas Configurações. */
export const FREE_TV_LABEL = 'Fonte pública de teste';

/**
 * Listas que a pessoa pode abrir: as do servidor (conta do aparelho), depois as cadastradas
 * neste aparelho e, por último, o catálogo público de testes (Free-TV), sempre oferecido como
 * lista separada. A Ativação, a escolha de lista e as Configurações usam esta mesma união
 * para concordarem entre si.
 */
export function availablePlaylists(status: DeviceStatus | null, userPlaylists: readonly Playlist[]): Playlist[] {
  return [...(status?.playlists ?? []), ...userPlaylists, FREE_TV_PLAYLIST, SAIMO_CATALOG_PLAYLIST, CATALOG_PLAYLIST];
}

/** `available` é a união; `user` são só as cadastradas neste aparelho (as únicas que podem ser removidas). */
export function useAvailablePlaylists(): { available: Playlist[]; user: Playlist[] } {
  const { session } = useApp();
  const user = useStore(store, (s) => s.userPlaylists);
  const available = useMemo(() => availablePlaylists(session.status, user), [session.status, user]);
  return { available, user };
}
