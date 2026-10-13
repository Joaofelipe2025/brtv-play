import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useStore } from 'zustand';
import { firstUnlockedGroup, isGroupLocked, unlockedItems } from '@brtv/core';
import { useApp, type Route } from '../context';
import { useAutoFocus } from '../hooks';
import { store } from '../platform';
import { loadSeasons, type EpisodeItem } from '../library';
import { PinGate } from '../components/PinGate';
import { TopBar } from '../components/Brand';
import { Art, tintFor } from '../components/Artwork';
import { formatClock } from '../format';

interface Entry {
  id: string;
  name: string;
  group: string;
  poster?: string;
  /** Linha de apoio no destaque (ex.: "2 temporadas") */
  detail?: string;
  onOpen(): void;
}

/** Imagem do item focado atrás do conteúdo (fallback: arte gerada). */
function Backdrop({ src, title }: { src?: string; title: string }) {
  // Sem imagem: só um brilho no tom do título (uma arte gerada em tela cheia teria bordas duras)
  if (!src) {
    return (
      <div
        className="backdrop backdrop--soft"
        key={title}
        aria-hidden="true"
        style={{ '--tint': tintFor(title) } as CSSProperties}
      />
    );
  }
  return (
    <div className="backdrop" key={title} aria-hidden="true">
      <Art src={src} title={title} variant="poster" />
    </div>
  );
}

/**
 * Navegador de VOD: destaque do item focado, categorias em pílulas, busca e grade de pôsteres.
 * A categoria fica na rota, então voltar do player devolve a mesma grade e o mesmo foco.
 */
