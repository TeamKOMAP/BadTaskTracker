using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi.Models;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using System.Threading.RateLimiting;
using TaskManager.API.Background;
using TaskManager.API.Configuration;
using TaskManager.API.Security;
using TaskManager.Application.Auth;
using TaskManager.Application.Interfaces;
using TaskManager.Application.Storage;
using TaskManager.Application.Services;
using TaskManager.Chat.Infrastructure.DependencyInjection;
using TaskManager.Infrastructure.Data;
using TaskManager.Infrastructure.Email;
using TaskManager.Infrastructure.Repositories;
using TaskManager.Infrastructure.Storage;

DotEnvLoader.LoadFromDotEnv();

var builder = WebApplication.CreateBuilder(args);
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddChatModule(builder.Configuration);

var jwtSettings = builder.Configuration.GetSection("Jwt").Get<JwtSettings>() ?? new JwtSettings();
if (string.IsNullOrWhiteSpace(jwtSettings.Issuer)
    || string.IsNullOrWhiteSpace(jwtSettings.Audience)
    || string.IsNullOrWhiteSpace(jwtSettings.SigningKey)
    || jwtSettings.SigningKey.Length < 32)
{
    throw new InvalidOperationException("JWT configuration is invalid. Provide Jwt:Issuer, Jwt:Audience and Jwt:SigningKey (at least 32 chars).");
}

var knownInsecureJwtSigningKeys = new[]
{
    "CHANGE_ME_IN_PRODUCTION_WITH_32_PLUS_CHARS",
    "BTT_JWT_5c2a9d1f7e4b8a6c3d0f2e1a9b7c4d6e8f0a1b2c3d4e5f6a7b8c9d0e1f2a3b"
};

if ((builder.Environment.IsProduction() || builder.Environment.IsStaging())
    && knownInsecureJwtSigningKeys.Contains(jwtSettings.SigningKey, StringComparer.Ordinal))
{
    throw new InvalidOperationException(
        "JWT signing key uses insecure default value. Set a unique Jwt:SigningKey for this environment.");
}

var emailAuthSettings = builder.Configuration.GetSection("EmailAuth").Get<EmailAuthSettings>() ?? new EmailAuthSettings();
var emailSettings = builder.Configuration.GetSection("Email").Get<EmailSettings>() ?? new EmailSettings();
var smtpSettings = builder.Configuration.GetSection("Smtp").Get<SmtpSettings>() ?? new SmtpSettings();
var profileSettings = builder.Configuration.GetSection("Profile").Get<ProfileSettings>() ?? new ProfileSettings();
var storageSettings = builder.Configuration.GetSection("Storage").Get<StorageSettings>() ?? new StorageSettings();
var databaseSettings = builder.Configuration.GetSection("Database").Get<DatabaseSettings>() ?? new DatabaseSettings();

if (!builder.Environment.IsDevelopment())
{
    emailAuthSettings.EnableDevelopmentCodeFallback = false;
    emailAuthSettings.ExposeDevelopmentCodeInResponse = false;
}

builder.Services.AddSingleton(jwtSettings);
builder.Services.AddSingleton(emailAuthSettings);
builder.Services.AddSingleton(emailSettings);
builder.Services.AddSingleton(smtpSettings);
builder.Services.AddSingleton(profileSettings);
builder.Services.AddSingleton(storageSettings);
builder.Services.AddSingleton(databaseSettings);
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.RequireHttpsMetadata = false;
        options.SaveToken = true;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtSettings.Issuer,
            ValidAudience = jwtSettings.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings.SigningKey)),
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    options.AddPolicy("AuthEmailRequest", httpContext =>
    {
        var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"auth-email-request:{ip}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 3,
                Window = TimeSpan.FromMinutes(1),
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = 0,
                AutoReplenishment = true
            });
    });

    options.AddPolicy("AuthEmailVerify", httpContext =>
    {
        var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"auth-email-verify:{ip}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = 0,
                AutoReplenishment = true
            });
    });
});

