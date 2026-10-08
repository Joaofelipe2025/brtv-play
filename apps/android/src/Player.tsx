import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, View, useTVEventHandler } from 'react-native';
import Video, {
  SelectedTrackType,
  type OnAudioTracksData,
  type OnLoadData,
  type OnProgressData,
  type OnTextTracksData,
  type ReactVideoSource,
  type SelectedTrack,
  type VideoRef,
} from 'react-native-video';
import {
  RECONNECT,
  channelIndexForNumber,
  colors,
  createChannelNumberInput,
  createReconnector,
  createStallDetector,
  detectStreamKind,
  digitOf,
  mapAndroidKey,
  type RemoteAction,
} from '@brtv/core';
import { Body, FocusCard, Text, Title, styles } from './ui';

export interface PlayerProps {
  url: string;
  title: string;
  isLive: boolean;
  /** Número (1-based) do canal na lista. */
  channelNumber?: number;
  total?: number;
  onChannel?(delta: number): void;
  /** Recebe o número (1-based) já validado contra `total`. */
  onChannelNumber?(n: number): void;
  onExit(): void;
  epgTitle?: string;
}

type Status = 'loading' | 'playing' | 'reconnecting' | 'error';

const OSD_MS = 5000;
const NOTICE_MS = 3000;
const STALL_POLL_MS = 1000;
const DIGIT_POLL_MS = 250;
const SEEK_STEP_S = 10;
/** Valores definidos pela especificação para HLS ao vivo em TV Box. */
const BUFFER_CONFIG = {
  minBufferMs: 15000,
  maxBufferMs: 50000,
  bufferForPlaybackMs: 2500,
  bufferForPlaybackAfterRebufferMs: 5000,
} as const;

interface TrackInfo {
  index: number;
  title?: string;
  language?: string;
}

