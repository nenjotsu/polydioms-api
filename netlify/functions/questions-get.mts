import type { Context } from "@netlify/functions";
import { getDb, ok, err } from "./_db.mjs";

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "GET") return err("Method not allowed", 405);

  const url = new URL(req.url);
  const lang = url.searchParams.get("lang") ?? "es";
  const difficulty = url.searchParams.get("difficulty");
  const count = Math.min(Number(url.searchParams.get("count") ?? 10), 20);

  const sql = getDb();

  const questions = await sql`
    SELECT
      q.id          AS question_id,
      q.question_type,
      q.prompt_text,
      i.original_text,
      i.transliteration,
      i.english_meaning,
      i.difficulty,
      l.code        AS language_code,
      JSON_AGG(
        JSON_BUILD_OBJECT(
          'id',         ac.id,
          'choice_text', ac.choice_text,
          'is_correct',  ac.is_correct
        ) ORDER BY RANDOM()
      ) AS choices
    FROM questions q
    JOIN idioms i    ON i.id = q.idiom_id
    JOIN languages l ON l.id = i.language_id
    JOIN answer_choices ac ON ac.question_id = q.id
    WHERE q.is_active = TRUE
      AND i.is_active = TRUE
      AND l.code = ${lang}
      ${difficulty ? sql`AND i.difficulty = ${Number(difficulty)}` : sql``}
    GROUP BY q.id, i.id, l.code
    ORDER BY RANDOM()
    LIMIT ${count}
  `;

  return ok(questions);
};