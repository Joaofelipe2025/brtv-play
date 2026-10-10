import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, ScrollView, TVEventHandler, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  Poppins_300Light,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import QRCode from 'react-native-qrcode-svg';
import { FlashList } from '@shopify/flash-list';
import Video, { type OnVideoErrorData } from 'react-native-video';
import { useStore } from 'zustand';
import {
  ACTIVATION_URL,
  freeTvPlaybackIssue,
  parseFreeTvChannels,
  currentAndNext,
  daysLeft,
  loadOrCreateDevice,
  parseM3u,
  colors,
  type DeviceIdentity,
  type DeviceStatus,
  type EpgIndex,
  type M3uChannel,
  type Playlist,
} from '@brtv/core';
import { asyncAdapter, store } from './platform';
import { backend } from './backend';
import { Body, FocusCard, Logo, Text, Title, styles } from './ui';

type Screen =
  | { name: 'home' }
  | { name: 'live' }
  | { name: 'settings' }
  | { name: 'player'; index: number };

const MAX_RECONNECT_ATTEMPTS = 3;
const POLL_MS = 10_000;
/** EPG ainda não carregado no Android nesta versão. */
const NO_EPG: EpgIndex = new Map();

export default function App() {
  const [fontsLoaded] = useFonts({
    Poppins_300Light,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [device, setDevice] = useState<DeviceIdentity | null>(null);
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [channels, setChannels] = useState<M3uChannel[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [catalogNotice, setCatalogNotice] = useState<string | null>(null);

  useEffect(() => {
    void loadOrCreateDevice(asyncAdapter).then(setDevice);
    void store.hydrate();
  }, []);

  // Voltar: player → live → home; em home o Android fecha o app
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen.name === 'player') {
        setScreen({ name: 'live' });
        return true;
      }
      if (screen.name === 'live' || screen.name === 'settings') {
        setScreen({ name: 'home' });
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen]);

  // Ativação: polling a cada 10s até existir playlist
  useEffect(() => {
    if (!device || playlist) return;
    let cancelled = false;
    let checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const s = await backend.getDeviceStatus(device.mac, device.key);
        if (cancelled) return;
        setLoadError(null);
        setCatalogNotice(backend.notice);
        setStatus(s);
        const first = s.playlists[0];
        if (first) setPlaylist(first);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Falha ao carregar canais. Tentaremos novamente.');
      } finally {
        checking = false;
      }
    };
    void check();
    const id = setInterval(() => void check(), POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [device, playlist]);

  useEffect(() => {
    if (playlist?.kind === 'm3u') {
      setChannels(playlist.id === 'free-tv' ? parseFreeTvChannels(playlist.content) : parseM3u(playlist.content));
    }
  }, [playlist]);

  // Espera as fontes para não piscar a família do sistema
  if (!fontsLoaded) return null;

  if (!playlist) {
    return <ActivationView device={device} status={status} error={loadError} />;
  }

  if (screen.name === 'home') {
    return (
      <HomeView
        playlistName={playlist.name}
        notice={catalogNotice}
        onLive={() => setScreen({ name: 'live' })}
        onSettings={() => setScreen({ name: 'settings' })}
      />
    );
  }

  if (screen.name === 'settings') {
    return (
      <SettingsView
        device={device}
        onReload={() => {
          // Volta à ativação: ela consulta o servidor de novo e recarrega a playlist
          setPlaylist(null);
          setChannels([]);
          setLoadError(null);
          setScreen({ name: 'home' });
        }}
      />
    );
  }

  if (screen.name === 'live') {
    return <LiveView channels={channels} onPlay={(index) => setScreen({ name: 'player', index })} />;
  }

  const current = channels[screen.index];
  if (!current) {
    return <LiveView channels={channels} onPlay={(index) => setScreen({ name: 'player', index })} />;
  }

  return (
    <PlayerView
      channel={current}
      index={screen.index}
      total={channels.length}
      onChannel={(delta) => {
        if (channels.length === 0) return;
        const next = (screen.index + delta + channels.length) % channels.length;
        setScreen({ name: 'player', index: next });
      }}
    />
  );
}

function ActivationView({ device, status, error }: { device: DeviceIdentity | null; status: DeviceStatus | null; error: string | null }) {
  const statusText = !status
    ? 'Verificando…'
    : status.status === 'trial'
      ? `Trial: ${daysLeft(status.expiresAt)} dias`
      : status.status === 'active'
        ? 'Ativo'
        : 'Expirado';

  return (
    <View style={[styles.screen, { flexDirection: 'row', gap: 64, alignItems: 'center' }]}>
      <StatusBar style="light" />
      <View style={{ flex: 1 }}>
        <Logo height={96} />
        <Title>Ative seu aparelho</Title>
        <FocusCard autoFocus style={{ marginBottom: 16 }}>
          <Body muted>MAC</Body>
          <Text style={{ color: colors.textPrimary, fontSize: 56, fontWeight: '700' }}>{device?.mac ?? '—'}</Text>
        </FocusCard>
        <FocusCard>
          <Body muted>Device Key</Body>
          <Text style={{ color: colors.textPrimary, fontSize: 56, fontWeight: '700' }}>{device?.key ?? '—'}</Text>
        </FocusCard>
        <Body>
          Portal: <Text style={styles.brand}>{ACTIVATION_URL}</Text>
        </Body>
        <Body>Status: {statusText}</Body>
        {status?.status !== 'expired' && <Body>{error ?? 'Carregando canais Free-TV…'}</Body>}
      </View>
      <View style={{ alignItems: 'center' }}>
        {device && (
          <View style={{ backgroundColor: '#fff', padding: 16, borderRadius: 12 }}>
            <QRCode value={`${ACTIVATION_URL}?mac=${encodeURIComponent(device.mac)}`} size={300} />
          </View>
        )}
        <Body muted>Escaneie para ativar</Body>
      </View>
    </View>
  );
}

function HomeView({
  playlistName,
  notice,
  onLive,
  onSettings,
}: {
  playlistName: string;
  notice: string | null;
  onLive(): void;
  onSettings(): void;
}) {
  const favCount = useStore(store, (s) => s.favorites.length);
  const tile = { width: 420, height: 220, justifyContent: 'flex-end' as const };
  return (
    <View style={styles.screen}>
      <View style={styles.row}>
        <Logo height={60} />
        <Body muted>{playlistName}</Body>
      </View>
      {notice && <Body>{notice}</Body>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24, marginTop: 48 }}>
        <FocusCard autoFocus onPress={onLive} style={tile}>
          <Title>TV ao Vivo</Title>
          <Body muted>Canais e guia de programação</Body>
        </FocusCard>
        <FocusCard onPress={onLive} style={tile}>
          <Title>Favoritos</Title>
          <Body muted>{favCount} marcado(s)</Body>
        </FocusCard>
        <FocusCard style={tile}>
          <Title>Filmes</Title>
          <Body muted>Pendente nesta versão</Body>
        </FocusCard>
        <FocusCard style={tile}>
          <Title>Séries</Title>
          <Body muted>Pendente nesta versão</Body>
        </FocusCard>
        <FocusCard onPress={onSettings} style={tile}>
          <Title>Configurações</Title>
          <Body muted>Aparelho e reprodução</Body>
        </FocusCard>
      </View>
    </View>
  );
}

