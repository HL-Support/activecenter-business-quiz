# Mautic Setup - Business Leads Quiz

This file defines the Mautic objects required before the n8n post-processor is activated.

## Goal

- Coach email is sent directly from n8n/Postmark.
- Lead email sequence starts in Mautic.
- Mautic stores stable lead metadata for filtering, support, and later automations.

## Required Contact Fields

Create these contact custom fields in Mautic.

| Label | Alias | Type | Notes |
|------|-------|------|------|
| AC Member ID | `ac_member_id` | text | Internal member owner from `contacts.member_id` |
| AC Coach User ID | `ac_coach_user_id` | text | Final coach user id from `users.id` |
| AC Coach Herbalife ID | `ac_coach_herbalife_id` | text | For coach-based segmentation |
| AC Contact ID | `ac_contact_id` | text | Internal contacts table id |
| AC Last Typeform Survey ID | `ac_last_typeform_survey_id` | text | Final survey row id |
| AC Last Form ID | `ac_last_form_id` | text | Initially `hC2yTcU8` |
| AC Last Lead Hash | `ac_last_lead_hash` | text | Public-safe lead lookup identifier |
| AC Last Session Hash | `ac_last_session_hash` | text | Tracking/session identifier |
| AC Last Funnel | `ac_last_funnel` | text | Initially `business_leads_quiz` |
| AC Last Profile | `ac_last_profile` | text | Slug, e.g. `macher` |
| AC Last Profile Label | `ac_last_profile_label` | text | Human-readable profile label |
| AC Last Main Goal | `ac_last_main_goal` | text | Slug, e.g. `freiheit` |
| AC Last Main Goal Label | `ac_last_main_goal_label` | text | Human-readable goal label |
| AC Last Form Language | `ac_last_form_language` | text | `de`, `it`, `en` |
| AC Last Form Submitted At | `ac_last_form_submitted_at` | datetime | Timestamp of final survey submission |
| AC Last Video Access URL | `ac_last_video_access_url` | url | Final individualized video access link |

## Required Tags

These tags should be applied by n8n:

```text
ac:funnel:business-leads-quiz
ac:form:hC2yTcU8
ac:profile:<profile_slug>
ac:goal:<main_aspiration_slug>
ac:coach:<herbalife_id>
ac:lang:<de|it|en>
ac:source:typeform-survey
```

Optional operational tags:

```text
ac:email0:queued
ac:email0:sent
ac:needs-review
```

## Required Segment

Create:

```text
Name: AC - Business Leads Quiz - New
Alias: ac-business-leads-quiz-new
```

Recommended filters:

- `tag` contains `ac:funnel:business-leads-quiz`
- `tag` contains `ac:form:hC2yTcU8`

Do not filter by `email0:queued` in the first version unless you also build tag cleanup logic.

## Recommended Additional Segments

Optional but useful later:

```text
AC - Business Leads Quiz - DE
AC - Business Leads Quiz - IT
AC - Business Leads Quiz - EN
AC - Business Leads Quiz - Needs Review
```

## Required Campaign

Create:

```text
Name: AC - Business Leads Quiz - Email 0
```

Entry source:

- contacts entering segment `AC - Business Leads Quiz - New`

### Email 0 Goal

- Confirm the lead has been received
- Send the personalized video access link again
- Set expectation that a coach may contact them

### Email 0 Minimum Dynamic Fields

- `{contactfield=firstname}`
- `{contactfield=ac_last_profile_label}`
- `{contactfield=ac_last_main_goal_label}`
- `{contactfield=ac_last_video_access_url}`

### Email 0 Suggested Structure

Subject:

```text
Dein Zugang ist bereit
```

Body blocks:

1. Short confirmation
2. Personalized context:
   - profile label
   - main goal label
3. CTA button to `{contactfield=ac_last_video_access_url}`
4. Short expectation:
   - assigned coach may contact them

## API Expectations For n8n

n8n should be able to:

1. Search contact by email
2. Create contact if missing
3. Update contact if existing
4. Apply tags
5. Add contact to segment `ac-business-leads-quiz-new`

## Safe Activation Order

1. Create all custom fields
2. Create segment
3. Create campaign
4. Attach campaign to segment entry
5. Test with one real lead after activation time
6. Confirm:
   - contact fields populated
   - tags applied
   - segment membership present
   - email 0 sent once

