using Bala.Application.Repositories;
using Bala.Domain.Entities;

namespace Bala.Application.Services;

public class ListenEventService : IListenEventService
{
    private readonly IListenEventRepository _repository;

    public ListenEventService(IListenEventRepository repository)
    {
        _repository = repository;
    }

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
