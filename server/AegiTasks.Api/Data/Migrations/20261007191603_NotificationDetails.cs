using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AegiTasks.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class NotificationDetails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "Message",
                table: "Notifications",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200);

            migrationBuilder.AddColumn<string>(
                name: "TaskTitle",
                table: "Notifications",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            // Existing notices only retained the task reference; backfill its current title.
            migrationBuilder.Sql("UPDATE \"Notifications\" SET \"TaskTitle\" = COALESCE((SELECT \"Title\" FROM \"Tasks\" WHERE \"Tasks\".\"Id\" = \"Notifications\".\"WorkItemId\"), '') WHERE \"TaskTitle\" = '';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TaskTitle",
                table: "Notifications");

            migrationBuilder.AlterColumn<string>(
                name: "Message",
                table: "Notifications",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(2000)",
                oldMaxLength: 2000);
        }
    }
}
