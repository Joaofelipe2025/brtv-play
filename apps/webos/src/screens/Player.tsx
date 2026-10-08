import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { currentAndNext, type RemoteAction } from '@brtv/core';
import { useApp } from '../context';
import { MAX_RECONNECT_ATTEMPTS, reconnectDelayMs, startPlayback, type PlaybackHandle, type Track } from '../player';
import { store } from '../platform';
import type { LiveItem } from '../library';
import { focusFirst, setKeyInterceptor } from '../focus';
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
const SAVE_EVERY_MS = 5000;
const SEEK_SECONDS = 10;

export function Player({ url, title, isLive, id, channels, index }: PlayerProps) {
  const { session, replace } = useApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const handleRef = useRef<PlaybackHandle | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [osd, setOsd] = useState(true);
  const [time, setTime] = useState({ current: 0, duration: 0 });
  const [tracks, setTracks] = useState<{ audio: Track[]; text: Track[]; a: number; t: number }>({
    audio: [],
    text: [],
    a: -1,
    t: -1,
  });
  const retries = useRef(0);
  const hideTimer = useRef<number | undefined>(undefined);

  const channel = isLive && channels && index !== undefined ? channels[index] : undefined;
  const epg = channel ? currentAndNext(session.epg, channel.epgId ?? channel.id, Date.now()) : null;

  const showOsd = useCallback(() => {
    setOsd(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setOsd(false), OSD_MS);
  }, []);

  const readTracks = useCallback(() => {
    const h = handleRef.current;
    if (!h) return;
    setTracks({ audio: h.audioTracks(), text: h.textTracks(), a: h.currentAudio(), t: h.currentText() });
  }, []);

  // Reprodução com reconexão: 1s, 2s, 4s; depois mostra erro com "Tentar de novo"
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setStatus(retries.current > 0 ? 'reconnecting' : 'loading');
    setError(null);

    const onPlaying = () => {
      retries.current = 0;
      setStatus('playing');
    };
    const onWaiting = () => setStatus((s) => (s === 'playing' ? 'loading' : s));
    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);

    let retryTimer: number | undefined;
    handleRef.current = startPlayback(video, url, {
      engine: session.prefs.engine,
      onTracks: readTracks,
      onError: (message) => {
        if (retries.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = reconnectDelayMs(retries.current);
          retries.current += 1;
          setStatus('reconnecting');
          retryTimer = window.setTimeout(() => setAttempt((n) => n + 1), delay);
        } else {
          setStatus('error');
          setError(message);
        }
      },
    });

    return () => {
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
      window.clearTimeout(retryTimer);
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [url, attempt, readTracks, session.prefs.engine]);

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

  // Tempo para a barra de progresso
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tick = () => setTime({ current: video.currentTime, duration: Number.isFinite(video.duration) ? video.duration : 0 });
    video.addEventListener('timeupdate', tick);
    showOsd();
    return () => {
      video.removeEventListener('timeupdate', tick);
      window.clearTimeout(hideTimer.current);
    };
  }, [url, showOsd]);

  const switchChannel = useCallback(
    (delta: number) => {
      if (!channels || index === undefined || channels.length === 0) return;
      const nextIndex = (index + delta + channels.length) % channels.length;
      const next = channels[nextIndex];
      if (!next) return;
      replace({ name: 'player', url: next.url, title: next.name, isLive: true, channels, index: nextIndex });
    },
    [channels, index, replace],
  );

  // Teclas do player: cima/baixo trocam canal no ao vivo; com OSD oculto, OK só mostra o OSD
  // e esquerda/direita avançam ou voltam 10s no VOD.
  useEffect(() => {
    const intercept = (action: RemoteAction): boolean => {
      const osdWasHidden = !osd;
      showOsd();
      if (isLive && (action === 'up' || action === 'channelUp')) {
        switchChannel(1);
        return true;
      }
      if (isLive && (action === 'down' || action === 'channelDown')) {
        switchChannel(-1);
        return true;
      }
      if (osdWasHidden && action === 'ok') return true;
      const video = videoRef.current;
      if (!isLive && osdWasHidden && video && (action === 'left' || action === 'right')) {
        video.currentTime = Math.max(0, video.currentTime + (action === 'right' ? SEEK_SECONDS : -SEEK_SECONDS));
        return true;
      }
      return false;
    };
    setKeyInterceptor(intercept);
    return () => setKeyInterceptor(null);
  }, [osd, isLive, showOsd, switchChannel]);

  // Ao aparecer o OSD (ou o erro), foca o primeiro controle
  useEffect(() => {
    if (osd || status === 'error') requestAnimationFrame(() => focusFirst());
  }, [osd, status]);

  const cycleAudio = () => {
    const h = handleRef.current;
    if (!h || tracks.audio.length < 2) return;
    h.setAudio((tracks.a + 1) % tracks.audio.length);
    readTracks();
  };

  const cycleText = () => {
    const h = handleRef.current;
    if (!h || tracks.text.length === 0) return;
    // Desligada → faixa 0 → faixa 1 → … → desligada
    const next = tracks.t + 1 >= tracks.text.length ? -1 : tracks.t + 1;
    h.setText(next);
    readTracks();
  };

  const retry = () => {
    retries.current = 0;
    setAttempt((n) => n + 1);
  };

  const audioLabel = tracks.audio[tracks.a]?.label ?? (tracks.audio.length ? tracks.audio[0]!.label : 'Padrão');
  const textLabel = tracks.t >= 0 ? (tracks.text[tracks.t]?.label ?? 'Ligadas') : 'Desligadas';

  return (
    <div className="screen" style={{ padding: 0, background: '#000', animation: 'none' }} onMouseMove={showOsd}>
      <video ref={videoRef} className="player-video" autoPlay playsInline />

      {(status === 'loading' || status === 'reconnecting') && (
        <div className="osd__center" style={{ background: 'transparent' }}>
          <div className="spinner" />
          {status === 'reconnecting' && (
            <p className="muted" style={{ marginTop: 24 }}>
              Sinal caiu. Reconectando, tentativa {retries.current} de {MAX_RECONNECT_ATTEMPTS}…
            </p>
          )}
        </div>
      )}

      {status === 'error' && (
        <div className="osd__center">
          <h2>Não foi possível reproduzir</h2>
          <p className="muted" style={{ marginTop: 12, maxWidth: 900 }}>
            O sinal não respondeu depois de {MAX_RECONNECT_ATTEMPTS} tentativas. Confira a conexão ou escolha outro {isLive ? 'canal' : 'título'}.
          </p>
          {error && (
            <p className="muted" style={{ marginTop: 8, fontSize: 24 }}>
              Detalhe técnico: {error}
            </p>
          )}
          <div className="hstack" style={{ marginTop: 32 }}>
            <button className="focusable btn btn--primary" onClick={retry}>
              Tentar de novo
            </button>
          </div>
        </div>
      )}

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
              <button
                className="focusable btn"
                onClick={cycleAudio}
                disabled={tracks.audio.length < 2}
                style={{ opacity: tracks.audio.length < 2 ? 0.5 : 1 }}
              >
                Áudio: {audioLabel}
              </button>
              <button
                className="focusable btn"
                onClick={cycleText}
                disabled={tracks.text.length === 0}
                style={{ opacity: tracks.text.length === 0 ? 0.5 : 1 }}
              >
                Legendas: {tracks.text.length === 0 ? 'indisponíveis' : textLabel}
              </button>
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
