require("dotenv").config();
const supertest = require("supertest");

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8080/api";

module.exports = supertest(API_BASE_URL);
