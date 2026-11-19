/** Tables the dev API exposes, with the columns it is allowed to read or write. */
export const TABLES = {
  users: ['id', 'email', 'created_at', 'updated_at'],
  categories: [
    'id', 'user_id', 'name', 'type', 'icon', 'color', 'is_default', 'client_id', 'created_at', 'updated_at',
  ],
  transactions: [
    'id', 'user_id', 'category_id', 'amount', 'type', 'payment_method', 'payment_source_id',
    'description', 'receipt_url', 'is_ocr_parsed', 'raw_ocr_text', 'date', 'client_id', 'created_at',
    'updated_at', 'synced_at',
  ],
  payment_sources: [
    'id', 'user_id', 'name', 'kind', 'last4', 'client_id', 'created_at', 'updated_at',
  ],
  budgets: ['id', 'user_id', 'category_id', 'monthly_limit', 'month_year', 'created_at', 'updated_at'],
};

export class RestError extends Error {
  constructor(status, message, code = 'PGRST100', details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function assertColumn(table, column) {
  if (!TABLES[table].includes(column)) {
    throw new RestError(400, `Unknown column "${column}" on ${table}`);
  }
  return `"${column}"`;
}

function coerce(value) {
  if (value === 'null' || value === undefined) return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

/** Translates one PostgREST filter (e.g. `client_id=not.is.null`) into SQL. */
function buildFilter(table, column, expression, params) {
  const [operator, ...rest] = expression.split('.');
  const raw = rest.join('.');
  const col = assertColumn(table, column);

  const push = (value) => {
    params.push(coerce(value));
    return `$${params.length}`;
  };

  switch (operator) {
    case 'eq':
      return `${col} = ${push(raw)}`;
    case 'neq':
      return `${col} <> ${push(raw)}`;
    case 'gt':
      return `${col} > ${push(raw)}`;
    case 'gte':
      return `${col} >= ${push(raw)}`;
    case 'lt':
      return `${col} < ${push(raw)}`;
    case 'lte':
      return `${col} <= ${push(raw)}`;
    case 'like':
      return `${col} like ${push(raw.replaceAll('*', '%'))}`;
    case 'ilike':
      return `${col} ilike ${push(raw.replaceAll('*', '%'))}`;
    case 'is':
      if (raw === 'null') return `${col} is null`;
      if (raw === 'true' || raw === 'false') return `${col} is ${raw}`;
      throw new RestError(400, `Unsupported is.${raw} filter`);
    case 'not': {
      const [innerOperator, innerValue] = raw.split(/\.(.*)/s);
      if (innerOperator === 'is' && innerValue === 'null') return `${col} is not null`;
      throw new RestError(400, `Unsupported not.${raw} filter`);
    }
    default:
      throw new RestError(400, `Unsupported operator "${operator}"`);
  }
}

export function buildWhere(table, filters, params) {
  const clauses = [];
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      for (const entry of value) clauses.push(buildFilter(table, key, entry, params));
    } else {
      clauses.push(buildFilter(table, key, value, params));
    }
  }
  return clauses.length ? `where ${clauses.join(' and ')}` : '';
}

export function buildSelect(table, selectParam) {
  if (!selectParam || selectParam === '*') {
    return '*';
  }
  const columns = selectParam.split(',').map((entry) => entry.trim()).filter(Boolean);
  for (const column of columns) {
    if (column.includes('(') || column.includes(':')) {
      throw new RestError(400, `Embedded selects are not supported by the dev backend (${column})`);
    }
    assertColumn(table, column);
  }
  return columns.map((column) => `"${column}"`).join(', ');
}

export function buildOrder(table, orderParam) {
  if (!orderParam) {
    return '';
  }
  const parts = orderParam.split(',').map((entry) => {
    const [column, ...modifiers] = entry.split('.');
    const direction = modifiers.includes('asc') ? 'asc' : 'desc';
    const nulls = modifiers.find((m) => m === 'nullsfirst' || m === 'nullslast');
    const nullsSql = nulls === 'nullsfirst' ? ' nulls first' : nulls === 'nullslast' ? ' nulls last' : '';
    return `${assertColumn(table, column)} ${direction}${nullsSql}`;
  });
  return `order by ${parts.join(', ')}`;
}

export function buildPagination(limit, offset, params) {
  const clauses = [];
  if (limit) {
    params.push(Number(limit));
    clauses.push(`limit $${params.length}`);
  }
  if (offset) {
    params.push(Number(offset));
    clauses.push(`offset $${params.length}`);
  }
  return clauses.join(' ');
}

/** `insert ... on conflict ...` mirroring what supabase-js sends for upserts. */
export function buildInsert(table, rows, { onConflict, ignoreDuplicates }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new RestError(400, 'Expected a non-empty JSON array body');
  }

  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  for (const column of columns) assertColumn(table, column);

  const params = [];
  const values = rows.map((row) => {
    const placeholders = columns.map((column) => {
      params.push(row[column] === undefined ? null : row[column]);
      return `$${params.length}`;
    });
    return `(${placeholders.join(', ')})`;
  });

  const columnList = columns.map((column) => `"${column}"`).join(', ');
  let sql = `insert into public."${table}" (${columnList}) values ${values.join(', ')}`;

  if (onConflict) {
    const conflictColumns = onConflict.split(',').map((column) => column.trim());
    conflictColumns.forEach((column) => assertColumn(table, column));
    sql += ` on conflict (${conflictColumns.map((column) => `"${column}"`).join(', ')})`;
    const updates = columns
      .filter((column) => !conflictColumns.includes(column))
      .map((column) => `"${column}" = excluded."${column}"`);
    sql += ignoreDuplicates || updates.length === 0 ? ' do nothing' : ` do update set ${updates.join(', ')}`;
  }

  return { sql: `${sql} returning *`, params };
}

export function buildUpdate(table, patch, filters) {
  const columns = Object.keys(patch ?? {});
  if (columns.length === 0) {
    throw new RestError(400, 'Empty update body');
  }

  const params = [];
  const assignments = columns.map((column) => {
    assertColumn(table, column);
    params.push(coerce(patch[column]));
    return `"${column}" = $${params.length}`;
  });

  const where = buildWhere(table, filters, params);
  return { sql: `update public."${table}" set ${assignments.join(', ')} ${where} returning *`, params };
}

export function buildDelete(table, filters) {
  const params = [];
  const where = buildWhere(table, filters, params);
  return { sql: `delete from public."${table}" ${where} returning *`, params };
}
