import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../domain/order.dart';

final ordersRepositoryProvider = Provider<OrdersRepository>((ref) {
  final apiClient = ref.read(apiClientProvider);
  return OrdersRepository(apiClient);
});

class OrdersRepository {
  OrdersRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<List<Order>> fetchOrders({int page = 1, int pageSize = 20}) async {
    final Response<dynamic> response = await _apiClient.get<dynamic>(
      '/orders',
      queryParameters: <String, dynamic>{
        'page': page,
        'page_size': pageSize,
      },
    );

    final data = response.data as List<dynamic>;
    return data
        .map((dynamic item) => Order.fromJson(item as Map<String, dynamic>))
        .toList();
  }
}
