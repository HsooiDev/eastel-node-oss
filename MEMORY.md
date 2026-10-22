# Security and maintenance notes

The application serves https://eastel.site. These notes describe source-level
constraints; they contain no live environment inventory or credentials.

## Mailbox ownership and payable voucher reservations — 2026-10-22

- Lock/recheck/consume guest mailbox proofs in the account-binding transaction.
  An unverified existing password is untrusted: rotate it and revoke customer
  sessions, serialized with password-bound session creation. Do not only verify.
- A failed payment attempt does not cancel its bill. Keep vouchers reserved
  while the discounted bill remains payable.
- OTP CAPTCHA tokens cannot authorize checkout too. Refresh after issuance;
  logged-in verification must use verify-email to update account server state.
- Imported login_attempts may lack success. Use common columns for OTP budgets;
  do not put anonymous recipient keys in the shared authentication limiter.

## Other invariants

- A provider-paid response and a failed local save are not a completed order.
  Reread saved state and preserve reconciliation paths; do not send duplicate notices.
- Preserve callback URLs and existing bill compatibility. A failed attempt does not
  prove that the original bill cannot still be paid.
- CAPTCHA verification, account ownership and session validation precede protected
  mutations. Never log proof tokens, passwords or service credentials.
- Runtime media belongs outside releases and public source control. Validate paths,
  permissions and backups through a separately authorized operational process.
- Template secret fields stay empty. Test credentials and identities are synthetic
  and must not be reused outside an isolated test database.

Historical verification remains subject to [MIGRATION_STATUS.md](MIGRATION_STATUS.md).
This cleanup did not rerun the earlier security/release suites.
