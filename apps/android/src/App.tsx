import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  Poppins_300Light,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { currentAndNext, loadEpg, loadLibrary, loadOrCreateDevice } from '@brtv/core';
import { asyncAdapter, loadPreferences, store } from './platform';
import { Player } from './Player';
import { AppContext, type AppContextValue, type Route, type Session } from './navigation';
import { Activation } from './screens/Activation';
import { Playlists } from './screens/Playlists';
import { Home } from './screens/Home';
import { Live } from './screens/Live';
import { Movies, Series, SeriesDetail } from './screens/Vod';
import { About, Settings } from './screens/Settings';

const INITIAL_ROUTE: Route = { name: 'activation' };

export default function App() {
  const [fontsLoaded] = useFonts({
    Poppins_300Light,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });
  const [stack, setStack] = useState<Route[]>([INITIAL_ROUTE]);
  const [session, setSession] = useState<Session>({
    device: null,
    status: null,
    playlist: null,
    library: null,
    loading: false,
    epg: new Map(),
    prefs: { streamFormat: 'hls' },
    unlockedCategories: [],
    reloadToken: 0,
  });

  const route = stack[stack.length - 1] ?? INITIAL_ROUTE;

  const go = useCallback((next: Route) => setStack((s) => [...s, next]), []);
  const replace = useCallback((next: Route) => setStack((s) => [...s.slice(0, -1), next]), []);
  const reset = useCallback((next: Route) => setStack([next]), []);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const update = useCallback((patch: Partial<Session>) => setSession((prev) => ({ ...prev, ...patch })), []);

  useEffect(() => {
    void loadOrCreateDevice(asyncAdapter).then((device) => update({ device }));
    void store.hydrate();
    void loadPreferences().then((prefs) => update({ prefs }));
  }, [update]);

  // Voltar: o Player é dono do Voltar enquanto está montado; nas demais telas desempilha
  // e, na raiz, devolve o evento ao sistema (sai do app).
  const stackRef = useRef(stack);
  stackRef.current = stack;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const s = stackRef.current;
      if (s[s.length - 1]?.name === 'player') return false;
      if (s.length > 1) {
        back();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [back]);

  // Carrega biblioteca e EPG quando a playlist, o formato ou o pedido de recarga mudam
  const playlistId = session.playlist?.id;
  useEffect(() => {
    const playlist = session.playlist;
    if (!playlist) return;
    let cancelled = false;
    update({ loading: true });
    void (async () => {
      try {
        const library = await loadLibrary(playlist, session.prefs.streamFormat);
        if (cancelled) return;
        update({ library, loading: false });
        const epg = await loadEpg(library.epgUrl);
        if (!cancelled) update({ epg });
      } catch {
        if (!cancelled) update({ library: null, loading: false, epg: new Map() });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId, session.prefs.streamFormat, session.reloadToken]);

  const value: AppContextValue = useMemo(
    () => ({ session, update, go, replace, reset, back }),
    [session, update, go, replace, reset, back],
  );

  // Espera as fontes para não piscar a família do sistema
  if (!fontsLoaded) return null;

  let screen;
  switch (route.name) {
    case 'activation':
      screen = <Activation />;
      break;
    case 'playlists':
      screen = <Playlists />;
      break;
    case 'home':
      screen = <Home />;
      break;
    case 'live':
      screen = <Live category={route.category} />;
      break;
    case 'movies':
      screen = <Movies category={route.category} />;
      break;
    case 'series':
      screen = <Series category={route.category} />;
      break;
    case 'seriesDetail':
      screen = <SeriesDetail seriesId={route.seriesId} />;
      break;
    case 'settings':
      screen = <Settings />;
      break;
    case 'about':
      screen = <About />;
      break;
    case 'player': {
      const channels = route.channels ?? [];
      const index = route.index ?? 0;
      const channel = route.isLive ? channels[index] : undefined;
      const swap = (i: number) => replace({ ...route, index: i, url: channels[i]?.url ?? route.url, title: channels[i]?.name ?? route.title });
      screen = (
        <Player
          key={route.isLive ? 'live' : route.url}
          url={route.url}
          title={route.title}
          isLive={route.isLive}
          {...(channel
            ? {
                channelNumber: index + 1,
                total: channels.length,
                onChannel: (delta: number) => {
                  if (channels.length === 0) return;
                  swap((index + delta + channels.length) % channels.length);
                },
                onChannelNumber: (n: number) => {
                  if (n >= 1 && n <= channels.length) swap(n - 1);
                },
                epgTitle: currentAndNext(session.epg, channel.epgId ?? channel.id, Date.now()).current?.title,
              }
            : {})}
          onExit={back}
        />
      );
      break;
    }
  }

  return (
    <AppContext.Provider value={value}>
      <StatusBar style="light" />
      {screen}
    </AppContext.Provider>
  );
}
