import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  mkdir,
  symlink,
  link,
  lstat,
  realpath,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startScan, state, details, trash } from "../lib/server";
test("scanner counts hardlinks once, never follows symlinks, and rejects unknown deletion", async () => {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "voltra-test-")),
  );
  await mkdir(path.join(root, "nested"));
  await writeFile(path.join(root, "photo.jpg"), Buffer.alloc(8192, 42));
  await link(path.join(root, "photo.jpg"), path.join(root, "copy.jpg"));
  await symlink(root, path.join(root, "nested", "loop"));
  const job = await startScan(root);
  while (job.status === "running") await new Promise((r) => setTimeout(r, 10));
  assert.equal(job.status, "complete");
  assert.equal(job.visited, 5);
  assert.equal(job.tree?.files, 2);
  const files = job.tree!.children.filter((n) => n.kind === "file");
  assert.equal(
    files.reduce((s, n) => s + n.bytes, 0),
    (await lstat(path.join(root, "photo.jpg"))).blocks * 512,
  );
  assert.equal(details(path.join(root, "nested", "loop")).kind, "symlink");
  await assert.rejects(() => trash(["/"], job.id), /защищён/);
  state.scan = null;
});
