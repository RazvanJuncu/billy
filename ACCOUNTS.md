# Billy Accounts v0.6 — team identity / setup

## Accounts architecture

Billy follows Numveil's proven pattern: identity first, then one or more organizational workspaces.

- **Identity:** Supabase Auth (email/password, confirmation email, password recovery, logout).
- **Organization:** a signed-in user can create a team; the owner receives the sole initial membership.
- **Joining:** a colleague who signs up may request access using the team UUID. Only the owner can approve the request; the UUID is **not** a password or secret.
- **Roles:** \`owner\`, \`operator\`, \`reviewer\`. All can currently extract and review their own documents. Owner can approve operator membership requests; advanced roles and cross-user document access are future work.
- **Database authorization:** PostgreSQL row-level security policies on profiles, organizations, memberships, requests and future document ledger. No unrestricted \`anon\` reads/writes.
- **Server authorization:** every \`/api/vision/*\` and legacy \`/api/parse\` operation now verifies the session with Supabase Auth and checks active membership via the user-scoped RLS REST API.
- **No cross-user approvals:** extraction IDs are minted on the server and journaled together with \`organization_id\` and \`created_by\`. An approval can only reference an extraction made by the same account in the selected organization.

## One-time admin setup (not per employee)

1. **Completed (2026-11-06):** dedicated Billy project `ookafdnvavohfopxfxpf` in organization Numveil, plan Free, region `eu-west-3`. Project URL: `https://ookafdnvavohfopxfxpf.supabase.co`.
2. In Supabase SQL Editor, execute [migration \`202611061900_billy_accounts.sql\`](supabase/migrations/202611061900_billy_accounts.sql).
3. In Authentication settings, enable email signup and **email confirmation**, configure the application's site URL and permitted redirect URLs for \`https://razvanjuncu.github.io/billy/\` and local development URLs.
4. Set the public values in \`site/account-config.js\`: the Supabase project HTTPS URL and its **publishable** API key. These two values are intended to be public in browser apps; **never publish the service_role/secret key**. \`apiUrl\` is the URL of your **authenticated HTTPS Billy API** when deployed, not the Gemini API URL.
5. On the Billy backend set \`SUPABASE_URL\` and \`SUPABASE_PUBLISHABLE_KEY\` matching the browser project. Keep \`GEMINI_API_KEY\` in server-only secrets. The backend calls the Supabase Auth server to validate the access token on every request.
6. For local testing start the Python API on \`127.0.0.1:8000\` and static site on \`127.0.0.1:5173\` as described in [VISION.md](VISION.md). The browser automatically uses the local API once the user signs in.
7. Create your account in Billy, confirm your email, sign in, and create an organization. Share its displayed team ID with colleagues. They sign up, confirm email, enter the team ID, then await your explicit approval in the Account panel.

**Supabase project and account database are now provisioned.** The signup/login frontend is connected to the public Supabase endpoint. Email confirmation redirects still require dashboard configuration and an end-to-end sign-in test. No Gemini API/backend has been deployed; document processing remains disabled until a separately authenticated HTTPS backend is configured.

## Security limitations — do not use company documents yet

This is an integration **scaffold / developer pilot**, not a production team service. Outstanding:
- A private backend deployed over HTTPS, with gateway protection, rate limits, request-size limits, request timeouts, monitoring, automated migrations and backup strategy
- Production PostgreSQL for extraction/review records, approved immutable audit history and team data, instead of the current **local SQLite pilot journal**
- Fine-grained reviewer/approver privileges and policies for original documents; account access alone does not authorize every document
- Signed-up users' access requests and invitations must be tested end-to-end in a configured Supabase project
- Data processing agreements, encryption, retention/deletion, incident processes and scoped access to confidential invoices, fuel releases and signatures
- Formal test of client/server session renewal and revocation, and working iPhone camera/handwriting scans

**Do not deploy the current API directly to the internet or upload confidential documents to a test instance.** Never put Supabase service role keys or Gemini keys in GitHub, frontend JS or chat.

Supabase references: https://supabase.com/docs/guides/auth , https://supabase.com/docs/guides/database/postgres/row-level-security .
