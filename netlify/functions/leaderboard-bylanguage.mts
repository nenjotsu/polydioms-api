import type { Context } from "@netlify/functions";
import { getDb, ok, err } from "./_db.mjs";

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "GET") return err("Method not allowed", 405);

  const url   = new URL(req.url);
  const lang  = url.searchParams.get("lang") ?? "es";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 100);

  const sql = getDb();

  const rows = await sql`
    SELECT rank, codename, avatar_emoji, lang_score, games_in_language, language_name
    FROM leaderboard_by_language
    WHERE language_name = (
      SELECT name FROM languages WHERE code = ${lang} LIMIT 1
    )
    ORDER BY rank
    LIMIT ${limit}
  `;

  return ok(rows);
};