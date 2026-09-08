# Notes: Tools, Frameworks, and Design Decisions

## Tools and frameworks

The test setup script (Task 2) is plain Node.js, using the `mongodb`
driver for direct database access and Node 18's built-in `fetch` for HTTP
calls. It's an idempotent script, not a test suite, so no test framework
was justified there.

The integration and end-to-end tests (Tasks 3 and 4) use Jest and
Supertest. Full reasoning is in the README's "Run the integration tests"
section; the short version is that the target role explicitly lists Jest
experience as a requirement, and Supertest is its standard pairing for
Express API testing.

Database verification uses the same `mongodb` driver throughout, so every
write is checked against the actual document in MongoDB, not just the
HTTP response.

## Design decisions

The setup script verifies that the `user`/`moderator`/`admin` roles
exist, it doesn't create them. The application seeds them on first boot,
so recreating them here would just duplicate that logic (see
`scripts/setup-test-env.js`).

The setup script doesn't hand out reusable tokens either. Access tokens
expire in 60 seconds, so a token generated during setup would likely be
stale by the time tests run. Each test suite signs in for itself instead.

Tests run with `--runInBand`. Several suites write to the same MongoDB
instance, and running them in Jest's default parallel workers would let
one test's writes, especially the "delete all tutorials" test, interfere
with another's reads.

`npm test` re-seeds automatically via a `pretest` hook. `DELETE
/api/tutorials` genuinely empties the collection as part of testing it,
so the next run needs a fresh baseline regardless of what a previous run
left behind.

The known PUT defect is proven once, in `tests/tutorials.test.js`, which
has the isolated, deterministic proof (and is expected to fail).
`tests/e2e/moderator-content-lifecycle.test.js` doesn't re-prove it; it
shows the same defect's effect inside a realistic multi-step workflow,
which is what Task 4 asks for.

## Additional findings

Found while writing tests, not the subject of the formal bug report, but
worth recording:

`GET /api/test/mod` doesn't match its own documentation. The route only
applies the `isModerator` middleware (`app/routes/user.routes.js`), so a
pure-admin account (no `moderator` role) gets `403`, even though the
application's README documents this endpoint as open to "moderator or
admin". Covered by `tests/rbac.test.js`.

Invalid tokens trigger a server-side error despite a clean client
response. `authJwt.js`'s `catchError` calls `res.sendStatus(401).send(...)`,
which double-sends. The client still gets a clean `401`, but the app
container logs an `ERR_HTTP_HEADERS_SENT`. Confirmed via `docker compose
logs app`; see the comment above the relevant test in `tests/rbac.test.js`.

A malformed tutorial id returns `500`, not `400`. `GET
/api/tutorials/:id` doesn't validate the id format before calling
`findById`, so a non-ObjectId string throws a Mongoose `CastError` that
the generic `.catch()` turns into a `500`. Covered by
`tests/tutorials.test.js`.

`POST /api/auth/signup` returns `200`, not the documented `201`.
`POST /api/auth/refreshtoken` returns `403` for a refresh token that
isn't in the database, not the documented `404`. Both are minor
status-code mismatches against the application's own README, observed
while writing `tests/auth.test.js`.
