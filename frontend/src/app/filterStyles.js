export const filterRootStyle = {
    display: "flex",
    gap: 7, // Было 12
    marginBottom: 13, // Было 18
    background: "var(--background-light, #23242b)",
    padding: "8px 10px 7px 10px", // Было 14/20/12/20
    borderRadius: 12, // Было 15
    boxShadow: "0 2px 8px #0d183320", // Было "0 4px 18px"
    alignItems: "center",
    flexWrap: "wrap"
};
export const inputStyle = {
    border: "1.1px solid var(--border, #233655)",
    borderRadius: 8,
    background: "var(--background, #10182b)",
    color: "var(--foreground, #e3f2fd)",
    padding: "5px 9px", // Было 8/14
    fontSize: 15,
    outline: "none",
    minWidth: 70,  // Было 96
    maxWidth: 140, // Было 170
    marginRight: 0,
    transition: "border-color .13s, background .13s"
};
export const selectStyle = {
    ...inputStyle,
    minWidth: 85, // Добавь minWidth если нужно ещё меньше
    maxWidth: 140,
    cursor: "pointer"
};
export const buttonStyleAccent = {
    background: "linear-gradient(90deg, var(--accent-dark, #1e88e5) 0%, var(--accent, #43c8ff) 100%)",
    color: "var(--foreground, #e3f2fd)",
    border: 0,
    borderRadius: 9,
    fontWeight: 700,
    fontSize: 15,
    padding: "9px 24px",
    cursor: "pointer",
    marginLeft: 4,
    boxShadow: "0 2px 18px #17be9a1a",
    transition: "background .14s, color .13s, box-shadow .13s"
};
export const buttonStyleDark = {
    background: "var(--background, #18223cbb)",
    color: "var(--accent, #43c8ff)",
    border: "1.2px solid var(--accent, #43c8ff)",
    borderRadius: 9,
    fontWeight: 500,
    fontSize: 15,
    padding: "9px 22px",
    cursor: "pointer",
    marginLeft: 4,
    transition: "background .15s, color .14s"
};
export const checkboxLabel = {
    color: "var(--accent, #43c8ff)",
    fontSize: 15,
    fontWeight: 600,
    marginLeft: 8,
    letterSpacing: "0.01em"
};
