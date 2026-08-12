import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

function getTargetTriple(): string {
  const arch = process.arch;
  const platform = process.platform;

  if (platform === "darwin") {
    return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  } else if (platform === "win32") {
    return arch === "arm64" ? "aarch64-pc-windows-msvc.exe" : "x86_64-pc-windows-msvc.exe";
  } else {
    return arch === "arm64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu";
  }
}

const triple = getTargetTriple();
const binDir = path.join(process.cwd(), "src-tauri", "bin");
if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
}

const outfile = path.join(binDir, `backend-${triple}`);
console.log(`[Build] Compiling backend sidecar binary for target ${triple} -> ${outfile}`);

const res = spawnSync("bun", ["build", "--compile", "src/index.ts", "--outfile", outfile], {
  stdio: "inherit",
  env: process.env,
});

if (res.status !== 0) {
  console.error(`[Build] Backend sidecar compilation failed with status ${res.status}`);
  process.exit(res.status || 1);
}

console.log(`[Build] Sidecar binary created successfully at ${outfile}`);
