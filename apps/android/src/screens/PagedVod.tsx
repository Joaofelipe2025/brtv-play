import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, ScrollView, TextInput, View } from 'react-native';
import { useStore } from 'zustand';
import {
  catalogWords, colors, formatClock, isGroupLocked,
  type CatalogDetail, type CatalogEpisode, type CatalogItem, type CatalogKind, type CatalogOrder, type CatalogSearchCursor,
} from '@brtv/core';
import { catalogClient } from '../catalog';
import { useApp } from '../navigation';
import { store } from '../platform';
import { Body, FocusCard, Text, Title, styles } from '../ui';
import { TopBar } from '../components/TopBar';
import { PinGate } from '../components/PinGate';
import { Poster } from '../components/Artwork';

type Cursor = number | CatalogSearchCursor;
interface Batch<T> { items: T[]; next: Cursor | null }
const EMPTY_ITEMS: never[] = [];
const MAX_VISIBLE = 300;
const GRID_ROW_HEIGHT = 476;
const foreground = { color: colors.textPrimary, fontSize: 25 };
const fieldStyle = { color: colors.textPrimary, fontSize: 26, backgroundColor: colors.surface, borderRadius: 12, padding: 14, width: 370 };
// Estado de navegação limitado: não é um cache do catálogo inteiro.
const browserStates = new Map<string, { query: string; order: CatalogOrder; favorites: boolean; offset: number; focused: string | null }>();
const pageStates = new Map<string, { items: Array<{ id: string }>; next: Cursor | null; block: number }>();
function Skeletons() {
  return <View accessibilityLabel="Carregando títulos" pointerEvents="none" style={{ flexDirection: 'row', gap: 12 }}>
    {Array.from({ length: 6 }, (_, i) => <View key={i} style={{ width: 276, height: 420, borderRadius: 14, backgroundColor: colors.surfaceElevated }} />)}
  </View>;
}

/** Quatro imagens em carga; itens fora da janela virtualizada liberam sua vaga. */
let imageLoads = 0;
const imageQueue: Array<() => void> = [];
function pumpImages() { while (imageLoads < 4 && imageQueue.length) imageQueue.shift()?.(); }
function acquireImage(start: () => void): () => void {
  let active = false; let ended = false;
  const run = () => { if (ended) return; active = true; imageLoads++; start(); };
  imageQueue.push(run); pumpImages();
  return () => {
    if (ended) return; ended = true;
    if (active) imageLoads--; else { const i = imageQueue.indexOf(run); if (i >= 0) imageQueue.splice(i, 1); }
    pumpImages();
  };
}
function CatalogPoster({ src, title }: { src?: string; title: string }) {
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);
  const release = useRef<() => void>(() => undefined);
  useEffect(() => {
    setEnabled(false); setFailed(false);
    if (!src) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = acquireImage(() => {
      setEnabled(true);
      timer = setTimeout(() => { setFailed(true); release.current(); }, 12_000);
    });
    release.current = () => { if (timer) clearTimeout(timer); done(); };
    return () => release.current();
  }, [src]);
  return (
    <View style={{ width: 264, height: 396 }}>
      <Poster title={title} width={264} />
      {enabled && !failed && src && <Image source={{ uri: src }} resizeMode="cover"
        style={{ position: 'absolute', width: 264, height: 396, borderRadius: 14 }}
        onError={() => setFailed(true)} onLoadEnd={() => release.current()} />}
    </View>
  );
}

