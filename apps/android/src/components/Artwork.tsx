import { useState } from 'react';
import { Image, View } from 'react-native';
import { colors } from '@brtv/core';
import { Text, font } from '../ui';

/** Tons do logo usados nas artes geradas (quando a playlist não traz imagem). */
const TINTS = ['#01B260', '#ACF602', '#15E24D', '#F6F609', '#049F64', '#9AF70B'] as const;

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function tintFor(text: string): string {
  return TINTS[hash(text) % TINTS.length] ?? TINTS[0];
}

export function initials(name: string, max: number): string {
  return name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, max)
    .map((w) => (w[0] ?? '').toUpperCase())
    .join('');
}

/** Logo de canal (72×72 por padrão): imagem da lista sobre `surfaceElevated`; sem logo ou com erro, iniciais. */
export function ChannelLogo({ src, name, size = 72 }: { src?: string | undefined; name: string; size?: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = Boolean(src) && failed !== src;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: colors.surfaceElevated,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {showImage ? (
        <Image
          source={{ uri: src }}
          resizeMode="contain"
          style={{ width: size - 8, height: size - 8 }}
          onError={() => setFailed(src ?? null)}
        />
      ) : (
        <Text style={{ color: tintFor(name), fontSize: Math.round(size * 0.39), fontFamily: font.bold }}>{initials(name, 2)}</Text>
      )}
    </View>
  );
}

/** Pôster 2:3: imagem `cover`; sem imagem, arte gerada com o tom do título e letra grande. */
export function Poster({ src, title, width }: { src?: string | undefined; title: string; width: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = Boolean(src) && failed !== src;
  const tint = tintFor(title);
  return (
    <View
      style={{
        width,
        aspectRatio: 2 / 3,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: colors.surfaceElevated,
      }}
    >
      {showImage ? (
        <Image
          source={{ uri: src }}
          resizeMode="cover"
          style={{ width: '100%', height: '100%' }}
          onError={() => setFailed(src ?? null)}
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: tint, opacity: 0.25 }} />
          <Text style={{ color: tint, fontSize: Math.max(48, width * 0.45), fontFamily: font.bold }}>
            {initials(title, 1)}
          </Text>
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 8, backgroundColor: tint }} />
        </View>
      )}
    </View>
  );
}

/** Barra de progresso do programa atual (valor entre 0 e 1). */
export function Progress({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceElevated, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: colors.accent }} />
    </View>
  );
}
