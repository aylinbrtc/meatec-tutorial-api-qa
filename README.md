# Tutorial API QA Suite

Automated testing layer for the JWT & RBAC-based Tutorials REST API. The
application source lives in its own repository and isn't included here.

## Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose v2 (`docker compose`,
  not the legacy `docker-compose`)
- Node.js `18.x` (an `.nvmrc` is provided, run `nvm use` if you use nvm)

## 1. Start the application under test

The application repository is separate from this one and ships its own
`docker-compose.yml`. Clone it next to this repository and start it:

```bash
git clone https://github.com/attarchi-meatec/jwt-refresh-token-node-js-mongodb.git
cd jwt-refresh-token-node-js-mongodb
docker compose up --build -d
```

This starts two containers:

- `mongo`: MongoDB 7, with a healthcheck that gates the app container
- `app`: the Node.js/Express API, published on `http://localhost:8080`

Wait for both containers to report healthy/running:

```bash
docker compose ps
```

Confirm the API is reachable:

```bash
curl http://localhost:8080/api/test/all
# -> "Public Content."
```

To reset the application to a completely clean state (fresh MongoDB volume):

```bash
docker compose down -v
docker compose up --build -d
```

## 2. Set up this repository

```bash
npm install
cp .env.example .env
```

`.env` points the test suite at the application's HTTP API and directly at
its MongoDB instance:

| Variable | Purpose |
|---|---|
| `API_BASE_URL` | Base URL of the running application (`http://localhost:8080/api`) |
| `MONGO_URI` | Direct MongoDB connection, used to assert actual DB state after write operations |
| `TEST_ADMIN_USERNAME` / `TEST_ADMIN_PASSWORD` | Seeded admin test account |
| `TEST_MODERATOR_USERNAME` / `TEST_MODERATOR_PASSWORD` | Seeded moderator test account |
| `TEST_USER_USERNAME` / `TEST_USER_PASSWORD` | Seeded regular-user test account |

Adjust `API_BASE_URL` / `MONGO_URI` if the application is not running on the
default ports.

## 3. Prepare test data

Once both services are up, seed the baseline test data:

```bash
npm run setup
```

This script (`scripts/setup-test-env.js`):

- creates the three test users from `.env` (`TEST_ADMIN_*`, `TEST_MODERATOR_*`,
  `TEST_USER_*`) through the real signup endpoint, so roles and password
  hashing go through the application's own logic
- verifies each user can sign in
- replaces a small set of tagged tutorials (`[QA Seed] ...`) with fresh,
  known content, so read tests have deterministic fixtures to assert against

It's safe to run more than once: existing test users are left alone, and
only the tagged tutorials are reset each time.

Two design decisions worth noting:

- The script checks that the `user`/`moderator`/`admin` roles exist rather
  than creating them, since the application already seeds these on first
  boot and recreating them here would just duplicate that logic.
- Access tokens expire in 60 seconds (see the application's
  `auth.config.js`), so the script only confirms sign-in works; it doesn't
  hand out a token for tests to reuse. Each test suite is expected to sign
  in for itself.

## 4. Run the integration tests

```bash
npm test
```

This runs `npm run setup` first (via a `pretest` hook), then the Jest suite,
so every run starts from the same known baseline regardless of what a
previous run left behind.

Tooling: Jest and Supertest, on top of the `mongodb` driver already used by
the setup script. The assignment leaves tool choice open; Jest needs no
extra configuration for a plain CommonJS project, and Supertest keeps HTTP
assertions (`.expect(200)`) readable. Tests run with `--runInBand`
(sequentially) rather than Jest's default parallel workers, because several
suites write to the same MongoDB instance and would otherwise interfere
with each other, for example one test wiping tutorials while another reads
them.

Coverage:

- `tests/auth.test.js`: signup, signin, and refresh token, including the
  default-role signup path and an expired-refresh-token case (the token's
  expiry is backdated directly in MongoDB rather than waiting out the real
  120s TTL)
- `tests/rbac.test.js`: the `/api/test/*` board endpoints, across all three
  roles plus unauthenticated and invalid-token requests
- `tests/tutorials.test.js`: full tutorials CRUD, RBAC per operation, and
  MongoDB state verification for every write

Every write is checked against MongoDB directly, not just its HTTP
response. Read tests assert against the tagged fixtures the setup script
creates, so results are deterministic.

Two tests are expected to fail, on purpose:

- `PUT /api/tutorials/:id › persists the updated fields to the database`:
  reproduces a real defect (see the bug report). The endpoint returns 200
  but never writes the update to MongoDB.
- `GET /api/test/mod › allows an admin, per the documented contract`: the
  route only checks for the `moderator` role, not `moderator` or `admin`
  as documented, so a pure-admin account is rejected.

Both assert the documented/expected behavior rather than the application's
current behavior, so the failure itself is the evidence.

## End-to-end scenarios

Beyond per-endpoint checks, `tests/e2e/` contains two multi-step workflows
that mirror the case study's own examples, run by the same `npm test`
command:

- `moderator-content-lifecycle.test.js`: registration, sign-in, create a
  tutorial, retrieve it, attempt an update, retrieve it again. The last
  step shows the real-world consequence of the known PUT defect inside a
  realistic user journey, rather than re-proving the defect itself (that's
  `tests/tutorials.test.js`'s job).
- `role-based-resource-actions.test.js`: a single tutorial's full lifecycle
  across three roles. Admin creates it, moderator and a plain user can both
  read it, the plain user's and moderator's delete attempts are rejected,
  only the admin can actually delete it, and it's confirmed gone (404) for
  every role afterward.

Each scenario validates state transitions between steps, not just each
call's own response, and cleans up whatever it created.

## Issues encountered

Setup worked on the first try, including a full reset
(`docker compose down -v` followed by `up --build`). The Mongo healthcheck
gates the app container correctly, so there was nothing to work around.

## Repository structure

```
qa-suite/
├── .env.example              # Template for local environment configuration
├── .nvmrc                     # Pinned Node.js version
├── package.json
├── package-lock.json
├── scripts/
│   └── setup-test-env.js      # Test data setup script (Task 2)
├── tests/
│   ├── helpers/
│   │   ├── api.js                          # Supertest client bound to API_BASE_URL
│   │   ├── auth.js                         # Per-suite sign-in helpers
│   │   └── db.js                            # Shared MongoDB connection
│   ├── e2e/
│   │   ├── moderator-content-lifecycle.test.js
│   │   └── role-based-resource-actions.test.js
│   ├── auth.test.js
│   ├── rbac.test.js
│   └── tutorials.test.js
└── README.md                                # This file
```
