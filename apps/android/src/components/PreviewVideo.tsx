import { useEffect, useMemo, useState } from 'react';
import Video, { ViewType, type ReactVideoSource } from 'react-native-video';
import { detectStreamKind } from '@brtv/core';

/** Valor que só muda depois de `delay` ms sem novas alterações. */
export function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return settled;
}

/**
 * Prévia silenciosa de um stream. Só abre depois que a URL fica estável por `delay` ms,
 * para não criar uma conexão a cada item percorrido no controle. Fica invisível até tocar
 * e, em caso de erro, continua invisível (a arte de fundo aparece).
 */
export function PreviewVideo({ url, delay = 700 }: { url: string | null; delay?: number }) {
  const settled = useDebounced(url, delay);
  const [playing, setPlaying] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  useEffect(() => {
    setPlaying(false);
  }, [settled]);

  const source = useMemo<ReactVideoSource | null>(() => {
    if (!settled) return null;
    return { uri: settled, ...(detectStreamKind(settled) === 'hls' ? { type: 'm3u8' as const } : {}) };
  }, [settled]);

  if (!source || failedUrl === settled) return null;
  return (
    <Video
      viewType={ViewType.TEXTURE}
      key={settled}
      source={source}
      muted
      paused={false}
      resizeMode="cover"
      controls={false}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: playing ? 1 : 0 }}
      onPlaybackStateChanged={(e) => {
        if (e.isPlaying) setPlaying(true);
      }}
      onError={() => {
        setPlaying(false);
        setFailedUrl(settled);
      }}
    />
  );
}
