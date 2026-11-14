namespace AssessmentWebApi.Dto_s.AuthDto_s
{
    public class UserMeDto
    {
        public long UserId { get; set; }
        public long AccountId { get; set; }
        public string NationalId { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string FullNameEn { get; set; } = string.Empty;
        public string FullNameAr { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string RoleName { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
        public string? Token { get; set; }
        public long BusinessEntityId { get; set; } = 700;
        public string BusinessEntityName { get; set; } = "Assessment System";
    }
}
