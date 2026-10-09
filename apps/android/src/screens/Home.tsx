import { useMemo, useState } from 'react';
import { Image, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useStore } from 'zustand';
import { colors, currentAndNext, elapsed, formatHour, type LiveItem } from '@brtv/core';
import { store } from '../platform';
import { useApp } from '../navigation';
import { FocusCard, Text, font, styles } from '../ui';
import { TopBar } from '../components/TopBar';
import { Progress, initials, tintFor } from '../components/Artwork';
import { PreviewVideo, useDebounced } from '../components/PreviewVideo';

const RAIL_SIZE = 12;
const CARD_WIDTH = 320;
const THUMB_HEIGHT = Math.round((CARD_WIDTH - 48) * (9 / 16));
const SHADE_STEPS = 8;

/** Sombreamento sem gradiente nativo: faixas empilhadas de `background` com opacidade decrescente. */
function Shade() {
  const steps = Array.from({ length: SHADE_STEPS }, (_, i) => i);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}>
      {steps.map((i) => (
        <View
          key={`l${i}`}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: `${70 - i * (60 / SHADE_STEPS)}%`,
            backgroundColor: colors.background,
            opacity: 0.12,
          }}
        />
      ))}
      {steps.map((i) => (
        <View
          key={`b${i}`}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: `${70 - i * (60 / SHADE_STEPS)}%`,
            backgroundColor: colors.background,
            opacity: 0.14,
          }}
        />
      ))}
    </View>
  );
}

function ChannelThumb({ channel, demo, progress }: { channel: LiveItem; demo: boolean; progress: number | null }) {
  const [failed, setFailed] = useState(false);
  const logo = channel.logo && !failed ? channel.logo : null;
  return (
    <View
      style={{
        width: CARD_WIDTH - 48,
        height: THUMB_HEIGHT,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: colors.surfaceElevated,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: tintFor(channel.name), opacity: 0.18 }}
      />
      {logo ? (
        <Image
          source={{ uri: logo }}
          resizeMode="contain"
          style={{ width: '60%', height: '60%' }}
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={{ color: tintFor(channel.name), fontSize: 48, fontFamily: font.bold }}>{initials(channel.name, 2)}</Text>
      )}
      {demo && (
        <View style={{ position: 'absolute', top: 8, right: 8, backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 2 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 24, fontFamily: font.semibold }}>DEMO</Text>
        </View>
      )}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 10,
          paddingVertical: 4,
          backgroundColor: 'rgba(6,8,11,0.7)',
        }}
      >
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger }} />
        <Text style={{ color: colors.textPrimary, fontSize: 24, fontFamily: font.semibold }}>AO VIVO</Text>
        {progress !== null && (
          <View style={{ flex: 1 }}>
            <Progress value={progress} />
          </View>
        )}
      </View>
    </View>
  );
}

