# Void-RPC-Abriss: Teilverluste bei Quiz-Antworten — Vorfall, Heilung, Wächter W5

Stand: 27.08.2026 · Zeiten in MESZ · Fix deployt, Heilung verifiziert, Wächter live

## 1. Der Vorfall in einem Satz

Der am 26.08. gebaute Opt-in-Persistenzpfad (PR #86) riss bei **jedem** Opt-in nach der
**ersten** Antwort ab — ein leerer HTTP-Body einer void-RPC wurde als JSON geparst — und
hinterliess Leads, die vollständig aussahen (Kontakt, Profil, Ziel, Barriere), aber nur
1 von 6 Antwortzeilen trugen.

## 2. Fehlerbild und Spur

Ein Agent auf hl-support Analytics meldete 7 × `SyntaxError: Unexpected end of JSON input`
(26.08. 18:27 bis 27.08. 07:32), Route `forward_typeform_adapter/persistQuizAnswers`,
Spur `bridge.js supabaseRpc → persistQuizAnswers → persistBusinessSubmissionToLeadStateV2`.
Die 7 Fehler waren exakt die 7 Opt-ins seit dem Deploy von PR #86 — deterministisch, einer
je Opt-in. Dass der Fehler überhaupt sichtbar wurde, ist der Meldepflicht aus PR #86 zu
verdanken („ein Fehler hier darf das Opt-in nie scheitern lassen — aber er darf auch nicht
stumm bleiben").

## 3. Ursache

`upsert_answer_current` ist `RETURNS void` (`supabase-lead-system-v2.sql`). PostgREST
antwortet darauf mit **leerem Body** — der Schreibvorgang ist zu diesem Zeitpunkt bereits
verbucht. Die Bridge hielt eine **eigene Kopie** von `supabaseRpc`, die bedingungslos
`response.json()` aufrief; die Fassung in `server/lead-system.js` hatte den 204-Guard von
Anfang an (deshalb war der `lead-track`-Pfad nie betroffen). Der erste Wurf beendete die
Antwort-Schleife: Antwort 1 verbucht, Antworten 2–6 nie gesendet.

**Grundproblem dahinter: duplizierte Supabase-Helfer.** `api/bridge.js` definiert
`supabaseRequest`/`supabaseJson`/`supabaseRpc` lokal, obwohl `server/lead-system.js`
dieselben Helfer exportiert (lead-track.js importiert sie von dort). Kopien driften.

## 4. Schaden, gemessen (rein lesend, Produktion)

- 12 Opt-ins im Fehlerfenster: **11** hatten trotzdem alle 6 Antworten — der parallele
  Browser-Ereignisstrom rettete sie. **1** realer Teilverlust (`qz_786f83eeb…`, 27.08.
  06:16): dort fiel zusätzlich der Ereignisstrom aus — exakt das Szenario, für das der
  Opt-in-Pfad als Rettungsnetz gebaut war.
- Die anschliessende Breitenmessung (1221 Opt-ins) fand **39** Leads mit <6 Antwortzeilen.
  Nach Abzug von `merged_duplicate`/`migrated` und bekannten Baseline-Fällen blieben
  **5 weitere, bis dahin unsichtbare Teilverluste aus Mai–August** (Ereignisstrom-Ära):
  Weder der Backfill (füllte nur bei 0 Zeilen) noch Wächter W3 (misst nur Ziel/
  Absendezeit) konnten diese Klasse sehen.

## 5. Fix und Heilung

| Massnahme | Beleg |
| --- | --- |
| **Guard in `supabaseRpc`** (bridge.js): 204/leerer Body → `null` statt Parse; 4 Regressionstests halten bridge und lead-system deckungsgleich | PR #91, deployt 27.08. 09:42 (Commit `38f76d0`, dreifach über `/health/live` verifiziert) |
| **Backfill erkennt Teilverluste**: Kandidat ist jeder Lead mit <6 Refs; geschrieben werden nur **fehlende** Refs, nur wenn MySQL den vollen 6er-Satz trägt | derselbe PR; Grundsatz „nur Lücken füllen" bleibt |
| **6 Leads geheilt** (der void-RPC-Fall + 5 Alt-Teilverluste), je Lead einzeln verifiziert: voller Satz, Original-Zeitstempel, vorhandene Zeilen unangetastet | Trockenlauf → Anwenden → Nachkontrolle, 27.08. vormittags |
| **Wächter W5**: jedes Opt-in muss 6 Antwortzeilen tragen; Baseline-Kategorie `antworten_unvollstaendig` (12 gemessen unheilbare Altfälle, je Hash begründet); 1–2 neue Fälle WARNUNG, **ab 3 ALARM** | PR #92; Serverkopie auf `167.233.251.217` aktualisiert, Livelauf Exit 0 |

Nicht heilbar (Baseline): Fälle ohne vollen Satz im MySQL-JSON (Fire-and-forget-Ära),
interne Proben, der Tierprofil-Nebeneingang und ein Test-Opt-in vom 27.08. 09:39 aus dem
Bug-Fenster (Test-Adressen schliesst der Backfill bewusst aus).

## 6. Lehren

1. **Duplizierte Infrastruktur-Helfer driften.** Der 204-Guard existierte im Projekt —
   nur nicht in der Kopie, die der kritische Pfad benutzte. Bis zur Konsolidierung gilt:
   Wer Supabase-Zugriffe ändert, prüft **beide** Fassungen (bridge.js und
   server/lead-system.js).
2. **„Sieht vollständig aus" ist kein Zustand, sondern eine Behauptung.** Teilzustände
   (1–5 von 6 Zeilen) brauchen eine eigene Prüfung — Vollständigkeits-Checks, die nur
   „ganz oder gar nicht" kennen, übersehen genau die gefährliche Mitte. Drei Monate lang.
3. **Redundanz verdeckt Fehler.** Der Ereignisstrom rettete 11 von 12 Leads — dadurch sah
   der kaputte Rettungspfad in jeder Stichprobe „bewiesen" aus (auch im Abnahmetest vom
   26.08. abends). Der Beweis eines Pfads muss den Pfad isoliert messen.
4. **PostgREST-Eigenheit festhalten:** void-RPCs antworten mit leerem Body **nach**
   erfolgreicher Verbuchung. Jeder RPC-Aufrufer braucht den Leere-Antwort-Guard.

## 7. Bezug zur Hetzner-Migration (Phase 4)

Der Vorfall bestätigt das Zielbild aus der
[Antwortverlust-Analyse](2026-08-26-antwortverlust-analyse-und-zielbild.md) §5 wörtlich:
**ein Aufruf, eine Transaktion, kein PostgREST im kritischen Pfad.** Die Fehlerklasse
(leerer Body als Protokoll-Eigenheit) verschwindet mit dem direkten Treiber vollständig.
Konkrete Migrationspunkte aus diesem Vorfall:

- Supabase-Helfer konsolidieren (eine Fassung in `server/lead-system.js`, Bridge
  importiert) — spätestens beim Umbau auf den direkten Treiber.
- W5 nach der Migration auf die neue Datenquelle umziehen (heute Management-API-SQL).
- Der Abnahmetest je Datenpfad muss den Pfad **isoliert** beweisen (Ereignisstrom aus,
  nur Opt-in-Paket — und umgekehrt).
