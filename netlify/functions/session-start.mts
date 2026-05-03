import type { Context } from "@netlify/functions";
import { getDb, ok, err, requireAuth  } from "./_db.mjs";

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "POST") return err("Method not allowed", 405);

  // 🔒 Guard
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { language_id, difficulty, total_questions } = await req.json();
  if (!language_id) return err("language_id is required");

  const sql = getDb();

  const [session] = await sql`
    INSERT INTO game_sessions (user_id, language_id, difficulty, total_questions)
    VALUES (
      ${auth.user_id},        -- ← taken from token, not request body
      ${language_id},
      ${difficulty ?? null},
      ${total_questions ?? 10}
    )
    RETURNING id, started_at, total_questions
  `;

  return ok(session, 201);
};