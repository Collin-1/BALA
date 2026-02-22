namespace Bala.Application.Services;

public interface IListenEventService
{
    Task RecordAsync(ListenEventRecord record, CancellationToken cancellationToken = default);
}

public record ListenEventRecord(
    string ArticleId,
    string SessionId,
    string EventType,
    int PositionSeconds,
    string? UserAgent,
    string? Referrer,
    string? PageUrl);
