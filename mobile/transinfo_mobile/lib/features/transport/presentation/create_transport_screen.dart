import 'package:flutter/material.dart';

class CreateTransportScreen extends StatefulWidget {
  const CreateTransportScreen({super.key});

  @override
  State<CreateTransportScreen> createState() => _CreateTransportScreenState();
}

class _CreateTransportScreenState extends State<CreateTransportScreen> {
  final _formKey = GlobalKey<FormState>();

  final _fromCityController = TextEditingController();
  final _toCityController = TextEditingController();
  final _weightController = TextEditingController();
  final _bodyTypeController = TextEditingController();
  final _dateController = TextEditingController();
  final _commentController = TextEditingController();

  @override
  void dispose() {
    _fromCityController.dispose();
    _toCityController.dispose();
    _weightController.dispose();
    _bodyTypeController.dispose();
    _dateController.dispose();
    _commentController.dispose();
    super.dispose();
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    // пока просто показываем SnackBar — позже здесь будет реальный запрос на API
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
        title: const Text('Добавить транспорт'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: cardColor,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Form(
            key: _formKey,
            child: Column(
              children: [
                _TextField(
                  controller: _fromCityController,
                  label: 'Откуда (город)',
                ),
                const SizedBox(height: 12),
                _TextField(
                  controller: _toCityController,
                  label: 'Куда (город)',
                ),
                const SizedBox(height: 12),
                _TextField(
                  controller: _weightController,
                  label: 'Вес, тонн',
                  keyboardType: TextInputType.number,
                ),
                const SizedBox(height: 12),
                _TextField(
                  controller: _bodyTypeController,
                  label: 'Тип кузова (тент, реф и т.п.)',
                ),
                const SizedBox(height: 12),
                _TextField(
                  controller: _dateController,
                  label: 'Дата готовности / загрузки',
                ),
                const SizedBox(height: 12),
                _TextField(
                  controller: _commentController,
                  label: 'Комментарий',
                  maxLines: 3,
                  required: false,
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _submit,
                    child: const Text('Сохранить транспорт'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _TextField extends StatelessWidget {
  const _TextField({
    required this.controller,
    required this.label,
    this.keyboardType,
    this.maxLines = 1,
    this.required = true,
  });

  final TextEditingController controller;
  final String label;
  final TextInputType? keyboardType;
  final int maxLines;
  final bool required;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      style: const TextStyle(color: Colors.white),
      keyboardType: keyboardType,
      maxLines: maxLines,
      decoration: InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(color: Colors.white70),
        enabledBorder: OutlineInputBorder(
          borderSide: const BorderSide(color: Colors.white24),
          borderRadius: BorderRadius.circular(12),
        ),
        focusedBorder: OutlineInputBorder(
          borderSide: const BorderSide(color: Colors.lightBlueAccent),
          borderRadius: BorderRadius.circular(12),
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
    );
  }
}
