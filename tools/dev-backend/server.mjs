import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import path from 'node:path';

import pg from 'pg';

import { hashPassword, publicUser, sessionPayload, verifyPassword, verifyToken } from './auth.mjs';
import { adminConnectionString, connectionString, DB_NAME, ensureCluster } from './pg.mjs';
import {
  buildDelete,
  buildInsert,
  buildOrder,
  buildPagination,
  buildSelect,
  buildUpdate,
  buildWhere,
  RestError,
  TABLES,
} from './rest.mjs';

const API_PORT = Number(process.env.DEV_API_PORT ?? 54321);
// Phones on the LAN need a non-loopback bind; set DEV_API_HOST=127.0.0.1 to keep it local.
const API_HOST = process.env.DEV_API_HOST ?? '0.0.0.0';
const DEMO_EMAIL = 'demo@expensetracker.dev';
const DEMO_PASSWORD = 'expense123';
const RESERVED_PARAMS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'apikey']);

// ---------------------------------------------------------------------------
// bootstrap
// ---------------------------------------------------------------------------
async function bootstrapDatabase() {
  ensureCluster();

  const admin = new pg.Client({ connectionString: adminConnectionString() });
  await admin.connect();
  await admin.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
      end if;
    end
    $$;
  `);
  const exists = await admin.query('select 1 from pg_database where datname = $1', [DB_NAME]);
  if (exists.rowCount === 0) {
    await admin.query(`create database "${DB_NAME}"`);
    console.log(`[dev-api] created database ${DB_NAME}`);
  }
  await admin.end();

  const pool = new pg.Pool({ connectionString: connectionString(), max: 4 });

  // PostgREST serialises `date` columns as `YYYY-MM-DD`; node-postgres would
  // otherwise hand back a JS Date and JSON-encode it in the server's timezone.
  pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

  // Supabase-managed pieces the migration expects to exist already.
  await pool.query(`
    create schema if not exists auth;
    create table if not exists auth.users (
      id uuid primary key default gen_random_uuid(),
      email text unique not null,
      encrypted_password text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
  `);

  // Every migration is applied in order and is safe to re-run.
  const migrations = [
    'supabase/migrations/20261024120000_init_expensetracker.sql',
    'supabase/migrations/20261025120000_payment_sources.sql',
  ];
  for (const file of migrations) {
    await pool.query(await readFile(path.resolve(file), 'utf8'));
  }

  const seeded = await pool.query('select 1 from auth.users where email = $1', [DEMO_EMAIL]);
  if (seeded.rowCount === 0) {
    await pool.query('insert into auth.users (email, encrypted_password) values ($1, $2)', [
      DEMO_EMAIL,
      hashPassword(DEMO_PASSWORD),
    ]);
    console.log(`[dev-api] seeded user ${DEMO_EMAIL}`);
  }

  return pool;
}

// ---------------------------------------------------------------------------
// http helpers
// ---------------------------------------------------------------------------
function setCors(res, req) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Echo the browser's requested headers — supabase-js adds schema-profile and
  // retry headers that change between versions.
  const requested = req?.headers['access-control-request-headers'];
  res.setHeader(
    'Access-Control-Allow-Headers',
    typeof requested === 'string' && requested.length > 0
      ? requested
      : [
          'authorization',
          'apikey',
          'content-type',
          'prefer',
          'accept',
          'accept-profile',
          'content-profile',
          'x-client-info',
          'x-supabase-api-version',
          'x-retry-count',
          'x-upsert',
          'range',
          'range-unit',
        ].join(', '),
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'content-range');
}

function sendJson(res, status, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4 * 1024 * 1024) {
      throw new RestError(413, 'Request body too large');
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return undefined;
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function bearerToken(req) {
  const header = req.headers.authorization ?? '';
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null;
}

function isSingleObjectRequest(req) {
  return String(req.headers.accept ?? '').includes('application/vnd.pgrst.object+json');
}

function respondRows(res, rows, single, status = 200) {
  if (single) {
    if (rows.length !== 1) {
      sendJson(res, 406, {
        code: 'PGRST116',
        message: 'JSON object requested, multiple (or no) rows returned',
        details: `Results contain ${rows.length} rows`,
        hint: null,
      });
      return;
    }
    sendJson(res, status, rows[0]);
    return;
  }
  sendJson(res, status, rows);
}

function wantsRepresentation(req) {
  return /return=representation/i.test(String(req.headers.prefer ?? ''));
}

// ---------------------------------------------------------------------------
// auth routes
// ---------------------------------------------------------------------------
async function loadUser(pool, where, value) {
  const result = await pool.query(
    `select id, email, encrypted_password, created_at, updated_at from auth.users where ${where} = $1`,
    [value],
  );
  return result.rows[0] ?? null;
}

async function handleAuth(pool, req, res, url) {
  const route = url.pathname.replace('/auth/v1/', '');

  if (req.method === 'POST' && route === 'signup') {
    const body = await readJson(req);
    const email = String(body?.email ?? '').trim().toLowerCase();
    const password = String(body?.password ?? '');
    if (!email.includes('@') || password.length < 6) {
      sendJson(res, 400, {
        code: 'validation_failed',
        error_code: 'validation_failed',
        msg: 'Enter a valid email and a password of at least 6 characters.',
      });
      return;
    }

    const existing = await loadUser(pool, 'email', email);
    if (existing) {
      sendJson(res, 422, {
        code: 'user_already_exists',
        error_code: 'user_already_exists',
        msg: 'User already registered',
      });
      return;
    }

    const inserted = await pool.query(
      'insert into auth.users (email, encrypted_password) values ($1, $2) returning id, email, created_at, updated_at',
      [email, hashPassword(password)],
    );
    sendJson(res, 200, sessionPayload(inserted.rows[0]));
    return;
  }

  if (req.method === 'POST' && route === 'token') {
    const grantType = url.searchParams.get('grant_type');
    const body = await readJson(req);

    if (grantType === 'password') {
      const email = String(body?.email ?? '').trim().toLowerCase();
      const user = await loadUser(pool, 'email', email);
      if (!user || !verifyPassword(String(body?.password ?? ''), user.encrypted_password)) {
        sendJson(res, 400, {
          error: 'invalid_grant',
          error_description: 'Invalid login credentials',
          code: 'invalid_grant',
          msg: 'Invalid login credentials',
        });
        return;
      }
      sendJson(res, 200, sessionPayload(user));
      return;
    }

    if (grantType === 'refresh_token') {
      const claims = verifyToken(String(body?.refresh_token ?? ''));
      if (!claims || claims.typ !== 'refresh') {
        sendJson(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token', code: 'invalid_grant', msg: 'Invalid Refresh Token' });
        return;
      }
      const user = await loadUser(pool, 'id', claims.sub);
      if (!user) {
        sendJson(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token', code: 'invalid_grant', msg: 'Invalid Refresh Token' });
        return;
      }
      sendJson(res, 200, sessionPayload(user));
      return;
    }

    sendJson(res, 400, { error: 'unsupported_grant_type', msg: `Unsupported grant_type ${grantType}` });
    return;
  }

  if (req.method === 'POST' && route === 'logout') {
    res.writeHead(204).end();
    return;
  }

  if (req.method === 'GET' && route === 'user') {
    const claims = verifyToken(bearerToken(req));
    if (!claims) {
      sendJson(res, 401, { code: 401, msg: 'invalid claim: missing sub claim' });
      return;
    }
    const user = await loadUser(pool, 'id', claims.sub);
    if (!user) {
      sendJson(res, 404, { code: 'user_not_found', msg: 'User not found' });
      return;
    }
    sendJson(res, 200, publicUser(user));
    return;
  }

  sendJson(res, 404, { msg: `Unknown auth route ${route}` });
}

// ---------------------------------------------------------------------------
// rest routes
// ---------------------------------------------------------------------------
function parseFilters(url) {
  const filters = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (RESERVED_PARAMS.has(key)) {
      continue;
    }
    if (filters[key] === undefined) {
      filters[key] = value;
    } else if (Array.isArray(filters[key])) {
      filters[key].push(value);
    } else {
      filters[key] = [filters[key], value];
    }
  }
  return filters;
}

function paginationFrom(url, req) {
  const limit = url.searchParams.get('limit');
  const offset = url.searchParams.get('offset');
  if (limit || offset) {
    return { limit: limit ?? undefined, offset: offset ?? undefined };
  }
  const range = req.headers.range;
  if (typeof range === 'string' && range.includes('-')) {
    const [from, to] = range.split('-').map((value) => Number(value));
    if (Number.isFinite(from) && Number.isFinite(to)) {
      return { limit: to - from + 1, offset: from };
    }
  }
  return {};
}

async function handleRest(pool, req, res, url) {
  const table = url.pathname.replace('/rest/v1/', '').split('/')[0];
  if (!TABLES[table]) {
    throw new RestError(404, `Unknown table "${table}"`);
  }

  const claims = verifyToken(bearerToken(req));
  const filters = parseFilters(url);
  const single = isSingleObjectRequest(req);

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [claims?.sub ?? '']);
    // Enforces the real RLS policies with the caller's identity.
    await client.query('set local role authenticated');

    if (req.method === 'GET') {
      const params = [];
      const select = buildSelect(table, url.searchParams.get('select'));
      const where = buildWhere(table, filters, params);
      const order = buildOrder(table, url.searchParams.get('order'));
      const { limit, offset } = paginationFrom(url, req);
      const pagination = buildPagination(limit, offset, params);
      const sql = `select ${select} from public."${table}" ${where} ${order} ${pagination}`
        .replace(/\s+/g, ' ')
        .trim();
      const result = await client.query(sql, params);
      respondRows(res, result.rows, single);
    } else if (req.method === 'POST') {
      const body = await readJson(req);
      const rows = Array.isArray(body) ? body : [body];
      const { sql, params } = buildInsert(table, rows, {
        onConflict: url.searchParams.get('on_conflict') ?? undefined,
        ignoreDuplicates: /resolution=ignore-duplicates/i.test(String(req.headers.prefer ?? '')),
      });
      const result = await client.query(sql, params);
      if (wantsRepresentation(req)) {
        respondRows(res, result.rows, single, 201);
      } else {
        res.writeHead(201).end();
      }
    } else if (req.method === 'PATCH') {
      const patch = await readJson(req);
      const { sql, params } = buildUpdate(table, patch, filters);
      const result = await client.query(sql, params);
      if (wantsRepresentation(req)) {
        respondRows(res, result.rows, single);
      } else {
        res.writeHead(204).end();
      }
    } else if (req.method === 'DELETE') {
      const { sql, params } = buildDelete(table, filters);
      const result = await client.query(sql, params);
      if (wantsRepresentation(req)) {
        respondRows(res, result.rows, single);
      } else {
        res.writeHead(204).end();
      }
    } else {
      throw new RestError(405, `Method ${req.method} not allowed`);
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// server
// ---------------------------------------------------------------------------
function sendError(res, error) {
  if (error instanceof RestError) {
    sendJson(res, error.status, { message: error.message, code: error.code, details: error.details, hint: null });
    return;
  }
  if (error?.code === '23505') {
    sendJson(res, 409, { message: error.detail ?? 'duplicate key value', code: '23505', details: error.detail, hint: null });
    return;
  }
  if (error?.code === '42501') {
    sendJson(res, 403, { message: error.message, code: '42501', details: null, hint: null });
    return;
  }
  console.error('[dev-api]', error);
  sendJson(res, 500, { message: error?.message ?? 'Internal error', code: 'DEV500', details: null, hint: null });
}

const pool = await bootstrapDatabase();

const server = createServer(async (req, res) => {
  setCors(res, req);
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  try {
    if (url.pathname.startsWith('/auth/v1/')) {
      await handleAuth(pool, req, res, url);
      return;
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      await handleRest(pool, req, res, url);
      return;
    }
    if (url.pathname === '/dev/summary') {
      const counts = await pool.query(`
        select 'categories' as table_name, count(*)::int as rows from public.categories
        union all select 'payment_sources', count(*)::int from public.payment_sources
        union all select 'transactions', count(*)::int from public.transactions
        union all select 'budgets', count(*)::int from public.budgets
        union all select 'users', count(*)::int from public.users
      `);
      sendJson(res, 200, counts.rows);
      return;
    }
    sendJson(res, 404, { message: `No route for ${url.pathname}` });
  } catch (error) {
    sendError(res, error);
  }
});

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address);
}

server.listen(API_PORT, API_HOST, () => {
  console.log('');
  console.log(`  Local Supabase-compatible API  http://127.0.0.1:${API_PORT}`);
  if (API_HOST !== '127.0.0.1') {
    for (const address of lanAddresses()) {
      console.log(`  From a device on your LAN      http://${address}:${API_PORT}`);
    }
  }
  console.log(`  Postgres                       [2m127.0.0.1:5433/${DB_NAME}[0m`);
  console.log(`  Demo user                      ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log('');
  console.log('  .env:');
  console.log(`    EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:${API_PORT}`);
  console.log('    EXPO_PUBLIC_SUPABASE_ANON_KEY=dev-anon-key');
  console.log('');
});
