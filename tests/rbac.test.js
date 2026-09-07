const api = require("./helpers/api");
const { asAdmin, asModerator, asUser } = require("./helpers/auth");

describe("GET /api/test/all", () => {
  test("is reachable without a token", async () => {
    const res = await api.get("/test/all");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/test/user", () => {
  test("rejects a request with no token", async () => {
    const res = await api.get("/test/user");
    expect(res.status).toBe(403);
  });

  // Client gets a clean 401, but this trips ERR_HTTP_HEADERS_SENT server-side
  // (authJwt.js's catchError double-sends via sendStatus().send()). Confirmed
  // via container logs; a secondary finding, not the main bug report.
  test("rejects an invalid token", async () => {
    const res = await api.get("/test/user").set("x-access-token", "not-a-real-token");
    expect(res.status).toBe(401);
  });

  test.each([
    ["user", asUser],
    ["moderator", asModerator],
    ["admin", asAdmin],
  ])("allows an authenticated %s", async (_role, signIn) => {
    const { accessToken } = await signIn();
    const res = await api.get("/test/user").set("x-access-token", accessToken);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/test/mod", () => {
  test("rejects a request with no token", async () => {
    const res = await api.get("/test/mod");
    expect(res.status).toBe(403);
  });

  test("rejects a plain user", async () => {
    const { accessToken } = await asUser();
    const res = await api.get("/test/mod").set("x-access-token", accessToken);
    expect(res.status).toBe(403);
  });

  test("allows a moderator", async () => {
    const { accessToken } = await asModerator();
    const res = await api.get("/test/mod").set("x-access-token", accessToken);
    expect(res.status).toBe(200);
  });

  // README says "moderator or admin", but the route only uses isModerator
  // (user.routes.js), so a pure admin is rejected. Asserts the documented
  // contract; expected to fail against the current application.
  test("allows an admin, per the documented contract", async () => {
    const { accessToken } = await asAdmin();
    const res = await api.get("/test/mod").set("x-access-token", accessToken);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/test/admin", () => {
  test("rejects a request with no token", async () => {
    const res = await api.get("/test/admin");
    expect(res.status).toBe(403);
  });

  test("rejects a plain user", async () => {
    const { accessToken } = await asUser();
    const res = await api.get("/test/admin").set("x-access-token", accessToken);
    expect(res.status).toBe(403);
  });

  test("rejects a moderator", async () => {
    const { accessToken } = await asModerator();
    const res = await api.get("/test/admin").set("x-access-token", accessToken);
    expect(res.status).toBe(403);
  });

  test("allows an admin", async () => {
    const { accessToken } = await asAdmin();
    const res = await api.get("/test/admin").set("x-access-token", accessToken);
    expect(res.status).toBe(200);
  });
});