/** Somente 300 resumos na tela. Ao avançar além disso abre um novo bloco. */
function usePages<T extends { id: string }>(key: string, load: (cursor: Cursor) => Promise<Batch<T>>) {
  const saved = pageStates.get(key);
  const [items, setItems] = useState<T[]>(() => (saved?.items as T[] | undefined) ?? []);
  const [next, setNext] = useState<Cursor | null>(saved ? saved.next : 0);
  const [loadedKey, setLoadedKey] = useState(key);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const [block, setBlock] = useState(saved?.block ?? 0);
  const generation = useRef(0);
  const running = useRef(false);
  const loader = useRef(load); loader.current = load;
  const request = useCallback(async (cursor: Cursor, replace: boolean) => {
    if (running.current) return;
    running.current = true; setBusy(true); setError(null);
    const current = generation.current;
    try {
      const result = await loader.current(cursor);
      if (current !== generation.current) return;
      setItems((old) => {
        const combined = replace ? [] : [...old];
        const ids = new Set(combined.map((e) => e.id));
        for (const e of result.items) if (!ids.has(e.id)) { combined.push(e); ids.add(e.id); }
        return combined;
      });
      setNext(result.next);
      if (replace) setBlock((n) => n + 1);
    } catch (err) {
      if (current === generation.current) setError(err instanceof Error ? err.message : 'Falha ao carregar. Tente novamente.');
    } finally {
      if (current === generation.current) { running.current = false; setBusy(false); }
    }
  }, []);
  useEffect(() => {
    generation.current++; running.current = false;
    const current = generation.current;
    const cached = reset === 0 ? pageStates.get(key) : undefined;
    setLoadedKey(key);
    setItems((cached?.items as T[] | undefined) ?? []); setNext(cached ? cached.next : 0); setError(null); setBusy(false);
    if (cached) setBlock(cached.block);
    else void request(0, true);
    return () => { generation.current = current + 1; running.current = false; };
  }, [key, reset, request]);
  const latest = useRef({ items, next, block }); latest.current = { items, next, block };
  useEffect(() => () => {
    if (latest.current.items.length) {
      pageStates.delete(key); pageStates.set(key, latest.current);
      while (pageStates.size > 2) pageStates.delete(pageStates.keys().next().value!);
    }
  }, [key]);
  return { items: loadedKey === key ? items : [], next, busy: busy || loadedKey !== key, error, block,
    more: () => { if (next !== null) void request(next, items.length >= MAX_VISIBLE); },
    restart: () => setReset((n) => n + 1),
  };
}

export function CatalogHome() {
  const { session, update, go } = useApp();
  return (
    <View style={styles.screen}>
      <TopBar active="home" />
      <Title>Filmes e séries</Title>
      <Body muted>Escolha uma categoria. Os títulos carregam conforme você navega.</Body>
      {session.loading && <Body>Carregando catálogo…</Body>}
      {session.libraryNotice && <Body>{session.libraryNotice}</Body>}
      {session.libraryError && <Body>{session.libraryError}</Body>}
      <View style={{ flexDirection: 'row', gap: 24, marginTop: 40 }}>
        <FocusCard autoFocus style={{ width: 480, minHeight: 220 }} onPress={() => go({ name: 'movies' })}>
          <Title>Filmes</Title><Body>{session.catalog?.manifest.totals.movies ?? '—'} títulos</Body>
        </FocusCard>
        <FocusCard style={{ width: 480, minHeight: 220 }} onPress={() => go({ name: 'series' })}>
          <Title>Séries</Title><Body>{session.catalog?.manifest.totals.series ?? '—'} séries</Body>
        </FocusCard>
      </View>
      <View style={{ flexDirection: 'row', gap: 20, marginTop: 30 }}>
        <FocusCard onPress={() => update({ reloadToken: session.reloadToken + 1 })}><Body>Atualizar catálogo</Body></FocusCard>
        <FocusCard onPress={() => go({ name: 'playlists' })}><Body>Trocar de lista</Body></FocusCard>
      </View>
    </View>
  );
}

