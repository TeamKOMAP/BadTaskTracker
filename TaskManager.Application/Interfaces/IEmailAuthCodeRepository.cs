using TaskManager.Domain.Entities;

namespace TaskManager.Application.Interfaces
{
    public interface IEmailAuthCodeRepository
    {
        Task<EmailAuthCode?> GetLatestActiveByEmailAsync(string email);
        Task<EmailAuthCode?> GetLatestByEmailAsync(string email);
        Task AddAsync(EmailAuthCode code);
        Task UpdateAsync(EmailAuthCode code);
        Task ConsumeActiveByEmailAsync(string email, DateTime consumedAtUtc);
    }
}
