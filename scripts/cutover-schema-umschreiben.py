#!/usr/bin/env python3
"""Schreibt die Schemanamen in einem pg_dump --data-only auf die Zielschemata um.

Warum nicht `sed s/public\\./leads./`: In einem COPY-Block ist JEDE Zeile eine
Datenzeile. Ein Textfeld, das zufaellig mit "COPY public." beginnt, wuerde von einer
blinden Ersetzung veraendert - ein stiller Datenschaden, der erst Monate spaeter
auffaellt. Dieses Skript verfolgt deshalb den COPY-Zustand und fasst Daten NIE an.

pg_dump --data-only erzeugt genau zwei Formen mit Schemanamen:
    COPY public.lead_state (spalte, ...) FROM stdin;
    SELECT pg_catalog.setval('public.quiz_sessions_id_seq', 1750, true);
Ein COPY-Block endet mit einer Zeile, die nur "\\." enthaelt.

Alles, was NICHT sicher zugeordnet werden kann, laesst das Skript unveraendert und
meldet es am Ende als Rest - stille Annahmen gibt es hier nicht.

  python3 cutover-schema-umschreiben.py <ein.sql> <aus.sql>
  Exitcode 0 = umgeschrieben, 1 = verdaechtige Reste gefunden (nicht verwenden!)
"""
import re
import sys

ABBILDUNG = {"public": "leads", "analytics_internal": "leads_analytics"}

COPY_ANFANG = re.compile(r"^COPY (public|analytics_internal)\.([A-Za-z0-9_]+) ")
SETVAL = re.compile(r"^SELECT pg_catalog\.setval\('(public|analytics_internal)\.")
# Nur ausserhalb von COPY-Bloecken relevant: eine Restzeile, die noch ein Quellschema
# traegt, waere ein nicht abgedecktes Muster.
REST = re.compile(r"\b(public|analytics_internal)\.")


def main() -> int:
    ein, aus = sys.argv[1], sys.argv[2]
    in_copy = False
    umgeschrieben = {"copy": 0, "setval": 0}
    reste = []
    zeilen_gesamt = 0
    daten_zeilen = 0

    with open(ein, "r", encoding="utf-8", newline="") as f_in, \
         open(aus, "w", encoding="utf-8", newline="") as f_out:
        for nr, zeile in enumerate(f_in, 1):
            zeilen_gesamt += 1

            if in_copy:
                # Innerhalb eines COPY-Blocks wird NICHTS veraendert. Der Block endet
                # mit einer Zeile, die ausschliesslich aus "\." besteht.
                if zeile.rstrip("\r\n") == "\\.":
                    in_copy = False
                else:
                    daten_zeilen += 1
                f_out.write(zeile)
                continue

            m = COPY_ANFANG.match(zeile)
            if m:
                quelle = m.group(1)
                zeile = zeile.replace(f"COPY {quelle}.", f"COPY {ABBILDUNG[quelle]}.", 1)
                umgeschrieben["copy"] += 1
                in_copy = True
                f_out.write(zeile)
                continue

            if SETVAL.match(zeile):
                for quelle, ziel in ABBILDUNG.items():
                    zeile = zeile.replace(f"setval('{quelle}.", f"setval('{ziel}.", 1)
                umgeschrieben["setval"] += 1
                f_out.write(zeile)
                continue

            # Ausserhalb von COPY und ohne bekanntes Muster: Traegt die Zeile trotzdem
            # ein Quellschema, ist sie ein unbekannter Fall - melden, nicht raten.
            if REST.search(zeile) and not zeile.lstrip().startswith("--"):
                reste.append((nr, zeile.rstrip()[:160]))
            f_out.write(zeile)

    if in_copy:
        print("FEHLER: Datei endet mitten in einem COPY-Block - Dump unvollstaendig?",
              file=sys.stderr)
        return 1

    print(f"Zeilen gesamt      : {zeilen_gesamt}")
    print(f"davon COPY-Daten   : {daten_zeilen} (unveraendert durchgereicht)")
    print(f"COPY-Kopfzeilen    : {umgeschrieben['copy']} umgeschrieben")
    print(f"setval-Aufrufe     : {umgeschrieben['setval']} umgeschrieben")

    if reste:
        print(f"\n🔴 {len(reste)} Zeile(n) tragen noch ein Quellschema und wurden NICHT "
              f"zugeordnet:", file=sys.stderr)
        for nr, text in reste[:20]:
            print(f"   Zeile {nr}: {text}", file=sys.stderr)
        print("\nNICHT einspielen, bevor das geklaert ist.", file=sys.stderr)
        return 1

    print("\nKeine Reste - alle Schemaverweise zugeordnet.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
