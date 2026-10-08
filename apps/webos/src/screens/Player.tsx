import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  channelIndexForNumber,
  createChannelNumberInput,
  createReconnector,
  createStallDetector,
  currentAndNext,
  digitOf,
  RECONNECT,
  type RemoteAction,
} from '@brtv/core';
import { useApp } from '../context';
import { startPlayback, type PlaybackHandle, type Track } from '../player';
import { store } from '../platform';
import type { LiveItem } from '../library';
import { setKeyInterceptor } from '../focus';
import { Clock, Logo, Progress } from '../components/Brand';
import { ChannelLogo } from '../components/Artwork';
import { elapsed, formatClock, formatHour } from '../format';

interface PlayerProps {
  url: string;
  title: string;
  isLive: boolean;
  id?: string;
  channels?: LiveItem[];
  index?: number;
}

type Status = 'loading' | 'playing' | 'reconnecting' | 'error';

const OSD_MS = 5000;
const NOTICE_MS = 3000;
const SAVE_EVERY_MS = 5000;
const SEEK_SECONDS = 10;
const STALL_SAMPLE_MS = 1000;
const DIGIT_POLL_MS = 250;
const STALL_MESSAGE = 'A imagem parou de se mover.';

export function Player({ url, title, isLive, id, channels, index }: PlayerProps) {
  const { session, replace, back } = useApp();
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const handleRef = useRef<PlaybackHandle | null>(null);
  const [reconnector] = useState(() => createReconnector());
  const [stall] = useState(() => createStallDetector());
  const [channelInput] = useState(() => createChannelNumberInput());
  const [status, setStatusState] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [osd, setOsdState] = useState(true);
  const [paused, setPaused] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDigits, setPendingDigits] = useState('');
  const [time, setTime] = useState({ current: 0, duration: 0 });
  const [tracks, setTracks] = useState<{ audio: Track[]; text: Track[]; a: number; t: number }>({
    audio: [],
    text: [],
    a: -1,
    t: -1,
  });
  const hideTimer = useRef<number | undefined>(undefined);
  const noticeTimer = useRef<number | undefined>(undefined);
  const retryTimer = useRef<number | undefined>(undefined);
  // Espelhos síncronos de osd/status: o interceptador de teclas lê sem esperar o render
  const osdRef = useRef(true);
  const statusRef = useRef<Status>('loading');

  const channel = isLive && channels && index !== undefined ? channels[index] : undefined;
  const epg = channel ? currentAndNext(session.epg, channel.epgId ?? channel.id, Date.now()) : null;
  const withNumbers = isLive && !!channels && channels.length > 0;

  const setStatus = useCallback((next: Status) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  const setOsd = useCallback((visible: boolean) => {
    osdRef.current = visible;
    setOsdState(visible);
  }, []);

  const showOsd = useCallback(() => {
    setOsd(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setOsd(false), OSD_MS);
  }, [setOsd]);

  const hideOsd = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    setOsd(false);
  }, [setOsd]);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  const readTracks = useCallback(() => {
    const h = handleRef.current;
    if (!h) return;
    setTracks({ audio: h.audioTracks(), text: h.textTracks(), a: h.currentAudio(), t: h.currentText() });
  }, []);

  // Falha de reprodução (erro do player ou travamento): reconecta 1s, 2s, 4s; depois mostra o erro
  const handleFailure = useCallback(
    (message: string) => {
      window.clearTimeout(retryTimer.current);
      const decision = reconnector.fail();
      if (decision.action === 'retry') {
        setStatus('reconnecting');
        retryTimer.current = window.setTimeout(() => setAttempt((n) => n + 1), decision.delayMs);
      } else {
        setStatus('error');
        setError(message);
      }
    },
    [reconnector, setStatus],
  );

  // Reprodução com reconexão
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setStatus(reconnector.attempts() > 0 ? 'reconnecting' : 'loading');
    setError(null);
    stall.reset();

    const onPlaying = () => {
      reconnector.succeed();
      setStatus('playing');
    };
    const onWaiting = () => {
      if (statusRef.current === 'playing') setStatus('loading');
    };
    const onPlay = () => setPaused(false);
    const onPause = () => setPaused(true);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);

    handleRef.current = startPlayback(video, url, {
      engine: session.prefs.engine,
      onTracks: readTracks,
      onError: handleFailure,
    });

    return () => {
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      window.clearTimeout(retryTimer.current);
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [url, attempt, readTracks, handleFailure, reconnector, stall, setStatus, session.prefs.engine]);

  // Detecção de travamento: amostra a cada 1s, exceto em erro
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const timer = window.setInterval(() => {
      if (statusRef.current === 'error') return;
      if (stall.sample(video.currentTime, video.paused, Date.now())) handleFailure(STALL_MESSAGE);
    }, STALL_SAMPLE_MS);
    return () => window.clearInterval(timer);
  }, [url, stall, handleFailure]);

  // Histórico
  useEffect(() => {
    store.getState().addHistory({ id: id ?? url, type: isLive ? 'live' : 'vod', title });
  }, [id, isLive, url, title]);

  // VOD: retoma posição salva e salva a cada 5s
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isLive || !id) return;
    const saved = store.getState().continueWatching[id] ?? 0;
    const onMeta = () => {
      if (saved > 5 && saved < video.duration - 10) video.currentTime = saved;
    };
    video.addEventListener('loadedmetadata', onMeta);
    const timer = window.setInterval(() => {
      if (!video.paused && video.currentTime > 0) store.getState().setPosition(id, video.currentTime);
    }, SAVE_EVERY_MS);
    return () => {
      video.removeEventListener('loadedmetadata', onMeta);
      window.clearInterval(timer);
      if (video.currentTime > 0) store.getState().setPosition(id, video.currentTime);
    };
  }, [id, isLive, url]);

  // Tempo para a barra de progresso; mostra o OSD ao abrir ou trocar de canal
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tick = () => setTime({ current: video.currentTime, duration: Number.isFinite(video.duration) ? video.duration : 0 });
    video.addEventListener('timeupdate', tick);
    channelInput.clear();
    setPendingDigits('');
    showOsd();
    return () => {
      video.removeEventListener('timeupdate', tick);
      window.clearTimeout(hideTimer.current);
    };
  }, [url, showOsd, channelInput]);

  useEffect(
    () => () => {
      window.clearTimeout(noticeTimer.current);
    },
    [],
  );

  const goToChannel = useCallback(
    (nextIndex: number) => {
      const next = channels?.[nextIndex];
      if (!channels || !next) return;
      replace({ name: 'player', url: next.url, title: next.name, isLive: true, channels, index: nextIndex });
    },
    [channels, replace],
  );

  const switchChannel = useCallback(
    (delta: number) => {
      if (!channels || index === undefined || channels.length === 0) return;
      goToChannel((index + delta + channels.length) % channels.length);
    },
    [channels, index, goToChannel],
  );

  // Número de canal digitado: confirma depois de 1,5 s sem novos dígitos
  useEffect(() => {
    if (!withNumbers || !channels || pendingDigits === '') return;
    const total = channels.length;
    const timer = window.setInterval(() => {
      const n = channelInput.poll(Date.now());
      if (n === null) return;
      setPendingDigits('');
      const target = channelIndexForNumber(n, total);
      if (target === null) showNotice(`Canal ${n} não existe`);
      else if (target !== index) goToChannel(target);
    }, DIGIT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [withNumbers, channels, pendingDigits, channelInput, index, goToChannel, showNotice]);

  const seek = (delta: number) => {
    const video = videoRef.current;
    if (video) video.currentTime = Math.max(0, video.currentTime + delta);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      const result = video.play();
      if (result) result.catch(() => undefined);
    } else {
      video.pause();
    }
  };

  // Teclas do player (ver `setKeyInterceptor` em focus.ts, que consulta antes de qualquer ação)
  useEffect(() => {
    const intercept = (action: RemoteAction): boolean => {
      // Voltar: com o OSD à vista, só o esconde; oculto, deixa o Voltar global sair do player
      if (action === 'back') {
        if (osdRef.current && statusRef.current !== 'error') {
          hideOsd();
          return true;
        }
        return false;
      }

      const wasHidden = !osdRef.current && statusRef.current !== 'error';
      showOsd();

      const digit = digitOf(action);
      if (digit !== null) {
        if (withNumbers) setPendingDigits(channelInput.press(digit, Date.now()));
        return true;
      }

      const video = videoRef.current;
      switch (action) {
        case 'stop':
          back();
          return true;
        case 'playPause':
          togglePlay();
          return true;
        case 'play':
          if (video && video.paused) togglePlay();
          return true;
        case 'pause':
          if (video && !video.paused) togglePlay();
          return true;
        case 'fastForward':
        case 'rewind':
          if (!isLive) seek(action === 'fastForward' ? SEEK_SECONDS : -SEEK_SECONDS);
          return true;
        case 'up':
        case 'channelUp':
          if (isLive) {
            switchChannel(1);
            return true;
          }
          return false;
        case 'down':
        case 'channelDown':
          if (isLive) {
            switchChannel(-1);
            return true;
          }
          return false;
        case 'ok':
          return wasHidden;
        case 'left':
        case 'right':
          if (!isLive && wasHidden) {
            seek(action === 'right' ? SEEK_SECONDS : -SEEK_SECONDS);
            return true;
          }
          return false;
        default:
          return false;
      }
    };
    setKeyInterceptor(intercept);
    return () => setKeyInterceptor(null);
  }, [isLive, withNumbers, showOsd, hideOsd, switchChannel, back, channelInput]);

  // Ao aparecer o OSD (ou o erro), foca o controle principal — só dentro do player
  useEffect(() => {
    if (!osd && status !== 'error') return;
    const frame = requestAnimationFrame(() => {
      const root = rootRef.current;
      if (!root) return;
      const target = root.querySelector<HTMLElement>('[data-autofocus]');
      if (target) target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [osd, status, url]);

  const cycleAudio = () => {
    const h = handleRef.current;
    if (!h || tracks.audio.length < 2) {
      showNotice('Este canal não tem outras faixas de áudio');
      return;
    }
    h.setAudio((tracks.a + 1) % tracks.audio.length);
    readTracks();
  };

  const cycleText = () => {
    const h = handleRef.current;
    if (!h || tracks.text.length === 0) {
      showNotice('Este conteúdo não tem legendas');
      return;
    }
    // Desligada → faixa 0 → faixa 1 → … → desligada
    const next = tracks.t + 1 >= tracks.text.length ? -1 : tracks.t + 1;
    h.setText(next);
    readTracks();
  };

  const retry = () => {
    reconnector.reset();
    setAttempt((n) => n + 1);
  };

  const audioLabel = tracks.audio[tracks.a]?.label ?? (tracks.audio.length ? tracks.audio[0]!.label : 'Padrão');
  const textLabel = tracks.t >= 0 ? (tracks.text[tracks.t]?.label ?? 'Ligadas') : 'Desligadas';
  const noAudio = tracks.audio.length < 2;
  const noText = tracks.text.length === 0;

  return (
    <div ref={rootRef} className="screen" style={{ padding: 0, background: '#000', animation: 'none' }} onMouseMove={showOsd}>
      <video ref={videoRef} className="player-video" autoPlay playsInline />

      {(status === 'loading' || status === 'reconnecting') && (
        <div className="osd__center" style={{ background: 'transparent' }}>
          <div className="spinner" />
          {status === 'reconnecting' && (
            <p className="muted" style={{ marginTop: 24 }}>
              Sinal caiu. Reconectando, tentativa {Math.max(1, reconnector.attempts())} de {RECONNECT.maxAttempts}…
            </p>
          )}
        </div>
      )}

      {status === 'error' && (
        <div className="osd__center">
          <h2>Não foi possível reproduzir</h2>
          <p className="muted" style={{ marginTop: 12, maxWidth: 900 }}>
            O sinal não respondeu depois de {RECONNECT.maxAttempts} tentativas. Confira a conexão ou escolha outro {isLive ? 'canal' : 'título'}.
          </p>
          {error && (
            <p className="muted" style={{ marginTop: 8, fontSize: 24 }}>
              Detalhe técnico: {error}
            </p>
          )}
          <div className="hstack" style={{ marginTop: 32 }}>
            <button className="focusable btn btn--primary" data-autofocus onClick={retry}>
              Tentar de novo
            </button>
          </div>
        </div>
      )}

      {pendingDigits !== '' && <div className="osd-number num">{pendingDigits}</div>}
      {notice && <div className="osd-notice">{notice}</div>}

      {osd && status !== 'error' && (
        <>
          <div className="osd osd--top hstack">
            <Logo height={52} />
            <Clock />
          </div>

          <div className="osd osd--bottom">
            <div className="hstack" style={{ alignItems: 'flex-end', '--sp': '28px' } as CSSProperties}>
              {channel && <ChannelLogo src={channel.logo} name={channel.name} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                {isLive ? (
                  <span className="live-pill" style={{ marginBottom: 14 }}>
                    {index !== undefined ? `Ao vivo, canal ${index + 1}` : 'Ao vivo'}
                  </span>
                ) : null}
                <div className="osd__title ellipsis">{title}</div>
              </div>
            </div>

            {isLive && epg?.current && (
              <div style={{ marginTop: 20, maxWidth: 1100 }}>
                <div className="hstack" style={{ '--sp': '20px' } as CSSProperties}>
                  <span className="num muted">{formatHour(epg.current.start)}</span>
                  <span className="ellipsis" style={{ fontWeight: 600, flex: 1 }}>
                    {epg.current.title}
                  </span>
                  <span className="num muted">{formatHour(epg.current.stop)}</span>
                </div>
                <div style={{ marginTop: 10 }}>
                  <Progress value={elapsed(epg.current.start, epg.current.stop)} />
                </div>
                {epg.next && (
                  <p className="muted ellipsis" style={{ marginTop: 10, fontSize: 24 }}>
                    A seguir: {epg.next.title}
                  </p>
                )}
              </div>
            )}

            {!isLive && time.duration > 0 && (
              <div className="hstack" style={{ marginTop: 24, '--sp': '24px' } as CSSProperties}>
                <span className="num">{formatClock(time.current)}</span>
                <div style={{ flex: 1 }}>
                  <Progress value={time.current / time.duration} />
                </div>
                <span className="num muted">{formatClock(time.duration)}</span>
              </div>
            )}

            <div className="hstack" style={{ marginTop: 28, '--sp': '20px' } as CSSProperties}>
              <button className="focusable btn btn--primary" data-autofocus onClick={togglePlay}>
                {paused ? 'Continuar' : 'Pausar'}
              </button>
              <button
                className={`focusable btn${noAudio ? ' btn--dim' : ''}`}
                aria-disabled={noAudio ? 'true' : undefined}
                onClick={cycleAudio}
              >
                Áudio: {audioLabel}
              </button>
              <button
                className={`focusable btn${noText ? ' btn--dim' : ''}`}
                aria-disabled={noText ? 'true' : undefined}
                onClick={cycleText}
              >
                Legendas: {noText ? 'indisponíveis' : textLabel}
              </button>
              {isLive && (
                <button className="focusable btn" onClick={back}>
                  Canais
                </button>
              )}
              <span className="muted" style={{ marginLeft: 'auto', fontSize: 24 }}>
                {isLive ? 'Cima e baixo trocam de canal' : 'Esquerda e direita voltam ou avançam 10s'}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
