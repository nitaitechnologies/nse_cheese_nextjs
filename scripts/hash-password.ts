import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password) {
  console.error("Usage: npm run hash-password -- <password>");
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
console.log(`DASHBOARD_PASSWORD_HASH=${hash}`);
console.log(`DASHBOARD_PASSWORD_HASH_B64=${Buffer.from(hash).toString("base64")}`);
