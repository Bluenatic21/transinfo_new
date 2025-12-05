import 'package:flutter/material.dart';

class CreateTransportScreen extends StatefulWidget {
  const CreateTransportScreen({super.key});

  @override
  State<CreateTransportScreen> createState() => _CreateTransportScreenState();
}

class _CreateTransportScreenState extends State<CreateTransportScreen> {
  final _formKey = GlobalKey<FormState>();

  // Даты и маршрут
  final _fromController = TextEditingController();
  final _radiusController = TextEditingController();
  final _directionController = TextEditingController();
  final _availableFromController = TextEditingController();
  final _availableToController = TextEditingController();
  final List<String> _extraDirections = [];

  String _whenValue = 'Готов к загрузке';

  // Тип и детали транспорта
  String? _bodyType;
  String? _transportType;
  String? _loadingType;
  final _capacityController = TextEditingController(); // Грузоподъёмность (т)
  final _volumeController = TextEditingController(); // Объём кузова (м³)
  final _lengthController = TextEditingController();
  final _widthController = TextEditingController();
  final _heightController = TextEditingController();

  // Экипаж / ADR / GPS
  bool _crewSelected = false;
  bool _adrSelected = false;
  bool _gpsMonitoring = false;

  // Ставка и контакты
  String _rateType = 'С НДС';
  final _rateController = TextEditingController();
  String? _currency = '₾';
  bool _noBargain = false;
  final _contactController = TextEditingController();
  final _phoneController = TextEditingController();

  // Примечание
  final _noteController = TextEditingController();

  @override
  void dispose() {
    _fromController.dispose();
    _radiusController.dispose();
    _directionController.dispose();
    _availableFromController.dispose();
    _availableToController.dispose();
    _capacityController.dispose();
    _volumeController.dispose();
    _lengthController.dispose();
    _widthController.dispose();
    _heightController.dispose();
    _rateController.dispose();
    _contactController.dispose();
    _phoneController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  void _addDirection() {
    final text = _directionController.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _extraDirections.add(text);
      _directionController.clear();
    });
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Транспорт сохранён (пока заглушка, без API)'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    const backgroundColor = Color(0xFF020C1A);
    const cardColor = Color(0xFF06213A);

