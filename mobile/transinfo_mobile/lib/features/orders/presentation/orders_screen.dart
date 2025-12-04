import 'package:flutter/material.dart';

class OrdersScreen extends StatelessWidget {
  const OrdersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    const backgroundColor = Color(0xFF020C1A);
    const cardColor = Color(0xFF06213A);

    // Пока мок-данные, позже подключим API
    const items = _mockOrders;

    return Scaffold(
      backgroundColor: backgroundColor,
      appBar: AppBar(
        backgroundColor: const Color(0xFF041322),
        title: const Text('Грузы'),
      ),
      body: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          final o = items[index];

          return Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: cardColor,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Маршрут
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.inventory_2_outlined,
                      color: Colors.white,
                      size: 22,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${o.fromCity} → ${o.toCity}',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${o.fromCountry} • ${o.toCountry}',
                            style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),

                // Параметры груза
                Wrap(
                  spacing: 12,
                  runSpacing: 6,
                  children: [
                    _InfoChip(
                      icon: Icons.scale_outlined,
                      label: '${o.weightTons} т',
                    ),
                    _InfoChip(
                      icon: Icons.all_inbox_outlined,
                      label: o.cargoType,
                    ),
                    _InfoChip(
                      icon: Icons.calendar_month_outlined,
                      label: o.date,
                    ),
                    if (o.price != null)
                      _InfoChip(icon: Icons.payments_outlined, label: o.price!),
                    if (o.tempMode != null)
                      _InfoChip(
                        icon: Icons.ac_unit_outlined,
                        label: o.tempMode!,
                      ),
                  ],
                ),

                const SizedBox(height: 8),

                if (o.comment != null && o.comment!.isNotEmpty)
                  Text(
                    o.comment!,
                    style: const TextStyle(color: Colors.white70, fontSize: 12),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xFF041322),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: Colors.white70),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(color: Colors.white70, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class _OrderMock {
  const _OrderMock({
    required this.fromCity,
    required this.toCity,
    required this.fromCountry,
    required this.toCountry,
    required this.weightTons,
    required this.date,
    required this.cargoType,
    this.price,
    this.tempMode,
    this.comment,
  });

  final String fromCity;
  final String toCity;
  final String fromCountry;
  final String toCountry;
  final double weightTons;
  final String date;
  final String cargoType;
  final String? price;
  final String? tempMode;
  final String? comment;
}

// Примерные заявки – позже заменим на реальные данные
const List<_OrderMock> _mockOrders = [
  _OrderMock(
    fromCity: 'Тбилиси',
    toCity: 'Стамбул (европейская часть)',
    fromCountry: 'Грузия',
    toCountry: 'Турция',
    weightTons: 3,
    date: '10.12',
    cargoType: 'Техника',
    price: '1100 \$',
    comment: 'Нужен только этот груз в машине, стандартный тент.',
  ),
  _OrderMock(
    fromCity: 'Минск',
    toCity: 'Тбилиси',
    fromCountry: 'Беларусь',
    toCountry: 'Грузия',
    weightTons: 21,
    date: '12.12',
    cargoType: 'Сухой груз в мешках',
    price: 'по договорённости',
  ),
  _OrderMock(
    fromCity: 'Ростов-на-Дону',
    toCity: 'Тбилиси',
    fromCountry: 'Россия',
    toCountry: 'Грузия',
    weightTons: 22,
    date: '08.12',
    cargoType: 'Косметическая химия',
    comment: 'Готов к загрузке 8 числа, нужна задняя загрузка.',
  ),
];
