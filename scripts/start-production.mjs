import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const port = process.env.PORT || "3000";
const workerPort = process.env.WORKER_PORT || "4001";

process.env.PORT = port;
process.env.WORKER_PORT = workerPort;
process.env.WORKER_INTERNAL_URL = `http://127.0.0.1:${workerPort}`;
process.env.TZ ??= "Asia/Kolkata";

if (!existsSync("dist/worker/index.js")) {
  console.error("[start] missing dist/worker/index.js. Run npm run build:worker.");
  process.exit(1);
}

console.log(`[start] web 0.0.0.0:${port}, worker 127.0.0.1:${workerPort}`);

const children = [
  spawn(process.execPath, ["dist/worker/index.js"], { stdio: "inherit" }),
  spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", port],
    { stdio: "inherit" },
  ),
];

let stopping = false;

function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && !child.signalCode) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 500).unref();
}

process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0));

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (stopping) return;
    stop(signal ? 1 : (code ?? 1));
  });
}
