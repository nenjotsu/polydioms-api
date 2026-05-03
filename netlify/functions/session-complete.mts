import type { Context } from "@netlify/functions";
import { getDb, ok, err } from "./_db.mjs";

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "POST") return err("Method not allowed", 405);

  const { session_id, time_taken_secs } = await req.json();
  if (!session_id) return err("session_id is required");

  const sql = getDb();

  // Finalize session
  const [session] = await sql`
    UPDATE game_sessions
    SET completed_at    = NOW(),
        time_taken_secs = ${time_taken_secs ?? null}
    WHERE id = ${session_id} AND completed_at IS NULL
    RETURNING user_id, score, correct_answers, total_questions
  `;
  if (!session) return err("Session not found or already completed", 404);

  // Update user's cumulative total_score and games_played
  await sql`
    UPDATE users
    SET total_score  = total_score + ${session.score},
        games_played = games_played + 1,
        last_seen_at = NOW()
    WHERE id = ${session.user_id}
  `;

  // Refresh leaderboard materialized views
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_alltime`;
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_by_language`;

  return ok(session);
};