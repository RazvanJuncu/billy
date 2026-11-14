# BillyDPI — Financial Integrity 1.0

**Goal:** let an operator see exactly what Billy can and cannot verify, without needing to be an accountant.

This is a **read-only operational check**, not an accounting certification or a statement that every invoice was paid.

## Where to find it

Open **Financial → Insights → Integrity checks**. Use **Recheck** after new approvals or corrections. These checks run against approved records in the authenticated organization's archive; nothing is changed by Recheck.

Status definitions:

- **Checked**: a specific invariant passed on the records currently returned.
- **Review**: data needs operator attention (missing financial fields or unmatched payment evidence).
- **Investigate**: a contradiction was found (wrong total, reused POS, unsupported payment confirmation, or missing audit trail).
- **Incomplete**: the read could not cover all records or required audit evidence.
- **Not tested**: the workflow has not been exercised or is not yet implemented. Do not treat this as a pass.

## What Integrity 1.0 verifies

| Check | Expected | Not claimed |
|---|---|---|
| Duplicate protection | Same approved source expense appears once in the financial ledger | Duplicate detection across different photos |
| Totals & currencies | Independently sum priced, dated approved expenses by currency and compare to the displayed 30-day trend | Inclusion of documents with unknown date/amount/currency |
| Expense / payment separation | Nested proofs, POS slips and fuel releases are not extra expenses | Every business expense is present in the archive |
| Payment link evidence | Each counted link has a genuine approved invoice and POS; amounts/currencies match; confirmed status requires explicit successful POS status | A linked slip marked **unverified** proves a settled payment |
| Operator correction audit | Persisted financial overrides have a matching audit event | Live correction test before any real correction exists |
| Missing evidence | Count missing financial fields and unmatched POS separately | Absence of proof means unpaid |
| Different-photo matching | **Not tested / not implemented** | Automatic linking of independent uploads |
| Partial payment / refund | **Not tested / not implemented** | Split tender, credits, partial settlement or reconciliation |

All currency amounts use minor units (e.g. 367.20 EUR = 36720 cents); never add EUR and RON together. The chart is a **dated 30-day view**, not an all-time or full-company spend balance.

## Current production examples (read-only, 14 Nov 2026)

- **Bacău Handling Invoice:** approved invoice 367.20 EUR; multiple same-source approvals must contribute 367.20 EUR once.
- **Bacău nested POS:** linked at 367.20 EUR, payment result `unverified` unless explicit approved transaction status is independently present.
- **Victor Hotel:** distinct dated 12.00 EUR expense; `no payment proof linked` must **not** be displayed as `unpaid`.
- **Air Culinaire:** 278.93 EUR with no normalized date; appears in Expense Ledger / Attention but not the 30-day graph.
- **FSI Ride Solutions:** financial amount, currency and date require review; cannot be silently totaled.
- **Grilletti:** 25 EUR unmatched payment slip; not a separate expense.
- Expected 30-day EUR graph for the two dated verified expenses: **367.20 + 12.00 = 379.20 EUR**.

These examples describe the observed archive snapshot; new documents or approved corrections may change the results.

## Acceptance protocol

1. **Regression scenarios (automatic)** — GitHub CI runs `tests/financial-integrity.test.cjs` with synthetic documents. This includes duplicate records, cross-currency mismatches, duplicate POS IDs, false payment confirmations, undated invoices, absent currencies and mismatched audit events. These tests never touch live invoices.
2. **Live read-only scan** — Open Financial → Insights → Integrity checks. Review any **Investigate**, **Review**, **Incomplete**, or **Not tested** result. Validate specific data against the original document, not only the extracted text.
3. **Live correction flow (pending manual acceptance)** — Once an operator has independently verified a genuinely missing amount, date or currency, they may use Needs attention → Review → Save. Reopen and refresh, then confirm the value remains changed, a matching audit event exists, original extracted data remains unchanged, and the financial total changes only if the date and amount qualify. **Do not enter guessed values or modify test data in production.**
4. **Remaining work** — Separate-photo matching, split/partial payments, refunds, credits and accounting-system export/reconciliation require future dedicated implementations and independent acceptance tests.

## If the integrity check fails

Do not silently change approved values or mark transactions paid. Open the original invoice / POS via Financial, compare the amount, currency and date, and determine whether this is (a) an OCR/normalization problem, (b) a duplicate source, (c) a mismatched POS/invoice, (d) a genuine financial exception or (e) an incomplete query. If the original does not resolve the ambiguity, leave it for operator review.

**Operational readiness:** Financial is suitable for supervised document organization and preliminary expense tracking. It is **not yet accepted as autonomous bookkeeping, accounts payable, or payment settlement accounting**.
