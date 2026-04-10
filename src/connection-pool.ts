import sql from "mssql";
import {
  type DatabaseDefinition,
  resolveDatabase,
  buildConnectionConfig,
} from "./config.js";

// ============================================================
// Lazy per-database connection pool manager
// ============================================================

const pools: Map<string, sql.ConnectionPool> = new Map();

/**
 * Get or create a connection pool for the given database.
 * Pools are created lazily on first access and reused across requests.
 */
export async function getPool(dbName: string): Promise<sql.ConnectionPool> {
  const db = resolveDatabase(dbName);
  if (!db) {
    const available = (await import("./config.js")).DATABASE_REGISTRY.map(
      (d) => d.name
    ).join(", ");
    throw new Error(
      `Unknown database: "${dbName}". Available: ${available}`
    );
  }

  const key = db.name;
  const existing = pools.get(key);

  if (existing?.connected) {
    return existing;
  }

  // Clean up stale pool if it exists but isn't connected
  if (existing) {
    try {
      await existing.close();
    } catch {
      // ignore close errors on stale pools
    }
    pools.delete(key);
  }

  const config = buildConnectionConfig(db);
  const pool = new sql.ConnectionPool(config);
  await pool.connect();
  pools.set(key, pool);

  return pool;
}

/**
 * Close all open connection pools. Call on server shutdown.
 */
export async function closeAllPools(): Promise<void> {
  const entries = Array.from(pools.entries());
  pools.clear();

  await Promise.allSettled(
    entries.map(async ([name, pool]) => {
      try {
        await pool.close();
      } catch (err) {
        console.error(`Error closing pool for ${name}:`, err);
      }
    })
  );
}

/**
 * Check connectivity to a specific database. Returns true if reachable.
 */
export async function checkConnection(
  dbName: string
): Promise<{ connected: boolean; error?: string }> {
  try {
    const pool = await getPool(dbName);
    await pool.request().query("SELECT 1");
    return { connected: true };
  } catch (err: any) {
    return { connected: false, error: err.message };
  }
}
