using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TaskManager.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class EnforceChatClientMessageIdUniqueness : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ChatMessages_ClientMessageId",
                table: "ChatMessages");

            NormalizeDuplicateClientMessageIds(migrationBuilder);

            migrationBuilder.CreateIndex(
                name: "UX_ChatMessages_ChatRoomId_ClientMessageId",
                table: "ChatMessages",
                columns: new[] { "ChatRoomId", "ClientMessageId" },
                unique: true,
                filter: "\"ClientMessageId\" IS NOT NULL");
        }

        private void NormalizeDuplicateClientMessageIds(MigrationBuilder migrationBuilder)
        {
            if (ActiveProvider.Contains("Npgsql", StringComparison.OrdinalIgnoreCase))
            {
                migrationBuilder.Sql(@"
WITH ranked AS (
    SELECT ""Id"",
           ROW_NUMBER() OVER (
               PARTITION BY ""ChatRoomId"", ""ClientMessageId""
               ORDER BY ""CreatedAtUtc"", ""Id"") AS rn
    FROM ""ChatMessages""
    WHERE ""ClientMessageId"" IS NOT NULL
)
UPDATE ""ChatMessages"" m
SET ""ClientMessageId"" = NULL
FROM ranked r
WHERE m.""Id"" = r.""Id""
  AND r.rn > 1;
");
                return;
            }

            migrationBuilder.Sql(@"
WITH ranked AS (
    SELECT ""Id"",
           ROW_NUMBER() OVER (
               PARTITION BY ""ChatRoomId"", ""ClientMessageId""
               ORDER BY ""CreatedAtUtc"", ""Id"") AS rn
    FROM ""ChatMessages""
    WHERE ""ClientMessageId"" IS NOT NULL
)
UPDATE ""ChatMessages""
SET ""ClientMessageId"" = NULL
WHERE ""Id"" IN (SELECT ""Id"" FROM ranked WHERE rn > 1);
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "UX_ChatMessages_ChatRoomId_ClientMessageId",
                table: "ChatMessages");

            migrationBuilder.CreateIndex(
                name: "IX_ChatMessages_ClientMessageId",
                table: "ChatMessages",
                column: "ClientMessageId");
        }
    }
}
