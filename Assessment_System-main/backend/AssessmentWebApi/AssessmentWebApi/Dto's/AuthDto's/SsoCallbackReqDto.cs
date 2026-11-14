namespace AssessmentWebApi.Dto_s.AuthDto_s
{
    public class SsoCallbackReqDto
    {
        public string Token { get; set; } = string.Empty;
        public string? RedirectUrl { get; set; }
    }
}
