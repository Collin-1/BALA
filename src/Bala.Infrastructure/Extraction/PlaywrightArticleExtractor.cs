using Bala.Application.Services;
using Microsoft.Playwright;

namespace Bala.Infrastructure.Extraction;

public class PlaywrightArticleExtractor : IArticleExtractor, IAsyncDisposable
{
    private readonly IHtmlToTextConverter _converter;
    private readonly SemaphoreSlim _browserLock = new(1, 1);
    private IPlaywright? _playwright;
    private Task<IBrowser>? _browserTask;
    private bool _disposed;

    public PlaywrightArticleExtractor(IHtmlToTextConverter converter)
    {
        _converter = converter;
    }

    public async Task<ExtractedArticle> ExtractAsync(string url, CancellationToken cancellationToken = default)
    {
        var browser = await GetBrowserAsync(cancellationToken);
        await using var context = await browser.NewContextAsync(new BrowserNewContextOptions
        {
            ViewportSize = null
        });
        var page = await context.NewPageAsync();
        page.SetDefaultTimeout(15000);

        await page.GotoAsync(url, new PageGotoOptions { WaitUntil = WaitUntilState.NetworkIdle });

        var articleHandle = await page.QuerySelectorAsync("article");
        string html;
        if (articleHandle != null)
        {
            html = await articleHandle.InnerHTMLAsync();
        }
        else
        {
            html = await page.ContentAsync();
        }

        var cleanText = _converter.Convert(html);
        var language = _converter.DetectLanguage(cleanText);
        var (wordCount, estimatedMinutes) = _converter.CalculateReadingStats(cleanText);
        var hash = _converter.ComputeHash(cleanText);
        var title = await page.TitleAsync();

        return new ExtractedArticle(url, title, cleanText, language, wordCount, estimatedMinutes, hash);
    }

    private async Task<IBrowser> GetBrowserAsync(CancellationToken cancellationToken)
    {
        if (_browserTask != null) return await _browserTask;

        await _browserLock.WaitAsync(cancellationToken);
        try
        {
            if (_browserTask == null)
            {
                _browserTask = InitializeBrowserAsync();
            }
        }
        finally
        {
            _browserLock.Release();
        }

        return await _browserTask;
    }

    private async Task<IBrowser> InitializeBrowserAsync()
    {
        _playwright = await Playwright.CreateAsync();
        return await _playwright.Chromium.LaunchAsync(new BrowserTypeLaunchOptions
        {
            Headless = true
        });
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed) return;
        _disposed = true;

        if (_browserTask != null)
        {
            var browser = await _browserTask;
            await browser.CloseAsync();
        }

        _playwright?.Dispose();
        _browserLock.Dispose();
    }
}
