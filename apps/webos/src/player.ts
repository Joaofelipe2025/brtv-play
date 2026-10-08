import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import { detectStreamKind, type StreamKind } from '@brtv/core';
import type { VideoEngine } from './platform';

export interface Track {
  id: number;
  label: string;
}

export interface PlaybackHandle {
  destroy(): void;
  audioTracks(): Track[];
  textTracks(): Track[];
  /** Faixa de áudio atual (-1 se desconhecida). */
  currentAudio(): number;
  /** Legenda atual (-1 = desligada). */
  currentText(): number;
  setAudio(id: number): void;
  setText(id: number): void;
}

interface PlaybackOptions {
  muted?: boolean;
  /** Motor de vídeo escolhido nas Configurações (padrão: 'auto'). */
  engine?: VideoEngine;
  onError(message: string): void;
  /** Chamado quando as faixas de áudio/legenda ficam disponíveis ou mudam. */
  onTracks?(): void;
}

function trackLabel(name: string | undefined, lang: string | undefined, index: number): string {
  return name?.trim() || lang?.toUpperCase() || `Faixa ${index + 1}`;
}

/** Legendas nativas (<track> / HLS nativo no webOS). */
function nativeText(video: HTMLVideoElement) {
  const list = (): TextTrack[] =>
    Array.from(video.textTracks).filter((t) => t.kind === 'subtitles' || t.kind === 'captions');
  return {
    textTracks: (): Track[] => list().map((t, i) => ({ id: i, label: trackLabel(t.label, t.language, i) })),
    currentText: (): number => list().findIndex((t) => t.mode === 'showing'),
    setText(id: number): void {
      list().forEach((t, i) => {
        t.mode = i === id ? 'showing' : 'disabled';
      });
    },
  };
}

const noAudio = {
  audioTracks: (): Track[] => [],
  currentAudio: (): number => -1,
  setAudio: (): void => undefined,
};

export type ResolvedEngine = 'native' | 'hlsjs' | 'mpegts' | 'progressive';

/** True quando rodando no navegador de uma TV LG webOS. */
export function isWebOS(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof (window as { PalmSystem?: unknown }).PalmSystem !== 'undefined') return true;
  return typeof navigator !== 'undefined' && /Web0S/i.test(navigator.userAgent);
}

/** Decide o pipeline de reprodução (pura: o ambiente entra como argumento). */
export function resolveEngine(
  kind: StreamKind,
  engine: VideoEngine,
  env: { webOS: boolean; hlsSupported: boolean } = { webOS: isWebOS(), hlsSupported: Hls.isSupported() },
): ResolvedEngine {
  if (kind === 'ts') return 'mpegts';
  if (kind === 'progressive') return 'progressive';
  if (engine === 'native') return 'native';
  if (engine === 'hlsjs') return 'hlsjs';
  if (env.webOS) return 'native';
  return env.hlsSupported ? 'hlsjs' : 'native';
}

/**
 * Inicia a reprodução. O pipeline vem de `resolveEngine`:
 *  - TS (.ts): mpegts.js
 *  - arquivo progressivo (mp4/mkv...): <video src>
 *  - HLS/desconhecido: nativo (webOS ou escolha do usuário) ou hls.js
 */
export function startPlayback(video: HTMLVideoElement, url: string, opts: PlaybackOptions): PlaybackHandle {
  let pipeline = resolveEngine(detectStreamKind(url), opts.engine ?? 'auto');
  video.muted = opts.muted ?? false;
  const play = (): void => {
    void video.play().catch(() => undefined);
  };

  if (pipeline === 'mpegts' && !mpegts.getFeatureList().mseLivePlayback) pipeline = 'native';
  if (pipeline === 'hlsjs' && !Hls.isSupported()) pipeline = 'native';

  if (pipeline === 'mpegts') {
    const player = mpegts.createPlayer({ type: 'mpegts', isLive: true, url });
    player.attachMediaElement(video);
    player.on(mpegts.Events.ERROR, (_type, _detail, info) => {
      opts.onError(String(info?.msg ?? 'Erro de reprodução'));
    });
    player.load();
    play();
    return {
      ...noAudio,
      ...nativeText(video),
      destroy() {
        player.pause();
        player.unload();
        player.detachMediaElement();
        player.destroy();
      },
    };
  }

  if (pipeline === 'hlsjs') {
    const hls = new Hls({
      maxBufferLength: 30,
      liveSyncDurationCount: 3,
      enableWorker: true,
      lowLatencyMode: false,
    });
    let networkRetried = false;
    let mediaRetried = false;
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !networkRetried) {
        networkRetried = true;
        hls.startLoad();
        return;
      }
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRetried) {
        mediaRetried = true;
        hls.recoverMediaError();
        return;
      }
      opts.onError(data.details);
    });
    const notify = (): void => opts.onTracks?.();
    hls.on(Hls.Events.MANIFEST_PARSED, notify);
    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, notify);
    hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, notify);
    hls.subtitleDisplay = true;
    hls.loadSource(url);
    hls.attachMedia(video);
    play();
    return {
      destroy() {
        hls.destroy();
      },
      audioTracks: () => hls.audioTracks.map((t, i) => ({ id: i, label: trackLabel(t.name, t.lang, i) })),
      textTracks: () => hls.subtitleTracks.map((t, i) => ({ id: i, label: trackLabel(t.name, t.lang, i) })),
      currentAudio: () => hls.audioTrack,
      currentText: () => hls.subtitleTrack,
      setAudio(id) {
        hls.audioTrack = id;
      },
      setText(id) {
        hls.subtitleTrack = id;
      },
    };
  }

  // 'native' e 'progressive': <video src> direto.
  const onVideoError = (): void => opts.onError('Erro de reprodução nativa');
  const onTrack = (): void => opts.onTracks?.();
  video.addEventListener('error', onVideoError);
  video.textTracks.addEventListener('addtrack', onTrack);
  video.src = url;
  play();
  return {
    ...noAudio,
    ...nativeText(video),
    destroy() {
      video.removeEventListener('error', onVideoError);
      video.textTracks.removeEventListener('addtrack', onTrack);
      video.removeAttribute('src');
      video.load();
    },
  };
}

export const MAX_RECONNECT_ATTEMPTS = 3;

/** Backoff exponencial: 1s, 2s, 4s. */
export function reconnectDelayMs(attempt: number): number {
  return 1000 * 2 ** attempt;
}
