using Microsoft.Extensions.Options;
using TaskManager.Chat.Application.Configuration;
using TaskManager.Chat.Application.Interfaces;

namespace TaskManager.Chat.Infrastructure.Services
{
    internal sealed class ChatModuleState : IChatModuleState
    {
        private readonly IOptionsMonitor<ChatSettings> _chatSettings;

        public ChatModuleState(IOptionsMonitor<ChatSettings> chatSettings)
        {
            _chatSettings = chatSettings;
        }

        public bool Enabled => _chatSettings.CurrentValue.Enabled;
    }
}
