-- Techabanca Catalogue
-- Migration 0014: category authoring constraints
--
-- The original parent trigger validates the selected parent, but changing a
-- root category that already has active children into a child would otherwise
-- create grandchildren indirectly. Prevent that reverse-depth violation.

CREATE TRIGGER categories_prevent_depth_increase_with_children
BEFORE UPDATE OF parent_id ON categories
FOR EACH ROW
WHEN NEW.parent_id IS NOT NULL
     AND EXISTS (
         SELECT 1
         FROM categories child
         WHERE child.parent_id = OLD.id
           AND child.deleted_at IS NULL
     )
BEGIN
    SELECT RAISE(ABORT, 'category_with_children_cannot_become_child');
END;