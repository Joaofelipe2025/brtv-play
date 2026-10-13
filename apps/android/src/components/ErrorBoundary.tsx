import { Component, type ReactNode } from 'react';
import { View } from 'react-native';
import { colors } from '@brtv/core';
import { FocusCard, Logo, Text, font, styles } from '../ui';

interface Props {
  children: ReactNode;
  onRecover(): void;
}

/**
 * Na TV não existe recarregar a tela: se uma tela quebrar, mostra uma saída
 * navegável pelo controle em vez de uma tela preta.
 */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error('Erro ao renderizar a tela:', error);
  }

  private recover = (): void => {
    this.setState({ failed: false });
    this.props.onRecover();
  };

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={[styles.screen, { justifyContent: 'center', alignItems: 'flex-start' }]}>
        <Logo height={96} />
        <Text style={{ marginTop: 40, color: colors.textPrimary, fontSize: 48, fontFamily: font.bold }}>
          Esta tela não abriu
        </Text>
        <Text style={{ marginTop: 16, maxWidth: 900, color: colors.textSecondary, fontSize: 26 }}>
          Algo inesperado aconteceu. Volte ao início para continuar assistindo.
        </Text>
        <FocusCard autoFocus onPress={this.recover} style={{ marginTop: 40 }}>
          <Text style={{ color: colors.accent, fontSize: 30, fontFamily: font.semibold }}>Voltar ao início</Text>
        </FocusCard>
      </View>
    );
  }
}
