namespace AssessmentWebApi.Dto_s.AuthDto_s
{
    public class CasConfigDto
    {
        public string CasBaseUrl { get; set; } = string.Empty;
        public long BusinessEntityId { get; set; }
        public string BusinessEntityName { get; set; } = string.Empty;
        public string CallbackUrl { get; set; } = string.Empty;
        public string LoginUrl { get; set; } = string.Empty;
    }
}
