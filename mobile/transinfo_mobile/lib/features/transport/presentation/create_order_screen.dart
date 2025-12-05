import 'package:flutter/material.dart';

class CreateOrderScreen extends StatefulWidget {
  const CreateOrderScreen({super.key});

  @override
  State<CreateOrderScreen> createState() => _CreateOrderScreenState();
}

class _CreateOrderScreenState extends State<CreateOrderScreen> {
  final _formKey = GlobalKey<FormState>();

  // Маршрут
  final _loadCityController = TextEditingController();
  final _unloadCityController = TextEditingController();
  final _loadDateFromController = TextEditingController();
  final _loadDateToController = TextEditingController();

  // Груз
  bool _isFtl = true; // true = Целая машина (FTL), false = LTL
  final _cargoNameController = TextEditingController();
  final _cargoWeightController = TextEditingController();
  final _cargoVolumeController = TextEditingController();

  // Транспорт (требования)
  String? _bodyType;
  String? _loadingKinds;
  final _trucksCountController = TextEditingController(text: '1');
  bool _adrSelected = false;
  bool _tempSelected = false;

  // Ставка
  String _rateMode = 'Торги'; // 'Торги' / 'Без торга' / 'Запрос'
  String _paymentVariant = 'С НДС, безнал';
  final _rateValueController = TextEditingController();
  String _rateCurrency = '₾';
  String _paymentCondition = 'На выгрузке'; // 4 варианта

  // Контакты
  final _contactNameController = TextEditingController();
  final _phoneController = TextEditingController();

  // Комментарий
  final _commentController = TextEditingController();

