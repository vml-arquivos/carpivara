#!/usr/bin/env bash
set -Eeuo pipefail

# Execute este arquivo somente no terminal do servidor Coolify.
# Ele desliga o pedido do aplicativo autenticador e cria uma senha temporária.

APP="nypsnvexr5rnon2pfpx22zwp-234119835108"
DB="hwzumquwqxrqxymuvvudujru"
EMAIL="vilsonmarcio@gmail.com"
SERVER_FILE="/app/apps/api/dist/server.js"
AUTH_FILE="/app/apps/api/dist/auth.js"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
BACKUP_DIR="/root/buscarr-backups/acesso-somente-senha-$STAMP"

echo "=== BUSCARR: ACESSO SOMENTE POR SENHA ==="
echo
echo "1 de 5 - Conferindo o sistema..."
docker inspect "$APP" >/dev/null
docker inspect "$DB" >/dev/null

install -d -m 700 "$BACKUP_DIR"
docker cp "$APP:$SERVER_FILE" "$BACKUP_DIR/server.js"
docker cp "$APP:$AUTH_FILE" "$BACKUP_DIR/auth.js"
docker exec "$DB" sh -lc 'pg_dump -Fc -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}"' > "$BACKUP_DIR/banco.dump"
chmod 600 "$BACKUP_DIR"/*

echo "2 de 5 - Desligando o pedido do aplicativo autenticador..."
docker exec -i "$APP" node --input-type=module <<'NODE'
import fs from 'node:fs';

const serverPath = '/app/apps/api/dist/server.js';
const authPath = '/app/apps/api/dist/auth.js';
let server = fs.readFileSync(serverPath, 'utf8');
let auth = fs.readFileSync(authPath, 'utf8');

const roleCheck = "return ['OPERADOR', 'ADMIN', 'SUPER_ADMIN'].includes(role);";
const disabledRoleCheck = 'return false; // BUSCARR_PASSWORD_ONLY_HOTFIX';

if (!server.includes('BUSCARR_PASSWORD_ONLY_HOTFIX')) {
  const occurrences = server.split(roleCheck).length - 1;
  if (occurrences !== 1) throw new Error('A versão do servidor é diferente da esperada. Nada foi reiniciado.');
  server = server.replace(roleCheck, disabledRoleCheck);
  fs.writeFileSync(serverPath, server, 'utf8');
}

const metadataCheck = "['OPERADOR', 'ADMIN', 'SUPER_ADMIN'].includes(String(claims.role)) && metadata.totpVerified !== true";
const disabledMetadataCheck = 'false /* BUSCARR_PASSWORD_ONLY_HOTFIX */ && metadata.totpVerified !== true';

if (!auth.includes('BUSCARR_PASSWORD_ONLY_HOTFIX')) {
  const occurrences = auth.split(metadataCheck).length - 1;
  if (occurrences !== 1) throw new Error('A versão da segurança é diferente da esperada. Nada foi reiniciado.');
  auth = auth.replace(metadataCheck, disabledMetadataCheck);
  fs.writeFileSync(authPath, auth, 'utf8');
}
NODE

docker exec "$APP" node --check "$SERVER_FILE"
docker exec "$APP" node --check "$AUTH_FILE"

echo "3 de 5 - Criando uma nova senha temporária..."
TEMP_PASSWORD="$(docker exec -i -e RESET_EMAIL="$EMAIL" "$APP" node --input-type=module <<'NODE'
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Client } = pg;
const email = process.env.RESET_EMAIL;
const temporaryPassword = `Bsc!${randomBytes(12).toString('base64url')}`;
const passwordHash = await bcrypt.hash(temporaryPassword, 12);
const client = new Client({ connectionString: process.env.DATABASE_URL });

await client.connect();
try {
  await client.query('BEGIN');
  const found = await client.query(
    'SELECT id, role FROM users WHERE lower(email)=lower($1) FOR UPDATE',
    [email]
  );
  if (found.rowCount !== 1) throw new Error('Conta não encontrada.');

  const userId = found.rows[0].id;
  await client.query(
    `UPDATE users SET password_hash=$2, password_enabled=true, active=true,
       failed_login_attempts=0, locked_until=NULL
     WHERE id=$1`,
    [userId, passwordHash]
  );
  await client.query(
    'UPDATE user_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
    [userId]
  );
  await client.query('DELETE FROM auth_challenges WHERE user_id=$1', [userId]);
  await client.query('DELETE FROM team_totp_recovery_codes WHERE user_id=$1', [userId]);
  await client.query('DELETE FROM team_totp WHERE user_id=$1', [userId]);
  await client.query(
    `INSERT INTO audit_logs(user_id,action,entity,entity_id,metadata)
     VALUES(NULL,'PASSWORD_ONLY_ACCESS_ENABLED','USER',$1,$2::jsonb)`,
    [String(userId), JSON.stringify({ source: 'coolify-terminal', targetEmail: email })]
  );
  await client.query('COMMIT');
  process.stdout.write(temporaryPassword);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
NODE
)"

if [[ -z "$TEMP_PASSWORD" ]]; then
  echo "ERRO: a senha temporária não foi criada."
  exit 1
fi

echo "4 de 5 - Reiniciando somente a BUSCARR..."
docker restart "$APP" >/dev/null

echo "5 de 5 - Confirmando que o site voltou..."
healthy=false
for _ in $(seq 1 30); do
  if curl -fsS --max-time 5 http://127.0.0.1:4000/health >/dev/null; then
    healthy=true
    break
  fi
  sleep 2
done

if [[ "$healthy" != true ]]; then
  echo "ERRO: o site não voltou corretamente."
  echo "Backup disponível em: $BACKUP_DIR"
  exit 1
fi

echo
echo "=============================================="
echo "PRONTO: O ACESSO AGORA É SOMENTE POR SENHA"
echo "=============================================="
echo "E-mail: $EMAIL"
echo "Senha temporária: $TEMP_PASSWORD"
echo
echo "Copie a senha agora. Não envie essa senha por mensagem."
echo "Abra uma janela anônima e faça o login normalmente."
echo "Depois de entrar, troque a senha temporária por uma senha pessoal."
echo
echo "Backup: $BACKUP_DIR"
