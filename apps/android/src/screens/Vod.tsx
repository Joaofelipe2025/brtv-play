import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useStore } from 'zustand';
import {
  colors,
  firstUnlockedGroup,
  formatClock,
  isGroupLocked,
  loadSeasons,
  unlockedItems,
  type EpisodeItem,
} from '@brtv/core';
import { store } from '../platform';
import { useApp, type Route } from '../navigation';
import { FocusCard, Text, font, styles } from '../ui';
import { TopBar } from '../components/TopBar';
import { Poster, tintFor } from '../components/Artwork';
import { PinGate } from '../components/PinGate';

const COLUMNS = 6;
const SCREEN_PADDING = 48;
const CELL_MARGIN = 6;
const CELL_PADDING = 8;
const CAPTION_HEIGHT = 40;
const SHADE_STEPS = 6;

interface Entry {
  id: string;
  name: string;
  group: string;
  poster?: string;
  /** Linha de apoio no destaque (ex.: "2 temporadas"). */
  detail?: string;
  onOpen(): void;
}

function seasonsLabel(count: number): string {
  return count === 1 ? '1 temporada' : `${count} temporadas`;
}

const fill = { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } as const;

/**
 * Imagem do item focado à direita, atrás do conteúdo, escurecida por camadas de `background`.
 * Sem imagem: só um bloco suave no tom do título (uma arte gerada em tela cheia teria bordas duras).
 */
