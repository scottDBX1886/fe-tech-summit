# Case Memo — PAY-0000214

**Disposition (recommended): HOLD FOR VERIFICATION — 48 hours**

## Payment
- **Payment ID:** PAY-0000214
- **Program:** Child Care · **State:** UT
- **Amount:** $1850.00
- **Risk level:** high · **Signals (2):** ["cross_agency_fraud_flag","duplicate_identity"]
- **Improper-payment exposure:** $1480.00

## Why flagged
Payment matched a cross-agency fraud feed (`cross_agency_fraud_flag`) and a
duplicate-identity check (`duplicate_identity`). Both are pre-disbursement
integrity signals; combined on a high-value Child Care payment they warrant a
verification hold before funds release.

## Ranked dispositions (ML model · confidence 99%)
| Rank | Disposition | Hold (h) | Pred. recovery | Delay cost | Net value |
|------|-------------|----------|----------------|------------|-----------|
| 1 | hold_for_verification **(rec)** | 48 | $177.51 | $46.25 | $93.52 |
| 2 | release | 0 | $0.00 | $0.00 | $0.00 |
| 3 | refer_to_investigation | 0 | $231.89 | $194.25 | $-11.67 |

## Governing policy (retrieved from the Build-1 Lakebase Search index)
_Source: `public.reference_playbooks` (Postgres full-text search over `search_vector`) — not a separate vector store._
### Duplicate Identity Detection Protocol (duplicate_identity)
- **Guidance:** A duplicate identity flag means the beneficiary's identifying information (SSN, name+DOB combination) matches another active beneficiary in the same or different program. This may indicate identity theft, data entry errors, or intentional multi-enrollment fraud.
- **Verification steps:** 1. Compare full identity records (name, DOB, SSN, address) between matched profiles. 2. Check enrollment dates for temporal overlap. 3. Review payment history for both profiles. 4. Flag for investigation if both profiles received concurrent payments.
- **Regulatory citation:** IPERA 2010, 42 USC §1320a-7a

### Cross-Agency Fraud Match Response (cross_agency_fraud_flag)
- **Guidance:** When a cross-agency fraud match is detected, the payment involves identity or eligibility data that conflicts with records from another federal agency (SSA, IRS, DHS). This is a strong signal indicating potential identity theft or multi-program fraud.
- **Verification steps:** 1. Verify beneficiary SSN against SSA death master file. 2. Cross-reference with IRS income records. 3. Check DHS immigration status if applicable. 4. Request identity verification documents from beneficiary within 10 business days.
- **Regulatory citation:** 31 USC §3321, OMB Circular A-123 Appendix C

### Residence Verification Protocol (residence_mismatch)
- **Guidance:** The beneficiary's address on file does not match USPS records, utility databases, or conflicts with another beneficiary's address in a way that suggests household composition fraud.
- **Verification steps:** 1. Verify current address against USPS NCOA database. 2. Check utility records for occupancy. 3. If address matches another beneficiary, verify household composition. 4. Send residence verification form to beneficiary.
- **Regulatory citation:** SNAP 7 CFR §273.2(f)

## Recommendation
Hold 48 hours for identity verification against the
cross-agency match, following the verification steps above (Duplicate Identity Detection Protocol, IPERA 2010, 42 USC §1320a-7a).
It maximizes net value ($93.52) at the lowest
citizen-delay cost, protecting program integrity without an unnecessary
investigation referral.

## Action taken
Recorded to `app.case_actions` (id `5a1a8185-9dce-4c57-b64b-99abd8af0c66`),
status **approved**, approver **scott.johnson@databricks.com**. Awaiting
fulfillment by the verification team.
