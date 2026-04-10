-- ============================================================
-- dbhelper-mcp — Read-Only SQL User Setup
-- ============================================================
-- Creates a read-only SQL user for AI assistants across ALL
-- databases on an Azure SQL server automatically.
--
-- HOW TO USE:
--   1. Connect to MASTER on the target Azure SQL server
--   2. Run STEP 1 to create the login (change the password!)
--   3. Run STEP 2 — it auto-discovers all user databases
--      and creates the user + permissions in each one
--   4. Run STEP 3 on any database to verify
-- ============================================================


-- ============================================================
-- STEP 1: Create the login (run on MASTER)
-- ============================================================
-- Connect to: master database on the target SQL server
-- Change the password to something strong!

CREATE LOGIN dbhelper_readonly WITH PASSWORD = 'CHANGE_ME_TO_STRONG_PASSWORD';


-- ============================================================
-- STEP 2: Auto-provision across ALL user databases
-- ============================================================
-- Connect to: master database (same connection as Step 1)
-- This discovers all user databases and runs the setup on each.

DECLARE @dbName NVARCHAR(128);
DECLARE @sql NVARCHAR(MAX);

-- Cursor over all user databases (excludes master, tempdb, model, msdb)
DECLARE db_cursor CURSOR FOR
    SELECT name FROM sys.databases
    WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')
      AND state = 0  -- ONLINE only
    ORDER BY name;

OPEN db_cursor;
FETCH NEXT FROM db_cursor INTO @dbName;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @sql = '
    BEGIN TRY
        -- Skip if user already exists
        IF NOT EXISTS (SELECT 1 FROM [' + @dbName + '].sys.database_principals WHERE name = ''dbhelper_readonly'')
        BEGIN
            EXEC(''USE [' + @dbName + ']; CREATE USER dbhelper_readonly FOR LOGIN dbhelper_readonly;'');
            PRINT ''Created user in: ' + @dbName + ''';
        END
        ELSE
        BEGIN
            PRINT ''User already exists in: ' + @dbName + ''';
        END

        -- Grant read-only access
        EXEC(''USE [' + @dbName + ']; ALTER ROLE db_datareader ADD MEMBER dbhelper_readonly;'');

        -- Grant ability to read stored procedure definitions
        EXEC(''USE [' + @dbName + ']; GRANT VIEW DEFINITION TO dbhelper_readonly;'');

        -- Deny write operations (defense in depth)
        EXEC(''USE [' + @dbName + ']; DENY INSERT ON SCHEMA::dbo TO dbhelper_readonly;'');
        EXEC(''USE [' + @dbName + ']; DENY UPDATE ON SCHEMA::dbo TO dbhelper_readonly;'');
        EXEC(''USE [' + @dbName + ']; DENY DELETE ON SCHEMA::dbo TO dbhelper_readonly;'');
        EXEC(''USE [' + @dbName + ']; DENY ALTER ON SCHEMA::dbo TO dbhelper_readonly;'');
        EXEC(''USE [' + @dbName + ']; DENY EXECUTE ON SCHEMA::dbo TO dbhelper_readonly;'');
        EXEC(''USE [' + @dbName + ']; DENY CREATE TABLE TO dbhelper_readonly;'');
        EXEC(''USE [' + @dbName + ']; DENY CREATE PROCEDURE TO dbhelper_readonly;'');
        EXEC(''USE [' + @dbName + ']; DENY CREATE VIEW TO dbhelper_readonly;'');
        EXEC(''USE [' + @dbName + ']; DENY CREATE FUNCTION TO dbhelper_readonly;'');

        PRINT ''Permissions configured for: ' + @dbName + ''';
    END TRY
    BEGIN CATCH
        PRINT ''ERROR on ' + @dbName + ': '' + ERROR_MESSAGE();
    END CATCH
    ';

    EXEC sp_executesql @sql;

    FETCH NEXT FROM db_cursor INTO @dbName;
END

CLOSE db_cursor;
DEALLOCATE db_cursor;

PRINT '';
PRINT '=== DONE === Check Messages tab for results per database.';


-- ============================================================
-- STEP 3: Verify (run on ANY database after setup)
-- ============================================================
-- Connect to any of your databases

-- 3a. List all effective permissions for the user
SELECT
    dp.permission_name,
    dp.state_desc,
    dp.class_desc,
    COALESCE(OBJECT_NAME(dp.major_id), SCHEMA_NAME(dp.major_id), '') AS object_name
FROM sys.database_permissions dp
JOIN sys.database_principals pr ON dp.grantee_principal_id = pr.principal_id
WHERE pr.name = 'dbhelper_readonly'
ORDER BY dp.state_desc, dp.permission_name;

-- 3b. Confirm role membership (should show ONLY db_datareader)
SELECT r.name AS role_name
FROM sys.database_role_members rm
JOIN sys.database_principals r ON rm.role_principal_id = r.principal_id
JOIN sys.database_principals u ON rm.member_principal_id = u.principal_id
WHERE u.name = 'dbhelper_readonly';

-- 3c. Quick test (run as admin, impersonating the readonly user)
EXECUTE AS USER = 'dbhelper_readonly';

-- Should SUCCEED:
SELECT TOP 1 * FROM INFORMATION_SCHEMA.TABLES;

-- Should FAIL with permission denied:
-- INSERT INTO SomeTable (Col) VALUES ('test');
-- DELETE FROM SomeTable WHERE 1=0;

REVERT;
