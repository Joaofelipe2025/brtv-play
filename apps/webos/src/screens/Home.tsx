import { useMemo, useState, type CSSProperties } from 'react';
import { currentAndNext } from '@brtv/core';
import { useStore } from 'zustand';
import { useApp } from '../context';
import { useAutoFocus, useDebounced } from '../hooks';
import { store } from '../platform';
import { KeyHints, Progress, TopBar } from '../components/Brand';
import { tintFor } from '../components/Artwork';
import { PreviewVideo } from '../components/PreviewVideo';
import { ArrowRightIcon, GuideIcon, PlayIcon } from '../components/Icons';
import type { LiveItem } from '../library';
import { elapsed, formatHour } from '../format';

const RAIL_SIZE = 12;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** Miniatura 16:9 do canal: logo da lista sobre o tom da marca, ou iniciais. */
function ChannelThumb({ channel, badge, progress }: { channel: LiveItem; badge?: string; progress: number | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="chcard__thumb" style={{ '--tint': tintFor(channel.name) } as CSSProperties}>
      <div className="art art--fallback chcard__art">
        {channel.logo && !failed ? (
          <img src={channel.logo} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
        ) : (
          <span className="chcard__initials">{initials(channel.name)}</span>
        )}
      </div>
      {badge && <span className="badge">{badge}</span>}
      <div className="chcard__live">
        <span className="dot" />
        AO VIVO
        {progress !== null && (
          <span style={{ flex: 1, marginLeft: 14 }}>
            <Progress value={progress} />
          </span>
        )}
      </div>
    </div>
  );
}

export function Home() {
  const { session, go } = useApp();
  const history = useStore(store, (s) => s.history);
  const library = session.library;
  const live = useMemo(() => library?.live ?? [], [library]);
  const isDemo = session.playlist?.id === 'demo';
  const now = Date.now();

  // Destaque inicial: último canal assistido; sem histórico, o primeiro da lista
  const lastLiveId = history.find((h) => h.type === 'live')?.id;
  const initial = live.find((c) => c.url === lastLiveId || c.id === lastLiveId) ?? live[0] ?? null;
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // O destaque segue o card focado, com um pequeno atraso para não piscar ao percorrer
  const heroId = useDebounced(focusedId, 250);
  const hero = live.find((c) => c.id === heroId) ?? initial;
  const heroIndex = hero ? live.indexOf(hero) : -1;
  const heroEpg = hero ? currentAndNext(session.epg, hero.epgId ?? hero.id, now) : null;

  // Trilho: o destaque primeiro, depois os demais
  const rail = useMemo(() => {
    const first = initial ? [initial] : [];
    return [...first, ...live.filter((c) => c !== initial)].slice(0, RAIL_SIZE);
  }, [live, initial]);

  useAutoFocus(!session.loading && live.length > 0, [session.loading, live.length]);

  const watch = (channel: LiveItem) =>
    go({ name: 'player', url: channel.url, title: channel.name, isLive: true, channels: live, index: live.indexOf(channel) });

  const title = heroEpg?.current?.title ?? hero?.name ?? 'Sua TV, do seu jeito';
  const subtitle =
    heroEpg?.current?.description ??
    (hero ? `Ao vivo agora em ${hero.group}.` : session.loading ? 'Carregando sua lista…' : 'Nenhum canal nesta lista ainda.');

  return (
    <div className="screen screen--home">
      {/* Fundo: o próprio canal ao vivo, sem som */}
      <div className="home-bg" aria-hidden="true" style={{ '--tint': tintFor(hero?.name ?? 'brtv') } as CSSProperties}>
        <div className="home-bg__art" />
        <PreviewVideo url={hero?.url ?? null} delay={600} />
        <div className="home-bg__shade" />
      </div>

      <TopBar active="home" />

      <section className="home-hero" key={hero?.id ?? 'empty'}>
        {hero && (
          <div className="hstack" style={{ '--sp': '18px' } as CSSProperties}>
            <span className="chip-live">AO VIVO</span>
            <span style={{ fontSize: 28, fontWeight: 500 }}>{hero.name}</span>
          </div>
        )}
        <h1 className="home-hero__title">{title}</h1>
        <p className="home-hero__sub ellipsis">{subtitle}</p>

        {hero && (
          <>
            <div className="hstack home-hero__actions" style={{ '--sp': '24px' } as CSSProperties}>
              <button
                data-fk="home-watch"
                data-autofocus
                className="focusable btn btn--primary btn--lg"
                onClick={() => watch(hero)}
              >
                <PlayIcon />
                Assistir agora
              </button>
              <button data-fk="home-guide" className="focusable btn btn--ghost btn--lg" onClick={() => go({ name: 'live', category: hero.group })}>
                <GuideIcon />
                Guia de TV
              </button>
            </div>
            <p className="home-hero__meta num">
              {hero.group}
              {heroEpg?.current
                ? ` • ${formatHour(heroEpg.current.start)} às ${formatHour(heroEpg.current.stop)}`
                : heroIndex >= 0
                  ? ` • Canal ${heroIndex + 1}`
                  : ''}
            </p>
          </>
        )}
      </section>

      {rail.length > 0 && (
        <section className="rail">
          <div className="rail__head">
            <h2>Seus canais</h2>
            <button data-fk="home-all" className="focusable link-btn" onClick={() => go({ name: 'live' })}>
              Ver todos
              <ArrowRightIcon />
            </button>
          </div>
          <div className="scroll-x rail__cards">
            {rail.map((c) => {
              const epg = currentAndNext(session.epg, c.epgId ?? c.id, now).current;
              return (
                <button
                  key={c.id}
                  data-fk={`home-ch-${c.id}`}
                  className="focusable chcard"
                  onFocus={() => setFocusedId(c.id)}
                  onClick={() => watch(c)}
                >
                  <ChannelThumb
                    channel={c}
                    badge={isDemo ? 'DEMO' : undefined}
                    progress={epg ? elapsed(epg.start, epg.stop, now) : null}
                  />
                  <div className="chcard__name ellipsis">{c.name}</div>
                  <div className="chcard__sub ellipsis">{epg?.title ?? c.group}</div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <KeyHints />
    </div>
  );
}
