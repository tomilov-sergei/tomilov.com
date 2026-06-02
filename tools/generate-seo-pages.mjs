#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const python = process.env.PYTHON || "python3";

for (const script of ["generate_telegram_seo.py", "generate_photo_seo.py"]) {
  const result = spawnSync(python, [path.join(rootDir, "tools", script)], {
    cwd: rootDir,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
