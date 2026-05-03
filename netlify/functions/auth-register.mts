import type { Context } from "@netlify/functions";
import { getDb, ok, err, signToken } from "./_db.mjs";
import bcrypt from "bcryptjs";

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "POST") return err("Method not allowed", 405);

  const { codename, password, avatar_emoji } = await req.json();

  if (!codename || !password) return err("codename and password are required");
  if (codename.length < 3 || codename.length > 30)
    return err("Codename must be 3–30 characters");
  if (password.length < 6) return err("Password must be at least 6 characters");

  const sql = getDb();
  const password_hash = await bcrypt.hash(password, 10);

  try {
    const [user] = await sql`
      INSERT INTO users (codename, password_hash, avatar_emoji)
      VALUES (${codename}, ${password_hash}, ${avatar_emoji ?? "🧠"})
      RETURNING id, codename, avatar_emoji, total_score, created_at
    `;
    // ✅ Issue JWT immediately after register
    const token = await signToken({ user_id: user.id, codename: user.codename });
    return ok({ user, token }, 201);
  } catch (e: any) {
    if (e.code === "23505") return err("Codename already taken", 409);
    throw e;
  }
};