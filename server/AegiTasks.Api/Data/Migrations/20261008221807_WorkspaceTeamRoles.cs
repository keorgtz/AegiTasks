using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AegiTasks.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class WorkspaceTeamRoles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TeamRoles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SpaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    NormalizedName = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    Description = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: false),
                    Version = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeamRoles", x => x.Id);
                    table.UniqueConstraint("AK_TeamRoles_Id_SpaceId", x => new { x.Id, x.SpaceId });
                    table.ForeignKey(
                        name: "FK_TeamRoles_Spaces_SpaceId",
                        column: x => x.SpaceId,
                        principalTable: "Spaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TeamRoleAssignments",
                columns: table => new
                {
                    SpaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    TeamRoleId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeamRoleAssignments", x => new { x.SpaceId, x.UserId });
                    table.ForeignKey(
                        name: "FK_TeamRoleAssignments_SpaceMembers_SpaceId_UserId",
                        columns: x => new { x.SpaceId, x.UserId },
                        principalTable: "SpaceMembers",
                        principalColumns: new[] { "SpaceId", "UserId" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TeamRoleAssignments_TeamRoles_TeamRoleId_SpaceId",
                        columns: x => new { x.TeamRoleId, x.SpaceId },
                        principalTable: "TeamRoles",
                        principalColumns: new[] { "Id", "SpaceId" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TeamRoleAssignments_TeamRoleId_SpaceId",
                table: "TeamRoleAssignments",
                columns: new[] { "TeamRoleId", "SpaceId" });

            migrationBuilder.CreateIndex(
                name: "IX_TeamRoles_SpaceId_NormalizedName",
                table: "TeamRoles",
                columns: new[] { "SpaceId", "NormalizedName" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TeamRoleAssignments");

            migrationBuilder.DropTable(
                name: "TeamRoles");
        }
    }
}
