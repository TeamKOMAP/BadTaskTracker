using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using TaskManager.Application.DTOs;
using Xunit;

namespace TaskManager.Tests.IntegrationTests
{
    public class CompatibilityEndpointsTests : TestBase
    {
        public CompatibilityEndpointsTests(WebApplicationFactory<Program> factory) : base(factory) { }

        [Fact]
        public async Task GetTagById_ReturnsTag()
        {
            var tagsResponse = await _client.GetAsync("/api/tags");
            tagsResponse.StatusCode.Should().Be(HttpStatusCode.OK);

            var tags = await tagsResponse.Content.ReadFromJsonAsync<List<TagDto>>();
            tags.Should().NotBeNull();
            tags.Should().NotBeEmpty();

            var tagId = tags![0].Id;
            var byIdResponse = await _client.GetAsync($"/api/tags/{tagId}");
            byIdResponse.StatusCode.Should().Be(HttpStatusCode.OK);

            var tag = await byIdResponse.Content.ReadFromJsonAsync<TagDto>();
            tag.Should().NotBeNull();
            tag!.Id.Should().Be(tagId);
        }

        [Fact]
        public async Task AttachmentExistsAndCountsEndpoints_ReturnCounts()
        {
            var tasksResponse = await _client.GetAsync("/api/tasks");
            tasksResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var tasks = await tasksResponse.Content.ReadFromJsonAsync<List<TaskDto>>();
            tasks.Should().NotBeNull();
            tasks.Should().NotBeEmpty();

            var taskId = tasks![0].Id;

            using (var form = new MultipartFormDataContent())
            {
                var payload = new ByteArrayContent(Encoding.UTF8.GetBytes("compat-attachment"));
                payload.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
                form.Add(payload, "files", "compat.txt");

                var uploadResponse = await _client.PostAsync($"/api/tasks/{taskId}/attachments", form);
                uploadResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            }

            var existsResponse = await _client.GetAsync($"/api/tasks/{taskId}/attachments/exists");
            existsResponse.StatusCode.Should().Be(HttpStatusCode.OK);

            var exists = await existsResponse.Content.ReadFromJsonAsync<AttachmentExistsResult>();
            exists.Should().NotBeNull();
            exists!.HasAttachments.Should().BeTrue();
            exists.Count.Should().BeGreaterThanOrEqualTo(1);

            var countsResponse = await _client.PostAsJsonAsync("/api/tasks/attachments/counts", new
            {
                taskIds = new[] { taskId }
            });
            countsResponse.StatusCode.Should().Be(HttpStatusCode.OK);

            var counts = await countsResponse.Content.ReadFromJsonAsync<List<TaskAttachmentCountDto>>();
            counts.Should().NotBeNull();
            var row = counts!.Single(x => x.TaskId == taskId);
            row.Count.Should().BeGreaterThanOrEqualTo(1);
            row.HasAttachments.Should().BeTrue();
        }

        [Fact]
        public async Task DeleteSpaceAvatarEndpoint_RemainsOperational()
        {
            var imageBytes = Convert.FromBase64String(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgQfDdcQAAAAASUVORK5CYII=");

            using (var form = new MultipartFormDataContent())
            {
                var payload = new ByteArrayContent(imageBytes);
                payload.Headers.ContentType = new MediaTypeHeaderValue("image/png");
                form.Add(payload, "file", "avatar.png");

                var setAvatarResponse = await _client.PostAsync($"/api/spaces/{TestWorkspaceId}/avatar", form);
                setAvatarResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            }

            var clearAvatarResponse = await _client.DeleteAsync($"/api/spaces/{TestWorkspaceId}/avatar");
            clearAvatarResponse.StatusCode.Should().Be(HttpStatusCode.OK);

            var workspace = await clearAvatarResponse.Content.ReadFromJsonAsync<WorkspaceDto>();
            workspace.Should().NotBeNull();
            workspace!.Id.Should().Be(TestWorkspaceId);
            string.IsNullOrWhiteSpace(workspace.AvatarPath).Should().BeTrue();
        }

        private sealed class AttachmentExistsResult
        {
            public bool HasAttachments { get; set; }
            public int Count { get; set; }
        }
    }
}
