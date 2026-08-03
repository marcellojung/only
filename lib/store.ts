import postgres from "postgres";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type StoredTransaction = {
  id: string;
  date: string;
  merchant: string;
  category: string;
  amount: number;
  kind: "expense" | "income";
  owner: "성근" | "지은" | "공통";
};

export type StoredStockHolding = {
  id: string;
  name: string;
  symbol: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  currency: "KRW" | "USD";
  owner: "성근" | "지은" | "공통";
  institution?: string;
  investedAmount?: number;
  marketValue?: number;
};

export type StoredPortfolio = {
  source: string;
  asOf: string;
  owner: "성근" | "지은" | "공통";
  totalAssets: number;
  totalDebts: number;
  netWorth: number;
  cash: number;
  investments: number;
  realEstate: number;
  movable: number;
  other: number;
};

export type StoredState = { transactions: StoredTransaction[]; stockHoldings: StoredStockHolding[]; portfolio: StoredPortfolio; updatedAt: string };

const seed: StoredState = {
  transactions: [
    { id: "1", date: "2026-08-03", merchant: "마켓컬리", category: "식비", amount: 68400, kind: "expense", owner: "지은" },
    { id: "2", date: "2026-08-02", merchant: "현대오일뱅크", category: "교통", amount: 76000, kind: "expense", owner: "성근" },
    { id: "3", date: "2026-08-01", merchant: "넷플릭스", category: "구독", amount: 17000, kind: "expense", owner: "성근" },
    { id: "4", date: "2026-07-31", merchant: "교보문고", category: "생활", amount: 28900, kind: "expense", owner: "지은" },
  ],
  stockHoldings: [
    { id: "s1", name: "삼성전자", symbol: "005930", quantity: 1000, avgPrice: 75150, currentPrice: 78000, currency: "KRW", owner: "공통" },
    { id: "s2", name: "TIGER 미국S&P500", symbol: "360750", quantity: 312, avgPrice: 191000, currentPrice: 206730, currency: "KRW", owner: "지은" },
    { id: "s3", name: "Apple", symbol: "AAPL", quantity: 138, avgPrice: 224.2, currentPrice: 252.4, currency: "USD", owner: "성근" },
    { id: "s4", name: "QQQ", symbol: "QQQ", quantity: 50, avgPrice: 497.7, currentPrice: 532.1, currency: "USD", owner: "성근" },
  ],
  portfolio: { source: "demo", asOf: "", owner: "공통", totalAssets: 0, totalDebts: 0, netWorth: 0, cash: 0, investments: 0, realEstate: 0, movable: 0, other: 0 },
  updatedAt: new Date().toISOString(),
};

const localStatePath = path.join(process.cwd(), "data", "private-state.json");

let sqlClient: ReturnType<typeof postgres> | null = null;

function cloudDb() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!sqlClient) sqlClient = postgres(url, { ssl: "require", max: 2, idle_timeout: 20 });
  return sqlClient;
}

async function ensureTable() {
  const sql = cloudDb();
  if (!sql) return null;
  await sql`CREATE TABLE IF NOT EXISTS family_app_state (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  return sql;
}

export function isAuthorized(request: Request) {
  const expected = process.env.APP_ACCESS_KEY;
  return !expected || request.headers.get("x-app-key") === expected;
}

export async function readState(): Promise<StoredState> {
  const sql = await ensureTable();
  if (sql) {
    const rows = await sql<{ data: StoredState }[]>`SELECT data FROM family_app_state WHERE id = 'family' LIMIT 1`;
    return rows[0]?.data || seed;
  }
  try {
    const saved = JSON.parse(await readFile(localStatePath, "utf8")) as StoredState;
    return { ...seed, ...saved, portfolio: { ...seed.portfolio, ...saved.portfolio } };
  } catch {
    return seed;
  }
}

export async function writeState(next: Pick<StoredState, "transactions" | "stockHoldings" | "portfolio">) {
  const state: StoredState = { transactions: next.transactions, stockHoldings: next.stockHoldings, portfolio: next.portfolio, updatedAt: new Date().toISOString() };
  const sql = await ensureTable();
  if (sql) {
    await sql`INSERT INTO family_app_state (id, data, updated_at)
      VALUES ('family', ${sql.json(state)}, NOW())
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`;
    return state;
  }
  await mkdir(path.dirname(localStatePath), { recursive: true });
  const temporaryPath = `${localStatePath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(state), "utf8");
  await rename(temporaryPath, localStatePath);
  return state;
}
