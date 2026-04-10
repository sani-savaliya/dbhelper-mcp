import { z } from "zod";
import { getPool } from "../connection-pool.js";
import { validateQuery } from "../query-validator.js";

export const runQueryToolName = "run_query";

export const runQueryDescription =
  "Execute a read-only SQL query against a database. Only SELECT/WITH/DECLARE statements are allowed. Use TOP or WHERE clauses to limit results.";

export const runQueryParams = {
  database: z
    .string()
    .describe(
      "Database name as defined in databases.json (use list_databases to see available names)"
    ),
  query: z.string().describe("SQL SELECT query to execute. Must be read-only."),
  maxRows: z
    .number()
    .default(100)
    .describe("Maximum rows to return (default 100, max 500)"),
};

export async function runQueryHandler({
  database,
  query,
  maxRows,
}: {
  database: string;
  query: string;
  maxRows: number;
}) {
  const validation = validateQuery(query);
  if (!validation.safe) {
    return {
      content: [
        {
          type: "text" as const,
          text: `BLOCKED: ${validation.reason}\n\nOnly read-only queries (SELECT, WITH, DECLARE+SELECT) are allowed.`,
        },
      ],
    };
  }

  const cap = Math.min(maxRows, 500);

  try {
    const pool = await getPool(database);
    const result = await pool.request().query(query);

    const rowCount = result.recordset?.length ?? 0;
    const truncated = rowCount > cap;
    const data = truncated ? result.recordset.slice(0, cap) : result.recordset;

    const columns = result.recordset.columns
      ? Object.keys(result.recordset.columns)
      : data.length > 0
        ? Object.keys(data[0])
        : [];

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              database,
              rowCount,
              returnedRows: data.length,
              truncated,
              columns,
              data,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (err: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `SQL Error on ${database}: ${err.message}`,
        },
      ],
    };
  }
}