function LiveView({ channels, onPlay }: { channels: M3uChannel[]; onPlay: (index: number) => void }) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const favorites = useStore(store, (s) => s.favorites);
  const current = channels[focusedIndex];
  const now = current ? currentAndNext(NO_EPG, current.tvgId ?? current.id, Date.now()) : null;

  return (
    <View style={[styles.screen, { flexDirection: 'row', gap: 24, padding: 32 }]}>
      <View style={{ flex: 1 }}>
        <FlashList
          data={channels}
          keyExtractor={(c) => c.id}
          estimatedItemSize={92}
          renderItem={({ item, index }) => (
            <FocusCard
              autoFocus={index === 0}
              selected={favorites.includes(item.id)}
              onPress={() => onPlay(index)}
              onFocus={() => setFocusedIndex(index)}
              style={{ marginBottom: 8 }}
            >
              <Text style={{ color: colors.textPrimary, fontSize: 28 }}>
                {index + 1}. {item.name}
              </Text>
            </FocusCard>
          )}
        />
      </View>
      <View style={[styles.card, { width: 560 }]}>
        <Title>{current?.name ?? 'Nenhum canal'}</Title>
        <Body muted>{current?.group}</Body>
        <Body>{now?.current?.title ?? 'Sem informação de guia (EPG)'}</Body>
        {now?.next && <Body muted>Próximo: {now.next.title}</Body>}
        <FocusCard onPress={() => onPlay(focusedIndex)} style={{ marginTop: 16 }}>
          <Body>▶ Assistir</Body>
        </FocusCard>
        <FocusCard onPress={() => current && store.getState().toggleFavorite(current.id)} style={{ marginTop: 12 }}>
          <Body>{current && favorites.includes(current.id) ? '★ Remover dos favoritos' : '☆ Favoritar'}</Body>
        </FocusCard>
      </View>
    </View>
  );
}

