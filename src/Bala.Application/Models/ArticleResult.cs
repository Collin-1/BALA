namespace Bala.Application.Models;

public record ArticleResult(
    string ArticleId,
    string? SourceUrl,
    string? Title,
    string CleanText,
    string? Language,
    int WordCount,
    double EstimatedMinutes,
    DateTime CreatedAt,
    DateTime LastRefreshedAt);
