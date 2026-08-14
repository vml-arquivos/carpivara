import crypto from 'node:crypto';
import { env, publicAppUrl } from '../config.js';
function baseUrl() {
    const base = env.PAYMENT_API_BASE_URL;
    if (!base)
        throw codedError('PAYMENT_PROVIDER_NOT_CONFIGURED');
    return base.replace(/\/$/, '');
}
function codedError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}
export function isAsaasConfigured() {
    return env.PAYMENT_PROVIDER === 'asaas' && Boolean(env.PAYMENT_API_BASE_URL && env.PAYMENT_API_KEY && env.PAYMENT_WEBHOOK_SECRET);
}
export async function createAsaasCheckout(input) {
    if (!isAsaasConfigured())
        throw codedError('PAYMENT_PROVIDER_NOT_CONFIGURED');
    const origin = publicAppUrl();
    const customerData = { name: input.customer.name, email: input.customer.email };
    if (input.customer.cpfCnpj)
        customerData.cpfCnpj = input.customer.cpfCnpj.replace(/\D/g, '');
    if (input.customer.phone)
        customerData.phone = input.customer.phone.replace(/\D/g, '');
    const response = await fetch(`${baseUrl()}/v3/checkouts`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json', access_token: env.PAYMENT_API_KEY },
        body: JSON.stringify({
            billingTypes: ['PIX', 'CREDIT_CARD'],
            chargeTypes: ['DETACHED'],
            minutesToExpire: 60,
            externalReference: input.orderId,
            callback: {
                successUrl: `${origin}/?checkout=success`,
                cancelUrl: `${origin}/?checkout=cancelled`,
                expiredUrl: `${origin}/?checkout=expired`
            },
            customerData,
            items: [{
                    externalReference: input.orderId,
                    name: input.itemName,
                    description: input.itemDescription,
                    quantity: 1,
                    value: input.amountCents / 100
                }]
        })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.id || !body.link)
        throw codedError('PAYMENT_PROVIDER_REQUEST_FAILED');
    return { id: body.id, link: body.link, status: body.status ?? 'ACTIVE' };
}
export function hasValidAsaasWebhookToken(value) {
    if (!env.PAYMENT_WEBHOOK_SECRET || !value)
        return false;
    const received = Buffer.from(value);
    const expected = Buffer.from(env.PAYMENT_WEBHOOK_SECRET);
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
export function eventReference(event) {
    return event.checkout?.externalReference ?? event.payment?.externalReference ?? null;
}
export function externalPaymentId(event) {
    return event.checkout?.id ?? event.payment?.id ?? null;
}
