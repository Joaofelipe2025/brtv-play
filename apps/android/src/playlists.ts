import { useMemo } from 'react';
import { useStore } from 'zustand';
import type { DeviceStatus, Playlist } from '@brtv/core';
import { store } from './platform';
import { useApp } from './navigation';

/**
 * Listas que a pessoa pode abrir: as do servidor (conta do aparelho) e, depois delas,
 * as cadastradas neste aparelho. A Ativação, a escolha de lista e as Configurações
 * usam esta mesma união para concordarem entre si.
 */
export function availablePlaylists(status: DeviceStatus | null, userPlaylists: readonly Playlist[]): Playlist[] {
  return [...(status?.playlists ?? []), ...userPlaylists];
}

/** `available` é a união; `user` são só as cadastradas neste aparelho (as únicas que podem ser removidas). */
export function useAvailablePlaylists(): { available: Playlist[]; user: Playlist[] } {
  const { session } = useApp();
  const user = useStore(store, (s) => s.userPlaylists);
  const available = useMemo(() => availablePlaylists(session.status, user), [session.status, user]);
  return { available, user };
}
