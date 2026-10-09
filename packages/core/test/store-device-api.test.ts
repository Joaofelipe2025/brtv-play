import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from '../src/storage';
import {
  generateDeviceKey,
  generateMac,
  isValidMac,
  loadOrCreateDevice,
} from '../src/device';
import { MockBackendService, TRIAL_DURATION_MS, DEMO_M3U } from '../src/api';
import { createAppStore, STORE_STORAGE_KEY } from '../src/store';
import { parseM3u } from '../src/m3u';
import { mapAndroidKey, mapWebosKey } from '../src/remote';

describe('device', () => {
  it('gera MAC no formato correto, unicast e localmente administrado', () => {
    const mac = generateMac(() => 0.5);
    expect(isValidMac(mac)).toBe(true);
    const firstOctet = parseInt(mac.slice(0, 2), 16);
    expect(firstOctet & 0x01).toBe(0);
    expect(firstOctet & 0x02).toBe(0x02);
  });

  it('gera Device Key de 6 dígitos com zeros à esquerda', () => {
    expect(generateDeviceKey(() => 0)).toBe('000000');
    expect(generateDeviceKey(() => 0.999999)).toMatch(/^\d{6}$/);
  });

  it('persiste a identidade e reutiliza na segunda execução', async () => {
    const adapter = new MemoryAdapter();
    const first = await loadOrCreateDevice(adapter, () => 0.42);
    const second = await loadOrCreateDevice(adapter, () => 0.9);
    expect(second).toEqual(first);
  });

  it('substitui valores corrompidos no armazenamento', async () => {
    const adapter = new MemoryAdapter();
    await adapter.set('brtv.device.mac', 'lixo');
    await adapter.set('brtv.device.key', '12');
    const identity = await loadOrCreateDevice(adapter, () => 0.1);
    expect(isValidMac(identity.mac)).toBe(true);
    expect(identity.key).toMatch(/^\d{6}$/);
  });
});

describe('MockBackendService', () => {
  it('retorna trial de 7 dias com playlist de demonstração', async () => {
    const now = 1_000_000;
    const backend = new MockBackendService(() => now);
    const status = await backend.getDeviceStatus('AA:BB:CC:DD:EE:FF', '123456');
    expect(status.status).toBe('trial');
    expect(status.playlists).toHaveLength(1);
    expect(parseM3u(DEMO_M3U).length).toBeGreaterThan(0);
    expect(new Date(status.expiresAt).getTime()).toBe(now + TRIAL_DURATION_MS);
  });

  it('expira após o período de trial e remove playlists', async () => {
    let now = 0;
    const backend = new MockBackendService(() => now);
    await backend.getDeviceStatus('AA:BB:CC:DD:EE:FF', '000001');
    now = TRIAL_DURATION_MS + 1;
    const status = await backend.getDeviceStatus('AA:BB:CC:DD:EE:FF', '000001');
    expect(status.status).toBe('expired');
    expect(status.playlists).toEqual([]);
  });
});

describe('store', () => {
  it('alterna favoritos', () => {
    const store = createAppStore(new MemoryAdapter());
    store.getState().toggleFavorite('a');
    expect(store.getState().favorites).toEqual(['a']);
    store.getState().toggleFavorite('a');
    expect(store.getState().favorites).toEqual([]);
  });

  it('mantém histórico sem duplicar e com a entrada mais recente primeiro', () => {
    const store = createAppStore(new MemoryAdapter());
    store.getState().addHistory({ id: 'x', type: 'live', title: 'X' }, 1);
    store.getState().addHistory({ id: 'y', type: 'vod', title: 'Y' }, 2);
    store.getState().addHistory({ id: 'x', type: 'live', title: 'X' }, 3);
    expect(store.getState().history.map((h) => h.id)).toEqual(['x', 'y']);
    expect(store.getState().history[0]?.watchedAt).toBe(3);
  });

  it('guarda posição de continuar assistindo em segundos inteiros', () => {
    const store = createAppStore(new MemoryAdapter());
    store.getState().setPosition('filme1', 125.9);
    expect(store.getState().continueWatching['filme1']).toBe(125);
    store.getState().setPosition('filme1', -5);
    expect(store.getState().continueWatching['filme1']).toBe(125);
  });

  it('valida PIN de 4 dígitos e verifica acesso', () => {
    const store = createAppStore(new MemoryAdapter());
    expect(() => store.getState().setParentalPin('12')).toThrow();
    store.getState().setParentalPin('1234');
    expect(store.getState().verifyPin('1234')).toBe(true);
    expect(store.getState().verifyPin('0000')).toBe(false);
  });

  it('bloqueia e desbloqueia categorias', () => {
    const store = createAppStore(new MemoryAdapter());
    store.getState().setCategoryBlocked('Adulto', true);
    expect(store.getState().isCategoryBlocked('Adulto')).toBe(true);
    store.getState().setCategoryBlocked('Adulto', false);
    expect(store.getState().isCategoryBlocked('Adulto')).toBe(false);
  });

  it('persiste no adapter e restaura via hydrate', async () => {
    const adapter = new MemoryAdapter();
    const first = createAppStore(adapter);
    first.getState().toggleFavorite('canal-1');
    first.getState().setParentalPin('4321');
    await new Promise((r) => setTimeout(r, 0));
    expect(await adapter.get(STORE_STORAGE_KEY)).toContain('canal-1');

    const second = createAppStore(adapter);
    await second.hydrate();
    expect(second.getState().favorites).toEqual(['canal-1']);
    expect(second.getState().verifyPin('4321')).toBe(true);
  });

  it('ignora dados corrompidos ao hydrate', async () => {
    const adapter = new MemoryAdapter();
    await adapter.set(STORE_STORAGE_KEY, '{nao-json');
    const store = createAppStore(adapter);
    await store.hydrate();
    expect(store.getState().favorites).toEqual([]);
  });
});

describe('remote key mapping', () => {
  it('mapeia keyCodes LG', () => {
    expect(mapWebosKey(461)).toBe('back');
    expect(mapWebosKey(13)).toBe('ok');
    expect(mapWebosKey(403)).toBe('red');
    expect(mapWebosKey(9999)).toBeNull();
  });

  it('mapeia teclas Android', () => {
    expect(mapAndroidKey('DPadUp')).toBe('up');
    expect(mapAndroidKey('Back')).toBe('back');
    expect(mapAndroidKey('Algo')).toBeNull();
  });
});
