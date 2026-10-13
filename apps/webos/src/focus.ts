import { digitOf, mapWebosKey, type RemoteAction } from '@brtv/core';

/**
 * Navegação espacial por D-pad. Todo elemento com a classe `focusable` entra no
 * conjunto de foco. As setas movem para o vizinho mais próximo na direção pedida.
 * Elementos com `data-fk` (focus key) podem ter o foco restaurado ao voltar de uma tela.
 */
type Direction = 'up' | 'down' | 'left' | 'right';

const FOCUSABLE = '.focusable';
const PRESS_MS = 140;

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** Desabilitados não recebem foco: incluí-los faria o foco "sumir" no controle. */
function isEnabled(el: HTMLElement): boolean {
  return !(el as HTMLButtonElement).disabled;
}

export function focusables(scope: ParentNode = document): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => isEnabled(el) && isVisible(el),
  );
}

function focusElement(el: HTMLElement): void {
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

export function focusFirst(scope: ParentNode = document): void {
  const first = focusables(scope)[0];
  if (first) focusElement(first);
}

/* ---------- Memória de foco ---------- */

let pendingRestore: string | null = null;

/** Chave de foco do elemento atual (o próprio ou o ancestral mais próximo com data-fk). */
export function currentFocusKey(): string | null {
  const active = document.activeElement as HTMLElement | null;
  const owner = active?.closest<HTMLElement>('[data-fk]');
  return owner?.dataset.fk ?? null;
}

/** Agenda a restauração do foco para a próxima tela que chamar `restoreOrFocusFirst`. */
export function scheduleFocusRestore(key: string | null): void {
  pendingRestore = key;
}

/** Restaura o foco agendado; se o elemento não existir, foca o primeiro item. */
export function restoreOrFocusFirst(): void {
  if (pendingRestore) {
    const key = pendingRestore;
    const target = Array.from(document.querySelectorAll<HTMLElement>('[data-fk]')).find(
      (el) => el.dataset.fk === key,
    );
    if (target && isVisible(target)) {
      pendingRestore = null;
      focusElement(target);
      return;
    }
  }
  pendingRestore = null;
  // Sem foco salvo: o conteúdo principal da tela (data-autofocus), não as abas do topo
  const preferred = focusables().find((el) => el.hasAttribute('data-autofocus'));
  if (preferred) {
    focusElement(preferred);
    return;
  }
  focusFirst();
}

/* ---------- Movimento ---------- */

export function moveFocus(direction: Direction): void {
  const all = focusables();
  if (all.length === 0) return;

  const active = document.activeElement as HTMLElement | null;
  if (!active || !all.includes(active)) {
    focusElement(all[0]!);
    return;
  }

  const a = active.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;

  let best: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const el of all) {
    if (el === active) continue;
    const r = el.getBoundingClientRect();
    const dx = r.left + r.width / 2 - ax;
    const dy = r.top + r.height / 2 - ay;

    let primary: number;
    let secondary: number;
    switch (direction) {
      case 'right':
        if (dx <= 1) continue;
        primary = dx;
        secondary = Math.abs(dy);
        break;
      case 'left':
        if (dx >= -1) continue;
        primary = -dx;
        secondary = Math.abs(dy);
        break;
      case 'down':
        if (dy <= 1) continue;
        primary = dy;
        secondary = Math.abs(dx);
        break;
      case 'up':
        if (dy >= -1) continue;
        primary = -dy;
        secondary = Math.abs(dx);
        break;
    }

    const score = primary + secondary * 2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  if (best) focusElement(best);
}

/* ---------- Teclas ---------- */

/** Teclas de navegação: keyCodes LG, setas e Escape (Voltar no navegador). */
function keyToAction(e: KeyboardEvent): RemoteAction | null {
  const byCode = mapWebosKey(e.keyCode);
  if (byCode) return byCode;
  switch (e.key) {
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    case 'Enter':
      return 'ok';
    case 'Escape':
      return 'back';
    case 'PageUp':
      return 'channelUp';
    case 'PageDown':
      return 'channelDown';
    default:
      return null;
  }
}

/** Interceptador opcional (ex.: player usa cima/baixo para trocar canal). Retorna true se consumiu a tecla. */
type Interceptor = (action: RemoteAction) => boolean;
let interceptor: Interceptor | null = null;

export function setKeyInterceptor(fn: Interceptor | null): void {
  interceptor = fn;
}

/** Feedback visual curto antes de executar o OK. */
function press(el: HTMLElement): void {
  el.classList.add('is-pressed');
  window.setTimeout(() => {
    el.classList.remove('is-pressed');
    el.click();
  }, PRESS_MS);
}

/**
 * Instala o tratador global de teclas. `onBack` é chamado no Voltar.
 * Demais ações (cores, canal) são despachadas como evento `brtv:key`.
 */
export function installRemote(onBack: () => void): () => void {
  const handler = (e: KeyboardEvent): void => {
    const action = keyToAction(e);
    if (!action) return;

    const target = e.target as HTMLElement | null;
    const typing = target instanceof HTMLInputElement;
    // Em campos de texto, esquerda/direita movem o cursor e os dígitos são digitados
    if (typing && (action === 'left' || action === 'right' || digitOf(action) !== null)) return;

    e.preventDefault();
    window.dispatchEvent(new CustomEvent<RemoteAction>('brtv:key', { detail: action }));
    if (interceptor && interceptor(action)) return;

    switch (action) {
      case 'up':
      case 'down':
      case 'left':
      case 'right':
        moveFocus(action);
        break;
      case 'ok': {
        const active = document.activeElement as HTMLElement | null;
        if (active && active.classList.contains('focusable') && !typing) press(active);
        break;
      }
      case 'back':
        onBack();
        break;
      default:
        break;
    }
  };

  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
