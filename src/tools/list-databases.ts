import { z } from "zod";
import { DATABASE_REGISTRY } from "../config.js";

export const listDatabasesToolName = "list_databases";

export const listDatabasesDescription =
  "List all configured databases with their environment (prod/nonprod) and server.";

export const listDatabasesParams = {};

export async function listDatabasesHandler() {
  const databases = DATABASE_REGISTRY.map((d) => ({
    name: d.name,
    displayName: d.displayName,
    database: d.database,
    server: d.server,
    environment: d.environment,
  }));

  const prodCount = databases.filter((d) => d.environment === "prod").length;
  const nonprodCount = databases.filter(
    (d) => d.environment === "nonprod"
  ).length;

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            totalDatabases: databases.length,
            prod: prodCount,
            nonprod: nonprodCount,
            databases,
          },
          null,
          2
        ),
      },
    ],
  };
}