// Add DbContext
builder.Services.AddDbContext<ApplicationDbContext>(options =>
{
    var provider = (databaseSettings.Provider ?? string.Empty).Trim();

    if (provider.Equals("Postgres", StringComparison.OrdinalIgnoreCase)
        || provider.Equals("PostgreSql", StringComparison.OrdinalIgnoreCase)
        || provider.Equals("PostgreSQL", StringComparison.OrdinalIgnoreCase))
    {
        var postgresConnection = builder.Configuration.GetConnectionString("Postgres");
        if (string.IsNullOrWhiteSpace(postgresConnection))
        {
            throw new InvalidOperationException("ConnectionStrings:Postgres must be configured when Database:Provider=Postgres.");
        }

        options.UseNpgsql(postgresConnection, npgsql =>
        {
            npgsql.EnableRetryOnFailure(5, TimeSpan.FromSeconds(3), null);
        });
        return;
    }

    if (provider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase)
        || string.IsNullOrWhiteSpace(provider))
    {
        var sqliteConnection = builder.Configuration.GetConnectionString("DefaultConnection");
        if (string.IsNullOrWhiteSpace(sqliteConnection))
        {
            throw new InvalidOperationException("ConnectionStrings:DefaultConnection must be configured for Sqlite provider.");
        }

        options.UseSqlite(sqliteConnection);
        return;
    }

    throw new InvalidOperationException($"Unsupported database provider '{provider}'. Use Sqlite or Postgres.");
});

// Add Repositories
builder.Services.AddScoped<ITaskRepository, TaskRepository>();
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<ITagRepository, TagRepository>();
builder.Services.AddScoped<IWorkspaceRepository, WorkspaceRepository>();
builder.Services.AddScoped<IWorkspaceMemberRepository, WorkspaceMemberRepository>();
builder.Services.AddScoped<IEmailAuthCodeRepository, EmailAuthCodeRepository>();
builder.Services.AddScoped<INotificationRepository, NotificationRepository>();
builder.Services.AddScoped<IWorkspaceInvitationRepository, WorkspaceInvitationRepository>();

// Add Services
builder.Services.AddScoped<ITaskService, TaskService>();
builder.Services.AddScoped<ITagService, TagService>();
builder.Services.AddScoped<IWorkspaceService, WorkspaceService>();
builder.Services.AddScoped<IOverdueStatusService, OverdueStatusService>();
builder.Services.AddScoped<IReportService, ReportService>();
builder.Services.AddScoped<ITaskAttachmentService, TaskAttachmentService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IWorkspaceInvitationService, WorkspaceInvitationService>();
builder.Services.AddScoped<SmtpEmailSender>();
builder.Services.AddHttpClient<HttpApiEmailSender>((sp, client) =>
{
    var settings = sp.GetRequiredService<EmailSettings>().HttpApi ?? new HttpApiEmailSettings();
    if (Uri.TryCreate(settings.BaseUrl, UriKind.Absolute, out var baseUri))
    {
        client.BaseAddress = baseUri;
    }

    client.Timeout = TimeSpan.FromSeconds(Math.Clamp(settings.TimeoutSeconds, 2, 30));
});
builder.Services.AddScoped<IEmailSender>(sp =>
{
    var provider = (sp.GetRequiredService<EmailSettings>().Provider ?? string.Empty).Trim();
    if (provider.Equals("HttpApi", StringComparison.OrdinalIgnoreCase)
        || provider.Equals("Resend", StringComparison.OrdinalIgnoreCase))
    {
        return sp.GetRequiredService<HttpApiEmailSender>();
    }

    return sp.GetRequiredService<SmtpEmailSender>();
});
builder.Services.AddSingleton<IJwtTokenService, JwtTokenService>();
builder.Services.AddHostedService<OverdueStatusSyncBackgroundService>();
builder.Services.AddHostedService<DeadlineNotificationBackgroundService>();
builder.Services.AddSingleton<LocalObjectStorage>(sp =>
{
    var settings = sp.GetRequiredService<StorageSettings>();
    var env = sp.GetRequiredService<IWebHostEnvironment>();
    return new LocalObjectStorage(env.ContentRootPath, settings);
});
builder.Services.AddSingleton<S3ObjectStorage>(sp =>
{
    var settings = sp.GetRequiredService<StorageSettings>();
    return new S3ObjectStorage(settings);
});
builder.Services.AddSingleton<PostgresObjectStorage>();
builder.Services.AddSingleton<IObjectStorage>(sp =>
{
    var settings = sp.GetRequiredService<StorageSettings>();
    var provider = (settings.Provider ?? string.Empty).Trim();

    if (provider.Equals("S3", StringComparison.OrdinalIgnoreCase))
    {
        return sp.GetRequiredService<S3ObjectStorage>();
    }

    if (provider.Equals("Postgres", StringComparison.OrdinalIgnoreCase)
        || provider.Equals("PostgreSql", StringComparison.OrdinalIgnoreCase)
        || provider.Equals("PostgreSQL", StringComparison.OrdinalIgnoreCase))
    {
        return sp.GetRequiredService<PostgresObjectStorage>();
    }

    if (provider.Equals("Local", StringComparison.OrdinalIgnoreCase)
        || string.IsNullOrWhiteSpace(provider))
    {
        return sp.GetRequiredService<LocalObjectStorage>();
    }

    throw new InvalidOperationException($"Unsupported storage provider '{provider}'. Use Local, S3 or Postgres.");
});
builder.Services.AddScoped<IAttachmentStorage, ObjectAttachmentStorage>();
builder.Services.AddScoped<LegacyStorageMigrator>();