    return Scaffold(
      backgroundColor: backgroundColor,
      appBar: AppBar(
        backgroundColor: const Color(0xFF041322),
        title: const Text('Добавить Транспорт'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            children: [
              _buildDatesAndRoute(cardColor),
              const SizedBox(height: 16),
              _buildTypeAndDetails(cardColor),
              const SizedBox(height: 16),
              _buildCrewAdr(cardColor),
              const SizedBox(height: 16),
              _buildRateAndContacts(cardColor),
              const SizedBox(height: 16),
              _buildNotesAndFiles(cardColor),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _submit,
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: const Text('Добавить транспорт'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ---------- СЕКЦИИ ----------

  Widget _buildDatesAndRoute(Color cardColor) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: cardColor,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionHeader('Даты и маршрут'),
          const SizedBox(height: 16),
          _LabeledTextField(
            label: 'Откуда *',
            hint: 'Начните вводить страну или город…',
            controller: _fromController,
            required: true,
          ),
          const SizedBox(height: 12),
          _LabeledTextField(
            label: 'Радиус',
            hint: '',
            controller: _radiusController,
            keyboardType: TextInputType.number,
            required: false,
            suffix: Row(
              mainAxisSize: MainAxisSize.min,
              children: const [
                Icon(Icons.help_outline, color: Colors.white70, size: 18),
                SizedBox(width: 4),
                Text(
                  'км',
                  style: TextStyle(color: Colors.white70, fontSize: 13),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _LabeledTextField(
            label: 'Возможные направления',
            hint: 'Начните вводить страну или город…',
            controller: _directionController,
            required: false,
          ),
          const SizedBox(height: 4),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: _addDirection,
              child: const Text(
                '+ добавить направление',
                style: TextStyle(color: Color(0xFF00B2FF)),
              ),
            ),
          ),
          if (_extraDirections.isNotEmpty) ...[
            const SizedBox(height: 4),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: _extraDirections
                  .map(
                    (d) => Chip(
                      label: Text(d),
                      backgroundColor: const Color(0xFF041322),
                      labelStyle: const TextStyle(color: Colors.white70),
                      deleteIconColor: Colors.white54,
                      onDeleted: () {
                        setState(() {
                          _extraDirections.remove(d);
                        });
                      },
                    ),
                  )
                  .toList(),
            ),
          ],
          const SizedBox(height: 12),
          _LabeledDropdownField<String>(
            label: 'Когда',
            value: _whenValue,
            icon: Icons.access_time,
            items: const [
              DropdownMenuItem(
                value: 'Готов к загрузке',
                child: Text('Готов к загрузке'),
              ),
              DropdownMenuItem(value: 'Постоянно', child: Text('Постоянно')),
              DropdownMenuItem(
                value: 'Периодически',
                child: Text('Периодически'),
              ),
            ],
            onChanged: (value) {
              if (value == null) return;
              setState(() {
                _whenValue = value;
              });
            },
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _LabeledTextField(
                  label: 'Доступен с',
                  hint: '',
                  controller: _availableFromController,
                  required: false,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _LabeledTextField(
                  label: 'по',
                  hint: '',
                  controller: _availableToController,
                  required: false,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTypeAndDetails(Color cardColor) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: cardColor,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionHeader('Тип и детали транспорта'),
          const SizedBox(height: 16),
          _LabeledDropdownField<String>(
            label: 'Тип кузова *',
            value: _bodyType,
            icon: Icons.local_shipping_outlined,
            items: const [
              DropdownMenuItem(value: 'Тент', child: Text('Тент')),
              DropdownMenuItem(
                value: 'Рефрижератор',
                child: Text('Рефрижератор'),
              ),
              DropdownMenuItem(value: 'Изотерм', child: Text('Изотерм')),
              DropdownMenuItem(
                value: 'Открытая платформа',
                child: Text('Открытая платформа'),
              ),
            ],
            validator: (v) =>
                v == null || v.isEmpty ? 'Выберите тип кузова' : null,
            onChanged: (value) {
              setState(() => _bodyType = value);
            },
          ),
          const SizedBox(height: 12),
          _LabeledDropdownField<String>(
            label: 'Тип транспорта *',
            value: _transportType,
            icon: Icons.local_shipping,
            items: const [
              DropdownMenuItem(value: 'Полуприцеп', child: Text('Полуприцеп')),
              DropdownMenuItem(value: 'Грузовик', child: Text('Грузовик')),
              DropdownMenuItem(value: 'Сцепка', child: Text('Сцепка')),
            ],
            validator: (v) =>
                v == null || v.isEmpty ? 'Выберите тип транспорта' : null,
            onChanged: (value) {
              setState(() => _transportType = value);
            },
          ),
          const SizedBox(height: 12),
          _LabeledDropdownField<String>(
            label: 'Загрузка',
            value: _loadingType,
            icon: Icons.unfold_more,
            items: const [
              DropdownMenuItem(value: 'Верхняя', child: Text('Верхняя')),
              DropdownMenuItem(value: 'Боковая', child: Text('Боковая')),
              DropdownMenuItem(value: 'Задняя', child: Text('Задняя')),
              DropdownMenuItem(value: 'Любая', child: Text('Любая')),
            ],
            validator: (v) => null,
            onChanged: (value) {
              setState(() => _loadingType = value);
            },
          ),
          const SizedBox(height: 12),
          _LabeledTextField(
            label: 'Грузоподъёмность (т)',
            hint: '',
            controller: _capacityController,
            keyboardType: TextInputType.number,
            required: false,
          ),
          const SizedBox(height: 12),
          _LabeledTextField(
            label: 'Объём кузова (м³)',
            hint: '',
            controller: _volumeController,
            keyboardType: TextInputType.number,
            required: false,
          ),
          const SizedBox(height: 12),
          const Text(
            'Кузов',
            style: TextStyle(
              color: Colors.white70,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _LabeledTextField(
                  label: 'Длина',
                  hint: 'м',
                  controller: _lengthController,
                  keyboardType: TextInputType.number,
                  required: false,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _LabeledTextField(
                  label: 'Ширина',
                  hint: 'м',
                  controller: _widthController,
                  keyboardType: TextInputType.number,
                  required: false,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _LabeledTextField(
                  label: 'Высота',
                  hint: 'м',
                  controller: _heightController,
                  keyboardType: TextInputType.number,
                  required: false,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildCrewAdr(Color cardColor) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: cardColor,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Экипаж
          const Text(
            'Экипаж',
            style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w600,
              fontSize: 15,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Добавьте экипаж',
            style: TextStyle(color: Colors.white70, fontSize: 12),
          ),
          const SizedBox(height: 6),
          Align(
            alignment: Alignment.centerRight,
            child: OutlinedButton(
              onPressed: () {
                setState(() => _crewSelected = !_crewSelected);
              },
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: Color(0xFF00B2FF)),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(20),
                ),
              ),
              child: Text(
                _crewSelected ? 'Выбрано' : 'Не выбрано',
                style: const TextStyle(color: Color(0xFF00B2FF)),
              ),
            ),
          ),
          const SizedBox(height: 12),
          const Divider(color: Colors.white24),
          const SizedBox(height: 12),

          // ADR
          const Text(
            'ADR',
            style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w600,
              fontSize: 15,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Выберите классы ADR',
            style: TextStyle(color: Colors.white70, fontSize: 12),
          ),
          const SizedBox(height: 6),
          Align(
            alignment: Alignment.centerRight,
            child: OutlinedButton(
              onPressed: () {
                setState(() => _adrSelected = !_adrSelected);
              },
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: Color(0xFF00B2FF)),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(20),
                ),
              ),
              child: Text(
                _adrSelected ? 'Выбрано' : 'Не выбрано',
                style: const TextStyle(color: Color(0xFF00B2FF)),
              ),
            ),
          ),

          const SizedBox(height: 16),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text(
              'Включить GPS-мониторинг',
              style: TextStyle(color: Colors.white),
            ),
            subtitle: const Text(
              'Включение GPS-мониторинга возможно.',
              style: TextStyle(color: Colors.white70, fontSize: 12),
            ),
            value: _gpsMonitoring,
            onChanged: (value) {
              setState(() => _gpsMonitoring = value);
            },
            activeColor: const Color(0xFF00B2FF),
          ),
        ],
      ),
    );
  }

  Widget _buildRateAndContacts(Color cardColor) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: cardColor,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionHeader('Ставка и контакты'),
          const SizedBox(height: 16),
          _LabeledDropdownField<String>(
            label: 'Тип ставки',
            value: _rateType,
            icon: Icons.receipt_long,
            items: const [
              DropdownMenuItem(value: 'С НДС', child: Text('С НДС')),
              DropdownMenuItem(value: 'Без НДС', child: Text('Без НДС')),
              DropdownMenuItem(
                value: 'По договорённости',
                child: Text('По договорённости'),
              ),
            ],
            onChanged: (value) {
              if (value == null) return;
              setState(() => _rateType = value);
            },
            validator: (v) => null,
          ),
          const SizedBox(height: 12),
          _LabeledTextField(
            label: 'Ставка',
            hint: '',
            controller: _rateController,
            keyboardType: TextInputType.number,
            required: false,
          ),
          const SizedBox(height: 12),
          _LabeledDropdownField<String>(
            label: 'Валюта',
            value: _currency,
            icon: Icons.attach_money,
            items: const [
              DropdownMenuItem(value: '₾', child: Text('₾')),
              DropdownMenuItem(value: '\$', child: Text('\$')),
              DropdownMenuItem(value: '€', child: Text('€')),
              DropdownMenuItem(value: '₽', child: Text('₽')),
            ],
            onChanged: (value) {
              setState(() => _currency = value);
            },
            validator: (v) => null,
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Без торга', style: TextStyle(color: Colors.white)),
              Switch(
                value: _noBargain,
                onChanged: (value) {
                  setState(() => _noBargain = value);
                },
                activeColor: const Color(0xFF00B2FF),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _LabeledTextField(
            label: 'Контактное лицо *',
            hint: '',
            controller: _contactController,
            required: true,
          ),
          const SizedBox(height: 12),
          _LabeledTextField(
            label: 'Телефон *',
            hint: '+995…',
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            required: true,
          ),
        ],
      ),
    );
  }

  Widget _buildNotesAndFiles(Color cardColor) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: cardColor,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionHeader('Примечание и файлы'),
          const SizedBox(height: 16),
          _LabeledTextField(
            label: 'Примечание',
            hint: '',
            controller: _noteController,
            maxLines: 3,
            required: false,
          ),
          const SizedBox(height: 16),
          const Text(
            'Вложения',
            style: TextStyle(
              color: Colors.white70,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Загрузка изображений пока не реализована'),
                  ),
                );
              },
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: Color(0xFF00B2FF)),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: const Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Добавить изображения',
                  style: TextStyle(color: Color(0xFF00B2FF)),
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Загрузка файлов пока не реализована'),
                  ),
                );
              },
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: Color(0xFFFFA726)),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: const Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Добавить файлы',
                  style: TextStyle(color: Color(0xFFFFA726)),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------- ВСПОМОГАТЕЛЬНЫЕ ВИДЖЕТЫ ----------

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        text,
        style: const TextStyle(
          color: Color(0xFF00B2FF),
          fontWeight: FontWeight.bold,
          fontSize: 16,
        ),
      ),
    );
  }
}

