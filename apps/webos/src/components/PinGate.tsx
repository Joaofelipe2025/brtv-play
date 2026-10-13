import { useEffect, useRef, useState } from 'react';
import { store } from '../platform';

interface PinGateProps {
  category: string;
  onUnlock(): void;
  onCancel(): void;
}

/** Pede o PIN parental de 4 dígitos para liberar uma categoria bloqueada. */
export function PinGate({ category, onUnlock, onCancel }: PinGateProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    if (store.getState().verifyPin(pin)) {
      onUnlock();
    } else {
      setError('PIN incorreto. Tente de novo.');
      setPin('');
      inputRef.current?.focus();
    }
  };

  return (
    <div className="card vstack" style={{ maxWidth: 640, margin: '40px auto', '--sp': '20px' } as React.CSSProperties}>
      <h2>Categoria bloqueada</h2>
      <p className="muted">Digite o PIN parental para abrir “{category}”.</p>
      <input
        ref={inputRef}
        data-autofocus
        className="focusable pin num"
        type="password"
        inputMode="numeric"
        maxLength={4}
        value={pin}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, '').slice(0, 4);
          setPin(next);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && pin.length === 4) submit();
        }}
        aria-label="PIN parental"
      />
      {error && <p className="error">{error}</p>}
      <div className="hstack">
        <button className="focusable btn btn--primary" onClick={submit} disabled={pin.length !== 4}>
          Desbloquear
        </button>
        <button className="focusable btn" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
