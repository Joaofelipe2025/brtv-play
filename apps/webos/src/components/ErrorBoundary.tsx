import { Component, type ReactNode } from 'react';
import { Logo } from './Brand';

interface Props {
  children: ReactNode;
  onRecover(): void;
}

/**
 * Na TV não existe recarregar página: se uma tela quebrar, mostra uma saída
 * navegável pelo controle em vez de uma tela preta.
 */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error('Erro ao renderizar a tela:', error);
  }

  private recover = (): void => {
    this.setState({ failed: false });
    this.props.onRecover();
  };

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="screen" style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
        <Logo height={96} />
        <h1 style={{ marginTop: 40 }}>Esta tela não abriu</h1>
        <p className="muted" style={{ marginTop: 16, maxWidth: 900 }}>
          Algo inesperado aconteceu. Volte ao início para continuar assistindo.
        </p>
        <button
          className="focusable btn btn--primary btn--lg"
          style={{ marginTop: 40 }}
          ref={(el) => el?.focus()}
          onClick={this.recover}
        >
          Voltar ao início
        </button>
      </div>
    );
  }
}
