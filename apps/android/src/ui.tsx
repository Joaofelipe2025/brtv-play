import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text as RNText, View, type StyleProp, type TextProps, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { LOGO_ASPECT_RATIO, LOGO_DARK_SVG, colors, typography } from '@brtv/core';

/** Poppins é a única família do app. Pesos mapeados para os nomes do @expo-google-fonts/poppins. */
export const font = {
  light: 'Poppins_300Light',
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

/** Text com a família aplicada por padrão. */
export function Text({ style, ...rest }: TextProps) {
  return <RNText {...rest} style={[{ fontFamily: font.regular }, style]} />;
}

/** Logo oficial (mesmo SVG do webOS, gerado em packages/core). */
export function Logo({ height = 60 }: { height?: number }) {
  return <SvgXml xml={LOGO_DARK_SVG} height={height} width={height * LOGO_ASPECT_RATIO} />;
}

/**
 * Botão focável para TV. No foco: borda branca, leve scale e os dois rastros (lima e verde)
 * à esquerda, como o "play" do logo. As camadas são absolutas para o rastro ficar atrás da face.
 * `hasTVPreferredFocus` deixa o item já focado ao abrir a tela.
 */
export function FocusCard({
  children,
  onPress,
  onFocus,
  style,
  autoFocus,
  selected,
}: {
  children: ReactNode;
  onPress?: () => void;
  onFocus?: () => void;
  style?: StyleProp<ViewStyle>;
  autoFocus?: boolean;
  selected?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        onFocus?.();
      }}
      onBlur={() => setFocused(false)}
      hasTVPreferredFocus={autoFocus}
      style={[styles.cardBox, focused ? styles.cardBoxFocused : null, style]}
    >
      {focused && <View pointerEvents="none" style={[styles.layer, styles.trailDeep]} />}
      {focused && <View pointerEvents="none" style={[styles.layer, styles.trailLime]} />}
      <View
        pointerEvents="none"
        style={[styles.layer, styles.face, selected ? styles.selected : null, focused ? styles.faceFocused : null]}
      />
      {children}
    </Pressable>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted ? styles.muted : null]}>{children}</Text>;
}

const RADIUS = 20;

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 48,
  },
  card: {
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: RADIUS,
  },
  cardBox: {
    padding: 24,
    borderRadius: RADIUS,
  },
  cardBoxFocused: {
    transform: [{ scale: 1.04 }],
    zIndex: 2,
  },
  layer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: RADIUS,
  },
  trailDeep: {
    left: -20,
    right: 20,
    backgroundColor: colors.accentDeep,
  },
  trailLime: {
    left: -10,
    right: 10,
    backgroundColor: colors.accent,
  },
  face: {
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  faceFocused: {
    borderColor: colors.white,
    backgroundColor: colors.surfaceElevated,
  },
  selected: {
    backgroundColor: colors.surfaceElevated,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.title,
    fontFamily: font.semibold,
    marginBottom: 16,
  },
  body: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontFamily: font.regular,
  },
  muted: {
    color: colors.textSecondary,
  },
  brand: {
    color: colors.accent,
    fontFamily: font.semibold,
  },
  row: {
    flexDirection: 'row',
    gap: 24,
    alignItems: 'center',
  },
});
