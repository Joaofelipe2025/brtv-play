/**
 * Códigos do controle remoto. Android TV usa nomes de tecla; webOS usa keyCodes LG.
 * Ambos são mapeados para uma ação comum, para que a UI não conheça a plataforma.
 */
export type RemoteAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'ok'
  | 'back'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'channelUp'
  | 'channelDown'
  | 'play'
  | 'pause'
  | 'playPause'
  | 'stop'
  | 'fastForward'
  | 'rewind'
  | `digit${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;

/** keyCodes do controle LG webOS. */
export const WEBOS_KEYS: Readonly<Record<number, RemoteAction>> = {
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  13: 'ok',
  461: 'back',
  403: 'red',
  404: 'green',
  405: 'yellow',
  406: 'blue',
  427: 'channelUp',
  428: 'channelDown',
  415: 'play',
  19: 'pause',
  413: 'stop',
  417: 'fastForward',
  412: 'rewind',
  48: 'digit0',
  49: 'digit1',
  50: 'digit2',
  51: 'digit3',
  52: 'digit4',
  53: 'digit5',
  54: 'digit6',
  55: 'digit7',
  56: 'digit8',
  57: 'digit9',
};

/** Nomes de tecla do Android (KeyEvent / react-native-tvos). */
export const ANDROID_KEYS: Readonly<Record<string, RemoteAction>> = {
  DPadUp: 'up',
  DPadDown: 'down',
  DPadLeft: 'left',
  DPadRight: 'right',
  DPadCenter: 'ok',
  Enter: 'ok',
  Back: 'back',
  GoBack: 'back',
  ChannelUp: 'channelUp',
  ChannelDown: 'channelDown',
  ColorF0Red: 'red',
  ColorF1Green: 'green',
  ColorF2Yellow: 'yellow',
  ColorF3Blue: 'blue',
  // Nomes emitidos pelo useTVEventHandler (react-native-tvos). 'menu' não é mapeado.
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  select: 'ok',
  channelUp: 'channelUp',
  channelDown: 'channelDown',
  playPause: 'playPause',
  play: 'play',
  pause: 'pause',
  stop: 'stop',
  fastForward: 'fastForward',
  rewind: 'rewind',
};

export function mapWebosKey(keyCode: number): RemoteAction | null {
  return WEBOS_KEYS[keyCode] ?? null;
}

export function mapAndroidKey(name: string): RemoteAction | null {
  return ANDROID_KEYS[name] ?? null;
}

/** Dígito (0–9) de uma ação `digitN`, ou null se a ação não for um dígito. */
export function digitOf(action: RemoteAction): number | null {
  const m = /^digit([0-9])$/.exec(action);
  return m?.[1] !== undefined ? Number(m[1]) : null;
}
