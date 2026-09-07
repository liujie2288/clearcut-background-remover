const EVENTS = new Set([
  'page_view', 'upload_started', 'upload_success', 'upload_rejected',
  'model_load_started', 'model_ready', 'removal_started', 'removal_success',
  'removal_failed', 'download_clicked', 'remove_another_clicked',
  'sample_image_used', 'feedback_submitted',
]);

type SafeValue = string | number | boolean;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (command: 'event', event: string, metadata?: Record<string, SafeValue>) => void;
  }
}

export function track(event: string, metadata: Record<string, SafeValue> = {}): void {
  if (!EVENTS.has(event)) return;
  window.gtag?.('event', event, metadata);
}
