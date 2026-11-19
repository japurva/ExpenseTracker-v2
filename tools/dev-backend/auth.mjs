import { createHmac, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

const SECRET = process.env.DEV_JWT_SECRET ?? 'dev-only-jwt-secret-change-me';
const TOKEN_TTL_SECONDS = 60 * 60 * 8;

const base64url = (value) => Buffer.from(value).toString('base64url');

export function hashPassword(password) {
  const salt = randomUUID().replaceAll('-', '');
  const hash = scryptSync(password, salt, 32).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt:')) {
    return false;
  }
  const [, salt, hash] = stored.split(':');
  const candidate = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function sign(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

export function signAccessToken(user) {
  const now = Math.floor(Date.now() / 1000);
  return sign({
    sub: user.id,
    email: user.email,
    role: 'authenticated',
    aud: 'authenticated',
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
    session_id: randomUUID(),
  });
}

export function signRefreshToken(user) {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: user.id, typ: 'refresh', iat: now, exp: now + 60 * 60 * 24 * 30 });
}

export function verifyToken(token) {
  if (!token) {
    return null;
  }
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) {
    return null;
  }
  const expected = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
  if (expected !== signature) {
    return null;
  }
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (claims.exp && claims.exp * 1000 < Date.now()) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}

export function publicUser(user) {
  return {
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    email_confirmed_at: user.email_confirmed_at ?? new Date().toISOString(),
    created_at: user.created_at,
    updated_at: user.updated_at ?? user.created_at,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
  };
}

export function sessionPayload(user) {
  return {
    access_token: signAccessToken(user),
    token_type: 'bearer',
    expires_in: TOKEN_TTL_SECONDS,
    expires_at: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    refresh_token: signRefreshToken(user),
    user: publicUser(user),
  };
}
