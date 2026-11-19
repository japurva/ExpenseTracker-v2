export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type TransactionType = 'income' | 'expense' | 'transfer';
export type CategoryType = 'income' | 'expense';
export type PaymentMethod = 'cash' | 'bank' | 'credit_card' | 'debit_card' | 'wallet' | 'upi' | 'other';

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          type: CategoryType;
          icon: string | null;
          color: string | null;
          is_default: boolean;
          client_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          type: CategoryType;
          icon?: string | null;
          color?: string | null;
          is_default?: boolean;
          client_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          name?: string;
          type?: CategoryType;
          icon?: string | null;
          color?: string | null;
          is_default?: boolean;
          client_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          category_id: string | null;
          amount: number;
          type: TransactionType;
          payment_method: string | null;
          payment_source_id: string | null;
          description: string | null;
          receipt_url: string | null;
          is_ocr_parsed: boolean;
          raw_ocr_text: string | null;
          date: string;
          client_id: string | null;
          created_at: string;
          updated_at: string;
          synced_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          category_id?: string | null;
          amount: number;
          type: TransactionType;
          payment_method?: string | null;
          payment_source_id?: string | null;
          description?: string | null;
          receipt_url?: string | null;
          is_ocr_parsed?: boolean;
          raw_ocr_text?: string | null;
          date?: string;
          client_id?: string | null;
          created_at?: string;
          updated_at?: string;
          synced_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          category_id?: string | null;
          amount?: number;
          type?: TransactionType;
          payment_method?: string | null;
          payment_source_id?: string | null;
          description?: string | null;
          receipt_url?: string | null;
          is_ocr_parsed?: boolean;
          raw_ocr_text?: string | null;
          date?: string;
          client_id?: string | null;
          created_at?: string;
          updated_at?: string;
          synced_at?: string | null;
        };
        Relationships: [];
      };
      payment_sources: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          kind: PaymentMethod;
          last4: string | null;
          client_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          kind?: PaymentMethod;
          last4?: string | null;
          client_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          kind?: PaymentMethod;
          last4?: string | null;
          client_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      budgets: {
        Row: {
          id: string;
          user_id: string;
          category_id: string;
          monthly_limit: number;
          month_year: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          category_id: string;
          monthly_limit: number;
          month_year: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          category_id?: string;
          monthly_limit?: number;
          month_year?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
