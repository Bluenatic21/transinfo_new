class UserProfile {
  const UserProfile({
    required this.id,
    required this.email,
    this.name,
    this.role,
  });

  final int id;
  final String email;
  final String? name;
  final String? role;

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    return UserProfile(
      id: (json['id'] as num?)?.toInt() ?? 0,
      email: json['email'] as String? ?? '',
      name:
          json['name'] as String? ??
          json['full_name'] as String? ??
          json['company_name'] as String?,
      role: json['role'] as String?,
    );
  }
}
