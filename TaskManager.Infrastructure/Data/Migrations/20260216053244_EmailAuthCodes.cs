using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TaskManager.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class EmailAuthCodes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "EmailAuthCodes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Email = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    CodeHash = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    CodeSalt = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    AttemptsUsed = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 0),
                    IsConsumed = table.Column<bool>(type: "INTEGER", nullable: false, defaultValue: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ResendAvailableAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ConsumedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EmailAuthCodes", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EmailAuthCodes_CreatedAtUtc",
                table: "EmailAuthCodes",
                column: "CreatedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_EmailAuthCodes_Email",
                table: "EmailAuthCodes",
                column: "Email");

            migrationBuilder.CreateIndex(
                name: "IX_EmailAuthCodes_Email_IsConsumed_ExpiresAtUtc",
                table: "EmailAuthCodes",
                columns: new[] { "Email", "IsConsumed", "ExpiresAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EmailAuthCodes");
        }
    }
}
