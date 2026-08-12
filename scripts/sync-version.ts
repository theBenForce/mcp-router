import fs from "node:fs";
import path from "node:path";

const inputVersion = process.argv[2];
if (!inputVersion) {
  console.error("Usage: bun scripts/sync-version.ts <version>");
  process.exit(1);
}

// Clean version string (remove leading 'v' if present)
const cleanVersion = inputVersion.replace(/^v/, "").trim();

if (!/^\d+\.\d+\.\d+/.test(cleanVersion)) {
  console.error(`Invalid semver format: ${cleanVersion}`);
  process.exit(1);
}

const filesToUpdate = [
  path.join(process.cwd(), "package.json"),
  path.join(process.cwd(), "src-tauri", "tauri.conf.json"),
  path.join(process.cwd(), "src", "web", "package.json"),
];

for (const filePath of filesToUpdate) {
  if (fs.existsSync(filePath)) {
    const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
    content.version = cleanVersion;
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + "\n");
    console.log(`[sync-version] Updated ${path.relative(process.cwd(), filePath)} version to ${cleanVersion}`);
  } else {
    console.warn(`[sync-version] File not found: ${filePath}`);
  }
}
