const { ObjectId } = require("mongodb");
const api = require("../helpers/api");
const db = require("../helpers/db");
const { asAdmin, asModerator, asUser } = require("../helpers/auth");

describe("E2E: role-based actions across a shared resource's lifecycle", () => {
  let mongo;
  let tutorialId;
  let adminToken;
  let moderatorToken;
  let userToken;

  beforeAll(async () => {
    mongo = await db.connect();
    ({ accessToken: adminToken } = await asAdmin());
    ({ accessToken: moderatorToken } = await asModerator());
    ({ accessToken: userToken } = await asUser());
  });

  afterAll(async () => {
    if (tutorialId) {
      await mongo.collection("tutorials").deleteOne({ _id: tutorialId });
    }
    await db.close();
  });

  test("admin creates a tutorial", async () => {
    const res = await api
      .post("/tutorials")
      .set("x-access-token", adminToken)
      .send({ title: "qa_e2e_shared_resource", description: "created by admin", published: false });

    expect(res.status).toBe(200);
    tutorialId = new ObjectId(res.body.id);
  });

  test("a moderator can read it", async () => {
    const res = await api.get(`/tutorials/${tutorialId}`).set("x-access-token", moderatorToken);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("qa_e2e_shared_resource");
  });

  test("a plain user can read it, but cannot delete it", async () => {
    const readRes = await api.get(`/tutorials/${tutorialId}`).set("x-access-token", userToken);
    expect(readRes.status).toBe(200);

    const deleteRes = await api.delete(`/tutorials/${tutorialId}`).set("x-access-token", userToken);
    expect(deleteRes.status).toBe(403);

    const stillThere = await mongo.collection("tutorials").findOne({ _id: tutorialId });
    expect(stillThere).not.toBeNull();
  });

  test("a moderator cannot delete it either", async () => {
    const res = await api.delete(`/tutorials/${tutorialId}`).set("x-access-token", moderatorToken);
    expect(res.status).toBe(403);

    const stillThere = await mongo.collection("tutorials").findOne({ _id: tutorialId });
    expect(stillThere).not.toBeNull();
  });

  test("only the admin can delete it", async () => {
    const res = await api.delete(`/tutorials/${tutorialId}`).set("x-access-token", adminToken);
    expect(res.status).toBe(200);

    const gone = await mongo.collection("tutorials").findOne({ _id: tutorialId });
    expect(gone).toBeNull();
  });

  test("it is gone for every role afterward", async () => {
    const moderatorRes = await api.get(`/tutorials/${tutorialId}`).set("x-access-token", moderatorToken);
    const userRes = await api.get(`/tutorials/${tutorialId}`).set("x-access-token", userToken);

    expect(moderatorRes.status).toBe(404);
    expect(userRes.status).toBe(404);
  });
});
