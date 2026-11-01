// Skład zestawu (material_kit_items) — czysto odczytowe pomoce do łączenia gotowego kompletu
// (np. MERIVOBOX) z jego komponentami po stronie klienta, bez osobnego zapytania do Supabase
// (patrz catalogRepository.listMaterialKitItems — płaski resource, bez embedu z dwoma FK).

// Komponenty wchodzące w skład materiału `kitMaterialId`, wraz z ich ilością i danymi z katalogu
// (name/price/unit). Wiersze bez dopasowanego materiału (component_material_id spoza katalogu)
// są odfiltrowywane — nie powinny się zdarzyć, ale UI nie może się na nich wywrócić.
export const kitComponentsFor = (kitMaterialId, materialKitItems, materials) => {
  const materialsById = new Map((materials || []).map(material => [String(material.id), material]));
  return (materialKitItems || [])
    .filter(item => String(item.kit_material_id) === String(kitMaterialId))
    .map(item => ({
      component: materialsById.get(String(item.component_material_id)),
      quantity: Number(item.quantity) || 0,
    }))
    .filter(entry => Boolean(entry.component));
};

export const isKitMaterial = (materialId, materialKitItems) => (
  (materialKitItems || []).some(item => String(item.kit_material_id) === String(materialId))
);

export const kitComponentsTotal = (components) => (
  (components || []).reduce((sum, { component, quantity }) => sum + quantity * (Number(component?.price) || 0), 0)
);
