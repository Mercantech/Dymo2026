using System.Security.Claims;
using System.Text.Json;
using DymoTag.Api.Data;
using DymoTag.Api.Models;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

var connectionString =
    builder.Configuration.GetConnectionString("Default")
    ?? Environment.GetEnvironmentVariable("ConnectionStrings__Default")
    ?? throw new InvalidOperationException("ConnectionStrings:Default mangler");

var issuer =
    builder.Configuration["AUTH_ISSUER"]
    ?? Environment.GetEnvironmentVariable("AUTH_ISSUER")
    ?? "https://auth.mercantec.tech";
var audience =
    builder.Configuration["AUTH_AUDIENCE"]
    ?? Environment.GetEnvironmentVariable("AUTH_AUDIENCE")
    ?? "mercantec-apps";

var adminIds = (
    builder.Configuration["ADMIN_USER_IDS"]
    ?? Environment.GetEnvironmentVariable("ADMIN_USER_IDS")
    ?? ""
)
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    .ToHashSet(StringComparer.OrdinalIgnoreCase);

var corsOrigins = (
    builder.Configuration["CORS_ORIGIN"]
    ?? Environment.GetEnvironmentVariable("CORS_ORIGIN")
    ?? "http://localhost:5173,http://localhost:3000"
)
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

builder.Services.AddDbContext<AppDb>(o => o.UseNpgsql(connectionString));

