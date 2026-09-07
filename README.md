# Tutorial API QA Suite

Automated testing layer for the JWT & RBAC-based Tutorials REST API. This
repository contains the test setup script, integration tests, end-to-end
scenarios, and supporting documentation. The application source lives in
its own repository and isn't included here.

## Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose v2 (`docker compose`,
  not the legacy `docker-compose`)
- Node.js `18.x` (an `.nvmrc` is provided — run `nvm use` if you use nvm)

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

## Issues encountered

Setup worked on the first try, including a full reset
(`docker compose down -v` followed by `up --build`). The Mongo healthcheck
gates the app container correctly, so there was nothing to work around.

## Repository structure

```
qa-suite/
├── .env.example      # Template for local environment configuration
├── .nvmrc             # Pinned Node.js version
├── package.json
└── README.md          # This file
```
