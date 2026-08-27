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

## Recommendation
Hold 48 hours for identity verification against the
cross-agency match. It maximizes net value ($93.52)
at the lowest citizen-delay cost, protecting program integrity without an
unnecessary investigation referral.

## Action taken
Recorded to `app.case_actions` (id `5a1a8185-9dce-4c57-b64b-99abd8af0c66`),
status **approved**, approver **scott.johnson@databricks.com**. Awaiting
fulfillment by the verification team.
