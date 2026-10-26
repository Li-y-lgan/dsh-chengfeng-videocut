#!/usr/bin/env node
"use strict";

// Build-time only. Never downloads code, installs a Skill, or changes a Runtime.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const ID = "chengfeng-videocut-workbench";
const REPOSITORY = "Agentchengfeng/chengfeng-videocut-workbench";
const SOURCE_PATH = `.agents/skills/${ID}`;
const ROOT = path.resolve(__dirname, "..");
const LOCK = path.join(ROOT, "workbench-skill.lock.json");
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
function git(repo, args) { return execFileSync("git", ["-C", repo, ...args], { maxBuffer: 8 * 1024 * 1024 }); }
function safePath(value) {
  if (!value || value.includes("\\") || value.split("/").some(p => !p || p === "." || p === "..")) throw Error("Unsafe snapshot path");
  return value;
}
function transform(relative, bytes) {
  if (relative !== "agents/openai.yaml") return bytes;
  const text = bytes.toString("utf8");
  if (!text.includes(`$${ID} `)) throw Error("Missing standalone default prompt");
  return Buffer.from(text.replaceAll(`$${ID} `, `$chengfeng-videocut:${ID} `));
}
function listFiles(root, prefix = "") {
  const directory = fs.lstatSync(root);
  if (directory.isSymbolicLink() || !directory.isDirectory()) throw Error("Snapshot directory must not be a symlink");
  const result = [];
  for (const name of fs.readdirSync(root).sort()) {
    const relative = safePath(prefix + name);
    const absolute = path.join(root, name);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw Error("Snapshot symlink forbidden");
    if (stat.isDirectory()) result.push(...listFiles(absolute, `${relative}/`));
    else if (stat.isFile()) result.push(relative);
    else throw Error("Snapshot special file forbidden");
  }
  return result;
}
function verify(root = ROOT) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, "workbench-skill.lock.json"), "utf8"));
  if (lock.repository !== REPOSITORY || lock.sourcePath !== SOURCE_PATH || !/^[a-f0-9]{40}$/.test(lock.commit)) throw Error("Invalid fixed source identity");
  if (lock.schemaVersion !== 1 || lock.skillId !== ID || lock.version !== "0.1.0-beta.1" || lock.minimumRuntimeVersion !== "0.5.9" || lock.transform !== "namespace-default-prompt-v1") throw Error("Invalid snapshot contract");
  const destination = path.join(root, "skills", ID);
  const actual = listFiles(destination).sort();
  if (JSON.stringify(actual) !== JSON.stringify(Object.keys(lock.files).sort())) throw Error("Snapshot file inventory mismatch");
  for (const relative of actual) {
    const bytes = fs.readFileSync(path.join(destination, relative));
    if (sha256(bytes) !== lock.files[relative].snapshotSha256) throw Error(`Snapshot digest mismatch: ${relative}`);
    if (!/^[a-f0-9]{64}$/.test(lock.files[relative].sourceSha256)) throw Error("Invalid source digest");
    if (relative !== "agents/openai.yaml" && lock.files[relative].sourceSha256 !== lock.files[relative].snapshotSha256) throw Error("Unexpected method transformation");
  }
  return lock;
}
function importSnapshot(repo, commit, root = ROOT) {
  if (!/^[a-f0-9]{40}$/.test(commit || "")) throw Error("An immutable 40-hex commit is required");
  const origin = git(repo, ["remote", "get-url", "origin"]).toString().trim();
  if (![ `https://github.com/${REPOSITORY}.git`, `https://github.com/${REPOSITORY}`, `git@github.com:${REPOSITORY}.git` ].includes(origin)) throw Error("Unexpected source origin");
  if (git(repo, ["rev-parse", `${commit}^{commit}`]).toString().trim() !== commit) throw Error("Unresolved source commit");
  const pkg = JSON.parse(git(repo, ["show", `${commit}:package.json`]).toString());
  if (pkg.version !== "0.1.0-beta.1") throw Error("Unexpected source package version");
  const records = git(repo, ["ls-tree", "-r", "-z", commit, "--", SOURCE_PATH]).toString().split("\0").filter(Boolean);
  const files = {};
  const payload = new Map();
  for (const record of records) {
    const match = /^(100644|100755) blob ([a-f0-9]+)\t(.+)$/.exec(record);
    if (!match || !match[3].startsWith(`${SOURCE_PATH}/`)) throw Error("Source symlink or unsupported tree entry");
    const relative = safePath(match[3].slice(SOURCE_PATH.length + 1));
    const source = git(repo, ["cat-file", "blob", match[2]]);
    const snapshot = transform(relative, source);
    files[relative] = { sourceSha256: sha256(source), snapshotSha256: sha256(snapshot) };
    payload.set(relative, snapshot);
  }
  if (!payload.has("SKILL.md") || !payload.has("agents/openai.yaml")) throw Error("Incomplete source Skill");
  const destination = path.join(root, "skills", ID);
  // Rebuild only an unchanged, owned snapshot. Never overwrite unknown local edits.
  if (fs.existsSync(destination)) {
    const previous = verify(root);
    if (JSON.stringify(Object.keys(previous.files).sort()) !== JSON.stringify([...payload.keys()].sort())) throw Error("File set changed; explicit reviewed migration required");
  }
  for (const [relative, bytes] of payload) {
    const target = path.join(destination, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  const lock = { schemaVersion: 1, skillId: ID, repository: REPOSITORY, commit, sourcePath: SOURCE_PATH, version: pkg.version, minimumRuntimeVersion: "0.5.9", transform: "namespace-default-prompt-v1", files };
  fs.writeFileSync(path.join(root, "workbench-skill.lock.json"), JSON.stringify(lock, null, 2) + "\n");
  return verify(root);
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const lock = args.length === 1 && args[0] === "--check" ? verify() : args.length === 4 && args[0] === "--source-repo" && args[2] === "--commit" ? importSnapshot(path.resolve(args[1]), args[3]) : (() => { throw Error("Usage: --check | --source-repo <verified-clone> --commit <40hex>"); })();
    console.log(JSON.stringify({ ok: true, skillId: lock.skillId, commit: lock.commit, fileCount: Object.keys(lock.files).length }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { importSnapshot, verify, transform, sha256 };
