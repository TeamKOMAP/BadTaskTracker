using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using TaskManager.Chat.Application.Configuration;
using TaskManager.Chat.Application.Interfaces;
using TaskManager.Chat.Infrastructure.DependencyInjection;
using Xunit;

namespace TaskManager.Tests.UnitTests;

public class ChatModuleRegistrationTests
{
    [Fact]
    public void AddChatModule_BindsSettingsAndRegistersState()
    {
        var configValues = new Dictionary<string, string?>
        {
            ["Chat:Enabled"] = "true",
            ["Chat:MaxMessageLength"] = "8192",
            ["Chat:MaxAttachmentsPerMessage"] = "3",
            ["ChatEncryption:Enabled"] = "true",
            ["ChatEncryption:Algorithm"] = "AES-GCM",
            ["ChatEncryption:KeyId"] = "chat-key-v1",
            ["ChatRateLimit:MessagesPerMinutePerUser"] = "20",
            ["ChatRateLimit:MessagesPerMinutePerWorkspace"] = "200",
            ["ChatRateLimit:Burst"] = "8"
        };

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(configValues)
            .Build();

        var services = new ServiceCollection();
        services.AddChatModule(configuration);

        using var provider = services.BuildServiceProvider();

        var chatSettings = provider.GetRequiredService<IOptions<ChatSettings>>().Value;
        var encryptionSettings = provider.GetRequiredService<IOptions<ChatEncryptionSettings>>().Value;
        var rateLimitSettings = provider.GetRequiredService<IOptions<ChatRateLimitSettings>>().Value;
        var moduleState = provider.GetRequiredService<IChatModuleState>();

        chatSettings.Enabled.Should().BeTrue();
        chatSettings.MaxMessageLength.Should().Be(8192);
        chatSettings.MaxAttachmentsPerMessage.Should().Be(3);

        encryptionSettings.Enabled.Should().BeTrue();
        encryptionSettings.Algorithm.Should().Be("AES-GCM");
        encryptionSettings.KeyId.Should().Be("chat-key-v1");

        rateLimitSettings.MessagesPerMinutePerUser.Should().Be(20);
        rateLimitSettings.MessagesPerMinutePerWorkspace.Should().Be(200);
        rateLimitSettings.Burst.Should().Be(8);

        moduleState.Enabled.Should().BeTrue();
    }

    [Fact]
    public void AddChatModule_ThrowsForInvalidEncryptionSettings()
    {
        var configValues = new Dictionary<string, string?>
        {
            ["ChatEncryption:Enabled"] = "true",
            ["ChatEncryption:Algorithm"] = "AES-GCM",
            ["ChatEncryption:KeyId"] = ""
        };

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(configValues)
            .Build();

        var services = new ServiceCollection();
        services.AddChatModule(configuration);

        using var provider = services.BuildServiceProvider();

        Action act = () => _ = provider.GetRequiredService<IOptions<ChatEncryptionSettings>>().Value;

        act.Should().Throw<OptionsValidationException>()
            .WithMessage("*ChatEncryption:KeyId is required when encryption is enabled.*");
    }
}
