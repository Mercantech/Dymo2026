namespace DymoTag.Api.Models;

public sealed class PrintJob
{
    public Guid Id { get; set; }
    public required string UserSub { get; set; }
    public required string DisplayName { get; set; }
    public required string Title { get; set; }
    public required string SpecJson { get; set; }
    public required string PreviewDataUrl { get; set; }
    public int Copies { get; set; }
    public bool AutoCut { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
