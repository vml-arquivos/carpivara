import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../src/server.ts', import.meta.url), 'utf8');
const auth = await readFile(new URL('../src/auth.ts', import.meta.url), 'utf8');

test('hardening fixa CSP e origem CORS sem reflexão ampla', () => {
  assert.match(server, /contentSecurityPolicy:\s*\{/);
  assert.match(server, /defaultSrc:\s*\[\"'self'\"\]/);
  assert.match(server, /objectSrc:\s*\[\"'none'\"\]/);
  assert.match(server, /frameAncestors:\s*\[\"'none'\"\]/);
  assert.match(server, /cors\(\{ origin: env\.WEB_ORIGIN, credentials: false \}\)/);
  assert.doesNotMatch(server, /cors\(\{\s*origin:\s*true/i);
});

test('retenção exige prévia por padrão e só permite execução administrativa explícita', () => {
  assert.match(server, /olderThanDays: z\.number\(\)\.int\(\)\.min\(30\)\.max\(3650\)\.default\(180\)/);
  assert.match(server, /if \(!parsed\.data\.execute\)/);
  assert.match(server, /dryRun: true/);
  assert.match(server, /requirePermission\('ADMIN_SYSTEM'\)/);
  assert.match(server, /INSERT INTO audit_retention_runs/);
});

test('middleware não aceita token sem sessão persistida para equipe', () => {
  assert.match(auth, /\['OPERADOR', 'ADMIN', 'SUPER_ADMIN'\]\.includes\(String\(claims\.role\)\) && !claims\.sid/);
  assert.match(auth, /metadata\.totpVerified !== true/);
});

test('rotas de contato não expõem conteúdo sem permissão de auditoria', () => {
  assert.match(server, /api\.get\('\/admin\/contact-messages', auth, requirePermission\('VIEW_AUDIT'\)/);
  assert.match(server, /api\.patch\('\/admin\/contact-messages\/:id', auth, requirePermission\('MANAGE_USERS'\)/);
  assert.match(server, /api\.post\('\/contact', contactRateLimit/);
  assert.match(server, /api\.post\('\/account\/contact', auth, contactRateLimit/);
});
