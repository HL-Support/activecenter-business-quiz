/**
 * Persistente Client-Queue fuer POST /api/lead-track (Audit 4.1).
 *
 * Invarianten:
 * - enqueue persistiert synchron, bevor irgendein Netzwerkpfad beginnt. Ein CTA-Klick, der
 *   die Seite verlaesst, darf das Event nicht verlieren (bezahlter Traffic haengt daran).
 * - Genau ein Request in flight und strikt FIFO: die Server-Side-effects sind retry-sicher,
 *   aber nicht ordnungsunabhaengig (Video-Rang, Hot-Lead-Mail).
 * - Kein Multi-Tab-Lock: doppelte Sends aus zwei Tabs sind serverseitig abgedeckt, weil die
 *   event_uid ueber alle Versuche stabil bleibt (insertLeadEvent nutzt on_conflict=event_uid
 *   mit ignore-duplicates, enqueue_lead_sync dedupliziert per Advisory-Lock). Ein Client-Lock
 *   waere eine zusaetzliche Fehlerquelle ohne Gewinn.
 * - Kein IndexedDB: asynchron, damit waere die synchrone CTA-Garantie nicht haltbar.
 */

const QUEUE_KEY = 'acLeadEventQueue_v1';
const DEAD_KEY = 'acLeadEventDead_v1';
const MAX_QUEUE_ENTRIES = 150;
const MAX_DEAD_ENTRIES = 20;
const MAX_ATTEMPTS = 12;
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 300000;
const IDLE_WAKEUP_MS = 20000;
const KEEPALIVE_MAX_BODY = 60000;
const OVERFLOW_SACRIFICE_EVENT = 'video_progress';

// Antworten, die auch beim zehnten Versuch dieselben blieben: sofort Dead-Letter statt Retry.
const PERMANENT_STATUS = [400, 401, 403, 405, 413, 422];

