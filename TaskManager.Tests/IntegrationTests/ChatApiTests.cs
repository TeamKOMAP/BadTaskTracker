using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;
using TaskManager.Infrastructure.Data;
using Xunit;

namespace TaskManager.Tests.IntegrationTests;

[Trait("Category", "Chats")]
public class ChatApiTests : TestBase
{
    public ChatApiTests(WebApplicationFactory<Program> factory) : base(factory)
    {
    }

    [Fact]
    public async Task CreateDirectChat_WhenDifferentPairRequested_CreatesDedicatedChats()
    {
        var firstPeerId = await CreateWorkspaceUserAsync("Peer One");
        var secondPeerId = await CreateWorkspaceUserAsync("Peer Two");

        var firstResponse = await _client.PostAsync($"/api/chats/direct/{firstPeerId}?workspaceId={TestWorkspaceId}", null);
        firstResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var firstChat = await firstResponse.Content.ReadFromJsonAsync<ChatRoomResponse>();

        var secondResponse = await _client.PostAsync($"/api/chats/direct/{secondPeerId}?workspaceId={TestWorkspaceId}", null);
        secondResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var secondChat = await secondResponse.Content.ReadFromJsonAsync<ChatRoomResponse>();

        firstChat.Should().NotBeNull();
        secondChat.Should().NotBeNull();
        firstChat!.Id.Should().NotBe(secondChat!.Id);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var directChats = db.ChatRooms
            .Where(c => c.WorkspaceId == TestWorkspaceId && c.Type == ChatRoomType.Direct)
            .ToList();

        directChats.Should().HaveCount(2);
    }

    [Fact]
    public async Task CreateDirectChat_WhenSamePairRequestedTwice_ReturnsExistingChat()
    {
        var peerId = await CreateWorkspaceUserAsync("Stable Peer");

        var firstResponse = await _client.PostAsync($"/api/chats/direct/{peerId}?workspaceId={TestWorkspaceId}", null);
        firstResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var firstChat = await firstResponse.Content.ReadFromJsonAsync<ChatRoomResponse>();

        var secondResponse = await _client.PostAsync($"/api/chats/direct/{peerId}?workspaceId={TestWorkspaceId}", null);
        secondResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var secondChat = await secondResponse.Content.ReadFromJsonAsync<ChatRoomResponse>();

        firstChat.Should().NotBeNull();
        secondChat.Should().NotBeNull();
        secondChat!.Id.Should().Be(firstChat!.Id);
    }

