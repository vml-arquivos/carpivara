import { BRAND } from '../shared/brand';

export { BRAND };

/** Dados do site que não são marca: o e-mail de suporte pode ser trocado em build por VITE_SUPPORT_EMAIL. */
export const SITE = {
  supportEmail: String(import.meta.env.VITE_SUPPORT_EMAIL || BRAND.email.support).trim()
} as const;
