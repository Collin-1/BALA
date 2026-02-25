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
        page.SetDefaultTimeout(25000);

        await page.GotoAsync(url, new PageGotoOptions { WaitUntil = WaitUntilState.NetworkIdle });
        await page.WaitForLoadStateAsync(LoadState.NetworkIdle);

        var html = await ExtractMainContentHtmlAsync(page);

        var cleanText = _converter.Convert(html);
        var language = _converter.DetectLanguage(cleanText);
        var (wordCount, estimatedMinutes) = _converter.CalculateReadingStats(cleanText);
        var hash = _converter.ComputeHash(cleanText);
        var title = await page.TitleAsync();

        return new ExtractedArticle(url, title, cleanText, language, wordCount, estimatedMinutes, hash);
    }

    private static async Task<string> ExtractMainContentHtmlAsync(IPage page)
    {
        const string script = @"() => {
            const removeSelectors = [
                'script', 'style', 'nav', 'header', 'footer', 'aside', 'form', 'noscript',
                'iframe', 'svg', '.ad', '.advertisement', '.ads', '.promo', '.newsletter', '.cookie'
            ];
            removeSelectors.forEach(sel => {
                document.querySelectorAll(sel).forEach(n => n.remove());
            });

            const preferred = document.querySelector('article') || document.querySelector('main');
            if (preferred && preferred.innerText.trim().length > 500) {
                return preferred.innerHTML;
            }

            const candidates = Array.from(document.querySelectorAll('article, main, section, div'))
                .map(el => ({ el, score: (el.innerText || '').length }))
                .filter(x => x.score > 500);

            candidates.sort((a, b) => b.score - a.score);
            const best = candidates.length ? candidates[0].el : document.body;
            return best.innerHTML || document.body.innerHTML;
        }";

        var result = await page.EvaluateAsync<string>(script);
        return string.IsNullOrWhiteSpace(result) ? await page.ContentAsync() : result;
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
