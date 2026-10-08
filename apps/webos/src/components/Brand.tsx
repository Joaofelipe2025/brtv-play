import { LOGO_DARK_SVG } from '@brtv/core';
import { FAVORITES, useApp, type Route } from '../context';
import { useNow } from '../hooks';
import { BackIcon, GearIcon, SearchIcon } from './Icons';

/** Data URI calculado uma vez: o logo é o mesmo em todo o app. */
const LOGO_SRC = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOGO_DARK_SVG)}`;

export function Logo({ height = 60, className }: { height?: number; className?: string }) {
  return <img src={LOGO_SRC} alt="BRTV Play" className={className} style={{ height, width: 'auto' }} />;
}

const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function Clock() {
  const now = useNow();
  return <div className="clock__time">{timeFmt.format(now)}</div>;
}

export type Tab = 'home' | 'live' | 'movies' | 'series' | 'favorites' | 'search' | 'settings';

const TABS: { key: Tab; label: string; route: Route }[] = [
  { key: 'home', label: 'Início', route: { name: 'home' } },
  { key: 'live', label: 'TV ao vivo', route: { name: 'live' } },
  { key: 'movies', label: 'Filmes', route: { name: 'movies' } },
  { key: 'series', label: 'Séries', route: { name: 'series' } },
  { key: 'favorites', label: 'Favoritos', route: { name: 'live', category: FAVORITES } },
];

/**
 * Barra superior com navegação por abas. A partir da Início, abrir uma aba empilha a tela
 * (Voltar retorna à Início); entre abas, a tela é trocada para não acumular histórico.
 */
export function TopBar({ active }: { active?: Tab }) {
  const { go, replace, reset } = useApp();
  const open = (route: Route) => {
    if (route.name === 'home') reset(route);
    else if (active === 'home') go(route);
    else replace(route);
  };

  return (
    <header className="topbar">
      <Logo className="topbar__logo" />
      <span className="topbar__divider" />
      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            data-fk={`tab-${t.key}`}
            className={`focusable tab ${active === t.key ? 'is-active' : ''}`}
            onClick={() => active !== t.key && open(t.route)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="topbar__right hstack">
        <button
          data-fk="tab-search"
          className={`focusable icon-btn ${active === 'search' ? 'is-active' : ''}`}
          aria-label="Buscar"
          onClick={() => open({ name: 'movies' })}
        >
          <SearchIcon />
        </button>
        <button
          data-fk="tab-settings"
          className={`focusable icon-btn ${active === 'settings' ? 'is-active' : ''}`}
          aria-label="Configurações"
          onClick={() => active !== 'settings' && open({ name: 'settings' })}
        >
          <GearIcon />
        </button>
        <span className="topbar__divider" style={{ margin: '0 8px 0 12px' }} />
        <Clock />
      </div>
    </header>
  );
}

/** Dicas do controle no rodapé. */
export function KeyHints() {
  return (
    <footer className="keyhints">
      <span className="key">OK</span>
      <span>Selecionar</span>
      <span className="keyhints__sep" />
      <BackIcon />
      <span>Voltar</span>
    </footer>
  );
}

export function Progress({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}