builder
    .Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = issuer;
        options.Audience = audience;
        options.RequireHttpsMetadata = true;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = issuer,
            ValidateAudience = true,
            ValidAudience = audience,
            ValidateLifetime = true,
            NameClaimType = "name",
            RoleClaimType = "role",
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddCors(o =>
{
    o.AddDefaultPolicy(p =>
        p.WithOrigins(corsOrigins).AllowAnyHeader().AllowAnyMethod());
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    for (var i = 0; i < 30; i++)
    {
        try
        {
            await db.Database.EnsureCreatedAsync();
            break;
        }
        catch when (i < 29)
        {
            await Task.Delay(1000);
        }
    }
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/health", () => Results.Ok(new { ok = true }));

app.MapGet(
        "/api/me",
        (ClaimsPrincipal user) =>
        {
            var sub = RequireSub(user);
            if (sub is null)
                return Results.Unauthorized();
            var name =
                user.FindFirstValue("name")
                ?? user.FindFirstValue(ClaimTypes.Name)
                ?? user.FindFirstValue("email");
            return Results.Ok(
                new
                {
                    sub,
                    name,
                    isAdmin = adminIds.Contains(sub),
                }
            );
        }
    )
    .RequireAuthorization();

const int MaxHistory = 20;
const int MaxSpecChars = 1_500_000;
const int MaxPreviewChars = 400_000;

app.MapGet(
        "/api/prints",
        async (ClaimsPrincipal user, AppDb db) =>
        {
            var sub = RequireSub(user);
            if (sub is null)
                return Results.Unauthorized();

            var items = await db
                .PrintJobs.AsNoTracking()
                .Where(p => p.UserSub == sub)
                .OrderByDescending(p => p.CreatedAt)
                .Take(MaxHistory)
                .Select(p => new PrintJobDto(
                    p.Id,
                    p.CreatedAt,
                    p.Copies,
                    p.AutoCut,
                    p.Title,
                    p.PreviewDataUrl,
                    p.SpecJson
                ))
                .ToListAsync();

            return Results.Ok(items);
        }
    )
    .RequireAuthorization();

app.MapPost(
        "/api/prints",
        async (CreatePrintRequest body, ClaimsPrincipal user, AppDb db) =>
        {
            var sub = RequireSub(user);
            if (sub is null)
                return Results.Unauthorized();

            if (string.IsNullOrWhiteSpace(body.SpecJson) || body.SpecJson.Length > MaxSpecChars)
                return Results.BadRequest(new { error = "Ugyldig etiket-spec" });
            if (
                string.IsNullOrWhiteSpace(body.PreviewDataUrl)
                || body.PreviewDataUrl.Length > MaxPreviewChars
            )
                return Results.BadRequest(new { error = "Ugyldig preview" });

            var name =
                user.FindFirstValue("name")
                ?? user.FindFirstValue(ClaimTypes.Name)
                ?? user.FindFirstValue("email")
                ?? "Ukendt";

            var title = string.IsNullOrWhiteSpace(body.Title)
                ? DeriveTitle(body.SpecJson)
                : body.Title.Trim()[..Math.Min(body.Title.Trim().Length, 120)];

            var job = new PrintJob
            {
                Id = Guid.NewGuid(),
                UserSub = sub,
                DisplayName = name.Length > 120 ? name[..120] : name,
                Title = title,
                SpecJson = body.SpecJson,
                PreviewDataUrl = body.PreviewDataUrl,
                Copies = Math.Clamp(body.Copies, 1, 20),
                AutoCut = body.AutoCut,
                CreatedAt = DateTimeOffset.UtcNow,
            };

            db.PrintJobs.Add(job);

            var old = await db
                .PrintJobs.Where(p => p.UserSub == sub)
                .OrderByDescending(p => p.CreatedAt)
                .Skip(MaxHistory - 1)
                .ToListAsync();
            if (old.Count > 0)
                db.PrintJobs.RemoveRange(old);

            await db.SaveChangesAsync();

            return Results.Created(
                $"/api/prints/{job.Id}",
                new PrintJobDto(
                    job.Id,
                    job.CreatedAt,
                    job.Copies,
                    job.AutoCut,
                    job.Title,
                    job.PreviewDataUrl,
                    job.SpecJson
                )
            );
        }
    )
    .RequireAuthorization();

app.MapDelete(
        "/api/prints/{id:guid}",
        async (Guid id, ClaimsPrincipal user, AppDb db) =>
        {
            var sub = RequireSub(user);
            if (sub is null)
                return Results.Unauthorized();

            var job = await db.PrintJobs.FirstOrDefaultAsync(p => p.Id == id && p.UserSub == sub);
            if (job is null)
                return Results.NotFound();

            db.PrintJobs.Remove(job);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }
    )
    .RequireAuthorization();

app.MapGet(
        "/api/admin/stats",
        async (ClaimsPrincipal user, AppDb db) =>
        {
            var sub = RequireSub(user);
            if (sub is null)
                return Results.Unauthorized();
            if (!adminIds.Contains(sub))
                return Results.Forbid();

            var now = DateTimeOffset.UtcNow;
            var weekAgo = now.AddDays(-7);
            var dayStart = now.AddDays(-13).Date;

            var totalPrints = await db.PrintJobs.LongCountAsync();
            var printsLast7Days = await db.PrintJobs.LongCountAsync(p => p.CreatedAt >= weekAgo);
            var uniqueUsers = await db.PrintJobs.Select(p => p.UserSub).Distinct().LongCountAsync();
            var totalCopies = await db.PrintJobs.Select(p => (long)p.Copies).SumAsync();

            var topUsers = await db
                .PrintJobs.GroupBy(p => new { p.UserSub, p.DisplayName })
                .Select(g => new
                {
                    g.Key.UserSub,
                    g.Key.DisplayName,
                    prints = g.Count(),
                    copies = g.Sum(x => x.Copies),
                    lastAt = g.Max(x => x.CreatedAt),
                })
                .OrderByDescending(x => x.prints)
                .Take(15)
                .ToListAsync();

            var recent = await db
                .PrintJobs.AsNoTracking()
                .Where(p => p.CreatedAt >= dayStart)
                .Select(p => new { p.CreatedAt })
                .ToListAsync();

            var perDay = Enumerable
                .Range(0, 14)
                .Select(i => dayStart.AddDays(i))
                .Select(d => new
                {
                    date = d.ToString("yyyy-MM-dd"),
                    prints = recent.Count(p => p.CreatedAt.Date == d),
                })
                .ToList();

            return Results.Ok(
                new
                {
                    totalPrints,
                    printsLast7Days,
                    uniqueUsers,
                    totalCopies,
                    topUsers,
                    perDay,
                }
            );
        }
    )
    .RequireAuthorization();

app.Run("http://0.0.0.0:8080");

static string? RequireSub(ClaimsPrincipal user) =>
    user.FindFirstValue("sub") ?? user.FindFirstValue(ClaimTypes.NameIdentifier);

static string DeriveTitle(string specJson)
{
    try
    {
        using var doc = JsonDocument.Parse(specJson);
        var root = doc.RootElement;
        if (
            root.TryGetProperty("text", out var text)
            && text.GetString() is { Length: > 0 } t
        )
            return t.Length > 80 ? t[..80] : t;
        if (
            root.TryGetProperty("qrEnabled", out var qr)
            && qr.GetBoolean()
            && root.TryGetProperty("qrContent", out var qrc)
            && qrc.GetString() is { Length: > 0 } qc
        )
            return "QR: " + (qc.Length > 60 ? qc[..60] : qc);
        if (
            root.TryGetProperty("barcodeEnabled", out var bc)
            && bc.GetBoolean()
            && root.TryGetProperty("barcodeContent", out var bcc)
            && bcc.GetString() is { Length: > 0 } bccVal
        )
            return "Code128: " + bccVal;
        if (root.TryGetProperty("logoEnabled", out var logo) && logo.GetBoolean())
            return "Logo";
    }
    catch
    {
        // ignore
    }

    return "Etiket";
}

record CreatePrintRequest(
    string SpecJson,
    string PreviewDataUrl,
    int Copies,
    bool AutoCut,
    string? Title
);

record PrintJobDto(
    Guid Id,
    DateTimeOffset CreatedAt,
    int Copies,
    bool AutoCut,
    string Title,
    string PreviewDataUrl,
    string SpecJson
);
