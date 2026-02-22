namespace Bala.Application.Services;

public interface IArticleExtractor
{
    Task<ExtractedArticle> ExtractAsync(string url, CancellationToken cancellationToken = default);
}

public record ExtractedArticle(
    string SourceUrl,
    string? Title,
    string CleanText,
    string? Language,
    int WordCount,
    double EstimatedMinutes,
    string ContentHash);
