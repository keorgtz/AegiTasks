using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AegiTasks.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Usernames : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Username",
                table: "Users",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "");

            // Assign existing accounts deterministic unique handles before creating the index.
            // Email login and password hashes remain unchanged.
            migrationBuilder.Sql("""
                DO $$
                DECLARE account record; stem text; candidate text; suffix integer;
                BEGIN
                    FOR account IN SELECT "Id", "Email" FROM "Users" ORDER BY "Email", "Id" LOOP
                        stem := left(btrim(regexp_replace(lower(split_part(account."Email", '@', 1)), '[^a-z0-9._-]+', '-', 'g'), '._-'), 32);
                        IF length(stem) < 3 THEN stem := 'user'; END IF;
                        candidate := stem; suffix := 2;
                        WHILE EXISTS (SELECT 1 FROM "Users" WHERE "Username" = candidate) LOOP
                            candidate := stem || '-' || suffix; suffix := suffix + 1;
                        END LOOP;
                        UPDATE "Users" SET "Username" = candidate WHERE "Id" = account."Id";
                    END LOOP;
                END $$;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_Users_Username",
                table: "Users",
                column: "Username",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Users_Username",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Username",
                table: "Users");
        }
    }
}
