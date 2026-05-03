import type { Context } from "@netlify/functions";
import { getDb, ok, err, handlePreflight } from "./_db.mjs";

export default async (req: Request, _ctx: Context) => {
  const preflight = handlePreflight(req);       // ✅ step 1
  if (preflight) return preflight;
  
  if (req.method !== "GET") return err(req, "Method not allowed", 405);

  const limit = Math.min(
    Number(new URL(req.url).searchParams.get("limit") ?? 10), 100
  );

  const sql = getDb();

  const rows = await sql`
    SELECT rank, codename, avatar_emoji, total_score, games_played
    FROM leaderboard_alltime
    ORDER BY rank
    LIMIT ${limit}
  `;

  return ok(req, rows);
};