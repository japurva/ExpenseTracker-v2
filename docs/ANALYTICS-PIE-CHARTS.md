# Analytics — Expense Pie Charts (Category & Payment Source)

**Status:** Implemented  
**Owner:** Frontend  
**Target:** Add two pie charts — expenses by **category** and expenses by **payment source** — each re-rendering when the user changes the time scope (month / year / custom range).

---

## 1. Goals

| # | Goal |
|---|------|
| 1 | Show a pie chart of expenses grouped by **category** for the selected time range. |
| 2 | Show a pie chart of expenses grouped by **payment source** for the selected time range. |
| 3 | Let the user pick a time scope: **single month**, **single year**, or **custom date range**. |
| 4 | Both charts react instantly to scope changes using the same filtered transaction set. |
| 5 | Keep native + web parity (Victory Native XL / Skia on mobile, Recharts on web). |

---

## 2. Scope (in / out)

### In scope
- New `DateRangeSelector` component (month / year / custom).
- New `ExpenseCategoryPie` component.
- New `ExpensePaymentSourcePie` component.
- New analytics utility functions: `filterByRange`, `groupExpensesByCategory`, `groupExpensesByPaymentSource`.
- Wire the charts into the existing **Dashboard** screen (or a dedicated `/analytics` route).
- Shared filtered-transaction hook so both charts (and future charts) use one source of truth.

