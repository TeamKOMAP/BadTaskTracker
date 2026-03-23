using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TaskManager.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddDoneApprovalPendingToTasks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "DoneApprovalPending",
                table: "Tasks",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DoneApprovalRequestedAtUtc",
                table: "Tasks",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DoneApprovalRequestedByUserId",
                table: "Tasks",
                type: "INTEGER",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DoneApprovalPending",
                table: "Tasks");

            migrationBuilder.DropColumn(
                name: "DoneApprovalRequestedAtUtc",
                table: "Tasks");

            migrationBuilder.DropColumn(
                name: "DoneApprovalRequestedByUserId",
                table: "Tasks");
        }
    }
}
