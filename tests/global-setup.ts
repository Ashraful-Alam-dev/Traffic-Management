import { execSync } from "node:child_process";

export default function setup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    console.warn("DATABASE_URL_TEST not set: integration tests will be skipped.");
    return;
  }
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}
