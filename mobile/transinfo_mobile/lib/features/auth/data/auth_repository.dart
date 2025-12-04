import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final apiClient = ref.read(apiClientProvider);
  return AuthRepository(apiClient);
});

class AuthRepository {
  AuthRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<LoginResponse> login({
    required String email,
    required String password,
  }) async {
    final Response<dynamic> response = await _apiClient.post<dynamic>(
      '/login',
      data: jsonEncode(<String, dynamic>{
        'email': email.trim(),
        'password': password,
      }),
    );

    final data = response.data as Map<String, dynamic>;
    return LoginResponse.fromJson(data);
  }
}

class LoginResponse {
  LoginResponse({required this.accessToken, required this.tokenType});

  final String accessToken;
  final String tokenType;

  factory LoginResponse.fromJson(Map<String, dynamic> json) {
    return LoginResponse(
      accessToken: json['access_token'] as String? ?? '',
      tokenType: json['token_type'] as String? ?? 'bearer',
    );
  }
}
