using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AegiTasks.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ChatNotifications : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ChatAlerts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ChatRoomId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChatMessageId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChatAlerts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ChatAlerts_ChatMembers_ChatRoomId_UserId",
                        columns: x => new { x.ChatRoomId, x.UserId },
                        principalTable: "ChatMembers",
                        principalColumns: new[] { "ChatRoomId", "UserId" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ChatAlerts_ChatMessages_ChatMessageId",
                        column: x => x.ChatMessageId,
                        principalTable: "ChatMessages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ChatNotificationPreferences",
                columns: table => new
                {
                    ChatRoomId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<Guid>(type: "uuid", nullable: false),
                    Settings = table.Column<string>(type: "character varying(8000)", maxLength: 8000, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChatNotificationPreferences", x => new { x.ChatRoomId, x.UserId });
                    table.ForeignKey(
                        name: "FK_ChatNotificationPreferences_ChatMembers_ChatRoomId_UserId",
                        columns: x => new { x.ChatRoomId, x.UserId },
                        principalTable: "ChatMembers",
                        principalColumns: new[] { "ChatRoomId", "UserId" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ChatPushDeliveries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    NotificationId = table.Column<Guid>(type: "uuid", nullable: false),
                    DeviceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    NextAttemptAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    FinishedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChatPushDeliveries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ChatPushDeliveries_ChatAlerts_NotificationId",
                        column: x => x.NotificationId,
                        principalTable: "ChatAlerts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ChatPushDeliveries_PushDevices_DeviceId",
                        column: x => x.DeviceId,
                        principalTable: "PushDevices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ChatAlerts_ChatMessageId_UserId",
                table: "ChatAlerts",
                columns: new[] { "ChatMessageId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ChatAlerts_ChatRoomId_UserId",
                table: "ChatAlerts",
                columns: new[] { "ChatRoomId", "UserId" });

            migrationBuilder.CreateIndex(
                name: "IX_ChatAlerts_UserId_CreatedAt",
                table: "ChatAlerts",
                columns: new[] { "UserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ChatPushDeliveries_DeviceId",
                table: "ChatPushDeliveries",
                column: "DeviceId");

            migrationBuilder.CreateIndex(
                name: "IX_ChatPushDeliveries_FinishedAt_NextAttemptAt",
                table: "ChatPushDeliveries",
                columns: new[] { "FinishedAt", "NextAttemptAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ChatPushDeliveries_NotificationId_DeviceId",
                table: "ChatPushDeliveries",
                columns: new[] { "NotificationId", "DeviceId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ChatNotificationPreferences");

            migrationBuilder.DropTable(
                name: "ChatPushDeliveries");

            migrationBuilder.DropTable(
                name: "ChatAlerts");
        }
    }
}
