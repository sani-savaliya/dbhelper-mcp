import { describe, it, expect } from "vitest";
import { validateQuery } from "../src/query-validator.js";

describe("validateQuery", () => {
  // ==================== ALLOWED QUERIES ====================
  describe("allows valid read-only queries", () => {
    it("allows simple SELECT", () => {
      expect(validateQuery("SELECT * FROM Users")).toEqual({ safe: true });
    });

    it("allows SELECT with TOP", () => {
      expect(validateQuery("SELECT TOP 10 * FROM Users")).toEqual({
        safe: true,
      });
    });

    it("allows SELECT with WHERE", () => {
      expect(
        validateQuery("SELECT Id, Name FROM Users WHERE Status = 'Active'")
      ).toEqual({ safe: true });
    });

    it("allows CTE (WITH ... SELECT)", () => {
      expect(
        validateQuery(
          "WITH cte AS (SELECT Id FROM Users) SELECT * FROM cte"
        )
      ).toEqual({ safe: true });
    });

    it("allows DECLARE with SELECT", () => {
      expect(
        validateQuery("DECLARE @id INT = 5; SELECT * FROM Users WHERE Id = @id")
      ).toEqual({ safe: true });
    });

    it("allows lowercase select", () => {
      expect(validateQuery("select * from Users")).toEqual({ safe: true });
    });

    it("allows mixed case", () => {
      expect(validateQuery("Select Top 10 * From Users")).toEqual({
        safe: true,
      });
    });

    it("allows leading/trailing whitespace", () => {
      expect(validateQuery("  SELECT 1  ")).toEqual({ safe: true });
    });

    it("allows SELECT with subquery", () => {
      expect(
        validateQuery(
          "SELECT * FROM Orders WHERE UserId IN (SELECT Id FROM Users)"
        )
      ).toEqual({ safe: true });
    });

    it("allows SELECT with JOIN", () => {
      expect(
        validateQuery(
          "SELECT o.Id, u.Name FROM Orders o JOIN Users u ON o.UserId = u.Id"
        )
      ).toEqual({ safe: true });
    });

    it("allows SELECT with aggregation", () => {
      expect(
        validateQuery(
          "SELECT Status, COUNT(*) as cnt FROM Orders GROUP BY Status"
        )
      ).toEqual({ safe: true });
    });

    it("allows SELECT with INFORMATION_SCHEMA", () => {
      expect(
        validateQuery("SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users'")
      ).toEqual({ safe: true });
    });

    it("allows trailing semicolon", () => {
      expect(validateQuery("SELECT 1;")).toEqual({ safe: true });
    });
  });

  // ==================== BLOCKED QUERIES ====================
  describe("blocks dangerous queries", () => {
    it("blocks DELETE", () => {
      const result = validateQuery("DELETE FROM Users");
      expect(result.safe).toBe(false);
      expect(result.reason).toContain("DELETE");
    });

    it("blocks DROP TABLE", () => {
      const result = validateQuery("DROP TABLE Users");
      expect(result.safe).toBe(false);
    });

    it("blocks INSERT", () => {
      const result = validateQuery("INSERT INTO Users (Name) VALUES ('test')");
      expect(result.safe).toBe(false);
    });

    it("blocks UPDATE", () => {
      const result = validateQuery("UPDATE Users SET Status = 'Inactive'");
      expect(result.safe).toBe(false);
    });

    it("blocks TRUNCATE", () => {
      const result = validateQuery("TRUNCATE TABLE Users");
      expect(result.safe).toBe(false);
    });

    it("blocks ALTER", () => {
      const result = validateQuery("ALTER TABLE Users ADD NewCol INT");
      expect(result.safe).toBe(false);
    });

    it("blocks CREATE", () => {
      const result = validateQuery("CREATE TABLE Evil (id INT)");
      expect(result.safe).toBe(false);
    });

    it("blocks EXEC", () => {
      const result = validateQuery("EXEC sp_help 'Users'");
      expect(result.safe).toBe(false);
    });

    it("blocks EXECUTE", () => {
      const result = validateQuery("EXECUTE sp_who");
      expect(result.safe).toBe(false);
    });

    it("blocks GRANT", () => {
      const result = validateQuery("GRANT SELECT ON Users TO someone");
      expect(result.safe).toBe(false);
    });

    it("blocks MERGE", () => {
      const result = validateQuery(
        "MERGE INTO Users USING Source ON Users.Id = Source.Id WHEN MATCHED THEN UPDATE SET Name = Source.Name"
      );
      expect(result.safe).toBe(false);
    });

    it("blocks BACKUP", () => {
      const result = validateQuery("BACKUP DATABASE MyDB TO DISK = 'path'");
      expect(result.safe).toBe(false);
    });

    it("blocks SHUTDOWN", () => {
      const result = validateQuery("SHUTDOWN");
      expect(result.safe).toBe(false);
    });

    it("blocks xp_ procedures", () => {
      const result = validateQuery("SELECT * FROM Users; xp_cmdshell 'dir'");
      expect(result.safe).toBe(false);
    });

    it("blocks sp_ procedures", () => {
      const result = validateQuery("SELECT 1; sp_executesql 'DELETE FROM Users'");
      expect(result.safe).toBe(false);
    });
  });

  // ==================== INJECTION ATTEMPTS ====================
  describe("blocks SQL injection patterns", () => {
    it("blocks SELECT followed by DELETE via semicolon", () => {
      const result = validateQuery("SELECT 1; DELETE FROM Users");
      expect(result.safe).toBe(false);
    });

    it("blocks comment-hidden DELETE", () => {
      const result = validateQuery("/* harmless */ DELETE FROM Users");
      expect(result.safe).toBe(false);
    });

    it("blocks line-comment-hidden DELETE", () => {
      const result = validateQuery("-- just a comment\nDELETE FROM Users");
      expect(result.safe).toBe(false);
    });

    it("blocks DECLARE without SELECT", () => {
      const result = validateQuery("DECLARE @x INT = 1");
      expect(result.safe).toBe(false);
      expect(result.reason).toContain("DECLARE block must contain a SELECT");
    });

    it("blocks OPENROWSET", () => {
      const result = validateQuery(
        "SELECT * FROM OPENROWSET('SQLOLEDB','server';'user';'pass', 'SELECT 1')"
      );
      expect(result.safe).toBe(false);
    });
  });

  // ==================== EDGE CASES ====================
  describe("edge cases", () => {
    it("blocks empty string", () => {
      const result = validateQuery("");
      expect(result.safe).toBe(false);
    });

    it("blocks whitespace only", () => {
      const result = validateQuery("   ");
      expect(result.safe).toBe(false);
    });

    it("blocks comments only", () => {
      const result = validateQuery("/* just a comment */");
      expect(result.safe).toBe(false);
    });

    it("blocks line comments only", () => {
      const result = validateQuery("-- just a comment");
      expect(result.safe).toBe(false);
    });
  });
});
