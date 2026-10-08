import type { CSSProperties } from 'react';
import { useApp } from '../context';
import { useAutoFocus } from '../hooks';
import { Clock, KeyHints, Logo } from '../components/Brand';

/** Antes de escolher a lista não há abas: ainda não existe conteúdo para navegar. */
export function Playlists() {
  const { session, update, reset } = useApp();
  const list = session.status?.playlists ?? [];
  useAutoFocus(true);

  return (
    <div className="screen">
      <header className="topbar">
        <Logo className="topbar__logo" />
        <Clock />
      </header>
      <h1 className="enter">Qual lista você quer abrir?</h1>
      <div className="home-grid" style={{ marginTop: 40 }}>
        {list.map((p, i) => (
          <button
            key={p.id}
            data-fk={`playlist-${p.id}`}
            data-autofocus={i === 0 ? true : undefined}
            className="focusable tile enter"
            style={{ '--i': i + 1, minHeight: 240 } as CSSProperties}
            onClick={() => {
              update({ playlist: p });
              reset({ name: 'home' });
            }}
          >
            <span className="tile__label">{p.name}</span>
            <span className="tile__hint">{p.kind === 'xtream' ? 'Conta Xtream Codes' : 'Lista M3U'}</span>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 'auto' }}>
        <KeyHints />
      </div>
    </div>
  );
}
