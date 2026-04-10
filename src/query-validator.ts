// ============================================================
// SQL Query Validator — read-only enforcement
// ============================================================

export interface ValidationResult {
  readonly safe: boolean;
  readonly reason?: string;
}

const BLOCKED_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "CREATE",
  "TRUNCATE",
  "MERGE",
  "BULK",
  "GRANT",
  "REVOKE",
  "DENY",
  "BACKUP",
  "RESTORE",
  "SHUTDOWN",
  "DBCC",
  "EXEC",
  "EXECUTE",
  "OPENROWSET",
  "OPENDATASOURCE",
  "OPENQUERY",
] as const;

// Patterns that indicate system stored procedures or dangerous functions
const BLOCKED_PREFIXES = ["xp_", "sp_"] as const;

/**
 * Strips SQL comments (both line and block) from a query string.
 * This prevents comment-based bypass attempts.
 */
function stripComments(query: string): string {
  // Remove block comments (handles nested by being greedy)
  let result = query.replace(/\/\*[\s\S]*?\*\//g, " ");
  // Remove line comments
  result = result.replace(/--[^\n]*/g, " ");
  return result;
}

/**
 * Validates that a SQL query is read-only.
 * Returns { safe: true } if allowed, or { safe: false, reason } if blocked.
 *
 * Defense-in-depth: this is the application-level check.
 * The SQL user should also have only SELECT/VIEW DEFINITION grants.
 */
export function validateQuery(query: string): ValidationResult {
  if (!query || !query.trim()) {
    return { safe: false, reason: "Query is empty" };
  }

  const stripped = stripComments(query);
  const normalized = stripped.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return { safe: false, reason: "Query is empty after stripping comments" };
  }

  const upper = normalized.toUpperCase();
  const firstToken = upper.split(/[\s(]+/)[0];

  if (
    firstToken !== "SELECT" &&
    firstToken !== "WITH" &&
    firstToken !== "DECLARE"
  ) {
    return {
      safe: false,
      reason: `Query must start with SELECT, WITH, or DECLARE. Found: ${firstToken}`,
    };
  }

  // DECLARE is only allowed if the query eventually contains a SELECT
  if (firstToken === "DECLARE" && !upper.includes("SELECT")) {
    return {
      safe: false,
      reason: "DECLARE block must contain a SELECT statement",
    };
  }

  // For non-DECLARE queries, reject multiple statements (semicolons before end)
  // DECLARE blocks legitimately use semicolons between variable declarations and SELECT
  if (firstToken !== "DECLARE") {
    const withoutStrings = normalized
      .replace(/'[^']*'/g, "''") // replace string literals
      .replace(/"[^"]*"/g, '""');
    const semiIndex = withoutStrings.indexOf(";");
    if (semiIndex !== -1 && semiIndex < withoutStrings.trim().length - 1) {
      return {
        safe: false,
        reason: "Multiple statements detected (semicolons not allowed)",
      };
    }
  }

  // Check for blocked keywords as whole words
  for (const keyword of BLOCKED_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(upper)) {
      return { safe: false, reason: `Blocked keyword: ${keyword}` };
    }
  }

  // Check for dangerous prefixes (xp_, sp_)
  for (const prefix of BLOCKED_PREFIXES) {
    const regex = new RegExp(`\\b${prefix}\\w+`, "i");
    if (regex.test(upper)) {
      return { safe: false, reason: `Blocked system procedure prefix: ${prefix}` };
    }
  }

  return { safe: true };
}
