namespace Bala.Application.Services;

/// <summary>
/// Converts HTML to clean readable text and related metadata.
/// </summary>
public interface IHtmlToTextConverter
{
    /// <summary>
    /// Converts raw HTML to cleaned readable text.
    /// </summary>
    string Convert(string html);
    /// <summary>
    /// Attempts to detect the language of the provided text.
    /// </summary>
    string? DetectLanguage(string text);
    /// <summary>
    /// Calculates word count and estimated reading time.
    /// </summary>
    (int WordCount, double EstimatedMinutes) CalculateReadingStats(string text);
    /// <summary>
    /// Computes a hash of the input text.
    /// </summary>
    string ComputeHash(string text);
}
