import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { TITLE, SUBTITLE, GUIDE, PARTS, ITEMS, ANSWERS, GROUPS, norm, grade } from "../../lib/unit1.mjs";

type Settings = { open: boolean; showScore: boolean; practice: boolean };
type Rec = {
  num: string; name: string; at: string; score: number; right: number; total: number;
  wrong: number[]; answers: string[][]; marks: boolean[];
};

const TOTAL = ANSWERS.length;
const store = () => getStore({ name: "unit1-exam", consistency: "strong" });
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const cleanNum = (n: unknown) => String(n ?? "").replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "").slice(0, 3);
const cleanName = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 20);
const subKey = (num: string) => `subs/${num.padStart(3, "0")}`;
const nameKey = (name: string) => `names/${norm(name)}`;
const mainAns = (i: number) => ANSWERS[i].split("|")[0];

async function settings(): Promise<Settings> {
  const s = (await store().get("config", { type: "json" })) as Partial<Settings> | null;
  return { open: s?.open ?? true, showScore: s?.showScore ?? true, practice: s?.practice ?? true };
}
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

export default async (req: Request) => {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  try {
    if (req.method === "GET" && path === "/api/unit1/exam") {
      const s = await settings();
      return json({ title: TITLE, subtitle: SUBTITLE, guide: GUIDE, total: TOTAL, open: s.open, parts: PARTS, items: ITEMS });
    }
    if (req.method === "GET" && path === "/api/unit1/practice") {
      const s = await settings();
      if (!s.practice) return json({ ok: false, msg: "지금은 연습을 할 수 없어요. 시험이 끝나면 다시 열려요." });
      return json({ ok: true, answers: ANSWERS, groups: GROUPS });
    }

    if (req.method !== "POST") return json({ ok: false, msg: "잘못된 요청이에요." }, 405);
    const body = await req.json().catch(() => ({}));

    if (path === "/api/unit1/check") {
      const s = await settings();
      if (!s.open) return json({ ok: false, msg: "지금은 시험을 볼 수 없어요. 선생님께 여쭤 보세요." });
      const num = cleanNum(body.num), name = cleanName(body.name);
      if (!num || !name) return json({ ok: false, msg: "번호와 이름을 모두 써 주세요." });
      if (await taken(num, name)) return json({ ok: false, msg: "이미 시험을 제출한 번호 또는 이름이에요. 다시 봐야 한다면 선생님께 말씀드려요." });
      return json({ ok: true });
    }

    if (path === "/api/unit1/submit") {
      const s = await settings();
      if (!s.open) return json({ ok: false, msg: "시험이 닫혀서 제출할 수 없어요. 선생님께 말씀드려요." });
      const num = cleanNum(body.num), name = cleanName(body.name);
      if (!num || !name) return json({ ok: false, msg: "번호와 이름이 없어요." });
      const raw: unknown[] = Array.isArray(body.answers) ? body.answers : [];
      const vals = ANSWERS.map((_, i) => String(raw[i] ?? "").slice(0, 40));
      const marks = grade(vals);
      const right = marks.filter(Boolean).length;
      const rec: Rec = {
        num, name, at: new Date().toISOString(), score: right, right, total: TOTAL,
        wrong: marks.map((m, i) => (m ? 0 : i + 1)).filter(Boolean), answers: vals.map((v) => [v]), marks,
      };
      const st = store();
      const n = await st.setJSON(nameKey(name), { num }, { onlyIfNew: true });
      if (!n.modified) return json({ ok: false, msg: "이미 제출된 이름이에요. 선생님께 말씀드려요." });
      const r = await st.setJSON(subKey(num), rec, { onlyIfNew: true });
      if (!r.modified) {
        await st.delete(nameKey(name));
        return json({ ok: false, msg: "이미 제출된 번호예요. 선생님께 말씀드려요." });
      }
      return json({ ok: true, show: s.showScore, score: right, right, total: TOTAL });
    }

    if (path === "/api/unit1/admin") {
      const real = Netlify.env.get("TEACHER_PASSWORD") ?? "";
      if (!samePassword(String(body.pw ?? ""), real)) return json({ ok: false, msg: "비밀번호가 맞지 않아요." }, 401);
      const st = store();
      if (body.action === "config") {
        const cur = await settings();
        const next: Settings = {
          open: typeof body.open === "boolean" ? body.open : cur.open,
          showScore: typeof body.showScore === "boolean" ? body.showScore : cur.showScore,
          practice: typeof body.practice === "boolean" ? body.practice : cur.practice,
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
      const { blobs } = await st.list({ prefix: "subs/" });
      const recs = (await Promise.all(blobs.map((b) => st.get(b.key, { type: "json" })))).filter(Boolean) as Rec[];
      recs.sort((a, b) => Number(a.num) - Number(b.num));
      return json({
        ok: true, settings: await settings(), title: TITLE,
        q: ANSWERS.map((_, i) => ({ q: `${i + 1}번 빈칸`, ans: mainAns(i) })), results: recs,
      });
    }
    return json({ ok: false, msg: "없는 주소예요." }, 404);
  } catch (err) {
    console.error(err);
    return json({ ok: false, msg: "서버에 잠깐 문제가 생겼어요. 다시 해 보세요." }, 500);
  }
};

export const config: Config = {
  path: ["/api/unit1/exam", "/api/unit1/practice", "/api/unit1/check", "/api/unit1/submit", "/api/unit1/admin"],
};
