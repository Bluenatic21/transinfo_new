import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../domain/profile_model.dart';

final profileRepositoryProvider = Provider<ProfileRepository>((ref) {
  final apiClient = ref.read(apiClientProvider);
  return ProfileRepository(apiClient);
});

class ProfileRepository {
  ProfileRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<UserProfile> fetchProfile() async {
    final Response<dynamic> response = await _apiClient.get<dynamic>('/me');
    final data = response.data as Map<String, dynamic>;
    return UserProfile.fromJson(data);
  }
}
