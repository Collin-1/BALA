using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Bala.Application.Services;
using HtmlAgilityPack;

namespace Bala.Infrastructure.Extraction;

public class HtmlToTextConverter : IHtmlToTextConverter
{
    private static readonly string[] NoiseTags = { "script", "style", "nav", "header", "footer", "aside", "form", "iframe", "noscript" };

    private static readonly string[] NoiseClassFragments =
    {
        "ad", "ads", "advert", "sponsor", "sponsored", "promo", "promoted", "newsletter", "cookie"
    };

    public string Convert(string html)
    {
        var doc = new HtmlDocument();
        doc.LoadHtml(html);

        foreach (var tag in NoiseTags)
        {
            var nodes = doc.DocumentNode.SelectNodes("//" + tag);
            if (nodes == null) continue;
            foreach (var node in nodes)
            {
                node.Remove();
            }
        }

        RemoveByClassOrId(doc.DocumentNode);

        var articleNode = doc.DocumentNode.SelectSingleNode("//article");
        HtmlNode contentNode;
        if (articleNode != null)
        {
            contentNode = articleNode;
        }
        else
        {
            var body = doc.DocumentNode.SelectSingleNode("//body") ?? doc.DocumentNode;
            contentNode = FindLargestTextNode(body) ?? body;
        }

        var paragraphs = contentNode
            .Descendants()
            .Where(n => n.Name.Equals("p", StringComparison.OrdinalIgnoreCase) || n.Name.Equals("div", StringComparison.OrdinalIgnoreCase))
            .Select(n => NormalizeWhitespace(n.InnerText))
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .ToList();

        var text = paragraphs.Any()
            ? string.Join("\n\n", paragraphs)
            : NormalizeWhitespace(contentNode.InnerText);

        return text;
    }

    public string? DetectLanguage(string text)
    {
        // Lightweight heuristic: return null when unclear to avoid false positives.
        if (string.IsNullOrWhiteSpace(text)) return null;
        var asciiRatio = text.Count(c => c <= 127) / (double)text.Length;
        if (asciiRatio > 0.9)
        {
            return "en";
        }

        return null;
    }

    public (int WordCount, double EstimatedMinutes) CalculateReadingStats(string text)
    {
        var words = Regex.Matches(text, "\\b\\w+\\b").Count;
        var minutes = words / 180d;
        return (words, Math.Round(minutes, 2));
    }

    public string ComputeHash(string text)
    {
        var bytes = Encoding.UTF8.GetBytes(text);
        var hash = SHA256.HashData(bytes);
        return System.Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static string NormalizeWhitespace(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;
        var decoded = HtmlEntity.DeEntitize(input);
        var collapsed = Regex.Replace(decoded, "\\s+", " ").Trim();
        return collapsed;
    }

    private static HtmlNode? FindLargestTextNode(HtmlNode root)
    {
        HtmlNode? best = null;
        var bestLength = 0;

        foreach (var node in root.Descendants())
        {
            if (node.NodeType != HtmlNodeType.Element) continue;
            var text = node.InnerText;
            var length = text?.Length ?? 0;
            if (length > bestLength)
            {
                bestLength = length;
                best = node;
            }
        }

        return best;
    }

    private static void RemoveByClassOrId(HtmlNode root)
    {
        var toRemove = new List<HtmlNode>();
        foreach (var node in root.Descendants())
        {
            if (node.NodeType != HtmlNodeType.Element) continue;
            var cls = node.GetAttributeValue("class", string.Empty).ToLowerInvariant();
            var id = node.GetAttributeValue("id", string.Empty).ToLowerInvariant();
            if (MatchesNoise(cls) || MatchesNoise(id))
            {
                toRemove.Add(node);
            }
        }

        foreach (var n in toRemove)
        {
            n.Remove();
        }
    }

    private static bool MatchesNoise(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;
        foreach (var frag in NoiseClassFragments)
        {
            if (value.Contains(frag, StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }
}
