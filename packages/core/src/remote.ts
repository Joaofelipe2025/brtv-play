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
  | 'channelDown';

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
};

export function mapWebosKey(keyCode: number): RemoteAction | null {
  return WEBOS_KEYS[keyCode] ?? null;
}

export function mapAndroidKey(name: string): RemoteAction | null {
  return ANDROID_KEYS[name] ?? null;
}
