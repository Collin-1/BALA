using Bala.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Bala.Infrastructure.Data;

public class BalaDbContext : DbContext
{
    public BalaDbContext(DbContextOptions<BalaDbContext> options) : base(options)
    {
    }

    public DbSet<Article> Articles => Set<Article>();
    public DbSet<ListenEvent> ListenEvents => Set<ListenEvent>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Article>(entity =>
        {
            entity.HasKey(e => e.ArticleId);
            entity.HasIndex(e => e.SourceUrl).IsUnique();
            entity.Property(e => e.CleanText).IsRequired();
        });

        modelBuilder.Entity<ListenEvent>(entity =>
        {
            entity.HasKey(e => e.EventId);
            entity.HasIndex(e => e.ArticleId);
        });
    }
}
