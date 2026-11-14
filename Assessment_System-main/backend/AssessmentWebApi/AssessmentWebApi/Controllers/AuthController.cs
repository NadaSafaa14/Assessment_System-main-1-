using AssessmentWebApi.Dto_s.AuthDto_s;
using AssessmentWebApi.Repository.AuthRepository;
using AssessmentWebApi.Services;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace AssessmentWebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly IAuthRepo _repo;
        private readonly ICasAuthService _casAuthService;

        public AuthController(IAuthRepo repo, ICasAuthService casAuthService)
        {
            _repo = repo;
            _casAuthService = casAuthService;
        }

        // ─────────────────────────────────────────────────────────────
        // GET /api/auth/cas-config
        // Returns the official CAS configuration for Assessment System (Entity ID 700)
        // ─────────────────────────────────────────────────────────────
        [HttpGet("cas-config")]
        public IActionResult GetCasConfig()
        {
            var origin = GetFrontendOrigin();
            var config = _casAuthService.GetCasConfig(origin);
            return Ok(config);
        }

        // ─────────────────────────────────────────────────────────────
        // POST /api/auth/sso-callback
        // POST /api/auth/cas-callback
        // Validates CAS System token, identifies Assessment user, returns profile + sets session
        // ─────────────────────────────────────────────────────────────
        [HttpPost("sso-callback")]
        [HttpPost("cas-callback")]
        public async Task<IActionResult> SsoCallback(
            [FromBody] SsoCallbackReqDto request,
            CancellationToken cancellationToken)
        {
            var token = request.Token;
            if (string.IsNullOrWhiteSpace(token))
            {
                // Fall back to Bearer token header or cookies if not in body
                token = TryGetBearerToken()
                    ?? Request.Cookies["token"]
                    ?? Request.Cookies["cas_jwt_token"];
            }

            if (string.IsNullOrWhiteSpace(token))
            {
                return BadRequest(new { message = "Authentication token is missing from CAS response." });
            }

            try
            {
                var profile = await _casAuthService.ValidateAndProcessCasTokenAsync(
                    token,
                    request.RedirectUrl,
                    cancellationToken);

                // Set secure HttpOnly session cookie
                if (!string.IsNullOrWhiteSpace(profile.Token))
                {
                    Response.Cookies.Append("assessment_session", profile.Token, new CookieOptions
                    {
                        HttpOnly = true,
                        Secure = Request.IsHttps,
                        SameSite = SameSiteMode.Lax,
                        Expires = DateTimeOffset.UtcNow.AddHours(8),
                        Path = "/"
                    });
                }

                return Ok(profile);
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { message = ex.Message, code = "ACCOUNT_NOT_FOUND" });
            }
            catch (UnauthorizedAccessException ex)
            {
                return Unauthorized(new { message = ex.Message, code = "UNAUTHORIZED" });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = $"CAS authentication failed: {ex.Message}", code = "CAS_ERROR" });
            }
        }

        // ─────────────────────────────────────────────────────────────
        // GET /api/auth/me
        // Requires authentication. Returns current user profile and authorized role.
        // ─────────────────────────────────────────────────────────────
        [HttpGet("me")]
        public async Task<IActionResult> GetCurrentUser(CancellationToken cancellationToken)
        {
            // 1. Check HttpContext.User if populated by middleware
            ClaimsPrincipal? principal = User.Identity?.IsAuthenticated == true ? User : null;

            // 2. If not already authenticated, check Bearer token or HttpOnly cookie
            if (principal == null)
            {
                var token = TryGetBearerToken()
                    ?? Request.Cookies["assessment_session"]
                    ?? Request.Cookies["token"]
                    ?? Request.Cookies["cas_jwt_token"];

                if (!string.IsNullOrWhiteSpace(token))
                {
                    principal = _casAuthService.ValidateToken(token);
                }
            }

            if (principal == null)
            {
                return Unauthorized(new { message = "Unauthenticated session. Please sign in via CAS." });
            }

            try
            {
                var profile = await _casAuthService.GetUserProfileAsync(principal, cancellationToken);
                return Ok(profile);
            }
            catch (UnauthorizedAccessException ex)
            {
                return Unauthorized(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Error retrieving user profile: {ex.Message}" });
            }
        }

        // ─────────────────────────────────────────────────────────────
        // POST /api/auth/logout
        // Clears session cookies and provides CAS logout URL
        // ─────────────────────────────────────────────────────────────
        [HttpPost("logout")]
        public IActionResult Logout()
        {
            var cookieOptions = new CookieOptions
            {
                Path = "/",
                Expires = DateTimeOffset.UtcNow.AddDays(-1),
                Secure = Request.IsHttps,
                SameSite = SameSiteMode.Lax
            };

            Response.Cookies.Delete("assessment_session", cookieOptions);
            Response.Cookies.Delete("token", cookieOptions);
            Response.Cookies.Delete("cas_jwt_token", cookieOptions);
            Response.Cookies.Delete("cas_sso_token", cookieOptions);

            var origin = GetFrontendOrigin();
            var config = _casAuthService.GetCasConfig(origin);

            return Ok(new
            {
                message = "Logged out successfully.",
                casLogoutUrl = $"{config.CasBaseUrl.TrimEnd('/')}?prompt=login"
            });
        }

        // ─────────────────────────────────────────────────────────────
        // POST /api/auth/login
        // Legacy login (preserved for backwards-compatibility & development testing)
        // ─────────────────────────────────────────────────────────────
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginReqDto request)
        {
            if (string.IsNullOrWhiteSpace(request.Email) ||
                string.IsNullOrWhiteSpace(request.Password))
                return BadRequest(new { message = "Email and password are required." });

            try
            {
                var result = await _repo.Login(request);

                // Also attach HttpOnly cookie for session consistency
                if (!string.IsNullOrWhiteSpace(result.Token))
                {
                    Response.Cookies.Append("assessment_session", result.Token, new CookieOptions
                    {
                        HttpOnly = true,
                        Secure = Request.IsHttps,
                        SameSite = SameSiteMode.Lax,
                        Expires = DateTimeOffset.UtcNow.AddHours(8),
                        Path = "/"
                    });
                }

                return Ok(result);
            }
            catch (UnauthorizedAccessException ex)
            {
                return Unauthorized(new { message = ex.Message });
            }
        }

        // ─────────────────────────────────────────────────────────────
        // POST /api/auth/signup/engineer
        // Registers an engineer with no role assigned.
        // Control will assign Assessor or Verifier later.
        // ─────────────────────────────────────────────────────────────
        [HttpPost("signup/engineer")]
        public async Task<IActionResult> SignupEngineer([FromBody] SignupReqDto request)
        {
            if (!IsValidSignup(request, out var error))
                return BadRequest(new { message = error });

            try
            {
                var result = await _repo.SignupEngineer(request);
                return StatusCode(201, result);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        // ─────────────────────────────────────────────────────────────
        // POST /api/auth/signup/control
        // Registers a Control account with the Control role pre-assigned.
        // ─────────────────────────────────────────────────────────────
        [HttpPost("signup/control")]
        public async Task<IActionResult> SignupControl([FromBody] SignupReqDto request)
        {
            if (!IsValidSignup(request, out var error))
                return BadRequest(new { message = error });

            try
            {
                var result = await _repo.SignupControl(request);
                return StatusCode(201, result);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        // ─────────────────────────────────────────────────────────────
        // Shared helpers
        // ─────────────────────────────────────────────────────────────
        private string? TryGetBearerToken()
        {
            if (!Request.Headers.TryGetValue("Authorization", out var authHeader))
                return null;

            const string bearerPrefix = "Bearer ";
            var header = authHeader.ToString();
            if (header.StartsWith(bearerPrefix, StringComparison.OrdinalIgnoreCase))
            {
                var token = header[bearerPrefix.Length..].Trim();
                return string.IsNullOrWhiteSpace(token) ? null : token;
            }

            return null;
        }

        private string? GetFrontendOrigin()
        {
            if (Request.Headers.TryGetValue("Origin", out var originHeader) && !string.IsNullOrWhiteSpace(originHeader))
                return originHeader.ToString().TrimEnd('/');

            if (Request.Headers.TryGetValue("Referer", out var refererHeader) && !string.IsNullOrWhiteSpace(refererHeader))
            {
                if (Uri.TryCreate(refererHeader.ToString(), UriKind.Absolute, out var uri))
                    return $"{uri.Scheme}://{uri.Authority}";
            }

            return null;
        }

        private static bool IsValidSignup(SignupReqDto request, out string error)
        {
            if (string.IsNullOrWhiteSpace(request.NationalId) ||
                string.IsNullOrWhiteSpace(request.Email)      ||
                string.IsNullOrWhiteSpace(request.Password)   ||
                string.IsNullOrWhiteSpace(request.FullNameEn) ||
                string.IsNullOrWhiteSpace(request.FullNameAr))
            {
                error = "NationalId, Email, Password, FullNameEn, and FullNameAr are required.";
                return false;
            }
            error = string.Empty;
            return true;
        }
    }
}
