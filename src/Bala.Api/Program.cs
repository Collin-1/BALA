using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Bala.Application;
using Bala.Application.Services;
using Bala.Application.Options;
using Bala.Shared;
using Bala.Infrastructure;
using Bala.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.Configure<ArticleCacheOptions>(builder.Configuration.GetSection("ArticleCache"));
builder.Services.AddCors(options =>
{
    options.AddPolicy("BalaCors", policy =>
    {
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
    });
});
builder.Services.AddRateLimiter(options =>
{
    var permitLimit = builder.Configuration.GetValue<int?>("RateLimiting:PermitLimit") ?? 60;
    var windowSeconds = builder.Configuration.GetValue<int?>("RateLimiting:WindowSeconds") ?? 60;
    var queueLimit = builder.Configuration.GetValue<int?>("RateLimiting:QueueLimit") ?? 0;

    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("bala", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = permitLimit,
                Window = TimeSpan.FromSeconds(windowSeconds),
                QueueLimit = queueLimit,
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                AutoReplenishment = true
            }));
});
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});

var app = builder.Build();

await EnsureDatabaseAsync(app.Services);

app.UseCors("BalaCors");
app.UseRateLimiter();
app.UseStaticFiles();

app.MapGet("/health", () => Results.Text("ok", "text/plain"));

app.MapGet("/v1/articles/by-url", async (
    [FromQuery] string url,
    [FromQuery] bool? refresh,
    IArticleService service,
    ILogger<Program> logger,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(url) || url.Length > 2048)
    {
        return Results.Json(ApiResponse<object>.Fail("invalid_url", "URL must be a valid absolute http/https URL."), statusCode: StatusCodes.Status400BadRequest);
    }

    if (!Uri.TryCreate(url, UriKind.Absolute, out var parsed) || (parsed.Scheme != Uri.UriSchemeHttp && parsed.Scheme != Uri.UriSchemeHttps))
    {
        return Results.Json(ApiResponse<object>.Fail("invalid_url", "URL must be absolute http/https."), statusCode: StatusCodes.Status400BadRequest);
    }

    try
    {
        var result = await service.GetByUrlAsync(parsed.ToString(), refresh ?? false, cancellationToken);
        return Results.Json(ApiResponse<ArticleResponse>.Ok(ArticleResponse.From(result)), statusCode: StatusCodes.Status200OK);
    }
    catch (TimeoutException ex)
    {
        logger.LogWarning(ex, "Extraction timeout for {Url}", parsed.ToString());
        return Results.Json(ApiResponse<object>.Fail("extraction_failed", "Timed out while extracting article.", ex.Message), statusCode: StatusCodes.Status422UnprocessableEntity);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Error extracting article for {Url}", parsed.ToString());
        return Results.Json(ApiResponse<object>.Fail("server_error", "Unexpected error while fetching article.", ex.Message), statusCode: StatusCodes.Status500InternalServerError);
    }
}).RequireRateLimiting("bala");

app.MapGet("/v1/articles/{articleId}", async (string articleId, IArticleService service, CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(articleId))
    {
        return Results.Json(ApiResponse<object>.Fail("invalid_article", "Article ID is required."), statusCode: StatusCodes.Status400BadRequest);
    }

    var result = await service.GetByIdAsync(articleId, cancellationToken);
    if (result == null)
    {
        return Results.Json(ApiResponse<object>.Fail("not_found", "Article not found."), statusCode: StatusCodes.Status404NotFound);
    }

    return Results.Json(ApiResponse<ArticleResponse>.Ok(ArticleResponse.From(result)));
}).RequireRateLimiting("bala");

app.MapPost("/v1/articles/from-html", async ([FromBody] FromHtmlRequest request, IArticleService service, CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Html))
    {
        return Results.Json(ApiResponse<object>.Fail("invalid_body", "Html is required."), statusCode: StatusCodes.Status400BadRequest);
    }

    if (request.Html.Length > 1_000_000)
    {
        return Results.Json(ApiResponse<object>.Fail("payload_too_large", "Html payload too large."), statusCode: StatusCodes.Status413PayloadTooLarge);
    }

    if (!string.IsNullOrWhiteSpace(request.SourceUrl) && !Uri.TryCreate(request.SourceUrl, UriKind.Absolute, out _))
    {
        return Results.Json(ApiResponse<object>.Fail("invalid_url", "SourceUrl must be absolute."), statusCode: StatusCodes.Status400BadRequest);
    }

    var result = await service.CreateFromHtmlAsync(request.SourceUrl, request.Title, request.Html, cancellationToken);
    return Results.Json(ApiResponse<ArticleResponse>.Ok(ArticleResponse.From(result)), statusCode: StatusCodes.Status201Created);
}).RequireRateLimiting("bala");

