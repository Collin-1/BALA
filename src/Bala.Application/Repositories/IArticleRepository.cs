using Bala.Domain.Entities;

namespace Bala.Application.Repositories;

public interface IArticleRepository
{
    Task<Article?> GetByIdAsync(string articleId, CancellationToken cancellationToken = default);
    Task<Article?> GetBySourceUrlAsync(string url, CancellationToken cancellationToken = default);
    Task UpsertAsync(Article article, CancellationToken cancellationToken = default);
}