export function Home() {
  const { session, go } = useApp();
  const history = useStore(store, (s) => s.history);
  const live = useMemo(() => session.library?.live ?? [], [session.library]);
  const isDemo = session.playlist?.id === 'demo';
  const now = Date.now();

  // Destaque inicial: último canal assistido; sem histórico, o primeiro da lista
  const lastLiveId = history.find((h) => h.type === 'live')?.id;
  const initial = live.find((c) => c.url === lastLiveId || c.id === lastLiveId) ?? live[0] ?? null;
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // O destaque segue o card focado, com um pequeno atraso para não piscar ao percorrer
  const heroId = useDebounced(focusedId, 250);
  const hero = live.find((c) => c.id === heroId) ?? initial;
  const heroIndex = hero ? live.indexOf(hero) : -1;
  const heroEpg = hero ? currentAndNext(session.epg, hero.epgId ?? hero.id, now) : null;

  // Trilho: o destaque primeiro, depois os demais
  const rail = useMemo(() => {
    const first = initial ? [initial] : [];
    return [...first, ...live.filter((c) => c !== initial)].slice(0, RAIL_SIZE);
  }, [live, initial]);

  const watch = (channel: LiveItem) =>
    go({ name: 'player', url: channel.url, title: channel.name, isLive: true, channels: live, index: live.indexOf(channel) });

  const title = heroEpg?.current?.title ?? hero?.name ?? 'Sua TV, do seu jeito';
  const subtitle =
    heroEpg?.current?.description ??
    (hero ? `Ao vivo agora em ${hero.group}.` : session.loading ? 'Carregando sua lista…' : 'Nenhum canal nesta lista ainda.');
  const meta = hero
    ? `${hero.group}${
        heroEpg?.current
          ? ` • ${formatHour(heroEpg.current.start)} às ${formatHour(heroEpg.current.stop)}`
          : heroIndex >= 0
            ? ` • Canal ${heroIndex + 1}`
            : ''
      }`
    : '';

  return (
    <View style={styles.screen}>
      {/* Fundo: o próprio canal ao vivo, sem som */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}>
        <View style={{ flex: 1, backgroundColor: tintFor(hero?.name ?? 'brtv'), opacity: 0.12 }} />
        <PreviewVideo url={hero?.url ?? null} delay={400} />
        <Shade />
      </View>

      <TopBar active="home" />

      <View style={{ flex: 1, justifyContent: 'center', maxWidth: '62%' }}>
        {hero && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginBottom: 12 }}>
            <View style={{ backgroundColor: colors.danger, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 2 }}>
              <Text style={{ color: colors.white, fontSize: 24, fontFamily: font.bold }}>AO VIVO</Text>
            </View>
            <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: 28, fontFamily: font.medium, flexShrink: 1 }}>
              {hero.name}
            </Text>
          </View>
        )}
        <Text numberOfLines={2} style={{ color: colors.textPrimary, fontSize: 56, fontFamily: font.bold }}>
          {title}
        </Text>
        <Text numberOfLines={2} style={{ color: colors.textSecondary, fontSize: 26, marginTop: 8 }}>
          {subtitle}
        </Text>
        {hero && (
          <>
            <View style={{ flexDirection: 'row', gap: 24, marginTop: 28 }}>
              <FocusCard autoFocus onPress={() => watch(hero)}>
                <Text style={{ color: colors.accent, fontSize: 30, fontFamily: font.semibold }}>Assistir agora</Text>
              </FocusCard>
              <FocusCard onPress={() => go({ name: 'live', category: hero.group })}>
                <Text style={{ color: colors.textPrimary, fontSize: 30, fontFamily: font.medium }}>Guia de TV</Text>
              </FocusCard>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 26, marginTop: 20 }}>{meta}</Text>
          </>
        )}
      </View>

      {rail.length > 0 && (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 32, fontFamily: font.semibold }}>Seus canais</Text>
            <FocusCard onPress={() => go({ name: 'live' })}>
              <Text style={{ color: colors.textPrimary, fontSize: 26, fontFamily: font.medium }}>Ver todos ›</Text>
            </FocusCard>
          </View>
          <View style={{ height: THUMB_HEIGHT + 48 + 80 }}>
            <FlashList
              horizontal
              data={rail}
              extraData={session.epg}
              estimatedItemSize={CARD_WIDTH + 16}
              keyExtractor={(c) => c.id}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item: c }) => {
                const epg = currentAndNext(session.epg, c.epgId ?? c.id, now).current;
                return (
                  <FocusCard
                    style={{ width: CARD_WIDTH, marginRight: 16 }}
                    onFocus={() => setFocusedId(c.id)}
                    onPress={() => watch(c)}
                  >
                    <ChannelThumb channel={c} demo={isDemo} progress={epg ? elapsed(epg.start, epg.stop, now) : null} />
                    <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: 26, fontFamily: font.medium, marginTop: 10 }}>
                      {c.name}
                    </Text>
                    <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 24 }}>
                      {epg?.title ?? c.group}
                    </Text>
                  </FocusCard>
                );
              }}
            />
          </View>
        </View>
      )}

      <Text style={{ color: colors.textSecondary, fontSize: 24, marginTop: 8 }}>OK Selecionar  •  Voltar</Text>
    </View>
  );
}
