/**
 * Regex receipt parser — pure, dependency-free, and platform-agnostic so it can
 * be unit tested under Node as well as run in Hermes.
 */

export interface ParsedReceipt {
  merchant: string | null;
  amount: number | null;
  currency: string | null;
  /** `YYYY-MM-DD`, or null when no plausible date was found. */
  date: string | null;
  suggestedCategory: string | null;
  /** 0..1 heuristic score for how much of the receipt was understood. */
  confidence: number;
  rawText: string;
  warnings: string[];
}

const CURRENCY_BY_SYMBOL: Record<string, string> = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '₹': 'INR',
  '¥': 'JPY',
};

const CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD', 'SGD', 'AED', 'CHF'];

const MONEY_REGEX = new RegExp(
  `(?:(${CURRENCY_CODES.join('|')}|[$€£₹¥])\\s*)?` +
    `(\\d{1,3}(?:[.,\\s]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)` +
    `(?:\\s*(${CURRENCY_CODES.join('|')}))?`,
  'gi',
);

/**
 * Matches the date patterns the parser understands. Amount candidates that
 * overlap a date are discarded so "12 Aug 2026" never becomes a total.
 */
/** Real month names only — a loose `[A-Za-z]+` swallows amounts like "SUMME 1.450,00". */
const MONTH_PATTERN =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const DATE_PATTERNS: readonly RegExp[] = [
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/g,
  new RegExp(`\\b\\d{1,2}[\\s\\-/.]?${MONTH_PATTERN}[\\s,\\-/.]+(\\d{2,4})\\b`, 'gi'),
  new RegExp(`\\b${MONTH_PATTERN}[\\s\\-/.]\\d{1,2}[\\s,\\-/.]+(\\d{2,4})\\b`, 'gi'),
];

function dateSpans(line: string): Array<readonly [number, number]> {
  const spans: Array<readonly [number, number]> = [];
  for (const pattern of DATE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) !== null) {
      spans.push([match.index, match.index + match[0].length] as const);
      if (match[0].length === 0) {
        pattern.lastIndex += 1;
      }
    }
  }
  return spans;
}