export function createLeadEventQueue({
  storage,
  fetchFn,
  now = () => Date.now(),
  random = Math.random,
  setTimeoutFn = (fn, ms) => setTimeout(fn, ms),
  onDiagnostic,
  endpoint = '/api/lead-track',
}) {
  let draining = null;
  // Statt clearTimeout: jeder Timer traegt eine Generation, veraltete Callbacks tun nichts.
  let timerGeneration = 0;

  function diagnose(code, detail) {
    if (typeof onDiagnostic !== 'function') return;
    try {
      onDiagnostic(code, detail);
    } catch {
      /* Diagnose darf den Zustellpfad nie brechen */
    }
  }

  function normalizeEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const uid = String(raw.uid || '');
    const leadHash = String(raw.lead_hash || '');
    const eventName = String(raw.event_name || '');
    if (!uid || !leadHash || !eventName) return null;
    return {
      uid,
      lead_hash: leadHash,
      event_name: eventName,
      payload: raw.payload && typeof raw.payload === 'object' ? raw.payload : {},
      enqueued_at: String(raw.enqueued_at || ''),
      attempts: Number.isFinite(Number(raw.attempts)) ? Number(raw.attempts) : 0,
      next_attempt_at: Number.isFinite(Number(raw.next_attempt_at)) ? Number(raw.next_attempt_at) : 0,
    };
  }

  function readQueue() {
    const raw = storage.getItem(QUEUE_KEY);
    if (!raw) return [];
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (!Array.isArray(parsed)) {
      storage.removeItem(QUEUE_KEY);
      diagnose('queue_corrupt_reset', { key: QUEUE_KEY });
      return [];
    }
    return parsed.map(normalizeEntry).filter((entry) => entry !== null);
  }

  function writeQueue(entries) {
    if (entries.length === 0) {
      storage.removeItem(QUEUE_KEY);
      return;
    }
    storage.setItem(QUEUE_KEY, JSON.stringify(entries));
  }

  function readDeadLetters() {
    const raw = storage.getItem(DEAD_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function pushDeadLetter(entry, error) {
    const dead = readDeadLetters();
    dead.push({
      uid: entry.uid,
      event_name: entry.event_name,
      error: String(error || 'unknown'),
      failed_at: new Date(now()).toISOString(),
    });
    while (dead.length > MAX_DEAD_ENTRIES) dead.shift();
    storage.setItem(DEAD_KEY, JSON.stringify(dead));
  }

  function enforceBounds(entries) {
    while (entries.length > MAX_QUEUE_ENTRIES) {
      // Video-Fortschritt ist monoton und rekonstruierbar, ein CTA-Klick nicht.
      let index = entries.findIndex((entry) => entry.event_name === OVERFLOW_SACRIFICE_EVENT);
      if (index === -1) index = 0;
      const [dropped] = entries.splice(index, 1);
      diagnose('queue_overflow_drop', {
        uid: dropped.uid,
        event_name: dropped.event_name,
        size: entries.length,
      });
    }
  }

  function removeEntry(uid) {
    writeQueue(readQueue().filter((entry) => entry.uid !== uid));
  }

  function updateEntry(uid, patch) {
    writeQueue(readQueue().map((entry) => (entry.uid === uid ? { ...entry, ...patch } : entry)));
  }

  function backoffFor(attempts) {
    const capped = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, attempts));
    const jitter = 0.7 + random() * 0.6;
    return Math.round(capped * jitter);
  }

  function scheduleNextRun() {
    const entries = readQueue();
    if (entries.length === 0) return;
    const waitMs = Math.max(0, entries[0].next_attempt_at - now());
    // Ein Timer, kein Dauer-Intervall: spaetestens nach IDLE_WAKEUP_MS wird erneut geprueft,
    // solange ueberhaupt etwas in der Queue liegt.
    const delay = Math.min(waitMs > 0 ? waitMs : IDLE_WAKEUP_MS, IDLE_WAKEUP_MS);
    const generation = timerGeneration + 1;
    timerGeneration = generation;
    setTimeoutFn(() => {
      if (generation !== timerGeneration) return;
      drain();
    }, delay);
  }

  async function sendEntry(entry) {
    const body = JSON.stringify({
      lead_hash: entry.lead_hash,
      event_name: entry.event_name,
      payload: {
        ...entry.payload,
        event_uid: entry.uid,
        queue_attempts: entry.attempts,
      },
    });

    let response;
    try {
      response = await fetchFn(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: body.length < KEEPALIVE_MAX_BODY,
        body,
      });
    } catch (error) {
      return { kind: 'transient', reason: `network:${error?.message || 'fetch_failed'}` };
    }

    const status = Number(response?.status || 0);
    if (PERMANENT_STATUS.includes(status)) {
      return { kind: 'permanent', reason: `http_${status}` };
    }

    const ok = response?.ok === true || (status >= 200 && status < 300);
    if (!ok) return { kind: 'transient', reason: `http_${status || 'unknown'}` };

    let data = null;
    if (typeof response?.json === 'function') {
      try {
        data = await response.json();
      } catch {
        data = null;
      }
    }
    // 202 mit skipped:true ist ebenfalls ein Ack: der Writer ist fuer diesen Lead aus.
    if (data && data.success === true) return { kind: 'ack' };
    return { kind: 'transient', reason: 'ack_missing' };
  }

  // Schutz gegen eine Endlosschleife, wenn ein voller localStorage den Schreibvorgang
  // verschluckt (setItem wirft, getItem liefert weiter den alten Stand): der erledigte
  // Eintrag bliebe Kopf der Queue und wuerde ohne Ende erneut gesendet.
  function isStillHead(uid) {
    const entries = readQueue();
    return entries.length > 0 && entries[0].uid === uid;
  }

  async function runDrain() {
    for (;;) {
      const entries = readQueue();
      if (entries.length === 0) return;

      const entry = entries[0];
      if (entry.next_attempt_at > now()) break;

      const outcome = await sendEntry(entry);

      if (outcome.kind === 'ack') {
        removeEntry(entry.uid);
        if (isStillHead(entry.uid)) {
          diagnose('queue_write_stalled', { uid: entry.uid, event_name: entry.event_name });
          break;
        }
        continue;
      }

      if (outcome.kind === 'permanent') {
        removeEntry(entry.uid);
        pushDeadLetter(entry, outcome.reason);
        diagnose('queue_event_dead', {
          uid: entry.uid,
          event_name: entry.event_name,
          error: outcome.reason,
        });
        if (isStillHead(entry.uid)) {
          diagnose('queue_write_stalled', { uid: entry.uid, event_name: entry.event_name });
          break;
        }
        continue;
      }

      const attempts = entry.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        removeEntry(entry.uid);
        pushDeadLetter(entry, outcome.reason);
        diagnose('queue_retry_exhausted', {
          uid: entry.uid,
          event_name: entry.event_name,
          attempts,
          error: outcome.reason,
        });
        if (isStillHead(entry.uid)) {
          diagnose('queue_write_stalled', { uid: entry.uid, event_name: entry.event_name });
          break;
        }
        continue;
      }

      updateEntry(entry.uid, { attempts, next_attempt_at: now() + backoffFor(attempts) });
      // Abbruch statt Weiterarbeit: spaetere Eintraege duerfen den gescheiterten nicht ueberholen.
      break;
    }

    scheduleNextRun();
  }

  function drain() {
    if (draining) return draining;
    draining = (async () => {
      try {
        await runDrain();
      } finally {
        draining = null;
      }
    })();
    return draining;
  }

  function enqueue({ uid, leadHash, eventName, payload = {} }) {
    const timestamp = now();
    const isoTimestamp = new Date(timestamp).toISOString();
    const entry = {
      uid: String(uid),
      lead_hash: String(leadHash),
      event_name: String(eventName),
      payload: {
        ...payload,
        event_uid: String(uid),
        queued_at: isoTimestamp,
      },
      enqueued_at: isoTimestamp,
      attempts: 0,
      next_attempt_at: timestamp,
    };

    const entries = readQueue();
    entries.push(entry);
    enforceBounds(entries);
    writeQueue(entries);

    drain();
    return entry;
  }

  function size() {
    return readQueue().length;
  }

  function _peekForTests() {
    return readQueue();
  }

  return { enqueue, drain, size, _peekForTests };
}
