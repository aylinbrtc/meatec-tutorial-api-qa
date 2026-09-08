# Bug Report: `PUT /api/tutorials/:id` does not persist updates

## Summary

`PUT /api/tutorials/:id` responds with `200 OK` and a success message, but
the tutorial document in MongoDB is never actually modified. The client has
no way to tell the update silently failed.

## Environment

- Application: `jwt-refresh-token-node-js-mongodb`, run via its own
  `docker-compose.yml` (see this repository's README for setup)
- Endpoint: `PUT /api/tutorials/:id`
- Required role: moderator or admin (`isModeratorOrAdmin`)

## Steps to reproduce

1. Sign in as a moderator or admin to get an access token.
2. Create a tutorial with `POST /api/tutorials`.
3. Update it with `PUT /api/tutorials/:id`, sending a different `title`,
   `description`, and `published` value.
4. Fetch it again with `GET /api/tutorials/:id`.

Automated, repeatable reproduction:

- `tests/tutorials.test.js` → `PUT /api/tutorials/:id › persists the
  updated fields to the database` (isolated proof, asserts the documented
  contract, currently fails)
- `tests/e2e/moderator-content-lifecycle.test.js` → shows the same defect
  inside a realistic multi-step workflow (register, sign in, create,
  retrieve, attempt an update, retrieve again)

Run with `npm test` after `npm run setup` (see this repository's README).

## Expected behavior

Per the application's own README (`PUT /api/tutorials/:id` section): the
tutorial is updated with the new title, description, or published status,
and the response includes an updated `updatedAt` timestamp.

## Actual behavior

The request succeeds (`200`, `{"message":"Tutorial was updated
successfully."}`), but the stored document is completely unchanged,
`updatedAt` included, meaning no write ever reached the database.

## Captured request/response evidence

#### Create
```
POST /api/tutorials
{"title":"Original Title","description":"Original description","published":false}

200
{"title":"Original Title","description":"Original description","published":false,"createdAt":"2026-09-08T08:24:13.077Z","updatedAt":"2026-09-08T08:24:13.077Z","id":"6a9fc62d82899b05f4544a64"}
```

#### Update
```
PUT /api/tutorials/6a9fc62d82899b05f4544a64
{"title":"Corrected Title","description":"Corrected description","published":true}

200
{"message":"Tutorial was updated successfully."}
```

#### Read back
```
GET /api/tutorials/6a9fc62d82899b05f4544a64

200
{"title":"Original Title","description":"Original description","published":false,"createdAt":"2026-09-08T08:24:13.077Z","updatedAt":"2026-09-08T08:24:13.077Z","id":"6a9fc62d82899b05f4544a64"}
```

`title`, `description`, `published`, and even `updatedAt` are identical to
the create response. `updatedAt` not changing at all confirms no write of
any kind reached the document, not even a no-op `$set`.

#### Direct MongoDB state

`db.tutorials.findOne(...)` confirms the same:
```js
{
  _id: ObjectId('6a9fc62d82899b05f4544a64'),
  title: 'Original Title',
  description: 'Original description',
  published: false,
  createdAt: ISODate('2026-09-08T08:24:13.077Z'),
  updatedAt: ISODate('2026-09-08T08:24:13.077Z'),
  __v: 0
}
```

## Root cause

`app/controllers/tutorial.controller.js`, `update()`:

```js
Tutorial.findByIdAndUpdate(id, undefined, { useFindAndModify: false })
```

The second argument to `findByIdAndUpdate` is the update payload. It's
hardcoded to `undefined` instead of `req.body`, so Mongoose has nothing to
apply. The call still resolves successfully (it finds the document and
"updates" it with nothing), which is why the endpoint reports `200`
instead of failing.

## Severity

High. This is a silent data-integrity bug on a core write endpoint: the
API actively confirms success to the caller while doing nothing. A crash
or an error response would at least be visible; this fails invisibly.

## Suggested fix

Pass the request body through:

```js
Tutorial.findByIdAndUpdate(id, req.body, { useFindAndModify: false, new: true })
```

(`new: true` is also worth adding so the response reflects the updated
document rather than needing a separate read.) Not applied here, since
`app-under-test` is treated as read-only for this assignment.
