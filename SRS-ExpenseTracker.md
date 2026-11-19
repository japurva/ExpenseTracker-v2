# Software Requirements Specification (SRS)
## Project Title: ExpenseTracker - Cross-Platform Personal Finance Manager
## Stack Standards: Node.js 26 LTS | Expo SDK 58 | React Native 0.87 | PostgreSQL 18

---

### 1. Executive Summary & System Philosophy
ExpenseTracker is an open-source, cross-platform mobile and web application. It operates under a **Guest-First / Offline-First Paradigm**—users can immediately track income, expenses, set budgets, perform OCR receipt scans, and view analytics **without registering or logging in**. 

When a user decides to sign up, their local data seamlessly migrates and syncs to a secure cloud PostgreSQL database via Supabase or a custom Node.js backend across all their devices.

---

### 2. Tech Stack & Version Specifications

To guarantee maximum stability and compatibility, the codebase relies strictly on the following stable versions:

| Component | Technology | Version / Standard | Role |
| :--- | :--- | :--- | :--- |
| **Runtime / Tooling** | Node.js | v26.x (Active LTS) | JavaScript runtime & execution environment |
| **Mobile & Web Framework** | React Native / Expo | Expo SDK 58 / React Native 0.87 | Universal app platform (New Architecture default) |
| **File Routing** | Expo Router | v4.x / SDK 58 integrated | File-based cross-platform routing |
| **Styling** | NativeWind / Tailwind CSS | NativeWind v4+ | Utility-first styling for Native & Web |
| **Local Guest Database** | `react-native-mmkv` | v4.x (Nitro Modules) / IndexedDB | Ultra-fast local key-value persistence |
| **Backend / Database** | PostgreSQL | v18.x (Hosted on Supabase/Neon) | Transactional data storage & Row Level Security |
| **OCR Processing** | `@react-native-ml-kit/text-recognition` | Latest Stable (Mobile) / `tesseract.js` (Web) | Local camera/file receipt text parsing |
| **State Management** | Zustand | v5.x | Client state & storage persistence middleware |
| **Data Visualization** | Victory Native / Recharts | Latest (New Arch Compatible) | Cross-platform charts and graphs |

---

### 3. Functional Requirements

#### 3.1 Mode of Operation & Authentication
- **FR-1.1: Guest Mode (Default)**
  - Full app functionality (Transactions, Budgets, OCR, Reports) works 100% offline without account creation.
  - Data persists locally using high-performance MMKV storage (Mobile) or IndexedDB (Web).
- **FR-1.2: Optional Cloud Account Creation**
  - Email/Password registration and Google OAuth via Supabase Auth.
  - Automatic password recovery via email flow.
- **FR-1.3: One-Tap Data Migration & Cloud Sync**
  - When an unauthenticated Guest user creates an account or logs in, local records upload automatically to the remote PostgreSQL instance.
  - Conflict Resolution: New local transactions generate remote IDs, preserving existing server-side timestamps (`synced_at`).

#### 3.2 Dashboard & Financial Overview
- **FR-2.1:** High-level dynamic summary cards showing Current Month Balance, Total Income, and Total Expenses.
- **FR-2.2:** Real-time widgets displaying recent activity and top spending categories.
- **FR-2.3:** Universal Floating Action Button (FAB) for rapid transaction entry or camera receipt scanning.

#### 3.3 Transaction Management
- **FR-3.1:** Create/Read/Update/Delete transactions with input attributes:
  - Amount (Decimal)
  - Type (Expense, Income, Transfer)
  - Category (Selected via dropdown or modal picker)
  - Date & Time (Defaults to current ISO timestamp)
  - Description / Merchant Note
  - Payment Source (named accounts: Cash, Bank, Credit Card, Debit Card, Wallet, UPI — a user may
    keep several banks and several cards, each with an optional last-4 to tell them apart)
  - Receipt Image File / Local URI
- **FR-3.2:** Transaction history listing powered by `@shopify/flash-list` for smooth 60fps rendering.
- **FR-3.3:** Advanced filtering by keyword, date range, payment mode, and category.

#### 3.4 OCR & Receipt Processing
- **FR-4.1:** Image capture via `expo-camera` or attachment select via `expo-image-picker`.
- **FR-4.2:** On-device OCR processing extracting text line by line.
- **FR-4.3:** Smart regex parsing algorithm extracts:
  - **Total Amount:** Currency parsing (e.g., $54.20, ₹1,450.00).
  - **Date:** Formats (`YYYY-MM-DD`, `DD/MM/YYYY`, etc.).
  - **Merchant Name:** First prominent header lines.
  - **Suggested Category:** Rule-based keyword matching (e.g., "Starbucks" -> Coffee/Food).
- **FR-4.4:** Modal auto-fills parsed details for user confirmation prior to database commit.

#### 3.5 Category & Budget Management
- **FR-5.1:** Pre-configured default categories (Food, Rent, Salary, Bills, Shopping, Transport).
- **FR-5.2:** Custom user categories with color pickers and icon selectors.
- **FR-5.3:** Monthly spending limits per category with visual health bars (Warning at 80%, Danger at 100%).
- **FR-5.4:** Manage payment sources — create, rename, retype (cash / bank / credit card / debit card /
  wallet / UPI / other) and delete as many banks and cards as the user has, without losing past transactions.

---

### 4. PostgreSQL Database Schema (v18.x Compatible)

```sql
-- PostgreSQL Remote Database Schema (Supports both Cloud Users & Syncing Guest Data)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Categories Table
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL for Guest Mode
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) CHECK (type IN ('income', 'expense')),
    icon VARCHAR(50),
    color VARCHAR(20),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Payment Sources Table (Banks, cards, wallets — one row per account)
CREATE TABLE payment_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL for Guest Mode
    name VARCHAR(100) NOT NULL,
    kind VARCHAR(20) CHECK (kind IN ('cash','bank','credit_card','debit_card','wallet','upi','other')),
    last4 VARCHAR(4),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Transactions Table
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL for Guest Mode
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    amount NUMERIC(12, 2) NOT NULL,
    type VARCHAR(20) CHECK (type IN ('income', 'expense', 'transfer')),
    payment_source_id UUID REFERENCES payment_sources(id) ON DELETE SET NULL,
    payment_method VARCHAR(50),
    description TEXT,
    receipt_url TEXT,
    is_ocr_parsed BOOLEAN DEFAULT FALSE,
    raw_ocr_text TEXT,
    date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- Budgets Table
CREATE TABLE budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL for Guest Mode
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    monthly_limit NUMERIC(12, 2) NOT NULL,
    month_year DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, category_id, month_year)
);

-- Indexing for high performance queries
CREATE INDEX idx_transactions_user_date ON transactions(user_id, date DESC);
CREATE INDEX idx_categories_user ON categories(user_id);


---

### 5. Non-Functional Requirements
Node Environment: Strictly targeted for Node.js 26 LTS runtime environments.

Performance: Cold start time < 1 second on mobile; scroll performance maintained at 60 FPS on lists.

Offline Integrity: Zero system failures when disconnected from the internet; all data ops fall back seamlessly to local MMKV storage.

Security: Standardized Row Level Security (RLS) on PostgreSQL tables preventing cross-tenant data leaks.