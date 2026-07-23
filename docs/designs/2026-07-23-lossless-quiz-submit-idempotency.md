# Lossless quiz-submit idempotency

## Goal

Prevent one opt-in action from creating multiple lead runs when the submit handler is
triggered more than once before its first request finishes. Legitimate later quiz
submissions must remain possible, and no existing lead data is deleted or merged.

## Design

The opt-in component acquires a synchronous `useRef` lock before analytics, Mautic,
or the Typeform adapter are called. React state continues to disable the button and
show the loading state, but is not used as the concurrency lock because state updates
only take effect after a render.

`forwardQuizSubmission` also keeps one module-level in-flight promise. Concurrent
callers receive that same promise instead of starting another lead run. This protects
the canonical submission function even if it is called from another UI path.

Both locks are released after a failed attempt. After success the component moves to
the next step, while the central in-flight promise is cleared once it settles. A later
intentional quiz run therefore still creates a new submission.

## Data safety

- No database rows are deleted, merged, or rewritten.
- No email-wide or contact-wide suppression is introduced.
- The existing lead hash and stable form token remain the retry identity.
- A failed request can be retried by the user.
- Existing duplicate records remain available for audit.

## Verification

Contract tests assert that the synchronous component lock is acquired before any
network work and that the canonical submission function reuses one in-flight promise.
The normal test, build, and verification suites must remain green.
