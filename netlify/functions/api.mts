import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { TITLE, SEC, Q } from "../../lib/questions.mjs";

type Item = { s: number; q: string; a: string | string[]; l?: string[]; u?: number };
type Settings = { open: boolean; showScore: boolean };
type Rec = {
  num: string; name: string; at: string; score: number; right: number; total: number;
  wrong: number[]; answers: string[][]; marks: boolean[];
};

const QS = Q as Item[];
const store = () => getStore({ name: "joseon-exam", consistency: "strong" });

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const norm = (s: unknown) =>
  String(s ?? "").replace(/[\s「」『』“”"'.,()\[\]·!?~\-]/g, "").toLowerCase();
const cleanNum = (n: unknown) => String(n ?? "").replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "").slice(0, 3);
const cleanName = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 20);
const blanksOf = (q: Item) => (Array.isArray(q.a) ? q.a : [q.a]);
const mainAns = (q: Item) => blanksOf(q).map((b) => b.split("|")[0]);

function judge(q: Item, vals: string[]): boolean {
  const blanks = blanksOf(q).map((b) => b.split("|").map(norm));
  const v = vals.map(norm);
  if (v.length !== blanks.length || v.some((x) => !x)) return false;
  if (q.u) {
    const left = blanks.slice();
    return v.every((x) => {
      const k = left.findIndex((alts) => alts.includes(x));
      if (k < 0) return false;
      left.splice(k, 1);
      return true;
    });
  }
  return v.every((x, k) => blanks[k].includes(x));
}

async function settings(): Promise<Settings> {
  const s = (await store().get("config", { type: "json" })) as Settings | null;
  return { open: s?.open ?? true, showScore: s?.showScore ?? true };
}

const subKey = (num: string) => `subs/${num.padStart(3, "0")}`;
const nameKey = (name: string) => `names/${norm(name)}`;

async function taken(num: string, name: string) {
  const st = store();
  const [a, b] = await Promise.all([st.getMetadata(subKey(num)), st.getMetadata(nameKey(name))]);
  return a !== null || b !== null;
}

function samePassword(given: string, real: string) {
  if (!real) return false;
  let diff = given.length ^ real.length;
  for (let i = 0; i < Math.max(given.length, real.length); i++) {
    diff |= (given.charCodeAt(i) || 0) ^ (real.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export default async (req: Request, context: Context) => {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  try {
    if (path === "/api/exam" && req.method === "GET") {
      const s = await settings();
      return json({
        title: TITLE, open: s.open, sec: SEC,
        q: QS.map((x) => ({ s: x.s, q: x.q, n: blanksOf(x).length, l: x.l ?? null })),
      });
    }

    if (req.method !== "POST") return json({ ok: false, msg: "잘못된 요청이에요." }, 405);
    const body = await req.json().catch(() => ({}));

    if (path === "/api/check") {
      const s = await settings();
      if (!s.open) return json({ ok: false, msg: "지금은 시험을 볼 수 없어요. 선생님께 여쭤 보세요." });
      const num = cleanNum(body.num), name = cleanName(body.name);
      if (!num || !name) return json({ ok: false, msg: "번호와 이름을 모두 써 주세요." });
      if (await taken(num, name)) {
        return json({ ok: false, msg: "이미 시험을 제출한 번호 또는 이름이에요. 다시 봐야 한다면 선생님께 말씀드려요." });
      }
      return json({ ok: true });
    }

    if (path === "/api/submit") {
      const s = await settings();
      if (!s.open) return json({ ok: false, msg: "시험이 닫혀서 제출할 수 없어요. 선생님께 말씀드려요." });
      const num = cleanNum(body.num), name = cleanName(body.name);
      if (!num || !name) return json({ ok: false, msg: "번호와 이름이 없어요." });
      const raw: unknown[] = Array.isArray(body.answers) ? body.answers : [];
      const answers = QS.map((q, i) => {
        const a = Array.isArray(raw[i]) ? (raw[i] as unknown[]) : [];
        return blanksOf(q).map((_, k) => String(a[k] ?? "").slice(0, 40));
      });
      const marks = QS.map((q, i) => judge(q, answers[i]));
      const right = marks.filter(Boolean).length;
      const rec: Rec = {
        num, name, at: new Date().toISOString(),
        score: Math.round((right / QS.length) * 100), right, total: QS.length,
        wrong: marks.map((m, i) => (m ? 0 : i + 1)).filter(Boolean), answers, marks,
      };
      const st = store();
      const n = await st.setJSON(nameKey(name), { num }, { onlyIfNew: true });
      if (!n.modified) return json({ ok: false, msg: "이미 제출된 이름이에요. 선생님께 말씀드려요." });
      const r = await st.setJSON(subKey(num), rec, { onlyIfNew: true });
      if (!r.modified) {
        await st.delete(nameKey(name));
        return json({ ok: false, msg: "이미 제출된 번호예요. 선생님께 말씀드려요." });
      }
      return json({ ok: true, show: s.showScore, score: rec.score, right, total: QS.length });
    }

    if (path === "/api/admin") {
      const real = Netlify.env.get("TEACHER_PASSWORD") ?? "";
      if (!samePassword(String(body.pw ?? ""), real)) return json({ ok: false, msg: "비밀번호가 맞지 않아요." }, 401);
      const st = store();

      if (body.action === "config") {
        const cur = await settings();
        const next: Settings = {
          open: typeof body.open === "boolean" ? body.open : cur.open,
          showScore: typeof body.showScore === "boolean" ? body.showScore : cur.showScore,
        };
        await st.setJSON("config", next);
        return json({ ok: true, settings: next });
      }

      if (body.action === "delete") {
        const num = cleanNum(body.num);
        const rec = (await st.get(subKey(num), { type: "json" })) as Rec | null;
        if (!rec) return json({ ok: false, msg: "그 번호의 답안이 없어요." });
        await st.delete(subKey(num));
        await st.delete(nameKey(rec.name));
        return json({ ok: true });
      }

      // 기본: 결과 목록
      const { blobs } = await st.list({ prefix: "subs/" });
      const recs = (await Promise.all(blobs.map((b) => st.get(b.key, { type: "json" })))).filter(Boolean) as Rec[];
      recs.sort((a, b) => Number(a.num) - Number(b.num));
      return json({
        ok: true, settings: await settings(), title: TITLE, sec: SEC,
        q: QS.map((x) => ({ s: x.s, q: x.q, ans: mainAns(x).join(", ") })),
        results: recs,
      });
    }

    return json({ ok: false, msg: "없는 주소예요." }, 404);
  } catch (err) {
    console.error(err);
    return json({ ok: false, msg: "서버에 잠깐 문제가 생겼어요. 다시 해 보세요." }, 500);
  }
};

export const config: Config = {
  path: ["/api/exam", "/api/check", "/api/submit", "/api/admin"],
};
