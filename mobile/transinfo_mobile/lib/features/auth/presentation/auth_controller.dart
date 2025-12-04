import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/auth_repository.dart';
import '../data/token_storage.dart';

final authControllerProvider = StateNotifierProvider<AuthController, AuthState>(
  (ref) {
    final authRepository = ref.read(authRepositoryProvider);
    final tokenStorage = ref.read(tokenStorageProvider);
    return AuthController(
      authRepository: authRepository,
      tokenStorage: tokenStorage,
    );
  },
);

class AuthState {
  const AuthState({
    required this.isAuthenticated,
    this.isLoading = false,
    this.errorMessage,
  });

  final bool isAuthenticated;
  final bool isLoading;
  final String? errorMessage;

  AuthState copyWith({
    bool? isAuthenticated,
    bool? isLoading,
    String? errorMessage,
  }) {
    return AuthState(
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      isLoading: isLoading ?? this.isLoading,
      errorMessage: errorMessage,
    );
  }

  static const unauthenticated = AuthState(isAuthenticated: false);
  static const authenticated = AuthState(isAuthenticated: true);
}

class AuthController extends StateNotifier<AuthState> {
  AuthController({required this.authRepository, required this.tokenStorage})
    : super(AuthState.unauthenticated) {
    _restoreSession();
  }

  final AuthRepository authRepository;
  final TokenStorage tokenStorage;

  Future<void> _restoreSession() async {
    final token = await tokenStorage.readAccessToken();
    if (token != null && token.isNotEmpty) {
      state = AuthState.authenticated;
    }
  }

  Future<void> login(String email, String password) async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    try {
      final response = await authRepository.login(
        email: email,
        password: password,
      );

      if (response.accessToken.isEmpty) {
        state = state.copyWith(
          isLoading: false,
          errorMessage: 'Empty access token',
        );
        return;
      }

      await tokenStorage.saveAccessToken(response.accessToken);
      state = AuthState.authenticated;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: 'Login failed: $e',
      );
    }
  }

  Future<void> logout() async {
    await tokenStorage.clear();
    state = AuthState.unauthenticated;
  }
}
