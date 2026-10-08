import type { KeyValueAdapter } from './storage';

export interface DeviceIdentity {
  /** ID aleatório no formato MAC. Não é o MAC real do aparelho. */
  mac: string;
  /** Chave de 6 dígitos usada para vincular o aparelho no portal. */
  key: string;
}

const MAC_STORAGE_KEY = 'brtv.device.mac';
const KEY_STORAGE_KEY = 'brtv.device.key';

const MAC_PATTERN = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;
const KEY_PATTERN = /^\d{6}$/;

export type RandomSource = () => number;

/**
 * Gera um MAC aleatório. O primeiro octeto é ajustado para endereço
 * "localmente administrado" e unicast (bits 0x02 ligado, 0x01 desligado).
 */
export function generateMac(random: RandomSource = Math.random): string {
  const octets: number[] = [];
  for (let i = 0; i < 6; i++) {
    octets.push(Math.floor(random() * 256));
  }
  octets[0] = ((octets[0] ?? 0) | 0x02) & 0xfe;
  return octets.map((o) => o.toString(16).toUpperCase().padStart(2, '0')).join(':');
}

export function generateDeviceKey(random: RandomSource = Math.random): string {
  return Math.floor(random() * 1_000_000)
    .toString()
    .padStart(6, '0');
}

export function isValidMac(value: string): boolean {
  return MAC_PATTERN.test(value);
}

export function isValidDeviceKey(value: string): boolean {
  return KEY_PATTERN.test(value);
}

/**
 * Carrega a identidade do aparelho do armazenamento ou cria uma na primeira execução.
 * Valores corrompidos no armazenamento são substituídos.
 */
export async function loadOrCreateDevice(
  adapter: KeyValueAdapter,
  random: RandomSource = Math.random,
): Promise<DeviceIdentity> {
  const storedMac = await adapter.get(MAC_STORAGE_KEY);
  const storedKey = await adapter.get(KEY_STORAGE_KEY);

  if (storedMac && storedKey && isValidMac(storedMac) && isValidDeviceKey(storedKey)) {
    return { mac: storedMac, key: storedKey };
  }

  const identity: DeviceIdentity = {
    mac: generateMac(random),
    key: generateDeviceKey(random),
  };
  await adapter.set(MAC_STORAGE_KEY, identity.mac);
  await adapter.set(KEY_STORAGE_KEY, identity.key);
  return identity;
}
