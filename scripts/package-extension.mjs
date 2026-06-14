import { cpSync, existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const buildDir = join(root, ".output", "chrome-mv3");
const packageDir = join(root, "vgraffiti-extension");
const zipPath = join(root, "vgraffiti-extension.zip");

if (!existsSync(buildDir)) {
  console.error("Build output not found:", buildDir);
  process.exit(1);
}

rmSync(packageDir, { recursive: true, force: true });
rmSync(zipPath, { force: true });

cpSync(buildDir, packageDir, { recursive: true });

const zipCmd =
  process.platform === "win32"
    ? `powershell -NoProfile -Command "Compress-Archive -Path '${packageDir}' -DestinationPath '${zipPath}' -Force"`
    : `zip -r "${zipPath}" vgraffiti-extension`;

execSync(zipCmd, { cwd: root, stdio: "inherit" });

console.log("Created:", zipPath);
