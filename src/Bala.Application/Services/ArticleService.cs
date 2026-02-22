using Bala.Application.Models;
using Bala.Application.Repositories;
using Bala.Domain.Entities;

namespace Bala.Application.Services;

public class ArticleService : IArticleService
{
    private readonly IArticleRepository _repository;
    private readonly IArticleExtractor _extractor;
    private readonly IHtmlToTextConverter _converter;

    public ArticleService(IArticleRepository repository, IArticleExtractor extractor, IHtmlToTextConverter converter)
    {
        _repository = repository;
        _extractor = extractor;
        _converter = converter;
    }

    public async Task<ArticleResult> GetByUrlAsync(string url, bool refresh, CancellationToken cancellationToken = default)
    {
        var existing = await _repository.GetBySourceUrlAsync(url, cancellationToken);
        if (!refresh && existing != null)
        {
            return Map(existing);
        }

        var extracted = await _extractor.ExtractAsync(url, cancellationToken);
        var now = DateTime.UtcNow;

        if (existing == null)
        {
            existing = new Article
            {
                ArticleId = Guid.NewGuid().ToString(),
                SourceUrl = extracted.SourceUrl,
                Title = extracted.Title,
                CleanText = extracted.CleanText,
                Language = extracted.Language,
                WordCount = extracted.WordCount,
                EstimatedMinutes = extracted.EstimatedMinutes,
                ContentHash = extracted.ContentHash,
                CreatedAt = now,
                LastRefreshedAt = now
            };
        }
        else
        {
            existing.Title = extracted.Title;
            existing.CleanText = extracted.CleanText;
            existing.Language = extracted.Language;
            existing.WordCount = extracted.WordCount;
            existing.EstimatedMinutes = extracted.EstimatedMinutes;
            existing.ContentHash = extracted.ContentHash;
            existing.LastRefreshedAt = now;
        }

        await _repository.UpsertAsync(existing, cancellationToken);
        return Map(existing);
    }

    public async Task<ArticleResult?> GetByIdAsync(string articleId, CancellationToken cancellationToken = default)
    {
        var entity = await _repository.GetByIdAsync(articleId, cancellationToken);
        return entity == null ? null : Map(entity);
    }

    public async Task<ArticleResult> CreateFromHtmlAsync(string? sourceUrl, string? title, string html, CancellationToken cancellationToken = default)
    {
        var cleanText = _converter.Convert(html);
        var language = _converter.DetectLanguage(cleanText);
        var (wordCount, estimatedMinutes) = _converter.CalculateReadingStats(cleanText);
        var hash = _converter.ComputeHash(cleanText);
        var now = DateTime.UtcNow;

        var article = new Article
        {
            ArticleId = Guid.NewGuid().ToString(),
            SourceUrl = sourceUrl,
            Title = title,
            CleanText = cleanText,
            Language = language,
            WordCount = wordCount,
            EstimatedMinutes = estimatedMinutes,
            ContentHash = hash,
            CreatedAt = now,
            LastRefreshedAt = now
        };

        await _repository.UpsertAsync(article, cancellationToken);
        return Map(article);
    }

    private static ArticleResult Map(Article article) => new(
        article.ArticleId,
        article.SourceUrl,
        article.Title,
        article.CleanText,
        article.Language,
        article.WordCount ?? 0,
        article.EstimatedMinutes ?? 0,
        article.CreatedAt,
        article.LastRefreshedAt);
}
