import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useStore } from 'zustand';
import {
  colors,
  currentAndNext,
  elapsed,
  firstUnlockedGroup,
  formatHour,
  isBrazilChannel,
  isGroupLocked,
  unlockedItems,
  type LiveItem,
} from '@brtv/core';
import { store } from '../platform';
import { FAVORITES, useApp } from '../navigation';
import { FocusCard, Text, font, styles } from '../ui';
import { TopBar } from '../components/TopBar';
import { ChannelLogo, Progress } from '../components/Artwork';
import { PreviewVideo } from '../components/PreviewVideo';
import { PinGate } from '../components/PinGate';

// Tamanhos pensados para ler a 3 metros: projetores reduzem o 1920×1080 para um painel de baixa resolução
const ROW_HEIGHT = 132;
const CATEGORY_HEIGHT = 96;
const LOGO_SIZE = 92;

/** Categoria virtual com os canais brasileiros (guardada na rota como `category`, como FAVORITES). */
const BRASIL = '__brasil__';

interface CategoryEntry {
  key: string;
  name: string;
  label: string;
  count: string;
}

export function Live({ category }: { category?: string }) {
  const { session, update, go, replace } = useApp();
  const favorites = useStore(store, (s) => s.favorites);
  const blocked = useStore(store, (s) => s.blockedCategories);
  const live = useMemo(() => session.library?.live ?? [], [session.library]);
  const now = Date.now();

  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of live) counts.set(c.group, (counts.get(c.group) ?? 0) + 1);
    return Array.from(counts, ([name, count]) => ({ name, count }));
  }, [live]);

  const unlocked = session.unlockedCategories;
  const isLocked = (group: string) => group !== FAVORITES && group !== BRASIL && isGroupLocked(group, blocked, unlocked);

  // Canais brasileiros de qualquer grupo. A categoria "Brasil" nunca pede PIN, mas, como em
  // Favoritos, não mostra canais de grupos bloqueados que ainda não foram liberados
  const brazilChannels = useMemo(
    () =>
      unlockedItems(
        live.filter((c) => isBrazilChannel({ group: c.group, epgId: c.epgId })),
        blocked,
        unlocked,
      ),
    [live, blocked, unlocked],
  );

  // Categoria da rota só vale se ainda existe (a lista pode ter sido recarregada);
  // sem ela, a primeira categoria que não pede PIN
  const routeGroup =
    category === FAVORITES ||
    (category === BRASIL && brazilChannels.length > 0) ||
    (category !== undefined && groups.some((g) => g.name === category))
      ? category
      : undefined;
  const selectedGroup =
    routeGroup ??
    firstUnlockedGroup(
      groups.map((g) => g.name),
      blocked,
      unlocked,
    );
  // Categoria bloqueada vinda da rota (ex.: "Guia de TV" da Início): pede o PIN antes de mostrar
  const selectedLocked = selectedGroup !== null && isLocked(selectedGroup);
  const [pendingGroup, setPendingGroup] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const gateGroup = pendingGroup ?? (selectedLocked ? selectedGroup : null);

  // A tela é reaproveitada quando a rota troca de categoria: um PIN pendente não sobrevive à troca
  useEffect(() => setPendingGroup(null), [category]);

  // Favoritos de categorias bloqueadas só aparecem depois do PIN
  const favoriteChannels = useMemo(
    () =>
      unlockedItems(
        live.filter((c) => favorites.includes(c.id)),
        blocked,
        unlocked,
      ),
    [live, favorites, blocked, unlocked],
  );

  const channels: LiveItem[] = useMemo(() => {
    if (selectedGroup === FAVORITES) return favoriteChannels;
    if (selectedGroup === BRASIL) return brazilChannels;
    if (!selectedGroup || selectedLocked) return [];
    return live.filter((c) => c.group === selectedGroup);
  }, [live, selectedGroup, selectedLocked, favoriteChannels, brazilChannels]);

  const preview = channels.find((c) => c.id === selectedId) ?? channels[0] ?? null;
  const previewEpg = preview ? currentAndNext(session.epg, preview.epgId ?? preview.id, now) : null;

  // Foco inicial: vale até algum item da lista receber foco de verdade (o FlashList só monta
  // as linhas após o layout). Depois disso, trocar de categoria não rouba o foco da coluna.
  const initialFocus = useRef(true);
  const settleFocus = () => {
    initialFocus.current = false;
  };

  const categories = useMemo<CategoryEntry[]>(
    () => [
      { key: FAVORITES, name: FAVORITES, label: 'Favoritos', count: String(favoriteChannels.length) },
      ...(brazilChannels.length > 0
        ? [{ key: BRASIL, name: BRASIL, label: 'Brasil', count: String(brazilChannels.length) }]
        : []),
      ...groups.map((g) => ({
        key: `g:${g.name}`,
        name: g.name,
        label: g.name,
        count: blocked.includes(g.name) ? 'Bloqueada' : String(g.count),
      })),
    ],
    [groups, favoriteChannels.length, brazilChannels.length, blocked],
  );

  const chooseGroup = (group: string) => {
    if (isLocked(group)) {
      setPendingGroup(group);
      return;
    }
    setPendingGroup(null);
    setSelectedId(null);
    // Guarda a categoria na rota: ao voltar do player, a lista é a mesma
    replace({ name: 'live', category: group });
  };

  const play = (channel: LiveItem) =>
    go({
      name: 'player',
      url: channel.url,
      title: channel.name,
      isLive: true,
      channels,
      index: channels.indexOf(channel),
    });

  const tab = selectedGroup === FAVORITES ? 'favorites' : 'live';

  if (live.length === 0) {
    return (
      <View style={styles.screen}>
        <TopBar active={tab} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 36, fontFamily: font.semibold }}>
            {session.loading ? 'Carregando canais…' : 'Nenhum canal nesta lista'}
          </Text>
          {!session.loading && (
            <Text style={{ color: colors.textSecondary, fontSize: 26 }}>
              Confira a lista no portal ou recarregue em Configurações.
            </Text>
          )}
        </View>
      </View>
    );
  }

  const isFav = preview ? favorites.includes(preview.id) : false;

  return (
    <View style={styles.screen}>
      <TopBar active={tab} />
      {session.libraryNotice !== null && (
        <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 24, marginBottom: 12 }}>
          {session.libraryNotice}
        </Text>
      )}
      <View style={{ flex: 1, flexDirection: 'row', gap: 24 }}>
        {/* Categorias */}
        <View style={{ flex: 1 }}>
          <FlashList
            data={categories}
            extraData={selectedGroup}
            estimatedItemSize={CATEGORY_HEIGHT}
            keyExtractor={(c) => c.key}
            renderItem={({ item, index }) => (
              <FocusCard
                autoFocus={index === 0 && initialFocus.current && channels.length === 0 && !gateGroup}
                selected={selectedGroup === item.name}
                onFocus={settleFocus}
                style={{
                  height: CATEGORY_HEIGHT - 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  paddingVertical: 8,
                }}
                onPress={() => chooseGroup(item.name)}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    flexShrink: 1,
                    color: selectedGroup === item.name ? colors.accent : colors.textPrimary,
                    fontSize: 32,
                    fontFamily: font.medium,
                  }}
                >
                  {item.label}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 28 }}>{item.count}</Text>
              </FocusCard>
            )}
          />
        </View>

        {/* Canais */}
        <View style={{ flex: 2.4 }}>
          {gateGroup ? (
            <PinGate
              category={gateGroup}
              onUnlock={() => {
                update({ unlockedCategories: [...unlocked, gateGroup] });
                replace({ name: 'live', category: gateGroup });
                initialFocus.current = true;
                setPendingGroup(null);
              }}
              onCancel={() => {
                initialFocus.current = true;
                setPendingGroup(null);
                // Cancelou o PIN da categoria da rota: volta para a primeira que não pede PIN
                if (!pendingGroup) {
                  const fallback = firstUnlockedGroup(
                    groups.map((g) => g.name),
                    blocked,
                    unlocked,
                  );
                  replace(fallback ? { name: 'live', category: fallback } : { name: 'live' });
                }
              }}
            />
          ) : channels.length === 0 ? (
            <View style={{ marginTop: 80, alignItems: 'center', gap: 12 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 40, fontFamily: font.semibold }}>
                {selectedGroup === FAVORITES ? 'Nenhum favorito ainda' : 'Categoria vazia'}
              </Text>
              {selectedGroup === FAVORITES && (
                <Text style={{ color: colors.textSecondary, fontSize: 30, textAlign: 'center' }}>
                  Escolha um canal e aperte “Favoritar” para ele aparecer aqui.
                </Text>
              )}
            </View>
          ) : (
            <FlashList
              data={channels}
              extraData={{ selected: preview?.id, favorites, epg: session.epg }}
              estimatedItemSize={ROW_HEIGHT}
              keyExtractor={(c) => c.id}
              renderItem={({ item: channel, index }) => {
                const epg = currentAndNext(session.epg, channel.epgId ?? channel.id, now).current;
                return (
                  <FocusCard
                    autoFocus={index === 0 && initialFocus.current}
                    selected={preview?.id === channel.id}
                    style={{ height: ROW_HEIGHT - 8, flexDirection: 'row', alignItems: 'center', gap: 20, paddingVertical: 8 }}
                    onFocus={() => {
                      settleFocus();
                      setSelectedId(channel.id);
                    }}
                    onPress={() => play(channel)}
                  >
                    <Text style={{ width: 68, color: colors.textSecondary, fontSize: 32, fontFamily: font.medium }}>{index + 1}</Text>
                    <ChannelLogo src={channel.logo} name={channel.name} size={LOGO_SIZE} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: 38, fontFamily: font.medium }}>
                        {favorites.includes(channel.id) ? '★ ' : ''}
                        {channel.name}
                      </Text>
                      {epg && (
                        <>
                          <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 28 }}>
                            {epg.title}
                          </Text>
                          <Progress value={elapsed(epg.start, epg.stop, now)} />
                        </>
                      )}
                    </View>
                  </FocusCard>
                );
              }}
            />
          )}
        </View>

        {/* Prévia */}
        <View style={{ flex: 1.6 }}>
          {preview && (
            <>
              <View
                style={{
                  width: '100%',
                  aspectRatio: 16 / 9,
                  borderRadius: 16,
                  overflow: 'hidden',
                  backgroundColor: colors.surfaceElevated,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ChannelLogo src={preview.logo} name={preview.name} size={LOGO_SIZE} />
                <PreviewVideo url={preview.url} />
                <View
                  style={{
                    position: 'absolute',
                    top: 12,
                    left: 12,
                    backgroundColor: colors.danger,
                    borderRadius: 8,
                    paddingHorizontal: 14,
                    paddingVertical: 2,
                  }}
                >
                  <Text style={{ color: colors.white, fontSize: 28, fontFamily: font.bold }}>Ao vivo</Text>
                </View>
              </View>

              <View style={{ marginTop: 20, gap: 6 }}>
                <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: 44, fontFamily: font.semibold }}>
                  {preview.name}
                </Text>
                <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 30 }}>
                  {preview.group}
                </Text>
              </View>

              <View style={{ marginTop: 16, gap: 8 }}>
                {previewEpg?.current ? (
                  <>
                    <Text style={{ color: colors.accent, fontSize: 28, fontFamily: font.medium }}>
                      Agora, das {formatHour(previewEpg.current.start)} às {formatHour(previewEpg.current.stop)}
                    </Text>
                    <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: 34, fontFamily: font.semibold }}>
                      {previewEpg.current.title}
                    </Text>
                    <Progress value={elapsed(previewEpg.current.start, previewEpg.current.stop, now)} />
                  </>
                ) : (
                  <Text style={{ color: colors.textSecondary, fontSize: 30 }}>Sem guia de programação para este canal</Text>
                )}
                {previewEpg?.next && (
                  <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 28, marginTop: 8 }}>
                    A seguir, {formatHour(previewEpg.next.start)}: {previewEpg.next.title}
                  </Text>
                )}
              </View>

              {/* Com a coluna mais estreita e o texto maior, o segundo botão desce para a linha de baixo em vez de vazar */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginTop: 'auto' }}>
                <FocusCard onPress={() => play(preview)}>
                  <Text style={{ color: colors.accent, fontSize: 32, fontFamily: font.semibold }}>Assistir</Text>
                </FocusCard>
                <FocusCard onPress={() => store.getState().toggleFavorite(preview.id)}>
                  <Text style={{ color: colors.textPrimary, fontSize: 32, fontFamily: font.medium }}>
                    {isFav ? 'Remover dos favoritos' : 'Favoritar'}
                  </Text>
                </FocusCard>
              </View>
            </>
          )}
        </View>
      </View>
    </View>
  );
}
