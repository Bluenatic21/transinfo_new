// src/utils/isEditable.ts
export function isEditable(el: EventTarget | null): boolean {
    const node = el as HTMLElement | null;
    if (!node) return false;
    if (node.isContentEditable) return true;

    const tag = node.tagName?.toLowerCase();
    if (!tag) return false;

    if (tag === "input") {
        const type = (node as HTMLInputElement).type?.toLowerCase();
        // search, text, email, number и т.п.
        return type !== "button" && type !== "checkbox" && type !== "radio" && type !== "submit";
    }
    return tag === "textarea" || tag === "select" || node.getAttribute("role") === "textbox";
}
