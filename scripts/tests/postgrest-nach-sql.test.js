const test = require('node:test');
const assert = require('node:assert/strict');

const { uebersetze } = require('../../server/postgrest-nach-sql.js');

// Dieser Übersetzer entscheidet, welche Zeilen die Anwendung sieht und schreibt.
// Ein still verlorener Filter liefert zu viele Zeilen, ein falsch geratener
// Konflikt-Zweig überschreibt Daten - beides fällt im Betrieb nicht auf.
// Deshalb prüfen diese Tests nicht nur, was er kann, sondern vor allem, dass er
// bei allem Unklaren LAUT scheitert.

test('RPC wird zu einem Aufruf mit benannten Parametern im Zielschema', () => {
  const r = uebersetze('rpc/submit_lead_complete', {
    method: 'POST',
    body: JSON.stringify({ p_state: { a: 1 }, p_lang: 'de' }),
  });
  assert.equal(r.sql, 'SELECT * FROM leads.submit_lead_complete(p_state => $1, p_lang => $2)');
  assert.deepEqual(r.werte, [{ a: 1 }, 'de']);
});

test('undefined-Argumente werden zu NULL, nicht weggelassen', () => {
  // Weglassen würde die Funktion ihren DEFAULT nehmen lassen - ein anderer Vertrag
  // als bei PostgREST, das den Schlüssel mitschickt.
  const r = uebersetze('rpc/f', { method: 'POST', body: JSON.stringify({ a: null }) });
  assert.deepEqual(r.werte, [null]);
});

test('einfaches Lesen mit Filter, Auswahl und Grenze', () => {
  const r = uebersetze('lead_state?lead_hash=eq.qz_abc&select=lead_hash,email&limit=1',
    { method: 'GET' });
  assert.equal(r.sql, 'SELECT lead_hash, email FROM leads.lead_state WHERE lead_hash = $1 LIMIT 1');
  assert.deepEqual(r.werte, ['qz_abc']);
});

test('alle im Projekt verwendeten Operatoren werden übersetzt', () => {
  const faelle = [
    ['a=eq.1', 'a = $1'], ['a=neq.1', 'a <> $1'], ['a=gt.1', 'a > $1'],
    ['a=gte.1', 'a >= $1'], ['a=lt.1', 'a < $1'], ['a=lte.1', 'a <= $1'],
  ];
  for (const [filter, erwartet] of faelle) {
    const r = uebersetze(`t?${filter}`, { method: 'GET' });
    assert.ok(r.sql.includes(`WHERE ${erwartet}`), `${filter} -> ${r.sql}`);
  }
});

test('is.null und in.(…) sind Sonderformen und werden korrekt gebaut', () => {
  const a = uebersetze('t?resolved_at=is.null', { method: 'GET' });
  assert.ok(a.sql.endsWith('WHERE resolved_at IS NULL'));
  assert.deepEqual(a.werte, []);

  const b = uebersetze('t?key=in.(a,b,c)', { method: 'GET' });
  assert.ok(b.sql.endsWith('WHERE key IN ($1, $2, $3)'));
  assert.deepEqual(b.werte, ['a', 'b', 'c']);
});

test('Werte gehen als Parameter, niemals in den SQL-Text', () => {
  // Der entscheidende Schutz: ein Wert mit Anführungszeichen darf den Text nicht
  // verlassen können.
  const r = uebersetze("t?name=eq.O'Brien%3B%20DROP%20TABLE", { method: 'GET' });
  assert.ok(!r.sql.includes('DROP'), 'der Wert ist im SQL-Text gelandet');
  assert.equal(r.werte[0], "O'Brien; DROP TABLE");
});

test('Upsert mit merge-duplicates aktualisiert genau die mitgelieferten Spalten', () => {
  const r = uebersetze('lead_state?on_conflict=lead_hash', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ lead_hash: 'qz_a', email: 'x@y.z' }),
  });
  assert.equal(r.sql,
    'INSERT INTO leads.lead_state (lead_hash, email) VALUES ($1, $2) '
    + 'ON CONFLICT (lead_hash) DO UPDATE SET email = EXCLUDED.email');
  assert.equal(r.erwartetZeilen, false);
});

test('ignore-duplicates wird zu DO NOTHING', () => {
  const r = uebersetze('lead_events?on_conflict=event_uid', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ event_uid: 'e1' }),
  });
  assert.ok(r.sql.includes('ON CONFLICT (event_uid) DO NOTHING'));
});

