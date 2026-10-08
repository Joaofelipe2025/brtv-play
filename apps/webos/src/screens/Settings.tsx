import { useMemo, useState, type CSSProperties } from 'react';
import { useStore } from 'zustand';
import { useApp } from '../context';
import { useAutoFocus } from '../hooks';
import { savePreferences, store, type StreamFormat } from '../platform';
import { Logo, TopBar } from '../components/Brand';

const FORMATS: { value: StreamFormat; label: string }[] = [
  { value: 'hls', label: 'HLS' },
  { value: 'ts', label: 'MPEG-TS' },
];

export function Settings() {
  const { session, update, go } = useApp();
  const blocked = useStore(store, (s) => s.blockedCategories);
  const hasPin = useStore(store, (s) => s.parentalPin !== null);
  const [pin, setPin] = useState('');
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const groups = useMemo(() => {
    const set = new Set<string>();
    const lib = session.library;
    for (const c of lib?.live ?? []) set.add(c.group);
    for (const m of lib?.movies ?? []) set.add(m.group);
    for (const s of lib?.series ?? []) set.add(s.group);
    return Array.from(set);
  }, [session.library]);

  useAutoFocus(true);

  const setFormat = async (streamFormat: StreamFormat) => {
    const prefs = { streamFormat };
    update({ prefs });
    await savePreferences(prefs);
  };

  const savePin = () => {
    if (pin.length !== 4) {
      setPinMsg('O PIN precisa ter 4 dígitos.');
      return;
    }
    store.getState().setParentalPin(pin);
    setPinMsg('PIN salvo. Categorias bloqueadas pedirão este PIN.');
    setPin('');
  };

  const toggleBlock = (group: string) => {
    if (!hasPin) {
      setPinMsg('Defina um PIN antes de bloquear categorias.');
      return;
    }
    store.getState().setCategoryBlocked(group, !blocked.includes(group));
  };

  return (
    <div className="screen">
      <TopBar active="settings" />

      <div className="settings">
        <div className="scroll vstack" style={{ '--sp': '24px' } as CSSProperties}>
          <section className="card">
            <h3>Este aparelho</h3>
            <div className="hstack" style={{ marginTop: 16, '--sp': '48px' } as CSSProperties}>
              <div>
                <div className="label">MAC</div>
                <div className="num" style={{ fontSize: 36, fontWeight: 600 }}>
                  {session.device?.mac ?? '—'}
                </div>
              </div>
              <div>
                <div className="label">Chave</div>
                <div className="num" style={{ fontSize: 36, fontWeight: 600 }}>
                  {session.device?.key ?? '—'}
                </div>
              </div>
            </div>
          </section>

          <section className="card">
            <h3>Reprodução</h3>
            <p className="muted" style={{ marginTop: 8 }}>
              Formato pedido às contas Xtream. Troque para MPEG-TS se os canais travarem.
            </p>
            <div className="segmented" style={{ marginTop: 16 }}>
              {FORMATS.map((f) => (
                <button
                  key={f.value}
                  data-fk={`format-${f.value}`}
                  className={`focusable pill ${session.prefs.streamFormat === f.value ? 'is-active' : ''}`}
                  onClick={() => void setFormat(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </section>

          <section className="card">
            <h3>Lista</h3>
            <p className="muted" style={{ marginTop: 8 }}>{session.playlist?.name ?? 'Nenhuma lista carregada'}</p>
            <div className="hstack" style={{ marginTop: 16, '--sp': '16px' } as CSSProperties}>
              <button
                data-fk="reload"
                data-autofocus
                className="focusable btn btn--primary"
                onClick={() => {
                  update({ reloadToken: session.reloadToken + 1 });
                  setNotice('Recarregando a lista…');
                }}
              >
                Recarregar lista
              </button>
              <button
                data-fk="clear"
                className="focusable btn"
                onClick={() => {
                  store.setState({ history: [], continueWatching: {} });
                  setNotice('Histórico e posições apagados.');
                }}
              >
                Limpar histórico
              </button>
            </div>
            {notice && (
              <p className="muted" style={{ marginTop: 12 }}>
                {notice}
              </p>
            )}
          </section>

          <button data-fk="about" className="focusable card" onClick={() => go({ name: 'about' })}>
            <h3>Sobre e termos</h3>
            <p className="muted" style={{ marginTop: 8 }}>Versão, aviso de uso e responsabilidade</p>
          </button>
        </div>

        <div className="scroll vstack" style={{ '--sp': '24px' } as CSSProperties}>
          <section className="card">
            <h3>Controle parental</h3>
            <p className="muted" style={{ marginTop: 8 }}>
              {hasPin ? 'PIN ativo. Digite um novo para trocar.' : 'Defina um PIN de 4 dígitos para bloquear categorias.'}
            </p>
            <div className="hstack" style={{ marginTop: 16, '--sp': '16px' } as CSSProperties}>
              <input
                className="focusable pin num"
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                  setPinMsg(null);
                }}
                aria-label="Novo PIN"
              />
              <button data-fk="pin-save" className="focusable btn btn--primary" onClick={savePin}>
                Salvar PIN
              </button>
              {hasPin && (
                <button
                  data-fk="pin-remove"
                  className="focusable btn"
                  onClick={() => {
                    store.getState().setParentalPin(null);
                    setPinMsg('PIN removido.');
                  }}
                >
                  Remover
                </button>
              )}
            </div>
            {pinMsg && (
              <p className="muted" style={{ marginTop: 12 }}>
                {pinMsg}
              </p>
            )}
          </section>

          <section className="card">
            <h3>Categorias bloqueadas</h3>
            {groups.length === 0 && (
              <p className="muted" style={{ marginTop: 8 }}>
                Nenhuma categoria carregada.
              </p>
            )}
            <div style={{ marginTop: 12 }}>
              {groups.map((g) => (
                <button key={g} data-fk={`block-${g}`} className="focusable row-item" onClick={() => toggleBlock(g)}>
                  <span className="ellipsis">{g}</span>
                  <span className="count" style={{ color: blocked.includes(g) ? 'var(--lime)' : undefined }}>
                    {blocked.includes(g) ? 'Bloqueada' : 'Liberada'}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export function About() {
  useAutoFocus(true);
  const { back } = useApp();
  return (
    <div className="screen">
      <TopBar />
      <div className="vstack" style={{ flex: 1, justifyContent: 'center', maxWidth: 1200, '--sp': '32px' } as CSSProperties}>
        <Logo height={180} />
        <p className="muted num">Versão 0.1.0</p>
        <p style={{ fontSize: 36, fontWeight: 500, lineHeight: 1.35 }}>
          O BRTV PLAY é apenas um reprodutor. Não fornece nenhum conteúdo. O usuário é responsável pelas listas que adiciona.
        </p>
        <p className="muted">
          O aplicativo reproduz somente as listas e contas cadastradas pelo próprio usuário no portal. Os vídeos de demonstração são streams públicos de teste.
        </p>
        <div>
          <button className="focusable btn" onClick={back}>
            Voltar
          </button>
        </div>
      </div>
    </div>
  );
}
