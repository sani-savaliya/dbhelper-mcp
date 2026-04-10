import { z } from "zod";
import { getPool } from "../connection-pool.js";

export const listTablesToolName = "list_tables";

export const listTablesDescription =
  "List all tables in a database with approximate row counts. Useful for understanding the database structure.";

export const listTablesParams = {
  database: z.string().describe("Database name as defined in databases.json"),
  schema: z
    .string()
    .optional()
    .describe("Filter by schema name (e.g., 'dbo'). If omitted, shows all schemas."),
};

export async function listTablesHandler({
  database,
  schema,
}: {
  database: string;
  schema?: string;
}) {
  try {
    const pool = await getPool(database);

    let query = `
      SELECT
        s.name AS SchemaName,
        t.name AS TableName,
        p.rows AS ApproxRowCount
      FROM sys.tables t
      JOIN sys.schemas s ON t.schema_id = s.schema_id
      JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0,1)
    `;

    if (schema) {
      query += ` WHERE s.name = '${schema.replace(/'/g, "''")}'`;
    }

    query += ` ORDER BY s.name, t.name`;

    const result = await pool.request().query(query);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              database,
              tableCount: result.recordset.length,
              tables: result.recordset,
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
        { type: "text" as const, text: `Error: ${err.message}` },
      ],
    };
  }
}
