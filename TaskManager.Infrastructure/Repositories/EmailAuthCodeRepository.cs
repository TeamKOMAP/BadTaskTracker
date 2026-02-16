using Microsoft.EntityFrameworkCore;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;
using TaskManager.Infrastructure.Data;

namespace TaskManager.Infrastructure.Repositories
{
    public class EmailAuthCodeRepository : IEmailAuthCodeRepository
    {
        private readonly ApplicationDbContext _context;

        public EmailAuthCodeRepository(ApplicationDbContext context)
        {
            _context = context;
        }

        public Task<EmailAuthCode?> GetLatestActiveByEmailAsync(string email)
        {
            var normalized = NormalizeEmail(email);
            return _context.EmailAuthCodes
                .OrderByDescending(x => x.CreatedAtUtc)
                .FirstOrDefaultAsync(x => x.Email == normalized && !x.IsConsumed);
        }

        public Task<EmailAuthCode?> GetLatestByEmailAsync(string email)
        {
            var normalized = NormalizeEmail(email);
            return _context.EmailAuthCodes
                .OrderByDescending(x => x.CreatedAtUtc)
                .FirstOrDefaultAsync(x => x.Email == normalized);
        }

        public async Task AddAsync(EmailAuthCode code)
        {
            _context.EmailAuthCodes.Add(code);
            await _context.SaveChangesAsync();
        }

        public async Task UpdateAsync(EmailAuthCode code)
        {
            _context.EmailAuthCodes.Update(code);
            await _context.SaveChangesAsync();
        }

        public async Task ConsumeActiveByEmailAsync(string email, DateTime consumedAtUtc)
        {
            var normalized = NormalizeEmail(email);
            var activeCodes = await _context.EmailAuthCodes
                .Where(x => x.Email == normalized && !x.IsConsumed)
                .ToListAsync();

            if (!activeCodes.Any())
            {
                return;
            }

            foreach (var code in activeCodes)
            {
                code.IsConsumed = true;
                code.ConsumedAtUtc = consumedAtUtc;
            }

            await _context.SaveChangesAsync();
        }

        private static string NormalizeEmail(string email)
        {
            return (email ?? string.Empty).Trim().ToLowerInvariant();
        }
    }
}
