using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using AssessmentWebApi.Configuration;
using AssessmentWebApi.Data;
using AssessmentWebApi.Models;
using AssessmentWebApi.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace AssessmentWebApi.Tests
{
    public class CasAuthIntegrationTests
    {
        private const string CasKey = "tbV/kbyLRqqoDCKJVwksaKqE07GNPkOcFTX7LN96nkY=";
        private const string CasIssuer = "CAS.Api";
        private const string CasAudience = "CAS.Clients";
        private const long BusinessEntityId = 700;

        private AppDbContext CreateInMemoryDbContext(string dbName)
        {
            var options = new DbContextOptionsBuilder<AppDbContext>()
                .UseInMemoryDatabase(databaseName: dbName)
                .Options;

            var context = new AppDbContext(options);

            // Seed Roles
            var controlRole = new Role { Id = 64, RoleName = "Control", BusinessEntity = "Assessment" };
            var assessorRole = new Role { Id = 63, RoleName = "Assessor", BusinessEntity = "Assessment" };
            var verifierRole = new Role { Id = 65, RoleName = "Verifier", BusinessEntity = "Assessment" };
            var studentRole = new Role { Id = 4, RoleName = "Student", BusinessEntity = "Assessment" };

            context.Roles.AddRange(controlRole, assessorRole, verifierRole, studentRole);

            // Seed Active Accounts
            var status = new Status { Id = 1, StatusName = "Active" };
            context.Statuses.Add(status);

            context.Accounts.AddRange(
                new Account
                {
                    Id = 17876,
                    Email = "control@assessment.com",
                    NationalId = "10000000000001",
                    FullNameEn = "Wael Darwish",
                    FullNameAr = "وائل درويش",
                    RoleId = 64,
                    Role = controlRole,
                    StatusId = 1,
                    IsActive = true,
                    PasswordHash = "hash"
                },
                new Account
                {
                    Id = 17892,
                    Email = "mahmoud@elsewedy.com",
                    NationalId = "29001010100002",
                    FullNameEn = "Eng. Mahmoud Hassan",
                    FullNameAr = "م. محمود حسن",
                    RoleId = 63,
                    Role = assessorRole,
                    StatusId = 1,
                    IsActive = true,
                    PasswordHash = "hash"
                },
                new Account
                {
                    Id = 17895,
                    Email = "mohamed@elsewedy.com",
                    NationalId = "29001010100005",
                    FullNameEn = "Eng. Mohamed Ibrahim",
                    FullNameAr = "م. محمد إبراهيم",
                    RoleId = 65,
                    Role = verifierRole,
                    StatusId = 1,
                    IsActive = true,
                    PasswordHash = "hash"
                },
                new Account
                {
                    Id = 6,
                    Email = "student1@elsewedy.com",
                    NationalId = "29804045555555",
                    FullNameEn = "Hussein Mohamed",
                    FullNameAr = "حسين محمد",
                    RoleId = 4,
                    Role = studentRole,
                    StatusId = 1,
                    IsActive = true,
                    PasswordHash = "hash"
                },
                new Account
                {
                    Id = 999,
                    Email = "inactive@elsewedy.com",
                    NationalId = "99999999999999",
                    FullNameEn = "Inactive User",
                    FullNameAr = "مستخدم معطل",
                    RoleId = 4,
                    Role = studentRole,
                    StatusId = 1,
                    IsActive = false,
                    PasswordHash = "hash"
                }
            );

            context.SaveChanges();
            return context;
        }

        private ICasAuthService CreateService(AppDbContext context)
        {
            var casOptions = Options.Create(new CasOptions
            {
                BaseUrl = "https://centerlizedlogin.sewedy.com.eg",
                BusinessEntityId = 700,
                BusinessEntityName = "Assessment System",
                CallbackUrl = "http://localhost:3000/sso-callback",
                JwtKey = CasKey,
                JwtIssuer = CasIssuer,
                JwtAudience = CasAudience,
                TokenExpirationMinutes = 480
            });

            var inMemorySettings = new Dictionary<string, string?>
            {
                { "Jwt:Key", "Test_Secret_Key_For_Assessment_System_JWT_Testing_2026!" },
                { "Jwt:Issuer", "AssessmentSystem.Api" },
                { "Jwt:Audience", "AssessmentSystem.Clients" }
            };

            var configuration = new ConfigurationBuilder()
                .AddInMemoryCollection(inMemorySettings)
                .Build();

            return new CasAuthService(context, casOptions, configuration);
        }

        private string GenerateCasToken(
            long accountId,
            string nationalId,
            string email,
            string fullName,
            string role,
            long entityId = 700,
            DateTime? expires = null,
            string signingKey = CasKey)
        {
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new List<Claim>
            {
                new("AccountId", accountId.ToString()),
                new(ClaimTypes.NameIdentifier, accountId.ToString()),
                new(JwtRegisteredClaimNames.Sub, accountId.ToString()),
                new("userId", accountId.ToString()),
                new("Email", email),
                new(ClaimTypes.Email, email),
                new("NationalId", nationalId),
                new("FullNameEn", fullName),
                new("Role", role),
                new(ClaimTypes.Role, role),
                new("BusinessEntityId", entityId.ToString()),
                new("BusinessEntityName", "Assessment System"),
                new("TokenType", "System"),
                new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N"))
            };

            var token = new JwtSecurityToken(
                issuer: CasIssuer,
                audience: CasAudience,
                claims: claims,
                expires: expires ?? DateTime.UtcNow.AddMinutes(60),
                signingCredentials: creds);

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        [Fact]
        public async Task ValidateAndProcessCasToken_WithValidTokenAndRegisteredEntityId700_SucceedsAndIdentifiesUser()
        {
            using var context = CreateInMemoryDbContext("TestDb_ValidLogin");
            var service = CreateService(context);

            var token = GenerateCasToken(
                accountId: 17876,
                nationalId: "10000000000001",
                email: "control@assessment.com",
                fullName: "Wael Darwish",
                role: "Control",
                entityId: 700
            );

            var profile = await service.ValidateAndProcessCasTokenAsync(token);

            Assert.NotNull(profile);
            Assert.Equal(17876, profile.UserId);
            Assert.Equal("control@assessment.com", profile.Email);
            Assert.Equal("controller", profile.Role);
            Assert.Equal("Control", profile.RoleName);
            Assert.Equal(700, profile.BusinessEntityId);
            Assert.False(string.IsNullOrWhiteSpace(profile.Token));
        }

        [Fact]
        public async Task ValidateAndProcessCasToken_WithWrongBusinessEntityId_ThrowsUnauthorizedAccessException()
        {
            using var context = CreateInMemoryDbContext("TestDb_WrongEntity");
            var service = CreateService(context);

            // Token issued for entity ID 500 instead of 700
            var token = GenerateCasToken(
                accountId: 17876,
                nationalId: "10000000000001",
                email: "control@assessment.com",
                fullName: "Wael Darwish",
                role: "Control",
                entityId: 500
            );

            var ex = await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
                service.ValidateAndProcessCasTokenAsync(token));

            Assert.Contains("Business Entity ID", ex.Message);
        }

        [Fact]
        public async Task ValidateAndProcessCasToken_WithTamperedSignature_ThrowsUnauthorizedAccessException()
        {
            using var context = CreateInMemoryDbContext("TestDb_TamperedSignature");
            var service = CreateService(context);

            var invalidKey = "DifferentSigningKeyForTamperedTokenTest12345=";
            var token = GenerateCasToken(
                accountId: 17876,
                nationalId: "10000000000001",
                email: "control@assessment.com",
                fullName: "Wael Darwish",
                role: "Control",
                signingKey: invalidKey
            );

            var ex = await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
                service.ValidateAndProcessCasTokenAsync(token));

            Assert.Contains("Invalid CAS authentication token", ex.Message);
        }

        [Fact]
        public async Task ValidateAndProcessCasToken_WithExpiredToken_ThrowsUnauthorizedAccessException()
        {
            using var context = CreateInMemoryDbContext("TestDb_Expired");
            var service = CreateService(context);

            var expiredToken = GenerateCasToken(
                accountId: 17876,
                nationalId: "10000000000001",
                email: "control@assessment.com",
                fullName: "Wael Darwish",
                role: "Control",
                expires: DateTime.UtcNow.AddMinutes(-30) // Expired 30 minutes ago
            );

            var ex = await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
                service.ValidateAndProcessCasTokenAsync(expiredToken));

            Assert.Contains("expired", ex.Message, StringComparison.OrdinalIgnoreCase);
        }

        [Fact]
        public async Task ValidateAndProcessCasToken_WhenUserDoesNotExistInAssessmentDatabase_ThrowsKeyNotFoundException()
        {
            using var context = CreateInMemoryDbContext("TestDb_MissingUser");
            var service = CreateService(context);

            var token = GenerateCasToken(
                accountId: 99999,
                nationalId: "88888888888888",
                email: "unregistered.user@elsewedy.com",
                fullName: "Unregistered User",
                role: "Student",
                entityId: 700
            );

            var ex = await Assert.ThrowsAsync<KeyNotFoundException>(() =>
                service.ValidateAndProcessCasTokenAsync(token));

            Assert.Contains("does not exist in the Assessment System database", ex.Message);
        }

        [Fact]
        public async Task ValidateAndProcessCasToken_WhenUserIsDeactivated_ThrowsUnauthorizedAccessException()
        {
            using var context = CreateInMemoryDbContext("TestDb_DeactivatedUser");
            var service = CreateService(context);

            var token = GenerateCasToken(
                accountId: 999,
                nationalId: "99999999999999",
                email: "inactive@elsewedy.com",
                fullName: "Inactive User",
                role: "Student",
                entityId: 700
            );

            var ex = await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
                service.ValidateAndProcessCasTokenAsync(token));

            Assert.Contains("deactivated", ex.Message, StringComparison.OrdinalIgnoreCase);
        }

        [Theory]
        [InlineData("Control", "controller")]
        [InlineData("Admin", "controller")]
        [InlineData("SuperAdmin", "controller")]
        [InlineData("Assessor", "assessor")]
        [InlineData("Teacher", "assessor")]
        [InlineData("Instructor", "assessor")]
        [InlineData("Verifier", "verifier")]
        [InlineData("Reviewer", "verifier")]
        [InlineData("Student", "student")]
        public void NormalizeRole_CorrectlyMapsRoles(string inputRole, string expectedNormalized)
        {
            var result = CasAuthService.NormalizeRole(inputRole);
            Assert.Equal(expectedNormalized, result);
        }

        [Fact]
        public void GetCasConfig_ReturnsEntityId700AndExpectedRedirect()
        {
            using var context = CreateInMemoryDbContext("TestDb_Config");
            var service = CreateService(context);

            var config = service.GetCasConfig("http://localhost:3000");

            Assert.Equal(700, config.BusinessEntityId);
            Assert.Equal("Assessment System", config.BusinessEntityName);
            Assert.Equal("https://centerlizedlogin.sewedy.com.eg", config.CasBaseUrl);
            Assert.Equal("http://localhost:3000/sso-callback", config.CallbackUrl);
            Assert.Contains("businessEntityId=700", config.LoginUrl);
            Assert.Contains("redirect=http%3A%2F%2Flocalhost%3A3000%2Fsso-callback", config.LoginUrl);
        }

        [Fact]
        public async Task ValidateTokenAndGetUserProfile_WithIssuedAssessmentJwt_Succeeds()
        {
            using var context = CreateInMemoryDbContext("TestDb_UserProfile");
            var service = CreateService(context);

            var account = context.Accounts.Include(a => a.Role).First(a => a.Email == "mahmoud@elsewedy.com");
            var sessionJwt = service.GenerateAssessmentJwt(account, "assessor", "Assessor");

            var principal = service.ValidateToken(sessionJwt);
            Assert.NotNull(principal);

            var profile = await service.GetUserProfileAsync(principal);
            Assert.NotNull(profile);
            Assert.Equal("mahmoud@elsewedy.com", profile.Email);
            Assert.Equal("assessor", profile.Role);
            Assert.Equal("Assessor", profile.RoleName);
        }
    }
}
