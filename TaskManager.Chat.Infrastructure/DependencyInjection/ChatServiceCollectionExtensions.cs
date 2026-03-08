using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using TaskManager.Chat.Application.Configuration;
using TaskManager.Chat.Application.Interfaces;
using TaskManager.Chat.Infrastructure.Services;

namespace TaskManager.Chat.Infrastructure.DependencyInjection
{
    public static class ChatServiceCollectionExtensions
    {
        public static IServiceCollection AddChatModule(this IServiceCollection services, IConfiguration configuration)
        {
            services
                .AddOptions<ChatSettings>()
                .Bind(configuration.GetSection("Chat"))
                .Validate(settings => settings.MaxMessageLength > 0, "Chat:MaxMessageLength must be greater than zero.")
                .Validate(settings => settings.MaxAttachmentsPerMessage >= 0, "Chat:MaxAttachmentsPerMessage must be zero or greater.")
                .ValidateOnStart();

            services
                .AddOptions<ChatEncryptionSettings>()
                .Bind(configuration.GetSection("ChatEncryption"))
                .Validate(settings => !settings.Enabled || !string.IsNullOrWhiteSpace(settings.Algorithm),
                    "ChatEncryption:Algorithm is required when encryption is enabled.")
                .Validate(settings => !settings.Enabled || !string.IsNullOrWhiteSpace(settings.KeyId),
                    "ChatEncryption:KeyId is required when encryption is enabled.")
                .ValidateOnStart();

            services
                .AddOptions<ChatRateLimitSettings>()
                .Bind(configuration.GetSection("ChatRateLimit"))
                .Validate(settings => settings.MessagesPerMinutePerUser > 0,
                    "ChatRateLimit:MessagesPerMinutePerUser must be greater than zero.")
                .Validate(settings => settings.MessagesPerMinutePerWorkspace > 0,
                    "ChatRateLimit:MessagesPerMinutePerWorkspace must be greater than zero.")
                .Validate(settings => settings.Burst > 0,
                    "ChatRateLimit:Burst must be greater than zero.")
                .ValidateOnStart();

            services.AddSingleton<IChatModuleState, ChatModuleState>();

            return services;
        }
    }
}
