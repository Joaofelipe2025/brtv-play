import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppContext, type AppContextValue, type Route, type Session } from './context';
import { currentFocusKey, installRemote, scheduleFocusRestore } from './focus';
import { loadPreferences } from './platform';
import { Activation } from './screens/Activation';
import { Home } from './screens/Home';
import { Live } from './screens/Live';
import { Movies, Series, SeriesDetail } from './screens/Vod';
import { Player } from './screens/Player';
import { Playlists } from './screens/Playlists';
import { Settings, About } from './screens/Settings';
import { loadEpg, loadLibrary } from './library';
import { ErrorBoundary } from './components/ErrorBoundary';

interface Entry {
  route: Route;
  /** Foco a restaurar quando o usuário voltar para esta tela. */
  focusKey: string | null;
  /** Identidade estável da entrada (anima só quando a tela muda de fato). */
  key: number;
}

const INITIAL_ROUTE: Route = { name: 'activation' };
let entryCounter = 0;

function entry(route: Route): Entry {
  entryCounter += 1;
  return { route, focusKey: null, key: entryCounter };
}

export function App() {
  const [stack, setStack] = useState<Entry[]>(() => [entry(INITIAL_ROUTE)]);
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

  const top = stack[stack.length - 1] ?? entry(INITIAL_ROUTE);
  const route = top.route;

  const go = useCallback((next: Route) => {
    const focusKey = currentFocusKey();
    setStack((s) => {
      const copy = s.slice();
      const last = copy[copy.length - 1];
      if (last) copy[copy.length - 1] = { ...last, focusKey };
      return [...copy, entry(next)];
    });
  }, []);

  // replace mantém a key: a tela não reanima ao trocar filtro/categoria
  const replace = useCallback(
    (next: Route) =>
      setStack((s) => {
        const last = s[s.length - 1];
        return last ? [...s.slice(0, -1), { ...last, route: next }] : [entry(next)];
      }),
    [],
  );

  const reset = useCallback((next: Route) => setStack([entry(next)]), []);

  const back = useCallback(() => {
    setStack((s) => {
      if (s.length <= 1) return s;
      const previous = s[s.length - 2];
      scheduleFocusRestore(previous?.focusKey ?? null);
      return s.slice(0, -1);
    });
  }, []);

  const update = useCallback((patch: Partial<Session>) => {
    setSession((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    void loadPreferences().then((prefs) => update({ prefs }));
  }, [update]);

  // Tecla Voltar global (Escape no navegador, 461 no LG)
  const backRef = useRef(back);
  backRef.current = back;
  useEffect(() => installRemote(() => backRef.current()), []);

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
    case 'player':
      screen = (
        <Player
          key={route.url}
          url={route.url}
          title={route.title}
          isLive={route.isLive}
          id={route.id}
          channels={route.channels}
          index={route.index}
        />
      );
      break;
  }

  return (
    <AppContext.Provider value={value}>
      <div className="app-bg" aria-hidden="true">
        <span className="glow glow--lime" />
        <span className="glow glow--green" />
      </div>
      <ErrorBoundary key={top.key} onRecover={() => reset(session.playlist ? { name: 'home' } : INITIAL_ROUTE)}>
        {screen}
      </ErrorBoundary>
    </AppContext.Provider>
  );
}
