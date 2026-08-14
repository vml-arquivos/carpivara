import type { PoolClient } from 'pg';
import { pool, tx } from './db.js';

export type Migration = {
  id: string;
  name: string;
  up: (client: PoolClient) => Promise<void>;
};

const rolePermissions: Record<string, string[]> = {
  CLIENTE: ['QUERY_VEHICLE', 'VIEW_HISTORY', 'BUY_CREDITS'],
  OPERADOR: ['QUERY_VEHICLE', 'VIEW_HISTORY', 'BUY_CREDITS', 'VIEW_SENSITIVE_DATA'],
  ADMIN: ['QUERY_VEHICLE', 'VIEW_HISTORY', 'BUY_CREDITS', 'VIEW_SENSITIVE_DATA', 'MANAGE_USERS', 'MANAGE_PRICING', 'MANAGE_PROVIDERS', 'VIEW_AUDIT'],
  SUPER_ADMIN: ['QUERY_VEHICLE', 'VIEW_HISTORY', 'BUY_CREDITS', 'VIEW_SENSITIVE_DATA', 'MANAGE_USERS', 'MANAGE_PRICING', 'MANAGE_PROVIDERS', 'VIEW_AUDIT', 'ADMIN_SYSTEM']
};

const migrations: Migration[] = [
  {
    id: '001_security_and_product_hardening',
    name: 'Security controls, idempotency and configurable products',
    async up(client) {
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until timestamptz;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
        ALTER TABLE query_products ADD COLUMN IF NOT EXISTS slug text;
        ALTER TABLE query_products ADD COLUMN IF NOT EXISTS provider_cost_cents integer;
        ALTER TABLE query_products ADD COLUMN IF NOT EXISTS reference_price_cents integer;
        ALTER TABLE query_products ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 100;
        ALTER TABLE query_products ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '[]'::jsonb;
        ALTER TABLE query_products ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
        ALTER TABLE vehicle_queries ADD COLUMN IF NOT EXISTS idempotency_key text;
        ALTER TABLE vehicle_queries ADD COLUMN IF NOT EXISTS request_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
        ALTER TABLE vehicle_queries ADD COLUMN IF NOT EXISTS result_hash text;
        ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
        CREATE TABLE IF NOT EXISTS roles (
          id text PRIMARY KEY,
          name text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS permissions (
          id text PRIMARY KEY,
          description text NOT NULL
        );
        CREATE TABLE IF NOT EXISTS role_permissions (
          role_id text NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
          permission_id text NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
          PRIMARY KEY (role_id, permission_id)
        );
        CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));
        CREATE INDEX IF NOT EXISTS idx_vehicle_queries_status_created ON vehicle_queries(status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_vehicle_queries_provider_id ON vehicle_queries(provider_query_id) WHERE provider_query_id IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_queries_user_idempotency ON vehicle_queries(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_payments_user_created ON payments(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_organization_members_user ON organization_members(user_id);
        CREATE INDEX IF NOT EXISTS idx_wallet_transactions_query ON wallet_transactions(query_id) WHERE query_id IS NOT NULL;
      `);

      for (const [role, permissionIds] of Object.entries(rolePermissions)) {
        await client.query('INSERT INTO roles(id,name) VALUES($1,$2) ON CONFLICT(id) DO NOTHING', [role, role.replace('_', ' ')]);
        for (const permissionId of permissionIds) {
          await client.query('INSERT INTO permissions(id,description) VALUES($1,$2) ON CONFLICT(id) DO NOTHING', [permissionId, permissionId.replaceAll('_', ' ').toLowerCase()]);
          await client.query('INSERT INTO role_permissions(role_id,permission_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [role, permissionId]);
        }
      }

      await client.query(`
        UPDATE query_products
        SET slug = COALESCE(slug, lower(id)),
            display_order = CASE id WHEN 'BASIC' THEN 10 WHEN 'DEBTS' THEN 20 WHEN 'COMPLETE' THEN 30 WHEN 'PREMIUM' THEN 40 ELSE display_order END,
            features = CASE id
              WHEN 'BASIC' THEN '["Identificação", "Características", "Situação cadastral"]'::jsonb
              WHEN 'DEBTS' THEN '["Débitos", "Restrições", "Recall"]'::jsonb
              WHEN 'COMPLETE' THEN '["Identificação completa", "Débitos e restrições", "Histórico salvo"]'::jsonb
              WHEN 'PREMIUM' THEN '["Todos os dados disponíveis", "Campos adicionais do provedor"]'::jsonb
              ELSE features
            END,
            updated_at = now()
        WHERE slug IS NULL OR features = '[]'::jsonb;
      `);
    }
  },
  {
    id: '002_query_integrity',
    name: 'Query result integrity and safe reporting indexes',
    async up(client) {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_vehicle_query_results_created ON vehicle_query_results(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created ON audit_logs(action, created_at DESC);
      `);
    }
  }
];

export async function runMigrations(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id text PRIMARY KEY,
    name text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  for (const migration of migrations) {
    const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE id=$1', [migration.id]);
    if (applied.rowCount) continue;
    await tx(async (client) => {
      const locked = await client.query('SELECT pg_try_advisory_xact_lock(8432026) AS locked');
      if (!locked.rows[0]?.locked) throw new Error('MIGRATION_LOCK_UNAVAILABLE');
      const duplicate = await client.query('SELECT 1 FROM schema_migrations WHERE id=$1', [migration.id]);
      if (duplicate.rowCount) return;
      await migration.up(client);
      await client.query('INSERT INTO schema_migrations(id,name) VALUES($1,$2)', [migration.id, migration.name]);
    });
  }
}
