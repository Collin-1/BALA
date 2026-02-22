using Bala.Application.Repositories;
using Bala.Domain.Entities;
using Bala.Infrastructure.Data;

namespace Bala.Infrastructure.Repositories;

public class ListenEventRepository : IListenEventRepository
{
    private readonly BalaDbContext _db;

    public ListenEventRepository(BalaDbContext db)
    {
        _db = db;
    }

    public async Task AddAsync(ListenEvent listenEvent, CancellationToken cancellationToken = default)
    {
        await _db.ListenEvents.AddAsync(listenEvent, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
    }
}
