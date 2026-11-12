import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import { createApp } from "../server.js";
const mongo = await MongoMemoryServer.create();
const client = await new MongoClient(mongo.getUri()).connect();
const db = client.db("e2e");
const app = await createApp({
  db,
  client,
  config: {
    secret: "browser-test-secret-".repeat(4),
    username: "teacher",
    passwordHash: await bcrypt.hash("browser-password", 10),
  },
});
const students = [
  {
    _id: new ObjectId(),
    name: "Maya Fernando",
    nameKey: "maya fernando",
    active: true,
    label: "Grade 10 · 01",
  },
  {
    _id: new ObjectId(),
    name: "Daniel Perera",
    nameKey: "daniel perera",
    active: true,
    label: "Grade 10 · 02",
  },
  {
    _id: new ObjectId(),
    name: "Single Student",
    nameKey: "single student",
    active: true,
  },
];
const papers = [
  {
    _id: new ObjectId(),
    name: "Mathematics · Paper 01",
    subject: "Mathematics",
    max: 100,
    order: 1,
    state: "published",
  },
  {
    _id: new ObjectId(),
    name: "Mathematics · Paper 02",
    subject: "Mathematics",
    max: 50,
    order: 2,
    state: "published",
  },
];
await db.collection("students").insertMany(students);
await db.collection("papers").insertMany(papers);
await db.collection("marks").insertMany([
  { studentId: students[0]._id, paperId: papers[0]._id, value: 64 },
  { studentId: students[0]._id, paperId: papers[1]._id, value: 42 },
  { studentId: students[2]._id, paperId: papers[0]._id, value: 0 },
]);
const server = app.listen(3100, () => console.log("Fixture server on 3100"));
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, async () => {
    server.close();
    await client.close();
    await mongo.stop();
    process.exit(0);
  });
