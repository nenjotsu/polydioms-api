import type { Context } from "@netlify/functions";
import { getDb, ok, err, handlePreflight } from "./_db.mjs";

export default async (req: Request, _ctx: Context) => {
  const preflight = handlePreflight(req);       // ✅ step 1
  if (preflight) return preflight;

  if (req.method !== "GET") return err(req, "Method not allowed", 405);

  const url = new URL(req.url);
  const lang = url.searchParams.get("lang") ?? "es";
  const difficulty = url.searchParams.get("difficulty");
  const count = Math.min(Number(url.searchParams.get("count") ?? 10), 20);

  const sql = getDb();

  const questions = await sql`
    SELECT
      i.id AS idiom_id,

      i.original_text,
      i.literal_translation,
      i.english_meaning,
      i.difficulty,

      trim(l.code) AS language_code,
      l.name AS language_name,
      (
        SELECT json_agg(w.english_meaning)
        FROM (
          SELECT english_meaning
          FROM public.idioms
          WHERE language_id = i.language_id
            AND id != i.id
            AND is_active = TRUE
          ORDER BY RANDOM()
          LIMIT 3
        ) w
      ) AS wrong_answers

    FROM public.idioms i
    JOIN public.languages l ON l.id = i.language_id
    WHERE i.is_active = TRUE
      AND l.code = ${lang}
      ${difficulty ? sql`AND i.difficulty = ${Number(difficulty)}` : sql``}
    ORDER BY RANDOM()
    LIMIT ${count}
  `;

  return ok(req, questions);
};