import { useState, useMemo } from "react";

/**
 * Универсальный хук hover-выделения между картой и карточками.
 * Используй в SimpleMap и в модалках.
 * 
 * @param {array} list - список карточек/объектов (orders/transports)
 * @param {string | undefined} externalHoveredId - ID, который приходит "снаружи" (например, из модалки)
 * @param {function | undefined} externalSetHoveredId - функция для изменения hoveredId "снаружи"
 * @returns [hoveredId, setHoveredId, hoveredItem]
 */
export function useCrossHover(list, externalHoveredId, externalSetHoveredId) {
    // Если снаружи пришли hoveredId/setHoveredId — используем их, иначе своё состояние
    const [internalHoveredId, setInternalHoveredId] = useState(null);
    const hoveredId = externalHoveredId !== undefined ? externalHoveredId : internalHoveredId;
    const setHoveredId = externalSetHoveredId !== undefined ? externalSetHoveredId : setInternalHoveredId;

    const hoveredItem = useMemo(() => {
        if (!hoveredId) return null;
        return list.find(x => x.id === hoveredId) || null;
    }, [hoveredId, list]);
    return [hoveredId, setHoveredId, hoveredItem];
}
