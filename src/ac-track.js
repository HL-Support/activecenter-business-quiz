/**
 * Phase 2: Event Tracking with Deduplication
 * Non-blocking, additive tracking to Supabase
 * Events have unique event_id to prevent duplicate ingestion
 */

const EVENT_BATCH_KEY = 'acEventBatch';
const EVENT_BATCH_DEBOUNCE_MS = 2500;
const MAX_BATCH_SIZE = 50;
const MAX_BATCH_AGE_MS = 30000;

class EventBatcher {
  constructor() {
    this.queue = [];
    this.debounceTimer = null;
    this.lastFlush = Date.now();
    this.initialize();
  }

  initialize() {
    // Try to resume any pending events from previous session
    try {
      const stored = localStorage.getItem(EVENT_BATCH_KEY);
      if (stored) {
        const batch = JSON.parse(stored);
        if (Array.isArray(batch) && batch.length > 0) {
          this.queue = batch;
          this.flush(); // Try to send immediately
        }
      }
    } catch (error) {
      console.warn('Event batch recovery failed:', error);
    }

    // Flush on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flush(true));
    }
  }

  add(event) {
    if (!event || !event.event_id || !event.event_name) {
      console.warn('Invalid event format:', event);
      return;
    }

    this.queue.push(event);

    // Check if we should flush
    const timeSinceLastFlush = Date.now() - this.lastFlush;
    const shouldFlush =
      this.queue.length >= MAX_BATCH_SIZE || timeSinceLastFlush >= MAX_BATCH_AGE_MS;

    if (shouldFlush) {
      this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  scheduleFlush() {
    if (this.debounceTimer) return;

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.flush();
    }, EVENT_BATCH_DEBOUNCE_MS);
  }

  async flush(isUrgent = false) {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.queue.length === 0) {
      return;
    }

    const batch = this.queue.splice(0, MAX_BATCH_SIZE);
    this.lastFlush = Date.now();

    // Save remaining events to storage
    if (this.queue.length > 0) {
      try {
        localStorage.setItem(EVENT_BATCH_KEY, JSON.stringify(this.queue));
      } catch (error) {
        console.warn('Event batch storage failed:', error);
      }
    } else {
      try {
        localStorage.removeItem(EVENT_BATCH_KEY);
      } catch (error) {
        console.warn('Event batch cleanup failed:', error);
      }
    }

    // Non-blocking send
    const sendEvent = async () => {
      try {
        const response = await fetch('/api/bridge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            action: 'write_analytics_batch',
            payload: { events: batch },
          }),
        });

        if (!response.ok) {
          // Put failed events back in queue for retry
          this.queue.unshift(...batch);
          try {
            localStorage.setItem(EVENT_BATCH_KEY, JSON.stringify(this.queue));
          } catch (error) {
            console.warn('Event batch recovery failed:', error);
          }
        }
      } catch (_error) {
        // Network error - put events back in queue
        this.queue.unshift(...batch);
        try {
          localStorage.setItem(EVENT_BATCH_KEY, JSON.stringify(this.queue));
        } catch (_error) {
          console.warn('Event batch recovery failed:', _error);
        }
      }
    };

    // Fire and forget, but handle with keepalive for page unload
    if (isUrgent) {
      await sendEvent();
    } else {
      sendEvent();
    }
  }
}

const batcher = new EventBatcher();

export function trackEvent(eventName, payload = {}) {
  if (!eventName) return;

  // Get current session context
  let sessionHash = '';
  let beraterSlug = '';

  try {
    const sessionData = JSON.parse(localStorage.getItem('acQuizTrackingSession_v1') || 'null');
    sessionHash = sessionData?.hash || '';
  } catch (error) {
    console.warn('Session data parse failed:', error);
  }

  try {
    beraterSlug = localStorage.getItem('acBeraterSlug') || 'default';
  } catch (error) {
    console.warn('Berater slug read failed:', error);
  }

  // Generate unique event_id for deduplication
  const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  // Build event
  const event = {
    event_id: eventId,
    event_name: eventName,
    session_hash: sessionHash,
    berater_slug: beraterSlug,
    event_at: new Date().toISOString(),
    source_app: 'business_leads_quiz',
    funnel: 'business',
    schema_version: 'ac_tracking_v1',
    ...payload,
  };

  // Add to batch
  batcher.add(event);
}

// Export batcher for manual flush if needed
export { batcher };
