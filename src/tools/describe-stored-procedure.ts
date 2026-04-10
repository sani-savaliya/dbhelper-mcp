import { z } from "zod";
import sql from "mssql";
import { getPool } from "../connection-pool.js";

export const describeStoredProcedureToolName = "describe_stored_procedure";

export const describeStoredProcedureDescription =
  "Get the definition (source code) and parameters of a stored procedure. Useful for understanding data logic that lives in the database.";

export const describeStoredProcedureParams = {
  database: z.string().describe("Database name as defined in databases.json"),
  procedure: z
    .string()
    .describe(
      "Stored procedure name (e.g., 'usp_GetOrderDetails'). Can include schema prefix like 'dbo.usp_GetOrderDetails'."
    ),
};

export async function describeStoredProcedureHandler({
  database,
  procedure,
}: {
  database: string;
  procedure: string;
}) {
  try {
    const pool = await getPool(database);

    // Get the procedure definition
    const defResult = await pool
      .request()
      .input("proc", sql.NVarChar, procedure).query(`
        SELECT OBJECT_DEFINITION(OBJECT_ID(@proc)) AS Definition
      `);

    // Get the procedure parameters
    const paramResult = await pool
      .request()
      .input("proc", sql.NVarChar, procedure).query(`
        SELECT
          p.name AS ParameterName,
          TYPE_NAME(p.user_type_id) AS DataType,
          p.max_length AS MaxLength,
          p.is_output AS IsOutput,
          p.has_default_value AS HasDefault,
          p.default_value AS DefaultValue
        FROM sys.parameters p
        JOIN sys.procedures sp ON p.object_id = sp.object_id
        WHERE sp.name = @proc
           OR (SCHEMA_NAME(sp.schema_id) + '.' + sp.name) = @proc
        ORDER BY p.parameter_id
      `);

    const definition =
      defResult.recordset[0]?.Definition ?? null;

    if (!definition) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Stored procedure '${procedure}' not found in database '${database}'. Check the name and try with schema prefix (e.g., 'dbo.${procedure}').`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              database,
              procedure,
              parameterCount: paramResult.recordset.length,
              parameters: paramResult.recordset,
              definition,
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
