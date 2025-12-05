import { createContext, useContext, useState, useCallback } from "react";

const MapHoverContext = createContext();

export function MapHoverProvider({ children }) {
    const [hoveredItem, setHoveredItem] = useState(null);
    const [clickedItemId, setClickedItemIdRaw] = useState(null);

    // Чтобы можно было безопасно вызывать setClickedItemId из вне (например, внутри leaflet обработчика)
    const setClickedItemId = useCallback((id) => {
        // если пришла строка из ?focus=..., приводим к числу
        const v = (typeof id === "string" && /^\d+$/.test(id)) ? Number(id) : id;
        setClickedItemIdRaw(v);
        // через 1 секунду сбрасываем выделение
        setTimeout(() => setClickedItemIdRaw(null), 1100);
    }, []);

    return (
        <MapHoverContext.Provider value={{
            hoveredItem,
            setHoveredItem,
            clickedItemId,
            setClickedItemId,
        }}>
            {children}
        </MapHoverContext.Provider>
    );
}

export function useMapHover() {
    return useContext(MapHoverContext);
}
