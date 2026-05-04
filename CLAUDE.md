# CLAUDE.md — Rig Ledger Project Instructions

This file defines how Claude should behave when working on the Rig Ledger codebase.
Read this before touching any file.

---

## Who this project is for

Rig Ledger is a SaaS fleet management platform built for owner-operators and small trucking
fleets (1–50 trucks). Users are truck drivers and fleet owners — not developers. The software
handles real financial data, maintenance records, and business-critical operations. Mistakes
have real consequences for real people's livelihoods.

---

## The three non-negotiables

Every single change made to this codebase must be evaluated against these three priorities,
in this order:

### 1. Security — always first, never compromised
This app handles JWT tokens, financial data, user credentials, and business records.
A security mistake is not a bug — it is a liability. Treat it accordingly.

### 2. Performance — fast for people on phones at truck stops
Users are often on slow mobile connections in rural areas. Every API response,
every database query, every rendered component must be as lean as possible.

### 3. Maintainability — this codebase must be readable six months from now
Write code as if the next person reading it has never seen this project before.
That person might be you.

---

## Explanation requirement — mandatory for every change

For **every** code change, Claude must provide a plain-English explanation block
**before** showing any code. No exceptions.

Use this exact format:

```
WHAT:    One sentence describing what this change does.
WHY:     One sentence explaining the business or technical reason it exists.
HOW:     2–4 sentences walking through the mechanism — how the code actually works.
RISK:    Any edge cases, failure modes, or security considerations to be aware of.
```

If a change touches multiple files or systems, write one block per logical unit of change.

Example:

```
WHAT:    Adds JWT expiry validation to the auth middleware.
WHY:     Expired tokens were being accepted silently, allowing stale sessions to persist indefinitely.
HOW:     The middleware now extracts the `exp` claim from the token payload and compares it against
         the current Unix timestamp before passing the request to the handler. If expired, it returns
         a 401 with a specific error code the frontend can handle gracefully.
RISK:    Clock skew between servers could cause false rejections. A 30-second grace window is applied.
         Ensure server time is synced via NTP.
```

---

## Security rules — hard requirements

### Authentication & authorization
- All routes except `/register` and `/login` must be behind the JWT middleware. No exceptions.
- Never log JWT tokens, passwords, or any credential — not even in debug mode.
- Passwords must be hashed with bcrypt at a minimum cost factor of 12.
- JWT secrets must come from environment variables. Never hardcode them.
- Implement and document the token expiry strategy for every new auth-related change.
- Use short-lived access tokens (15–60 min) and refresh token rotation for any session extension.

### Input validation & sanitization
- Validate and sanitize **all** user input on the server side, even if the frontend already validates.
  The frontend is not a security boundary.
- Use allowlists not denylists when validating field values.
- Never trust user-supplied IDs to scope data access — always verify the requesting user owns
  the resource being accessed. An owner should never be able to touch another owner's trucks.
- Reject unexpected fields in request bodies (strict schema validation).

### Database
- Use parameterized queries or the ORM's query builder exclusively. No string-concatenated queries.
- Never return raw MongoDB documents to the client — always project only the fields the client needs.
- Index fields that are queried frequently (truck ID, user ID, date ranges).
- Never expose internal IDs, internal error messages, or stack traces to the API response.

