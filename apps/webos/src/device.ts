import { loadOrCreateDevice, type DeviceIdentity } from '@brtv/core';
import { adapter } from './platform';

export { ACTIVATION_URL, daysLeft } from '@brtv/core';

export function loadDevice(): Promise<DeviceIdentity> {
  return loadOrCreateDevice(adapter);
}
