-- Daily aggregate counts only. No visitor, request, search, contact or enquiry text.
CREATE TABLE catalogue_analytics_daily (
    catalogue_id INTEGER NOT NULL REFERENCES catalogues(id) ON DELETE CASCADE,
    day TEXT NOT NULL CHECK (length(day) = 10 AND day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    event TEXT NOT NULL CHECK (event IN ('catalogue_view', 'item_view', 'search', 'whatsapp_click', 'enquiry_started', 'enquiry_submitted')),
    item_public_id TEXT NOT NULL DEFAULT '' CHECK (item_public_id = '' OR (length(item_public_id) = 36 AND item_public_id GLOB 'itm_*' AND substr(item_public_id, 5) NOT GLOB '*[^a-f0-9]*')),
    count INTEGER NOT NULL CHECK (typeof(count) = 'integer' AND count BETWEEN 1 AND 9007199254740991),
    PRIMARY KEY (catalogue_id, day, event, item_public_id),
    CHECK (event <> 'item_view' OR item_public_id <> '')
) WITHOUT ROWID;
CREATE INDEX idx_catalogue_analytics_retention ON catalogue_analytics_daily(day);
