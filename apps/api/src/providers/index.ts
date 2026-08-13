import { env } from '../config.js';
import { MockVehicleProvider } from './mockProvider.js';
import type { VehicleDataProvider } from '../types.js';

export function getProvider():VehicleDataProvider {
  if (env.DATA_PROVIDER === 'mock') return new MockVehicleProvider();
  throw new Error('DATA_PROVIDER=real ainda não configurado. Implemente o adaptador do provedor contratado.');
}