const HAS_DECIMALS = /\d[.,]\d{1,2}$/;
const SUBTOTAL_OR_TAX = /(subtotal|sub\s*total|\btax\b|\bvat\b|\bgst\b|\bcash\b|\bchange\b|discount|rounding)/i;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const MERCHANT_NOISE =
  /(receipt|invoice|tax\s*invoice|order\s*(no|#)|cashier|terminal|server|table|tel\b|phone|www\.|https?:|thank\s*you|gst|vat\b|bill\s*no|date\b|time\b)/i;

const CATEGORY_KEYWORDS: ReadonlyArray<{ category: string; keywords: readonly string[] }> = [
  {
    category: 'Food',
    keywords: [
      'starbucks', 'cafe', 'café', 'coffee', 'restaurant', 'pizzeria', 'pizza', 'burger', 'mcdonald',
      'kfc', 'subway', 'bakery', 'deli', 'grill', 'kitchen', 'bistro', 'bar ', 'diner', 'food',
      'domino', 'sushi', 'noodle', 'tea house',
    ],
  },
  {
    category: 'Transport',
    keywords: [
      'uber', 'lyft', 'ola', 'taxi', 'cab', 'fuel', 'petrol', 'diesel', 'gas station', 'shell',
      'chevron', 'parking', 'metro', 'transit', 'toll', 'airline', 'flight', 'railway',
    ],
  },
  {
    category: 'Shopping',
    keywords: [
      'amazon', 'walmart', 'target', 'costco', 'ikea', 'mall', 'mart', 'store', 'shop', 'boutique',
      'ebay', 'flipkart', 'myntra', 'decathlon', 'apparel',
    ],
  },
  {
    category: 'Bills',
    keywords: [
      'electric', 'electricity', 'water bill', 'gas bill', 'internet', 'broadband', 'utility',
      'insurance', 'subscription', 'netflix', 'spotify', 'mobile', 'telecom', 'recharge',
    ],
  },
  {
    category: 'Rent',
    keywords: ['rent', 'lease', 'landlord', 'property', 'maintenance charge', 'apartment'],
  },
  {
    category: 'Salary',
    keywords: ['salary', 'payroll', 'payslip', 'stipend'],
  },
];

interface MoneyCandidate {
  amount: number;
  currency: string | null;
  priority: number;
  lineIndex: number;
  position: number;
}

function normalizeCurrency(token: string | undefined): string | null {
  if (!token) {
    return null;
  }
  const upper = token.toUpperCase();
  return CURRENCY_BY_SYMBOL[token] ?? (CURRENCY_CODES.includes(upper) ? upper : null);
}

function parseAmount(raw: string): number | null {
  let value = raw.replace(/\s/g, '');
  const hasComma = value.includes(',');
  const hasDot = value.includes('.');

  if (hasComma && hasDot) {
    value =
      value.lastIndexOf(',') > value.lastIndexOf('.')
        ? value.replace(/\./g, '').replace(',', '.')
        : value.replace(/,/g, '');
  } else if (hasComma) {
    const decimals = value.split(',').pop() ?? '';
    value = decimals.length === 3 ? value.replace(/,/g, '') : value.replace(',', '.');
  }

  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) ? amount : null;
}

function totalPriority(line: string): number {
  if (/(grand\s*total|total\s*due|amount\s*due|balance\s*due|total\s*amount)/i.test(line)) {
    return 3;
  }
  if (/\btotal\b/i.test(line) && !/subtotal/i.test(line)) {
    return 2;
  }
  // Common non-English total labels so EU/JP receipts still resolve.
  if (/(summe|gesamt|betrag|montant|importe|totale|totaal|合計)/i.test(line)) {
    return 2;
  }
  if (/(\bamount\b|\bsum\b)/i.test(line) && !/subtotal/i.test(line)) {
    return 1;
  }
  return 0;
}

function extractCandidates(lines: readonly string[]): MoneyCandidate[] {
  const candidates: MoneyCandidate[] = [];

  lines.forEach((line, lineIndex) => {
    const priority = totalPriority(line);
    const spans = dateSpans(line);
    MONEY_REGEX.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = MONEY_REGEX.exec(line)) !== null) {
      const [full, prefix, digits, suffix] = match;
      const amount = parseAmount(digits);
      if (amount === null) {
        continue;
      }

      const start = match.index;
      const end = start + full.length;
      if (spans.some(([spanStart, spanEnd]) => start < spanEnd && end > spanStart)) {
        continue;
      }

      const currency = normalizeCurrency(prefix) ?? normalizeCurrency(suffix);
      const looksLikeQuantity = !currency && !HAS_DECIMALS.test(digits) && amount < 100;

      // Bare small integers next to quantities ("2 x 3.50") are noise unless the
      // line is explicitly a total, and 0 never is.
      if (amount <= 0 || (looksLikeQuantity && priority === 0)) {
        continue;
      }

      candidates.push({
        amount,
        currency,
        priority,
        lineIndex,
        position: match.index + full.length,
      });
    }
  });

  return candidates;
}

function pickAmount(candidates: readonly MoneyCandidate[]): MoneyCandidate | null {
  if (candidates.length === 0) {
    return null;
  }

  const scored = [...candidates].sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    if (a.lineIndex !== b.lineIndex) {
      return b.lineIndex - a.lineIndex;
    }
    return b.position - a.position;
  });

  if (scored[0].priority > 0) {
    return scored[0];
  }

  // No labelled total: the largest amount on the receipt is the best guess.
  return scored.reduce((best, candidate) => (candidate.amount > best.amount ? candidate : best));
}

function buildIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  const maxYear = new Date().getFullYear() + 1;
  if (year < 2000 || year > maxYear) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function expandYear(value: number): number {
  return value < 100 ? 2000 + value : value;
}