function PlayerView({
  channel,
  index,
  total,
  onChannel,
}: {
  channel: M3uChannel;
  index: number;
  total: number;
  onChannel(delta: number): void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const retries = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const playbackIssue = freeTvPlaybackIssue(channel.url);

  // Reinicia contadores quando o canal muda
  useEffect(() => {
    retries.current = 0;
    setFailed(false);
    setAttempt(0);
  }, [channel.id]);

  useEffect(() => {
    setShowInfo(true);
    const t = setTimeout(() => setShowInfo(false), 5000);
    return () => clearTimeout(t);
  }, [channel.id, attempt]);

  useEffect(
    () => () => {
      if (retryTimer.current !== undefined) clearTimeout(retryTimer.current);
    },
    [],
  );

  // Reconexão com backoff: 1s, 2s, 4s; depois mostra erro
  const onError = useCallback((_e: OnVideoErrorData) => {
    if (retries.current >= MAX_RECONNECT_ATTEMPTS) {
      setFailed(true);
      return;
    }
    const delay = 1000 * 2 ** retries.current;
    retries.current += 1;
    retryTimer.current = setTimeout(() => setAttempt((a) => a + 1), delay);
  }, []);

  useEffect(() => {
    // Os tipos do react-native-tvos não expõem o construtor de TVEventHandler; o cast isola isso aqui
    const TVEventHandlerClass = TVEventHandler as unknown as new () => {
      enable(cmp: unknown, cb: (cmp: unknown, evt: { eventType?: string }) => void): void;
      disable(): void;
    };
    const handler = new TVEventHandlerClass();
    handler.enable(undefined, (_cmp, evt) => {
      if (evt.eventType === 'up') onChannel(1);
      if (evt.eventType === 'down') onChannel(-1);
    });
    return () => handler.disable();
  }, [onChannel]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {!failed && !playbackIssue && (
        <Video
          key={`${channel.id}-${attempt}`}
          source={{ uri: channel.url }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          resizeMode="contain"
          onError={onError}
          bufferConfig={{
            minBufferMs: 2000,
            maxBufferMs: 15000,
            bufferForPlaybackMs: 1000,
            bufferForPlaybackAfterRebufferMs: 2000,
          }}
        />
      )}
      {(failed || playbackIssue) && (
        <View style={[styles.screen, { justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.85)' }]}>
          <Title>Não foi possível reproduzir</Title>
          <Body muted>{playbackIssue ?? 'Verifique a conexão e tente outro canal. A transmissão pode estar indisponível ou restrita à região.'}</Body>
        </View>
      )}
      {showInfo && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 32, backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <Text style={[styles.brand, { fontSize: 24 }]}>
            AO VIVO · {index + 1}/{total}
          </Text>
          <Title>{channel.name}</Title>
          <Body muted>CH+ / CH- (cima/baixo) para trocar canal · Voltar para sair</Body>
        </View>
      )}
    </View>
  );
}

function SettingsView({ device, onReload }: { device: DeviceIdentity | null; onReload(): void }) {
  const blocked = useStore(store, (s) => s.blockedCategories);
  return (
    <ScrollView style={styles.screen}>
      <Title>Configurações</Title>
      <FocusCard autoFocus style={{ marginBottom: 16 }}>
        <Body muted>MAC</Body>
        <Body>{device?.mac ?? '—'}</Body>
        <Body muted>Device Key</Body>
        <Body>{device?.key ?? '—'}</Body>
      </FocusCard>
      <FocusCard onPress={onReload} style={{ marginBottom: 16 }}>
        <Body>Recarregar playlist</Body>
      </FocusCard>
      <FocusCard onPress={() => store.setState({ history: [], continueWatching: {} })} style={{ marginBottom: 16 }}>
        <Body>Limpar histórico e cache</Body>
      </FocusCard>
      <Body muted>Categorias bloqueadas: {blocked.length}</Body>
    </ScrollView>
  );
}
