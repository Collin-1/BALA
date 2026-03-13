namespace Bala.Domain.Entities;

/// <summary>
/// Represents a cached article extracted from a source URL.
/// </summary>
public class Article
{
    /// <summary>
    /// Unique identifier for the article record.
    /// </summary>
    public string ArticleId { get; set; } = Guid.NewGuid().ToString();
    /// <summary>
    /// Original URL the article was extracted from.
    /// </summary>
    public string? SourceUrl { get; set; }
    /// <summary>
    /// Best-effort title extracted from the page.
    /// </summary>
    public string? Title { get; set; }
    /// <summary>
    /// Cleaned readable text for speech playback.
    /// </summary>
    public string CleanText { get; set; } = string.Empty;
    /// <summary>
    /// Detected language code when available.
    /// </summary>
    public string? Language { get; set; }
    /// <summary>
    /// Word count of the cleaned text.
    /// </summary>
    public int? WordCount { get; set; }
    /// <summary>
    /// Estimated reading time in minutes.
    /// </summary>
    public double? EstimatedMinutes { get; set; }
    /// <summary>
    /// Hash of the cleaned text for change detection.
    /// </summary>
    public string? ContentHash { get; set; }
    /// <summary>
    /// UTC timestamp when the article was first stored.
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    /// <summary>
    /// UTC timestamp when the article was last refreshed.
    /// </summary>
    public DateTime LastRefreshedAt { get; set; } = DateTime.UtcNow;
}
