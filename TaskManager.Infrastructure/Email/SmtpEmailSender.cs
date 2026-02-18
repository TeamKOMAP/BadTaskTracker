using System.Diagnostics;
using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Logging;
using TaskManager.Application.Auth;
using TaskManager.Application.Interfaces;

namespace TaskManager.Infrastructure.Email
{
    public class SmtpEmailSender : IEmailSender
    {
        private readonly SmtpSettings _settings;
        private readonly ILogger<SmtpEmailSender> _logger;

        public SmtpEmailSender(SmtpSettings settings, ILogger<SmtpEmailSender> logger)
        {
            _settings = settings;
            _logger = logger;
        }

        public async Task SendAsync(string toEmail, string subject, string htmlBody)
        {
            if (string.IsNullOrWhiteSpace(_settings.Host)
                || string.IsNullOrWhiteSpace(_settings.Username)
                || string.IsNullOrWhiteSpace(_settings.Password)
                || string.IsNullOrWhiteSpace(_settings.FromEmail))
            {
                _logger.LogError(
                    "SMTP is not configured. HostSet={HostSet}, UsernameSet={UsernameSet}, PasswordSet={PasswordSet}, FromEmailSet={FromEmailSet}",
                    !string.IsNullOrWhiteSpace(_settings.Host),
                    !string.IsNullOrWhiteSpace(_settings.Username),
                    !string.IsNullOrWhiteSpace(_settings.Password),
                    !string.IsNullOrWhiteSpace(_settings.FromEmail));
                throw new InvalidOperationException("SMTP settings are not configured.");
            }

            var timeoutSeconds = Math.Clamp(_settings.TimeoutSeconds, 2, 30);
            var timeout = TimeSpan.FromSeconds(timeoutSeconds);
            var stopwatch = Stopwatch.StartNew();

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
            client.Timeout = (int)timeout.TotalMilliseconds;

            _logger.LogInformation(
                "Sending SMTP email. Host={Host}, Port={Port}, EnableSsl={EnableSsl}, To={ToEmail}, TimeoutSeconds={TimeoutSeconds}",
                _settings.Host,
                _settings.Port,
                _settings.EnableSsl,
                toEmail,
                timeoutSeconds);

            try
            {
                await client.SendMailAsync(message).WaitAsync(timeout);
                stopwatch.Stop();

                _logger.LogInformation(
                    "SMTP email sent in {ElapsedMs} ms. To={ToEmail}",
                    stopwatch.ElapsedMilliseconds,
                    toEmail);
            }
            catch (TimeoutException ex)
            {
                stopwatch.Stop();
                _logger.LogError(
                    ex,
                    "SMTP timeout after {ElapsedMs} ms. Host={Host}, Port={Port}, To={ToEmail}",
                    stopwatch.ElapsedMilliseconds,
                    _settings.Host,
                    _settings.Port,
                    toEmail);

                throw new InvalidOperationException("SMTP request timed out.", ex);
            }
            catch (SmtpException ex)
            {
                stopwatch.Stop();
                _logger.LogError(
                    ex,
                    "SMTP failed in {ElapsedMs} ms. Host={Host}, Port={Port}, StatusCode={StatusCode}, To={ToEmail}",
                    stopwatch.ElapsedMilliseconds,
                    _settings.Host,
                    _settings.Port,
                    ex.StatusCode,
                    toEmail);

                throw;
            }
            catch (Exception ex)
            {
                stopwatch.Stop();
                _logger.LogError(
                    ex,
                    "Unexpected SMTP failure in {ElapsedMs} ms. Host={Host}, Port={Port}, To={ToEmail}",
                    stopwatch.ElapsedMilliseconds,
                    _settings.Host,
                    _settings.Port,
                    toEmail);

                throw;
            }
        }
    }
}
