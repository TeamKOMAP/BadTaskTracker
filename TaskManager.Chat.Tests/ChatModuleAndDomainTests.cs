using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using TaskManager.Chat.Application.Configuration;
using TaskManager.Chat.Application.Interfaces;
using TaskManager.Chat.Infrastructure.DependencyInjection;
using TaskManager.Domain.Entities;

namespace TaskManager.Chat.Tests;

public class ChatModuleAndDomainTests
{
    [Fact]
    public void BuildDirectKey_SortsUserIds()
    {
        var key = ChatRoom.BuildDirectKey(42, 7);

        Assert.Equal("7:42", key);
    }

    [Fact]
    public void BuildDirectKey_ThrowsForInvalidUserIds()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => ChatRoom.BuildDirectKey(0, 10));
        Assert.Throws<ArgumentOutOfRangeException>(() => ChatRoom.BuildDirectKey(10, -5));
    }

    [Fact]
    public void AddChatModule_BindsChatSettingsAndRegistersState()
    {
        var values = new Dictionary<string, string?>
        {
            ["Chat:Enabled"] = "true",
            ["Chat:MaxMessageLength"] = "8192",
            ["Chat:MaxAttachmentsPerMessage"] = "4",
            ["ChatEncryption:Enabled"] = "false",
            ["ChatRateLimit:MessagesPerMinutePerUser"] = "30",
            ["ChatRateLimit:MessagesPerMinutePerWorkspace"] = "300",
            ["ChatRateLimit:Burst"] = "10"
        };

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();

        var services = new ServiceCollection();
        services.AddChatModule(configuration);

        using var provider = services.BuildServiceProvider();

        var chatSettings = provider.GetRequiredService<IOptions<ChatSettings>>().Value;
        var moduleState = provider.GetRequiredService<IChatModuleState>();

        Assert.True(chatSettings.Enabled);
        Assert.Equal(8192, chatSettings.MaxMessageLength);
        Assert.Equal(4, chatSettings.MaxAttachmentsPerMessage);
        Assert.True(moduleState.Enabled);
    }
}