function parseDate(lines: readonly string[], currency: string | null): string | null {
  const text = lines.join('\n');

  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) {
    const parsed = buildIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (parsed) {
      return parsed;
    }
  }

  const dayMonthName = new RegExp(
    `\\b(\\d{1,2})[\\s\\-/.](${MONTH_PATTERN})[\\s,\\-/.]+(\\d{2,4})\\b`,
    'i',
  ).exec(text);
  if (dayMonthName) {
    const month = MONTHS[dayMonthName[2].toLowerCase()];
    if (month) {
      const parsed = buildIsoDate(expandYear(Number(dayMonthName[3])), month, Number(dayMonthName[1]));
      if (parsed) {
        return parsed;
      }
    }
  }

  const monthNameDay = new RegExp(
    `\\b(${MONTH_PATTERN})[\\s\\-/.]?(\\d{1,2})[\\s,\\-/.]+(\\d{2,4})\\b`,
    'i',
  ).exec(text);
  if (monthNameDay) {
    const month = MONTHS[monthNameDay[1].toLowerCase()];
    if (month) {
      const parsed = buildIsoDate(expandYear(Number(monthNameDay[3])), month, Number(monthNameDay[2]));
      if (parsed) {
        return parsed;
      }
    }
  }

  const numeric = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/.exec(text);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const year = expandYear(Number(numeric[3]));

    // 13/02 can only be day/month; 02/13 only month/day. Otherwise follow the
    // currency's convention (USD receipts are month-first).
    const dayFirst = first > 12 ? true : second > 12 ? false : currency !== 'USD';
    const parsed = dayFirst
      ? buildIsoDate(year, second, first)
      : buildIsoDate(year, first, second);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function extractMerchant(lines: readonly string[]): string | null {
  for (const line of lines.slice(0, 6)) {
    const cleaned = line
      .replace(/[^A-Za-z0-9\s&'.,#-]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s.,-]+|[\s.,-]+$/g, '')
      .trim();

    if (cleaned.length < 2 || cleaned.length > 48) {
      continue;
    }

    const letters = (cleaned.match(/[A-Za-z]/g) ?? []).length;
    const digits = (cleaned.match(/\d/g) ?? []).length;
    if (letters < 2 || digits > letters) {
      continue;
    }
    if (MERCHANT_NOISE.test(cleaned) || SUBTOTAL_OR_TAX.test(cleaned) || HAS_DECIMALS.test(cleaned)) {
      continue;
    }

    return cleaned;
  }

  return null;
}

function suggestCategory(haystack: string): string | null {
  const normalized = haystack.toLowerCase();
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return category;
    }
  }
  return null;
}

function detectCurrency(lines: readonly string[]): string | null {
  for (const line of lines) {
    const match = /([$€£₹¥])|\b(USD|EUR|GBP|INR|JPY|CAD|AUD|SGD|AED|CHF)\b/i.exec(line);
    if (match) {
      return normalizeCurrency(match[1] ?? match[2]);
    }
  }
  return null;
}

export function parseReceiptText(text: string): ParsedReceipt {
  const rawText = text ?? '';
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const warnings: string[] = [];
  if (lines.length === 0) {
    return {
      merchant: null,
      amount: null,
      currency: null,
      date: null,
      suggestedCategory: null,
      confidence: 0,
      rawText,
      warnings: ['No text recognized in the image.'],
    };
  }

  const pickedAmount = pickAmount(extractCandidates(lines));
  const amount = pickedAmount ? Math.round(pickedAmount.amount * 100) / 100 : null;
  const normalizedCurrency = pickedAmount?.currency ?? detectCurrency(lines);

  const date = parseDate(lines, normalizedCurrency);
  const merchant = extractMerchant(lines);
  const suggestedCategory = suggestCategory(`${merchant ?? ''}\n${rawText}`);

  if (amount === null) warnings.push('Total amount not found.');
  if (date === null) warnings.push('Date not found.');
  if (merchant === null) warnings.push('Merchant name not detected.');

  const confidence = Math.round(
    ((amount !== null ? 0.45 : 0) +
      (date !== null ? 0.25 : 0) +
      (merchant !== null ? 0.2 : 0) +
      (suggestedCategory !== null ? 0.1 : 0)) *
      100,
  ) / 100;

  return {
    merchant,
    amount,
    currency: normalizedCurrency,
    date,
    suggestedCategory,
    confidence,
    rawText,
    warnings,
  };
}
