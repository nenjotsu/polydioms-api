import { neon } from '@neondatabase/serverless';
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

// ── CORS ─────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  "https://nenjotsu.github.io",   // ← your GitHub Pages domain
  "http://localhost:3000",            // ← local dev
  "http://localhost:5173",            // ← Vite dev server
];

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin":      allowed,
    "Access-Control-Allow-Methods":     "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":     "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age":           "86400", // preflight cache: 24h
  };
}

/** Handles OPTIONS preflight — call at the top of every function */
export function handlePreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(req),
    });
  }
  return null;
}


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

export function ok(req: Request, data: unknown, status = 200) {
  return Response.json(
    { success: true, data },
    { status, headers: getCorsHeaders(req) }
  );
}

export function err(req: Request, message: string, status = 400) {
  return Response.json(
    { success: false, error: message },
    { status, headers: getCorsHeaders(req) }
  );
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
  if (!payload) return err(req, "Unauthorized — invalid or expired token", 401);
  return payload;
}