### API design
- Return generic error messages to the client. Log the detailed error server-side.
- Rate-limit all auth endpoints (login, register, password reset).
- Use HTTPS only. Reject HTTP in production.
- Set security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`.
- Validate `Content-Type` on all POST/PUT/PATCH requests.

### File uploads (AI receipt scanner)
- Validate MIME type server-side — never trust the file extension or the `Content-Type` header alone.
- Enforce maximum file size limits before processing.
- Never store uploaded files in a publicly accessible path.
- Scan for malicious content before passing to the AI pipeline.
- Store files in object storage (S3/R2), not on the application server's filesystem.

### Environment & secrets
- All secrets (DB URI, JWT secret, Stripe keys, AI API keys) live in `.env` files.
- `.env` is always in `.gitignore`. Never commit secrets.
- Use separate secrets for development, staging, and production.
- If a secret is ever accidentally committed, treat it as compromised immediately — rotate it.

---

## Performance rules

### Backend (Go / Gin)
- Add database indexes before writing any query that filters or sorts by a field.
- Use `context` with timeouts on all database operations — never let a query hang indefinitely.
- Return paginated results for any list endpoint. Default page size: 25. Max: 100.
- Use `select` projections on MongoDB queries — never fetch a full document when you only need 3 fields.
- Avoid N+1 query patterns. If a handler is making a query inside a loop, stop and redesign it.
- Use connection pooling — never open a new DB connection per request.

### Frontend (React / TypeScript)
- Lazy-load routes. Don't ship the entire app bundle on first load.
- Debounce any input that triggers a network request.
- Cache API responses where data doesn't change frequently (maintenance intervals, truck list).
- Avoid unnecessary re-renders. Use `useMemo` and `useCallback` where renders are expensive.
- Images and file previews must be compressed before display.
- Target Lighthouse performance score of 90+ on mobile.

### API responses
- Compress all responses with gzip.
- Set `Cache-Control` headers appropriately for static and semi-static resources.
- Keep response payloads lean — don't send fields the client doesn't use.

---

## Code style & conventions

### General
- Explicit over implicit. If something is not obvious, it needs a comment.
- Short functions. If a function is longer than 40 lines, it is probably doing too much.
- No magic numbers or magic strings — use named constants.
- Error handling is not optional. Every error must be either handled or explicitly propagated.
- Delete dead code — don't comment it out and leave it.
- **DRY — Don't Repeat Yourself.** If a function already does what is needed, reuse it.
  Do not write a parallel implementation, do not copy-paste, do not add a near-duplicate
  helper "just for this file." Before writing a new function, search the codebase for an
  existing one that solves the same problem. If the existing function is close but not
  exact, extend or generalize it instead of cloning. Duplication is a maintenance liability:
  every fix has to be applied N times, and one copy will inevitably drift.

### Go (backend)
- Follow standard Go project layout: `cmd/`, `internal/`, `pkg/`.
- Exported functions must have GoDoc comments.
- Use `errors.Is` and `errors.As` for error type checking — not string comparison.
- Return errors up the call stack, handle them at the boundary (handler level).
- Middleware must be stateless.
- Group related handlers into files by domain: `truck_handlers.go`, `expense_handlers.go`, etc.

### TypeScript / React (frontend)
- No `any` types. If you don't know the type, figure it out — don't suppress the type system.
- Define interfaces or types for every API response shape in a shared `types/` directory.
- API calls live in a `services/` directory — never inline `axios` calls in components.
- Components do one thing. If a component file exceeds 150 lines, split it.
- Use named exports, not default exports, for everything except route-level page components.
- UI casing convention:
    * **Title Case** for buttons, tab labels, headings, table headers, section titles,
      stat labels, field labels, modal titles, navbar items.
    * **Sentence case** for descriptive prose (paragraphs, hero subtitles, empty-state
      messages, error/alert text, tooltips longer than 2 words).
    * **No ALL CAPS** anywhere in the UI.
    * Acronyms (`VIN`, `JWT`, `API`, `MPG`, `CSV`, `URL`, `ID`) stay uppercase even
      mid-sentence.

---

## File & folder conventions

```
Server/
  cmd/              # entrypoints
  internal/
    auth/           # JWT logic, middleware
    handlers/       # HTTP handlers, grouped by domain
    models/         # MongoDB document structs
    services/       # business logic layer
    validators/     # input validation logic
  config/           # env loading, app config struct

Client/
  src/
    components/     # shared reusable components
    pages/          # route-level page components
    services/       # API call functions
    types/          # TypeScript interfaces and types
    hooks/          # custom React hooks
    utils/          # pure utility functions
