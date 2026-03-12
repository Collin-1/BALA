using Bala.Application.Repositories;
using Bala.Application.Services;
using Bala.Infrastructure.Data;
using Bala.Infrastructure.Extraction;
using Bala.Infrastructure.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Bala.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Default") ?? "Data Source=bala.db";

        services.Configure<ExtractionOptions>(configuration.GetSection("Extraction"));

        services.AddDbContext<BalaDbContext>(options =>
        {
            options.UseSqlite(connectionString);
        });

        services.AddScoped<IArticleRepository, ArticleRepository>();
        services.AddScoped<IListenEventRepository, ListenEventRepository>();
        services.AddSingleton<IHtmlToTextConverter, HtmlToTextConverter>();
        services.AddSingleton<IArticleExtractor, PlaywrightArticleExtractor>();

        return services;
    }
}
