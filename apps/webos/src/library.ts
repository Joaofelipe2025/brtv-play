import { MockBackendService, type BackendService, type DeviceStatus } from '@brtv/core';

export {
  cleanGroup,
  loadEpg,
  loadLibrary,
  loadSeasons,
  type EpisodeItem,
  type Library,
  type LiveItem,
  type SeriesEntry,
  type VodItem,
} from '@brtv/core';

/** Serviço de backend. Trocar pelo Supabase depois sem mexer na UI. */
export const backend: BackendService = new MockBackendService();

export async function fetchStatus(mac: string, key: string): Promise<DeviceStatus> {
  return backend.getDeviceStatus(mac, key);
}
