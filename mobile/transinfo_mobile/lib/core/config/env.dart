import 'package:flutter/foundation.dart';

enum AppEnv { production, staging, development }

class EnvConfig {
  // Сейчас работаем с продом transinfo.ge
  static const AppEnv env = AppEnv.production;

  static String get baseHost {
    switch (env) {
      case AppEnv.production:
        return 'https://transinfo.ge';
      case AppEnv.staging:
        return 'https://staging.transinfo.ge';
      case AppEnv.development:
        // под себя потом поменяешь, если нужно
        return 'http://127.0.0.1:8000';
    }
  }

  // Базовый URL API (у нас всё под /api)
  static String get apiBase {
    if (kDebugMode && env == AppEnv.development) {
      return 'http://127.0.0.1:8000/api';
    }
    return '$baseHost/api';
  }

  // Базовый URL для WebSocket (пригодится позже)
  static String get wsBase {
    switch (env) {
      case AppEnv.production:
        return 'wss://transinfo.ge';
      case AppEnv.staging:
        return 'wss://staging.transinfo.ge';
      case AppEnv.development:
        return 'ws://127.0.0.1:8000';
    }
  }

  static String apiPath(String path) {
    if (!path.startsWith('/')) {
      path = '/$path';
    }
    return '$apiBase$path';
  }

  static String wsPath(String path) {
    if (!path.startsWith('/')) {
      path = '/$path';
    }
    return '$wsBase$path';
  }
}
