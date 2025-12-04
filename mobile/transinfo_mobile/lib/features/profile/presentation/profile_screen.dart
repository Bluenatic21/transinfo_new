import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/profile_repository.dart';
import '../domain/profile_model.dart';

final userProfileProvider = FutureProvider<UserProfile>((ref) async {
  final repo = ref.read(profileRepositoryProvider);
  return repo.fetchProfile();
});

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncProfile = ref.watch(userProfileProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Мой профиль')),
      body: asyncProfile.when(
        data: (profile) {
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              ListTile(
                title: const Text('ID'),
                subtitle: Text(profile.id.toString()),
              ),
              ListTile(
                title: const Text('Email'),
                subtitle: Text(profile.email),
              ),
              if (profile.name != null)
                ListTile(
                  title: const Text('Имя / компания'),
                  subtitle: Text(profile.name!),
                ),
              if (profile.role != null)
                ListTile(
                  title: const Text('Роль'),
                  subtitle: Text(profile.role!),
                ),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) {
          return Center(child: Text('Ошибка загрузки профиля: $error'));
        },
      ),
    );
  }
}
