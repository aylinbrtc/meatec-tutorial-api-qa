require("dotenv").config();
const { MongoClient } = require("mongodb");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/bezkoder_db";

let client;

async function connect() {
  if (!client) {
    client = new MongoClient(MONGO_URI);
    await client.connect();
  }
  return client.db();
}

async function close() {
  if (client) {
    await client.close();
    client = undefined;
  }
}

module.exports = { connect, close };
