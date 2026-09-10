import { opendir, lstat, realpath, statfs } from "node:fs/promises";
import path from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { Entry, Scan, classify, findEntry } from "./model";
import { canTrash, validateSelection } from "./safety";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
type State = {
  scan: Scan | null;
  cancel: boolean;
  secret: string;
  busy: boolean;
  seen: Set<string>;
};
const globalState = globalThis as typeof globalThis & { diskState?: State };
export const state = (globalState.diskState ??= {
  scan: null,
  cancel: false,
  secret: randomBytes(32).toString("hex"),
  busy: false,
  seen: new Set(),
});
export async function capacity() {
  const s = await statfs("/");
  return { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
}
const skip = new Set(["/dev", "/proc", "/System/Volumes", "/Network", "/net"]);
const expansions = new Map<string, Promise<void>>();
export async function startScan(root: string) {
  if (state.scan?.status === "running" || state.busy)
    throw new Error("Дождитесь завершения текущей операции");
  if (!path.isAbsolute(root)) throw new Error("Нужен абсолютный путь");
  root = await realpath(root);
  const st = await lstat(root);
  if (!st.isDirectory()) throw new Error("Выберите папку");
  state.cancel = false;
  state.seen.clear();
  const job: Scan = {
    id: randomUUID(),
    root,
    status: "running",
    visited: 0,
    current: root,
    errors: 0,
    warnings: [],
    tree: null,
    groups: [],
    started: Date.now(),
  };
  state.scan = job;
  void run(job);
  return job;
}
async function run(job: Scan) {
  try {
    job.tree = await walk(job.root, job, 0);
    job.status = state.cancel ? "cancelled" : "complete";
  } catch (e) {
    job.status = "error";
    job.message = String(e);
  }
}
async function walk(
  p: string,
  job: Scan,
  depth: number,
  parent?: Entry,
  context = { seen: state.seen, cancelled: () => state.cancel },
): Promise<Entry> {
  const st = await lstat(p);
  job.visited++;
  job.current = p;
  const kind = st.isSymbolicLink()
    ? "symlink"
    : st.isDirectory()
      ? "directory"
      : "file";
  const key = `${st.dev}:${st.ino}`;
  const duplicate = kind === "file" && st.nlink > 1 && context.seen.has(key);
  if (kind === "file" && st.nlink > 1) context.seen.add(key);
  const node: Entry = {
    path: p,
    name: path.basename(p) || "/",
    bytes: duplicate ? 0 : st.blocks * 512,
    logical: duplicate ? 0 : st.size,
    files: kind === "file" ? 1 : 0,
    kind,
    category: kind === "directory" ? "Папки" : classify(p),
    dev: st.dev,
    ino: st.ino,
    mtime: st.mtimeMs,
    children: [],
    omitted: 0,
    partial: false,
  };
  parent?.children.push(node);
  if (kind !== "directory") {
    if (kind === "file" && !duplicate) {
      let group = job.groups!.find((g) => g.category === node.category);
      if (!group) {
        group = {
          ...node,
          path: "category:" + node.category,
          name: node.category,
          bytes: 0,
          logical: 0,
          files: 0,
          children: [],
        };
        job.groups!.push(group);
      }
      group.bytes += node.bytes;
      group.logical += node.logical;
      group.files++;
      group.children.push(node);
      group.children.sort((a, b) => b.bytes - a.bytes);
      if (group.children.length > 80) {
        group.children.length = 80;
        group.omitted++;
      }
    }
    return node;
  }
  if (depth === 0) job.tree = node;
  if (depth > 80 || skip.has(p)) {
    node.partial = true;
    return node;
  }
  try {
    const dir = await opendir(p);
    for await (const item of dir) {
      if (context.cancelled()) {
        node.partial = true;
        break;
      }
      const childPath = path.join(p, item.name);
      try {
        const child = await walk(childPath, job, depth + 1, node, context);
        node.bytes += child.bytes;
        node.logical += child.logical;
        node.files += child.files;
        node.partial ||= child.partial;
        if (node.children.length > 240) {
          node.children.sort((a, b) => b.bytes - a.bytes);
          node.omitted += node.children.length - 160;
          node.children.length = 160;
        }
      } catch (e) {
        node.partial = true;
        job.errors++;
        if (job.warnings.length < 12)
          job.warnings.push(
            `${childPath}: ${(e as NodeJS.ErrnoException).code || "ошибка чтения"}`,
          );
      }
    }
  } catch (e) {
    node.partial = true;
    job.errors++;
    if (job.warnings.length < 12)
      job.warnings.push(
        `${p}: ${(e as NodeJS.ErrnoException).code || "нет доступа"}`,
      );
  }
  node.children.sort((a, b) => b.bytes - a.bytes);
  if (depth >= 5) {
    node.omitted += node.children.length;
    node.children = [];
  }
  if (node.children.length > 160) {
    node.omitted += node.children.length - 160;
    node.children.length = 160;
  }
  return node;
}
export function snapshot() {
  const s = state.scan;
  if (!s) return null;
  return { ...s, tree: s.tree ? thin(s.tree, 0) : null };
}
function thin(n: Entry, d: number): Entry {
  return {
    ...n,
    children: d < 2 ? n.children.slice(0, 80).map((c) => thin(c, d + 1)) : [],
    omitted:
      n.omitted +
      (d >= 2 ? n.children.length : Math.max(0, n.children.length - 80)),
  };
}
function lookup(p: string) {
  return (
    findEntry(state.scan?.tree || null, p) ||
    state.scan?.groups?.flatMap((g) => g.children).find((n) => n.path === p)
  );
}
export function details(p: string) {
  const n = lookup(p);
  if (!n) throw new Error("Объект отсутствует в текущем сканировании");
  return { ...thin(n, 0), deletable: canTrash(p) };
}
export async function openDirectory(p: string) {
  const scan = state.scan,
    n = lookup(p);
  if (!scan || !n) throw new Error("Объект отсутствует в текущем сканировании");
  if (n.kind !== "directory" || n.children.length || !n.omitted)
    return details(p);
  if (scan.status === "running")
    throw new Error(
      "Дождитесь завершения общего сканирования, чтобы раскрыть глубокую папку",
    );
  if (state.busy) throw new Error("Дождитесь завершения перемещения");
  if (!expansions.has(p)) {
    const task = (async () => {
      if ((await realpath(p)) !== p)
        throw new Error("Путь изменился или содержит ссылку");
      const local: Scan = {
        id: scan.id,
        root: p,
        status: "running",
        visited: 0,
        current: p,
        errors: 0,
        warnings: [],
        tree: null,
        groups: [],
        started: Date.now(),
      };
      const expanded = await walk(p, local, 0, undefined, {
        seen: new Set(),
        cancelled: () => state.scan !== scan,
      });
      if (state.scan !== scan)
        throw new Error("Сканирование изменилось. Откройте папку повторно");
      if (local.errors && expanded.children.length === 0)
        throw new Error(local.warnings[0] || "Нет доступа к содержимому папки");
      if (expanded.dev !== n.dev || expanded.ino !== n.ino)
        throw new Error("Папка была заменена. Обновите сканирование.");
      // Expansion is a detail view, not another contribution to disk totals.
      // Local hardlink attribution can differ from the original whole-disk pass.
      n.children = expanded.children;
      n.omitted = expanded.omitted;
      n.partial ||= expanded.partial;
    })();
    expansions.set(p, task);
    void task.finally(() => expansions.delete(p)).catch(() => {});
  }
  await expansions.get(p);
  return details(p);
}
export async function trash(paths: string[], scanId: string) {
  if (state.busy || state.scan?.status === "running" || expansions.size)
    throw new Error("Дождитесь завершения сканирования");
  if (state.scan?.id !== scanId)
    throw new Error("Сканирование изменилось. Обновите выбор");
  validateSelection(paths);
  state.busy = true;
  try {
    const entries = [];
    for (const p of paths) {
      const n = lookup(p);
      if (!n || !canTrash(p)) throw new Error(`Путь защищён: ${p}`);
      if (n.kind === "symlink")
        throw new Error("Перенос символических ссылок отключён");
      if ((await realpath(p)) !== p)
        throw new Error("Путь изменился или содержит ссылку");
      const st = await lstat(p);
      if (st.ino !== n.ino || st.dev !== n.dev || st.mtimeMs !== n.mtime)
        throw new Error(`Объект изменился: ${p}. Пересканируйте папку.`);
      entries.push(n);
    }
    const results = [];
    for (const n of entries) {
      try {
        await exec(
          path.join(process.cwd(), ".local/trash-helper"),
          [n.path, String(n.dev), String(n.ino)],
          { timeout: 120000 },
        );
        results.push({ path: n.path, ok: true });
      } catch (e) {
        results.push({ path: n.path, ok: false, error: (e as Error).message });
      }
    }
    // Force a fresh scan before further mutation; old sizes are no longer trustworthy.
    state.scan = null;
    return results;
  } finally {
    state.busy = false;
  }
}
