import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import QRCode from 'qrcode';
import { useApp } from '../context';
import { ACTIVATION_URL, daysLeft, loadDevice } from '../device';
import { fetchStatus } from '../library';
import { useAutoFocus } from '../hooks';
import { Clock, Logo } from '../components/Brand';

const POLL_MS = 10_000;

const stagger = (i: number) => ({ '--i': i }) as CSSProperties;

export function Activation() {
  const { session, update, reset } = useApp();
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const device = session.device;

  useEffect(() => {
    if (!device) void loadDevice().then((d) => update({ device: d }));
  }, [device, update]);

  useEffect(() => {
    if (!device) return;
    const url = `${ACTIVATION_URL}?mac=${encodeURIComponent(device.mac)}`;
    void QRCode.toDataURL(url, { margin: 0, width: 416, color: { dark: '#06080B', light: '#FEFEFE' } }).then(setQr);
  }, [device]);

  const check = useCallback(async () => {
    if (!device) return;
    setChecking(true);
    try {
      const status = await fetchStatus(device.mac, device.key);
      update({ status });
      setError(null);
      const [first] = status.playlists;
      if (status.playlists.length === 1 && first) {
        update({ playlist: first });
        reset({ name: 'home' });
      } else if (status.playlists.length > 1) {
        reset({ name: 'playlists' });
      }
    } catch {
      setError('Sem conexão com o servidor. Nova tentativa em 10 segundos.');
    } finally {
      setChecking(false);
    }
  }, [device, update, reset]);

  // Polling a cada 10s até existir playlist
  useEffect(() => {
    if (!device) return;
    void check();
    const id = window.setInterval(() => void check(), POLL_MS);
    return () => window.clearInterval(id);
  }, [device, check]);

  useAutoFocus(true, [device?.mac]);

  const status = session.status;
  const expired = status?.status === 'expired';
  const statusText = !status
    ? 'Verificando…'
    : status.status === 'trial'
      ? `Teste grátis: ${daysLeft(status.expiresAt)} dias restantes`
      : status.status === 'active'
        ? 'Ativo'
        : 'Teste expirado';

  return (
    <div className="screen">
      <header className="topbar">
        <Logo height={84} className="enter" />
        <Clock />
      </header>

      <div className="activation">
        <div className="vstack" style={{ '--sp': '28px' } as CSSProperties}>
          <h1 className="enter" style={{ ...stagger(1), fontSize: 64 }}>
            Ative este aparelho
          </h1>

          <ol className="steps enter" style={stagger(2)}>
            <li>
              No celular ou computador, abra <span style={{ color: 'var(--lime)', fontWeight: 600 }}>{ACTIVATION_URL.replace('https://', '')}</span>
            </li>
            <li>Digite o MAC e a chave que aparecem abaixo</li>
            <li>Cadastre sua lista. Esta tela atualiza sozinha.</li>
          </ol>

          <div className="hstack enter" style={{ ...stagger(3), '--sp': '24px', alignItems: 'stretch' } as CSSProperties}>
            <div className="card" style={{ flex: 1.4 }}>
              <div className="label">MAC</div>
              <div className="code">{device?.mac ?? '—'}</div>
            </div>
            <div className="card" style={{ flex: 1 }}>
              <div className="label">Chave</div>
              <div className="code">{device?.key ?? '—'}</div>
            </div>
          </div>

          <div className="hstack enter" style={stagger(4)}>
            <span className={`status ${expired ? 'status--expired' : ''}`}>{statusText}</span>
            <button data-fk="activation-check" data-autofocus className="focusable btn" onClick={() => !checking && void check()}>
              {checking ? 'Verificando…' : 'Verificar agora'}
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>

        <div className="vstack enter" style={{ ...stagger(3), alignItems: 'center', '--sp': '20px' } as CSSProperties}>
          <div className="qr">{qr && <img src={qr} alt={`QR code para ${ACTIVATION_URL}`} />}</div>
          <p className="muted" style={{ textAlign: 'center' }}>
            Aponte a câmera do celular para abrir o portal com o MAC já preenchido
          </p>
        </div>
      </div>

      <p className="disclaimer">
        O BRTV PLAY é apenas um reprodutor. Não fornece nenhum conteúdo. O usuário é responsável pelas listas que adiciona.
      </p>
    </div>
  );
}
