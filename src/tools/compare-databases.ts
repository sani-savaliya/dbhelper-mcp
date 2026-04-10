import { z } from "zod";
import { getPool } from "../connection-pool.js";
import { validateQuery } from "../query-validator.js";

export const compareDatabasesToolName = "compare_databases";

export const compareDatabasesDescription =
  "Run the same read-only query across multiple databases and compare results side by side. Useful for finding differences or verifying consistency across environments.";

export const compareDatabasesParams = {
  databases: z
    .array(z.string())
    .min(2)
    .describe(
      "Array of database names to compare (e.g., ['myapp-dev', 'myapp-staging', 'myapp-prod'])"
    ),
  query: z
    .string()
    .describe("SQL SELECT query to run on each database"),
  maxRowsPerDatabase: z
    .number()
    .default(20)
    .describe("Max rows to return per database (default 20)"),
};

export async function compareDatabasesHandler({
  databases,
  query,
  maxRowsPerDatabase,
}: {
  databases: string[];
  query: string;
  maxRowsPerDatabase: number;
}) {
  const validation = validateQuery(query);
  if (!validation.safe) {
    return {
      content: [
        {
          type: "text" as const,
          text: `BLOCKED: ${validation.reason}\n\nOnly read-only queries are allowed.`,
        },
      ],
    };
  }

  const cap = Math.min(maxRowsPerDatabase, 100);
  const results: Record<
    string,
    { rowCount: number; data: any[] } | { error: string }
  > = {};

  // Run queries in parallel across databases
  await Promise.allSettled(
    databases.map(async (db) => {
      try {
        const pool = await getPool(db);
        const result = await pool.request().query(query);
        results[db] = {
          rowCount: result.recordset.length,
          data: result.recordset.slice(0, cap),
        };
      } catch (err: any) {
        results[db] = { error: err.message };
      }
    })
  );

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            query,
            databasesQueried: databases.length,
            results,
          },
          null,
          2
        ),
      },
    ],
  };
}