```

---

## What Claude must never do

- Never delete or overwrite existing code without showing the diff and explaining why.
- Never introduce a new dependency without listing: what it does, why an existing tool can't
  handle it, and whether it is actively maintained.
- Never expose a new API endpoint without documenting its auth requirement, input shape,
  and response shape in the same change.
- Never store sensitive data (tokens, passwords, financial data) in browser localStorage.
  Use httpOnly cookies or in-memory state.
- Never skip the WHAT/WHY/HOW/RISK explanation block — even for "small" changes.
  Small changes are where security holes are introduced.
- Never assume a bug is fixed without explaining why the fix prevents the root cause,
  not just the symptom.

---

## When something is ambiguous

If a requirement is unclear, stop and ask. Do not guess and implement. A wrong assumption
in a financial or auth system is worse than a delayed feature. State the ambiguity explicitly:

```
AMBIGUITY: [describe what is unclear]
OPTION A:  [first interpretation and its tradeoffs]
OPTION B:  [second interpretation and its tradeoffs]
QUESTION:  [the specific decision needed before proceeding]
```

---

## Reminder on who is using this

An owner-operator running 3 trucks is not a tech-savvy user. They are working 14-hour days,
managing fuel costs, dealing with breakdowns, and trying to keep their business alive.
Every second of confusion in this UI costs them real money and real stress.

Build accordingly.

---

## RESUME NOTES — 2026-04-26 (mid-session handoff)

A code review was run against this file. Findings: 16 critical security + 12 high
perf/maint issues. Top 3 dispatched to parallel agents. State on pause:

### Top 3 priority list (from review)

1. **Tokens in localStorage + JSON body** — DONE.
   - Backend `userController.go` Login + RefreshAccessToken: return `{logged_in: true}`
     only. Tokens are cookie-only. Refresh token read EXCLUSIVELY from httpOnly cookie
     (body path removed from `RefreshAccessToken`).
   - `Server/utils/cookieUtil.go`: httpOnly + Secure + `SameSite=None` + **Partitioned**
     (CHIPS) in production. Cookie names + TTLs centralized as constants.
   - Frontend `Client/src/api/client.ts`: rewritten — no localStorage reads, single-
     flight `refreshPromise`, `onAuthFailure` listener bridge for mid-session 401.
   - Frontend `Client/src/api/auth.ts`: `LoginResponse = {logged_in: boolean}`. No
     localStorage writes anywhere.
   - Frontend `Client/src/auth/AuthProvider.tsx`: context FSM `loading|authed|anon`,
     boots via `/auth/refresh` then `/user/profile`. Always probes `/refresh` on mount
     (handles iOS PWA cookie drops, mobile webviews).
   - Frontend `Client/src/types/user.ts`: `AuthUser` + `AuthStatus`.
   - Frontend `App.tsx` `PrivateRoute`: consumes `useAuth`, spinner on `loading`,
     redirect on `anon`.
   - Frontend `pages/{Home,Dashboard,Fleet,Expenses,TruckDetail}.tsx`: migrated off
     `localStorage('logged_in')` → `useAuth()`. `Login.tsx` already wired to
     `useAuth().login`.
   - **Mobile strategy in code**: CHIPS Partitioned cookies for cross-site (iOS Safari
     ITP) + boot-time `/refresh` probe (PWA / webview cookie loss). Same-site deploy
     (`app.rigledger.com` SPA + `api.rigledger.com` API) is the recommended topology
     and Partitioned is harmless there.
   - Verification: `tsc --noEmit` clean, `go build ./...` clean, `go vet ./...` clean,
     `grep localStorage` clean of auth keys (only `ff-theme` remains in `useTheme`).

2. **`UpdateUserProfile` mass-assignment** — DONE.
   - Allowlisted FirstName/LastName via `UserProfileUpdate` DTO (pointer fields).
   - `json.NewDecoder + DisallowUnknownFields` rejects unknown keys with 400.
   - Explicit `$set` doc built from non-nil pointers + `updated_at`.
   - `truckController.go` `UpdateTruck`: strips `_id`, forces `user_id = JWT subject`.
   - TODO markers left for email + password change flows (require verification +
     re-auth respectively).

3. **JWT alg-confusion + bcrypt arg rename** — DONE.
   - `validateToken`: HMAC type assertion in keyfunc + `jwt.WithValidMethods(["HS256"])`
     parser option. Belt + suspenders.
   - `VerifyPassword(hashedPassword, plaintextPassword)` — renamed, internal swap
     removed.
   - `HashPassword` returns `(string, error)`; `Register` propagates as 500.
   - `bcryptCost = 14` extracted to constant.
   - `Login` call site updated to new arg order.

### Verified post-merge

Both build + vet pass. Login call site confirmed correct: `VerifyPassword(
foundUser.Password, loginDetails.Password)` (hash first, plaintext second). No merge
race fallout from parallel agent edits.

### Round 2 — DONE this session (review items #4, #7, #9, #10, #11, #12, #13, #14, #16, #17, #18, #28)

Three parallel agents dispatched. Items completed:

- **#4** `models.User` — `Password` + `RefreshToken` tagged `json:"-"`. New
  `RegisterRequest` DTO carries inbound `password` for binding. `UserLogin` got
  `validate:"required,email"` + `validate:"required"` tags; Login now runs
  `userValidator.Struct` after bind.
- **#7** Bearer prefix — `strings.EqualFold` + `bearerPrefix` const, bounds-safe
  slice in `authMiddleware.go`.
- **#9** Server hardening — new `Server/middleware/securityHeaders.go` with
  `SecurityHeaders()` (X-Content-Type-Options, X-Frame-Options, Referrer-Policy
  always; HSTS in release only) and `RequireHTTPS()` (release-mode
  X-Forwarded-Proto check, `/healthz` exempt). New `Server/middleware/rateLimit.go`
  using `github.com/ulule/limiter/v3 v3.11.2` — 10 req/min/IP on auth routes,
  configurable via `AUTH_RATE_LIMIT_PER_MIN`. Wired in `unprotectedRoutes.go`.
- **#10** Refresh-token write failures — new `persistRefreshToken` helper logs +
  degrades gracefully instead of swallowing. Applied in Login, RefreshAccessToken,
  Logout.
- **#11** Cross-tenant ownership — `CreateExpense` parses `truck_id` as ObjectID,
  calls `assertTruckOwned`, collapses miss + foreign into single 404 (no existence
  oracle).
- **#12** Pagination — `GetExpenses` + `GetUserTrucks` paged via shared
  `parsePagination` helper. Default 25, max 100. `X-Total-Count` / `X-Page` /
  `X-Page-Size` headers via `writePaginationHeaders`.
- **#13** `GetUserProfile` projection — `userProfileProjection` decode struct,
  bcrypt hash never leaves Mongo.
- **#14** Validator leakage — new `Server/controllers/errors.go` `badRequest(c, err, msg)`
  helper. Every `err.Error()` site in controllers replaced. `grep err.Error()
  Server/controllers/` clean.
- **#16** CORS — release mode `log.Fatal` on missing `ALLOWED_ORIGIN`. Dev
  default `http://localhost:5173`. `*` rejected.
