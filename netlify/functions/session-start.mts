import type { Context } from "@netlify/functions";
import { getDb, ok, err } from "./_db.mjs";

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "POST") return err("Method not allowed", 405);

  const { user_id, language_id, difficulty, total_questions } = await req.json();
  if (!user_id || !language_id) return err("user_id and language_id are required");

  const sql = getDb();

  const [session] = await sql`
    INSERT INTO game_sessions (user_id, language_id, difficulty, total_questions)
    VALUES (
      ${user_id},
      ${language_id},
      ${difficulty ?? null},
      ${total_questions ?? 10}
    )
    RETURNING id, started_at, total_questions
  `;

  return ok(session, 201);
};