# Multi-stage build for Bala API + embed widget
# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY . .
RUN dotnet restore Bala.sln
RUN dotnet publish src/Bala.Api/Bala.Api.csproj -c Release -o /app/publish

# Runtime stage with Playwright browsers preinstalled (v1.46.0)
FROM mcr.microsoft.com/playwright/dotnet:v1.46.0-jammy AS final
WORKDIR /app
ENV ASPNETCORE_URLS=http://0.0.0.0:8080 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY --from=build /app/publish .
EXPOSE 8080
ENTRYPOINT ["dotnet", "Bala.Api.dll"]
