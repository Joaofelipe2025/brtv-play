import type { ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { colors } from '@brtv/core';

/**
 * As telas são desenhadas numa tela virtual de 1920x1080, como no webOS. Cada aparelho
 * (projetor 720p, TV 1080p ou 4K, celular deitado) reduz ou amplia esse quadro por igual,
 * sem cortar nada. Sem isso, um aparelho com densidade baixa mostra tudo ampliado.
 */
export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;

export function ScaledCanvas({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
  // Centraliza quando a proporção da tela não é 16:9 (faixas laterais na cor do fundo)
  const left = (width - DESIGN_WIDTH * scale) / 2;
  const top = (height - DESIGN_HEIGHT * scale) / 2;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, overflow: 'hidden' }}>
      <View
        style={{
          position: 'absolute',
          left,
          top,
          width: DESIGN_WIDTH,
          height: DESIGN_HEIGHT,
          transformOrigin: 'top left',
          transform: [{ scale }],
        }}
      >
        {children}
      </View>
    </View>
  );
}