app.MapPost("/v1/events/listen", async (
    [FromBody] ListenEventRequest request,
    IListenEventService service,
    HttpContext context,
    CancellationToken cancellationToken) =>
{
    if (!ListenEventRequest.ValidTypes.Contains(request.EventType))
    {
        return Results.Json(ApiResponse<object>.Fail("invalid_event", "Unsupported event type."), statusCode: StatusCodes.Status400BadRequest);
    }

    if (string.IsNullOrWhiteSpace(request.ArticleId) || string.IsNullOrWhiteSpace(request.SessionId))
    {
        return Results.Json(ApiResponse<object>.Fail("invalid_event", "ArticleId and SessionId are required."), statusCode: StatusCodes.Status400BadRequest);
    }

    if (request.PositionSeconds < 0 || request.PositionSeconds > 86_400)
    {
        return Results.Json(ApiResponse<object>.Fail("invalid_event", "PositionSeconds must be within a valid range."), statusCode: StatusCodes.Status400BadRequest);
    }

    var ua = request.UserAgent ?? context.Request.Headers.UserAgent.ToString();
    var record = new ListenEventRecord(request.ArticleId, request.SessionId, request.EventType, request.PositionSeconds, ua, request.Referrer, request.PageUrl);
    await service.RecordAsync(record, cancellationToken);
    return Results.StatusCode(StatusCodes.Status204NoContent);
}).RequireRateLimiting("bala");

app.MapGet("/embed/v1/widget", async context =>
{
    context.Response.ContentType = "text/html";
    await context.Response.SendFileAsync(Path.Combine(app.Environment.ContentRootPath, "wwwroot", "embed", "v1", "widget.html"));
});

app.Run();

static async Task EnsureDatabaseAsync(IServiceProvider services)
{
    using var scope = services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<BalaDbContext>();
    await db.Database.EnsureCreatedAsync();
}

internal record FromHtmlRequest(
    [property: JsonPropertyName("sourceUrl")] string? SourceUrl,
    [property: JsonPropertyName("title")] string? Title,
    [property: JsonPropertyName("html")] string Html);

internal record ListenEventRequest(
    [property: JsonPropertyName("articleId")] string ArticleId,
    [property: JsonPropertyName("eventType")] string EventType,
    [property: JsonPropertyName("positionSeconds")] int PositionSeconds,
    [property: JsonPropertyName("sessionId")] string SessionId,
    [property: JsonPropertyName("userAgent")] string? UserAgent,
    [property: JsonPropertyName("referrer")] string? Referrer,
    [property: JsonPropertyName("pageUrl")] string? PageUrl)
{
    public static readonly HashSet<string> ValidTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "play", "pause", "resume", "stop", "ended", "error"
    };
}

internal record ArticleResponse
{
    [JsonPropertyName("articleId")]
    public string ArticleId { get; init; } = string.Empty;

    [JsonPropertyName("sourceUrl")]
    public string? SourceUrl { get; init; }

    [JsonPropertyName("title")]
    public string? Title { get; init; }

    [JsonPropertyName("cleanText")]
    public string CleanText { get; init; } = string.Empty;

    [JsonPropertyName("language")]
    public string? Language { get; init; }

    [JsonPropertyName("wordCount")]
    public int WordCount { get; init; }

    [JsonPropertyName("estimatedMinutes")]
    public double EstimatedMinutes { get; init; }

    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; init; }

    [JsonPropertyName("lastRefreshedAt")]
    public DateTime LastRefreshedAt { get; init; }

    public static ArticleResponse From(Bala.Application.Models.ArticleResult result) => new()
    {
        ArticleId = result.ArticleId,
        SourceUrl = result.SourceUrl,
        Title = result.Title,
        CleanText = result.CleanText,
        Language = result.Language,
        WordCount = result.WordCount,
        EstimatedMinutes = result.EstimatedMinutes,
        CreatedAt = result.CreatedAt,
        LastRefreshedAt = result.LastRefreshedAt
    };
}
