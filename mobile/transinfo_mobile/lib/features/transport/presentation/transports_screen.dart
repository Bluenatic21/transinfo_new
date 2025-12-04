import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/transport_item.dart';
import 'transport_providers.dart';

class TransportsScreen extends ConsumerWidget {
  const TransportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncTransports = ref.watch(transportsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Транспорт'),
      ),
      body: asyncTransports.when(
        data: (result) {
          final items = result.items;
          if (items.isEmpty) {
            return const Center(child: Text('Транспортные заявки отсутствуют'));
          }
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(transportsProvider);
              await ref.read(transportsProvider.future);
            },
            child: ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(12),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final item = items[index];
                return _TransportCard(item: item);
              },
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) {
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Ошибка загрузки транспорта: $error'),
                const SizedBox(height: 12),
                ElevatedButton(
                  onPressed: () => ref.refresh(transportsProvider.future),
                  child: const Text('Повторить'),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _TransportCard extends StatelessWidget {
  const _TransportCard({required this.item});

  final TransportItem item;

  String _formatDates() {
    final from = item.readyDateFrom;
    final to = item.readyDateTo;
    if (from != null && to != null && from.isNotEmpty && to.isNotEmpty) {
      if (from == to) return from;
      return '$from — $to';
    }
    if (from != null && from.isNotEmpty) return from;
    if (to != null && to.isNotEmpty) return to;
    return item.mode ?? '';
  }

  @override
  Widget build(BuildContext context) {
    final destination = item.mainDestination ?? (item.toLocations.isNotEmpty ? item.toLocations.join(', ') : '-');
    final direction = '${item.fromLocation ?? '-'} → $destination';

    final details = <String>[
      if (item.truckType != null && item.truckType!.isNotEmpty) item.truckType!,
      if (item.transportKind != null && item.transportKind!.isNotEmpty) item.transportKind!,
      if (item.weight != null) 'Вес: ${item.weight} т',
      if (item.volume != null) 'Объём: ${item.volume} м³',
      if (_formatDates().isNotEmpty) 'Даты: ${_formatDates()}',
      if (item.rateWithVat != null && item.rateWithVat!.isNotEmpty)
        'Ставка: ${item.rateWithVat}${item.currency != null ? ' ${item.currency}' : ''}',
    ].where((e) => e.isNotEmpty).toList();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              direction,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            if (details.isNotEmpty)
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: details
                    .map(
                      (d) => Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Text(d),
                      ),
                    )
                    .toList(),
              ),
            if (item.comment != null && item.comment!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                item.comment!,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ],
            if (item.contactName != null && item.contactName!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('Контакт: ${item.contactName!}'),
            ],
            if (item.phone != null && item.phone!.isNotEmpty)
              Text('Телефон: ${item.phone!}'),
          ],
        ),
      ),
    );
  }
}