function Backdrop({ src, title }: { src?: string | undefined; title: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = Boolean(src) && failed !== src;
  const steps = Array.from({ length: SHADE_STEPS }, (_, i) => i);
  return (
    <View pointerEvents="none" style={fill}>
      {showImage ? (
        <View style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '60%' }}>
          <Image
            source={{ uri: src }}
            resizeMode="cover"
            style={{ width: '100%', height: '100%' }}
            onError={() => setFailed(src ?? null)}
          />
          <View style={{ ...fill, backgroundColor: colors.background, opacity: 0.55 }} />
          {steps.map((i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${(i * 100) / SHADE_STEPS / 2}%`,
                width: `${100 / SHADE_STEPS / 2 + 0.5}%`,
                backgroundColor: colors.background,
                opacity: 0.9 - (i * 0.9) / SHADE_STEPS,
              }}
            />
          ))}
        </View>
      ) : (
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '60%',
            height: '55%',
            backgroundColor: tintFor(title),
            opacity: 0.08,
          }}
        />
      )}
    </View>
  );
}

/**
 * Navegador de VOD: destaque do item focado, categorias em pílulas, busca e grade de pôsteres.
 * A categoria fica na rota, então voltar do player devolve a mesma grade.
 */
function VodBrowser({
  title,
  entries,
  category,
  routeName,
}: {
  title: string;
  entries: Entry[];
  category?: string | undefined;
  routeName: 'movies' | 'series';
}) {
  const { session, update, replace } = useApp();
  const { width } = useWindowDimensions();
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
    (category !== undefined && groups.includes(category) ? category : null) ??
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

  // Foco inicial no primeiro pôster: vale até algum pôster receber foco de verdade
  // (o FlashList só monta os itens após o layout).
  const initialFocus = useRef(true);
  const settleFocus = () => {
    initialFocus.current = false;
  };

  const cellWidth = (width - SCREEN_PADDING * 2) / COLUMNS;
  const posterWidth = Math.floor(cellWidth - CELL_MARGIN * 2 - CELL_PADDING * 2);
  const cellHeight = Math.round(posterWidth * 1.5) + CAPTION_HEIGHT + CELL_PADDING * 2 + CELL_MARGIN * 2;

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
      <View style={styles.screen}>
        <TopBar active={routeName} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 36, fontFamily: font.semibold }}>
            {session.loading ? 'Carregando…' : `Nenhum título em ${title}`}
          </Text>
          {!session.loading && (
            <Text style={{ color: colors.textSecondary, fontSize: 26, textAlign: 'center', maxWidth: 1100 }}>
              Listas M3U trazem filmes e séries quando usam grupos como “Filmes | Ação” ou “Séries | Drama”. Contas
              Xtream trazem o catálogo completo.
            </Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {focused && <Backdrop src={focused.poster} title={focused.name} />}
      <TopBar active={routeName} />

      {gate ? (
        <PinGate
          category={gate}
          onUnlock={() => {
            update({ unlockedCategories: [...unlocked, gate] });
            replace({ name: routeName, category: gate } as Route);
            initialFocus.current = true;
            setPending(null);
          }}
          onCancel={() => {
            initialFocus.current = true;
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
          <View style={{ height: 150, justifyContent: 'center', gap: 6 }}>
            <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: 48, fontFamily: font.bold }}>
              {focused?.name ?? title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 }}>
              <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 26, flexShrink: 1 }}>
                {focused?.group}
                {focused?.detail ? `, ${focused.detail}` : ''}
              </Text>
              {resumeAt ? (
                <Text style={{ color: colors.accent, fontSize: 26, fontFamily: font.medium }}>
                  Continuar de {formatClock(resumeAt)}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 8 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flex: 1 }}
              contentContainerStyle={{ gap: 12, paddingVertical: 8, paddingHorizontal: 12 }}
            >
              {groups.map((g) => (
                <FocusCard
                  key={g}
                  autoFocus={visible.length === 0 && initialFocus.current && g === activeGroup}
                  selected={g === activeGroup && !query}
                  style={{ paddingVertical: 10, paddingHorizontal: 22 }}
                  onPress={() => choose(g)}
                >
                  <Text
                    style={{
                      color: g === activeGroup && !query ? colors.accent : colors.textPrimary,
                      fontSize: 26,
                      fontFamily: font.medium,
                    }}
                  >
                    {blocked.includes(g) ? `${g} (bloqueada)` : g}
                  </Text>
                </FocusCard>
              ))}
            </ScrollView>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar título"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel={`Buscar em ${title}`}
              returnKeyType="search"
              style={{
                width: 360,
                color: colors.textPrimary,
                fontSize: 26,
                fontFamily: font.regular,
                backgroundColor: colors.surface,
                borderRadius: 16,
                borderWidth: 3,
                borderColor: colors.surfaceElevated,
                paddingHorizontal: 20,
                paddingVertical: 10,
              }}
            />
          </View>

          <View style={{ flex: 1 }}>
            {visible.length === 0 ? (
              query.trim() ? (
                <Text style={{ color: colors.textSecondary, fontSize: 26, marginTop: 40 }}>
                  Nada encontrado para “{query}”.
                </Text>
              ) : null
            ) : (
              <FlashList
                data={visible}
                numColumns={COLUMNS}
                estimatedItemSize={cellHeight}
                keyExtractor={(e) => e.id}
                renderItem={({ item, index }) => (
                  <FocusCard
                    autoFocus={index === 0 && initialFocus.current}
                    style={{ margin: CELL_MARGIN, padding: CELL_PADDING }}
                    onFocus={() => {
                      settleFocus();
                      setFocusedId(item.id);
                    }}
                    onPress={item.onOpen}
                  >
                    <Poster src={item.poster} title={item.name} width={posterWidth} />
                    <Text
                      numberOfLines={1}
                      style={{ marginTop: 8, height: CAPTION_HEIGHT - 8, color: colors.textPrimary, fontSize: 24 }}
                    >
                      {item.name}
                    </Text>
                  </FocusCard>
                )}
              />
            )}
          </View>
        </>
      )}
    </View>
  );
}

export function Movies({ category }: { category?: string | undefined }) {
  const { session, go } = useApp();
  const entries = useMemo<Entry[]>(
    () =>
      (session.library?.movies ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        group: m.group,
        ...(m.poster ? { poster: m.poster } : {}),
        onOpen: () => go({ name: 'player', url: m.url, title: m.name, isLive: false, id: m.id }),
      })),
    [session.library, go],
  );
  return <VodBrowser title="Filmes" entries={entries} category={category} routeName="movies" />;
}

export function Series({ category }: { category?: string | undefined }) {
  const { session, go } = useApp();
  const entries = useMemo<Entry[]>(
    () =>
      (session.library?.series ?? []).map((s) => {
        const seasons = s.seasons ? Object.keys(s.seasons).length : 0;
        return {
          id: s.id,
          name: s.name,
          group: s.group,
          ...(s.cover ? { poster: s.cover } : {}),
          ...(seasons ? { detail: seasonsLabel(seasons) } : {}),
          onOpen: () => go({ name: 'seriesDetail', seriesId: s.id }),
        };
      }),
    [session.library, go],
  );
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

  const initialFocus = useRef(true);
  const settleFocus = () => {
    initialFocus.current = false;
  };

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

  if (!entry) {
    return (
      <View style={styles.screen}>
        <TopBar active="series" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 36, fontFamily: font.semibold }}>Série não encontrada</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 26 }}>
            A lista pode ter sido recarregada. Volte e escolha de novo.
          </Text>
        </View>
      </View>
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
    <View style={styles.screen}>
      <Backdrop src={entry.cover} title={entry.name} />
      <TopBar active="series" />

      <View style={{ gap: 6, marginBottom: 12 }}>
        <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: 48, fontFamily: font.bold }}>
          {entry.name}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 26 }}>
          {entry.group}
          {seasonKeys.length ? `, ${seasonsLabel(seasonKeys.length)}` : ''}
        </Text>
        {entry.plot ? (
          <Text numberOfLines={3} style={{ color: colors.textSecondary, fontSize: 24, maxWidth: 1000, marginTop: 6 }}>
            {entry.plot}
          </Text>
        ) : null}
      </View>

      {error && <Text style={{ color: colors.danger, fontSize: 26 }}>{error}</Text>}
      {!seasons && !error && <Text style={{ color: colors.textSecondary, fontSize: 26 }}>Carregando episódios…</Text>}

      {seasons && (
        <>
          <View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingVertical: 8, paddingHorizontal: 12 }}
            >
              {seasonKeys.map((s) => (
                <FocusCard
                  key={s}
                  selected={s === activeSeason}
                  style={{ paddingVertical: 10, paddingHorizontal: 22 }}
                  onPress={() => setSeason(s)}
                >
                  <Text
                    style={{
                      color: s === activeSeason ? colors.accent : colors.textPrimary,
                      fontSize: 26,
                      fontFamily: font.medium,
                    }}
                  >
                    Temporada {s}
                  </Text>
                </FocusCard>
              ))}
            </ScrollView>
          </View>

          <View style={{ flex: 1, maxWidth: 1300 }}>
            <FlashList
              data={episodes}
              extraData={{ positions, activeSeason }}
              estimatedItemSize={104}
              keyExtractor={(ep) => ep.id}
              renderItem={({ item: ep, index }) => {
                const at = positions[ep.id];
                return (
                  <FocusCard
                    autoFocus={index === 0 && initialFocus.current}
                    style={{ height: 96, flexDirection: 'row', alignItems: 'center', gap: 24, marginVertical: 4 }}
                    onFocus={settleFocus}
                    onPress={() => play(ep)}
                  >
                    <Text style={{ width: 72, color: colors.accent, fontSize: 40, fontFamily: font.bold }}>
                      {ep.episode}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: 28, fontFamily: font.medium }}>
                        {ep.title}
                      </Text>
                      {at ? (
                        <Text style={{ color: colors.accent, fontSize: 24 }}>Parou em {formatClock(at)}</Text>
                      ) : null}
                    </View>
                  </FocusCard>
                );
              }}
            />
          </View>
        </>
      )}
    </View>
  );
}
