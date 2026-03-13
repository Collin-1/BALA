namespace Bala.Application.Services;

/// <summary>
/// Records listen events emitted by the widget.
/// </summary>
public interface IListenEventService
{
    /// <summary>
    /// Records a listen event.
    /// </summary>
    Task RecordAsync(ListenEventRecord record, CancellationToken cancellationToken = default);
}

/// <summary>
/// Represents a listen event payload from the client.
/// </summary>
public record ListenEventRecord
{
    /// <summary>
    /// Initializes a new instance of the <see cref="ListenEventRecord"/> record.
    /// </summary>
    public ListenEventRecord(
        string articleId,
        string sessionId,
        string eventType,
        int positionSeconds,
        string? userAgent,
        string? referrer,
        string? pageUrl)
    {
        ArticleId = articleId;
        SessionId = sessionId;
        EventType = eventType;
        PositionSeconds = positionSeconds;
        UserAgent = userAgent;
        Referrer = referrer;
        PageUrl = pageUrl;
    }

    /// <summary>
    /// Article identifier.
    /// </summary>
    public string ArticleId { get; init; }

    /// <summary>
    /// Widget session identifier.
    /// </summary>
    public string SessionId { get; init; }

    /// <summary>
    /// Event type such as play, pause, resume, stop, ended.
    /// </summary>
    public string EventType { get; init; }

    /// <summary>
    /// Approximate playback position in seconds.
    /// </summary>
    public int PositionSeconds { get; init; }

    /// <summary>
    /// User agent string when provided.
    /// </summary>
    public string? UserAgent { get; init; }

    /// <summary>
    /// HTTP referrer or document referrer when provided.
    /// </summary>
    public string? Referrer { get; init; }

    /// <summary>
    /// Page URL where playback occurred.
    /// </summary>
    public string? PageUrl { get; init; }
}
