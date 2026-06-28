# Content Model

This is the Phase 0 target contract. Phase 3 migrations are authoritative once implemented. All
primary keys use stable, non-secret IDs. Timestamps are UTC ISO 8601 values at API boundaries.
Public queries return only records in a published state and within any active date window.

## Shared rules

- `status`: `draft`, `scheduled`, `published`, or `archived` where publishing applies.
- `version`: monotonically increasing integer used for optimistic concurrency.
- `created_at`, `updated_at`: database-managed timestamps.
- `created_by`, `updated_by`: authenticated Access subject or internal system actor.
- User-authored text is validated, length-limited, stored as source text, and escaped for its output
  context.
- Deletion of published content is archival unless a retention policy requires erasure.

## Treatments

| Field                             | Type/constraint            | Purpose                               |
| --------------------------------- | -------------------------- | ------------------------------------- |
| `id`                              | text primary key           | Stable internal identity              |
| `slug`                            | unique lowercase slug      | Canonical route/key                   |
| `name`                            | non-empty text             | Approved public name                  |
| `category`                        | controlled text            | Public grouping                       |
| `summary`, `description`          | text                       | Approved crawlable copy               |
| `suitability_note`                | text nullable              | Non-diagnostic suitability wording    |
| `preparation`, `aftercare`        | text nullable              | Approved guidance                     |
| `duration_text`                   | text nullable              | Display value, reconciled with Square |
| `image_id`                        | media foreign key nullable | Approved public image                 |
| `square_catalog_object_id`        | text nullable              | Read-only reconciliation reference    |
| `status`, `sort_order`, `version` | constrained                | Publishing and ordering               |

## Prices

`price_groups` contains `id`, `treatment_id`, `title`, `eyebrow`, `from_price_text`, `status`,
`sort_order`, and `version`. `price_items` contains `id`, `price_group_id`, `name`, `amount_text`,
`sessions`, `instalment_note`, `square_catalog_object_id`, and `sort_order`.

Display amounts remain text because approved wording can include “from” or consultation language.
Reconciliation must compare the linked Square item and report differences; it must not silently
alter Square or public values.

## Offers

`offers` contains `id`, `slug`, `title`, `treatment_id`, `badge`, `summary`, `price_text`, `terms`,
`starts_at`, `ends_at`, `image_id`, `cta_label`, `cta_url`, `status`, `sort_order`, and `version`.
Publication requires approved terms and dates. Expired offers are excluded automatically.

## Reviews

| Field group       | Fields                                                          | Rule                                             |
| ----------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| Source            | `source`, `source_review_id`, `source_url`                      | Stable provenance; source ID unique per provider |
| Immutable content | `rating`, `reviewer_name`, `review_text`, `reviewed_at`         | Imported text is never rewritten                 |
| Moderation        | `moderation_status`, `featured`, `moderated_by`, `moderated_at` | Separate from source content                     |
| Synchronisation   | `fetched_at`, `expires_at`, `sync_run_id`                       | Supports provider retention policy               |

Direct/legacy testimonials require retained source evidence before publication. Moderation controls
visibility, not sentiment or wording.

## Site settings

`site_settings` uses a unique `key`, validated JSON `value`, `version`, and audit fields. Initial
namespaces are contact details, opening hours, social URLs, SEO defaults, cookie-policy version, and
provider status. Secret values and provider tokens are prohibited.

## Media

`media` contains generated object key, original filename for audit only, MIME type, byte size,
width, height, checksum, alt text, source, consent reference, usage status, publication status, and
audit fields. R2 objects are private by default. Identifiable client/result media cannot be
published without a recorded consent reference.

## Versions and audit

`content_versions` stores entity type/ID, version number, immutable validated snapshot, actor,
action, and timestamp. `admin_audit_log` stores actor, request ID, action, entity reference,
before/after hashes or approved snapshots, and timestamp. Audit rows are append-only.

## Consent events

`consent_events` records a pseudonymous/session reference where appropriate, categories or channel,
exact wording/policy version, source, decision, timestamp, and withdrawal relationship. It does not
store health/treatment details. Retention and deletion rules require owner/legal approval before
production use.

## Integration state

Provider connection and sync tables may store non-secret account/location identifiers, cursor, last
success/failure, retry state, and idempotency keys. Access tokens, refresh tokens, client secrets,
API keys, passwords, and card data must never be stored in these content tables.
