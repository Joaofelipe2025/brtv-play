import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { useStore } from 'zustand';
import { currentAndNext } from '@brtv/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FAVORITES, useApp } from '../context';
import { useAutoFocus } from '../hooks';
import { store } from '../platform';
import type { LiveItem } from '../library';
import { PinGate } from '../components/PinGate';
import { Progress, TopBar } from '../components/Brand';
import { ChannelLogo } from '../components/Artwork';
import { PreviewVideo } from '../components/PreviewVideo';
import { elapsed, formatHour } from '../format';

const ROW_HEIGHT = 108;

export function Live({ category }: { category?: string }) {
  const { session, update, go, replace } = useApp();
  const favorites = useStore(store, (s) => s.favorites);
  const blocked = useStore(store, (s) => s.blockedCategories);
  const live = useMemo(() => session.library?.live ?? [], [session.library]);
  const now = Date.now();

  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of live) counts.set(c.group, (counts.get(c.group) ?? 0) + 1);
    return Array.from(counts, ([name, count]) => ({ name, count }));
  }, [live]);

  const selectedGroup = category ?? groups[0]?.name ?? null;
  const [pendingGroup, setPendingGroup] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const channels: LiveItem[] = useMemo(() => {
    if (selectedGroup === FAVORITES) return live.filter((c) => favorites.includes(c.id));
    if (!selectedGroup) return [];
    return live.filter((c) => c.group === selectedGroup);
  }, [live, selectedGroup, favorites]);

  const preview = channels.find((c) => c.id === selectedId) ?? channels[0] ?? null;
  const previewEpg = preview ? currentAndNext(session.epg, preview.epgId ?? preview.id, now) : null;

  const listRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: channels.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  });

  useAutoFocus(live.length > 0, [live.length]);

  const isLocked = (group: string) =>
    group !== FAVORITES && blocked.includes(group) && !session.unlockedCategories.includes(group);

  const chooseGroup = (group: string) => {
    if (isLocked(group)) {
      setPendingGroup(group);
      return;
    }
    setSelectedId(null);
    // Guarda a categoria na rota: ao voltar do player, a lista é a mesma
    replace({ name: 'live', category: group });
  };

  const play = (channel: LiveItem) => {
    go({
      name: 'player',
      url: channel.url,
      title: channel.name,
      isLive: true,
      channels,
      index: channels.indexOf(channel),
    });
  };

  if (live.length === 0) {
    return (
      <div className="screen">
        <TopBar active={selectedGroup === FAVORITES ? "favorites" : "live"} />
        <div className="empty">
          <h2>{session.loading ? 'Carregando canais…' : 'Nenhum canal nesta lista'}</h2>
          {!session.loading && (
            <p className="muted">Confira a lista no portal ou recarregue em Configurações.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <TopBar active={selectedGroup === FAVORITES ? "favorites" : "live"} />
      <div className="live">
        {/* Categorias */}
        <div className="scroll">
          <button
            data-fk="cat-favoritos"
            className={`focusable row-item ${selectedGroup === FAVORITES ? 'is-active' : ''}`}
            onClick={() => chooseGroup(FAVORITES)}
          >
            Favoritos
            <span className="count">{favorites.length}</span>
          </button>
          {groups.map((g) => (
            <button
              key={g.name}
              data-fk={`cat-${g.name}`}
              className={`focusable row-item ${selectedGroup === g.name ? 'is-active' : ''}`}
              onClick={() => chooseGroup(g.name)}
            >
              <span className="ellipsis">{g.name}</span>
              <span className="count">{blocked.includes(g.name) ? 'Bloqueada' : g.count}</span>
            </button>
          ))}
        </div>

        {/* Canais */}
        <div ref={listRef} className="scroll" style={{ position: 'relative' }}>
          {pendingGroup ? (
            <PinGate
              category={pendingGroup}
              onUnlock={() => {
                update({ unlockedCategories: [...session.unlockedCategories, pendingGroup] });
                replace({ name: 'live', category: pendingGroup });
                setPendingGroup(null);
              }}
              onCancel={() => setPendingGroup(null)}
            />
          ) : channels.length === 0 ? (
            <div className="empty" style={{ marginTop: 80 }}>
              <h3>{selectedGroup === FAVORITES ? 'Nenhum favorito ainda' : 'Categoria vazia'}</h3>
              {selectedGroup === FAVORITES && (
                <p className="muted">Escolha um canal e aperte “Favoritar” para ele aparecer aqui.</p>
              )}
            </div>
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map((vi) => {
                const channel = channels[vi.index];
                if (!channel) return null;
                const epg = currentAndNext(session.epg, channel.epgId ?? channel.id, now).current;
                return (
                  <button
                    key={channel.id}
                    data-fk={`ch-${channel.id}`}
                    data-autofocus={vi.index === 0 ? true : undefined}
                    className={`focusable row-item channel ${preview?.id === channel.id ? 'is-active' : ''}`}
                    style={{ position: 'absolute', top: 0, left: 0, height: ROW_HEIGHT - 8, transform: `translateY(${vi.start}px)` }}
                    onFocus={() => setSelectedId(channel.id)}
                    onClick={() => play(channel)}
                  >
                    <span className="channel__num">{vi.index + 1}</span>
                    <ChannelLogo src={channel.logo} name={channel.name} />
                    <span className="channel__body">
                      <span className="ellipsis" style={{ display: 'block' }}>
                        {favorites.includes(channel.id) ? '★ ' : ''}
                        {channel.name}
                      </span>
                      {epg && (
                        <>
                          <span className="channel__now ellipsis" style={{ display: 'block' }}>
                            {epg.title}
                          </span>
                          <Progress value={elapsed(epg.start, epg.stop, now)} />
                        </>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Prévia */}
        <div className="preview">
          {preview && (
            <>
              <div className="preview__screen">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-2)' }}>
                  <ChannelLogo src={preview.logo} name={preview.name} />
                </div>
                <PreviewVideo url={preview.url} />
                <span className="live-pill" style={{ position: 'absolute' }}>
                  Ao vivo
                </span>
              </div>

              <div className="vstack" style={{ marginTop: 28, '--sp': '10px' } as CSSProperties}>
                <h2 className="ellipsis">{preview.name}</h2>
                <span className="muted">{preview.group}</span>
              </div>

              <div className="vstack" style={{ marginTop: 24, '--sp': '8px' } as CSSProperties}>
                {previewEpg?.current ? (
                  <>
                    <span className="label num">
                      Agora, das {formatHour(previewEpg.current.start)} às {formatHour(previewEpg.current.stop)}
                    </span>
                    <span className="ellipsis" style={{ fontSize: 32, fontWeight: 600 }}>
                      {previewEpg.current.title}
                    </span>
                    <Progress value={elapsed(previewEpg.current.start, previewEpg.current.stop, now)} />
                  </>
                ) : (
                  <span className="muted">Sem guia de programação para este canal</span>
                )}
                {previewEpg?.next && (
                  <span className="muted ellipsis" style={{ marginTop: 12 }}>
                    A seguir, {formatHour(previewEpg.next.start)}: {previewEpg.next.title}
                  </span>
                )}
              </div>

              <div className="hstack" style={{ marginTop: 'auto', '--sp': '20px' } as CSSProperties}>
                <button data-fk="preview-play" className="focusable btn btn--primary" onClick={() => play(preview)}>
                  Assistir
                </button>
                <button
                  data-fk="preview-fav"
                  className="focusable btn"
                  onClick={() => store.getState().toggleFavorite(preview.id)}
                >
                  {favorites.includes(preview.id) ? 'Remover dos favoritos' : 'Favoritar'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