- **#17** MongoDB indexes — `ensureIndexes` runs at startup. Created:
  `uniq_email` (unique), `user_id_id`, `user_id_date_desc`, `user_id_truck_id`.
  Tolerates codes 85/86 (existing-conflict), fatal on real errors.
- **#18** DB timeouts — new `Server/controllers/ctx.go` `dbCtx` (5s soft cap,
  derived from `c.Request.Context()`). Applied to every DB-touching handler in
  user/truck/expense controllers. `grep "c.Request.Context()" controllers/*.go`
  clean.
- **#28** Startup error — `fmt.Println` swapped for `log.Fatalf` in `main.go`.

Verification: `go build ./... && go vet ./...` clean.

### Round 3 — DONE this session (review items #15, #19, #21, #22, #23, #25)

- **#15** `truckValidator.RegisterValidation` — captures err, panics on misregistration.
- **#19** Lazy-load routes — `React.lazy` + `<Suspense>` in `App.tsx` for Login,
  Dashboard, Fleet, Expenses, TruckDetail. Home stays eager (landing page LCP).
  Vite chunks went from 3 → 10.
- **#21** ALL CAPS sweep — Title Case for buttons/headings/labels, sentence case
  for prose. CLAUDE.md UI rule revised to match this convention. Fleet.tsx +
  every component touched. Zero residual `>[A-Z]{4+}<` in JSX.
