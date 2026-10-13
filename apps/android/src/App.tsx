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
import {
  FREE_TV_PLAYLIST_ID,
  isPagedCatalog,
  SAIMO_CATALOG_ID,
  PLAYBACK_TEST_ID,
  PLAYBACK_TEST_URL,
  currentAndNext,
  loadEpg,
  loadFreeTvLibrary,
  loadLibrary,
  loadOrCreateDevice,
} from '@brtv/core';
import { asyncAdapter, loadPreferences, playlistFetch, store, streamingFetch } from './platform';
import { Player } from './Player';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ScaledCanvas } from './canvas';
import { useAutoUpdate } from './updates';
import { AppContext, type AppContextValue, type Route, type Session } from './navigation';
import { Activation } from './screens/Activation';
import { AddPlaylist } from './screens/AddPlaylist';
import { Playlists } from './screens/Playlists';
import { Home } from './screens/Home';
import { Live } from './screens/Live';
import { Movies, Series, SeriesDetail } from './screens/Vod';
import { About, Settings } from './screens/Settings';
import { CATALOG_BASE_URL, SAIMO_CATALOG_BASE_URL, catalogClient } from './catalog';
import { CatalogHome, CatalogBrowser, CatalogSeriesDetail } from './screens/PagedVod';

const INITIAL_ROUTE: Route = { name: 'activation' };

/** Mostrada na Início quando a lista (Xtream ou M3U) do aparelho não carrega. */
const LIBRARY_ERROR = 'Não foi possível carregar esta lista. Confira os dados e a conexão.';

export default function App() {
  useAutoUpdate();
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
    catalog: null,
    libraryError: null,
    libraryNotice: null,
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
  const seenReloadToken = useRef(session.reloadToken);
  useEffect(() => {
    const playlist = session.playlist;
    if (!playlist) return;
    // "Recarregar lista" muda o reloadToken: é um pedido para baixar a fonte de novo, não só abrir a lista
    const reload = session.reloadToken !== seenReloadToken.current;
    seenReloadToken.current = session.reloadToken;
    const freeTv = playlist.id === FREE_TV_PLAYLIST_ID;
    let cancelled = false;
    const paged = isPagedCatalog(playlist.id);
    update({ loading: true, libraryError: null, libraryNotice: null, ...(!paged ? { catalog: null } : {}) });
    void (async () => {
      try {
        if (paged) {
          const catalog = await catalogClient.open(playlist.id === SAIMO_CATALOG_ID ? SAIMO_CATALOG_BASE_URL : CATALOG_BASE_URL);
          if (cancelled) return;
          update({ catalog, library: null, libraryNotice: catalog.notice, libraryError: null, loading: false, epg: new Map() });
          return;
        }
        if (freeTv) {
          // Catálogo público: lista separada, só TV ao Vivo e sem EPG (não passa por loadLibrary/loadEpg)
          const { library, notice } = await loadFreeTvLibrary({
            storage: asyncAdapter,
            fetchFn: playlistFetch,
            force: reload,
          });
          if (cancelled) return;
          update({ library, libraryNotice: notice, libraryError: null, loading: false, epg: new Map() });
          return;
        }
        const library = await loadLibrary(playlist, session.prefs.streamFormat);
        if (cancelled) return;
        update({ library, libraryError: null, loading: false });
        const epg = await loadEpg(library.epgUrl, streamingFetch);
        if (!cancelled) update({ epg });
      } catch (error) {
        if (!cancelled) {
          // O catálogo público já falha com mensagem própria em pt-BR (internet, tamanho, lista inválida)
          const message = (freeTv || paged) && error instanceof Error ? error.message : LIBRARY_ERROR;
          update({ library: null, libraryError: message, loading: false, epg: new Map() });
        }
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
  const paged = isPagedCatalog(session.playlist?.id);
  switch (route.name) {
    case 'activation':
      screen = <Activation />;
      break;
    case 'playlists':
      screen = <Playlists />;
      break;
    case 'addPlaylist':
      screen = <AddPlaylist />;
      break;
    case 'home':
      screen = paged ? <CatalogHome /> : <Home />;
      break;
    case 'live':
      screen = <Live category={route.category} />;
      break;
    case 'movies':
      screen = paged ? <CatalogBrowser kind="movies" category={route.category} /> : <Movies category={route.category} />;
      break;
    case 'series':
      screen = paged ? <CatalogBrowser kind="series" category={route.category} /> : <Series category={route.category} />;
      break;
    case 'seriesDetail':
      screen = paged ? <CatalogSeriesDetail seriesId={route.seriesId} /> : <SeriesDetail seriesId={route.seriesId} />;
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
          sources={route.sources}
          title={route.title}
          isLive={route.isLive}
          id={route.id}
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
          onTestPlayback={route.id === PLAYBACK_TEST_ID ? undefined : () => replace({ name: 'player', url: PLAYBACK_TEST_URL, title: 'Teste de reprodução · Big Buck Bunny', id: PLAYBACK_TEST_ID, isLive: false })}
        />
      );
      break;
    }
  }

  return (
    <AppContext.Provider value={value}>
      <StatusBar style="light" hidden />
      {/* Telas em 1920x1080 virtuais, reduzidas por igual ao tamanho real do aparelho */}
      <ScaledCanvas>
        {/* Uma tela que quebra mostra uma saída em vez de tela preta; nova tela, novo boundary */}
        <ErrorBoundary
          key={`${stack.length}:${route.name}`}
          onRecover={() => reset(session.playlist ? { name: 'home' } : INITIAL_ROUTE)}
        >
          {screen}
        </ErrorBoundary>
      </ScaledCanvas>
    </AppContext.Provider>
  );
}
