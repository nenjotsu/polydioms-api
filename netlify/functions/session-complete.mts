import type { Context } from "@netlify/functions";
import { getDb, ok, err, requireAuth, handlePreflight } from "./_db.mjs";

export default async (req: Request, _ctx: Context) => {
  const preflight = handlePreflight(req);       // ✅ step 1
  if (preflight) return preflight;
  
  if (req.method !== "POST") return err(req, "Method not allowed", 405);

  // 🔒 Guard
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { session_id, score, correct } = await req.json();
  if (!session_id) return err(req, "session_id is required");

  const sql = getDb();

  const [session] = await sql`
    UPDATE game_sessions
    SET completed_at    = NOW(),
        time_taken_secs = EXTRACT(EPOCH FROM (NOW() - game_sessions.started_at)),
        score          = ${score},
        correct_answers = ${correct}
    WHERE id = ${session_id}
      AND user_id = ${auth.user_id}      -- ← ownership check
    RETURNING user_id, score, correct_answers, total_questions
  `;
  if (!session) return err(req, "Session not found or already completed", 404);

  await sql`
    UPDATE users
    SET total_score  = total_score + ${session.score},
        games_played = games_played + 1,
        last_seen_at = NOW()
    WHERE id = ${session.user_id}
  `;

  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_alltime`;
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_by_language`;

  return ok(req, session);
};