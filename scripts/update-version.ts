import fs from "node:fs";
import path from "node:path";

const version = process.argv[2];
if (!version) {
  console.error("Usage: bun scripts/update-version.ts <version>");
  process.exit(1);
}

const cleanVersion = version.replace(/^v/, "");
console.log(`[Version] Syncing project version to ${cleanVersion}...`);

// 1. Update package.json
const pkgPath = path.join(process.cwd(), "package.json");
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  pkg.version = cleanVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
  console.log(`[Version] Updated package.json version -> ${cleanVersion}`);
}

// 2. Update src-tauri/tauri.conf.json
const tauriConfPath = path.join(process.cwd(), "src-tauri", "tauri.conf.json");
if (fs.existsSync(tauriConfPath)) {
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf-8"));
  tauriConf.version = cleanVersion;
  fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + "\n", "utf-8");
  console.log(`[Version] Updated tauri.conf.json version -> ${cleanVersion}`);
}

// 3. Update src-tauri/Cargo.toml
const cargoPath = path.join(process.cwd(), "src-tauri", "Cargo.toml");
if (fs.existsSync(cargoPath)) {
  let cargoContent = fs.readFileSync(cargoPath, "utf-8");
  cargoContent = cargoContent.replace(/^version = "[^"]+"/m, `version = "${cleanVersion}"`);
  fs.writeFileSync(cargoPath, cargoContent, "utf-8");
  console.log(`[Version] Updated Cargo.toml version -> ${cleanVersion}`);
}

console.log(`[Version] Successfully synchronized version to ${cleanVersion}`);
