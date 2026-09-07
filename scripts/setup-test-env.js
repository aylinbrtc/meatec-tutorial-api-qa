// Safe to run multiple times: existing users are left untouched, seeded
// tutorials are identified by a fixed title tag and replaced on every run.

require("dotenv").config();

const { MongoClient } = require("mongodb");

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8080/api";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/bezkoder_db";

const TEST_USERS = [
  {
    username: process.env.TEST_ADMIN_USERNAME,
    password: process.env.TEST_ADMIN_PASSWORD,
    roles: ["admin"],
  },
  {
    username: process.env.TEST_MODERATOR_USERNAME,
    password: process.env.TEST_MODERATOR_PASSWORD,
    roles: ["moderator"],
  },
  {
    username: process.env.TEST_USER_USERNAME,
    password: process.env.TEST_USER_PASSWORD,
    roles: ["user"],
  },
];

const SEED_TAG = "[QA Seed]";
const SEED_TUTORIALS = [
  { title: `${SEED_TAG} Getting Started`, description: "Published fixture tutorial for read tests.", published: true },
  { title: `${SEED_TAG} Advanced Topics`, description: "Unpublished fixture tutorial for read tests.", published: false },
  { title: `${SEED_TAG} Reference Guide`, description: "Published fixture tutorial for read tests.", published: true },
];

function log(message) {
  console.log(`[setup] ${message}`);
}

function assertTestUsersConfigured() {
  const missing = TEST_USERS.filter((u) => !u.username || !u.password);
  if (missing.length > 0) {
    throw new Error(
      "TEST_*_USERNAME / TEST_*_PASSWORD are not fully set. Copy .env.example to .env and fill them in."
    );
  }
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function assertApiIsUp() {
  let res;
  try {
    res = await fetch(`${API_BASE_URL}/test/all`);
  } catch (err) {
    throw new Error(
      `Cannot reach the API at ${API_BASE_URL}. Is app-under-test running? See qa-suite/README.md, step 1. (${err.message})`
    );
  }
  if (!res.ok) {
    throw new Error(`API health check returned unexpected status ${res.status}`);
  }
}

async function assertRolesExist(db) {
  const roles = await db.collection("roles").find({}).toArray();
  const names = roles.map((r) => r.name);
  const missing = ["user", "moderator", "admin"].filter((r) => !names.includes(r));
  if (missing.length > 0) {
    throw new Error(
      `Missing role(s) in the database: ${missing.join(", ")}. Roles are seeded by the application on ` +
      "first boot; restart app-under-test and check its logs."
    );
  }
}

async function ensureUser(db, user) {
  const existing = await db.collection("users").findOne({ username: user.username });
  if (existing) {
    log(`  - "${user.username}" already exists, skipping creation`);
    return;
  }

  const res = await fetch(`${API_BASE_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: user.username,
      email: `${user.username}@qa.local`,
      password: user.password,
      roles: user.roles,
    }),
  });

  if (!res.ok) {
    const body = await safeJson(res);
    if (res.status === 400 && body?.message?.includes("already in use")) {
      // Created concurrently by another run between our existence check and this call.
      log(`  - "${user.username}" was created concurrently, skipping`);
      return;
    }
    throw new Error(`Failed to create user "${user.username}": ${res.status} ${JSON.stringify(body)}`);
  }

  log(`  - created "${user.username}" (${user.roles.join(", ")})`);
}

// Access tokens expire in 60s, so this only verifies sign-in; tests sign in themselves.
async function verifySignIn(user) {
  const res = await fetch(`${API_BASE_URL}/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user.username, password: user.password }),
  });

  const body = await safeJson(res);
  if (!res.ok || !body?.accessToken) {
    throw new Error(`Sign-in check failed for "${user.username}": ${res.status} ${JSON.stringify(body)}`);
  }

  log(`  - "${user.username}" signed in (roles: ${body.roles?.join(", ")})`);
  return body.accessToken;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function reseedTutorials(db, adminToken) {
  const { deletedCount } = await db
    .collection("tutorials")
    .deleteMany({ title: { $regex: `^${escapeRegex(SEED_TAG)}` } });
  if (deletedCount > 0) {
    log(`  - removed ${deletedCount} previously seeded tutorial(s)`);
  }

  for (const tutorial of SEED_TUTORIALS) {
    const res = await fetch(`${API_BASE_URL}/tutorials`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-access-token": adminToken },
      body: JSON.stringify(tutorial),
    });
    const body = await safeJson(res);
    if (!res.ok) {
      throw new Error(`Failed to seed tutorial "${tutorial.title}": ${res.status} ${JSON.stringify(body)}`);
    }
    log(`  - seeded "${tutorial.title}" (id: ${body.id})`);
  }
}

async function main() {
  assertTestUsersConfigured();

  log("Checking API availability...");
  await assertApiIsUp();

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();

  try {
    log("Checking role baseline...");
    await assertRolesExist(db);

    log("Ensuring test users exist...");
    for (const user of TEST_USERS) {
      await ensureUser(db, user);
    }

    log("Verifying sign-in for each test user...");
    let adminToken;
    for (const user of TEST_USERS) {
      const token = await verifySignIn(user);
      if (user.roles.includes("admin")) {
        adminToken = token;
      }
    }

    log("Seeding known tutorials...");
    await reseedTutorials(db, adminToken);

    log("Setup complete.");
  } finally {
    await client.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\n[setup] FAILED: ${err.message}`);
    process.exit(1);
  });
