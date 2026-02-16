using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TaskManager.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class WorkspaceIsolation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Tasks_DueDate",
                table: "Tasks");

            migrationBuilder.DropIndex(
                name: "IX_Tasks_Priority",
                table: "Tasks");

            migrationBuilder.DropIndex(
                name: "IX_Tasks_Status",
                table: "Tasks");

            migrationBuilder.DropIndex(
                name: "IX_Tags_Name",
                table: "Tags");

            migrationBuilder.AddColumn<int>(
                name: "WorkspaceId",
                table: "Tasks",
                type: "INTEGER",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<int>(
                name: "WorkspaceId",
                table: "Tags",
                type: "INTEGER",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateTable(
                name: "Workspaces",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    AvatarPath = table.Column<string>(type: "TEXT", maxLength: 400, nullable: true),
                    CreatedByUserId = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false, defaultValueSql: "datetime('now')")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Workspaces", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Workspaces_Users_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "WorkspaceMembers",
                columns: table => new
                {
                    WorkspaceId = table.Column<int>(type: "INTEGER", nullable: false),
                    UserId = table.Column<int>(type: "INTEGER", nullable: false),
                    Role = table.Column<int>(type: "INTEGER", nullable: false),
                    AddedAt = table.Column<DateTime>(type: "TEXT", nullable: false, defaultValueSql: "datetime('now')")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkspaceMembers", x => new { x.WorkspaceId, x.UserId });
                    table.ForeignKey(
                        name: "FK_WorkspaceMembers_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_WorkspaceMembers_Workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalTable: "Workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.Sql(@"
                INSERT INTO Users (Name, Email, CreatedAt)
                SELECT 'System', 'system@goodtask.local', datetime('now')
                WHERE NOT EXISTS (SELECT 1 FROM Users);
            ");

            migrationBuilder.Sql(@"
                INSERT INTO Workspaces (Name, AvatarPath, CreatedByUserId, CreatedAt)
                SELECT 'General', NULL, Id, datetime('now')
                FROM Users
                ORDER BY Id
                LIMIT 1;
            ");

            migrationBuilder.Sql(@"
                UPDATE Tasks
                SET WorkspaceId = (SELECT Id FROM Workspaces ORDER BY Id LIMIT 1)
                WHERE WorkspaceId IS NULL OR WorkspaceId = 0;
            ");

            migrationBuilder.Sql(@"
                UPDATE Tags
                SET WorkspaceId = (SELECT Id FROM Workspaces ORDER BY Id LIMIT 1)
                WHERE WorkspaceId IS NULL OR WorkspaceId = 0;
            ");

            migrationBuilder.Sql(@"
                INSERT INTO WorkspaceMembers (WorkspaceId, UserId, Role, AddedAt)
                SELECT
                    ws.Id,
                    u.Id,
                    CASE WHEN u.Id = ws.CreatedByUserId THEN 3 ELSE 1 END,
                    datetime('now')
                FROM Users u
                CROSS JOIN (SELECT Id, CreatedByUserId FROM Workspaces ORDER BY Id LIMIT 1) ws;
            ");

            migrationBuilder.CreateIndex(
                name: "IX_Tasks_WorkspaceId",
                table: "Tasks",
                column: "WorkspaceId");

            migrationBuilder.CreateIndex(
                name: "IX_Tasks_WorkspaceId_AssigneeId",
                table: "Tasks",
                columns: new[] { "WorkspaceId", "AssigneeId" });

            migrationBuilder.CreateIndex(
                name: "IX_Tasks_WorkspaceId_DueDate",
                table: "Tasks",
                columns: new[] { "WorkspaceId", "DueDate" });

            migrationBuilder.CreateIndex(
                name: "IX_Tasks_WorkspaceId_Priority",
                table: "Tasks",
                columns: new[] { "WorkspaceId", "Priority" });

            migrationBuilder.CreateIndex(
                name: "IX_Tasks_WorkspaceId_Status",
                table: "Tasks",
                columns: new[] { "WorkspaceId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_Tags_WorkspaceId",
                table: "Tags",
                column: "WorkspaceId");

            migrationBuilder.CreateIndex(
                name: "IX_Tags_WorkspaceId_Name",
                table: "Tags",
                columns: new[] { "WorkspaceId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WorkspaceMembers_Role",
                table: "WorkspaceMembers",
                column: "Role");

            migrationBuilder.CreateIndex(
                name: "IX_WorkspaceMembers_UserId",
                table: "WorkspaceMembers",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Workspaces_CreatedAt",
                table: "Workspaces",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_Workspaces_CreatedByUserId",
                table: "Workspaces",
                column: "CreatedByUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_Tags_Workspaces_WorkspaceId",
                table: "Tags",
                column: "WorkspaceId",
                principalTable: "Workspaces",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Tasks_Workspaces_WorkspaceId",
                table: "Tasks",
                column: "WorkspaceId",
                principalTable: "Workspaces",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Tags_Workspaces_WorkspaceId",
                table: "Tags");

            migrationBuilder.DropForeignKey(
                name: "FK_Tasks_Workspaces_WorkspaceId",
                table: "Tasks");

            migrationBuilder.DropTable(
                name: "WorkspaceMembers");

            migrationBuilder.DropTable(
                name: "Workspaces");

            migrationBuilder.DropIndex(
                name: "IX_Tasks_WorkspaceId",
                table: "Tasks");

            migrationBuilder.DropIndex(
                name: "IX_Tasks_WorkspaceId_AssigneeId",
                table: "Tasks");

            migrationBuilder.DropIndex(
                name: "IX_Tasks_WorkspaceId_DueDate",
                table: "Tasks");

            migrationBuilder.DropIndex(
                name: "IX_Tasks_WorkspaceId_Priority",
                table: "Tasks");

            migrationBuilder.DropIndex(
                name: "IX_Tasks_WorkspaceId_Status",
                table: "Tasks");

            migrationBuilder.DropIndex(
                name: "IX_Tags_WorkspaceId",
                table: "Tags");

            migrationBuilder.DropIndex(
                name: "IX_Tags_WorkspaceId_Name",
                table: "Tags");

            migrationBuilder.DropColumn(
                name: "WorkspaceId",
                table: "Tasks");

            migrationBuilder.DropColumn(
                name: "WorkspaceId",
                table: "Tags");

            migrationBuilder.CreateIndex(
                name: "IX_Tasks_DueDate",
                table: "Tasks",
                column: "DueDate");

            migrationBuilder.CreateIndex(
                name: "IX_Tasks_Priority",
                table: "Tasks",
                column: "Priority");

            migrationBuilder.CreateIndex(
                name: "IX_Tasks_Status",
                table: "Tasks",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_Tags_Name",
                table: "Tags",
                column: "Name",
                unique: true);
        }
    }
}
