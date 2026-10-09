using DymoTag.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace DymoTag.Api.Data;

public sealed class AppDb(DbContextOptions<AppDb> options) : DbContext(options)
{
    public DbSet<PrintJob> PrintJobs => Set<PrintJob>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var e = modelBuilder.Entity<PrintJob>();
        e.HasKey(x => x.Id);
        e.HasIndex(x => new { x.UserSub, x.CreatedAt });
        e.Property(x => x.UserSub).HasMaxLength(64).IsRequired();
        e.Property(x => x.DisplayName).HasMaxLength(120).IsRequired();
        e.Property(x => x.Title).HasMaxLength(120).IsRequired();
        e.Property(x => x.SpecJson).IsRequired();
        e.Property(x => x.PreviewDataUrl).IsRequired();
    }
}
