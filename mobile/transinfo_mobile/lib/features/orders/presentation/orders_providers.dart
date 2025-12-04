import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/orders_repository.dart';
import '../domain/order.dart';

final ordersProvider = FutureProvider.autoDispose<List<Order>>((ref) async {
  final repository = ref.read(ordersRepositoryProvider);
  return repository.fetchOrders();
});
