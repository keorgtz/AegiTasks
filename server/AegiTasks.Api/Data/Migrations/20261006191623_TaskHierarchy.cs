using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AegiTasks.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class TaskHierarchy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ParentTaskId",
                table: "Tasks",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Tasks_ParentTaskId_ProjectId",
                table: "Tasks",
                columns: new[] { "ParentTaskId", "ProjectId" });

            migrationBuilder.AddForeignKey(
                name: "FK_Tasks_Tasks_ParentTaskId",
                table: "Tasks",
                column: "ParentTaskId",
                principalTable: "Tasks",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Tasks_Tasks_ParentTaskId",
                table: "Tasks");

            migrationBuilder.DropIndex(
                name: "IX_Tasks_ParentTaskId_ProjectId",
                table: "Tasks");

            migrationBuilder.DropColumn(
                name: "ParentTaskId",
                table: "Tasks");
        }
    }
}
