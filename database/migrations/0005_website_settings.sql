-- Techabanca Catalogue
-- Migration 0005: controlled website and theme settings
--
-- This is configuration, not a page builder. No arbitrary HTML or CSS is stored.
-- Public rendering will later snapshot these settings into the published read model.

CREATE TABLE theme_presets (
    code TEXT NOT NULL COLLATE NOCASE PRIMARY KEY
        CHECK (
            length(code) BETWEEN 2 AND 40
            AND code = lower(code)
            AND code NOT GLOB '*[^a-z0-9-]*'
            AND code NOT LIKE '-%'
            AND code NOT LIKE '%-'
            AND code NOT LIKE '%--%'
        ),
    name TEXT NOT NULL
        CHECK (length(trim(name)) BETWEEN 2 AND 80),
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
        CHECK (sort_order >= 0),
    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT INTO theme_presets (
    code,
    name,
    description,
    sort_order,
    is_active,
    created_at,
    updated_at
) VALUES (
    'professional',
    'Professional',
    'Clean, credible business catalogue with clear hierarchy and restrained Techabanca branding.',
    10,
    1,
    '2026-09-30T00:00:00.000Z',
    '2026-09-30T00:00:00.000Z'
);

CREATE TABLE catalogue_website_settings (
    catalogue_id INTEGER PRIMARY KEY,
    theme_code TEXT NOT NULL DEFAULT 'professional',
    logo_asset_id INTEGER,
    hero_asset_id INTEGER,
    hero_title TEXT
        CHECK (hero_title IS NULL OR length(trim(hero_title)) BETWEEN 1 AND 120),
    hero_subtitle TEXT
        CHECK (hero_subtitle IS NULL OR length(trim(hero_subtitle)) BETWEEN 1 AND 300),
    hero_cta_label TEXT
        CHECK (hero_cta_label IS NULL OR length(trim(hero_cta_label)) BETWEEN 1 AND 60),
    hero_cta_target TEXT NOT NULL DEFAULT 'catalogue'
        CHECK (hero_cta_target IN ('catalogue', 'contact', 'whatsapp')),
    show_featured_items INTEGER NOT NULL DEFAULT 1
        CHECK (show_featured_items IN (0, 1)),
    show_categories INTEGER NOT NULL DEFAULT 1
        CHECK (show_categories IN (0, 1)),
    show_about INTEGER NOT NULL DEFAULT 1
        CHECK (show_about IN (0, 1)),
    show_contact INTEGER NOT NULL DEFAULT 1
        CHECK (show_contact IN (0, 1)),
    show_whatsapp INTEGER NOT NULL DEFAULT 1
        CHECK (show_whatsapp IN (0, 1)),
    show_phone INTEGER NOT NULL DEFAULT 1
        CHECK (show_phone IN (0, 1)),
    show_email INTEGER NOT NULL DEFAULT 1
        CHECK (show_email IN (0, 1)),
    seo_title TEXT
        CHECK (seo_title IS NULL OR length(trim(seo_title)) BETWEEN 1 AND 70),
    seo_description TEXT
        CHECK (seo_description IS NULL OR length(trim(seo_description)) BETWEEN 1 AND 160),
    version INTEGER NOT NULL DEFAULT 1
        CHECK (version >= 1),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (catalogue_id) REFERENCES catalogues(id) ON DELETE CASCADE,
    FOREIGN KEY (theme_code) REFERENCES theme_presets(code),
    FOREIGN KEY (logo_asset_id) REFERENCES assets(id) ON DELETE SET NULL,
    FOREIGN KEY (hero_asset_id) REFERENCES assets(id) ON DELETE SET NULL
);

CREATE INDEX idx_catalogue_website_settings_theme
    ON catalogue_website_settings(theme_code);

CREATE TRIGGER catalogue_website_settings_validate_logo_insert
BEFORE INSERT ON catalogue_website_settings
FOR EACH ROW
WHEN NEW.logo_asset_id IS NOT NULL
     AND NOT EXISTS (
        SELECT 1
        FROM catalogues c
        INNER JOIN assets a
            ON a.id = NEW.logo_asset_id
        WHERE c.id = NEW.catalogue_id
          AND c.deleted_at IS NULL
          AND a.organization_id = c.organization_id
          AND a.asset_kind = 'image'
          AND a.status = 'ready'
          AND a.deleted_at IS NULL
     )
BEGIN
    SELECT RAISE(ABORT, 'invalid_catalogue_logo_asset');
END;

CREATE TRIGGER catalogue_website_settings_validate_logo_update
BEFORE UPDATE OF catalogue_id, logo_asset_id ON catalogue_website_settings
FOR EACH ROW
WHEN NEW.logo_asset_id IS NOT NULL
     AND NOT EXISTS (
        SELECT 1
        FROM catalogues c
        INNER JOIN assets a
            ON a.id = NEW.logo_asset_id
        WHERE c.id = NEW.catalogue_id
          AND c.deleted_at IS NULL
          AND a.organization_id = c.organization_id
          AND a.asset_kind = 'image'
          AND a.status = 'ready'
          AND a.deleted_at IS NULL
     )
BEGIN
    SELECT RAISE(ABORT, 'invalid_catalogue_logo_asset');
END;

CREATE TRIGGER catalogue_website_settings_validate_hero_insert
BEFORE INSERT ON catalogue_website_settings
FOR EACH ROW
WHEN NEW.hero_asset_id IS NOT NULL
     AND NOT EXISTS (
        SELECT 1
        FROM catalogues c
        INNER JOIN assets a
            ON a.id = NEW.hero_asset_id
        WHERE c.id = NEW.catalogue_id
          AND c.deleted_at IS NULL
          AND a.organization_id = c.organization_id
          AND a.asset_kind = 'image'
          AND a.status = 'ready'
          AND a.deleted_at IS NULL
     )
BEGIN
    SELECT RAISE(ABORT, 'invalid_catalogue_hero_asset');
END;

CREATE TRIGGER catalogue_website_settings_validate_hero_update
BEFORE UPDATE OF catalogue_id, hero_asset_id ON catalogue_website_settings
FOR EACH ROW
WHEN NEW.hero_asset_id IS NOT NULL
     AND NOT EXISTS (
        SELECT 1
        FROM catalogues c
        INNER JOIN assets a
            ON a.id = NEW.hero_asset_id
        WHERE c.id = NEW.catalogue_id
          AND c.deleted_at IS NULL
          AND a.organization_id = c.organization_id
          AND a.asset_kind = 'image'
          AND a.status = 'ready'
          AND a.deleted_at IS NULL
     )
BEGIN
    SELECT RAISE(ABORT, 'invalid_catalogue_hero_asset');
END;
