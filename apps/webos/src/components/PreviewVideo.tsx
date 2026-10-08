import { useEffect, useRef, useState } from 'react';
import { startPlayback } from '../player';
import { useDebounced } from '../hooks';
import { useApp } from '../context';

/**
 * Prévia silenciosa de um stream. Só começa depois que o foco para por `delay` ms,
 * para não abrir uma conexão a cada item percorrido no controle.
 * Falhas são silenciosas: a arte de fundo continua visível.
 */
export function PreviewVideo({ url, delay = 700 }: { url: string | null; delay?: number }) {
  const { session } = useApp();
  const engine = session.prefs.engine;
  const settled = useDebounced(url, delay);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    setVisible(false);
    if (!video || !settled) return;
    const onPlaying = () => setVisible(true);
    video.addEventListener('playing', onPlaying);
    const handle = startPlayback(video, settled, { muted: true, engine, onError: () => setVisible(false) });
    return () => {
      video.removeEventListener('playing', onPlaying);
      handle.destroy();
    };
  }, [settled, engine]);

  return (
    <video
      ref={videoRef}
      muted
      playsInline
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 500ms ease' }}
    />
  );
}
