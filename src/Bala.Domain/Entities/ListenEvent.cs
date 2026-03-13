namespace Bala.Domain.Entities;

/// <summary>
/// Represents a playback telemetry event recorded by the widget.
/// </summary>
public class ListenEvent
{
    /// <summary>
    /// Unique identifier for the listen event.
    /// </summary>
    public string EventId { get; set; } = Guid.NewGuid().ToString();
    /// <summary>
    /// Article identifier the event refers to.
    /// </summary>
    public string ArticleId { get; set; } = string.Empty;
    /// <summary>
    /// Session identifier for the widget instance.
    /// </summary>
    public string SessionId { get; set; } = string.Empty;
    /// <summary>
    /// Event type such as play, pause, resume, stop, ended.
    /// </summary>
    public string EventType { get; set; } = string.Empty;
    /// <summary>
    /// Approximate playback position in seconds.
    /// </summary>
    public int PositionSeconds { get; set; }
    /// <summary>
    /// User agent string when provided by the client.
    /// </summary>
    public string? UserAgent { get; set; }
    /// <summary>
    /// HTTP referrer or document referrer when provided.
    /// </summary>
    public string? Referrer { get; set; }
    /// <summary>
    /// Page URL where playback occurred.
    /// </summary>
    public string? PageUrl { get; set; }
    /// <summary>
    /// UTC timestamp when the event occurred.
    /// </summary>
    public DateTime OccurredAt { get; set; } = DateTime.UtcNow;
}
