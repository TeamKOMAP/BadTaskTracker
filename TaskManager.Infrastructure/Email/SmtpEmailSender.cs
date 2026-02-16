using System.Net;
using System.Net.Mail;
using TaskManager.Application.Auth;
using TaskManager.Application.Interfaces;

namespace TaskManager.Infrastructure.Email
{
    public class SmtpEmailSender : IEmailSender
    {
        private readonly SmtpSettings _settings;

        public SmtpEmailSender(SmtpSettings settings)
        {
            _settings = settings;
        }

        public async Task SendAsync(string toEmail, string subject, string htmlBody)
        {
            if (string.IsNullOrWhiteSpace(_settings.Host)
                || string.IsNullOrWhiteSpace(_settings.Username)
                || string.IsNullOrWhiteSpace(_settings.Password)
                || string.IsNullOrWhiteSpace(_settings.FromEmail))
            {
                throw new InvalidOperationException("SMTP settings are not configured.");
            }

            using var message = new MailMessage
            {
                From = new MailAddress(_settings.FromEmail, _settings.FromName),
                Subject = subject,
                Body = htmlBody,
                IsBodyHtml = true
            };
            message.To.Add(new MailAddress(toEmail));

            using var client = new SmtpClient(_settings.Host, _settings.Port)
            {
                EnableSsl = _settings.EnableSsl,
                UseDefaultCredentials = false,
                Credentials = new NetworkCredential(_settings.Username, _settings.Password)
            };

            await client.SendMailAsync(message);
        }
    }
}
