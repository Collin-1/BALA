namespace Bala.Application.Options;

public class ArticleCacheOptions
{
    public int MaxAgeMinutes { get; init; } = 1440;
    public bool AllowStaleOnError { get; init; } = true;
}
