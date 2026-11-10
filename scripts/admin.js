import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
if (!process.env.MONGODB_URI) throw Error("Set MONGODB_URI in .env");
const terminalOutput = new Writable({
  write(chunk, _encoding, done) {
    if (!terminalOutput.muted) process.stdout.write(chunk);
    done();
  },
});
const prompt = createInterface({
  input: process.stdin,
  output: terminalOutput,
  terminal: true,
});
let client;
try {
  const username = (await prompt.question("Admin username: ")).trim();
  process.stdout.write("New password (12+ characters, hidden): ");
  terminalOutput.muted = true;
  const password = await prompt.question("");
  terminalOutput.muted = false;
  process.stdout.write("\n");
  if (
    !username ||
    username.length > 100 ||
    password.length < 12 ||
    password.length > 128
  )
    throw Error("Use a username and a password of 12–128 characters");
  client = await new MongoClient(process.env.MONGODB_URI).connect();
  const db = client.db(process.env.MONGODB_DB || "levelup_results");
  await db
    .collection("administrators")
    .createIndex({ username: 1 }, { unique: true });
  await db.collection("administrators").updateOne(
    { username },
    {
      $set: {
        passwordHash: await bcrypt.hash(password, 12),
        updatedAt: new Date(),
      },
      $setOnInsert: { username, createdAt: new Date() },
    },
    { upsert: true },
  );
  // Invalidate active sessions after credential changes.
  await db.collection("sessions").deleteMany({});
  console.log("Administrator saved. Existing sessions have been revoked.");
} finally {
  terminalOutput.muted = false;
  prompt.close();
  await client?.close();
}
