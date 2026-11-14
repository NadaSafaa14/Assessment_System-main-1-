using System.Security.Claims;
using AssessmentWebApi.Dto_s.AuthDto_s;

namespace AssessmentWebApi.Services
{
    public interface ICasAuthService
    {
        Task<UserMeDto> ValidateAndProcessCasTokenAsync(string token, string? redirectUrl = null, CancellationToken cancellationToken = default);
        Task<UserMeDto> GetUserProfileAsync(ClaimsPrincipal principal, CancellationToken cancellationToken = default);
        ClaimsPrincipal? ValidateToken(string token);
        CasConfigDto GetCasConfig(string? currentOrigin = null);
        string GenerateAssessmentJwt(Models.Account account, string normalizedRole, string roleName);
    }
}
