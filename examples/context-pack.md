# Verified facts for committee seats (example)

The skeptic-committee workflow tells every seat to read this file first, so seats stop spending
their budget rediscovering the same schema and vocabulary. Every line says when it was checked and
how. Add a fact only after checking it, and date it. Delete a fact the moment it stops being true.

Pass it as `context_pack` only when the artifact is about the system it describes.

## The orders table

- (2026-01-15, SQL) The table is `analytics.orders`. `analytics.orders_legacy` has been frozen
  since 2025-11-01 and is not the source of truth.
- (2026-01-15, SQL) Zero rows have a null `created_at`.
- (2026-01-15, code `orders/status.py:12`) `status` takes exactly four values: `pending`, `paid`,
  `refunded`, `cancelled`. Anything else is a bug upstream.
- (2026-01-15, SQL) A refunded order keeps its original `paid_at`. Counting paid orders by
  `paid_at IS NOT NULL` therefore includes refunds.

## Known traps

- (2026-01-15, code `jobs/nightly.py:40`) The nightly job runs at 02:00 UTC, so "today" in the
  dashboard is yesterday in US time zones.
