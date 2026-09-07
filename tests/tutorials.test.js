const { ObjectId } = require("mongodb");
const api = require("./helpers/api");
const db = require("./helpers/db");
const { asAdmin, asModerator, asUser } = require("./helpers/auth");

const SEED_TAG = "[QA Seed]";
const SEED_TAG_PATTERN = SEED_TAG.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("GET /api/tutorials", () => {
  test("rejects a request with no token", async () => {
    const res = await api.get("/tutorials");
    expect(res.status).toBe(403);
  });

  test.each([
    ["user", asUser],
    ["moderator", asModerator],
    ["admin", asAdmin],
  ])("allows an authenticated %s", async (_role, signIn) => {
    const { accessToken } = await signIn();
    const res = await api.get("/tutorials").set("x-access-token", accessToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("filters results by the title query parameter", async () => {
    const { accessToken } = await asUser();
    const res = await api
      .get("/tutorials")
      .query({ title: "Getting Started" })
      .set("x-access-token", accessToken);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((t) => t.title.includes("Getting Started"))).toBe(true);
  });
});

describe("GET /api/tutorials/published", () => {
  test("returns only published tutorials, using the seeded fixtures deterministically", async () => {
    const { accessToken } = await asUser();
    const res = await api.get("/tutorials/published").set("x-access-token", accessToken);

    expect(res.status).toBe(200);
    expect(res.body.every((t) => t.published === true)).toBe(true);

    const seededPublished = res.body.filter((t) => t.title.startsWith(SEED_TAG));
    expect(seededPublished.length).toBe(2); // setup script seeds exactly 2 published tutorials
  });
});

describe("GET /api/tutorials/:id", () => {
  let mongo;
  let seededTutorial;

  beforeAll(async () => {
    mongo = await db.connect();
    seededTutorial = await mongo.collection("tutorials").findOne({ title: { $regex: `^${SEED_TAG_PATTERN}` } });
  });

  afterAll(async () => {
    await db.close();
  });

  test("returns a tutorial that exists", async () => {
    const { accessToken } = await asUser();
    const res = await api.get(`/tutorials/${seededTutorial._id}`).set("x-access-token", accessToken);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe(seededTutorial.title);
  });

  test("returns 404 for a well-formed id that does not exist", async () => {
    const { accessToken } = await asUser();
    const res = await api.get(`/tutorials/${new ObjectId()}`).set("x-access-token", accessToken);
    expect(res.status).toBe(404);
  });

  // findById doesn't validate id format first, so a malformed id throws a
  // CastError that the generic .catch() turns into a 500 (not the main bug).
  test("returns 500 for a malformed id", async () => {
    const { accessToken } = await asUser();
    const res = await api.get("/tutorials/not-a-valid-id").set("x-access-token", accessToken);
    expect(res.status).toBe(500);
  });
});

describe("POST /api/tutorials", () => {
  let mongo;
  const createdIds = [];

  beforeAll(async () => {
    mongo = await db.connect();
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await mongo.collection("tutorials").deleteMany({ _id: { $in: createdIds } });
    }
    await db.close();
  });

  test("rejects a request with no token", async () => {
    const res = await api.post("/tutorials").send({ title: "should not be created" });
    expect(res.status).toBe(403);
  });

  test("rejects a plain user", async () => {
    const { accessToken } = await asUser();
    const res = await api
      .post("/tutorials")
      .set("x-access-token", accessToken)
      .send({ title: "should not be created" });
    expect(res.status).toBe(403);
  });

  test("rejects a missing title", async () => {
    const { accessToken } = await asModerator();
    const res = await api
      .post("/tutorials")
      .set("x-access-token", accessToken)
      .send({ description: "no title provided" });
    expect(res.status).toBe(400);
  });

  test.each([
    ["moderator", asModerator],
    ["admin", asAdmin],
  ])("allows a %s to create a tutorial and persists it to the database", async (role, signIn) => {
    const { accessToken } = await signIn();
    const title = `qa_created_by_${role}_${Date.now()}`;

    const res = await api
      .post("/tutorials")
      .set("x-access-token", accessToken)
      .send({ title, description: "created by integration test", published: true });

    expect(res.status).toBe(200);
    expect(res.body.id).toBeTruthy();
    createdIds.push(new ObjectId(res.body.id));

    const stored = await mongo.collection("tutorials").findOne({ _id: new ObjectId(res.body.id) });
    expect(stored).not.toBeNull();
    expect(stored.title).toBe(title);
    expect(stored.published).toBe(true);
  });
});

describe("PUT /api/tutorials/:id", () => {
  let mongo;
  let targetId;

  beforeEach(async () => {
    mongo = await db.connect();
    const inserted = await mongo.collection("tutorials").insertOne({
      title: "qa_put_target_original",
      description: "original description",
      published: false,
    });
    targetId = inserted.insertedId;
  });

  afterEach(async () => {
    await mongo.collection("tutorials").deleteOne({ _id: targetId });
  });

  afterAll(async () => {
    await db.close();
  });

  test("rejects a request with no token", async () => {
    const res = await api.put(`/tutorials/${targetId}`).send({ title: "hacked" });
    expect(res.status).toBe(403);
  });

  test("rejects a plain user", async () => {
    const { accessToken } = await asUser();
    const res = await api.put(`/tutorials/${targetId}`).set("x-access-token", accessToken).send({ title: "hacked" });
    expect(res.status).toBe(403);
  });

  test("returns 404 for a tutorial that does not exist", async () => {
    const { accessToken } = await asModerator();
    const res = await api
      .put(`/tutorials/${new ObjectId()}`)
      .set("x-access-token", accessToken)
      .send({ title: "does not matter" });
    expect(res.status).toBe(404);
  });

  // Known defect: findByIdAndUpdate(id, undefined, ...) drops req.body, so
  // updates never persist even though the API returns 200. This asserts
  // the documented contract and is expected to FAIL. See the bug report.
  test("persists the updated fields to the database", async () => {
    const { accessToken } = await asModerator();

    const res = await api
      .put(`/tutorials/${targetId}`)
      .set("x-access-token", accessToken)
      .send({ title: "qa_put_target_updated", description: "updated description", published: true });

    expect(res.status).toBe(200);

    const stored = await mongo.collection("tutorials").findOne({ _id: targetId });
    expect(stored.title).toBe("qa_put_target_updated");
    expect(stored.description).toBe("updated description");
    expect(stored.published).toBe(true);
  });
});

describe("DELETE /api/tutorials/:id", () => {
  let mongo;

  beforeAll(async () => {
    mongo = await db.connect();
  });

  afterAll(async () => {
    await db.close();
  });

  test("rejects a request with no token", async () => {
    const inserted = await mongo.collection("tutorials").insertOne({ title: "qa_delete_target_notoken" });
    const res = await api.delete(`/tutorials/${inserted.insertedId}`);
    expect(res.status).toBe(403);
    await mongo.collection("tutorials").deleteOne({ _id: inserted.insertedId });
  });

  test("rejects a plain user", async () => {
    const inserted = await mongo.collection("tutorials").insertOne({ title: "qa_delete_target_user" });
    const { accessToken } = await asUser();
    const res = await api.delete(`/tutorials/${inserted.insertedId}`).set("x-access-token", accessToken);
    expect(res.status).toBe(403);
    await mongo.collection("tutorials").deleteOne({ _id: inserted.insertedId });
  });

  test("rejects a moderator", async () => {
    const inserted = await mongo.collection("tutorials").insertOne({ title: "qa_delete_target_mod" });
    const { accessToken } = await asModerator();
    const res = await api.delete(`/tutorials/${inserted.insertedId}`).set("x-access-token", accessToken);
    expect(res.status).toBe(403);
    await mongo.collection("tutorials").deleteOne({ _id: inserted.insertedId });
  });

  test("returns 404 for a tutorial that does not exist", async () => {
    const { accessToken } = await asAdmin();
    const res = await api.delete(`/tutorials/${new ObjectId()}`).set("x-access-token", accessToken);
    expect(res.status).toBe(404);
  });

  test("allows an admin and removes the document from the database", async () => {
    const inserted = await mongo.collection("tutorials").insertOne({ title: "qa_delete_target_admin" });
    const { accessToken } = await asAdmin();

    const res = await api.delete(`/tutorials/${inserted.insertedId}`).set("x-access-token", accessToken);
    expect(res.status).toBe(200);

    const stored = await mongo.collection("tutorials").findOne({ _id: inserted.insertedId });
    expect(stored).toBeNull();
  });
});

// Declared last: this wipes the whole collection, including fixtures other
// tests in this file rely on. `pretest` re-seeds before every `npm test`,
// so the next run starts clean regardless of what this leaves behind.
describe("DELETE /api/tutorials", () => {
  let mongo;

  beforeAll(async () => {
    mongo = await db.connect();
  });

  afterAll(async () => {
    await db.close();
  });

  test("rejects a request with no token", async () => {
    const res = await api.delete("/tutorials");
    expect(res.status).toBe(403);
  });

  test("rejects a plain user", async () => {
    const { accessToken } = await asUser();
    const res = await api.delete("/tutorials").set("x-access-token", accessToken);
    expect(res.status).toBe(403);
  });

  test("rejects a moderator", async () => {
    const { accessToken } = await asModerator();
    const res = await api.delete("/tutorials").set("x-access-token", accessToken);
    expect(res.status).toBe(403);
  });

  test("allows an admin and empties the collection", async () => {
    const { accessToken } = await asAdmin();
    const res = await api.delete("/tutorials").set("x-access-token", accessToken);

    expect(res.status).toBe(200);

    const remaining = await mongo.collection("tutorials").countDocuments();
    expect(remaining).toBe(0);
  });
});
