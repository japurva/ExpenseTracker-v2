import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.env.DEV_PG_DATA ?? '.dev/pgdata');
const LOG_FILE = path.resolve(process.env.DEV_PG_LOG ?? '.dev/postgres.log');

export const PG_PORT = Number(process.env.DEV_PG_PORT ?? 5433);
export const DB_NAME = process.env.DEV_DB_NAME ?? 'expense_dev';
export const DB_USER = 'postgres';

const BIN_CANDIDATES = [
  process.env.PGBIN,
  'C:\\Program Files\\PostgreSQL\\18\\bin',
  'C:\\Program Files\\PostgreSQL\\17\\bin',
  'C:\\Program Files\\PostgreSQL\\16\\bin',
  '/usr/lib/postgresql/18/bin',
  '/usr/local/pgsql/bin',
].filter(Boolean);

export function findPgBin() {
  const exe = process.platform === 'win32' ? 'postgres.exe' : 'postgres';
  for (const dir of BIN_CANDIDATES) {
    if (existsSync(path.join(dir, exe))) {
      return dir;
    }
  }
  throw new Error(
    'PostgreSQL binaries not found. Set PGBIN to the bin directory (e.g. C:\\Program Files\\PostgreSQL\\18\\bin).',
  );
}

function run(bin, args, stdio = 'pipe') {
  return execFileSync(path.join(findPgBin(), bin), args, { stdio, encoding: 'utf8' });
}

export function connectionString() {
  return `postgresql://${DB_USER}@127.0.0.1:${PG_PORT}/${DB_NAME}`;
}

export function adminConnectionString() {
  return `postgresql://${DB_USER}@127.0.0.1:${PG_PORT}/postgres`;
}

function isRunning() {
  try {
    run('pg_ctl', ['-D', DATA_DIR, 'status'], 'ignore');
    return true;
  } catch {
    return false;
  }
}

/** Creates a throwaway cluster (trust auth, port 5433) — never touches the system service on 5432. */
export function ensureCluster() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(path.dirname(DATA_DIR), { recursive: true });
    console.log(`[dev-db] creating cluster in ${path.relative(process.cwd(), DATA_DIR)}`);
    run('initdb', ['-D', DATA_DIR, '-U', DB_USER, '--auth=trust', '--encoding=UTF8']);
  }

  if (isRunning()) {
    console.log(`[dev-db] already running on port ${PG_PORT}`);
    return;
  }

  console.log(`[dev-db] starting postgres on port ${PG_PORT}`);
  // `stdio: 'ignore'` matters: the postmaster inherits the handles, so a piped
  // pg_ctl would never return on Windows.
  run('pg_ctl', ['-D', DATA_DIR, '-l', LOG_FILE, '-o', `-p ${PG_PORT}`, '-w', 'start'], 'ignore');
}