export function CatalogBrowser({ kind, category }: { kind: CatalogKind; category?: string }) {
  const { session, update, replace, go } = useApp();
  const snapshot = session.catalog;
  const blocked = useStore(store, (s) => s.blockedCategories);
  const favorites = useStore(store, (s) => s.favorites);
  const positions = useStore(store, (s) => s.continueWatching);
  const stateKey = `${session.playlist?.id}:${kind}:${category ?? ''}`;
  const saved = browserStates.get(stateKey);
  const [query, setQuery] = useState(saved?.query ?? '');
  const [debounced, setDebounced] = useState(saved?.query.trim() ?? '');
  const [order, setOrder] = useState<CatalogOrder>(saved?.order ?? 'recent');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<TextInput>(null);
  const offset = useRef(saved?.offset ?? 0);
  const focusId = useRef(saved?.focused ?? null);
  const [pending, setPending] = useState<string | null>(null);
  const [focused, setFocused] = useState<CatalogItem | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [onlyFavorites, setOnlyFavorites] = useState(saved?.favorites ?? category === '__catalog_favorites__');
  useEffect(() => {
    browserStates.set(stateKey, { query, order, favorites: onlyFavorites, offset: offset.current, focused: focusId.current });
    while (browserStates.size > 8) browserStates.delete(browserStates.keys().next().value!);
  }, [stateKey, query, order, onlyFavorites]);
  const previousCategory = useRef(`${kind}:${category ?? ''}`);
  useEffect(() => {
    const current = `${kind}:${category ?? ''}`;
    if (previousCategory.current !== current) { setOnlyFavorites(category === '__catalog_favorites__'); previousCategory.current = current; }
  }, [category, kind]);
  const navigationGeneration = useRef(0);
  useEffect(() => () => { navigationGeneration.current++; }, []);
  useEffect(() => { const timer = setTimeout(() => setDebounced(query.trim()), 350); return () => clearTimeout(timer); }, [query]);
  const excluded = useMemo(() => blocked.filter((g) => !session.unlockedCategories.includes(g)), [blocked, session.unlockedCategories]);
  const groups = snapshot?.manifest.categories[kind] ?? EMPTY_ITEMS;
  const chosen = groups.find((g) => g.name === category);
  const activeLocked = chosen && excluded.includes(chosen.name);
  const searching = debounced.length > 0;
  const validSearch = catalogWords(debounced).some((w) => w.length >= 3);
  const gate = pending ?? (activeLocked ? chosen.name : null);
  const key = JSON.stringify([snapshot?.baseUrl, snapshot?.manifest.version, kind, chosen?.id, debounced, excluded, onlyFavorites, onlyFavorites ? favorites : null, order]);
  const load = useCallback(async (cursor: Cursor): Promise<Batch<CatalogItem>> => {
    if (!snapshot || activeLocked) return { items: [], next: null };
    if (onlyFavorites) {
      const ids = favorites.filter((id) => id.startsWith(kind === 'movies' ? 'm-' : 's-'));
      const start = typeof cursor === 'number' ? cursor : 0;
      const items: CatalogItem[] = [];
      // Petições sequenciais: no máximo um detalhe de favorito por vez.
      for (const id of ids.slice(start, start + 30)) {
        const entry = await catalogClient.detail(snapshot, id);
        if (!excluded.includes(entry.group)) items.push(entry);
      }
      return { items, next: start + 30 < ids.length ? start + 30 : null };
    }
    if (searching) {
      if (!validSearch) return { items: [], next: null };
      return catalogClient.search(snapshot, kind, debounced, typeof cursor === 'number' ? { page: 0, offset: 0 } : cursor, excluded, order, chosen?.name);
    }
    const result = await catalogClient.page(snapshot, kind, chosen?.id ?? 'all', typeof cursor === 'number' ? cursor : 0, order);
    return { ...result, items: result.items.filter((e) => !excluded.includes(e.group)) };
  }, [snapshot, activeLocked, onlyFavorites, favorites, kind, excluded, searching, validSearch, debounced, chosen?.id, chosen?.name, order]);
  const pages = usePages(key, load);
  useEffect(() => { setFocused(null); setOpenError(null); }, [key]);
  const visible = pages.items.filter((e) => !excluded.includes(e.group));
  const open = async (entry: CatalogItem) => {
    if (!snapshot || opening || isGroupLocked(entry.group, store.getState().blockedCategories, session.unlockedCategories)) return;
    browserStates.set(stateKey, { query, order, favorites: onlyFavorites, offset: offset.current, focused: entry.id });
    if (kind === 'series') { go({ name: 'seriesDetail', seriesId: entry.id }); return; }
    const current = navigationGeneration.current;
    setOpening(true); setOpenError(null);
    try {
      const detail = await catalogClient.detail(snapshot, entry.id);
      if (current !== navigationGeneration.current || !detail.url || isGroupLocked(detail.group, store.getState().blockedCategories, session.unlockedCategories)) return;
      go({ name: 'player', url: detail.url, sources: detail.sources, title: detail.name, isLive: false, id: detail.id });
    } catch { if (current === navigationGeneration.current) setOpenError('Não foi possível abrir o título. Tente novamente.'); }
    finally { if (current === navigationGeneration.current) setOpening(false); }
  };
  const choose = (name?: string) => {
    if (name && excluded.includes(name)) { setPending(name); return; }
    offset.current = 0; focusId.current = null; setOnlyFavorites(false);
    replace({ name: kind, category: name });
  };
  if (!snapshot) return <CatalogHome />;
  return (
    <View style={styles.screen}>
      <TopBar active={kind} />
      {gate ? <PinGate category={gate} onUnlock={() => {
        update({ unlockedCategories: [...session.unlockedCategories, gate] });
        setPending(null); replace({ name: kind, category: gate });
      }} onCancel={() => { setPending(null); choose(); }} /> : <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 12 }}>
          <View style={{ flex: 1 }}><Title>{focused?.name ?? (kind === 'movies' ? 'Filmes' : 'Séries')}</Title>
            <Body muted>{focused && positions[focused.id] ? `Continuar de ${formatClock(positions[focused.id] ?? 0)}` : focused ? focused.addedAt ? `Incluído/observado em ${new Date(focused.addedAt).toLocaleDateString('pt-BR')}` : 'Data de inclusão desconhecida' : 'Busca por início de palavras · mínimo 3 letras'}</Body>
          </View>
          <FocusCard onPress={() => searchRef.current?.focus()}><Body>Buscar</Body></FocusCard>
          <TextInput ref={searchRef} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} accessibilityLabel="Buscar no catálogo completo" value={query} onChangeText={(q) => { offset.current = 0; focusId.current = null; setOnlyFavorites(false); setQuery(q); }} placeholder="Buscar no catálogo" placeholderTextColor={colors.textSecondary} style={[fieldStyle, { borderWidth: 3, borderColor: searchFocused ? colors.white : 'transparent' }]} />
          <FocusCard onPress={() => { setOnlyFavorites((v) => !v); setQuery(''); setDebounced(''); }}><Body>{onlyFavorites ? 'Todos' : 'Favoritos'}</Body></FocusCard>
          {focused && <FocusCard onPress={() => store.getState().toggleFavorite(focused.id)}><Body>{favorites.includes(focused.id) ? '★ Remover' : '☆ Favoritar'}</Body></FocusCard>}
        </View>
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center', marginBottom: 12 }}>
          <FocusCard onPress={() => { offset.current = 0; setOrder((v) => v === 'recent' ? 'alphabetical' : 'recent'); }}><Body>{order === 'recent' ? 'Adicionados recentemente' : 'Ordem alfabética'}</Body></FocusCard>
          <FocusCard onPress={() => { setQuery(''); setDebounced(''); setOrder('recent'); choose(); }}><Body>Limpar busca e filtros</Body></FocusCard>
          <View style={{ flex: 1 }}><Body muted>{[chosen?.name ?? 'Todas as categorias', onlyFavorites ? 'Favoritos' : '', query ? `Busca: ${query}` : ''].filter(Boolean).join(' · ')}</Body></View>
        </View>
        <View style={{ height: 76 }}><ScrollView horizontal contentContainerStyle={{ gap: 12, padding: 6 }}>
          <FocusCard selected={!chosen} onPress={() => choose()}><Body>Todos</Body></FocusCard>
          {groups.map((g) => <FocusCard key={g.id} selected={chosen?.id === g.id} onPress={() => choose(g.name)}><Body>{g.name}{excluded.includes(g.name) ? ' · PIN' : ''}</Body></FocusCard>)}
        </ScrollView></View>
        {(pages.error || openError) && <Body>{pages.error ?? openError}</Body>}
        {opening && <Body>Abrindo título…</Body>}
        <View style={{ flex: 1 }}>
          <FlatList key={`${kind}-${pages.block}`} data={visible} numColumns={6} initialNumToRender={12} maxToRenderPerBatch={6} windowSize={3}
            getItemLayout={(_data, index) => ({ length: GRID_ROW_HEIGHT, offset: index * GRID_ROW_HEIGHT, index })}
            initialScrollIndex={visible.length ? Math.min(Math.floor(offset.current / GRID_ROW_HEIGHT), Math.ceil(visible.length / 6) - 1) : undefined}
            contentOffset={{ x: 0, y: offset.current }}
            onScroll={(e) => { offset.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={100}
            keyExtractor={(e) => e.id} extraData={favorites}
            renderItem={({ item, index }) => <FocusCard autoFocus={focusId.current ? item.id === focusId.current : index === 0} style={{ width: 290, height: 464, margin: 6, padding: 12 }}
              onFocus={() => { focusId.current = item.id; setFocused(item); if (index >= visible.length - 6 && pages.items.length < MAX_VISIBLE && !pages.busy && !pages.error) pages.more(); }} onPress={() => void open(item)}>
              <CatalogPoster src={item.poster} title={item.name} />
              <Text numberOfLines={1} style={foreground}>{favorites.includes(item.id) ? '★ ' : ''}{item.name}</Text>
            </FocusCard>}
            ListEmptyComponent={pages.busy ? <Skeletons /> : <Body>{pages.error ? 'Falha de conexão. Tente novamente abaixo.' : searching && !validSearch ? 'Digite pelo menos 3 letras.' : pages.next !== null ? 'Nenhum título neste lote. Use Carregar mais para continuar.' : searching || chosen || onlyFavorites ? 'Nenhum resultado para a busca e os filtros ativos.' : 'Este catálogo está vazio.'}</Body>} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
          {pages.next !== null && <FocusCard onPress={pages.more}><Body>{pages.busy ? 'Carregando…' : pages.error ? 'Tentar novamente' : pages.items.length >= MAX_VISIBLE ? 'Continuar no próximo bloco' : 'Carregar mais'}</Body></FocusCard>}
          <FocusCard onPress={pages.restart}><Body>Voltar ao começo</Body></FocusCard>
          <Body muted>{visible.length} títulos nesta janela</Body>
          {pages.busy && visible.length > 0 && <ActivityIndicator color={colors.accent} size="small" />}
        </View>
      </>}
    </View>
  );
}

