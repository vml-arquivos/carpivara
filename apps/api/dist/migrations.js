import { pool, tx } from './db.js';
const rolePermissions = {
    CLIENTE: ['QUERY_VEHICLE', 'VIEW_HISTORY', 'BUY_CREDITS'],
    OPERADOR: ['QUERY_VEHICLE', 'VIEW_HISTORY', 'BUY_CREDITS', 'VIEW_SENSITIVE_DATA'],
    ADMIN: ['QUERY_VEHICLE', 'VIEW_HISTORY', 'BUY_CREDITS', 'VIEW_SENSITIVE_DATA', 'MANAGE_USERS', 'MANAGE_PRICING', 'MANAGE_PROVIDERS', 'VIEW_AUDIT'],
    SUPER_ADMIN: ['QUERY_VEHICLE', 'VIEW_HISTORY', 'BUY_CREDITS', 'VIEW_SENSITIVE_DATA', 'MANAGE_USERS', 'MANAGE_PRICING', 'MANAGE_PROVIDERS', 'VIEW_AUDIT', 'ADMIN_SYSTEM']
};
const migrations = [
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
    },
    {
        id: '003_identity_and_social_auth',
        name: 'User identities, revocable sessions, consent records and OAuth transaction security',
        async up(client) {
            await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS password_enabled boolean NOT NULL DEFAULT true;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
        ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
        ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

        CREATE TABLE IF NOT EXISTS user_identities (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          provider text NOT NULL CHECK (provider IN ('google','microsoft','apple')),
          provider_account_id text NOT NULL,
          issuer text NOT NULL,
          email_at_provider text,
          email_verified_at timestamptz,
          profile jsonb NOT NULL DEFAULT '{}'::jsonb,
          last_used_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE(provider, provider_account_id),
          UNIQUE(user_id, provider)
        );

        CREATE TABLE IF NOT EXISTS user_sessions (
          id uuid PRIMARY KEY,
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at timestamptz NOT NULL,
          revoked_at timestamptz,
          metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          last_seen_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS user_consents (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          consent_type text NOT NULL CHECK (consent_type IN ('TERMS_OF_SERVICE','PRIVACY_POLICY','MARKETING_EMAIL')),
          granted boolean NOT NULL,
          policy_version text NOT NULL,
          source text NOT NULL DEFAULT 'registration',
          ip_hash text,
          created_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS oauth_authorization_states (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          provider text NOT NULL CHECK (provider IN ('google','microsoft','apple')),
          state_hash text NOT NULL UNIQUE,
          nonce text NOT NULL,
          code_verifier text NOT NULL,
          expires_at timestamptz NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS oauth_login_tickets (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          ticket_hash text NOT NULL UNIQUE,
          expires_at timestamptz NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(user_id, expires_at DESC) WHERE revoked_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_user_consents_user_type ON user_consents(user_id, consent_type, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_oauth_states_expiry ON oauth_authorization_states(expires_at);
        CREATE INDEX IF NOT EXISTS idx_oauth_tickets_expiry ON oauth_login_tickets(expires_at);
      `);
        }
    }
];
export async function runMigrations() {
    await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id text PRIMARY KEY,
    name text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
    for (const migration of migrations) {
        const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE id=$1', [migration.id]);
        if (applied.rowCount)
            continue;
        await tx(async (client) => {
            const locked = await client.query('SELECT pg_try_advisory_xact_lock(8432026) AS locked');
            if (!locked.rows[0]?.locked)
                throw new Error('MIGRATION_LOCK_UNAVAILABLE');
            const duplicate = await client.query('SELECT 1 FROM schema_migrations WHERE id=$1', [migration.id]);
            if (duplicate.rowCount)
                return;
            await migration.up(client);
            await client.query('INSERT INTO schema_migrations(id,name) VALUES($1,$2)', [migration.id, migration.name]);
        });
    }
}
