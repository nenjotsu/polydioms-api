import type { Context } from "@netlify/functions";
import { getDb, ok, err, signToken } from "./_db.mjs";
import bcrypt from "bcryptjs";

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "POST") return err(req,"Method not allowed", 405);

  const { codename, password } = await req.json();
  if (!codename || !password) return err(req,"codename and password are required");

  const sql = getDb();

  const [user] = await sql`
    SELECT id, codename, avatar_emoji, password_hash, total_score, games_played
    FROM users
    WHERE LOWER(codename) = LOWER(${codename})
      AND is_active = TRUE
  `;

  if (!user) return err(req,"Invalid codename or password", 401);

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return err(req,"Invalid codename or password", 401);

  // Update last_seen_at
  await sql`
    UPDATE users SET last_seen_at = NOW() WHERE id = ${user.id}
  `;

  // ✅ Issue JWT
  const token = await signToken({ user_id: user.id, codename: user.codename });

  const { password_hash, ...safeUser } = user;
  return ok(req, { user: safeUser, token });
};