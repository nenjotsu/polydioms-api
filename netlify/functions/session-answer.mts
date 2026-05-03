import type { Context } from "@netlify/functions";
import { getDb, ok, err, requireAuth } from "./_db.mjs";

const POINTS = { correct: 10, wrong: 0 };

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "POST") return err("Method not allowed", 405);

  // 🔒 Guard
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { session_id, question_id, chosen_choice_id } = await req.json();
  if (!session_id || !question_id || !chosen_choice_id)
    return err("session_id, question_id, chosen_choice_id are required");

  const sql = getDb();

  // Verify the session belongs to the authenticated user
  const [session] = await sql`
    SELECT id FROM game_sessions
    WHERE id = ${session_id} AND user_id = ${auth.user_id}
  `;
  if (!session) return err("Session not found or access denied", 403);

  const [choice] = await sql`
    SELECT is_correct FROM answer_choices
    WHERE id = ${chosen_choice_id} AND question_id = ${question_id}
  `;
  if (!choice) return err("Invalid choice", 404);

  const is_correct     = choice.is_correct;
  const points_awarded = is_correct ? POINTS.correct : POINTS.wrong;

  const [answer] = await sql`
    INSERT INTO session_answers
      (session_id, question_id, chosen_choice_id, is_correct, points_awarded)
    VALUES
      (${session_id}, ${question_id}, ${chosen_choice_id}, ${is_correct}, ${points_awarded})
    RETURNING id, is_correct, points_awarded
  `;

  await sql`
    UPDATE game_sessions
    SET score           = score + ${points_awarded},
        correct_answers = correct_answers + ${is_correct ? 1 : 0}
    WHERE id = ${session_id}
  `;

  const [correctChoice] = await sql`
    SELECT id, choice_text FROM answer_choices
    WHERE question_id = ${question_id} AND is_correct = TRUE
  `;

  return ok({ ...answer, correct_choice: correctChoice });
};