    [Fact]
    public async Task CreateDirectChat_WithSameUser_ReturnsBadRequest()
    {
        var response = await _client.PostAsync($"/api/chats/direct/{TestUserId}?workspaceId={TestWorkspaceId}", null);
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task GetMessages_WhenActorIsNotChatMember_ReturnsForbidden()
    {
        var peerId = await CreateWorkspaceUserAsync("Peer Member");
        var outsiderId = await CreateWorkspaceUserAsync("Outsider Member");

        var chatId = await CreateDirectChatAsync(peerId);
        await SendMessageAsync(chatId, "hello");

        var outsiderClient = CreateAuthorizedClient(workspaceId: TestWorkspaceId, userId: outsiderId);
        var response = await outsiderClient.GetAsync($"/api/chats/{chatId}/messages");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task MarkAsRead_NewEndpoint_ReturnsNoContent()
    {
        var peerId = await CreateWorkspaceUserAsync("Read Peer");
        var chatId = await CreateDirectChatAsync(peerId);
        var messageId = await SendMessageAsync(chatId, "message-for-read");

        var response = await _client.PostAsJsonAsync($"/api/chats/{chatId}/read", new
        {
            lastReadMessageId = messageId
        });

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task GetChats_CreatesAndReturnsGeneralChat_ForWorkspaceMembers()
    {
        var peerId = await CreateWorkspaceUserAsync("General Peer");

        var firstResponse = await _client.GetAsync($"/api/chats?workspaceId={TestWorkspaceId}");
        firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var firstChats = await firstResponse.Content.ReadFromJsonAsync<List<ChatRoomListItemResponse>>();

        using var peerClient = CreateAuthorizedClient(workspaceId: TestWorkspaceId, userId: peerId);
        var secondResponse = await peerClient.GetAsync($"/api/chats?workspaceId={TestWorkspaceId}");
        secondResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var secondChats = await secondResponse.Content.ReadFromJsonAsync<List<ChatRoomListItemResponse>>();

        firstChats.Should().NotBeNull();
        secondChats.Should().NotBeNull();

        var firstGeneral = firstChats!.Single(chat => chat.Type == ChatRoomType.General);
        var secondGeneral = secondChats!.Single(chat => chat.Type == ChatRoomType.General);

        firstGeneral.Id.Should().Be(secondGeneral.Id);
    }

    [Fact]
    public async Task OpenTaskChat_AllowsDifferentWorkspaceMembersToJoinSameTaskChat()
    {
        var peerId = await CreateWorkspaceUserAsync("Task Peer");

        var firstResponse = await _client.PostAsync($"/api/tasks/1/chat/open?workspaceId={TestWorkspaceId}", null);
        firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var firstChat = await firstResponse.Content.ReadFromJsonAsync<ChatRoomResponse>();

        using var peerClient = CreateAuthorizedClient(workspaceId: TestWorkspaceId, userId: peerId);
        var secondResponse = await peerClient.PostAsync($"/api/tasks/1/chat/open?workspaceId={TestWorkspaceId}", null);
        secondResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var secondChat = await secondResponse.Content.ReadFromJsonAsync<ChatRoomResponse>();

        firstChat.Should().NotBeNull();
        secondChat.Should().NotBeNull();
        secondChat!.Id.Should().Be(firstChat!.Id);

        var chatsResponse = await peerClient.GetAsync($"/api/chats?workspaceId={TestWorkspaceId}");
        chatsResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var chats = await chatsResponse.Content.ReadFromJsonAsync<List<ChatRoomListItemResponse>>();
        chats.Should().NotBeNull();
        chats!.Should().Contain(chat => chat.Id == firstChat.Id && chat.Type == ChatRoomType.Task);

        var sendResponse = await peerClient.PostAsJsonAsync($"/api/chats/{firstChat.Id}/messages", new
        {
            kind = ChatMessageKind.Text,
            bodyCipher = "peer task chat message"
        });

        sendResponse.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task SendMessage_WithSameClientMessageId_ReturnsExistingMessage()
    {
        var peerId = await CreateWorkspaceUserAsync("Idempotency Peer");
        var chatId = await CreateDirectChatAsync(peerId);
        var clientMessageId = Guid.NewGuid().ToString("N");

        var firstResponse = await _client.PostAsJsonAsync($"/api/chats/{chatId}/messages", new
        {
            kind = ChatMessageKind.Text,
            bodyCipher = "first body",
            clientMessageId
        });

        firstResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var firstMessage = await firstResponse.Content.ReadFromJsonAsync<ChatMessageResponse>();
        firstMessage.Should().NotBeNull();

        var secondResponse = await _client.PostAsJsonAsync($"/api/chats/{chatId}/messages", new
        {
            kind = ChatMessageKind.Text,
            bodyCipher = "second body should be ignored",
            clientMessageId
        });

        secondResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var secondMessage = await secondResponse.Content.ReadFromJsonAsync<ChatMessageResponse>();
        secondMessage.Should().NotBeNull();

        secondMessage!.Id.Should().Be(firstMessage!.Id);

        var listResponse = await _client.GetAsync($"/api/chats/{chatId}/messages");
        listResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var messages = await listResponse.Content.ReadFromJsonAsync<List<ChatMessageListItemResponse>>();
        messages.Should().NotBeNull();
        messages!.Count(m => m.Id == firstMessage.Id).Should().Be(1);
    }

    [Fact]
    public async Task DeleteMessage_LeavesTombstoneInMessageHistory()
    {
        var peerId = await CreateWorkspaceUserAsync("Delete Peer");
        var chatId = await CreateDirectChatAsync(peerId);
        var messageId = await SendMessageAsync(chatId, "message-to-delete");

        var deleteResponse = await _client.DeleteAsync($"/api/chats/{chatId}/messages/{messageId}");
        deleteResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var listResponse = await _client.GetAsync($"/api/chats/{chatId}/messages");
        listResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var messages = await listResponse.Content.ReadFromJsonAsync<List<ChatMessageListItemResponse>>();
        messages.Should().NotBeNull();

        var deleted = messages!.Single(m => m.Id == messageId);
        deleted.BodyCipher.Should().Be("Сообщение удалено");
        deleted.DeletedAtUtc.Should().NotBeNull();
    }

    [Fact]
    public async Task ForwardMessage_WhenSourceChatIsInaccessible_ReturnsNotFound()
    {
        var targetPeerId = await CreateWorkspaceUserAsync("Forward Target Peer");
        var targetChatId = await CreateDirectChatAsync(targetPeerId);

        var hiddenSourceMessageId = await CreateHiddenSourceMessageAsync();

        var forwardResponse = await _client.PostAsync(
            $"/api/chats/{targetChatId}/messages/{hiddenSourceMessageId}/forward",
            null);

        forwardResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Attachments_FullFlow_WorksForChatMember()
    {
        var peerId = await CreateWorkspaceUserAsync("Attachment Peer");
        var chatId = await CreateDirectChatAsync(peerId);
        var messageId = await SendMessageAsync(chatId, "attachment-message");

        using var uploadForm = new MultipartFormDataContent();
        uploadForm.Add(new StringContent(messageId.ToString()), "messageId");

        var payloadBytes = Encoding.UTF8.GetBytes("chat-attachment-content");
        var payload = new ByteArrayContent(payloadBytes);
        payload.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
        uploadForm.Add(payload, "file", "note.txt");

        var uploadResponse = await _client.PostAsync($"/api/chats/{chatId}/attachments", uploadForm);
        uploadResponse.StatusCode.Should().Be(HttpStatusCode.Created);

        var attachment = await uploadResponse.Content.ReadFromJsonAsync<ChatAttachmentResponse>();
        attachment.Should().NotBeNull();
        attachment!.MessageId.Should().Be(messageId);
        attachment.FileName.Should().Be("note.txt");

        var listResponse = await _client.GetAsync($"/api/chats/{chatId}/attachments?messageId={messageId}");
        listResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var list = await listResponse.Content.ReadFromJsonAsync<List<ChatAttachmentResponse>>();
        list.Should().NotBeNull();
        list!.Should().Contain(a => a.Id == attachment.Id);

        var downloadResponse = await _client.GetAsync($"/api/chats/{chatId}/attachments/{attachment.Id}");
        downloadResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var downloaded = await downloadResponse.Content.ReadAsByteArrayAsync();
        downloaded.Should().Equal(payloadBytes);

        var deleteResponse = await _client.DeleteAsync($"/api/chats/{chatId}/attachments/{attachment.Id}");
        deleteResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var secondDownloadResponse = await _client.GetAsync($"/api/chats/{chatId}/attachments/{attachment.Id}");
        secondDownloadResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task ChatEndpoints_WhenFeatureDisabled_ReturnNotFound()
    {
        var disabledFactory = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Chat:Enabled"] = "false"
                });
            });
        });

        using var disabledClient = disabledFactory.CreateClient();

        var chatsResponse = await disabledClient.GetAsync($"/api/chats?workspaceId={TestWorkspaceId}");
        chatsResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);

