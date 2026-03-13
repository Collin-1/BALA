namespace Bala.Application.Services;

/// <summary>
/// Extracts readable article content from a source URL.
/// </summary>
public interface IArticleExtractor
{
    /// <summary>
    /// Extracts article content for the given URL.
    /// </summary>
    Task<ExtractedArticle> ExtractAsync(string url, CancellationToken cancellationToken = default);
}

/// <summary>
/// Represents extracted article content and metadata.
/// </summary>
public record ExtractedArticle
{
    /// <summary>
    /// Initializes a new instance of the <see cref="ExtractedArticle"/> record.
    /// </summary>
    public ExtractedArticle(
        string sourceUrl,
        string? title,
        string cleanText,
        string? language,
        int wordCount,
        double estimatedMinutes,
        string contentHash)
    {
        SourceUrl = sourceUrl;
        Title = title;
        CleanText = cleanText;
        Language = language;
        WordCount = wordCount;
        EstimatedMinutes = estimatedMinutes;
        ContentHash = contentHash;
    }

    /// <summary>
    /// Original source URL.
    /// </summary>
    public string SourceUrl { get; init; }

    /// <summary>
    /// Best-effort extracted title.
    /// </summary>
    public string? Title { get; init; }

    /// <summary>
    /// Cleaned readable text.
    /// </summary>
    public string CleanText { get; init; }

    /// <summary>
    /// Detected language code when available.
    /// </summary>
    public string? Language { get; init; }

    /// <summary>
    /// Word count for the cleaned text.
    /// </summary>
    public int WordCount { get; init; }

    /// <summary>
    /// Estimated reading time in minutes.
    /// </summary>
    public double EstimatedMinutes { get; init; }

    /// <summary>
    /// Hash of the cleaned text.
    /// </summary>
    public string ContentHash { get; init; }
}
