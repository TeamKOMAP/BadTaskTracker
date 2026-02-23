using System.Diagnostics;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using TaskManager.Application.Auth;
using TaskManager.Application.Interfaces;

namespace TaskManager.Infrastructure.Email
{
    public class HttpApiEmailSender : IEmailSender
    {
        private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

        private readonly HttpClient _httpClient;
        private readonly HttpApiEmailSettings _settings;
        private readonly ILogger<HttpApiEmailSender> _logger;

        public HttpApiEmailSender(HttpClient httpClient, EmailSettings emailSettings, ILogger<HttpApiEmailSender> logger)
        {
            _httpClient = httpClient;
            _settings = emailSettings?.HttpApi ?? new HttpApiEmailSettings();
            _logger = logger;
        }

        public async Task SendAsync(string toEmail, string subject, string htmlBody)
        {
            if (string.IsNullOrWhiteSpace(_settings.BaseUrl)
                || string.IsNullOrWhiteSpace(_settings.ApiKey)
                || string.IsNullOrWhiteSpace(_settings.FromEmail))
            {
                _logger.LogError(
                    "HTTP email API is not configured. BaseUrlSet={BaseUrlSet}, ApiKeySet={ApiKeySet}, FromEmailSet={FromEmailSet}",
                    !string.IsNullOrWhiteSpace(_settings.BaseUrl),
                    !string.IsNullOrWhiteSpace(_settings.ApiKey),
                    !string.IsNullOrWhiteSpace(_settings.FromEmail));
                throw new InvalidOperationException("HTTP email API settings are not configured.");
            }

            var timeoutSeconds = Math.Clamp(_settings.TimeoutSeconds, 2, 30);
            var timeout = TimeSpan.FromSeconds(timeoutSeconds);
            var stopwatch = Stopwatch.StartNew();

            var from = string.IsNullOrWhiteSpace(_settings.FromName)
                ? _settings.FromEmail
                : $"{_settings.FromName} <{_settings.FromEmail}>";

            var payload = new
            {
                from,
                to = new[] { toEmail },
                subject,
                html = htmlBody
            };

            using var request = new HttpRequestMessage(HttpMethod.Post, BuildSendPath(_settings.SendPath));
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _settings.ApiKey);
            request.Content = JsonContent.Create(payload, options: JsonOptions);

            _logger.LogInformation(
                "Sending email via HTTP API. Provider={Provider}, BaseUrl={BaseUrl}, To={ToEmail}, TimeoutSeconds={TimeoutSeconds}",
                _settings.Provider,
                _settings.BaseUrl,
                toEmail,
                timeoutSeconds);

            try
            {
                using var response = await _httpClient.SendAsync(request).WaitAsync(timeout);
                stopwatch.Stop();

                if (response.IsSuccessStatusCode)
                {
                    _logger.LogInformation(
                        "HTTP email sent in {ElapsedMs} ms. Provider={Provider}, To={ToEmail}",
                        stopwatch.ElapsedMilliseconds,
                        _settings.Provider,
                        toEmail);
                    return;
                }

                var body = await response.Content.ReadAsStringAsync();
                if (body.Length > 1000)
                {
                    body = body[..1000] + "...";
                }

                _logger.LogError(
                    "HTTP email API failed in {ElapsedMs} ms. Provider={Provider}, StatusCode={StatusCode}, To={ToEmail}, Response={ResponseBody}",
                    stopwatch.ElapsedMilliseconds,
                    _settings.Provider,
                    (int)response.StatusCode,
                    toEmail,
                    body);

                throw new InvalidOperationException($"HTTP email API failed with status {(int)response.StatusCode}.");
            }
            catch (TimeoutException ex)
            {
                stopwatch.Stop();
                _logger.LogError(
                    ex,
                    "HTTP email API timeout after {ElapsedMs} ms. Provider={Provider}, To={ToEmail}",
                    stopwatch.ElapsedMilliseconds,
                    _settings.Provider,
                    toEmail);
                throw new InvalidOperationException("HTTP email API request timed out.", ex);
            }
            catch (HttpRequestException ex)
            {
                stopwatch.Stop();
                _logger.LogError(
                    ex,
                    "HTTP email API request failed in {ElapsedMs} ms. Provider={Provider}, To={ToEmail}",
                    stopwatch.ElapsedMilliseconds,
                    _settings.Provider,
                    toEmail);
                throw;
            }
        }

        private static string BuildSendPath(string? rawPath)
        {
            var value = (rawPath ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(value))
            {
                return "/emails";
            }

            return value.StartsWith('/') ? value : "/" + value;
        }
    }
}