// Configure Swagger/OpenAPI
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Task Manager API",
        Version = "v1",
        Description = "API",
        Contact = new OpenApiContact
        {
            Name = "Task Manager Team",
            Email = "support@taskmanager.com"
        },
        License = new OpenApiLicense
        {
            Name = "MIT License",
            Url = new Uri("https://opensource.org/licenses/MIT")
        }
    });

    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "JWT Authorization header using the Bearer scheme"
    });

    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });

    var xmlFile = $"{System.Reflection.Assembly.GetExecutingAssembly().GetName().Name}.xml";
    var xmlPath = Path.Combine(AppContext.BaseDirectory, xmlFile);
    if (File.Exists(xmlPath))
    {
        c.IncludeXmlComments(xmlPath);
    }
});

var app = builder.Build();

// Configure the HTTP request pipeline.
app.UseForwardedHeaders();
app.UseHttpsRedirection();

app.Use(async (context, next) =>
{
    context.Response.Headers.TryAdd("X-Content-Type-Options", "nosniff");
    await next();
});

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "Task Manager API v1");
        c.RoutePrefix = "swagger";
        c.DisplayRequestDuration();
        c.EnableDeepLinking();
        c.DefaultModelsExpandDepth(-1);
    });
}

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRouting();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/healthz", async (ApplicationDbContext dbContext, CancellationToken cancellationToken) =>
{
    try
    {
        var canConnect = await dbContext.Database.CanConnectAsync(cancellationToken);
        if (!canConnect)
        {
            return Results.Problem(
                title: "Database connection failed",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        return Results.Ok(new { status = "ok", database = "ok" });
    }
    catch (Exception ex)
    {
        return Results.Problem(
            title: "Database health check failed",
            detail: app.Environment.IsDevelopment() ? ex.Message : null,
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});
app.MapControllers();

// Apply migrations and seed data
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    var logger = services.GetRequiredService<ILogger<Program>>();
    var startupSection = builder.Configuration.GetSection("DatabaseStartup");
    var applyMigrations = startupSection.GetValue<bool>("ApplyMigrations", true);
    var seed = startupSection.GetValue<bool>("Seed", true);
    var migrateLegacyFiles = startupSection.GetValue<bool>("MigrateLegacyFiles", true);
    var smokeCheckConnection = startupSection.GetValue<bool>("SmokeCheckConnection", true);
    var failFast = startupSection.GetValue<bool>("FailFast", true);

    try
    {
        var dbContext = services.GetRequiredService<ApplicationDbContext>();
        var isRelationalProvider = dbContext.Database.IsRelational();

        if (applyMigrations)
        {
            if (isRelationalProvider)
            {
                var pendingMigrations = dbContext.Database.GetPendingMigrations().ToList();
                if (pendingMigrations.Any())
                {
                    logger.LogInformation("Applying {Count} pending migrations...", pendingMigrations.Count);
                    dbContext.Database.Migrate();
                    logger.LogInformation("Migrations applied successfully.");
                }
            }
            else
            {
                logger.LogInformation(
                    "Skipping migrations for non-relational provider {ProviderName}.",
                    dbContext.Database.ProviderName ?? "unknown");
            }
        }

        if (smokeCheckConnection && isRelationalProvider)
        {
            var canConnect = await dbContext.Database.CanConnectAsync();
            if (!canConnect)
            {
                throw new InvalidOperationException("Database connectivity check failed.");
            }
        }

        if (migrateLegacyFiles)
        {
            if (isRelationalProvider)
            {
                logger.LogInformation("Running legacy storage migration...");
                var migrator = services.GetRequiredService<LegacyStorageMigrator>();
                await migrator.MigrateAsync();
                logger.LogInformation("Legacy storage migration complete.");
            }
            else
            {
                logger.LogInformation(
                    "Skipping legacy storage migration for non-relational provider {ProviderName}.",
                    dbContext.Database.ProviderName ?? "unknown");
            }
        }

        if (seed)
        {
            SeedData.Initialize(dbContext);
        }
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "An error occurred while migrating or seeding the database.");
        if (failFast || !app.Environment.IsDevelopment())
        {
            throw;
        }
    }
}

app.Run();

// Делаем Program доступным для интеграционных тестов
public partial class Program { }
