-- =====================================================================================
-- Lese-View des Quiz auf die Legacy-MySQL (prod_activesupport)
--
-- 🔴 DIESE DATEI TRÄGT IMMER DEN STAND, DER AUF DEM SERVER LAUFEN SOLL.
--    Wer die View ändert, ändert ZUERST hier — dann auf dem Server, dann misst er nach.
--    (Grundsatz übernommen aus Umfragen/sql/views.sql)
--
-- Zweck: ersetzt den Umweg über `db-bridge.php` (Aktion `lookup_subdomain`).
-- Plan:  docs/plans/umsetzung-a-berateridentitaet.md  (Schritt A1)
--
-- ANGELEGT UND NACHGEMESSEN am 31.08.2026:
--   * 255 Zeilen — deckungsgleich mit `select count(*)` auf der Quelle und mit dem
--     Postgres-Spiegel `leads.berater`
--   * `trix24` → organisation_name `EaglesFit`, country `CH`
--     `ingeunterthiner` → `Activecenter`, `IT` — beides zeichengleich mit der Bridge
--
-- WARUM SQL SECURITY DEFINER:
--   Der Benutzer `quiz` bekommt KEIN Recht auf `prod_activesupport.users`. Dort liegen
--   Passwort-Hashes, E-Mail-Adressen und Bankdaten. Die View läuft mit den Rechten ihres
--   Erstellers und gibt genau die Spalten frei, die Funnel und Mail wirklich lesen.
--
-- BEWUSST NICHT ENTHALTEN:
--   * `coach_uuid` — bei Umfragen ein Gutschein-SCHLÜSSEL, keine Kennung. Das Quiz
--     braucht ihn nicht; wer ihn aufnimmt, gibt einen Zugang weiter.
--   * `marketing_status` / `level_*` — kein Leser im Quiz (ausgezählt, §1b des Plans).
--   * Kein Filter auf `o.deleted_at` — die Bridge hat keinen (db-bridge.php:1250-1254).
--     Ein zusätzlicher Filter wäre eine stille Verhaltensänderung.
--
-- ZUGANG FÜR DDL (nicht-interaktiv nur so):
--   ssh root@91.99.76.104 mit ~/.ssh/id_rsa UND der Passphrase aus
--   agent-secrets → cw_forge_server.sshKeyPassphrase (in den ssh-agent laden;
--   BatchMode allein scheitert), dann `mysql --defaults-file=/home/forge/.my.cnf`
-- =====================================================================================

CREATE DATABASE IF NOT EXISTS `prod_quiz`;

CREATE OR REPLACE
  ALGORITHM = UNDEFINED
  DEFINER = `dbmasteruser`@`%`
  SQL SECURITY DEFINER
VIEW `prod_quiz`.`quiz_berater` AS
SELECT
    LOWER(`u`.`sub_domain`)                                AS `slug`,
    `u`.`id`                                               AS `user_id`,
    `u`.`first_name`                                       AS `first_name`,
    `u`.`last_name`                                        AS `last_name`,
    `u`.`full_name`                                        AS `full_name`,
    `u`.`email`                                            AS `email`,
    `u`.`herbalife_id`                                     AS `herbalife_id`,
    `u`.`preferred_newsletter_language`                    AS `preferred_newsletter_language`,
    `o`.`org_name`                                         AS `organisation_name`,
    `u`.`organization_id`                                  AS `organisation_id`,
    -- 🔴 org_name, NICHT o.name: Die Bridge liest org_name (db-bridge.php:1237).
    --    Der n8n-Spiegel las bis 31.08. faelschlich o.name und lieferte dadurch
    --    "EaglesFit-Support" statt "EaglesFit" — sichtbar als Markenname in jeder Mail.
    `u`.`country`                                          AS `country`,
    -- Rohteile der Adresse und der Telefonnummer. Zusammengesetzt wird im Aufloeser,
    -- nicht hier: berechnete Strings in Views tragen die Collation ihres Ausdrucks.
    `u`.`street_number`                                    AS `street`,
    `u`.`postal_code`                                      AS `postal`,
    `u`.`place`                                            AS `place`,
    `u`.`area_code`                                        AS `area_code`,
    `u`.`phone_number`                                     AS `phone_number`,
    -- 🔴 Das Telefon traegt den WhatsApp-Link in der Zugangsmail. Der Postgres-Spiegel
    --    `leads.berater` fuehrt es NICHT — deshalb darf die Mailstrecke nicht auf den
    --    Spiegel zurueckfallen (Entscheidung Markus 31.08.: lieber wiederholen).
    `u`.`image`                                            AS `image`,
    JSON_UNQUOTE(JSON_EXTRACT(`u`.`meta`, '$.avatars[1]')) AS `avatar_150`,
    JSON_UNQUOTE(JSON_EXTRACT(`u`.`meta`, '$.avatars[2]')) AS `avatar_300`,
    JSON_UNQUOTE(JSON_EXTRACT(`u`.`meta`, '$.avatars[3]')) AS `avatar_600`,
    `u`.`instagram`                                        AS `instagram`,
    `u`.`facebook`                                         AS `facebook`
FROM `prod_activesupport`.`users` `u`
LEFT JOIN `prod_activesupport`.`organizations` `o`
       ON `o`.`id` = `u`.`organization_id`
WHERE `u`.`deleted_at` IS NULL
  AND `u`.`is_active` = 1
  AND `u`.`sub_domain` IS NOT NULL
  AND `u`.`sub_domain` <> '';

-- =====================================================================================
-- Benutzer und Rechte. Das Passwort steht NICHT in dieser Datei, sondern in
-- agent-secrets → `quiz_legacy_mysql.dbPassword` (angelegt 31.08.2026).
--
--   CREATE USER 'quiz'@'10.0.1.5' IDENTIFIED BY '<aus agent-secrets>';
--   GRANT SELECT ON `prod_quiz`.`quiz_berater` TO 'quiz'@'10.0.1.5';
--
-- Host-gebunden auf 10.0.1.5 (der Coolify-App-Host), NICHT '%'.
-- Nachgemessen am 31.08.2026 — `SHOW GRANTS` liefert exakt zwei Zeilen:
--   GRANT USAGE ON *.* TO `quiz`@`10.0.1.5`
--   GRANT SELECT ON `prod_quiz`.`quiz_berater` TO `quiz`@`10.0.1.5`
--
-- AUSDRÜCKLICH NICHT ERTEILT:
--   * kein Recht auf `prod_activesupport.*`
--   * kein UPDATE auf `prod_contacts_activesupport.typeform_surveys` — der
--     Rangschreibweg bleibt bewusst bei n8n (Workflow 7Xg6NsE5H3UWgSNc)
--   * kein CREATE / DROP / DELETE irgendwo
--
-- RÜCKWEG (vollständig, ohne Nebenwirkung auf Bestehendes):
--   DROP USER 'quiz'@'10.0.1.5';
--   DROP VIEW `prod_quiz`.`quiz_berater`;
--   DROP DATABASE `prod_quiz`;
-- =====================================================================================