function VodBrowser({
  title,
  entries,
  category,
  routeName,
}: {
  title: string;
  entries: Entry[];
  category?: string;
  routeName: 'movies' | 'series';
}) {
  const { session, update, replace } = useApp();
  const blocked = useStore(store, (s) => s.blockedCategories);
  const positions = useStore(store, (s) => s.continueWatching);
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const unlocked = session.unlockedCategories;
  const groups = useMemo(() => Array.from(new Set(entries.map((e) => e.group))), [entries]);
  // Categoria da rota só vale se ainda existe (a lista pode ter sido recarregada);
  // sem ela, a primeira categoria que não pede PIN
  const activeGroup =
    (category !== undefined && groups.indexOf(category) >= 0 ? category : null) ??
    firstUnlockedGroup(groups, blocked, unlocked);
  // Categoria bloqueada vinda da rota: pede o PIN antes de mostrar
  const activeLocked = activeGroup !== null && isGroupLocked(activeGroup, blocked, unlocked);
  const gate = pending ?? (activeLocked ? activeGroup : null);

  // A tela é reaproveitada quando a rota troca de categoria: um PIN pendente não sobrevive à troca
  useEffect(() => setPending(null), [category]);

  // Com busca, procura em todas as categorias liberadas
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) return unlockedItems(entries, blocked, unlocked).filter((e) => e.name.toLowerCase().includes(q));
    if (activeLocked) return [];
    return entries.filter((e) => e.group === activeGroup);
  }, [entries, activeGroup, activeLocked, query, blocked, unlocked]);

  const focused = visible.find((e) => e.id === focusedId) ?? visible[0] ?? null;
  const resumeAt = focused ? positions[focused.id] : undefined;

  useAutoFocus(entries.length > 0, [entries.length]);

  const choose = (g: string) => {
    if (isGroupLocked(g, blocked, unlocked)) {
      setPending(g);
      return;
    }
    setQuery('');
    setFocusedId(null);
    replace({ name: routeName, category: g } as Route);
  };

  if (entries.length === 0) {
    return (
      <div className="screen">
        <TopBar active={routeName} />
        <div className="empty">
          <h2>{session.loading ? 'Carregando…' : `Nenhum título em ${title}`}</h2>
          {!session.loading && (
            <p className="muted">
              Listas M3U trazem filmes e séries quando usam grupos como “Filmes | Ação” ou “Séries | Drama”. Contas Xtream trazem o catálogo completo.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      {focused && <Backdrop src={focused.poster} title={focused.name} />}
      <TopBar active={routeName} />

      {gate ? (
        <PinGate
          category={gate}
          onUnlock={() => {
            update({ unlockedCategories: [...unlocked, gate] });
            replace({ name: routeName, category: gate } as Route);
            setPending(null);
          }}
          onCancel={() => {
            setPending(null);
            // Cancelou o PIN da categoria da rota: volta para a primeira que não pede PIN
            if (!pending) {
              const fallback = firstUnlockedGroup(groups, blocked, unlocked);
              replace((fallback ? { name: routeName, category: fallback } : { name: routeName }) as Route);
            }
          }}
        />
      ) : (
        <>
          <div className="hero">
            <div className="hero__title">{focused?.name ?? title}</div>
            <div className="hero__meta">
              {focused?.group}
              {focused?.detail ? `, ${focused.detail}` : ''}
              {resumeAt ? (
                <span className="num" style={{ marginLeft: 24, color: 'var(--lime)' }}>
                  Continuar de {formatClock(resumeAt)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="toolbar">
            <div className="scroll-x" style={{ flex: 1 }}>
              {groups.map((g) => (
                <button
                  key={g}
                  data-fk={`${routeName}-cat-${g}`}
                  className={`focusable pill ${g === activeGroup && !query ? 'is-active' : ''}`}
                  onClick={() => choose(g)}
                >
                  {blocked.includes(g) ? `${g} (bloqueada)` : g}
                </button>
              ))}
            </div>
            <input
              className="focusable search"
              type="search"
              placeholder="Buscar título"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={`Buscar em ${title}`}
            />
          </div>

          <div className="scroll" style={{ flex: 1, marginTop: 8 }}>
            {visible.length === 0 ? (
              query.trim() ? (
                <p className="muted" style={{ marginTop: 40 }}>
                  Nada encontrado para “{query}”.
                </p>
              ) : null
            ) : (
              <div className="posters">
                {visible.map((e) => (
                  <button
                    key={e.id}
                    data-fk={`${routeName}-${e.id}`}
                    data-autofocus={e === visible[0] ? true : undefined}
                    className="focusable poster-wrap"
                    style={{ borderRadius: 22 }}
                    onFocus={() => setFocusedId(e.id)}
                    onClick={e.onOpen}
                  >
                    <div className="poster">
                      <div className="poster__frame">
                        <Art src={e.poster} title={e.name} variant="poster" />
                      </div>
                    </div>
                    <div className="poster__caption ellipsis">{e.name}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function Movies({ category }: { category?: string }) {
  const { session, go } = useApp();
  const entries: Entry[] = (session.library?.movies ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    group: m.group,
    ...(m.poster ? { poster: m.poster } : {}),
    onOpen: () => go({ name: 'player', url: m.url, title: m.name, isLive: false, id: m.id }),
  }));
  return <VodBrowser title="Filmes" entries={entries} category={category} routeName="movies" />;
}

export function Series({ category }: { category?: string }) {
  const { session, go } = useApp();
  const entries: Entry[] = (session.library?.series ?? []).map((s) => {
    const seasons = s.seasons ? Object.keys(s.seasons).length : 0;
    return {
      id: s.id,
      name: s.name,
      group: s.group,
      ...(s.cover ? { poster: s.cover } : {}),
      ...(seasons ? { detail: seasons === 1 ? '1 temporada' : `${seasons} temporadas` } : {}),
      onOpen: () => go({ name: 'seriesDetail', seriesId: s.id }),
    };
  });
  return <VodBrowser title="Séries" entries={entries} category={category} routeName="series" />;
}

export function SeriesDetail({ seriesId }: { seriesId: string }) {
  const { session, go } = useApp();
  const positions = useStore(store, (s) => s.continueWatching);
  const library = session.library;
  const entry = library?.series.find((s) => s.id === seriesId) ?? null;
  const [seasons, setSeasons] = useState<Record<string, EpisodeItem[]> | null>(entry?.seasons ?? null);
  const [season, setSeason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!library || !entry || seasons) return;
    let cancelled = false;
    loadSeasons(library, entry)
      .then((data) => !cancelled && setSeasons(data))
      .catch(() => !cancelled && setError('Não foi possível carregar os episódios. Volte e tente de novo.'));
    return () => {
      cancelled = true;
    };
  }, [library, entry, seasons]);

  const seasonKeys = seasons ? Object.keys(seasons).sort((a, b) => Number(a) - Number(b)) : [];
  const activeSeason = season ?? seasonKeys[0] ?? null;
  const episodes = (activeSeason && seasons?.[activeSeason]) || [];

  useAutoFocus(seasonKeys.length > 0, [seasonKeys.length]);

  if (!entry) {
    return (
      <div className="screen">
        <TopBar active="series" />
        <div className="empty">
          <h2>Série não encontrada</h2>
          <p className="muted">A lista pode ter sido recarregada. Volte e escolha de novo.</p>
        </div>
      </div>
    );
  }

  const play = (ep: EpisodeItem) =>
    go({
      name: 'player',
      url: ep.url,
      title: `${entry.name}, T${ep.season} E${ep.episode}`,
      isLive: false,
      id: ep.id,
    });

  return (
    <div className="screen">
      <Backdrop src={entry.cover} title={entry.name} />
      <TopBar active="series" />

      <div className="hero" style={{ height: 240 }}>
        <div className="hero__title">{entry.name}</div>
        <div className="hero__meta">
          {entry.group}
          {seasonKeys.length ? `, ${seasonKeys.length === 1 ? '1 temporada' : `${seasonKeys.length} temporadas`}` : ''}
        </div>
        {entry.plot && (
          <p className="muted" style={{ marginTop: 12, maxWidth: 1000, fontSize: 26 }}>
            {entry.plot}
          </p>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {!seasons && !error && <p className="muted">Carregando episódios…</p>}

      {seasons && (
        <>
          <div className="scroll-x" style={{ marginTop: 20 }}>
            {seasonKeys.map((s) => (
              <button
                key={s}
                data-fk={`season-${s}`}
                className={`focusable pill ${s === activeSeason ? 'is-active' : ''}`}
                onClick={() => setSeason(s)}
              >
                Temporada {s}
              </button>
            ))}
          </div>

          <div className="scroll" style={{ flex: 1, maxWidth: 1300 }}>
            {episodes.map((ep) => {
              const at = positions[ep.id];
              return (
                <button
                  key={ep.id}
                  data-fk={`ep-${ep.id}`}
                  data-autofocus={ep === episodes[0] ? true : undefined}
                  className="focusable row-item episode"
                  onClick={() => play(ep)}
                >
                  <span className="episode__num">{ep.episode}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="ellipsis" style={{ display: 'block' }}>
                      {ep.title}
                    </span>
                    {at ? (
                      <span className="muted num" style={{ fontSize: 24 }}>
                        Parou em {formatClock(at)}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
