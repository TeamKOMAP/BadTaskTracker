using System.IO;

namespace TaskManager.Application.Attachments
{
    public sealed class AttachmentMeta
    {
        public string Id { get; set; } = string.Empty;
        public int TaskId { get; set; }
        public string FileName { get; set; } = string.Empty;
        public string ContentType { get; set; } = "application/octet-stream";
        public long Size { get; set; }
        public DateTime UploadedAtUtc { get; set; }
    }

    public sealed class AttachmentUpload
    {
        public AttachmentUpload(string fileName, string contentType, long size, Stream content)
        {
            FileName = fileName;
            ContentType = string.IsNullOrWhiteSpace(contentType) ? "application/octet-stream" : contentType;
            Size = size;
            Content = content;
        }

        public string FileName { get; }
        public string ContentType { get; }
        public long Size { get; }
        public Stream Content { get; }
    }

    public sealed class AttachmentContent
    {
        public AttachmentContent(AttachmentMeta meta, Stream content)
        {
            Meta = meta;
            Content = content;
        }

        public AttachmentMeta Meta { get; }
        public Stream Content { get; }
    }
}
