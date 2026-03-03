namespace TaskManager.Application.Storage
{
    public class StorageSettings
    {
        public string Provider { get; set; } = "Local";
        public string PublicBucket { get; set; } = "gtt-public";
        public string PrivateBucket { get; set; } = "gtt-private";

        public string Endpoint { get; set; } = string.Empty;
        public string Region { get; set; } = "us-east-1";
        public string AccessKey { get; set; } = string.Empty;
        public string SecretKey { get; set; } = string.Empty;
        public bool ForcePathStyle { get; set; } = true;

        public string PostgresConnectionString { get; set; } = string.Empty;
        public string PostgresSchema { get; set; } = "public";
        public string PostgresTable { get; set; } = "object_storage_items";

        public string LocalRootPath { get; set; } = "App_Data/object-storage";
    }
}
