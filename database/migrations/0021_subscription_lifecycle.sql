-- Catalogue-only lifecycle. No provisional commercial prices or external resources are seeded.
ALTER TABLE subscriptions ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1);
ALTER TABLE subscriptions ADD COLUMN paid_verified INTEGER NOT NULL DEFAULT 0 CHECK (paid_verified IN (0, 1));
ALTER TABLE subscriptions ADD COLUMN provider_event_at INTEGER NOT NULL DEFAULT 0 CHECK (provider_event_at >= 0);
ALTER TABLE subscriptions ADD COLUMN provider_terminal_at INTEGER CHECK (provider_terminal_at IS NULL OR provider_terminal_at >= 0);

CREATE TABLE organization_trials (
  organization_id INTEGER PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_public_id TEXT NOT NULL UNIQUE,
  started_at TEXT NOT NULL,
  ends_at TEXT NOT NULL CHECK (ends_at > started_at)
);
-- Existing trials consume eligibility even if their subscription is later removed.
INSERT INTO organization_trials (organization_id, subscription_public_id, started_at, ends_at)
SELECT organization_id, public_id, COALESCE(trial_starts_at, created_at),
  COALESCE(trial_ends_at, strftime('%Y-%m-%dT%H:%M:%fZ', COALESCE(trial_starts_at, created_at), '+14 days'))
FROM subscriptions WHERE trial_starts_at IS NOT NULL OR status = 'trialing'
GROUP BY organization_id;

CREATE TABLE subscription_offers (
  public_id TEXT PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES subscription_plans(id),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'annual')),
  currency_code TEXT NOT NULL CHECK (currency_code = 'INR'),
  amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units > 0 AND amount_minor_units <= 100000000),
  provider_plan_id TEXT NOT NULL UNIQUE CHECK (length(provider_plan_id) BETWEEN 6 AND 80),
  provider_account_id TEXT NOT NULL CHECK (length(provider_account_id) BETWEEN 6 AND 80),
  total_cycles INTEGER NOT NULL CHECK (total_cycles BETWEEN 2 AND 120),
  mode TEXT NOT NULL CHECK (mode = 'test'),
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE subscription_checkouts (
  public_id TEXT PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  offer_public_id TEXT NOT NULL REFERENCES subscription_offers(public_id),
  subscription_public_id TEXT NOT NULL UNIQUE,
  provider_subscription_id TEXT UNIQUE,
  provider_plan_id TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  plan_id INTEGER NOT NULL REFERENCES subscription_plans(id),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'annual')),
  currency_code TEXT NOT NULL CHECK (currency_code = 'INR'),
  amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units > 0),
  status TEXT NOT NULL CHECK (status IN ('creating', 'ready', 'unknown', 'closed', 'failed')),
  checkout_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX uq_subscription_checkout_open ON subscription_checkouts(organization_id)
WHERE status IN ('creating', 'ready', 'unknown');
CREATE INDEX idx_subscription_checkout_org ON subscription_checkouts(organization_id, created_at DESC);

-- A payment is consumed once even when a provider sends more than one event ID for it.
CREATE TABLE subscription_payments (
  provider TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units > 0),
  currency_code TEXT NOT NULL,
  period_starts_at TEXT NOT NULL,
  period_ends_at TEXT NOT NULL CHECK (period_ends_at > period_starts_at),
  created_at TEXT NOT NULL,
  PRIMARY KEY(provider, payment_id)
);

CREATE TABLE subscription_activity (
  id INTEGER PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_public_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('trial_started', 'trial_ended', 'checkout_created', 'cancel_requested', 'provider_event')),
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(action, event_id)
);
