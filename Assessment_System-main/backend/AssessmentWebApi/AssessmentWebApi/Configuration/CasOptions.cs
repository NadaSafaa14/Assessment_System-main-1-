namespace AssessmentWebApi.Configuration
{
    public class CasOptions
    {
        public const string SectionName = "CAS";

        public string BaseUrl { get; set; } = "https://centerlizedlogin.sewedy.com.eg";
        public long BusinessEntityId { get; set; } = 700;
        public string BusinessEntityName { get; set; } = "Assessment System";
        public string CallbackUrl { get; set; } = "http://localhost:3000/sso-callback";
        public string JwtKey { get; set; } = "tbV/kbyLRqqoDCKJVwksaKqE07GNPkOcFTX7LN96nkY=";
        public string JwtIssuer { get; set; } = "CAS.Api";
        public string JwtAudience { get; set; } = "CAS.Clients";
        public int TokenExpirationMinutes { get; set; } = 480;
    }
}
