import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env, isProd } from "./env";

const COOKIE = "karya_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type SessionPayload = { userId: string; orgId: string | null; v: number };

function secret() {
  return new TextEncoder().encode(env().AUTH_SECRET);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

export async function readSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.userId !== "string") return null;
    return {
      userId: payload.userId,
      orgId: typeof payload.orgId === "string" ? payload.orgId : null,
      v: typeof payload.v === "number" ? payload.v : 1,
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = await signSession(payload);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd(),
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}
