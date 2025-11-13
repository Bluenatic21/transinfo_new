/** @type {import('tailwindcss').Config} */
// Подключаем цвета из CSS-переменных с поддержкой прозрачности
function v(name) {
    return ({ opacityValue }) =>
        opacityValue === undefined
            ? `rgb(var(${name}))`
            : `rgb(var(${name}) / ${opacityValue})`;
}

module.exports = {
    content: [
        "./src/**/*.{js,ts,jsx,tsx}",
        "./pages/**/*.{js,ts,jsx,tsx}",
        "./app/**/*.{js,ts,jsx,tsx}",
    ],
  // Жёстко работаем только от класса .dark на <html>
  darkMode: "class",
    theme: {
        extend: {
            colors: {
                bg: v("--bg"),
                fg: v("--fg"),
                muted: v("--muted"),
                card: v("--card"),
                borderc: v("--border"),
                primary: v("--primary"),
                accent: v("--accent"),
            },
        },
    },
    plugins: [],
};