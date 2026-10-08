using AegiTasks.Api.Data;
using AegiTasks.Api.Services;

namespace AegiTasks.Api.Endpoints;

public static class PushPreviewEndpoints
{
    public static void MapPushPreviews(this WebApplication app)
    {
        // No browser cookie is required. The capability and current device/account access are required.
        app.MapGet("/api/push/{kind}/{id:guid}", async (string kind, Guid id, HttpContext http, AppDb db, PushPreview preview, CancellationToken ct) => {
            http.Response.Headers.CacheControl = "no-store";
            if (kind is not ("task" or "chat")) return Results.NotFound();
            var notice = await preview.Get(db, id, kind == "chat", http.Request.Headers["X-AegiTasks-Push"].ToString(), ct);
            return notice == null ? Results.NotFound() : Results.Ok(notice);
        }).AllowAnonymous();
    }
}
