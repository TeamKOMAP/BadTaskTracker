using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TaskManager.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddChatDirectKeyConstraints : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ChatRooms_WorkspaceId_Type",
                table: "ChatRooms");

            migrationBuilder.DropIndex(
                name: "IX_ChatRooms_WorkspaceId_Type_Title",
                table: "ChatRooms");

            migrationBuilder.AddColumn<string>(
                name: "DirectKey",
                table: "ChatRooms",
                type: ActiveProvider.Contains("Npgsql", StringComparison.OrdinalIgnoreCase)
                    ? "character varying(64)"
                    : "TEXT",
                maxLength: 64,
                nullable: true);

            BackfillAndDeduplicateDirectChats(migrationBuilder);

            migrationBuilder.CreateIndex(
                name: "UX_ChatRooms_WorkspaceId_DirectKey",
                table: "ChatRooms",
                columns: new[] { "WorkspaceId", "Type", "DirectKey" },
                unique: true,
                filter: "\"Type\" = 3 AND \"DirectKey\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "UX_ChatRooms_WorkspaceId_General",
                table: "ChatRooms",
                columns: new[] { "WorkspaceId", "Type" },
                unique: true,
                filter: "\"Type\" = 1");
        }

        private void BackfillAndDeduplicateDirectChats(MigrationBuilder migrationBuilder)
        {
            if (ActiveProvider.Contains("Npgsql", StringComparison.OrdinalIgnoreCase))
            {
                migrationBuilder.Sql(@"
UPDATE ""ChatRooms"" c
SET ""DirectKey"" = CONCAT(pair.""MinUserId"", ':', pair.""MaxUserId"")
FROM (
    SELECT m.""ChatRoomId"", MIN(m.""UserId"") AS ""MinUserId"", MAX(m.""UserId"") AS ""MaxUserId"", COUNT(*) AS ""MembersCount""
    FROM ""ChatRoomMembers"" m
    GROUP BY m.""ChatRoomId""
) pair
WHERE c.""Id"" = pair.""ChatRoomId""
  AND c.""Type"" = 3
  AND pair.""MembersCount"" = 2
  AND c.""DirectKey"" IS NULL;

CREATE TEMP TABLE ""_ChatRoomDedupMap"" AS
SELECT ""Id"" AS ""DuplicateId"", ""KeeperId""
FROM (
    SELECT c.""Id"",
           FIRST_VALUE(c.""Id"") OVER (
               PARTITION BY c.""WorkspaceId"", c.""DirectKey""
               ORDER BY c.""CreatedAtUtc"", c.""Id"") AS ""KeeperId""
    FROM ""ChatRooms"" c
    WHERE c.""Type"" = 3
      AND c.""DirectKey"" IS NOT NULL
) ranked
WHERE ranked.""Id"" <> ranked.""KeeperId"";

UPDATE ""ChatMessages"" msg
SET ""ChatRoomId"" = map.""KeeperId""
FROM ""_ChatRoomDedupMap"" map
WHERE msg.""ChatRoomId"" = map.""DuplicateId"";

INSERT INTO ""ChatRoomMembers"" (""ChatRoomId"", ""UserId"", ""Role"", ""JoinedAtUtc"")
SELECT map.""KeeperId"", members.""UserId"", members.""Role"", members.""JoinedAtUtc""
FROM ""ChatRoomMembers"" members
JOIN ""_ChatRoomDedupMap"" map ON map.""DuplicateId"" = members.""ChatRoomId""
ON CONFLICT (""ChatRoomId"", ""UserId"") DO NOTHING;

INSERT INTO ""ChatReadStates"" (""ChatRoomId"", ""UserId"", ""LastReadMessageId"")
SELECT map.""KeeperId"", states.""UserId"", states.""LastReadMessageId""
FROM ""ChatReadStates"" states
JOIN ""_ChatRoomDedupMap"" map ON map.""DuplicateId"" = states.""ChatRoomId""
ON CONFLICT (""ChatRoomId"", ""UserId"") DO UPDATE
SET ""LastReadMessageId"" = GREATEST(""ChatReadStates"".""LastReadMessageId"", EXCLUDED.""LastReadMessageId"");

INSERT INTO ""ChatUserPreferences"" (""UserId"", ""ChatRoomId"", ""IsMuted"", ""SoundEnabled"", ""BackgroundImageKey"", ""UpdatedAtUtc"")
SELECT prefs.""UserId"", map.""KeeperId"", prefs.""IsMuted"", prefs.""SoundEnabled"", prefs.""BackgroundImageKey"", prefs.""UpdatedAtUtc""
FROM ""ChatUserPreferences"" prefs
JOIN ""_ChatRoomDedupMap"" map ON map.""DuplicateId"" = prefs.""ChatRoomId""
ON CONFLICT (""UserId"", ""ChatRoomId"") DO NOTHING;

DELETE FROM ""ChatRoomMembers""
WHERE ""ChatRoomId"" IN (SELECT ""DuplicateId"" FROM ""_ChatRoomDedupMap"");

DELETE FROM ""ChatReadStates""
WHERE ""ChatRoomId"" IN (SELECT ""DuplicateId"" FROM ""_ChatRoomDedupMap"");

DELETE FROM ""ChatUserPreferences""
WHERE ""ChatRoomId"" IN (SELECT ""DuplicateId"" FROM ""_ChatRoomDedupMap"");

DELETE FROM ""ChatRooms""
WHERE ""Id"" IN (SELECT ""DuplicateId"" FROM ""_ChatRoomDedupMap"");

DROP TABLE ""_ChatRoomDedupMap"";
");
                return;
            }

            migrationBuilder.Sql(@"
UPDATE ""ChatRooms""
SET ""DirectKey"" = (
    SELECT CAST(MIN(m.""UserId"") AS TEXT) || ':' || CAST(MAX(m.""UserId"") AS TEXT)
    FROM ""ChatRoomMembers"" m
    WHERE m.""ChatRoomId"" = ""ChatRooms"".""Id""
    GROUP BY m.""ChatRoomId""
    HAVING COUNT(*) = 2
)
WHERE ""Type"" = 3
  AND ""DirectKey"" IS NULL;

CREATE TEMP TABLE ""_ChatRoomDedupMap"" AS
SELECT ""Id"" AS ""DuplicateId"", ""KeeperId""
FROM (
    SELECT c.""Id"",
           FIRST_VALUE(c.""Id"") OVER (
               PARTITION BY c.""WorkspaceId"", c.""DirectKey""
               ORDER BY c.""CreatedAtUtc"", c.""Id"") AS ""KeeperId""
    FROM ""ChatRooms"" c
    WHERE c.""Type"" = 3
      AND c.""DirectKey"" IS NOT NULL
) ranked
WHERE ranked.""Id"" <> ranked.""KeeperId"";

UPDATE ""ChatMessages""
SET ""ChatRoomId"" = (
    SELECT map.""KeeperId""
    FROM ""_ChatRoomDedupMap"" map
    WHERE map.""DuplicateId"" = ""ChatMessages"".""ChatRoomId"")
WHERE ""ChatRoomId"" IN (SELECT ""DuplicateId"" FROM ""_ChatRoomDedupMap"");

INSERT OR IGNORE INTO ""ChatRoomMembers"" (""ChatRoomId"", ""UserId"", ""Role"", ""JoinedAtUtc"")
SELECT map.""KeeperId"", members.""UserId"", members.""Role"", members.""JoinedAtUtc""
FROM ""ChatRoomMembers"" members
JOIN ""_ChatRoomDedupMap"" map ON map.""DuplicateId"" = members.""ChatRoomId"";

INSERT OR IGNORE INTO ""ChatReadStates"" (""ChatRoomId"", ""UserId"", ""LastReadMessageId"")
SELECT map.""KeeperId"", states.""UserId"", states.""LastReadMessageId""
FROM ""ChatReadStates"" states
JOIN ""_ChatRoomDedupMap"" map ON map.""DuplicateId"" = states.""ChatRoomId"";

UPDATE ""ChatReadStates""
SET ""LastReadMessageId"" = (
    SELECT MAX(src.""LastReadMessageId"")
    FROM ""ChatReadStates"" src
    WHERE src.""ChatRoomId"" IN (
        SELECT ""DuplicateId"" FROM ""_ChatRoomDedupMap""
        UNION
        SELECT ""KeeperId"" FROM ""_ChatRoomDedupMap"")
      AND src.""UserId"" = ""ChatReadStates"".""UserId"")
WHERE ""ChatRoomId"" IN (SELECT ""KeeperId"" FROM ""_ChatRoomDedupMap"");

INSERT OR IGNORE INTO ""ChatUserPreferences"" (""UserId"", ""ChatRoomId"", ""IsMuted"", ""SoundEnabled"", ""BackgroundImageKey"", ""UpdatedAtUtc"")
SELECT prefs.""UserId"", map.""KeeperId"", prefs.""IsMuted"", prefs.""SoundEnabled"", prefs.""BackgroundImageKey"", prefs.""UpdatedAtUtc""
FROM ""ChatUserPreferences"" prefs
JOIN ""_ChatRoomDedupMap"" map ON map.""DuplicateId"" = prefs.""ChatRoomId"";

DELETE FROM ""ChatRoomMembers""
WHERE ""ChatRoomId"" IN (SELECT ""DuplicateId"" FROM ""_ChatRoomDedupMap"");

DELETE FROM ""ChatReadStates""
WHERE ""ChatRoomId"" IN (SELECT ""DuplicateId"" FROM ""_ChatRoomDedupMap"");

DELETE FROM ""ChatUserPreferences""
WHERE ""ChatRoomId"" IN (SELECT ""DuplicateId"" FROM ""_ChatRoomDedupMap"");

DELETE FROM ""ChatRooms""
WHERE ""Id"" IN (SELECT ""DuplicateId"" FROM ""_ChatRoomDedupMap"");

DROP TABLE ""_ChatRoomDedupMap"";
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "UX_ChatRooms_WorkspaceId_DirectKey",
                table: "ChatRooms");

            migrationBuilder.DropIndex(
                name: "UX_ChatRooms_WorkspaceId_General",
                table: "ChatRooms");

            migrationBuilder.DropColumn(
                name: "DirectKey",
                table: "ChatRooms");

            migrationBuilder.CreateIndex(
                name: "IX_ChatRooms_WorkspaceId_Type",
                table: "ChatRooms",
                columns: new[] { "WorkspaceId", "Type" },
                filter: "\"Type\" = 3");

            migrationBuilder.CreateIndex(
                name: "IX_ChatRooms_WorkspaceId_Type_Title",
                table: "ChatRooms",
                columns: new[] { "WorkspaceId", "Type", "Title" },
                filter: "\"Type\" = 1");
        }
    }
}
