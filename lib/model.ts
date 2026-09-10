export const categories = [
  "Папки",
  "Фото",
  "Видео",
  "Разработка",
  "Документы",
  "Архивы",
  "Другое",
] as const;
export type Category = (typeof categories)[number];
export type Entry = {
  path: string;
  name: string;
  bytes: number;
  logical: number;
  files: number;
  kind: "directory" | "file" | "symlink";
  category: Category;
  dev: number;
  ino: number;
  mtime: number;
  children: Entry[];
  omitted: number;
  partial: boolean;
};
export type Scan = {
  id: string;
  root: string;
  status: "running" | "complete" | "cancelled" | "error";
  visited: number;
  current: string;
  errors: number;
  warnings: string[];
  tree: Entry | null;
  groups?: Entry[];
  started: number;
  message?: string;
};
export function size(n: number) {
  if (n < 1024) return `${n} Б`;
  const units = ["КиБ", "МиБ", "ГиБ", "ТиБ"];
  let x = n / 1024,
    i = 0;
  while (x >= 1024 && i < 3) {
    x /= 1024;
    i++;
  }
  return `${x.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ${units[i]}`;
}
export function classify(name: string): Category {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (/^(jpg|jpeg|png|heic|gif|webp|raw|svg)$/.test(ext)) return "Фото";
  if (/^(mp4|mov|mkv|avi|webm)$/.test(ext)) return "Видео";
  if (/^(js|ts|tsx|jsx|java|py|go|rs|class|o|so|a)$/.test(ext))
    return "Разработка";
  if (/^(pdf|docx?|xlsx?|txt|md|csv|pptx?)$/.test(ext)) return "Документы";
  if (/^(zip|tar|gz|dmg|iso|7z|rar)$/.test(ext)) return "Архивы";
  return "Другое";
}
export function findEntry(node: Entry | null, path: string): Entry | undefined {
  if (!node) return;
  if (node.path === path) return node;
  for (const child of node.children) {
    const found = findEntry(child, path);
    if (found) return found;
  }
}
