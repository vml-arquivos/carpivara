import type { PoolClient } from 'pg';
import { pool, tx } from './db.js';

export type Migration = {
  id: string;
  name: string;
  up: (client: PoolClient) => Promise<void>;
};

const rolePermissions: Record<string, string[]> = {
  CLIENTE: ['QUERY_VEHICLE', 'VIEW_HISTORY', 'BUY_CREDITS'],
  OPERADOR: ['QUERY_VEHICLE', 'VIEW_HISTORY', 'BUY_CREDITS', 'VIEW_SENSITIVE_DATA', 'MANAGE_SUPPORT'],
  ADMIN: ['QUERY_VEHICLE', 'VIEW_HISTORY', 'BUY_CREDITS', 'VIEW_SENSITIVE_DATA', 'MANAGE_USERS', 'MANAGE_PRICING', 'MANAGE_PROVIDERS', 'MANAGE_BILLING', 'MANAGE_SUPPORT', 'VIEW_AUDIT'],
  SUPER_ADMIN: ['QUERY_VEHICLE', 'VIEW_HISTORY', 'BUY_CREDITS', 'VIEW_SENSITIVE_DATA', 'MANAGE_USERS', 'MANAGE_PRICING', 'MANAGE_PROVIDERS', 'MANAGE_BILLING', 'MANAGE_SUPPORT', 'VIEW_AUDIT', 'ADMIN_SYSTEM']
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
  },
  {
    id: '004_commerce_and_operational_controls',
    name: 'Credit packages, checkout orders, payment events and production provider controls',
    async up(client) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS credit_packages (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          slug text NOT NULL UNIQUE,
          name text NOT NULL,
          description text NOT NULL,
          credits integer NOT NULL CHECK (credits > 0),
          price_cents integer NOT NULL CHECK (price_cents > 0),
          active boolean NOT NULL DEFAULT true,
          display_order integer NOT NULL DEFAULT 100,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS payment_orders (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL REFERENCES users(id),
          package_id uuid NOT NULL REFERENCES credit_packages(id),
          status text NOT NULL CHECK (status IN ('CREATED','CHECKOUT_ACTIVE','PAID','CANCELLED','EXPIRED','FAILED','REFUNDED')),
          amount_cents integer NOT NULL CHECK (amount_cents > 0),
          credits integer NOT NULL CHECK (credits > 0),
          provider text NOT NULL,
          external_reference text NOT NULL UNIQUE,
          provider_checkout_id text UNIQUE,
          checkout_url text,
          paid_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS payment_webhook_events (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          provider text NOT NULL,
          provider_event_id text NOT NULL,
          event_type text NOT NULL,
          order_id uuid REFERENCES payment_orders(id),
          payload jsonb NOT NULL DEFAULT '{}'::jsonb,
          received_at timestamptz NOT NULL DEFAULT now(),
          processed_at timestamptz,
          processing_error text,
          UNIQUE(provider, provider_event_id)
        );
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES payment_orders(id);
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS checkout_url text;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_status text;
        CREATE INDEX IF NOT EXISTS idx_credit_packages_active_order ON credit_packages(active,display_order);
        CREATE INDEX IF NOT EXISTS idx_payment_orders_user_created ON payment_orders(user_id,created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_payment_orders_status_created ON payment_orders(status,created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_order ON payment_webhook_events(order_id,received_at DESC);
      `);
      const packages = [
        ['essencial','Pacote Essencial','Créditos para consultas pontuais.',10,1990,10],
        ['completo','Pacote Completo','Créditos para uma decisão de compra mais informada.',30,4990,20],
        ['profissional','Pacote Profissional','Créditos para uso recorrente e operações.',100,13990,30]
      ];
      for (const [slug, name, description, credits, priceCents, displayOrder] of packages) {
        await client.query(`INSERT INTO credit_packages(slug,name,description,credits,price_cents,display_order)
          VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,credits=EXCLUDED.credits,price_cents=EXCLUDED.price_cents,display_order=EXCLUDED.display_order,updated_at=now()`, [slug,name,description,credits,priceCents,displayOrder]);
      }
    }
  },
  {
    id: '005_fipe_funnel_reports',
    name: 'Free FIPE funnel, persistent cache, report documents and source metadata',
    async up(client) {
      await client.query(`
        ALTER TABLE query_products ADD COLUMN IF NOT EXISTS supplier_cost_cents integer NOT NULL DEFAULT 0;
        ALTER TABLE query_products ADD COLUMN IF NOT EXISTS min_margin_cents integer NOT NULL DEFAULT 0;
        ALTER TABLE query_products ADD COLUMN IF NOT EXISTS source text;
        ALTER TABLE query_products ADD COLUMN IF NOT EXISTS coverage text;
        ALTER TABLE query_products ADD COLUMN IF NOT EXISTS commercial_status text NOT NULL DEFAULT 'ACTIVE';
        ALTER TABLE query_products ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
        ALTER TABLE query_products ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT false;

        CREATE TABLE IF NOT EXISTS fipe_cache (
          cache_key text PRIMARY KEY,
          provider text NOT NULL,
          vehicle_type text NOT NULL CHECK (vehicle_type IN ('cars','motorcycles','trucks')),
          brand_id text NOT NULL,
          model_id text NOT NULL,
          year_id text NOT NULL,
          reference_code text,
          reference_month text NOT NULL,
          payload jsonb NOT NULL,
          expires_at timestamptz NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_fipe_cache_expiry ON fipe_cache(expires_at);

        CREATE TABLE IF NOT EXISTS fipe_usage (
          scope_key text NOT NULL,
          bucket_date date NOT NULL,
          count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (scope_key, bucket_date)
        );

        CREATE TABLE IF NOT EXISTS report_documents (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          document_code text NOT NULL UNIQUE,
          query_id uuid REFERENCES vehicle_queries(id) ON DELETE SET NULL,
          user_id uuid REFERENCES users(id) ON DELETE SET NULL,
          report_kind text NOT NULL CHECK (report_kind IN ('FIPE_FREE','VEHICLE_QUERY')),
          report_version integer NOT NULL DEFAULT 1 CHECK (report_version > 0),
          provider text NOT NULL,
          report_hash text NOT NULL,
          snapshot jsonb NOT NULL,
          previous_document_id uuid REFERENCES report_documents(id),
          superseded_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_report_documents_user_created ON report_documents(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_report_documents_query_created ON report_documents(query_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS query_source_rules (
          product_id text NOT NULL REFERENCES query_products(id) ON DELETE CASCADE,
          source_type text NOT NULL,
          provider text NOT NULL,
          active boolean NOT NULL DEFAULT false,
          priority integer NOT NULL DEFAULT 100,
          coverage text NOT NULL DEFAULT '',
          PRIMARY KEY(product_id, source_type, provider)
        );

        CREATE TABLE IF NOT EXISTS provider_health_events (
          id bigserial PRIMARY KEY,
          provider text NOT NULL,
          source_type text NOT NULL,
          status text NOT NULL,
          latency_ms integer,
          error_code text,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_provider_health_created ON provider_health_events(provider, source_type, created_at DESC);

        CREATE TABLE IF NOT EXISTS funnel_events (
          id bigserial PRIMARY KEY,
          user_id uuid REFERENCES users(id) ON DELETE SET NULL,
          session_key text,
          event_type text NOT NULL,
          metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_funnel_events_type_created ON funnel_events(event_type, created_at DESC);
      `);

      await client.query(`
        INSERT INTO query_products(id,name,description,credit_cost,slug,features,display_order,source,coverage,commercial_status,featured,is_free)
        VALUES('FIPE_FREE','Consulta FIPE Grátis','Valor médio da Tabela FIPE vigente, com relatório e impressão.',0,'fipe-free','["Valor FIPE vigente","Referência mensal","PDF e impressão","Checklist de compra segura"]'::jsonb,1,'Parallelum/FIPE API v2 com fallback BrasilAPI','Tabela FIPE mensal; não consulta situação documental.','FREE',true,true)
        ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,credit_cost=0,slug=EXCLUDED.slug,features=EXCLUDED.features,display_order=EXCLUDED.display_order,source=EXCLUDED.source,coverage=EXCLUDED.coverage,commercial_status=EXCLUDED.commercial_status,featured=EXCLUDED.featured,is_free=true;

        INSERT INTO query_products(id,name,description,credit_cost,active,slug,features,display_order,source,coverage,commercial_status,featured,is_free)
        VALUES
          ('CADASTRAL','Consulta Cadastral Essencial','Confirme se as características do anúncio correspondem ao veículo registrado.',5,false,'cadastral-essencial','["Placa","Marca e modelo","Ano, cor e combustível","Município e UF","Chassi e RENAVAM mascarados"]'::jsonb,10,'Aguardando provider veicular autorizado','Cobertura conforme contrato do fornecedor; produto em breve.','SOON',false,false),
          ('RESTRICTIONS','Restrições e Gravame','Verifique impedimentos que podem afetar a negociação ou transferência.',8,false,'restricoes-gravame','["Gravame","Restrições financeiras","Restrição judicial","Roubo/furto quando coberto"]'::jsonb,20,'Aguardando fonte contratada e autorizada','Cobertura conforme contrato do fornecedor; produto em breve.','SOON',false,false)
        ON CONFLICT(id) DO NOTHING;

        UPDATE query_products SET source=COALESCE(source,'Provider veicular contratado'), coverage=COALESCE(coverage,description), commercial_status=COALESCE(commercial_status,'ACTIVE'), is_free=COALESCE(is_free,false) WHERE id <> 'FIPE_FREE';

        INSERT INTO query_source_rules(product_id,source_type,provider,active,priority,coverage) VALUES
          ('FIPE_FREE','FIPE','parallelum',true,10,'Valor médio e referência mensal da Tabela FIPE'),
          ('FIPE_FREE','FIPE','brasilapi',true,20,'Fallback documentado de consulta FIPE'),
          ('CADASTRAL','IDENTITY','official',false,10,'Aguardando provider veicular autorizado'),
          ('RESTRICTIONS','RESTRICTIONS','contracted',false,10,'Aguardando fonte contratada e autorizada'),
          ('BASIC','IDENTITY','official',false,20,'Aguardando provider veicular autorizado'),
          ('DEBTS','DEBTS','official',false,10,'Aguardando cobertura contratada'),
          ('COMPLETE','FIPE','parallelum',false,10,'Ativação progressiva'),
          ('PREMIUM','PREMIUM','contracted',false,10,'Aguardando fornecedores licenciados')
        ON CONFLICT(product_id,source_type,provider) DO NOTHING;
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
