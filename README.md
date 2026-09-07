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

## Issues encountered

Setup worked on the first try, including a full reset
(`docker compose down -v` followed by `up --build`). The Mongo healthcheck
gates the app container correctly, so there was nothing to work around.

## Repository structure

```
qa-suite/
├── .env.example           # Template for local environment configuration
├── .nvmrc                  # Pinned Node.js version
├── package.json
├── package-lock.json
├── scripts/
│   └── setup-test-env.js   # Test data setup script (Task 2)
└── README.md               # This file
```
