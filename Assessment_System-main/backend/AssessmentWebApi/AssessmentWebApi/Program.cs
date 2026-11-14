using System.Text;
using AssessmentWebApi.Configuration;
using AssessmentWebApi.Data;
using AssessmentWebApi.Repository.AuthRepository;
using AssessmentWebApi.Repository.CourseMaterialRepository;
using AssessmentWebApi.Repository.CourseRepository;
using AssessmentWebApi.Repository.CompetencyResultRepository;
using AssessmentWebApi.Repository.CourseRoundAssignmentRepository;
using AssessmentWebApi.Repository.CourseRoundInstructorRepository;
using AssessmentWebApi.Repository.DashboardRepository;
using AssessmentWebApi.Repository.CourseRoundRepository;
using AssessmentWebApi.Repository.EngineerRepository;
using AssessmentWebApi.Repository.StudentRepository;
using AssessmentWebApi.Services;
using Holistic_Training.Repository.GenericRepo;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Configure CAS and JWT options
builder.Services.Configure<CasOptions>(builder.Configuration.GetSection(CasOptions.SectionName));
builder.Services.AddScoped<ICasAuthService, CasAuthService>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
        policy.WithOrigins(
                  "http://localhost:3000",
                  "https://localhost:3000",
                  "http://assessmentproject.runasp.net",
                  "https://assessmentproject.runasp.net",
                  "https://centerlizedlogin.sewedy.com.eg")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials());
});

// Configure JWT Authentication (supporting both Assessment System tokens and CAS tokens)
var casKey = builder.Configuration["CAS:JwtKey"] ?? "tbV/kbyLRqqoDCKJVwksaKqE07GNPkOcFTX7LN96nkY=";
var casIssuer = builder.Configuration["CAS:JwtIssuer"] ?? "CAS.Api";
var casAudience = builder.Configuration["CAS:JwtAudience"] ?? "CAS.Clients";

var localKey = builder.Configuration["Jwt:Key"] ?? casKey;
var localIssuer = builder.Configuration["Jwt:Issuer"] ?? "AssessmentSystem.Api";
var localAudience = builder.Configuration["Jwt:Audience"] ?? "AssessmentSystem.Clients";

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = false;
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKeys = new SecurityKey[]
        {
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(localKey)),
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(casKey))
        },
        ValidateIssuer = true,
        ValidIssuers = new[] { localIssuer, casIssuer },
        ValidateAudience = true,
        ValidAudiences = new[] { localAudience, casAudience },
        ValidateLifetime = true,
        ClockSkew = TimeSpan.FromMinutes(5)
    };

    // Support extracting token from Authorization header OR HttpOnly cookie
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            if (context.Request.Cookies.TryGetValue("assessment_session", out var cookieToken) && !string.IsNullOrWhiteSpace(cookieToken))
            {
                context.Token = cookieToken;
            }
            else if (context.Request.Cookies.TryGetValue("token", out var legacyCookie) && !string.IsNullOrWhiteSpace(legacyCookie))
            {
                context.Token = legacyCookie;
            }
            return Task.CompletedTask;
        }
    };
});

builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// Generic repository
builder.Services.AddScoped(typeof(IGenericRepo<>), typeof(GenericRepo<>));

// Feature repositories
builder.Services.AddScoped<IStudentRepo,        StudentRepo>();
builder.Services.AddScoped<IEngineerRepo,       EngineerRepo>();
builder.Services.AddScoped<ICourseRepo,         CourseRepo>();
builder.Services.AddScoped<IAuthRepo,           AuthRepo>();
builder.Services.AddScoped<ICourseMaterialRepo,           CourseMaterialRepo>();
builder.Services.AddScoped<ICourseRoundRepo,              CourseRoundRepo>();
builder.Services.AddScoped<ICourseRoundAssignmentRepo,    CourseRoundAssignmentRepo>();
builder.Services.AddScoped<ICourseRoundInstructorRepo,    CourseRoundInstructorRepo>();
builder.Services.AddScoped<ICompetencyResultRepo,         CompetencyResultRepo>();
builder.Services.AddScoped<IDashboardRepo,                DashboardRepo>();

builder.Services.AddControllers().AddJsonOptions(x =>
    x.JsonSerializerOptions.ReferenceHandler =
        System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles);

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
	var services = scope.ServiceProvider;
	try
	{
		var context = services.GetRequiredService<AppDbContext>();
		if (context.Database.GetMigrations().Any())
		{
			context.Database.Migrate();
		}
	}
	catch (Exception ex)
	{
		var logger = services.GetRequiredService<ILogger<Program>>();
		logger.LogError(ex, "An error occurred while migrating the database.");
	}
}

app.UseSwagger();
app.UseSwaggerUI();

// Show full exception details to help diagnose 500 errors
app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        context.Response.StatusCode = 500;
        context.Response.ContentType = "application/json";
        var error = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>();
        if (error != null)
        {
            await context.Response.WriteAsJsonAsync(new
            {
                message = error.Error.Message,
                inner   = error.Error.InnerException?.Message,
                type    = error.Error.GetType().Name
            });
        }
    });
});

app.UseHttpsRedirection();
app.UseCors("AllowFrontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();