export function CatalogSeriesDetail({ seriesId }: { seriesId: string }) {
  const { session, update, go, back } = useApp();
  const snapshot = session.catalog;
  const blocked = useStore(store, (s) => s.blockedCategories);
  const positions = useStore(store, (s) => s.continueWatching);
  const [entry, setEntry] = useState<CatalogDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!snapshot) return;
    let cancelled = false; setEntry(null); setError(null); setSeason(null);
    void catalogClient.detail(snapshot, seriesId).then((value) => {
      if (!cancelled) { setEntry(value); setSeason(value.seasons?.[0]?.season ?? null); }
    }).catch(() => { if (!cancelled) setError('Não foi possível abrir a série.'); });
    return () => { cancelled = true; };
  }, [snapshot, seriesId, retry]);
  const locked = entry ? isGroupLocked(entry.group, blocked, session.unlockedCategories) : false;
  const load = useCallback(async (cursor: Cursor): Promise<Batch<CatalogEpisode>> => {
    if (!snapshot || !entry || season === null || locked) return { items: [], next: null };
    return catalogClient.episodes(snapshot, entry.id, season, typeof cursor === 'number' ? cursor : 0);
  }, [snapshot, entry, season, locked]);
  const pages = usePages(`${snapshot?.manifest.version}:${entry?.id}:${season}:${locked}`, load);
  if (!snapshot) return <CatalogHome />;
  return <View style={styles.screen}>
    <TopBar active="series" />
    {entry && locked ? <PinGate category={entry.group} onUnlock={() => update({ unlockedCategories: [...session.unlockedCategories, entry.group] })} onCancel={back} /> : <>
      <Title>{entry?.name ?? 'Carregando série…'}</Title>
      {error && <><Body>{error}</Body><FocusCard onPress={() => setRetry((n) => n + 1)}><Body>Tentar novamente</Body></FocusCard></>}
      <View style={{ height: 90 }}><ScrollView horizontal contentContainerStyle={{ gap: 12, padding: 8 }}>
        {entry?.seasons?.map((s) => <FocusCard key={s.season} selected={season === s.season} onPress={() => setSeason(s.season)}><Body>Temporada {s.season} · {s.count} episódios</Body></FocusCard>)}
      </ScrollView></View>
      {pages.error && <Body>{pages.error}</Body>}
      <View style={{ flex: 1 }}><FlatList key={`${season}-${pages.block}`} data={pages.items} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={3} extraData={positions} keyExtractor={(e) => e.id}
        renderItem={({ item, index }) => <FocusCard autoFocus={index === 0} style={{ marginVertical: 6 }}
          onFocus={() => { if (index >= pages.items.length - 4 && pages.items.length < MAX_VISIBLE && !pages.busy && !pages.error) pages.more(); }}
          onPress={() => { if (entry && !isGroupLocked(entry.group, store.getState().blockedCategories, session.unlockedCategories)) go({ name: 'player', url: item.url, sources: item.sources, title: `${entry.name} · T${item.season} E${item.episode}`, id: item.id, isLive: false }); }}>
          <Body>{item.episode}. {item.title}</Body>{positions[item.id] ? <Body muted>Parou em {formatClock(positions[item.id] ?? 0)}</Body> : null}
        </FocusCard>}
        ListEmptyComponent={<Body>{pages.busy ? 'Carregando episódios…' : 'Nenhum episódio nesta temporada.'}</Body>} /></View>
      <View style={{ flexDirection: 'row', gap: 20 }}>
        {pages.next !== null && <FocusCard onPress={pages.more}><Body>{pages.busy ? 'Carregando…' : pages.error ? 'Tentar novamente' : 'Mais episódios'}</Body></FocusCard>}
        <FocusCard onPress={pages.restart}><Body>Voltar ao começo</Body></FocusCard>
      </View>
    </>}
  </View>;
}
