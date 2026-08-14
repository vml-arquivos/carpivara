import { env } from '../config.js';
function providerError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}
/**
 * Adapter for an authorized vehicle-data provider. The contracted endpoint must accept
 * a resolved plate path and return the provider's documented response; its provider-specific
 * mapping belongs in normalizer.ts once the contracted schema is available.
 */
export class OfficialVehicleProvider {
    name = 'official';
    async queryByPlate(plate) {
        if (!env.VEHICLE_API_BASE_URL || !env.VEHICLE_API_QUERY_PATH)
            throw providerError('DATA_PROVIDER_NOT_CONFIGURED');
        if (env.VEHICLE_API_AUTH_SCHEME === 'bearer' && !env.VEHICLE_API_TOKEN)
            throw providerError('DATA_PROVIDER_NOT_CONFIGURED');
        if (env.VEHICLE_API_AUTH_SCHEME === 'basic' && (!env.VEHICLE_API_LOGIN || !env.VEHICLE_API_PASSWORD))
            throw providerError('DATA_PROVIDER_NOT_CONFIGURED');
        const path = env.VEHICLE_API_QUERY_PATH.replaceAll('{plate}', encodeURIComponent(plate));
        const url = new URL(path.startsWith('/') ? path.slice(1) : path, `${env.VEHICLE_API_BASE_URL.replace(/\/$/, '')}/`);
        const authorization = env.VEHICLE_API_AUTH_SCHEME === 'basic'
            ? `Basic ${Buffer.from(`${env.VEHICLE_API_LOGIN}:${env.VEHICLE_API_PASSWORD}`).toString('base64')}`
            : `Bearer ${env.VEHICLE_API_TOKEN}`;
        let response;
        try {
            response = await fetch(url, { headers: { accept: 'application/json', authorization }, signal: AbortSignal.timeout(env.VEHICLE_API_TIMEOUT_MS) });
        }
        catch {
            throw providerError('PROVIDER_TIMEOUT');
        }
        if (response.status === 404)
            throw providerError('NOT_FOUND');
        if (response.status === 401 || response.status === 403)
            throw providerError('DATA_PROVIDER_AUTH_FAILED');
        if (!response.ok)
            throw providerError('DATA_PROVIDER_UNAVAILABLE');
        const raw = await response.json().catch(() => { throw providerError('DATA_PROVIDER_INVALID_RESPONSE'); });
        const object = raw && typeof raw === 'object' ? raw : {};
        const providerQueryId = typeof object.id === 'string' ? object.id : typeof object.requestId === 'string' ? object.requestId : undefined;
        return { providerQueryId, raw };
    }
}
