# Reflection

## What would be improved in a production-grade test suite

CI/CD is the main one. It wasn't added here (see the discussion in
`NOTES.md`'s spirit: the assignment's own guidelines frame execution as
local Docker, and CI isn't in the submission checklist), but for a real
production system it would be essential: a pipeline that clones the app,
brings it up, seeds it, and runs the suite on every push is the clearest
way to verify that "reproducible from a clean environment" still holds,
instead of just trusting that it did the one time someone ran it by hand.

Test parallelization would also matter more at scale. Tests here run with
`--runInBand` because they share one MongoDB instance; a larger suite
would want isolated databases per worker so tests could run in parallel
without one test's writes affecting another's reads.

## Limitations in the current approach

The tests are coupled to MongoDB's internal shape, not just the API
contract. `tests/*.js` query `db.collection("tutorials")`,
`db.collection("users")`, and `db.collection("refreshtokens")` directly to
verify state and to backdate a refresh token's expiry. If the application
ever changed its collection names or schema internally while keeping the
same HTTP contract, these tests would break for reasons unrelated to the
actual API behavior. A production suite would probably wrap this in a
thin repository layer so schema changes only need one update, not one per
test file.

The 60-second access token lifetime shaped several design decisions: no
shared tokens across test suites, and no reusing a token from setup once
tests are actually running. Those workarounds are specific to this app's
deliberately short test configuration, and wouldn't be necessary against
a JWT with a typical lifetime.

## Risks or edge cases not covered, and why

`GET /api/tutorials` is documented as returning results "with pagination
support," but the controller doesn't implement any pagination parameters,
it only supports a `title` filter. There's nothing to test here since the
feature doesn't exist; it's left as a documentation inconsistency rather
than a bug, since no client-facing behavior is actually broken.

Load and concurrency testing (many simultaneous requests hitting the same
document) and security-focused testing (injection attempts, brute-forcing
login, JWT algorithm/signature tampering beyond a plain invalid token)
aren't covered. Both are real risks for a production auth system, but
they need different tooling than a functional integration suite (load
testing tools, dedicated security scanners) and were out of scope for the
time available here.