test('mehrere Zeilen ergeben eine rechteckige Werteliste, fehlende Felder werden NULL', () => {
  const r = uebersetze('t', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify([{ a: 1, b: 2 }, { a: 3 }]),
  });
  assert.equal(r.sql, 'INSERT INTO leads.t (a, b) VALUES ($1, $2), ($3, $4)');
  assert.deepEqual(r.werte, [1, 2, 3, null]);
});

test('PATCH ohne Filter ist verboten - sonst träfe es die ganze Tabelle', () => {
  assert.throws(
    () => uebersetze('lead_state', { method: 'PATCH', body: JSON.stringify({ a: 1 }) }),
    /PATCH ohne Filter/
  );
});

test('PATCH mit Filter setzt nur die betroffenen Zeilen', () => {
  const r = uebersetze('lead_state?lead_hash=eq.qz_a', {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ sync_status: 'ok' }),
  });
  // Die Filterwerte werden zuerst gesammelt, deshalb traegt der Filter $1 und das
  // gesetzte Feld $2. Entscheidend ist nicht die Nummerierung, sondern dass jeder
  // Platzhalter auf SEINEN Wert zeigt - deshalb hier beides zusammen geprueft.
  assert.equal(r.sql, 'UPDATE leads.lead_state SET sync_status = $2 WHERE lead_hash = $1');
  assert.deepEqual(r.werte, ['qz_a', 'ok']);
});

test('Platzhalter zeigen auch bei mehreren Filtern und Feldern auf ihren Wert', () => {
  // Gegenprobe zur Nummerierung: Wenn Filter und SET durcheinandergerieten, schriebe
  // ein UPDATE den Filterwert in die Spalte - ein stiller Datenschaden.
  const r = uebersetze('lead_sync_outbox?id=eq.7&status=eq.processing', {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'done', attempts: 3 }),
  });
  assert.equal(r.sql,
    'UPDATE leads.lead_sync_outbox SET status = $3, attempts = $4 '
    + 'WHERE id = $1 AND status = $2');
  assert.deepEqual(r.werte, ['7', 'processing', 'done', 3]);
});

test('das Zielschema ist einstellbar und steckt in jedem Aufruf', () => {
  const r = uebersetze('t?a=eq.1', { method: 'GET' }, 'leads_analytics');
  assert.ok(r.sql.includes('FROM leads_analytics.t'));
});

// --- Ab hier: alles, was LAUT scheitern muss -------------------------------

test('unbekannte Operatoren, Prefer-Angaben und Methoden scheitern laut', () => {
  assert.throws(() => uebersetze('t?a=fuzzy.1', { method: 'GET' }), /Unbekannter Operator/);
  assert.throws(
    () => uebersetze('t', { method: 'POST', headers: { Prefer: 'count=exact' }, body: '{}' }),
    /Unbekannte Prefer-Angabe/
  );
  assert.throws(() => uebersetze('t', { method: 'DELETE' }), /Nicht unterstuetzte Methode/);
});

test('unbekannte is-Formen werden nicht geraten', () => {
  assert.throws(() => uebersetze('t?a=is.true', { method: 'GET' }), /Nicht unterstuetzte is-Form/);
});

test('mehrdeutige Konflikt-Angaben scheitern, statt etwas zu überschreiben', () => {
  assert.throws(
    () => uebersetze('t?on_conflict=id', { method: 'POST', body: '{"id":1}' }),
    /ohne resolution/
  );
  assert.throws(
    () => uebersetze('t', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: '{"id":1}',
    }),
    /ohne on_conflict ist mehrdeutig/
  );
});

test('unzulässige Bezeichner werden abgewiesen', () => {
  assert.throws(() => uebersetze('t?a b=eq.1', { method: 'GET' }), /Unzulaessiger Spaltenname/);
  assert.throws(() => uebersetze('rpc/f;drop', { method: 'POST', body: '{}' }), /Funktionsname/);
  assert.throws(() => uebersetze('t?select=a,b;c', { method: 'GET' }), /Auswahlspalte/);
  assert.throws(() => uebersetze('t?order=a.sideways', { method: 'GET' }), /Sortierrichtung/);
  assert.throws(() => uebersetze('t?a=eq.1&limit=viele', { method: 'GET' }), /Unzulaessiges limit/);
});

test('noch nicht unterstützte Parameter scheitern, statt ignoriert zu werden', () => {
  // Stillschweigend fallengelassenes offset würde die falsche Seite liefern.
  assert.throws(() => uebersetze('t?offset=10', { method: 'GET' }), /offset/);
  assert.throws(() => uebersetze('t?columns=a', { method: 'POST', body: '{"a":1}' }), /columns/);
});
