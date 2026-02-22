using Bala.Application.Models;

namespace Bala.Application.Services;

public interface IArticleService
{
    Task<ArticleResult> GetByUrlAsync(string url, bool refresh, CancellationToken cancellationToken = default);
    Task<ArticleResult?> GetByIdAsync(string articleId, CancellationToken cancellationToken = default);
    Task<ArticleResult> CreateFromHtmlAsync(string? sourceUrl, string? title, string html, CancellationToken cancellationToken = default);
}
