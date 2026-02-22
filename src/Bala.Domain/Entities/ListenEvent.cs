namespace Bala.Domain.Entities;

public class ListenEvent
{
    public string EventId { get; set; } = Guid.NewGuid().ToString();
    public string ArticleId { get; set; } = string.Empty;
    public string SessionId { get; set; } = string.Empty;
    public string EventType { get; set; } = string.Empty;
    public int PositionSeconds { get; set; }
    public string? UserAgent { get; set; }
    public string? Referrer { get; set; }
    public string? PageUrl { get; set; }
    public DateTime OccurredAt { get; set; } = DateTime.UtcNow;
}
