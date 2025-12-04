import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../domain/transport_item.dart';

class TransportListResult {
  TransportListResult({required this.items, this.totalCount});

  final List<TransportItem> items;
  final int? totalCount;
}

final transportRepositoryProvider = Provider<TransportRepository>((ref) {
  final apiClient = ref.read(apiClientProvider);
  return TransportRepository(apiClient);
});

class TransportRepository {
  TransportRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<TransportListResult> fetchTransports({int page = 1, int pageSize = 20}) async {
    final Response<dynamic> response = await _apiClient.get<dynamic>(
      '/transports',
      queryParameters: <String, dynamic>{
        'page': page,
        'page_size': pageSize,
      },
    );

    final data = response.data;
    List<dynamic> rawItems;
    int? total;

    if (data is List) {
      rawItems = data;
      total = int.tryParse(response.headers.value('X-Total-Count') ?? '');
    } else if (data is Map<String, dynamic>) {
      final items = data['items'];
      rawItems = items is List ? items : <dynamic>[];
      total = int.tryParse(response.headers.value('X-Total-Count') ?? '') ??
          (data['total'] is num ? (data['total'] as num).toInt() : null);
    } else {
      rawItems = <dynamic>[];
    }

    final items = rawItems
        .whereType<Map<String, dynamic>>()
        .map(TransportItem.fromJson)
        .toList();

    return TransportListResult(items: items, totalCount: total);
  }
}