- **#22** `Fleet.tsx` useCallback wrap on `fetchTrucks`, useEffect deps fixed.
- **#23** `userController.go` split — `auth_handlers.go` (281 lines) +
  `user_handlers.go` (195 lines). Old file deleted. `userValidator` shared at
  package scope, documented.
- **#25** Password `min=6` → `min=12` on `User.Password` + `RegisterRequest.Password`.
  Existing hashes unaffected (bcrypt opaque). Login does not re-check length, so
  current users with shorter passwords keep working.

### Suggested resume order

1. Manual smoke test: register → login → refresh → CRUD trucks/expenses → logout.
   Confirm cookies set/cleared, paged responses carry headers, rate limiter kicks
   in after 10 rapid logins. **DONE locally** (2026-04-26).
2. Deploy topology — DEFERRED. Currently cross-site (`*.onrender.com` is on
   Public Suffix List = each subdomain is own eTLD+1). User plans to buy
   `rigledger.com` and migrate to same-site (`app.` + `api.` subdomains) which
   eliminates the cross-site cookie complexity. Until then code already supports
   cross-site via Partitioned cookies + AllowCredentials + explicit AllowOrigins.
   Revisit on domain purchase.
3. Sweep remaining items (15, 19, 21, 22, 23, 25). All low-risk. Could bundle
   into a single "frontend polish + backend cleanup" PR.

### Render deploy quirks (2026-04-26)

Live URLs:
- Backend:  https://rig-ledgerapi.onrender.com  (no hyphen between "ledger" + "api")
- Frontend: https://rig-ledger.onrender.com

`render.yaml` `VITE_API_URL` was wrong for months (with-hyphen variant pointed to
nothing). Fixed in this session.

**Render free tier reality** (0.5 CPU, cold Atlas connection):
- bcrypt cost 14 ≈ 1.5–2s per hash
- Cold Mongo Atlas open: SRV → TLS → auth ≈ 3–5s on first request after idle
- Any handler doing bcrypt + a Mongo op needs **≥10s** total budget; 5s starves
  legit requests on cold start

`dbTimeout` raised from 5s → 10s in `Server/controllers/ctx.go`. Tighten when
either: (a) deploy moves off free tier, (b) startup pre-warms the Mongo pool.

**Trusted proxies must include IPv6 ranges.** Render's internal proxy hop appears
as `::1`. Without `::1/128` (and ULA `fc00::/7`, link-local `fe80::/10`) in the
trust list, `c.ClientIP()` returns `::1` for every request and the auth-route
rate limiter buckets globally instead of per-client. Fixed in `Server/main.go`.

**Register 500 root cause** (the original symptom): `dbTimeout=5s` was eaten by
cold Atlas connect on the dup-check FindOne, returning `context.DeadlineExceeded`,
which Register mapped to a generic 500 with no diagnostic log. Fixed by:
1. Adding `log.Printf` to every Register 500 path so the underlying error
   surfaces in Render logs (was previously invisible).
2. Raising `dbTimeout` to 10s.

Lesson: **always wrap controller 500 returns with `log.Printf` of the underlying
error** — generic client message is correct, but server-side silence on a 500
makes prod debugging blind.
