using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using AssessmentWebApi.Configuration;
using AssessmentWebApi.Data;
using AssessmentWebApi.Dto_s.AuthDto_s;
using AssessmentWebApi.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace AssessmentWebApi.Services
{
    public class CasAuthService : ICasAuthService
    {
        private readonly AppDbContext _context;
        private readonly CasOptions _casOptions;
        private readonly IConfiguration _configuration;
        private readonly JwtSecurityTokenHandler _tokenHandler = new();

        public CasAuthService(
            AppDbContext context,
            IOptions<CasOptions> casOptions,
            IConfiguration configuration)
        {
            _context = context ?? throw new ArgumentNullException(nameof(context));
            _casOptions = casOptions?.Value ?? new CasOptions();
            _configuration = configuration ?? throw new ArgumentNullException(nameof(configuration));
        }

        public async Task<UserMeDto> ValidateAndProcessCasTokenAsync(
            string token,
            string? redirectUrl = null,
            CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(token))
                throw new ArgumentException("CAS token is required.", nameof(token));

            // 1. Validate CAS token cryptographically
            ClaimsPrincipal principal;
            try
            {
                var validationParameters = new TokenValidationParameters
                {
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_casOptions.JwtKey)),

                    ValidateIssuer = true,
                    ValidIssuer = _casOptions.JwtIssuer,

                    ValidateAudience = true,
                    ValidAudience = _casOptions.JwtAudience,

                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromMinutes(5)
                };

                principal = _tokenHandler.ValidateToken(token, validationParameters, out var validatedToken);
            }
            catch (SecurityTokenExpiredException)
            {
                throw new UnauthorizedAccessException("The CAS authentication token has expired. Please sign in again.");
            }
            catch (Exception ex)
            {
                throw new UnauthorizedAccessException($"Invalid CAS authentication token: {ex.Message}");
            }

            // 2. Validate BusinessEntityId matches 700 (Assessment System)
            var entityIdClaim = principal.FindFirst("BusinessEntityId")?.Value
                ?? principal.FindFirst("entityId")?.Value;

            if (!string.IsNullOrWhiteSpace(entityIdClaim) &&
                long.TryParse(entityIdClaim, out var entityId) &&
                entityId != _casOptions.BusinessEntityId)
            {
                throw new UnauthorizedAccessException(
                    $"Token is for Business Entity ID {entityId}, but Assessment System requires Business Entity ID {_casOptions.BusinessEntityId}.");
            }

            // 3. Extract trusted claims from CAS token
            var accountIdClaim = principal.FindFirst("AccountId")?.Value
                ?? principal.FindFirst("userId")?.Value
                ?? principal.FindFirst("id")?.Value
                ?? principal.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? principal.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;

            long? casAccountId = long.TryParse(accountIdClaim, out var parsedId) ? parsedId : null;

            var nationalId = principal.FindFirst("NationalId")?.Value?.Trim();
            var email = (principal.FindFirst("Email")?.Value
                ?? principal.FindFirst(ClaimTypes.Email)?.Value)?.Trim();

            var fullNameEn = principal.FindFirst("FullNameEn")?.Value
                ?? principal.FindFirst(ClaimTypes.Name)?.Value
                ?? principal.FindFirst("name")?.Value
                ?? string.Empty;

            var fullNameAr = principal.FindFirst("FullNameAr")?.Value ?? string.Empty;

            var casRole = principal.FindFirst("Role")?.Value
                ?? principal.FindFirst("role")?.Value
                ?? principal.FindFirst(ClaimTypes.Role)?.Value
                ?? string.Empty;

            if (string.IsNullOrWhiteSpace(email) && string.IsNullOrWhiteSpace(nationalId) && !casAccountId.HasValue)
            {
                throw new UnauthorizedAccessException("CAS token is missing trusted user identifiers (Email, NationalId, or AccountId).");
            }

            // 4. Match user in existing Assessment System database
            Account? account = null;

            if (!string.IsNullOrWhiteSpace(email))
            {
                var normalizedEmail = email.ToLowerInvariant();
                account = await _context.Accounts
                    .Include(a => a.Role)
                    .FirstOrDefaultAsync(a => a.Email.ToLower() == normalizedEmail, cancellationToken);
            }

            if (account == null && !string.IsNullOrWhiteSpace(nationalId))
            {
                account = await _context.Accounts
                    .Include(a => a.Role)
                    .FirstOrDefaultAsync(a => a.NationalId == nationalId, cancellationToken);
            }

            if (account == null && casAccountId.HasValue)
            {
                account = await _context.Accounts
                    .Include(a => a.Role)
                    .FirstOrDefaultAsync(a => a.Id == casAccountId.Value, cancellationToken);
            }

            // If account does not exist in Assessment System database:
            if (account == null)
            {
                throw new KeyNotFoundException(
                    $"User '{email ?? nationalId ?? accountIdClaim}' is authenticated by CAS, but does not exist in the Assessment System database. " +
                    "An account must be registered or enrolled in Assessment System by the Control/Administrator before access can be granted.");
            }

            // Validate account is active
            if (!account.IsActive)
            {
                throw new UnauthorizedAccessException("Your Assessment System account is deactivated. Please contact the administrator.");
            }

            // 5. Determine and map role
            var roleName = account.Role?.RoleName;
            if (string.IsNullOrWhiteSpace(roleName))
            {
                roleName = !string.IsNullOrWhiteSpace(casRole) ? casRole : "Student";
            }

            var normalizedRole = NormalizeRole(roleName);

            // 6. Record login session in Logins table
            try
            {
                await _context.Logins.AddAsync(new Login
                {
                    AccountId = account.Id,
                    Email = account.Email,
                    PasswordHash = "CAS_SSO_SESSION",
                    StatusId = 1
                }, cancellationToken);
                await _context.SaveChangesAsync(cancellationToken);
            }
            catch
            {
                // Non-critical audit log failure should not block login
            }

            // 7. Issue an Assessment System session token
            var sessionToken = GenerateAssessmentJwt(account, normalizedRole, roleName);

            var username = account.Email.Contains('@')
                ? account.Email.Split('@')[0]
                : account.Email;

            return new UserMeDto
            {
                UserId = account.Id,
                AccountId = account.Id,
                NationalId = account.NationalId,
                FullName = !string.IsNullOrWhiteSpace(account.FullNameEn) ? account.FullNameEn : fullNameEn,
                FullNameEn = !string.IsNullOrWhiteSpace(account.FullNameEn) ? account.FullNameEn : fullNameEn,
                FullNameAr = !string.IsNullOrWhiteSpace(account.FullNameAr) ? account.FullNameAr : fullNameAr,
                Username = username,
                Email = account.Email,
                RoleName = roleName,
                Role = normalizedRole,
                Token = sessionToken,
                BusinessEntityId = _casOptions.BusinessEntityId,
                BusinessEntityName = _casOptions.BusinessEntityName
            };
        }

        public async Task<UserMeDto> GetUserProfileAsync(
            ClaimsPrincipal principal,
            CancellationToken cancellationToken = default)
        {
            if (principal == null)
                throw new UnauthorizedAccessException("User is not authenticated.");

            // Extract identifier from principal
            var idClaim = principal.FindFirst("AccountId")?.Value
                ?? principal.FindFirst("userId")?.Value
                ?? principal.FindFirst("id")?.Value
                ?? principal.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? principal.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;

            var emailClaim = principal.FindFirst("Email")?.Value
                ?? principal.FindFirst(ClaimTypes.Email)?.Value;

            var nationalIdClaim = principal.FindFirst("NationalId")?.Value;

            Account? account = null;

            if (long.TryParse(idClaim, out var accountId))
            {
                account = await _context.Accounts
                    .Include(a => a.Role)
                    .FirstOrDefaultAsync(a => a.Id == accountId, cancellationToken);
            }

            if (account == null && !string.IsNullOrWhiteSpace(emailClaim))
            {
                var normalizedEmail = emailClaim.ToLowerInvariant();
                account = await _context.Accounts
                    .Include(a => a.Role)
                    .FirstOrDefaultAsync(a => a.Email.ToLower() == normalizedEmail, cancellationToken);
            }

            if (account == null && !string.IsNullOrWhiteSpace(nationalIdClaim))
            {
                account = await _context.Accounts
                    .Include(a => a.Role)
                    .FirstOrDefaultAsync(a => a.NationalId == nationalIdClaim, cancellationToken);
            }

            if (account == null)
                throw new UnauthorizedAccessException("Authenticated account was not found in Assessment System database.");

            if (!account.IsActive)
                throw new UnauthorizedAccessException("This Assessment System account has been deactivated.");

            var roleName = account.Role?.RoleName
                ?? principal.FindFirst(ClaimTypes.Role)?.Value
                ?? principal.FindFirst("role")?.Value
                ?? "Student";

            var normalizedRole = NormalizeRole(roleName);
            var username = account.Email.Contains('@') ? account.Email.Split('@')[0] : account.Email;

            return new UserMeDto
            {
                UserId = account.Id,
                AccountId = account.Id,
                NationalId = account.NationalId,
                FullName = account.FullNameEn,
                FullNameEn = account.FullNameEn,
                FullNameAr = account.FullNameAr,
                Username = username,
                Email = account.Email,
                RoleName = roleName,
                Role = normalizedRole,
                BusinessEntityId = _casOptions.BusinessEntityId,
                BusinessEntityName = _casOptions.BusinessEntityName
            };
        }

        public ClaimsPrincipal? ValidateToken(string token)
        {
            if (string.IsNullOrWhiteSpace(token)) return null;

            // 1. Try validating as Assessment System token
            var localKey = GetAssessmentSigningKey();
            try
            {
                var parameters = new TokenValidationParameters
                {
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = localKey,
                    ValidateIssuer = true,
                    ValidIssuer = GetAssessmentIssuer(),
                    ValidateAudience = true,
                    ValidAudience = GetAssessmentAudience(),
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromMinutes(5)
                };
                return _tokenHandler.ValidateToken(token, parameters, out _);
            }
            catch
            {
                // Fall back to validating as CAS token
            }

            // 2. Try validating as CAS token
            try
            {
                var casParameters = new TokenValidationParameters
                {
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_casOptions.JwtKey)),
                    ValidateIssuer = true,
                    ValidIssuer = _casOptions.JwtIssuer,
                    ValidateAudience = true,
                    ValidAudience = _casOptions.JwtAudience,
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromMinutes(5)
                };
                return _tokenHandler.ValidateToken(token, casParameters, out _);
            }
            catch
            {
                return null;
            }
        }

        public CasConfigDto GetCasConfig(string? currentOrigin = null)
        {
            var callback = !string.IsNullOrWhiteSpace(currentOrigin)
                ? $"{currentOrigin.TrimEnd('/')}/sso-callback"
                : _casOptions.CallbackUrl;

            var loginUrl = $"{_casOptions.BaseUrl.TrimEnd('/')}?businessEntityId={_casOptions.BusinessEntityId}&redirect={Uri.EscapeDataString(callback)}";

            return new CasConfigDto
            {
                CasBaseUrl = _casOptions.BaseUrl,
                BusinessEntityId = _casOptions.BusinessEntityId,
                BusinessEntityName = _casOptions.BusinessEntityName,
                CallbackUrl = callback,
                LoginUrl = loginUrl
            };
        }

        public string GenerateAssessmentJwt(Account account, string normalizedRole, string roleName)
        {
            var claims = new List<Claim>
            {
                new("AccountId", account.Id.ToString()),
                new("userId", account.Id.ToString()),
                new("id", account.Id.ToString()),
                new(ClaimTypes.NameIdentifier, account.Id.ToString()),
                new(JwtRegisteredClaimNames.Sub, account.Id.ToString()),
                new("Email", account.Email),
                new(ClaimTypes.Email, account.Email),
                new("NationalId", account.NationalId),
                new("FullNameEn", account.FullNameEn),
                new("FullNameAr", account.FullNameAr),
                new(ClaimTypes.Name, account.FullNameEn),
                new("name", account.FullNameEn),
                new("Role", roleName),
                new("role", normalizedRole),
                new(ClaimTypes.Role, normalizedRole),
                new("BusinessEntityId", _casOptions.BusinessEntityId.ToString()),
                new("BusinessEntityName", _casOptions.BusinessEntityName),
                new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N"))
            };

            var signingKey = GetAssessmentSigningKey();
            var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                issuer: GetAssessmentIssuer(),
                audience: GetAssessmentAudience(),
                claims: claims,
                expires: DateTime.UtcNow.AddMinutes(_casOptions.TokenExpirationMinutes),
                signingCredentials: credentials);

            return _tokenHandler.WriteToken(token);
        }

        private SymmetricSecurityKey GetAssessmentSigningKey()
        {
            var keyStr = _configuration["Jwt:Key"]
                ?? _casOptions.JwtKey;
            return new SymmetricSecurityKey(Encoding.UTF8.GetBytes(keyStr));
        }

        private string GetAssessmentIssuer()
        {
            return _configuration["Jwt:Issuer"] ?? "AssessmentSystem.Api";
        }

        private string GetAssessmentAudience()
        {
            return _configuration["Jwt:Audience"] ?? "AssessmentSystem.Clients";
        }

        public static string NormalizeRole(string roleName)
        {
            var lower = (roleName ?? string.Empty).ToLowerInvariant();
            if (lower.Contains("admin") || lower.Contains("superadmin") || lower.Contains("control"))
                return "controller";
            if (lower.Contains("assessor") || lower.Contains("teacher") || lower.Contains("instructor") || lower.Contains("engineer"))
                return "assessor";
            if (lower.Contains("verifier") || lower.Contains("reviewer") || lower.Contains("board"))
                return "verifier";
            if (lower.Contains("student"))
                return "student";

            return "student";
        }
    }
}
