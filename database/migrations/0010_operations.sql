-- Techabanca Catalogue
-- Migration 0010: operational audit and moderation foundation
--
-- Audit events are append-only. Moderation remains a separate operational
-- concern from organization roles and public rendering.

CREATE TABLE audit_events (
    id INTEGER PRIMARY KEY,
    organization_id INTEGER,
    actor_user_id INTEGER,
    actor_type TEXT NOT NULL
        CHECK (actor_type IN ('user', 'system', 'admin')),
    action TEXT NOT NULL
        CHECK (
            length(trim(action)) BETWEEN 3 AND 120
            AND action = lower(trim(action))
        ),
    entity_type TEXT NOT NULL
        CHECK (
            length(trim(entity_type)) BETWEEN 2 AND 80
            AND entity_type = lower(trim(entity_type))
        ),
    entity_public_id TEXT,
    request_id TEXT,
    metadata_json TEXT
        CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
    created_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_audit_events_org_created
    ON audit_events(organization_id, created_at DESC);

CREATE INDEX idx_audit_events_entity
    ON audit_events(entity_type, entity_public_id, created_at DESC);

CREATE INDEX idx_audit_events_action_created
    ON audit_events(action, created_at DESC);

CREATE TRIGGER audit_events_immutable_update
BEFORE UPDATE ON audit_events
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'audit_event_is_immutable');
END;

CREATE TRIGGER audit_events_immutable_delete
BEFORE DELETE ON audit_events
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'audit_event_is_immutable');
END;

CREATE TABLE moderation_cases (
    id INTEGER PRIMARY KEY,
    public_id TEXT NOT NULL UNIQUE,
    organization_id INTEGER NOT NULL,
    catalogue_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
    reason_code TEXT NOT NULL
        CHECK (
            reason_code IN (
                'spam',
                'prohibited_content',
                'impersonation',
                'abuse',
                'security',
                'legal',
                'other'
            )
        ),
    summary TEXT NOT NULL
        CHECK (length(trim(summary)) BETWEEN 1 AND 1000),
    resolution_note TEXT
        CHECK (
            resolution_note IS NULL
            OR length(trim(resolution_note)) BETWEEN 1 AND 2000
        ),
    opened_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    resolved_at TEXT,
    created_by_user_id INTEGER,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (catalogue_id) REFERENCES catalogues(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CHECK (
        status NOT IN ('resolved', 'dismissed')
        OR resolved_at IS NOT NULL
    )
);

CREATE INDEX idx_moderation_cases_org_status
    ON moderation_cases(organization_id, status, opened_at DESC);

CREATE INDEX idx_moderation_cases_catalogue_status
    ON moderation_cases(catalogue_id, status, opened_at DESC);

CREATE TRIGGER moderation_cases_validate_scope_insert
BEFORE INSERT ON moderation_cases
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogues c
    WHERE c.id = NEW.catalogue_id
      AND c.organization_id = NEW.organization_id
      AND c.deleted_at IS NULL
)
BEGIN
    SELECT RAISE(ABORT, 'invalid_moderation_scope');
END;

CREATE TRIGGER moderation_cases_validate_scope_update
BEFORE UPDATE OF organization_id, catalogue_id ON moderation_cases
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogues c
    WHERE c.id = NEW.catalogue_id
      AND c.organization_id = NEW.organization_id
      AND c.deleted_at IS NULL
)
BEGIN
    SELECT RAISE(ABORT, 'invalid_moderation_scope');
END;

CREATE TRIGGER moderation_cases_validate_status_transition
BEFORE UPDATE OF status ON moderation_cases
FOR EACH ROW
WHEN NOT (
    NEW.status = OLD.status
    OR (OLD.status = 'open' AND NEW.status IN ('reviewing', 'resolved', 'dismissed'))
    OR (OLD.status = 'reviewing' AND NEW.status IN ('resolved', 'dismissed'))
)
BEGIN
    SELECT RAISE(ABORT, 'invalid_moderation_status_transition');
END;

CREATE TABLE moderation_case_events (
    id INTEGER PRIMARY KEY,
    moderation_case_id INTEGER NOT NULL,
    actor_user_id INTEGER,
    event_type TEXT NOT NULL
        CHECK (
            event_type IN (
                'created',
                'status_changed',
                'note',
                'public_suspended',
                'public_restored'
            )
        ),
    from_status TEXT
        CHECK (
            from_status IS NULL
            OR from_status IN ('open', 'reviewing', 'resolved', 'dismissed')
        ),
    to_status TEXT
        CHECK (
            to_status IS NULL
            OR to_status IN ('open', 'reviewing', 'resolved', 'dismissed')
        ),
    note TEXT
        CHECK (
            note IS NULL
            OR length(trim(note)) BETWEEN 1 AND 2000
        ),
    created_at TEXT NOT NULL,
    FOREIGN KEY (moderation_case_id) REFERENCES moderation_cases(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CHECK (
        event_type <> 'status_changed'
        OR (
            from_status IS NOT NULL
            AND to_status IS NOT NULL
            AND from_status <> to_status
        )
    ),
    CHECK (
        event_type <> 'note'
        OR note IS NOT NULL
    )
);

CREATE INDEX idx_moderation_case_events_case_created
    ON moderation_case_events(moderation_case_id, created_at);

CREATE TRIGGER moderation_case_events_immutable_update
BEFORE UPDATE ON moderation_case_events
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'moderation_event_is_immutable');
END;

CREATE TRIGGER moderation_case_events_immutable_delete
BEFORE DELETE ON moderation_case_events
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'moderation_event_is_immutable');
END;
