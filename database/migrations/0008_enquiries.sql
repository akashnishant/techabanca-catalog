-- Techabanca Catalogue
-- Migration 0008: enquiries foundation
--
-- Enquiries belong to an organization and catalogue, and may optionally
-- reference an item. Status flow is intentionally small for MVP:
-- New -> Contacted -> Closed.

CREATE TABLE enquiries (
    id INTEGER PRIMARY KEY,
    public_id TEXT NOT NULL UNIQUE,
    organization_id INTEGER NOT NULL,
    catalogue_id INTEGER NOT NULL,
    item_id INTEGER,
    source TEXT NOT NULL DEFAULT 'catalogue'
        CHECK (source IN ('catalogue', 'item', 'contact')),
    contact_name TEXT NOT NULL
        CHECK (length(trim(contact_name)) BETWEEN 1 AND 120),
    company_name TEXT
        CHECK (company_name IS NULL OR length(trim(company_name)) BETWEEN 1 AND 160),
    email TEXT COLLATE NOCASE
        CHECK (email IS NULL OR length(trim(email)) BETWEEN 3 AND 254),
    phone TEXT
        CHECK (phone IS NULL OR length(trim(phone)) BETWEEN 5 AND 40),
    message TEXT NOT NULL
        CHECK (length(trim(message)) BETWEEN 1 AND 5000),
    status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'contacted', 'closed')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    contacted_at TEXT,
    closed_at TEXT,
    deleted_at TEXT,
    CHECK (email IS NOT NULL OR phone IS NOT NULL),
    CHECK (source <> 'item' OR item_id IS NOT NULL),
    CHECK (status <> 'contacted' OR contacted_at IS NOT NULL),
    CHECK (status <> 'closed' OR closed_at IS NOT NULL),
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (catalogue_id) REFERENCES catalogues(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES catalogue_items(id) ON DELETE SET NULL
);

CREATE INDEX idx_enquiries_org_status_created
    ON enquiries(organization_id, status, created_at DESC);

CREATE INDEX idx_enquiries_catalogue_status_created
    ON enquiries(catalogue_id, status, created_at DESC);

CREATE INDEX idx_enquiries_item_created
    ON enquiries(item_id, created_at DESC)
    WHERE item_id IS NOT NULL;

CREATE TRIGGER enquiries_validate_scope_insert
BEFORE INSERT ON enquiries
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogues c
    WHERE c.id = NEW.catalogue_id
      AND c.organization_id = NEW.organization_id
      AND c.deleted_at IS NULL
)
OR (
    NEW.item_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1
        FROM catalogue_items i
        WHERE i.id = NEW.item_id
          AND i.catalogue_id = NEW.catalogue_id
          AND i.deleted_at IS NULL
    )
)
BEGIN
    SELECT RAISE(ABORT, 'invalid_enquiry_scope');
END;

CREATE TRIGGER enquiries_validate_scope_update
BEFORE UPDATE OF organization_id, catalogue_id, item_id ON enquiries
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogues c
    WHERE c.id = NEW.catalogue_id
      AND c.organization_id = NEW.organization_id
      AND c.deleted_at IS NULL
)
OR (
    NEW.item_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1
        FROM catalogue_items i
        WHERE i.id = NEW.item_id
          AND i.catalogue_id = NEW.catalogue_id
          AND i.deleted_at IS NULL
    )
)
BEGIN
    SELECT RAISE(ABORT, 'invalid_enquiry_scope');
END;

CREATE TRIGGER enquiries_validate_status_transition
BEFORE UPDATE OF status ON enquiries
FOR EACH ROW
WHEN NOT (
    NEW.status = OLD.status
    OR (OLD.status = 'new' AND NEW.status IN ('contacted', 'closed'))
    OR (OLD.status = 'contacted' AND NEW.status = 'closed')
)
BEGIN
    SELECT RAISE(ABORT, 'invalid_enquiry_status_transition');
END;

CREATE TABLE enquiry_activity (
    id INTEGER PRIMARY KEY,
    enquiry_id INTEGER NOT NULL,
    actor_user_id INTEGER,
    activity_type TEXT NOT NULL
        CHECK (activity_type IN ('created', 'status_changed', 'note')),
    from_status TEXT
        CHECK (from_status IS NULL OR from_status IN ('new', 'contacted', 'closed')),
    to_status TEXT
        CHECK (to_status IS NULL OR to_status IN ('new', 'contacted', 'closed')),
    note TEXT
        CHECK (note IS NULL OR length(trim(note)) BETWEEN 1 AND 2000),
    created_at TEXT NOT NULL,
    CHECK (
        activity_type <> 'status_changed'
        OR (
            from_status IS NOT NULL
            AND to_status IS NOT NULL
            AND from_status <> to_status
        )
    ),
    CHECK (
        activity_type <> 'note'
        OR note IS NOT NULL
    ),
    FOREIGN KEY (enquiry_id) REFERENCES enquiries(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_enquiry_activity_enquiry_created
    ON enquiry_activity(enquiry_id, created_at);
