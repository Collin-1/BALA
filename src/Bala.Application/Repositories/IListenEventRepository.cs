using Bala.Domain.Entities;

namespace Bala.Application.Repositories;

public interface IListenEventRepository
{
    Task AddAsync(ListenEvent listenEvent, CancellationToken cancellationToken = default);
}
