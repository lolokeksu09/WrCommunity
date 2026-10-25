CREATE INDEX notifications_recipient_order_idx ON notifications(recipient_id,created_at DESC,id DESC);
CREATE INDEX notifications_unread_recipient_idx ON notifications(recipient_id) WHERE read_at IS NULL;
CREATE INDEX reports_state_order_idx ON reports(state,created_at DESC,id DESC);
CREATE INDEX reports_order_idx ON reports(created_at DESC,id DESC);
