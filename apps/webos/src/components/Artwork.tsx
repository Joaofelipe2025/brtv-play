import { useState, type CSSProperties } from 'react';

/** Tons do logo usados nas artes geradas (quando a playlist não traz imagem). */
const TINTS = ['#01B260', '#ACF602', '#15E24D', '#F6F609', '#049F64', '#9AF70B'];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function tintFor(text: string): string {
  return TINTS[hash(text) % TINTS.length] ?? TINTS[0]!;
}

function initials(name: string, max: number): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return words
    .slice(0, max)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

interface ArtProps {
  src?: string;
  title: string;
  className?: string;
  /** Logo de canal: iniciais centralizadas. Pôster: letra grande no canto. */
  variant: 'poster' | 'channel';
}

/**
 * Imagem com fallback gerado: se a playlist não tiver arte (ou ela falhar),
 * desenha uma arte com o tom da marca derivado do título. Carrega sob demanda.
 */
export function Art({ src, title, className = '', variant }: ArtProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;
  const style = { '--tint': tintFor(title) } as CSSProperties;

  if (showImage) {
    return (
      <div className={`art ${className}`}>
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      </div>
    );
  }

  if (variant === 'channel') {
    return (
      <div className={`art art--fallback ${className}`} style={style} aria-hidden="true">
        {initials(title, 2)}
      </div>
    );
  }

  return (
    <div className={`art art--fallback ${className}`} style={style} aria-hidden="true">
      <span className="art__glyph">{initials(title, 1)}</span>
      <span className="art__stripe" />
    </div>
  );
}

export function ChannelLogo({ src, name }: { src?: string; name: string }) {
  return <Art src={src} title={name} variant="channel" className="chlogo" />;
}
