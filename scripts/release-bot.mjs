import { spawn } from "node:child_process";

const npm = "npm";
const args = new Set(process.argv.slice(2));
const includeDist = args.has("--dist");
const includePackageVerify = args.has("--verify-package");
const strictGate = args.has("--strict-gate");

const steps = [
  ["assets:quality", ["run", "assets:quality"]],
  ["test", ["run", "test"]],
  ["lint", ["run", "lint"]],
  ["e2e", ["run", "e2e"]],
  ["build", ["run", "build"]]
];

if (includeDist) {
  steps.push(["dist", ["run", "dist"]]);
}
if (includePackageVerify) {
  steps.push(["verify:package", ["run", "verify:package"]]);
  steps.push(["visual:evidence", ["run", "visual:evidence"]]);
}
steps.push(["release:gate", strictGate ? ["run", "release:gate", "--", "--strict"] : ["run", "release:gate"]]);

for (const [name, commandArgs] of steps) {
  console.log(`\n[release-bot] ${name}`);
  await run(npm, commandArgs);
}

console.log("\n[release-bot] ok");

function run(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: "inherit",
      shell: process.platform === "win32"
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${commandArgs.join(" ")} exited with ${code}`));
    });
    child.on("error", reject);
  });
}
