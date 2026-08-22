import nodemailer, { type Transporter } from 'nodemailer';
import { env, publicAppUrl } from './config.js';
import { isEmailConfigurationComplete } from './emailConfig.js';

let transporter: Transporter | undefined;

export function isEmailConfigured(): boolean {
  return isEmailConfigurationComplete({ provider: env.EMAIL_PROVIDER, host: env.SMTP_HOST, user: env.SMTP_USER, password: env.SMTP_PASSWORD });
}

function getTransporter(): Transporter {
  if (!isEmailConfigured()) throw new Error('EMAIL_NOT_CONFIGURED');
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
    });
  }
  return transporter;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'\"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '\"': '&quot;' })[character] ?? character);
}

export async function sendPasswordResetEmail(input: { to: string; name: string; token: string }): Promise<void> {
  const resetUrl = `${publicAppUrl()}/?reset_token=${encodeURIComponent(input.token)}`;
  const appName = env.APP_NAME || 'BUSCARR';
  const safeName = escapeHtml(input.name);
  const safeAppName = escapeHtml(appName);
  await getTransporter().sendMail({
    from: env.EMAIL_FROM,
    to: input.to,
    subject: `Redefinição de senha | ${appName}`,
    text: `Olá, ${input.name}.\n\nRecebemos uma solicitação para redefinir sua senha no ${appName}. Acesse este link em até ${env.PASSWORD_RESET_TTL_MINUTES} minutos:\n\n${resetUrl}\n\nSe você não solicitou a alteração, ignore esta mensagem.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#17201d;max-width:600px;margin:auto"><h1 style="color:#166534">Redefinição de senha | ${safeAppName}</h1><p>Olá, ${safeName}.</p><p>Recebemos uma solicitação para redefinir sua senha no ${safeAppName}.</p><p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#166534;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px">Criar nova senha</a></p><p>O link é válido por ${env.PASSWORD_RESET_TTL_MINUTES} minutos e só pode ser usado uma vez.</p><p>Se você não solicitou a alteração, ignore esta mensagem.</p></div>`
  });
}
