import type { Context } from "@netlify/functions";
import { getDb, ok, err } from "./_db.mjs";

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "GET") return err("Method not allowed", 405);

  const url = new URL(req.url);
  const lang = url.searchParams.get("lang");
  const difficulty = url.searchParams.get("difficulty");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 100);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  const sql = getDb();

  const idioms = await sql`
    SELECT
      i.id, i.slug, i.original_text, i.transliteration,
      i.literal_translation, i.english_meaning, i.difficulty,
      l.code AS language_code, l.name AS language_name,
      COALESCE(
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'example_text', e.example_text,
            'example_translation', e.example_translation
          ) ORDER BY e.sort_order
        ) FILTER (WHERE e.id IS NOT NULL),
        '[]'
      ) AS examples
    FROM idioms i
    JOIN languages l ON l.id = i.language_id
    LEFT JOIN idiom_examples e ON e.idiom_id = i.id
    WHERE i.is_active = TRUE
      ${lang ? sql`AND l.code = ${lang}` : sql``}
      ${difficulty ? sql`AND i.difficulty = ${Number(difficulty)}` : sql``}
    GROUP BY i.id, l.code, l.name
    ORDER BY i.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return ok(idioms);
};