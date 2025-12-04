import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/transport_repository.dart';

final transportsProvider = FutureProvider.autoDispose((ref) async {
  final repository = ref.read(transportRepositoryProvider);
  return repository.fetchTransports();
});