  @override
  void dispose() {
    _loadCityController.dispose();
    _unloadCityController.dispose();
    _loadDateFromController.dispose();
    _loadDateToController.dispose();
    _cargoNameController.dispose();
    _cargoWeightController.dispose();
    _cargoVolumeController.dispose();
    _trucksCountController.dispose();
    _rateValueController.dispose();
    _contactNameController.dispose();
    _phoneController.dispose();
    _commentController.dispose();
    super.dispose();
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Заявка сохранена (пока заглушка, без API)'),
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
        title: const Text('Создать Заявку'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            children: [
              _buildRouteSection(cardColor),
              const SizedBox(height: 16),
              _buildCargoSection(cardColor),
              const SizedBox(height: 16),
              _buildTransportSection(cardColor),
              const SizedBox(height: 16),
              _buildRateSection(cardColor),
              const SizedBox(height: 16),
              _buildCommentGpsFilesSection(cardColor),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _submit,
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: const Text('Создать заявку'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ----------------- СЕКЦИИ -----------------

  Widget _buildRouteSection(Color cardColor) {
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
          const _SectionHeader('Маршрут'),
          const SizedBox(height: 16),

          // Погрузка
          const _FieldLabel('Погрузка *'),
          const SizedBox(height: 4),
          _DarkTextField(
            controller: _loadCityController,
            hint: 'Начните вводить страну или город.',
            validator: (v) =>
                v == null || v.trim().isEmpty ? 'Укажите место погрузки' : null,
          ),
          const SizedBox(height: 4),
          Center(
            child: TextButton(
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text(
                      'Добавление нескольких мест погрузки пока не реализовано',
                    ),
                  ),
                );
              },
              child: const Text(
                '+ Место погрузки',
                style: TextStyle(color: Color(0xFF00B2FF)),
              ),
            ),
          ),

          const SizedBox(height: 12),

          // Выгрузка
          const _FieldLabel('Выгрузка *'),
          const SizedBox(height: 4),
          _DarkTextField(
            controller: _unloadCityController,
            hint: 'Начните вводить страну или город.',
            validator: (v) =>
                v == null || v.trim().isEmpty ? 'Укажите место выгрузки' : null,
          ),
          const SizedBox(height: 4),
          Center(
            child: TextButton(
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text(
                      'Добавление нескольких мест выгрузки пока не реализовано',
                    ),
                  ),
                );
              },
              child: const Text(
                '+ Место выгрузки',
                style: TextStyle(color: Color(0xFF00B2FF)),
              ),
            ),
          ),

          const SizedBox(height: 12),

          // Даты
          Row(
            children: [
              Expanded(
                child: _DarkTextField(
                  controller: _loadDateFromController,
                  hint: 'дд.мм.гггг',
                  label: 'Дата погрузки',
                  keyboardType: TextInputType.datetime,
                  validator: (_) => null,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _DarkTextField(
                  controller: _loadDateToController,
                  hint: 'дд.мм.гггг',
                  label: 'Дата выгрузки',
                  keyboardType: TextInputType.datetime,
                  validator: (_) => null,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildCargoSection(Color cardColor) {
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
          const _SectionHeader('Груз'),
          const SizedBox(height: 16),

          // LTL / FTL
          Row(
            children: [
              Expanded(
                child: _RadioCard(
                  label: 'Сборный груз (LTL)',
                  selected: !_isFtl,
                  onTap: () {
                    setState(() => _isFtl = false);
                  },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _RadioCard(
                  label: 'Целая машина (FTL)',
                  selected: _isFtl,
                  onTap: () {
                    setState(() => _isFtl = true);
                  },
                ),
              ),
            ],
          ),

          const SizedBox(height: 16),

          // Основные поля груза
          const _FieldLabel('Наименование *'),
          const SizedBox(height: 4),
          _DarkTextField(
            controller: _cargoNameController,
            hint: '',
            validator: (v) =>
                v == null || v.trim().isEmpty ? 'Заполните наименование' : null,
          ),
          const SizedBox(height: 12),
          const _FieldLabel('Вес, т *'),
          const SizedBox(height: 4),
          _DarkTextField(
            controller: _cargoWeightController,
            hint: '',
            keyboardType: TextInputType.number,
            validator: (v) =>
                v == null || v.trim().isEmpty ? 'Укажите вес' : null,
          ),
          const SizedBox(height: 12),
          const _FieldLabel('Объём, м³'),
          const SizedBox(height: 4),
          _DarkTextField(
            controller: _cargoVolumeController,
            hint: '',
            keyboardType: TextInputType.number,
            validator: (_) => null,
          ),

          const SizedBox(height: 12),
          Center(
            child: TextButton(
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Больше деталей пока не реализовано'),
                  ),
                );
              },
              child: const Text(
                'Больше деталей',
                style: TextStyle(color: Color(0xFF00B2FF)),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTransportSection(Color cardColor) {
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
          const _SectionHeader('Транспорт'),
          const SizedBox(height: 16),

          // Тип кузова *
          const _FieldLabel('Тип кузова *'),
          const SizedBox(height: 4),
          _DarkDropdown<String>(
            value: _bodyType,
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
            hint: 'Выберите тип кузова',
            onChanged: (v) {
              setState(() => _bodyType = v);
            },
            validator: (v) =>
                v == null || v.isEmpty ? 'Выберите тип кузова' : null,
          ),

          const SizedBox(height: 12),

          // Вид(ы) загрузки
          const _FieldLabel('Вид(ы) загрузки'),
          const SizedBox(height: 4),
          _DarkDropdown<String>(
            value: _loadingKinds,
            items: const [
              DropdownMenuItem(value: 'Верхняя', child: Text('Верхняя')),
              DropdownMenuItem(value: 'Боковая', child: Text('Боковая')),
              DropdownMenuItem(value: 'Задняя', child: Text('Задняя')),
              DropdownMenuItem(value: 'Любая', child: Text('Любая')),
            ],
            hint: 'Вид(ы) загрузки',
            onChanged: (v) {
              setState(() => _loadingKinds = v);
            },
            validator: (_) => null,
          ),

          const SizedBox(height: 12),

          // Кол-во машин
          const _FieldLabel('Кол-во машин'),
          const SizedBox(height: 4),
          _DarkTextField(
            controller: _trucksCountController,
            hint: '',
            keyboardType: TextInputType.number,
            validator: (_) => null,
          ),

          const SizedBox(height: 16),

          // ADR и Темп. режим в стиле "Не выбрано"
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('ADR', style: TextStyle(color: Colors.white)),
              TextButton(
                onPressed: () {
                  setState(() => _adrSelected = !_adrSelected);
                },
                child: Text(
                  _adrSelected ? 'Выбрано' : 'Не выбрано',
                  style: const TextStyle(color: Color(0xFF00B2FF)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Темп. режим', style: TextStyle(color: Colors.white)),
              TextButton(
                onPressed: () {
                  setState(() => _tempSelected = !_tempSelected);
                },
                child: Text(
                  _tempSelected ? 'Выбрано' : 'Не выбрано',
                  style: const TextStyle(color: Color(0xFF00B2FF)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildRateSection(Color cardColor) {
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
          const _SectionHeader('Ставка'),
          const SizedBox(height: 16),

          // Торги / Без торга / Запрос
          Row(
            children: [
              Expanded(
                child: _SegmentButton(
                  label: 'Торги',
                  selected: _rateMode == 'Торги',
                  onTap: () {
                    setState(() => _rateMode = 'Торги');
                  },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _SegmentButton(
                  label: 'Без торга',
                  selected: _rateMode == 'Без торга',
                  onTap: () {
                    setState(() => _rateMode = 'Без торга');
                  },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _SegmentButton(
                  label: 'Запрос',
                  selected: _rateMode == 'Запрос',
                  onTap: () {
                    setState(() => _rateMode = 'Запрос');
                  },
                ),
              ),
            ],
          ),

          const SizedBox(height: 16),

          // Блок "Запрос" / "Ставка и контакты"
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF051728),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _FieldLabel('Вариант оплаты'),
                const SizedBox(height: 4),
                _DarkDropdown<String>(
                  value: _paymentVariant,
                  items: const [
                    DropdownMenuItem(
                      value: 'С НДС, безнал',
                      child: Text('С НДС, безнал'),
                    ),
                    DropdownMenuItem(
                      value: 'Без НДС, безнал',
                      child: Text('Без НДС, безнал'),
                    ),
                    DropdownMenuItem(
                      value: 'Наличные',
                      child: Text('Наличные'),
                    ),
                  ],
                  hint: '',
                  onChanged: (v) {
                    if (v == null) return;
                    setState(() => _paymentVariant = v);
                  },
                  validator: (_) => null,
                ),
                const SizedBox(height: 12),
                const _FieldLabel('Ставка'),
                const SizedBox(height: 4),
                _DarkTextField(
                  controller: _rateValueController,
                  hint: '',
                  keyboardType: TextInputType.number,
                  validator: (_) => null,
                ),
                const SizedBox(height: 12),
                const _FieldLabel('Валюта'),
                const SizedBox(height: 4),
                _DarkDropdown<String>(
                  value: _rateCurrency,
                  items: const [
                    DropdownMenuItem(value: '₾', child: Text('₾')),
                    DropdownMenuItem(value: '\$', child: Text('\$')),
                    DropdownMenuItem(value: '€', child: Text('€')),
                    DropdownMenuItem(value: '₽', child: Text('₽')),
                  ],
                  hint: '',
                  onChanged: (v) {
                    if (v == null) return;
                    setState(() => _rateCurrency = v);
                  },
                  validator: (_) => null,
                ),
                const SizedBox(height: 16),
                const _FieldLabel('Условия оплаты:'),
                const SizedBox(height: 8),
                _PaymentConditionRow(
                  value: _paymentCondition,
                  onChanged: (v) {
                    setState(() => _paymentCondition = v);
                  },
                ),
              ],
            ),
          ),

          const SizedBox(height: 16),

          // Контакты
          const _FieldLabel('Контактное лицо *'),
          const SizedBox(height: 4),
          _DarkTextField(
            controller: _contactNameController,
            hint: '',
            validator: (v) => v == null || v.trim().isEmpty
                ? 'Заполните контактное лицо'
                : null,
          ),
          const SizedBox(height: 12),
          const _FieldLabel('Телефон *'),
          const SizedBox(height: 4),
          _DarkTextField(
            controller: _phoneController,
            hint: '+995...',
            keyboardType: TextInputType.phone,
            validator: (v) =>
                v == null || v.trim().isEmpty ? 'Укажите телефон' : null,
          ),
        ],
      ),
    );
  }

  Widget _buildCommentGpsFilesSection(Color cardColor) {
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
          const _FieldLabel('Комментарий'),
          const SizedBox(height: 4),
          _DarkTextField(
            controller: _commentController,
            hint: 'Любая доп. информация (по желанию)',
            maxLines: 3,
            validator: (_) => null,
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF041322),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Запросить у перевозчика GPS‑мониторинг груза',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                SizedBox(height: 4),
                Text(
                  'Вы получите ссылку для онлайн‑отслеживания маршрута на время перевозки. Уточните возможность GPS у перевозчика.',
                  style: TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const _SectionHeader('Изображения и файлы'),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Добавление изображений пока не реализовано'),
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
                  'Добавить изображения (до 12)',
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
                    content: Text('Добавление файлов пока не реализовано'),
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
                  'Добавить файлы (до 12)',
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

// ----------------- ВСПОМОГАТЕЛЬНЫЕ ВИДЖЕТЫ -----------------

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

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        color: Colors.white,
        fontSize: 13,
        fontWeight: FontWeight.w600,
      ),
    );
  }
}

class _DarkTextField extends StatelessWidget {
  const _DarkTextField({
    required this.controller,
    required this.hint,
    this.label,
    this.maxLines = 1,
    this.keyboardType,
    this.validator,
  });

  final TextEditingController controller;
  final String hint;
  final String? label;
  final int maxLines;
  final TextInputType? keyboardType;
  final String? Function(String?)? validator;

  @override
  Widget build(BuildContext context) {
    final field = TextFormField(
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
      ),
      validator: validator,
    );

    if (label == null) return field;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [_FieldLabel(label!), const SizedBox(height: 4), field],
    );
  }
}

class _DarkDropdown<T> extends StatelessWidget {
  const _DarkDropdown({
    required this.value,
    required this.items,
    required this.onChanged,
    required this.hint,
    this.validator,
  });

  final T? value;
  final List<DropdownMenuItem<T>> items;
  final void Function(T?) onChanged;
  final String hint;
  final String? Function(T?)? validator;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<T>(
      value: value,
      dropdownColor: const Color(0xFF041322),
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
      ),
      style: const TextStyle(color: Colors.white),
      items: items,
      validator: validator,
      onChanged: onChanged,
    );
  }
}

class _RadioCard extends StatelessWidget {
  const _RadioCard({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? const Color(0xFF041322) : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? const Color(0xFF00B2FF) : Colors.white24,
          ),
        ),
        child: Row(
          children: [
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_off,
              color: const Color(0xFF00B2FF),
              size: 18,
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                label,
                style: const TextStyle(color: Colors.white, fontSize: 12),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SegmentButton extends StatelessWidget {
  const _SegmentButton({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 36,
        decoration: BoxDecoration(
          color: selected ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Colors.white24),
        ),
        child: Center(
          child: Text(
            label,
            style: TextStyle(
              color: selected ? const Color(0xFF041322) : Colors.white70,
              fontWeight: FontWeight.w600,
              fontSize: 13,
            ),
          ),
        ),
      ),
    );
  }
}

class _PaymentConditionRow extends StatelessWidget {
  const _PaymentConditionRow({required this.value, required this.onChanged});

  final String value;
  final void Function(String) onChanged;

  @override
  Widget build(BuildContext context) {
    const options = [
      'На выгрузке',
      'Через X дней после выгрузки',
      'Предоплата',
      'По договору',
    ];

    return Column(
      children: options
          .map(
            (opt) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: GestureDetector(
                onTap: () => onChanged(opt),
                child: Container(
                  height: 36,
                  decoration: BoxDecoration(
                    color: value == opt
                        ? const Color(0xFF303540)
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: Colors.white24),
                  ),
                  child: Center(
                    child: Text(
                      opt,
                      style: const TextStyle(color: Colors.white, fontSize: 13),
                    ),
                  ),
                ),
              ),
            ),
          )
          .toList(),
    );
  }
}
