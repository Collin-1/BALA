using Bala.Application.Services;
using Microsoft.Extensions.DependencyInjection;

namespace Bala.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<IArticleService, ArticleService>();
        services.AddScoped<IListenEventService, ListenEventService>();
        return services;
    }
}
