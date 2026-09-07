require("dotenv").config();
const api = require("./api");

async function signIn(username, password) {
  const res = await api.post("/auth/signin").send({ username, password });
  if (res.status !== 200 || !res.body.accessToken) {
    throw new Error(`Sign-in failed for "${username}": ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

const asAdmin = () => signIn(process.env.TEST_ADMIN_USERNAME, process.env.TEST_ADMIN_PASSWORD);
const asModerator = () => signIn(process.env.TEST_MODERATOR_USERNAME, process.env.TEST_MODERATOR_PASSWORD);
const asUser = () => signIn(process.env.TEST_USER_USERNAME, process.env.TEST_USER_PASSWORD);

module.exports = { signIn, asAdmin, asModerator, asUser };
