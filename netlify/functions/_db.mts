import { neon } from '@neondatabase/serverless';
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }
  const sql = neon(process.env.DATABASE_URL);
  if (!sql) {
    throw new Error('Failed to connect to database');
  }
  return sql;
}

export function ok(data: unknown, status = 200) {
  return Response.json({ success: true, data }, { status });
}

export function err(message: string, status = 400) {
  return Response.json({ success: false, error: message }, { status });
}

// ── JWT Helpers ──────────────────────────────────────────────

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

export interface TokenPayload extends JWTPayload {
  user_id: string;
  codename: string;
}

/** Sign a JWT — expires in 7 days */
export async function signToken(payload: TokenPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);
}

/** Verify a JWT from the Authorization header */
export async function verifyToken(req: Request): Promise<TokenPayload | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as TokenPayload;
  } catch {
    return null;
  }
}

/** Middleware guard — returns the payload or a 401 Response */
export async function requireAuth(
  req: Request
): Promise<TokenPayload | Response> {
  const payload = await verifyToken(req);
  if (!payload) return err("Unauthorized — invalid or expired token", 401);
  return payload;
}