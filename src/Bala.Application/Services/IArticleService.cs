using Bala.Application.Models;

namespace Bala.Application.Services;

/// <summary>
/// Provides article retrieval and ingestion operations.
/// </summary>
public interface IArticleService
{
    /// <summary>
    /// Gets an article by URL, optionally forcing a refresh.
    /// </summary>
    Task<ArticleResult> GetByUrlAsync(string url, bool refresh, CancellationToken cancellationToken = default);
    /// <summary>
    /// Gets a cached article by its identifier.
    /// </summary>
    Task<ArticleResult?> GetByIdAsync(string articleId, CancellationToken cancellationToken = default);
    /// <summary>
    /// Creates an article from raw HTML content.
    /// </summary>
    Task<ArticleResult> CreateFromHtmlAsync(string? sourceUrl, string? title, string html, CancellationToken cancellationToken = default);
}
