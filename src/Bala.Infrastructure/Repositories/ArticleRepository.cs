using Bala.Application.Repositories;
using Bala.Domain.Entities;
using Bala.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Bala.Infrastructure.Repositories;

public class ArticleRepository : IArticleRepository
{
    private readonly BalaDbContext _db;

    public ArticleRepository(BalaDbContext db)
    {
        _db = db;
    }

    public async Task<Article?> GetByIdAsync(string articleId, CancellationToken cancellationToken = default)
    {
        return await _db.Articles.AsNoTracking().FirstOrDefaultAsync(a => a.ArticleId == articleId, cancellationToken);
    }

    public async Task<Article?> GetBySourceUrlAsync(string url, CancellationToken cancellationToken = default)
    {
        return await _db.Articles.AsNoTracking().FirstOrDefaultAsync(a => a.SourceUrl == url, cancellationToken);
    }

    public async Task UpsertAsync(Article article, CancellationToken cancellationToken = default)
    {
        var existing = await _db.Articles.FirstOrDefaultAsync(a => a.ArticleId == article.ArticleId, cancellationToken);
        if (existing == null)
        {
            await _db.Articles.AddAsync(article, cancellationToken);
        }
        else
        {
            _db.Entry(existing).CurrentValues.SetValues(article);
        }

        await _db.SaveChangesAsync(cancellationToken);
    }
}
