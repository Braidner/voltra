import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, realpath, link } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { startScan, details, openDirectory, state } from "../lib/server";
test("opening a pruned deep folder restores children without replacing the disk scan or category totals", async () => {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "voltra-expand-")),
  );
  const deep = path.join(root, "a/b/c/d/e");
  await mkdir(deep, { recursive: true });
  await writeFile(path.join(deep, "visible.txt"), Buffer.alloc(8192, 1));
  const job = await startScan(root);
  while (job.status === "running") await new Promise((r) => setTimeout(r, 10));
  assert.equal(details(deep).children.length, 0);
  assert.ok(details(deep).omitted > 0);
  const totals = JSON.stringify(job.groups);
  const bytes = job.tree!.bytes;
  const [first, second] = await Promise.all([
    openDirectory(deep),
    openDirectory(deep),
  ]);
  assert.equal(first.children[0].name, "visible.txt");
  assert.equal(second.children[0].name, "visible.txt");
  assert.equal(first.omitted, 0);
  assert.equal(state.scan?.id, job.id);
  assert.equal(job.tree!.bytes, bytes);
  assert.equal(JSON.stringify(job.groups), totals);
  assert.ok(details(path.join(deep, "visible.txt")));
  // A new hardlink during expansion must not inflate the historical disk total.
  first.children.length = 0;
  const retained = state.scan!.tree!;
  function prune(n: typeof retained): boolean {
    if (n.path === deep) {
      n.children = [];
      n.omitted = 1;
      return true;
    }
    return n.children.some(prune);
  }
  prune(retained);
  await link(path.join(deep, "visible.txt"), path.join(deep, "copy.txt"));
  await openDirectory(deep);
  assert.equal(job.tree!.bytes, bytes);
  assert.equal(JSON.stringify(job.groups), totals);
});
