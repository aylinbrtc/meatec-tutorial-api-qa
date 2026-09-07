const api = require("./helpers/api");
const db = require("./helpers/db");
const { asUser } = require("./helpers/auth");

describe("POST /api/auth/signup", () => {
  let mongo;
  const createdUsernames = [];

  beforeAll(async () => {
    mongo = await db.connect();
  });

  afterAll(async () => {
    if (createdUsernames.length > 0) {
      await mongo.collection("users").deleteMany({ username: { $in: createdUsernames } });
    }
    await db.close();
  });

  test("creates a new user and persists a bcrypt-hashed password", async () => {
    const username = `qa_signup_${Date.now()}`;
    createdUsernames.push(username);

    const res = await api.post("/auth/signup").send({
      username,
      email: `${username}@qa.local`,
      password: "Password123!",
      roles: ["user"],
    });

    expect(res.status).toBeLessThan(300);
    expect(res.body.message).toMatch(/registered successfully/i);

    const stored = await mongo.collection("users").findOne({ username });
    expect(stored).not.toBeNull();
    expect(stored.password).not.toBe("Password123!");
  });

  test("rejects a duplicate username", async () => {
    const username = `qa_signup_dup_${Date.now()}`;
    createdUsernames.push(username);

    await api.post("/auth/signup").send({
      username,
      email: `${username}@qa.local`,
      password: "Password123!",
    });

    const res = await api.post("/auth/signup").send({
      username,
      email: `different_${username}@qa.local`,
      password: "Password123!",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/username is already in use/i);
  });

  test("rejects a duplicate email", async () => {
    const usernameA = `qa_signup_email_a_${Date.now()}`;
    const usernameB = `qa_signup_email_b_${Date.now()}`;
    createdUsernames.push(usernameA, usernameB);
    const email = `${usernameA}@qa.local`;

    await api.post("/auth/signup").send({ username: usernameA, email, password: "Password123!" });

    const res = await api
      .post("/auth/signup")
      .send({ username: usernameB, email, password: "Password123!" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email is already in use/i);
  });

  test("rejects a role that does not exist and does not create the user", async () => {
    const username = `qa_signup_badrole_${Date.now()}`;

    const res = await api.post("/auth/signup").send({
      username,
      email: `${username}@qa.local`,
      password: "Password123!",
      roles: ["superadmin"],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not exist/i);

    const stored = await mongo.collection("users").findOne({ username });
    expect(stored).toBeNull();
  });

  test("assigns the default 'user' role when roles are omitted", async () => {
    const username = `qa_signup_defaultrole_${Date.now()}`;
    createdUsernames.push(username);

    const res = await api.post("/auth/signup").send({
      username,
      email: `${username}@qa.local`,
      password: "Password123!",
    });

    expect(res.status).toBeLessThan(300);

    const userRole = await mongo.collection("roles").findOne({ name: "user" });
    const stored = await mongo.collection("users").findOne({ username });
    expect(stored.roles).toHaveLength(1);
    expect(stored.roles[0].toString()).toBe(userRole._id.toString());
  });
});

describe("POST /api/auth/signin", () => {
  test("returns access and refresh tokens for valid credentials", async () => {
    const body = await asUser();

    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.roles).toContain("ROLE_USER");
  });

  test("rejects an incorrect password", async () => {
    const res = await api.post("/auth/signin").send({
      username: process.env.TEST_USER_USERNAME,
      password: "definitely-wrong-password",
    });

    expect(res.status).toBe(401);
    expect(res.body.accessToken).toBeNull();
  });

  test("rejects a username that does not exist", async () => {
    const res = await api.post("/auth/signin").send({
      username: `does_not_exist_${Date.now()}`,
      password: "whatever",
    });

    expect(res.status).toBe(404);
  });
});

describe("POST /api/auth/refreshtoken", () => {
  let mongo;

  beforeAll(async () => {
    mongo = await db.connect();
  });

  afterAll(async () => {
    await db.close();
  });

  test("issues a new access token for a valid refresh token", async () => {
    const signInBody = await asUser();

    const res = await api.post("/auth/refreshtoken").send({ refreshToken: signInBody.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBe(signInBody.refreshToken);
  });

  test("rejects a missing refresh token", async () => {
    const res = await api.post("/auth/refreshtoken").send({});
    expect(res.status).toBe(403);
  });

  test("rejects a refresh token that does not exist", async () => {
    const res = await api.post("/auth/refreshtoken").send({ refreshToken: "not-a-real-token" });
    expect(res.status).toBe(403);
  });

  test("rejects an expired refresh token and removes it from the database", async () => {
    const signInBody = await asUser();

    // Backdating expiryDate directly avoids waiting out the real 120s TTL.
    await mongo
      .collection("refreshtokens")
      .updateOne({ token: signInBody.refreshToken }, { $set: { expiryDate: new Date(Date.now() - 1000) } });

    const res = await api.post("/auth/refreshtoken").send({ refreshToken: signInBody.refreshToken });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/expired/i);

    const stored = await mongo.collection("refreshtokens").findOne({ token: signInBody.refreshToken });
    expect(stored).toBeNull();
  });
});
