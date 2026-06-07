using System.Collections.Concurrent;
using Microsoft.Extensions.FileProviders;

// =============================================================================
// Listen-to-this-article — analytics backend (ASP.NET Core minimal API, .NET 10)
//
// - POST /api/track          record an engagement event
// - GET  /api/stats/{siteId} play / completion counts for a publisher
// - Serves the demo static files (../public) so the widget + API are same-origin
// - CORS open to any origin so the widget works when embedded on real sites
//
// Storage is a thread-safe in-memory list (free-tier, zero setup). It lives
// behind IEventStore, so swapping in SQLite later is a single-class change and
// does not touch the endpoints.
// =============================================================================

var builder = WebApplication.CreateBuilder(args);

const string CorsPolicy = "WidgetCors";
builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicy, policy =>
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

// Storage abstraction — swap InMemoryEventStore for a SQLite-backed one later.
builder.Services.AddSingleton<IEventStore, InMemoryEventStore>();

var app = builder.Build();

app.UseCors(CorsPolicy);

// ---- Serve the demo / widget static files from the sibling public/ folder ----
var publicDir = Path.GetFullPath(
    Path.Combine(builder.Environment.ContentRootPath, "..", "public"));
if (Directory.Exists(publicDir))
{
    var provider = new PhysicalFileProvider(publicDir);
    app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = provider });
    app.UseStaticFiles(new StaticFileOptions { FileProvider = provider });
}

// ---- API ----------------------------------------------------------------- //

// POST /api/track  — record an event fired by the widget.
app.MapPost("/api/track", (TrackEvent ev, IEventStore store) =>
{
    if (string.IsNullOrWhiteSpace(ev.SiteId) || string.IsNullOrWhiteSpace(ev.Action))
        return Results.BadRequest(new { error = "siteId and action are required" });

    var stored = ev with
    {
        // Server-stamp the receive time; trust client timestamp only as a hint.
        ReceivedAt = DateTimeOffset.UtcNow,
        Timestamp = ev.Timestamp ?? DateTimeOffset.UtcNow
    };
    store.Add(stored);
    return Results.Accepted();
});

// GET /api/stats/{siteId}  — engagement summary for a publisher.
app.MapGet("/api/stats/{siteId}", (string siteId, IEventStore store) =>
{
    var events = store.ForSite(siteId);
    var plays = events.Count(e => string.Equals(e.Action, "play", StringComparison.OrdinalIgnoreCase));
    var completes = events.Count(e => string.Equals(e.Action, "complete", StringComparison.OrdinalIgnoreCase));

    return Results.Ok(new
    {
        siteId,
        playCount = plays,
        completeCount = completes,
        completionRate = plays > 0 ? Math.Round((double)completes / plays, 3) : 0,
        totalEvents = events.Count,
        // Per-article breakdown for a basic publisher dashboard.
        byArticle = events
            .GroupBy(e => e.ArticleUrl ?? "(unknown)")
            .Select(g => new
            {
                articleUrl = g.Key,
                plays = g.Count(e => string.Equals(e.Action, "play", StringComparison.OrdinalIgnoreCase)),
                completes = g.Count(e => string.Equals(e.Action, "complete", StringComparison.OrdinalIgnoreCase))
            })
            .OrderByDescending(a => a.plays)
            .ToList()
    });
});

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

app.Run();


// ============================= Types & storage ============================= //

/// <summary>An engagement event sent by the embed widget.</summary>
public record TrackEvent(string SiteId, string? ArticleUrl, string Action)
{
    public DateTimeOffset? Timestamp { get; init; }
    public DateTimeOffset? ReceivedAt { get; init; }
}

public interface IEventStore
{
    void Add(TrackEvent ev);
    IReadOnlyList<TrackEvent> ForSite(string siteId);
}

/// <summary>
/// Thread-safe in-memory store. Free-tier, no setup, resets on restart.
/// Swap for a SQLite-backed IEventStore to persist across restarts.
/// </summary>
public sealed class InMemoryEventStore : IEventStore
{
    private readonly ConcurrentBag<TrackEvent> _events = new();

    public void Add(TrackEvent ev) => _events.Add(ev);

    public IReadOnlyList<TrackEvent> ForSite(string siteId) =>
        _events.Where(e => string.Equals(e.SiteId, siteId, StringComparison.OrdinalIgnoreCase))
               .ToList();
}