### Out of scope (this iteration)
- Drill-down from a pie slice to a transaction list (Phase 2).
- Saving custom ranges as presets.
- Pie charts on the Budgets or Transactions screens.
- Animated slice transitions (Victory's default animation is acceptable).


---

## 3. Data Model

### Inputs
Transactions come from `expenseStore` (`state.transactions`). Each row has:
```ts
{
  id, amount, type: 'income' | 'expense' | 'transfer',
  categoryId: string | null,
  date: string,           // ISO timestamp
  paymentSourceId: string | null,
  paymentMethod: PaymentSourceKind | null,
  ...
}
```
Categories and payment sources are also in the store (`state.categories`, `state.paymentSources`) for name/color/icon lookups.

### Filtering (time range)
| Scope | Filter rule |
|-------|-------------|
| **Month** | `monthKey(transaction.date) === selectedMonth` (`YYYY-MM`) |
| **Year** | `yearKey(transaction.date) === selectedYear` (`YYYY`) |
| **Custom** | `from <= transaction.date <= to` (inclusive, local date boundaries) |

Only `type === 'expense'` rows are counted. Transfers and income are excluded.

### Grouping outputs

---

## 4. Components

### 4.1 `DateRangeSelector` (new)
File: `src/components/analytics/date-range-selector.tsx`

Segmented-control toggle with three modes:
```
[ Month  |  Year  |  Custom ]
```
- **Month** — month picker (left/right arrows + `YYYY-MM` label). Reuses `shiftMonth` / `monthTitle` from `@/utils/analytics`.
- **Year** — year picker (left/right arrows + `YYYY` label). Uses `yearKey` from `@/lib/dates`.
- **Custom** — two `DateField` inputs (`from`, `to`) with validation (`from <= to`).

Emits `onRangeChange(range: DateRange)`:
```ts
type DateRange = { kind: 'month'; value: string }   // YYYY-MM
             | { kind: 'year'; value: string }      // YYYY
             | { kind: 'custom'; from: string; to: string }; // YYYY-MM-DD
```

### 4.2 `ExpenseCategoryPie` (new)
File: `src/components/analytics/expense-category-pie.tsx`
Props:
```ts
interface ExpenseCategoryPieProps {
  slices: Slice[];        // pre-computed, sorted descending by value
  total: number;          // sum of all slices (for "Other" aggregation)
  height?: number;
  onPressSlice?: (slice: Slice) => void;
}
```
Aggregates tiny slices (< 3% of total) into an "Other" slice. Shows a legend below with colour swatches + label + amount + % of total. Web uses **Recharts** `<Pie>` with one `<Cell>` per slice; native uses **Victory Native** `<PolarChart>` + `<Pie.Chart>`. In-chart labels are omitted on both platforms — the legend carries the label, amount and percentage.

### 4.3 `ExpensePaymentSourcePie` (new)
File: `src/components/analytics/expense-payment-source-pie.tsx`
Same shape as `ExpenseCategoryPie`, but groups by `paymentSourceId` / `paymentMethod`. Falls back to `paymentMethod` label when `paymentSourceId` is null (e.g. "Cash", "UPI").

### 4.4 `AnalyticsPieCharts` container (new)

---

## 5. Utils (new / extended)
File: `src/utils/analytics.ts` (extend existing)

```ts
export function filterByRange(
  transactions: readonly Transaction[],
  range: DateRange,
): Transaction[];

export interface ExpenseSlice {
  id: string;
  label: string;
  value: number;
  color: string;
  icon?: string;
}

export function groupExpensesByCategory(
  transactions: readonly Transaction[],
  categories: readonly Category[],
): { slices: ExpenseSlice[]; total: number };


---

## 6. State & Data Flow

```
expenseStore.transactions ─────────────────────┐
                                               ▼
DateRangeSelector.state (range) ────────────► filterByRange() ────────► filtered[]
                                               │                         │
                                               ▼                         ▼
                                    groupExpensesByCategory()  ◄──────┐
                                    groupExpensesByPaymentSource() ◄─┘
                                               │
                                               ▼
                                    AnalyticsPieCharts renders both pies
```
- `filtered[]` is memoised per `(transactions, range)`.
- Both pie charts consume the same `filtered[]` so a single range change updates both simultaneously.
- Range lives in local React state inside `AnalyticsPieCharts` (or lifted to the dashboard if the dashboard's month switcher should also control the pies).

---

---

## 8. Files to Create / Modify

| File | Action |
|------|--------|
| `src/components/analytics/date-range-selector.tsx` | Create |
| `src/components/analytics/expense-category-pie.tsx` | Create |
| `src/components/analytics/expense-payment-source-pie.tsx` | Create |
| `src/components/analytics/analytics-pie-charts.tsx` | Create |
| `src/components/analytics/index.ts` | Create (barrel exports) |
| `src/utils/analytics.ts` | Extend: `filterByRange`, `groupExpensesByCategory`, `groupExpensesByPaymentSource`, `ExpenseSlice` |
| `src/constants/payment-options.ts` | Extend: `PAYMENT_SOURCE_COLORS` |
| `src/app/(main)/(tabs)/dashboard.tsx` | Modify: embed `AnalyticsPieCharts` (Option A) |
| `docs/PROJECT-SUMMARY.md` | Update: feature status + stack table (charts section) |
| `docs/README.md` | Optionally add entry to doc index |

## 7. Route / Placement
**Option A (recommended):** Add to the existing **Dashboard** screen below the current bar chart. The dashboard already has a month switcher; the pie charts can reuse or sit beside it.
**Option B:** New route `/analytics` under `(main)/(tabs)` with its own tab entry.
Plan assumes **Option A** (dashboard extension) to minimize routing changes.

---

## 9. Charting Library Notes

| Platform | Library | Component |
|----------|---------|-----------|
| Native (iOS/Android) | `victory-native` ^42.0.1 (already installed) | `<PolarChart>` + `<Pie.Chart>` via Victory XL + Skia |
| Web | `recharts` ^3.10.1 (already installed) | `<PieChart>` + `<Pie>` + `<Cell>` |

Both are already dependencies (confirmed in `package.json` and `PROJECT-SUMMARY.md`). No new packages needed.

Native note: `victory-native` v42 exports `PolarChart` and `Pie` only — there is no `<Pie>` or `<PieChart>` entry point. `PolarChart` requires `data` / `labelKey` / `valueKey` / `colorKey` and measures its **parent** via `onLayout`, so that parent must have a concrete width/height (`flex: 1` inside a `FlashList` header measures 0 and renders nothing). `Pie.Label` only draws when given a loaded Skia font, so the charts label through the RN legend instead.

export function groupExpensesByPaymentSource(
  transactions: readonly Transaction[],
  paymentSources: readonly PaymentSource[],
): { slices: ExpenseSlice[]; total: number };
```
Color palette: reuse `CATEGORY_COLORS` from `@/constants/category-options` for category slices; define `PAYMENT_SOURCE_COLORS` in `@/constants/payment-options` for source slices.
File: `src/components/analytics/analytics-pie-charts.tsx`
Holds range state, computes filtered transactions, derives both slice arrays, and renders the two pie charts side-by-side (stacked on narrow screens).
```ts
interface Slice {
  id: string;              // categoryId or paymentSourceId
  label: string;           // display name (e.g. "Food", "Chase Visa")

---

## 10. Implementation Steps (Phase 1)

1. **Utils** — add `filterByRange`, `groupExpensesByCategory`, `groupExpensesByPaymentSource` to `src/utils/analytics.ts`.
2. **Constants** — add `PAYMENT_SOURCE_COLORS` to `src/constants/payment-options.ts`.
3. **Range selector** — create `date-range-selector.tsx` with month/year/custom modes.
4. **Pie components** — create `expense-category-pie.tsx` and `expense-payment-source-pie.tsx` with native + web variants.
5. **Container** — create `analytics-pie-charts.tsx` wiring range state → filters → both pies.
6. **Dashboard integration** — embed container below the existing bar chart in `dashboard.tsx`.
7. **Verify** — `tsc --noEmit`, `expo lint`, `expo start --clear`; visually check both pies update on range change.

  value: number;           // summed expense amount
  color: string;           // slice fill colour
  icon?: string;           // category icon (category chart only)
}
```

---

## 11. Validation Checklist

- [ ] `npx tsc --noEmit` passes.
- [ ] `npx expo lint` introduces no new errors.
- [ ] `npx expo start --clear` launches without crash.
- [ ] Pie charts render on iOS/Android dev client and web.
- [ ] Switching Month → Year → Custom updates both pies.
- [ ] Custom range with `from > to` is blocked / shows empty state.
- [ ] Empty state shown when no expenses exist in range.
- [ ] Category pie colours match category icons/colours from store.
- [ ] Payment source pie shows source name (or `paymentMethod` fallback when `paymentSourceId` is null).

---

## 12. Out-of-Scope Ideas (Phase 2+)

- Tap a slice → drill down to transactions in that category/source for the range.
- Save custom ranges as named presets ("Last 30 days", "This year").
- Donut hole in centre showing total (`- $1,240.50`).
- Export pie data as PNG/CSV.
- Compare two ranges side-by-side (current vs previous period).