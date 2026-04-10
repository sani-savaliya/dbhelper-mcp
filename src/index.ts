#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { closeAllPools } from "./connection-pool.js";

// Tool imports
import {
  listDatabasesToolName,
  listDatabasesDescription,
  listDatabasesParams,
  listDatabasesHandler,
} from "./tools/list-databases.js";
import {
  runQueryToolName,
  runQueryDescription,
  runQueryParams,
  runQueryHandler,
} from "./tools/run-query.js";
import {
  getTableSchemaToolName,
  getTableSchemaDescription,
  getTableSchemaParams,
  getTableSchemaHandler,
} from "./tools/get-table-schema.js";
import {
  listTablesToolName,
  listTablesDescription,
  listTablesParams,
  listTablesHandler,
} from "./tools/list-tables.js";
import {
  describeStoredProcedureToolName,
  describeStoredProcedureDescription,
  describeStoredProcedureParams,
  describeStoredProcedureHandler,
} from "./tools/describe-stored-procedure.js";
import {
  compareDatabasesToolName,
  compareDatabasesDescription,
  compareDatabasesParams,
  compareDatabasesHandler,
} from "./tools/compare-databases.js";

// ============================================================
// MCP Server Setup
// ============================================================

const server = new McpServer({
  name: "dbhelper-mcp",
  version: "1.0.0",
});

// Register all tools
server.tool(
  listDatabasesToolName,
  listDatabasesDescription,
  listDatabasesParams,
  listDatabasesHandler
);

server.tool(
  runQueryToolName,
  runQueryDescription,
  runQueryParams,
  runQueryHandler
);

server.tool(
  getTableSchemaToolName,
  getTableSchemaDescription,
  getTableSchemaParams,
  getTableSchemaHandler
);

server.tool(
  listTablesToolName,
  listTablesDescription,
  listTablesParams,
  listTablesHandler
);

server.tool(
  describeStoredProcedureToolName,
  describeStoredProcedureDescription,
  describeStoredProcedureParams,
  describeStoredProcedureHandler
);

server.tool(
  compareDatabasesToolName,
  compareDatabasesDescription,
  compareDatabasesParams,
  compareDatabasesHandler
);

// ============================================================
// Start Server
// ============================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("dbhelper-mcp server running on stdio");
  console.error(
    `Registered tools: ${[
      listDatabasesToolName,
      runQueryToolName,
      getTableSchemaToolName,
      listTablesToolName,
      describeStoredProcedureToolName,
      compareDatabasesToolName,
    ].join(", ")}`
  );
}

main().catch((err) => {
  console.error("Fatal error starting dbhelper-mcp:", err);
  process.exit(1);
});

// Graceful shutdown
const shutdown = async () => {
  console.error("Shutting down dbhelper-mcp...");
  await closeAllPools();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