class _LabeledTextField extends StatelessWidget {
  const _LabeledTextField({
    required this.label,
    required this.hint,
    required this.controller,
    this.keyboardType,
    this.maxLines = 1,
    this.required = true,
    this.suffix,
  });

  final String label;
  final String hint;
  final TextEditingController controller;
  final TextInputType? keyboardType;
  final int maxLines;
  final bool required;
  final Widget? suffix;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 13,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 4),
        TextFormField(
          controller: controller,
          style: const TextStyle(color: Colors.white),
          keyboardType: keyboardType,
          maxLines: maxLines,
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: const TextStyle(color: Colors.white38),
            filled: true,
            fillColor: const Color(0xFF041322),
            enabledBorder: OutlineInputBorder(
              borderSide: const BorderSide(color: Colors.white24),
              borderRadius: BorderRadius.circular(12),
            ),
            focusedBorder: OutlineInputBorder(
              borderSide: const BorderSide(color: Colors.lightBlueAccent),
              borderRadius: BorderRadius.circular(12),
            ),
            suffixIcon: suffix == null
                ? null
                : Padding(
                    padding: const EdgeInsets.only(right: 8.0),
                    child: suffix,
                  ),
          ),
          validator: !required
              ? null
              : (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Заполните поле';
                  }
                  return null;
                },
        ),
      ],
    );
  }
}

class _LabeledDropdownField<T> extends StatelessWidget {
  const _LabeledDropdownField({
    required this.label,
    required this.items,
    required this.value,
    required this.onChanged,
    this.validator,
    this.icon,
  });

  final String label;
  final List<DropdownMenuItem<T>> items;
  final T? value;
  final void Function(T?) onChanged;
  final String? Function(T?)? validator;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 13,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 4),
        DropdownButtonFormField<T>(
          value: value,
          decoration: InputDecoration(
            filled: true,
            fillColor: const Color(0xFF041322),
            enabledBorder: OutlineInputBorder(
              borderSide: const BorderSide(color: Colors.white24),
              borderRadius: BorderRadius.circular(12),
            ),
            focusedBorder: OutlineInputBorder(
              borderSide: const BorderSide(color: Colors.lightBlueAccent),
              borderRadius: BorderRadius.circular(12),
            ),
            prefixIcon: icon == null
                ? null
                : Icon(icon, color: Colors.white70, size: 20),
          ),
          dropdownColor: const Color(0xFF041322),
          style: const TextStyle(color: Colors.white),
          items: items,
          validator: validator,
          onChanged: onChanged,
        ),
      ],
    );
  }
}
