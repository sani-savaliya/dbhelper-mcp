import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type sql from "mssql";

// ============================================================
// Database Definition
// ============================================================
export interface DatabaseDefinition {
  readonly name: string;
  readonly displayName: string;
  readonly database: string;
  readonly server: string;
  readonly environment: "prod" | "nonprod";
}

// ============================================================
// Load databases from databases.json config file
// ============================================================

interface DatabaseConfigEntry {
  name: string;
  server: string;
  database: string;
  environment: "prod" | "nonprod";
  displayName?: string;
}

interface DatabaseConfig {
  databases: DatabaseConfigEntry[];
}

function findConfigPath(): string {
  // 1. Explicit env var
  if (process.env.DBHELPER_CONFIG) {
    return resolve(process.env.DBHELPER_CONFIG);
  }

  // 2. Next to the running script
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const candidates = [
    resolve(__dirname, "..", "databases.json"), // dist/../databases.json
    resolve(__dirname, "..", "..", "databases.json"), // dist/../../databases.json (for nested builds)
    resolve(process.cwd(), "databases.json"), // cwd/databases.json
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0]; // Return first candidate for error message
}

function loadDatabaseRegistry(): readonly DatabaseDefinition[] {
  const configPath = findConfigPath();

  if (!existsSync(configPath)) {
    console.error(
      `\n[dbhelper-mcp] Config file not found: ${configPath}\n` +
        `Create a databases.json file based on databases.example.json.\n` +
        `Or set DBHELPER_CONFIG env var to point to your config file.\n`
    );
    return [];
  }

  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch (err: any) {
    console.error(`[dbhelper-mcp] Failed to read config: ${err.message}`);
    return [];
  }

  let config: DatabaseConfig;
  try {
    config = JSON.parse(raw);
  } catch (err: any) {
    console.error(`[dbhelper-mcp] Invalid JSON in config: ${err.message}`);
    return [];
  }

  if (!Array.isArray(config.databases)) {
    console.error(
      `[dbhelper-mcp] Config must have a "databases" array. See databases.example.json.`
    );
    return [];
  }

  return config.databases.map((entry) => ({
    name: entry.name.toLowerCase().trim(),
    displayName:
      entry.displayName ??
      entry.name.charAt(0).toUpperCase() + entry.name.slice(1),
    database: entry.database,
    server: entry.server,
    environment: entry.environment,
  }));
}

export const DATABASE_REGISTRY: readonly DatabaseDefinition[] =
  loadDatabaseRegistry();

// ============================================================
// Resolve a database name (case-insensitive) to its definition
// ============================================================
export function resolveDatabase(
  dbName: string
): DatabaseDefinition | undefined {
  const lower = dbName.toLowerCase().trim();
  return DATABASE_REGISTRY.find((d) => d.name === lower);
}

// ============================================================
// Build mssql connection config for a database
// ============================================================
export function buildConnectionConfig(db: DatabaseDefinition): sql.config {
  const user = process.env.SQL_READONLY_USER;
  const password = process.env.SQL_READONLY_PASSWORD;

  if (!user || !password) {
    throw new Error(
      "SQL_READONLY_USER and SQL_READONLY_PASSWORD environment variables are required"
    );
  }

  return {
    server: db.server,
    database: db.database,
    user,
    password,
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
    requestTimeout: 30_000,
    connectionTimeout: 15_000,
    pool: {
      max: 3,
      min: 0,
      idleTimeoutMillis: 60_000,
    },
  };
}
