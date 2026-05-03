import type { Context } from "@netlify/functions";
import { getDb, ok, err } from "./_db.mjs";
import bcrypt from "bcryptjs";

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "POST") return err("Method not allowed", 405);

  const { codename, password } = await req.json();
  if (!codename || !password) return err("codename and password are required");

  const sql = getDb();

  const [user] = await sql`
    SELECT id, codename, avatar_emoji, password_hash, total_score, games_played
    FROM users
    WHERE LOWER(codename) = LOWER(${codename})
      AND is_active = TRUE
  `;

  if (!user) return err("Invalid codename or password", 401);

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return err("Invalid codename or password", 401);

  // Update last_seen_at
  await sql`
    UPDATE users SET last_seen_at = NOW() WHERE id = ${user.id}
  `;

  const { password_hash, ...safeUser } = user;
  return ok(safeUser);
};