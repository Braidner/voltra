import { NextRequest, NextResponse } from "next/server";
import {
  state,
  capacity,
  startScan,
  snapshot,
  details,
  openDirectory,
  trash,
} from "@/lib/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function local(req: NextRequest) {
  return req.headers.get("host") === "127.0.0.1:4391";
}
export async function GET(req: NextRequest) {
  if (!local(req)) return new Response("Forbidden", { status: 403 });
  try {
    const p = req.nextUrl.searchParams.get("path");
    const res = NextResponse.json(
      p
        ? req.nextUrl.searchParams.get("expand") === "1"
          ? await openDirectory(p)
          : details(p)
        : { capacity: await capacity(), scan: snapshot() },
    );
    res.cookies.set("disk-session", state.secret, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
    });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
export async function POST(req: NextRequest) {
  if (
    !local(req) ||
    req.headers.get("origin") !== "http://127.0.0.1:4391" ||
    req.cookies.get("disk-session")?.value !== state.secret
  )
    return new Response("Forbidden", { status: 403 });
  try {
    const b = await req.json();
    if (b.action === "scan") {
      if (typeof b.root !== "string") throw new Error("Укажите папку");
      await startScan(b.root);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "cancel") {
      state.cancel = true;
      return NextResponse.json({ ok: true });
    }
    if (b.action === "trash") {
      if (
        !Array.isArray(b.paths) ||
        b.paths.some((p: unknown) => typeof p !== "string")
      )
        throw new Error("Некорректный выбор");
      return NextResponse.json({ results: await trash(b.paths, b.scanId) });
    }
    throw new Error("Неизвестное действие");
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
