import type { Context } from "@netlify/functions";
import { getDb, ok, err } from "./_db.mjs";

const POINTS = { correct: 10, wrong: 0 };

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "POST") return err("Method not allowed", 405);

  const { session_id, question_id, chosen_choice_id } = await req.json();
  if (!session_id || !question_id || !chosen_choice_id)
    return err("session_id, question_id, chosen_choice_id are required");

  const sql = getDb();

  // Check if the chosen answer is correct
  const [choice] = await sql`
    SELECT is_correct FROM answer_choices
    WHERE id = ${chosen_choice_id} AND question_id = ${question_id}
  `;
  if (!choice) return err("Invalid choice", 404);

  const is_correct    = choice.is_correct;
  const points_awarded = is_correct ? POINTS.correct : POINTS.wrong;

  // Log the answer
  const [answer] = await sql`
    INSERT INTO session_answers
      (session_id, question_id, chosen_choice_id, is_correct, points_awarded)
    VALUES
      (${session_id}, ${question_id}, ${chosen_choice_id}, ${is_correct}, ${points_awarded})
    RETURNING id, is_correct, points_awarded
  `;

  // Update running score in session
  await sql`
    UPDATE game_sessions
    SET score           = score + ${points_awarded},
        correct_answers = correct_answers + ${is_correct ? 1 : 0}
    WHERE id = ${session_id}
  `;

  // Fetch the correct answer to show on card flip
  const [correctChoice] = await sql`
    SELECT id, choice_text FROM answer_choices
    WHERE question_id = ${question_id} AND is_correct = TRUE
  `;

  return ok({ ...answer, correct_choice: correctChoice });
};