function trackLabel(t: TrackInfo | undefined, fallback: string): string {
  return t?.title ?? t?.language ?? fallback;
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

const DISABLED_TRACK: SelectedTrack = { type: SelectedTrackType.DISABLED };

export function Player({
  url,
  title,
  isLive,
  channelNumber,
  total,
  onChannel,
  onChannelNumber,
  onExit,
  epgTitle,
}: PlayerProps) {
  const videoRef = useRef<VideoRef>(null);
  const [reconnector] = useState(createReconnector);
  const [stall] = useState(createStallDetector);
  const [channelInput] = useState(createChannelNumberInput);

  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);
  const [retryNo, setRetryNo] = useState(0);
  // O vídeo começa tocando; só o usuário altera isto, e o rótulo deriva dele
  const [paused, setPaused] = useState(false);
  const [osd, setOsd] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [audio, setAudio] = useState<TrackInfo[]>([]);
  const [text, setText] = useState<TrackInfo[]>([]);
  const [audioSel, setAudioSel] = useState(0);
  const [textSel, setTextSel] = useState(-1);
  const [time, setTime] = useState({ current: 0, duration: 0 });

  const lastTime = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const osdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Valores atuais para os handlers estáveis (teclas, Voltar, intervalos)
  const live = useRef({ status, paused, osd, isLive, total, onChannel, onChannelNumber, onExit });
  live.current = { status, paused, osd, isLive, total, onChannel, onChannelNumber, onExit };

  const showNotice = useCallback((message: string) => {
    if (noticeTimer.current !== undefined) clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  const showOsd = useCallback(() => {
    if (osdTimer.current !== undefined) clearTimeout(osdTimer.current);
    setOsd(true);
    osdTimer.current = setTimeout(() => setOsd(false), OSD_MS);
  }, []);

  const hideOsd = useCallback(() => {
    if (osdTimer.current !== undefined) clearTimeout(osdTimer.current);
    setOsd(false);
  }, []);

  // Novo conteúdo: zera política de reconexão, travamento, faixas e estado de pausa
  useEffect(() => {
    if (retryTimer.current !== undefined) clearTimeout(retryTimer.current);
    reconnector.reset();
    stall.reset();
    channelInput.clear();
    lastTime.current = 0;
    setStatus('loading');
    setAttempt(0);
    setRetryNo(0);
    setPaused(false);
    setAudio([]);
    setText([]);
    setAudioSel(0);
    setTextSel(-1);
    setTime({ current: 0, duration: 0 });
    setTyped('');
    showOsd();
  }, [url, reconnector, stall, channelInput, showOsd]);

  useEffect(
    () => () => {
      for (const t of [retryTimer, osdTimer, noticeTimer]) {
        if (t.current !== undefined) clearTimeout(t.current);
      }
    },
    [],
  );

  // Falha (erro do player ou travamento): reconecta com backoff ou desiste
  const handleFailure = useCallback(() => {
    const decision = reconnector.fail();
    if (decision.action === 'giveUp') {
      setStatus('error');
      return;
    }
    setRetryNo(decision.attempt);
    setStatus('reconnecting');
    if (retryTimer.current !== undefined) clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(() => {
      stall.reset();
      lastTime.current = 0;
      setAttempt((a) => a + 1);
    }, decision.delayMs);
  }, [reconnector, stall]);

  // Travamento: currentTime parado por 12 s fora de pausa. Não amostra durante reconexão/erro,
  // para que uma nova tentativa pendente não gaste outra.
  useEffect(() => {
    const id = setInterval(() => {
      const { status: s, paused: p } = live.current;
      if (s === 'reconnecting' || s === 'error') return;
      if (stall.sample(lastTime.current, p, Date.now())) handleFailure();
    }, STALL_POLL_MS);
    return () => clearInterval(id);
  }, [stall, handleFailure]);

  // Confirma o número digitado após o intervalo de inatividade
  useEffect(() => {
    const id = setInterval(() => {
      const n = channelInput.poll(Date.now());
      if (n === null) {
        setTyped(channelInput.pending());
        return;
      }
      setTyped('');
      const { total: count, onChannelNumber: go } = live.current;
      if (count === undefined || go === undefined) return;
      if (channelIndexForNumber(n, count) === null) showNotice(`Canal ${n} não existe`);
      else go(n);
    }, DIGIT_POLL_MS);
    return () => clearInterval(id);
  }, [channelInput, showNotice]);

  const togglePause = useCallback(() => setPaused((p) => !p), []);

  const handleAction = useCallback(
    (action: RemoteAction) => {
      const cur = live.current;
      const digit = digitOf(action);
      if (digit !== null) {
        if (cur.onChannelNumber === undefined || !cur.isLive) return;
        setTyped(channelInput.press(digit, Date.now()));
        return;
      }
      switch (action) {
        case 'channelUp':
          if (cur.isLive) cur.onChannel?.(1);
          return;
        case 'channelDown':
          if (cur.isLive) cur.onChannel?.(-1);
          return;
        case 'playPause':
          togglePause();
          showOsd();
          return;
        case 'play':
          setPaused(false);
          showOsd();
          return;
        case 'pause':
          setPaused(true);
          showOsd();
          return;
        case 'fastForward':
        case 'rewind': {
          if (cur.isLive) return;
          const delta = action === 'fastForward' ? SEEK_STEP_S : -SEEK_STEP_S;
          videoRef.current?.seek(Math.max(0, lastTime.current + delta));
          showOsd();
          return;
        }
        case 'up':
        case 'down':
          // Com o OSD visível, o foco navega pelos botões; oculto, troca de canal
          if (cur.osd) showOsd();
          else if (cur.isLive) cur.onChannel?.(action === 'up' ? 1 : -1);
          else showOsd();
          return;
        case 'left':
        case 'right':
        case 'ok':
          showOsd();
          return;
        default:
          return;
      }
    },
    [channelInput, showOsd, togglePause],
  );

  // Teclas do controle (react-native-tvos). Ações de soltar tecla (eventKeyAction 1 no Android) são ignoradas.
  const onTVEvent = useCallback(
    (evt: { eventType: string; eventKeyAction?: number }) => {
      if (evt.eventKeyAction === 1) return;
      const action = mapAndroidKey(evt.eventType);
      if (action !== null) handleAction(action);
    },
    [handleAction],
  );
  useTVEventHandler(onTVEvent);

  // Voltar: OSD visível → esconde; oculto → sai. Retorna true para o App não tratar também.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (live.current.osd) hideOsd();
      else live.current.onExit();
      return true;
    });
    return () => sub.remove();
  }, [hideOsd]);

  const onLoad = useCallback(
    (e: OnLoadData) => {
      reconnector.succeed();
      stall.reset();
      setStatus('playing');
      setRetryNo(0);
      setTime((t) => ({ ...t, duration: e.duration }));
    },
    [reconnector, stall],
  );

  const onProgress = useCallback((e: OnProgressData) => {
    lastTime.current = e.currentTime;
    setTime((t) => (Math.abs(t.current - e.currentTime) < 0.5 ? t : { ...t, current: e.currentTime }));
  }, []);

  const onAudioTracks = useCallback((e: OnAudioTracksData) => {
    setAudio(e.audioTracks);
    const sel = e.audioTracks.findIndex((t) => t.selected === true);
    setAudioSel(sel >= 0 ? sel : 0);
  }, []);

  const onTextTracks = useCallback((e: OnTextTracksData) => {
    setText(e.textTracks);
    setTextSel(e.textTracks.findIndex((t) => t.selected === true));
  }, []);

  const cycleAudio = () => {
    if (audio.length < 2) {
      showNotice(isLive ? 'Este canal não tem outras faixas de áudio' : 'Este conteúdo não tem outras faixas de áudio');
      return;
    }
    setAudioSel((audioSel + 1) % audio.length);
  };

  const cycleText = () => {
    if (text.length === 0) {
      showNotice('Este conteúdo não tem legendas');
      return;
    }
    // Desligada → faixa 0 → faixa 1 → … → desligada
    setTextSel(textSel + 1 >= text.length ? -1 : textSel + 1);
  };

  const retry = () => {
    reconnector.reset();
    stall.reset();
    lastTime.current = 0;
    setRetryNo(0);
    setStatus('loading');
    setAttempt((a) => a + 1);
  };

  const kind = detectStreamKind(url);
  // 'type' só para HLS; TS, progressivo e desconhecido ficam com a detecção automática do ExoPlayer
  const source: ReactVideoSource = {
    uri: url,
    ...(kind === 'hls' ? { type: 'm3u8' } : {}),
    bufferConfig: BUFFER_CONFIG,
  };
  const selectedAudio: SelectedTrack | undefined = audio[audioSel]
    ? { type: SelectedTrackType.INDEX, value: audio[audioSel].index }
    : undefined;
  const selectedText: SelectedTrack = text[textSel]
    ? { type: SelectedTrackType.INDEX, value: text[textSel].index }
    : DISABLED_TRACK;

  const audioLabel = trackLabel(audio[audioSel], 'Padrão');
  const textLabel = textSel >= 0 ? trackLabel(text[textSel], 'Ligadas') : 'Desligadas';
  const noText = text.length === 0;
  const busy = status === 'loading' || status === 'reconnecting';
  const progress = time.duration > 0 ? Math.min(1, time.current / time.duration) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {status !== 'error' && (
        <Video
          ref={videoRef}
          key={`${url}-${attempt}`}
          source={source}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          resizeMode="contain"
          paused={paused}
          selectedAudioTrack={selectedAudio}
          selectedTextTrack={selectedText}
          onLoad={onLoad}
          onProgress={onProgress}
          onAudioTracks={onAudioTracks}
          onTextTracks={onTextTracks}
          onError={handleFailure}
        />
      )}

      {busy && (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}
        >
          <ActivityIndicator size="large" color={colors.accent} />
          {status === 'reconnecting' && (
            <Body>
              Reconectando, tentativa {Math.max(1, retryNo)} de {RECONNECT.maxAttempts}
            </Body>
          )}
        </View>
      )}

      {status === 'error' && (
        <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
          <Title>Não foi possível reproduzir</Title>
          <Body muted>
            O sinal não respondeu depois de {RECONNECT.maxAttempts} tentativas. Confira a conexão ou escolha outro{' '}
            {isLive ? 'canal' : 'título'}.
          </Body>
          <FocusCard autoFocus onPress={retry} style={{ marginTop: 24 }}>
            <Body>Tentar de novo</Body>
          </FocusCard>
        </View>
      )}

      {typed !== '' && (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 48, right: 48, padding: 16, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.7)' }}
        >
          <Text style={{ color: colors.accent, fontSize: 56, fontWeight: '700' }}>{typed}</Text>
        </View>
      )}

      {notice !== null && (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 48, left: 48, right: 48, alignItems: 'center' }}
        >
          <View style={{ padding: 16, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.8)' }}>
            <Body>{notice}</Body>
          </View>
        </View>
      )}

      {osd && status !== 'error' && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 32, backgroundColor: 'rgba(0,0,0,0.7)' }}>
          {isLive && (
            <Text style={[styles.brand, { fontSize: 24 }]}>
              {channelNumber !== undefined ? `Ao vivo, canal ${channelNumber}` : 'Ao vivo'}
            </Text>
          )}
          <Title>{title}</Title>
          {epgTitle !== undefined && epgTitle !== '' && <Body muted>{epgTitle}</Body>}
          {!isLive && (
            <View style={{ marginVertical: 12 }}>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceElevated }}>
                <View style={{ height: 8, borderRadius: 4, width: `${progress * 100}%`, backgroundColor: colors.accent }} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 24 }}>{formatClock(time.current)}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 24 }}>{formatClock(time.duration)}</Text>
              </View>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 16 }}>
            <FocusCard
              autoFocus
              onPress={() => {
                togglePause();
                showOsd();
              }}
            >
              <Body>{paused ? 'Continuar' : 'Pausar'}</Body>
            </FocusCard>
            <FocusCard
              onPress={() => {
                cycleAudio();
                showOsd();
              }}
            >
              <Body>Áudio: {audioLabel}</Body>
            </FocusCard>
            <FocusCard
              onPress={() => {
                cycleText();
                showOsd();
              }}
            >
              <Body>Legendas: {noText ? 'indisponíveis' : textLabel}</Body>
            </FocusCard>
          </View>
        </View>
      )}
    </View>
  );
}
