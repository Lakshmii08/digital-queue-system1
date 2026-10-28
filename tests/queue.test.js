
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../app");

beforeEach(async () => {
  await request(app).delete("/api/queue/reset");
});

test("health endpoint reports healthy", async () => {
  const response = await request(app).get("/health");

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "healthy");
});

test("creates a queue token", async () => {
  const response = await request(app)
    .post("/api/queue")
    .send({ name: "Priya", department: "Accounts" });

  assert.equal(response.status, 201);
  assert.match(response.body.token, /^Q\d{3,}$/);
  assert.equal(response.body.status, "WAITING");
});

test("rejects an empty name", async () => {
  const response = await request(app)
    .post("/api/queue")
    .send({ name: "" });

  assert.equal(response.status, 400);
});

test("calls the next waiting token", async () => {
  await request(app).post("/api/queue").send({ name: "Priya" });

  const response = await request(app).post("/api/queue/next");

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "SERVING");
});

test("does not serve two tokens simultaneously", async () => {
  await request(app).post("/api/queue").send({ name: "Priya" });
  await request(app).post("/api/queue").send({ name: "Asha" });
  await request(app).post("/api/queue/next");

  const response = await request(app).post("/api/queue/next");

  assert.equal(response.status, 409);
});



test("stats endpoint returns queue counts", async () => {
  await request(app).post("/api/queue").send({ name: "Priya" });
  const response = await request(app).get("/api/queue/stats");
  assert.equal(response.status, 200);
  assert.ok(response.body.waiting >= 1);
  assert.equal(response.body.total, 1);
});

test("waiting token can be cancelled", async () => {
  const created = await request(app).post("/api/queue").send({ name: "Asha" });
  const response = await request(app).delete(`/api/queue/${created.body.id}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.message, "Token cancelled");
});
