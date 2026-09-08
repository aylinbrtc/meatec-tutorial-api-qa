const { ObjectId } = require("mongodb");
const api = require("../helpers/api");
const db = require("../helpers/db");

describe("E2E: moderator content lifecycle", () => {
  let mongo;
  const username = `qa_e2e_moderator_${Date.now()}`;
  const password = "Password123!";
  let accessToken;
  let tutorialId;

  beforeAll(async () => {
    mongo = await db.connect();
  });

  afterAll(async () => {
    if (tutorialId) {
      await mongo.collection("tutorials").deleteOne({ _id: tutorialId });
    }
    await mongo.collection("users").deleteOne({ username });
    await db.close();
  });

  test("registers a new moderator account", async () => {
    const res = await api.post("/auth/signup").send({
      username,
      email: `${username}@qa.local`,
      password,
      roles: ["moderator"],
    });

    expect(res.status).toBeLessThan(300);

    const stored = await mongo.collection("users").findOne({ username });
    expect(stored).not.toBeNull();
  });

  test("signs in and receives an access token", async () => {
    const res = await api.post("/auth/signin").send({ username, password });

    expect(res.status).toBe(200);
    expect(res.body.roles).toContain("ROLE_MODERATOR");
    accessToken = res.body.accessToken;
  });

  test("creates a tutorial", async () => {
    const res = await api
      .post("/tutorials")
      .set("x-access-token", accessToken)
      .send({ title: "qa_e2e_original_title", description: "original description", published: false });

    expect(res.status).toBe(200);
    expect(res.body.id).toBeTruthy();
    tutorialId = new ObjectId(res.body.id);

    const stored = await mongo.collection("tutorials").findOne({ _id: tutorialId });
    expect(stored.title).toBe("qa_e2e_original_title");
  });

  test("retrieves the tutorial it just created", async () => {
    const res = await api.get(`/tutorials/${tutorialId}`).set("x-access-token", accessToken);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("qa_e2e_original_title");
  });

  test("attempts to fix the content via update", async () => {
    const res = await api
      .put(`/tutorials/${tutorialId}`)
      .set("x-access-token", accessToken)
      .send({ title: "qa_e2e_corrected_title", description: "corrected description", published: true });

    expect(res.status).toBe(200);
  });

  // Known defect (see bug report): update silently doesn't persist. This
  // documents the real-world impact; the isolated proof is in tutorials.test.js.
  test("still shows the original, unedited content on the next read", async () => {
    const res = await api.get(`/tutorials/${tutorialId}`).set("x-access-token", accessToken);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("qa_e2e_original_title");
    expect(res.body.published).toBe(false);
  });
});
