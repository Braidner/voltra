import path from "node:path";
import os from "node:os";
export function inside(candidate: string, root: string) {
  return candidate === root || candidate.startsWith(root + path.sep);
}
export function canTrash(
  candidate: string,
  cwd = process.cwd(),
  home = os.homedir(),
): boolean {
  const p = path.resolve(candidate);
  // Only personal content is mutable; system/volume structure remains inspectable.
  if (!inside(p, home) || p === home) return false;
  const protectedPaths = [
    cwd,
    path.join(home, ".Trash"),
    path.join(home, ".ssh"),
    path.join(home, ".gnupg"),
    path.join(home, ".codex"),
    path.join(home, "Library"),
  ];
  if (protectedPaths.some((root) => inside(p, root) || inside(root, p)))
    return false;
  return true;
}
export function validateSelection(paths: string[]) {
  if (paths.length === 0 || paths.length > 100)
    throw new Error("Выберите от 1 до 100 объектов");
  if (new Set(paths).size !== paths.length)
    throw new Error("Повторяющиеся пути");
  for (const p of paths)
    for (const q of paths)
      if (p !== q && inside(p, q))
        throw new Error("Папка и её содержимое выбраны одновременно");
}
