using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AegiTasks.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ProjectPlanning : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CycleId",
                table: "Tasks",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EstimateCategory",
                table: "Tasks",
                type: "character varying(5)",
                maxLength: 5,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EstimateKind",
                table: "Tasks",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "time");

            migrationBuilder.AddColumn<int>(
                name: "EstimatePoints",
                table: "Tasks",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ModuleId",
                table: "Tasks",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EstimateScheme",
                table: "Projects",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "time");

            migrationBuilder.CreateTable(
                name: "Cycles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    Color = table.Column<string>(type: "text", nullable: false),
                    StartsOn = table.Column<DateOnly>(type: "date", nullable: true),
                    EndsOn = table.Column<DateOnly>(type: "date", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Cycles", x => x.Id);
                    table.UniqueConstraint("AK_Cycles_Id_ProjectId", x => new { x.Id, x.ProjectId });
                    table.ForeignKey(
                        name: "FK_Cycles_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Modules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    Color = table.Column<string>(type: "text", nullable: false),
                    StartsOn = table.Column<DateOnly>(type: "date", nullable: true),
                    EndsOn = table.Column<DateOnly>(type: "date", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Modules", x => x.Id);
                    table.UniqueConstraint("AK_Modules_Id_ProjectId", x => new { x.Id, x.ProjectId });
                    table.ForeignKey(
                        name: "FK_Modules_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Tasks_CycleId_ProjectId",
                table: "Tasks",
                columns: new[] { "CycleId", "ProjectId" });

            migrationBuilder.CreateIndex(
                name: "IX_Tasks_ModuleId_ProjectId",
                table: "Tasks",
                columns: new[] { "ModuleId", "ProjectId" });

            migrationBuilder.CreateIndex(
                name: "IX_Cycles_ProjectId_Name",
                table: "Cycles",
                columns: new[] { "ProjectId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Modules_ProjectId_Name",
                table: "Modules",
                columns: new[] { "ProjectId", "Name" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Tasks_Cycles_CycleId_ProjectId",
                table: "Tasks",
                columns: new[] { "CycleId", "ProjectId" },
                principalTable: "Cycles",
                principalColumns: new[] { "Id", "ProjectId" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Tasks_Modules_ModuleId_ProjectId",
                table: "Tasks",
                columns: new[] { "ModuleId", "ProjectId" },
                principalTable: "Modules",
                principalColumns: new[] { "Id", "ProjectId" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Tasks_Cycles_CycleId_ProjectId",
                table: "Tasks");

            migrationBuilder.DropForeignKey(
                name: "FK_Tasks_Modules_ModuleId_ProjectId",
                table: "Tasks");

            migrationBuilder.DropTable(
                name: "Cycles");

            migrationBuilder.DropTable(
                name: "Modules");

            migrationBuilder.DropIndex(
                name: "IX_Tasks_CycleId_ProjectId",
                table: "Tasks");

            migrationBuilder.DropIndex(
                name: "IX_Tasks_ModuleId_ProjectId",
                table: "Tasks");

            migrationBuilder.DropColumn(
                name: "CycleId",
                table: "Tasks");

            migrationBuilder.DropColumn(
                name: "EstimateCategory",
                table: "Tasks");

            migrationBuilder.DropColumn(
                name: "EstimateKind",
                table: "Tasks");

            migrationBuilder.DropColumn(
                name: "EstimatePoints",
                table: "Tasks");

            migrationBuilder.DropColumn(
                name: "ModuleId",
                table: "Tasks");

            migrationBuilder.DropColumn(
                name: "EstimateScheme",
                table: "Projects");
        }
    }
}
