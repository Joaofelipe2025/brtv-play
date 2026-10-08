import { useEffect, useState } from 'react';
import { BackHandler, ScrollView, View } from 'react-native';
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
import { useStore } from 'zustand';
import {
  ACTIVATION_URL,
  MockBackendService,
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
import { Player } from './Player';
import { Body, FocusCard, Logo, Text, Title, styles } from './ui';

type Screen =
  | { name: 'home' }
  | { name: 'live' }
  | { name: 'settings' }
  | { name: 'player'; index: number };

const POLL_MS = 10_000;
/** Ponto único de troca para o backend real (ver README). */
const backend = new MockBackendService();
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

  useEffect(() => {
    void loadOrCreateDevice(asyncAdapter).then(setDevice);
    void store.hydrate();
  }, []);

  // Voltar: player → live → home; em home o Android fecha o app
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // O Player é dono do Voltar enquanto está montado (OSD → esconde; oculto → onExit)
      if (screen.name === 'player') return false;
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
    const check = async () => {
      try {
        const s = await backend.getDeviceStatus(device.mac, device.key);
        setStatus(s);
        const first = s.playlists[0];
        if (first) setPlaylist(first);
      } catch {
        // mantém a ativação e tenta de novo no próximo ciclo
      }
    };
    void check();
    const id = setInterval(() => void check(), POLL_MS);
    return () => clearInterval(id);
  }, [device, playlist]);

  useEffect(() => {
    if (playlist?.kind === 'm3u') setChannels(parseM3u(playlist.content));
  }, [playlist]);

  // Espera as fontes para não piscar a família do sistema
  if (!fontsLoaded) return null;

  if (!playlist) {
    return <ActivationView device={device} status={status} />;
  }

  if (screen.name === 'home') {
    return (
      <HomeView
        playlistName={playlist.name}
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
    <Player
      url={current.url}
      title={current.name}
      isLive
      channelNumber={screen.index + 1}
      total={channels.length}
      onChannel={(delta) => {
        if (channels.length === 0) return;
        const next = (screen.index + delta + channels.length) % channels.length;
        setScreen({ name: 'player', index: next });
      }}
      onChannelNumber={(n) => setScreen({ name: 'player', index: n - 1 })}
      onExit={() => setScreen({ name: 'live' })}
      epgTitle={currentAndNext(NO_EPG, current.tvgId ?? current.id, Date.now()).current?.title}
    />
  );
}

function ActivationView({ device, status }: { device: DeviceIdentity | null; status: DeviceStatus | null }) {
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
  onLive,
  onSettings,
}: {
  playlistName: string;
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
