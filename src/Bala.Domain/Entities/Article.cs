namespace Bala.Domain.Entities;

public class Article
{
    public string ArticleId { get; set; } = Guid.NewGuid().ToString();
    public string? SourceUrl { get; set; }
    public string? Title { get; set; }
    public string CleanText { get; set; } = string.Empty;
    public string? Language { get; set; }
    public int? WordCount { get; set; }
    public double? EstimatedMinutes { get; set; }
    public string? ContentHash { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastRefreshedAt { get; set; } = DateTime.UtcNow;
}
