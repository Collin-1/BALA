namespace Bala.Application.Services;

public interface IHtmlToTextConverter
{
    string Convert(string html);
    string? DetectLanguage(string text);
    (int WordCount, double EstimatedMinutes) CalculateReadingStats(string text);
    string ComputeHash(string text);
}