        var taskChatResponse = await disabledClient.PostAsync($"/api/tasks/1/chat/open?workspaceId={TestWorkspaceId}", null);
        taskChatResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);

        var hubResponse = await disabledClient.GetAsync("/hubs/chat");
        hubResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    private async Task<int> CreateWorkspaceUserAsync(string name)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var user = new User
        {
            Name = name,
            Email = $"chat.{Guid.NewGuid():N}@example.com",
            CreatedAt = DateTime.UtcNow
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();

        db.WorkspaceMembers.Add(new WorkspaceMember
        {
            WorkspaceId = TestWorkspaceId,
            UserId = user.Id,
            Role = WorkspaceRole.Member,
            AddedAt = DateTime.UtcNow
        });

        await db.SaveChangesAsync();
        return user.Id;
    }

    private async Task<Guid> CreateDirectChatAsync(int peerUserId)
    {
        var response = await _client.PostAsync($"/api/chats/direct/{peerUserId}?workspaceId={TestWorkspaceId}", null);
        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var chat = await response.Content.ReadFromJsonAsync<ChatRoomResponse>();
        chat.Should().NotBeNull();
        return chat!.Id;
    }

    private async Task<long> CreateHiddenSourceMessageAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var firstUser = new User
        {
            Name = "Hidden One",
            Email = $"hidden.one.{Guid.NewGuid():N}@example.com",
            CreatedAt = DateTime.UtcNow
        };

        var secondUser = new User
        {
            Name = "Hidden Two",
            Email = $"hidden.two.{Guid.NewGuid():N}@example.com",
            CreatedAt = DateTime.UtcNow
        };

        db.Users.AddRange(firstUser, secondUser);
        await db.SaveChangesAsync();

        db.WorkspaceMembers.AddRange(
            new WorkspaceMember
            {
                WorkspaceId = TestWorkspaceId,
                UserId = firstUser.Id,
                Role = WorkspaceRole.Member,
                AddedAt = DateTime.UtcNow
            },
            new WorkspaceMember
            {
                WorkspaceId = TestWorkspaceId,
                UserId = secondUser.Id,
                Role = WorkspaceRole.Member,
                AddedAt = DateTime.UtcNow
            });

        await db.SaveChangesAsync();

        var hiddenChatId = Guid.NewGuid();
        db.ChatRooms.Add(new ChatRoom
        {
            Id = hiddenChatId,
            WorkspaceId = TestWorkspaceId,
            Type = ChatRoomType.Direct,
            DirectKey = ChatRoom.BuildDirectKey(firstUser.Id, secondUser.Id),
            CreatedByUserId = firstUser.Id,
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow
        });

        db.ChatRoomMembers.AddRange(
            new ChatRoomMember
            {
                ChatRoomId = hiddenChatId,
                UserId = firstUser.Id,
                Role = ChatMemberRole.Member,
                JoinedAtUtc = DateTime.UtcNow
            },
            new ChatRoomMember
            {
                ChatRoomId = hiddenChatId,
                UserId = secondUser.Id,
                Role = ChatMemberRole.Member,
                JoinedAtUtc = DateTime.UtcNow
            });

        var hiddenMessage = new ChatMessage
        {
            ChatRoomId = hiddenChatId,
            SenderUserId = firstUser.Id,
            Kind = ChatMessageKind.Text,
            BodyCipher = "hidden message",
            CreatedAtUtc = DateTime.UtcNow
        };

        db.ChatMessages.Add(hiddenMessage);
        await db.SaveChangesAsync();

        return hiddenMessage.Id;
    }

    private async Task<long> SendMessageAsync(Guid chatId, string body)
    {
        var response = await _client.PostAsJsonAsync($"/api/chats/{chatId}/messages", new
        {
            kind = ChatMessageKind.Text,
            bodyCipher = body
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var message = await response.Content.ReadFromJsonAsync<ChatMessageResponse>();
        message.Should().NotBeNull();
        return message!.Id;
    }

    private sealed class ChatRoomResponse
    {
        public Guid Id { get; set; }
    }

    private sealed class ChatRoomListItemResponse
    {
        public Guid Id { get; set; }
        public ChatRoomType Type { get; set; }
    }

    private sealed class ChatMessageResponse
    {
        public long Id { get; set; }
    }

    private sealed class ChatMessageListItemResponse
    {
        public long Id { get; set; }
        public string BodyCipher { get; set; } = string.Empty;
        public DateTime? DeletedAtUtc { get; set; }
    }

    private sealed class ChatAttachmentResponse
    {
        public Guid Id { get; set; }
        public long MessageId { get; set; }
        public string FileName { get; set; } = string.Empty;
    }
    [Fact]
    [Trait("Category", "Other")]
    public async Task MarkAsRead_MissingPayload_ReturnsBadRequest()
    {
        var peerId = await CreateWorkspaceUserAsync("Read Missing Peer");
        var chatId = await CreateDirectChatAsync(peerId);
        var response = await _client.PostAsync($"/api/chats/{chatId}/read", null);
        response.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Post_Message_ByNonMember_ReturnsForbidden()
    {
        // Arrange: create a chat with a peer, then use a non-member to post a message
        var peerId = await CreateWorkspaceUserAsync("Forbidden Poster");
        var chatId = await CreateDirectChatAsync(peerId);
        var outsiderId = await CreateWorkspaceUserAsync("Forbidden Outsider 3");

        using var outsiderClient = CreateAuthorizedClient(workspaceId: TestWorkspaceId, userId: outsiderId);
        var response = await outsiderClient.PostAsJsonAsync($"/api/chats/{chatId}/messages", new
        {
            kind = ChatMessageKind.Text,
            bodyCipher = "should be forbidden"
        });

        response.StatusCode.Should().Be(System.Net.HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Post_Attachment_ByNonMember_ReturnsForbidden()
    {
        var peerId = await CreateWorkspaceUserAsync("Forbidden Attacher 2");
        var chatId = await CreateDirectChatAsync(peerId);
        var outsiderId = await CreateWorkspaceUserAsync("Forbidden Outsider 4");

        using var outsiderClient = CreateAuthorizedClient(workspaceId: TestWorkspaceId, userId: outsiderId);
        using var form = new MultipartFormDataContent();
        var payloadBytes = Encoding.UTF8.GetBytes("test");
        var payload = new ByteArrayContent(payloadBytes);
        payload.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("text/plain");
        form.Add(payload, "file", "note.txt");

        var response = await outsiderClient.PostAsync($"/api/chats/{chatId}/attachments", form);
        response.StatusCode.Should().Be(System.Net.HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task MarkAsRead_ByNonMember_ReturnsForbidden()
    {
        var peerId = await CreateWorkspaceUserAsync("Read Peer 2");
        var chatId = await CreateDirectChatAsync(peerId);
        var outsiderId = await CreateWorkspaceUserAsync("Forbidden Outsider 5");

        using var outsiderClient = CreateAuthorizedClient(workspaceId: TestWorkspaceId, userId: outsiderId);
        var messageId = await SendMessageAsync(chatId, "hello");
        var response = await outsiderClient.PostAsJsonAsync($"/api/chats/{chatId}/read", new { lastReadMessageId = messageId });
        response.StatusCode.Should().Be(System.Net.HttpStatusCode.Forbidden);
    }

    [Fact]
    [Trait("Category", "Other")]
    public async Task Attachments_UploadWithoutMessageId_ReturnsBadRequest()
    {
        var peerId = await CreateWorkspaceUserAsync("Attachment Peer NoMsgId");
        var chatId = await CreateDirectChatAsync(peerId);
        using var form = new MultipartFormDataContent();
        var payloadBytes = Encoding.UTF8.GetBytes("chat-attachment-content");
        var payload = new ByteArrayContent(payloadBytes);
        payload.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("text/plain");
        form.Add(payload, "file", "note.txt");
        var response = await _client.PostAsync($"/api/chats/{chatId}/attachments", form);
        response.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
    }
}
