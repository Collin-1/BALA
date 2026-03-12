namespace Bala.Infrastructure.Extraction;

public class ExtractionOptions
{
    public int NavigationTimeoutMs { get; init; } = 25000;
    public int MaxRetries { get; init; } = 2;
    public int RetryDelayMs { get; init; } = 500;
}
