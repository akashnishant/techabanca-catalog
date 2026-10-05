-- Match stable public-page ordering; keep immutable snapshots and visibility gates unchanged.
CREATE INDEX idx_published_items_page_order
  ON published_items(publication_id, sort_order, name, item_public_id);
CREATE INDEX idx_published_items_type_order
  ON published_items(publication_id, item_type, sort_order, name, item_public_id);
CREATE INDEX idx_published_items_featured_order
  ON published_items(publication_id, is_featured, sort_order, name, item_public_id);
CREATE INDEX idx_published_categories_page_order
  ON published_categories(publication_id, sort_order, name, category_public_id);
