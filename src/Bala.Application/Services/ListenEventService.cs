using Bala.Application.Repositories;
using Bala.Domain.Entities;

namespace Bala.Application.Services;

/// <summary>
/// Persists listen events in the data store.
/// </summary>
public class ListenEventService : IListenEventService
{
    private readonly IListenEventRepository _repository;

    /// <summary>
    /// Initializes a new instance of the <see cref="ListenEventService"/> class.
    /// </summary>
    public ListenEventService(IListenEventRepository repository)
    {
        _repository = repository;
    }

    /// <summary>
    /// Records a listen event.
    /// </summary>
    public async Task RecordAsync(ListenEventRecord record, CancellationToken cancellationToken = default)
    {
        var entity = new ListenEvent
        {
            EventId = Guid.NewGuid().ToString(),
            ArticleId = record.ArticleId,
            SessionId = record.SessionId,
            EventType = record.EventType,
            PositionSeconds = record.PositionSeconds,
            UserAgent = record.UserAgent,
            Referrer = record.Referrer,
            PageUrl = record.PageUrl,
            OccurredAt = DateTime.UtcNow
        };

        await _repository.AddAsync(entity, cancellationToken);
    }
}
