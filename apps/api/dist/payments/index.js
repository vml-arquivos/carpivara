import { env } from '../config.js';
import { AsaasProvider } from './asaas.js';
import { MercadoPagoProvider } from './mercadopago.js';
class DisabledSandboxProvider {
    name = 'sandbox';
    isConfigured() { return false; }
    async createCheckout() {
        const error = new Error('PAYMENT_PROVIDER_NOT_CONFIGURED');
        error.code = 'PAYMENT_PROVIDER_NOT_CONFIGURED';
        throw error;
    }
    isValidWebhookSignature() { return false; }
    parseWebhookEvent() { return null; }
}
export function getPaymentProviderFor(name) {
    switch (name) {
        case 'asaas': return new AsaasProvider();
        case 'mercadopago': return new MercadoPagoProvider();
        case 'sandbox': return new DisabledSandboxProvider();
    }
}
export function getPaymentProvider() {
    return getPaymentProviderFor(env.PAYMENT_PROVIDER);
}
// O contrato comum já permite adicionar PagBankProvider no futuro sem alterar server.ts.
