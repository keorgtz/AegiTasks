using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AegiTasks.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class SpacesNotesFocusRoles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Tags_Name",
                table: "Tags");

            migrationBuilder.AlterColumn<string>(
                name: "Role",
                table: "Users",
                type: "character varying(40)",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AddColumn<Guid>(
                name: "SpaceId",
                table: "Tags",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "SpaceId",
                table: "Projects",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddUniqueConstraint(
                name: "AK_Projects_Id_SpaceId",
                table: "Projects",
                columns: new[] { "Id", "SpaceId" });

            migrationBuilder.CreateTable(
                name: "FocusProfiles",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    FocusMinutes = table.Column<int>(type: "integer", nullable: false),
                    ShortBreakMinutes = table.Column<int>(type: "integer", nullable: false),
                    LongBreakMinutes = table.Column<int>(type: "integer", nullable: false),
                    Cycles = table.Column<int>(type: "integer", nullable: false),
                    Theme = table.Column<string>(type: "text", nullable: false),
                    Animated = table.Column<bool>(type: "boolean", nullable: false),
                    Sound = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FocusProfiles", x => x.UserId);
                    table.ForeignKey(
                        name: "FK_FocusProfiles_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FocusSessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Goal = table.Column<string>(type: "text", nullable: false),
                    TaskIdsJson = table.Column<string>(type: "text", nullable: false),
                    SpaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    FocusMinutes = table.Column<int>(type: "integer", nullable: false),
                    ShortBreakMinutes = table.Column<int>(type: "integer", nullable: false),
                    LongBreakMinutes = table.Column<int>(type: "integer", nullable: false),
                    Cycles = table.Column<int>(type: "integer", nullable: false),
                    CompletedCycles = table.Column<int>(type: "integer", nullable: false),
                    Phase = table.Column<string>(type: "text", nullable: false),
                    State = table.Column<string>(type: "text", nullable: false),
                    RemainingSeconds = table.Column<int>(type: "integer", nullable: false),
                    EndsAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    StartedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    FinishedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FocusSessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FocusSessions_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Roles",
                columns: table => new
                {
                    Name = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    IsSystem = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Roles", x => x.Name);
                });

            migrationBuilder.CreateTable(
                name: "Spaces",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsPersonal = table.Column<bool>(type: "boolean", nullable: false),
                    InviteHash = table.Column<string>(type: "text", nullable: true),
                    InviteExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Spaces", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Spaces_Users_OwnerId",
                        column: x => x.OwnerId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PagePermissions",
                columns: table => new
                {
                    RoleName = table.Column<string>(type: "character varying(40)", nullable: false),
                    Page = table.Column<string>(type: "text", nullable: false),
                    Allowed = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PagePermissions", x => new { x.RoleName, x.Page });
                    table.ForeignKey(
                        name: "FK_PagePermissions_Roles_RoleName",
                        column: x => x.RoleName,
                        principalTable: "Roles",
                        principalColumn: "Name",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "NoteFolders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SpaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    ParentId = table.Column<Guid>(type: "uuid", nullable: true),
                    Name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NoteFolders", x => x.Id);
                    table.UniqueConstraint("AK_NoteFolders_Id_SpaceId", x => new { x.Id, x.SpaceId });
                    table.ForeignKey(
                        name: "FK_NoteFolders_NoteFolders_ParentId_SpaceId",
                        columns: x => new { x.ParentId, x.SpaceId },
                        principalTable: "NoteFolders",
                        principalColumns: new[] { "Id", "SpaceId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_NoteFolders_Spaces_SpaceId",
                        column: x => x.SpaceId,
                        principalTable: "Spaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SpaceMembers",
                columns: table => new
                {
                    SpaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SpaceMembers", x => new { x.SpaceId, x.UserId });
                    table.ForeignKey(
                        name: "FK_SpaceMembers_Spaces_SpaceId",
                        column: x => x.SpaceId,
                        principalTable: "Spaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SpaceMembers_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Notes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SpaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    FolderId = table.Column<Guid>(type: "uuid", nullable: true),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: true),
                    LinkedTaskId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedById = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Markdown = table.Column<string>(type: "character varying(200000)", maxLength: 200000, nullable: false),
                    Color = table.Column<string>(type: "text", nullable: false),
                    Font = table.Column<string>(type: "text", nullable: false),
                    Pinned = table.Column<bool>(type: "boolean", nullable: false),
                    Archived = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Notes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Notes_NoteFolders_FolderId_SpaceId",
                        columns: x => new { x.FolderId, x.SpaceId },
                        principalTable: "NoteFolders",
                        principalColumns: new[] { "Id", "SpaceId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Notes_Projects_ProjectId_SpaceId",
                        columns: x => new { x.ProjectId, x.SpaceId },
                        principalTable: "Projects",
                        principalColumns: new[] { "Id", "SpaceId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Notes_Spaces_SpaceId",
                        column: x => x.SpaceId,
                        principalTable: "Spaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Users_Role",
                table: "Users",
                column: "Role");

            migrationBuilder.CreateIndex(
                name: "IX_Tags_SpaceId_Name",
                table: "Tags",
                columns: new[] { "SpaceId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Projects_SpaceId",
                table: "Projects",
                column: "SpaceId");

            migrationBuilder.CreateIndex(
                name: "IX_FocusSessions_UserId",
                table: "FocusSessions",
                column: "UserId",
                unique: true,
                filter: "\"FinishedAt\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_NoteFolders_ParentId_SpaceId",
                table: "NoteFolders",
                columns: new[] { "ParentId", "SpaceId" });

            migrationBuilder.CreateIndex(
                name: "IX_NoteFolders_SpaceId",
                table: "NoteFolders",
                column: "SpaceId");

            migrationBuilder.CreateIndex(
                name: "IX_Notes_FolderId_SpaceId",
                table: "Notes",
                columns: new[] { "FolderId", "SpaceId" });

            migrationBuilder.CreateIndex(
                name: "IX_Notes_ProjectId_SpaceId",
                table: "Notes",
                columns: new[] { "ProjectId", "SpaceId" });

            migrationBuilder.CreateIndex(
                name: "IX_Notes_SpaceId_FolderId_Archived",
                table: "Notes",
                columns: new[] { "SpaceId", "FolderId", "Archived" });

            migrationBuilder.CreateIndex(
                name: "IX_SpaceMembers_UserId",
                table: "SpaceMembers",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Spaces_OwnerId",
                table: "Spaces",
                column: "OwnerId",
                unique: true,
                filter: "\"IsPersonal\" = TRUE");

            // Preserve the former shared team before enabling space foreign keys.
            migrationBuilder.Sql("""
                INSERT INTO "Roles" ("Name", "IsSystem") VALUES ('Admin', TRUE), ('User', TRUE);
                UPDATE "Users" SET "Role" = 'User', "SessionVersion" = "SessionVersion" + 1 WHERE "Role" = 'Member';
                INSERT INTO "PagePermissions" ("RoleName", "Page", "Allowed")
                SELECT r."Name", p.page, TRUE FROM "Roles" r CROSS JOIN
                (VALUES ('tasks'), ('projects'), ('notes'), ('focus'), ('spaces'), ('settings')) AS p(page);
                INSERT INTO "Spaces" ("Id", "Name", "OwnerId", "IsPersonal")
                SELECT '11111111-1111-4111-8111-111111111111'::uuid, 'Equipo existente', "Id", FALSE
                FROM "Users" ORDER BY CASE WHEN "Role" = 'Admin' THEN 0 ELSE 1 END, "Id" LIMIT 1;
                INSERT INTO "SpaceMembers" ("SpaceId", "UserId")
                SELECT '11111111-1111-4111-8111-111111111111'::uuid, "Id" FROM "Users";
                UPDATE "Projects" SET "SpaceId" = '11111111-1111-4111-8111-111111111111'::uuid;
                UPDATE "Tags" SET "SpaceId" = '11111111-1111-4111-8111-111111111111'::uuid;
                INSERT INTO "Spaces" ("Id", "Name", "OwnerId", "IsPersonal")
                SELECT md5('personal-space-' || "Id"::text)::uuid, 'Personal', "Id", TRUE FROM "Users";
                INSERT INTO "Tags" ("Id", "SpaceId", "Name", "Color")
                SELECT md5(s."Id"::text || t.name)::uuid, s."Id", t.name, t.color FROM "Spaces" s
                CROSS JOIN (VALUES ('BUG','red'), ('ADD','green'), ('FIX','blue')) AS t(name,color)
                WHERE s."IsPersonal" = TRUE;
                """);

            migrationBuilder.AddForeignKey(
                name: "FK_Projects_Spaces_SpaceId",
                table: "Projects",
                column: "SpaceId",
                principalTable: "Spaces",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Tags_Spaces_SpaceId",
                table: "Tags",
                column: "SpaceId",
                principalTable: "Spaces",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Users_Roles_Role",
                table: "Users",
                column: "Role",
                principalTable: "Roles",
                principalColumn: "Name",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            throw new NotSupportedException("Spaces contain private data. Restore a verified backup to return to the previous schema.");
        }
    }
}
