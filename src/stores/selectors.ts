import { useMemo } from 'react';

import { monthKey } from '@/lib/dates';
import { useExpenseStore } from '@/stores/expenseStore';
import type { Budget, Category, Transaction } from '@/types/models';

export interface MonthSummary {
  month: string;
  income: number;
  expense: number;
  balance: number;
  count: number;
}

export interface CategoryTotal {
  categoryId: string | null;
  name: string;
  color: string | null;
  total: number;
}

export type BudgetHealth = 'ok' | 'warning' | 'danger';

export interface BudgetUsage {
  budget: Budget;
  category: Category | null;
  spent: number;
  remaining: number;
  ratio: number;
  status: BudgetHealth;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function inMonth(transaction: Transaction, month: string): boolean {
  return monthKey(transaction.date) === month;
}

/** Transfers move money between accounts, so they count as neither income nor expense. */
export function computeMonthSummary(
  transactions: readonly Transaction[],
  month: string,
): MonthSummary {
  let income = 0;
  let expense = 0;
  let count = 0;

  for (const transaction of transactions) {
    if (!inMonth(transaction, month)) {
      continue;
    }
    count += 1;
    if (transaction.type === 'income') {
      income += transaction.amount;
    } else if (transaction.type === 'expense') {
      expense += transaction.amount;
    }
  }

  return {
    month,
    income: round2(income),
    expense: round2(expense),
    balance: round2(income - expense),
    count,
  };
}

export function computeCategoryTotals(
  transactions: readonly Transaction[],
  month: string,
  categories: readonly Category[],
): CategoryTotal[] {
  const byCategory = new Map<string | null, number>();

  for (const transaction of transactions) {
    if (transaction.type !== 'expense' || !inMonth(transaction, month)) {
      continue;
    }
    byCategory.set(transaction.categoryId, (byCategory.get(transaction.categoryId) ?? 0) + transaction.amount);
  }

  return [...byCategory.entries()]
    .map(([categoryId, total]) => {
      const category = categories.find((item) => item.id === categoryId) ?? null;
      return {
        categoryId,
        name: category?.name ?? 'Uncategorised',
        color: category?.color ?? null,
        total: round2(total),
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function computeBudgetUsage(
  budgets: readonly Budget[],
  transactions: readonly Transaction[],
  month: string,
  categories: readonly Category[],
): BudgetUsage[] {
  const spentByCategory = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.type !== 'expense' || !transaction.categoryId || !inMonth(transaction, month)) {
      continue;
    }
    spentByCategory.set(
      transaction.categoryId,
      (spentByCategory.get(transaction.categoryId) ?? 0) + transaction.amount,
    );
  }

  return budgets
    .filter((budget) => budget.monthYear.slice(0, 7) === month)
    .map((budget) => {
      const spent = round2(spentByCategory.get(budget.categoryId) ?? 0);
      const ratio = budget.monthlyLimit > 0 ? spent / budget.monthlyLimit : 0;
      const status: BudgetHealth = ratio >= 1 ? 'danger' : ratio >= 0.8 ? 'warning' : 'ok';

      return {
        budget,
        category: categories.find((category) => category.id === budget.categoryId) ?? null,
        spent,
        remaining: round2(Math.max(budget.monthlyLimit - spent, 0)),
        ratio: round2(ratio),
        status,
      };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

export function sortByDateDesc(transactions: readonly Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => b.date.localeCompare(a.date));
}

export function useTransactionsForMonth(month: string): Transaction[] {
  const transactions = useExpenseStore((state) => state.transactions);
  return useMemo(
    () => sortByDateDesc(transactions.filter((transaction) => inMonth(transaction, month))),
    [transactions, month],
  );
}

export function useMonthSummary(month: string): MonthSummary {
  const transactions = useExpenseStore((state) => state.transactions);
  return useMemo(() => computeMonthSummary(transactions, month), [transactions, month]);
}

export function useCategoryTotals(month: string): CategoryTotal[] {
  const transactions = useExpenseStore((state) => state.transactions);
  const categories = useExpenseStore((state) => state.categories);
  return useMemo(
    () => computeCategoryTotals(transactions, month, categories),
    [transactions, month, categories],
  );
}

export function useBudgetUsage(month: string): BudgetUsage[] {
  const transactions = useExpenseStore((state) => state.transactions);
  const budgets = useExpenseStore((state) => state.budgets);
  const categories = useExpenseStore((state) => state.categories);
  return useMemo(
    () => computeBudgetUsage(budgets, transactions, month, categories),
    [budgets, transactions, month, categories],
  );
}
