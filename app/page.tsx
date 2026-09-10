"use client";
import { useEffect, useState, useRef } from "react";
import { Entry, Scan, size, Category } from "@/lib/model";
import { tileWeight } from "@/lib/tiles";
type Node = Entry & { deletable?: boolean };
const tones: Record<Category, string> = {
  Папки: "folder",
  Фото: "photo",
  Видео: "video",
  Разработка: "dev",
  Документы: "doc",
  Архивы: "archive",
  Другое: "other",
};
async function request(body?: object, path?: string, expand = false) {
  const r = await fetch(
    "/api/disk" +
      (path
        ? "?path=" + encodeURIComponent(path) + (expand ? "&expand=1" : "")
        : ""),
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Запрос отклонён");
  return data;
}
function Tiles({
  nodes,
  onSelect,
  onOpen,
  readable,
  selected,
  level = 0,
}: {
  nodes: Entry[];
  onSelect: (n: Entry) => void;
  onOpen: (path: string) => void;
  readable: boolean;
  selected: string;
  level?: number;
}) {
  const list = nodes.filter((n) => n.bytes > 0).slice(0, level ? 6 : 36);
  if (!list.length)
    return <div className="empty">В этой папке нет отображаемых данных.</div>;
  const largest = Math.max(...list.map((n) => n.bytes));
  const weight = (n: Entry) => tileWeight(n.bytes, largest, readable);
  function partition(items: Entry[], horizontal: boolean): React.ReactNode {
    if (items.length === 1) {
      const n = items[0];
      return (
        <div
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (n.kind === "directory" && !n.path.startsWith("category:"))
              onOpen(n.path);
          }}
          className={`tile ${tones[n.category]} tone-${nodes.indexOf(n) % 5} ${selected === n.path ? "selected" : ""}`}
        >
          <button
            className="tile-label"
            title={`${n.path} · ${size(n.bytes)}`}
            onClick={() => onSelect(n)}
          >
            <b>{n.name}</b>
            <span>
              {size(n.bytes)}
              {n.partial ? " · частично" : ""}
            </span>
          </button>
          {!level && n.children.length > 0 && (
            <div className="nested">
              <Tiles
                nodes={n.children}
                selected={selected}
                onSelect={onSelect}
                onOpen={onOpen}
                readable={readable}
                level={1}
              />
            </div>
          )}
        </div>
      );
    }
    const total = items.reduce((s, n) => s + weight(n), 0);
    let split = 1,
      left = weight(items[0]);
    while (split < items.length - 1 && left < total / 2) {
      left += weight(items[split++]);
    }
    return (
      <div
        className="partition"
        style={{ flexDirection: horizontal ? "row" : "column" }}
      >
        <div style={{ flex: left }}>
          {partition(items.slice(0, split), !horizontal)}
        </div>
        <div style={{ flex: total - left }}>
          {partition(items.slice(split), !horizontal)}
        </div>
      </div>
    );
  }
  return <div className="tiles">{partition(list, true)}</div>;
}
export default function Home() {
  const [scan, setScan] = useState<Scan | null>(null),
    [cap, setCap] = useState({ total: 0, free: 0 }),
    [root, setRoot] = useState("/"),
    [view, setView] = useState<Node | null>(null),
    [selected, setSelected] = useState<Node | null>(null),
    [mode, setMode] = useState<"root" | "type">("root"),
    [queue, setQueue] = useState<Node[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [notice, setNotice] = useState(""),
    [filter, setFilter] = useState("");
  const [category, setCategory] = useState("");
  const [readable, setReadable] = useState(true);
  const [loadingFolder, setLoadingFolder] = useState("");
  const navigation = useRef(0);
  const running = scan?.status === "running";
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (confirm) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [confirm]);
  useEffect(() => {
    let stopped = false;
    async function refresh() {
      try {
        const d = await request();
        if (stopped) return;
        setCap(d.capacity);
        setScan(d.scan);
        if (d.scan?.tree)
          setView((v) => (!v || v.path === d.scan.root ? d.scan.tree : v));
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
    }
    void refresh();
    const timer = setInterval(refresh, 1800);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);
  async function start(p = root) {
    setBusy(true);
    setError("");
    try {
      await request({ action: "scan", root: p });
      setRoot(p);
      setView(null);
      setSelected(null);
      setQueue([]);
      setNotice("");
      const d = await request();
      setScan(d.scan);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function inspect(n: Entry) {
    const ticket = ++navigation.current;
    setError("");
    try {
      const result = await request(undefined, n.path);
      if (ticket === navigation.current) setSelected(result);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function open(p: string) {
    const ticket = ++navigation.current;
    setLoadingFolder(p);
    setError("");
    try {
      const n = await request(undefined, p, true);
      if (ticket !== navigation.current) return;
      setView(n);
      setSelected(null);
      setFilter("");
    } catch (e) {
      if (ticket === navigation.current) setError((e as Error).message);
    } finally {
      if (ticket === navigation.current) setLoadingFolder("");
    }
  }
  function add() {
    if (!selected || !selected.deletable) return;
    setQueue((q) =>
      [
        ...q.filter(
          (n) =>
            !n.path.startsWith(selected.path + "/") && n.path !== selected.path,
        ),
        selected,
      ].filter(
        (n, _, all) =>
          !all.some(
            (o) => o.path !== n.path && n.path.startsWith(o.path + "/"),
          ),
      ),
    );
    setNotice("Добавлено в список очистки");
  }
  async function remove() {
    setBusy(true);
    setError("");
    try {
      const d = await request({
        action: "trash",
        paths: queue.map((n) => n.path),
        scanId: scan?.id,
      });
      const ok = d.results.filter((r: { ok: boolean }) => r.ok).length;
      setNotice(
        `В Корзину перенесено: ${ok} из ${d.results.length}. Место освободится после очистки Корзины в macOS.`,
      );
      const failures = d.results.filter((r: { ok: boolean }) => !r.ok);
      if (failures.length)
        setError(
          failures
            .map(
              (r: { path: string; error: string }) => r.path + ": " + r.error,
            )
            .join("\n"),
        );
      setQueue([]);
      setScan(null);
      setView(null);
      setSelected(null);
      setConfirm(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  let nodes = (view?.children || []).filter((n) =>
    n.name.toLowerCase().includes(filter.toLowerCase()),
  );
  if (mode === "type") {
    nodes = category
      ? scan?.groups?.find((g) => g.name === category)?.children || []
      : scan?.groups || [];
    nodes = nodes.filter((n) =>
      n.name.toLowerCase().includes(filter.toLowerCase()),
    );
  }
  function choose(n: Entry) {
    if (n.path.startsWith("category:")) {
      setFilter("");
      setCategory(n.name);
      return;
    }
    void inspect(n);
  }
  const queueBytes = queue.reduce((s, n) => s + n.bytes, 0);
  const crumbs =
    view?.path
      .slice(scan?.root === "/" ? 1 : scan?.root.length || 0)
      .split("/")
      .filter(Boolean) || [];
  const rows =
    mode === "type"
      ? category
        ? nodes
        : (scan?.groups || [])
            .flatMap((g) => g.children)
            .sort((a, b) => b.bytes - a.bytes)
      : view?.children || [];
  return (
    <main>
      <header>
        <div className="brand">
          <i aria-hidden="true">▦</i> Voltra
        </div>
        <span className="local">На этом Mac</span>
        <div className="capacity">
          <div>
            <span>{size(Math.max(0, cap.total - cap.free))} занято</span>
            <b>Свободно {size(cap.free)}</b>
          </div>
          <meter
            value={cap.total - cap.free}
            max={cap.total || 1}
            aria-label="Занятое место"
          />
        </div>
        <button disabled={busy || running} onClick={() => start()}>
          ↻ Обновить
        </button>
      </header>
      <div className="toolbar">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void start();
          }}
        >
          <label htmlFor="root">Папка или корень диска</label>
          <div>
            <input
              id="root"
              value={root}
              onChange={(e) => setRoot(e.target.value)}
              spellCheck={false}
            />
            <button className="primary" disabled={busy || running}>
              Сканировать
            </button>
          </div>
        </form>
        <div className="view-controls">
          <div className="segmented" aria-label="Группировка">
            <button
              aria-pressed={mode === "root"}
              onClick={() => setMode("root")}
            >
              От корня /
            </button>
            <button
              aria-pressed={mode === "type"}
              onClick={() => setMode("type")}
            >
              По типам
            </button>
          </div>
          <div className="segmented" aria-label="Масштаб плиток">
            <button aria-pressed={readable} onClick={() => setReadable(true)}>
              Читаемые плитки
            </button>
            <button aria-pressed={!readable} onClick={() => setReadable(false)}>
              Точная площадь
            </button>
          </div>
        </div>
      </div>
      {error && (
        <div className="message error" role="alert">
          {error}
          <button onClick={() => setError("")} aria-label="Закрыть ошибку">
            ×
          </button>
        </div>
      )}
      {notice && (
        <div className="message" role="status">
          {notice}
        </div>
      )}
      {scan && (
        <div className="scan-state" role="status">
          <span className={running ? "pulse" : ""} />
          <b>
            {running
              ? "Сканирование"
              : scan.status === "complete"
                ? "Сканирование завершено"
                : scan.status === "cancelled"
                  ? "Сканирование остановлено"
                  : "Ошибка сканирования"}
          </b>
          <span>
            {scan.visited.toLocaleString("ru-RU")} объектов · {scan.errors}{" "}
            недоступно
          </span>
          {running && (
            <>
              <span className="current">{scan.current}</span>
              <button
                onClick={() =>
                  request({ action: "cancel" }).catch((e) =>
                    setError(e.message),
                  )
                }
              >
                Остановить
              </button>
            </>
          )}
          {scan.message && <span>{scan.message}</span>}
        </div>
      )}
      <div className="workspace">
        <section className="map-area">
          <nav className="breadcrumbs" aria-label="Путь">
            <button
              onClick={() => {
                setCategory("");
                if (scan) void open(scan.root);
              }}
            >
              {scan?.root === "/" ? "/" : scan?.root || "Macintosh HD"}
            </button>
            {mode === "type" && <span>› {category || "Все типы"}</span>}
            {mode === "root" &&
              crumbs.map((c, i) => (
                <span key={i}>
                  ›{" "}
                  <button
                    onClick={() =>
                      open(
                        (scan?.root === "/" ? "" : scan?.root) +
                          "/" +
                          crumbs.slice(0, i + 1).join("/"),
                      )
                    }
                  >
                    {c}
                  </button>
                </span>
              ))}
            <input
              aria-label="Фильтр по имени"
              placeholder="Найти в этой папке"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </nav>
          <div className="map-canvas">
            {loadingFolder ? (
              <div className="welcome" role="status">
                <h2>Загружаю содержимое папки…</h2>
                <p>{loadingFolder}</p>
                <small>Общий обзор диска и список очистки сохраняются.</small>
              </div>
            ) : view ? (
              <Tiles
                nodes={nodes}
                selected={selected?.path || ""}
                onSelect={choose}
                onOpen={(p) => void open(p)}
                readable={readable}
              />
            ) : (
              <div className="welcome">
                <div className="welcome-mark" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <h1>Посмотрите, где живут ваши файлы</h1>
                <p>
                  Начните с корня диска или отдельной папки. Карта покажет
                  объекты пропорционально занятому месту.
                </p>
                <button
                  className="primary"
                  disabled={busy || running}
                  onClick={() => start("/")}
                >
                  {running ? "Читаю файловую систему…" : "Сканировать диск"}
                </button>
                <small>
                  Чтение метаданных. Содержимое файлов остаётся на Mac.
                </small>
              </div>
            )}
          </div>
          <div className="map-caption">
            <span>
              {readable
                ? "Мелкие плитки увеличены для удобства · размеры в подписях точные"
                : "Площадь = выделенные блоки"}{" "}
              · двойной клик открывает папку
            </span>
            {view && (
              <span>
                {size(view.bytes)}
                {view.partial ? " · результат частичный" : ""}
              </span>
            )}
          </div>
          {mode === "type" && (
            <p className="hint">
              Типы файлов по всему сканированию. Размер категории учитывает все
              прочитанные файлы; внутри показаны до 80 крупнейших. Нажмите
              корень в пути, чтобы вернуться ко всем категориям.
            </p>
          )}
          {view && (
            <>
              <div className="list-heading">
                <h2>
                  {mode === "type"
                    ? "Крупнейшие файлы"
                    : "Объекты в этой папке"}
                </h2>
                <span>
                  {view.omitted
                    ? `Показаны крупнейшие; ещё ${view.omitted} скрыто`
                    : `${view.children.length} объектов`}
                </span>
              </div>
              <div className="file-list">
                {rows
                  .filter((n) =>
                    n.name.toLowerCase().includes(filter.toLowerCase()),
                  )
                  .slice(0, 80)
                  .map((n) => (
                    <div className="file-row" key={n.path}>
                      <button
                        onClick={() => inspect(n)}
                        onDoubleClick={() => {
                          if (n.kind === "directory") void open(n.path);
                        }}
                      >
                        <span className={`dot ${tones[n.category]}`} />
                        <span>{n.name}</span>
                      </button>
                      <span>{size(n.bytes)}</span>
                      {n.kind === "directory" ? (
                        <button
                          onClick={() => open(n.path)}
                          aria-label={`Открыть ${n.name}`}
                        >
                          Открыть →
                        </button>
                      ) : (
                        <span className="kind">
                          {n.kind === "symlink" ? "Ссылка" : n.category}
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            </>
          )}
        </section>
        <aside>
          <h2>Выбранный объект</h2>
          {selected ? (
            <>
              <div className="object-icon" aria-hidden="true">
                {selected.kind === "directory" ? "▰" : "▤"}
              </div>
              <h3>{selected.name}</h3>
              <p className="path">{selected.path}</p>
              <dl>
                <div>
                  <dt>На диске</dt>
                  <dd>{size(selected.bytes)}</dd>
                </div>
                <div>
                  <dt>Логический размер</dt>
                  <dd>{size(selected.logical)}</dd>
                </div>
                <div>
                  <dt>Файлов</dt>
                  <dd>{selected.files.toLocaleString("ru-RU")}</dd>
                </div>
                <div>
                  <dt>Изменён</dt>
                  <dd>
                    {new Date(selected.mtime).toLocaleDateString("ru-RU")}
                  </dd>
                </div>
              </dl>
              {selected.kind === "directory" && (
                <button className="wide" onClick={() => open(selected.path)}>
                  Открыть папку на карте →
                </button>
              )}
              <button
                className="primary wide"
                onClick={add}
                disabled={
                  !selected.deletable || running || selected.kind === "symlink"
                }
              >
                ＋ В список очистки
              </button>
              {!selected.deletable && (
                <p className="hint">
                  Защищённая область: доступен просмотр. Очистка разрешена для
                  личных файлов вне Library, ключей и рабочей папки.
                </p>
              )}
              {selected.omitted > 0 && (
                <button
                  className="wide"
                  disabled={running}
                  onClick={() => start(selected.path)}
                >
                  Пересканировать отдельно
                </button>
              )}
            </>
          ) : (
            <div className="aside-empty">
              <span>↖</span>
              <p>Выберите прямоугольник на карте или строку в списке.</p>
              <small>Здесь появятся путь, размер и действия.</small>
            </div>
          )}
          {scan && scan.errors > 0 && (
            <details>
              <summary>Недоступные каталоги ({scan.errors})</summary>
              <p className="hint">
                Сканирование продолжено. macOS может требовать «Полный доступ к
                диску» для приложения, запустившего сервер.
              </p>
              {scan.warnings.map((w) => (
                <p className="path" key={w}>
                  {w}
                </p>
              ))}
            </details>
          )}
        </aside>
      </div>
      <footer>
        <div>
          <b>
            Список очистки <span>{queue.length}</span>
          </b>
          <p>
            {queue.length
              ? `${size(queueBytes)} выбрано`
              : "Выбирайте только знакомые ненужные файлы"}
          </p>
        </div>
        <div className="queue">
          {queue.map((n) => (
            <button
              key={n.path}
              onClick={() =>
                setQueue((q) => q.filter((x) => x.path !== n.path))
              }
              title={n.path}
            >
              {n.name} · {size(n.bytes)} ×
            </button>
          ))}
        </div>
        <button
          className="primary"
          disabled={!queue.length || running || busy}
          onClick={() => setConfirm(true)}
        >
          В Корзину →
        </button>
      </footer>
      <dialog
        ref={dialogRef}
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setConfirm(false);
        }}
        aria-labelledby="confirm-title"
        className="dialog"
      >
        <h2 id="confirm-title">Переместить в Корзину?</h2>
        <p>
          {queue.length} объектов · {size(queueBytes)}. Восстановление доступно
          из Корзины macOS. Свободное место не увеличится до её очистки.
        </p>
        <ul>
          {queue.map((n) => (
            <li key={n.path}>{n.path}</li>
          ))}
        </ul>
        <div>
          <button autoFocus disabled={busy} onClick={() => setConfirm(false)}>
            Отмена
          </button>
          <button className="primary" disabled={busy} onClick={remove}>
            {busy ? "Перемещение…" : "Подтверждаю перенос"}
          </button>
        </div>
      </dialog>
    </main>
  );
}
