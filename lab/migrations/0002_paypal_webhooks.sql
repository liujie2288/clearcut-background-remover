CREATE TABLE IF NOT EXISTS paypal_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  resource_id TEXT,
  processing_status TEXT NOT NULL,
  error_message TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS paypal_webhook_events_by_type
  ON paypal_webhook_events(event_type, received_at DESC);
