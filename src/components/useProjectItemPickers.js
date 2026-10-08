import { useEffect, useMemo, useRef, useState } from 'react';
import { groupMaterialsForPicker, materialMatchesQuery } from '../utils/materialPickerGroups';

const useProjectItemPickers = ({
  materials,
  services,
  selectedMaterials,
  selectedServices,
  isMobileVariant,
  currentProfile,
  updateItems,
  addItem,
  addCustomItem,
  finishEditing,
  closeItemEditor,
}) => {
  const [materialSearchTerm, setMaterialSearchTerm] = useState('');
  const [materialSearchOpen, setMaterialSearchOpen] = useState(false);
  const [highlightedMaterialIndex, setHighlightedMaterialIndex] = useState(0);
  const [materialCategoryFilter, setMaterialCategoryFilter] = useState('');
  const [materialSupplierFilter, setMaterialSupplierFilter] = useState('');
  const [expandedMaterialId, setExpandedMaterialId] = useState(null);
  const [replacingMaterialIndex, setReplacingMaterialIndex] = useState(null);
  const materialPickerRef = useRef(null);
  const materialSearchInputRef = useRef(null);
  const materialOptionRefs = useRef([]);
  const materialOfferButtonRefs = useRef({});

  const [serviceSearchTerm, setServiceSearchTerm] = useState('');
  const [serviceSearchOpen, setServiceSearchOpen] = useState(false);
  const [highlightedServiceIndex, setHighlightedServiceIndex] = useState(0);
  const servicePickerRef = useRef(null);
  const serviceSearchInputRef = useRef(null);
  const serviceOptionRefs = useRef([]);

  useEffect(() => {
    if (!materialSearchOpen) return undefined;
    const handleOutsidePointerDown = (event) => {
      if (materialPickerRef.current?.contains(event.target)) return;
      materialSearchInputRef.current?.blur();
      setMaterialSearchOpen(false);
      setHighlightedMaterialIndex(0);
      setExpandedMaterialId(null);
      setReplacingMaterialIndex(null);
    };
    document.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown);
  }, [materialSearchOpen]);

  useEffect(() => {
    if (!materialSearchOpen || !isMobileVariant) return undefined;
    const focusFrame = window.requestAnimationFrame(() => {
      materialSearchInputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [isMobileVariant, materialSearchOpen]);

  useEffect(() => {
    if (!serviceSearchOpen) return undefined;
    const handleOutsidePointerDown = (event) => {
      if (servicePickerRef.current?.contains(event.target)) return;
      serviceSearchInputRef.current?.blur();
      setServiceSearchOpen(false);
      setHighlightedServiceIndex(0);
    };
    document.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown);
  }, [serviceSearchOpen]);

  useEffect(() => {
    if (!serviceSearchOpen || !isMobileVariant) return undefined;
    const focusFrame = window.requestAnimationFrame(() => {
      serviceSearchInputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [isMobileVariant, serviceSearchOpen]);

  const materialCategoryOptions = useMemo(() => (
    [...new Set((materials || []).map(material => material.category).filter(Boolean))]
      .sort((left, right) => String(left).localeCompare(String(right), 'pl'))
  ), [materials]);

  const materialSupplierOptions = useMemo(() => (
    [...new Set((materials || []).map(material => material.supplier).filter(Boolean))]
      .sort((left, right) => String(left).localeCompare(String(right), 'pl'))
  ), [materials]);

  const filteredMaterialGroups = useMemo(() => {
    const query = materialSearchTerm.trim();
    const matchingMaterials = (materials || []).filter(material => (
      materialMatchesQuery(material, query)
      && (!materialCategoryFilter || material.category === materialCategoryFilter)
      && (!materialSupplierFilter || material.supplier === materialSupplierFilter)
    ));
    return groupMaterialsForPicker(matchingMaterials);
  }, [materialCategoryFilter, materialSearchTerm, materialSupplierFilter, materials]);

  const filteredServices = useMemo(() => {
    const query = serviceSearchTerm.trim().toLocaleLowerCase('pl');
    return (services || [])
      .filter(service => String(service.name || '').toLocaleLowerCase('pl').includes(query))
      .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'pl'));
  }, [serviceSearchTerm, services]);

  const closeMaterialPicker = () => {
    materialSearchInputRef.current?.blur();
    setMaterialSearchTerm('');
    setMaterialSearchOpen(false);
    setHighlightedMaterialIndex(0);
    setExpandedMaterialId(null);
    setReplacingMaterialIndex(null);
  };

  const startMaterialReplacement = (index) => {
    finishEditing();
    setReplacingMaterialIndex(index);
    setMaterialSearchTerm('');
    setHighlightedMaterialIndex(0);
    setExpandedMaterialId(null);
    setMaterialSearchOpen(true);
    window.requestAnimationFrame(() => materialSearchInputRef.current?.focus({ preventScroll: true }));
  };

  const replaceMaterial = (material) => {
    const current = selectedMaterials[replacingMaterialIndex];
    if (!current) return;
    const quantity = Number(current.quantity) || 1;
    const existingIndex = selectedMaterials.findIndex((item, index) => (
      index !== replacingMaterialIndex && item.id === material.id
    ));

    if (existingIndex >= 0) {
      const merged = selectedMaterials
        .map((item, index) => index === existingIndex
          ? { ...item, quantity: (Number(item.quantity) || 1) + quantity }
          : item)
        .filter((_, index) => index !== replacingMaterialIndex);
      updateItems('calc_materials', merged);
    } else {
      const replacement = [...selectedMaterials];
      replacement[replacingMaterialIndex] = {
        ...material,
        quantity,
        addedById: current.addedById ?? currentProfile?.id ?? null,
        addedByColor: current.addedByColor || currentProfile?.color || '#718096',
      };
      updateItems('calc_materials', replacement);
    }
    closeItemEditor();
  };

  const addMaterialFromPicker = (material) => {
    if (replacingMaterialIndex !== null) replaceMaterial(material);
    else addItem('calc_materials', selectedMaterials, material);
    closeMaterialPicker();
  };

  const handleManualMaterialAdd = () => {
    closeMaterialPicker();
    addCustomItem('calc_materials', selectedMaterials);
  };

  const moveMaterialHighlight = (nextIndex) => {
    const visibleCount = filteredMaterialGroups.length;
    if (!visibleCount) return;
    const normalizedIndex = (nextIndex + visibleCount) % visibleCount;
    setHighlightedMaterialIndex(normalizedIndex);
    window.requestAnimationFrame(() => {
      materialOptionRefs.current[normalizedIndex]?.scrollIntoView({ block: 'nearest' });
    });
  };

  const handleMaterialPickerKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeMaterialPicker();
      event.currentTarget.blur();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setMaterialSearchOpen(true);
      moveMaterialHighlight(highlightedMaterialIndex + 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setMaterialSearchOpen(true);
      moveMaterialHighlight(highlightedMaterialIndex - 1);
      return;
    }
    if (event.key === 'Enter' && materialSearchOpen) {
      const selectedGroup = filteredMaterialGroups[highlightedMaterialIndex];
      if (!selectedGroup) return;
      event.preventDefault();
      if (selectedGroup.offers.length === 1) {
        addMaterialFromPicker(selectedGroup.offers[0]);
      } else {
        setExpandedMaterialId(selectedGroup.key);
        window.requestAnimationFrame(() => {
          materialOfferButtonRefs.current[selectedGroup.key + '-0']?.focus();
        });
      }
    }
  };

  const closeServicePicker = () => {
    serviceSearchInputRef.current?.blur();
    setServiceSearchTerm('');
    setServiceSearchOpen(false);
    setHighlightedServiceIndex(0);
  };

  const addServiceFromPicker = (service) => {
    addItem('calc_services', selectedServices, service);
    closeServicePicker();
  };

  const handleManualServiceAdd = () => {
    closeServicePicker();
    addCustomItem('calc_services', selectedServices);
  };

  const moveServiceHighlight = (nextIndex) => {
    const visibleCount = filteredServices.length;
    if (!visibleCount) return;
    const normalizedIndex = (nextIndex + visibleCount) % visibleCount;
    setHighlightedServiceIndex(normalizedIndex);
    window.requestAnimationFrame(() => {
      serviceOptionRefs.current[normalizedIndex]?.scrollIntoView({ block: 'nearest' });
    });
  };

  const handleServicePickerKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeServicePicker();
      event.currentTarget.blur();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setServiceSearchOpen(true);
      moveServiceHighlight(highlightedServiceIndex + 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setServiceSearchOpen(true);
      moveServiceHighlight(highlightedServiceIndex - 1);
      return;
    }
    if (event.key === 'Enter' && serviceSearchOpen) {
      const selectedService = filteredServices[highlightedServiceIndex];
      if (!selectedService) return;
      event.preventDefault();
      addServiceFromPicker(selectedService);
    }
  };

  const resetPickers = () => {
    setMaterialSearchTerm('');
    setMaterialSearchOpen(false);
    setHighlightedMaterialIndex(0);
    setExpandedMaterialId(null);
    setReplacingMaterialIndex(null);
    setServiceSearchTerm('');
    setServiceSearchOpen(false);
    setHighlightedServiceIndex(0);
  };

  return {
    material: {
      searchTerm: materialSearchTerm,
      setSearchTerm: setMaterialSearchTerm,
      isOpen: materialSearchOpen,
      setIsOpen: setMaterialSearchOpen,
      highlightedIndex: highlightedMaterialIndex,
      setHighlightedIndex: setHighlightedMaterialIndex,
      categoryFilter: materialCategoryFilter,
      setCategoryFilter: setMaterialCategoryFilter,
      categoryOptions: materialCategoryOptions,
      supplierFilter: materialSupplierFilter,
      setSupplierFilter: setMaterialSupplierFilter,
      supplierOptions: materialSupplierOptions,
      expandedGroupId: expandedMaterialId,
      setExpandedGroupId: setExpandedMaterialId,
      replacingIndex: replacingMaterialIndex,
      groups: filteredMaterialGroups,
      pickerRef: materialPickerRef,
      searchInputRef: materialSearchInputRef,
      optionRefs: materialOptionRefs,
      offerButtonRefs: materialOfferButtonRefs,
      close: closeMaterialPicker,
      startReplacement: startMaterialReplacement,
      manualAdd: handleManualMaterialAdd,
      handleKeyDown: handleMaterialPickerKeyDown,
      select: addMaterialFromPicker,
    },
    service: {
      searchTerm: serviceSearchTerm,
      setSearchTerm: setServiceSearchTerm,
      isOpen: serviceSearchOpen,
      setIsOpen: setServiceSearchOpen,
      highlightedIndex: highlightedServiceIndex,
      setHighlightedIndex: setHighlightedServiceIndex,
      services: filteredServices,
      pickerRef: servicePickerRef,
      searchInputRef: serviceSearchInputRef,
      optionRefs: serviceOptionRefs,
      close: closeServicePicker,
      manualAdd: handleManualServiceAdd,
      handleKeyDown: handleServicePickerKeyDown,
      select: addServiceFromPicker,
    },
    resetPickers,
  };
};

export default useProjectItemPickers;
