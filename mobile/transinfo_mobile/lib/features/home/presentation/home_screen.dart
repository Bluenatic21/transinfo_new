import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/presentation/auth_controller.dart';
import '../../profile/presentation/profile_screen.dart';
import '../../transport/presentation/transports_screen.dart';
import '../../orders/presentation/orders_screen.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  int _selectedIndex = 3; // по центру – "Транспорт"

  @override
  Widget build(BuildContext context) {
    const backgroundColor = Color(0xFF020C1A);
    const cardColor = Color(0xFF06213A);
    const cardDarkColor = Color(0xFF051728);
    const accentColor = Color(0xFF00B2FF);

    return Scaffold(
      backgroundColor: backgroundColor,
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(64),
        child: Container(
          padding: const EdgeInsets.only(
            left: 16,
            right: 8,
            top: 12,
            bottom: 12,
          ),
          decoration: const BoxDecoration(color: Color(0xFF041322)),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                ),
                child: const Center(
                  child: Text(
                    'TI',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF0066CC),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              const Text(
                'TransInfo',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 18,
                ),
              ),
              const Spacer(),
              IconButton(
                onPressed: () {},
                icon: const Icon(Icons.search),
                color: Colors.white,
              ),
              IconButton(
                onPressed: () {},
                icon: const Icon(Icons.notifications_none),
                color: Colors.white,
              ),
              IconButton(
                onPressed: () {},
                icon: const Icon(Icons.chat_bubble_outline),
                color: Colors.white,
              ),
              IconButton(
                onPressed: () async {
                  await ref.read(authControllerProvider.notifier).logout();
                },
                icon: const Icon(Icons.logout),
                color: Colors.white,
                tooltip: 'Выход',
              ),
            ],
          ),
        ),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Здесь позже будет меню добавления заявки'),
            ),
          );
        },
        shape: const CircleBorder(),
        backgroundColor: accentColor,
        child: const Icon(Icons.add, color: Colors.white),
      ),
      bottomNavigationBar: BottomAppBar(
        color: const Color(0xFF041322),
        notchMargin: 6,
        child: SizedBox(
          height: 64,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _BottomNavItem(
                index: 0,
                currentIndex: _selectedIndex,
                label: 'Админ',
                icon: Icons.admin_panel_settings,
                onTap: () {
                  setState(() => _selectedIndex = 0);
                },
              ),
              _BottomNavItem(
                index: 1,
                currentIndex: _selectedIndex,
                label: 'Пользователи',
                icon: Icons.group_outlined,
                onTap: () {
                  setState(() => _selectedIndex = 1);
                },
              ),
              _BottomNavItem(
                index: 2,
                currentIndex: _selectedIndex,
                label: 'Грузы',
                icon: Icons.inventory_2_outlined,
                onTap: () {
                  setState(() => _selectedIndex = 2);
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const OrdersScreen(),
                    ),
                  );
                },
              ),
              const SizedBox(width: 32), // место под FAB
              _BottomNavItem(
                index: 3,
                currentIndex: _selectedIndex,
                label: 'Транспорт',
                icon: Icons.local_shipping_outlined,
                onTap: () {
                  setState(() => _selectedIndex = 3);
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const TransportsScreen(),
                    ),
                  );
                },
              ),
              _BottomNavItem(
                index: 4,
                currentIndex: _selectedIndex,
                label: 'Профиль',
                icon: Icons.person_outline,
                onTap: () {
                  setState(() => _selectedIndex = 4);
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const ProfileScreen(),
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: cardColor,
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _StatRow(label: 'TransInfo-Индекс', value: '12.18'),
                  SizedBox(height: 8),
                  _StatRow(label: 'Грузы', value: '4375'),
                  SizedBox(height: 8),
                  _StatRow(label: 'Машины', value: '1306'),
                  SizedBox(height: 8),
                  _StatRow(label: 'Участники', value: '4466'),
                  SizedBox(height: 8),
                  _StatRow(label: 'Тендеры', value: '77'),
                ],
              ),
            ),
            const SizedBox(height: 16),
            _MainActionCard(
              icon: Icons.local_shipping_outlined,
              title: 'Транспорт',
              subtitle: 'Поиск свободных машин и маршрутов',
              color: cardDarkColor,
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const TransportsScreen(),
                  ),
                );
              },
            ),
            const SizedBox(height: 12),
            _MainActionCard(
              icon: Icons.inventory_2_outlined,
              title: 'Грузы',
              subtitle: 'Свежие предложения от грузовладельцев',
              color: cardDarkColor,
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(builder: (_) => const OrdersScreen()),
                );
              },
            ),

            const SizedBox(height: 12),
            _MainActionCard(
              icon: Icons.add_road,
              title: 'Добавить транспорт',
              subtitle: 'Разместить машину и получить отклики',
              color: cardDarkColor,
              onTap: () {},
            ),
            const SizedBox(height: 12),
            _MainActionCard(
              icon: Icons.add_box_outlined,
              title: 'Добавить груз',
              subtitle: 'Создать заявку и найти перевозчика',
              color: cardDarkColor,
              onTap: () {},
            ),
            const SizedBox(height: 12),
            _MainActionCard(
              icon: Icons.info_outline,
              title: 'О сервисе',
              subtitle: 'Преимущества платформы и возможности',
              color: cardDarkColor,
              onTap: () {},
            ),
            const SizedBox(height: 24),
            const Text(
              'Последние заявки',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 20,
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: const [
                Expanded(
                  child: _SegmentButton(label: 'Заявки', selected: true),
                ),
                SizedBox(width: 8),
                Expanded(
                  child: _SegmentButton(label: 'Карта', selected: false),
                ),
                SizedBox(width: 8),
                Expanded(
                  child: _SegmentButton(label: 'Фильтр', selected: false),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: cardColor,
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Text(
                'Здесь позже будут последние заявки.\nСейчас это декоративная заглушка под дизайн.',
                style: TextStyle(color: Colors.white70, fontSize: 14),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatRow extends StatelessWidget {
  const _StatRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: const TextStyle(color: Colors.white70, fontSize: 13),
        ),
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
            fontSize: 16,
          ),
        ),
      ],
    );
  }
}

class _MainActionCard extends StatelessWidget {
  const _MainActionCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: Colors.white, size: 24),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: const TextStyle(color: Colors.white70, fontSize: 13),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SegmentButton extends StatelessWidget {
  const _SegmentButton({required this.label, required this.selected});

  final String label;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 36,
      decoration: BoxDecoration(
        color: selected ? Colors.white : Colors.transparent,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white24),
      ),
      child: Center(
        child: Text(
          label,
          style: TextStyle(
            color: selected ? const Color(0xFF041322) : Colors.white70,
            fontWeight: FontWeight.w600,
            fontSize: 14,
          ),
        ),
      ),
    );
  }
}

class _BottomNavItem extends StatelessWidget {
  const _BottomNavItem({
    required this.index,
    required this.currentIndex,
    required this.label,
    required this.icon,
    required this.onTap,
  });

  final int index;
  final int currentIndex;
  final String label;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final bool isSelected = index == currentIndex;
    return Expanded(
      child: InkWell(
        onTap: onTap,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 20,
              color: isSelected ? Colors.white : Colors.white60,
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                color: isSelected ? Colors.white : Colors.white60,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
