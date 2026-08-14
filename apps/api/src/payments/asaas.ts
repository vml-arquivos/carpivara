import crypto from 'node:crypto';
import { env, publicAppUrl } from '../config.js';

export type AsaasCheckoutInput = {
  orderId: string;
  itemName: string;
  itemDescription: string;
  amountCents: number;
  customer: { name: string; email: string; cpfCnpj?: string; phone?: string };
};

export type AsaasCheckoutResult = {
  id: string;
  link: string;
  status: string;
};

export type AsaasWebhookEvent = {
  id?: string;
  event?: string;
  payment?: { id?: string; status?: string; externalReference?: string };
  checkout?: { id?: string; status?: string; externalReference?: string };
};

function baseUrl(): string {
  const base = env.PAYMENT_API_BASE_URL;
  if (!base) throw codedError('PAYMENT_PROVIDER_NOT_CONFIGURED');
  return base.replace(/\/$/, '');
}

function codedError(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string };
  error.code = code;
  return error;
}

export function isAsaasConfigured(): boolean {
  return env.PAYMENT_PROVIDER === 'asaas' && Boolean(env.PAYMENT_API_BASE_URL && env.PAYMENT_API_KEY && env.PAYMENT_WEBHOOK_SECRET);
}

export async function createAsaasCheckout(input: AsaasCheckoutInput): Promise<AsaasCheckoutResult> {
  if (!isAsaasConfigured()) throw codedError('PAYMENT_PROVIDER_NOT_CONFIGURED');
  const origin = publicAppUrl();
  const customerData: Record<string, string> = { name: input.customer.name, email: input.customer.email };
  if (input.customer.cpfCnpj) customerData.cpfCnpj = input.customer.cpfCnpj.replace(/\D/g, '');
  if (input.customer.phone) customerData.phone = input.customer.phone.replace(/\D/g, '');
  const response = await fetch(`${baseUrl()}/v3/checkouts`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', access_token: env.PAYMENT_API_KEY! },
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
  const body = await response.json().catch(() => ({})) as { id?: string; link?: string; status?: string; errors?: Array<{ code?: string; description?: string }> };
  if (!response.ok || !body.id || !body.link) throw codedError('PAYMENT_PROVIDER_REQUEST_FAILED');
  return { id: body.id, link: body.link, status: body.status ?? 'ACTIVE' };
}

export function hasValidAsaasWebhookToken(value: string | undefined): boolean {
  if (!env.PAYMENT_WEBHOOK_SECRET || !value) return false;
  const received = Buffer.from(value);
  const expected = Buffer.from(env.PAYMENT_WEBHOOK_SECRET);
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export function eventReference(event: AsaasWebhookEvent): string | null {
  return event.checkout?.externalReference ?? event.payment?.externalReference ?? null;
}

export function externalPaymentId(event: AsaasWebhookEvent): string | null {
  return event.checkout?.id ?? event.payment?.id ?? null;
}
