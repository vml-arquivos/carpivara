import { env } from '../config.js';
import { MockVehicleProvider } from './mockProvider.js';
export function getProvider() {
    if (env.DATA_PROVIDER === 'mock')
        return new MockVehicleProvider();
    throw new Error('DATA_PROVIDER=real ainda não configurado. Implemente o adaptador do provedor contratado.');
}
