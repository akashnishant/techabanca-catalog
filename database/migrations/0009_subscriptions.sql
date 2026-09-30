-- Techabanca Catalogue
-- Migration 0009: subscription, entitlement, webhook and usage foundation
--
-- Commercial pricing is intentionally not seeded here. Plan configuration
-- remains data-driven so provisional prices are not baked into migrations.

CREATE TABLE subscription_plans (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL COLLATE NOCASE UNIQUE
        CHECK (
            length(code) BETWEEN 2 AND 40
            AND code = lower(trim(code))
            AND code NOT GLOB '*[^a-z0-9-]*'
            AND code NOT LIKE '-%'
            AND code NOT LIKE '%-'
            AND code NOT LIKE '%--%'
        ),
    name TEXT NOT NULL
        CHECK (length(trim(name)) BETWEEN 2 AND 80),
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0
        CHECK (sort_order >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE plan_entitlements (
    plan_id INTEGER NOT NULL,
    entitlement_key TEXT NOT NULL COLLATE NOCASE
        CHECK (
            length(entitlement_key) BETWEEN 3 AND 120
            AND entitlement_key = lower(trim(entitlement_key))
        ),
    value_type TEXT NOT NULL
        CHECK (value_type IN ('boolean', 'integer', 'string')),
    boolean_value INTEGER
        CHECK (boolean_value IS NULL OR boolean_value IN (0, 1)),
    integer_value INTEGER
        CHECK (integer_value IS NULL OR integer_value >= 0),
    string_value TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (plan_id, entitlement_key),
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE CASCADE,
    CHECK (
        (
            value_type = 'boolean'
            AND boolean_value IS NOT NULL
            AND integer_value IS NULL
            AND string_value IS NULL
        )
        OR
        (
            value_type = 'integer'
            AND boolean_value IS NULL
            AND integer_value IS NOT NULL
            AND string_value IS NULL
        )
        OR
        (
            value_type = 'string'
            AND boolean_value IS NULL
            AND integer_value IS NULL
            AND string_value IS NOT NULL
            AND length(trim(string_value)) > 0
        )
    )
);

CREATE INDEX idx_plan_entitlements_key
    ON plan_entitlements(entitlement_key, plan_id);

CREATE TABLE subscriptions (
    id INTEGER PRIMARY KEY,
    public_id TEXT NOT NULL UNIQUE,
    organization_id INTEGER NOT NULL,
    plan_id INTEGER NOT NULL,
    status TEXT NOT NULL
        CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'expired')),
    billing_interval TEXT
        CHECK (billing_interval IS NULL OR billing_interval IN ('monthly', 'annual')),
    provider TEXT
        CHECK (
            provider IS NULL
            OR (
                length(trim(provider)) BETWEEN 2 AND 40
                AND provider = lower(trim(provider))
            )
        ),
    provider_subscription_id TEXT,
    currency_code TEXT
        CHECK (
            currency_code IS NULL
            OR (
                length(currency_code) = 3
                AND currency_code = upper(currency_code)
                AND currency_code NOT GLOB '*[^A-Z]*'
            )
        ),
    amount_minor_units INTEGER
        CHECK (amount_minor_units IS NULL OR amount_minor_units >= 0),
    trial_starts_at TEXT,
    trial_ends_at TEXT,
    current_period_starts_at TEXT,
    current_period_ends_at TEXT,
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0
        CHECK (cancel_at_period_end IN (0, 1)),
    canceled_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id),
    CHECK (
        (currency_code IS NULL AND amount_minor_units IS NULL)
        OR
        (currency_code IS NOT NULL AND amount_minor_units IS NOT NULL)
    ),
    CHECK (
        trial_ends_at IS NULL
        OR (
            trial_starts_at IS NOT NULL
            AND trial_ends_at > trial_starts_at
        )
    ),
    CHECK (
        current_period_ends_at IS NULL
        OR (
            current_period_starts_at IS NOT NULL
            AND current_period_ends_at > current_period_starts_at
        )
    ),
    CHECK (
        provider_subscription_id IS NULL
        OR provider IS NOT NULL
    )
);

CREATE UNIQUE INDEX uq_subscriptions_one_current_per_org
    ON subscriptions(organization_id)
    WHERE status IN ('trialing', 'active', 'past_due');

CREATE UNIQUE INDEX uq_subscriptions_provider_reference
    ON subscriptions(provider, provider_subscription_id)
    WHERE provider IS NOT NULL
      AND provider_subscription_id IS NOT NULL;

CREATE INDEX idx_subscriptions_org_created
    ON subscriptions(organization_id, created_at DESC);

CREATE INDEX idx_subscriptions_plan_status
    ON subscriptions(plan_id, status);

CREATE TABLE payment_webhook_events (
    id INTEGER PRIMARY KEY,
    provider TEXT NOT NULL
        CHECK (
            length(trim(provider)) BETWEEN 2 AND 40
            AND provider = lower(trim(provider))
        ),
    event_id TEXT NOT NULL
        CHECK (length(trim(event_id)) BETWEEN 1 AND 255),
    event_type TEXT NOT NULL
        CHECK (length(trim(event_type)) BETWEEN 1 AND 160),
    payload_sha256 TEXT NOT NULL
        CHECK (
            length(payload_sha256) = 64
            AND payload_sha256 = lower(payload_sha256)
            AND payload_sha256 NOT GLOB '*[^0-9a-f]*'
        ),
    status TEXT NOT NULL DEFAULT 'received'
        CHECK (status IN ('received', 'processed', 'ignored', 'failed')),
    received_at TEXT NOT NULL,
    processed_at TEXT,
    failure_message TEXT,
    UNIQUE (provider, event_id),
    CHECK (
        status NOT IN ('processed', 'ignored')
        OR processed_at IS NOT NULL
    ),
    CHECK (
        status <> 'failed'
        OR failure_message IS NOT NULL
    )
);

CREATE INDEX idx_payment_webhook_events_status_received
    ON payment_webhook_events(status, received_at);

CREATE TABLE organization_usage (
    organization_id INTEGER NOT NULL,
    usage_key TEXT NOT NULL COLLATE NOCASE
        CHECK (
            length(usage_key) BETWEEN 3 AND 120
            AND usage_key = lower(trim(usage_key))
        ),
    quantity INTEGER NOT NULL DEFAULT 0
        CHECK (quantity >= 0),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (organization_id, usage_key),
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX idx_organization_usage_key
    ON organization_usage(usage_key, organization_id);
