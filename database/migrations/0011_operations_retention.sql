-- Techabanca Catalogue
-- Migration 0011: reconcile immutable operational history with FK retention.
--
-- Audit/moderation history stays immutable for substantive fields.
-- The only permitted UPDATE is foreign-key anonymization/retention:
-- referenced organization/user IDs may transition from a value to NULL.

DROP TRIGGER audit_events_immutable_update;

CREATE TRIGGER audit_events_immutable_update
BEFORE UPDATE ON audit_events
FOR EACH ROW
WHEN NOT (
    NEW.actor_type IS OLD.actor_type
    AND NEW.action IS OLD.action
    AND NEW.entity_type IS OLD.entity_type
    AND NEW.entity_public_id IS OLD.entity_public_id
    AND NEW.request_id IS OLD.request_id
    AND NEW.metadata_json IS OLD.metadata_json
    AND NEW.created_at IS OLD.created_at
    AND (
        NEW.organization_id IS OLD.organization_id
        OR NEW.organization_id IS NULL
    )
    AND (
        NEW.actor_user_id IS OLD.actor_user_id
        OR NEW.actor_user_id IS NULL
    )
)
BEGIN
    SELECT RAISE(ABORT, 'audit_event_is_immutable');
END;

DROP TRIGGER moderation_case_events_immutable_update;

CREATE TRIGGER moderation_case_events_immutable_update
BEFORE UPDATE ON moderation_case_events
FOR EACH ROW
WHEN NOT (
    NEW.moderation_case_id IS OLD.moderation_case_id
    AND NEW.event_type IS OLD.event_type
    AND NEW.from_status IS OLD.from_status
    AND NEW.to_status IS OLD.to_status
    AND NEW.note IS OLD.note
    AND NEW.created_at IS OLD.created_at
    AND (
        NEW.actor_user_id IS OLD.actor_user_id
        OR NEW.actor_user_id IS NULL
    )
)
BEGIN
    SELECT RAISE(ABORT, 'moderation_event_is_immutable');
END;
