using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AegiTasks.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class FocusVisuals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AccentColor",
                table: "FocusProfiles",
                type: "text",
                nullable: false,
                defaultValue: "#A78BFA");

            migrationBuilder.AddColumn<string>(
                name: "ParticleShape",
                table: "FocusProfiles",
                type: "text",
                nullable: false,
                defaultValue: "mixed");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AccentColor",
                table: "FocusProfiles");

            migrationBuilder.DropColumn(
                name: "ParticleShape",
                table: "FocusProfiles");
        }
    }
}
