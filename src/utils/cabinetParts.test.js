import { describe, expect, it } from 'vitest';
import { computeCabinetParts } from './cabinetCalculator';

// Etap Y, krok 2 — "Wykaz formatek do rozkroju": computeCabinetParts(cabinet, opts) zwraca
// produkcyjny rozkrój (Boki/Dno/Trawersy/Fronty/Szuflady/Plecy HDF) z DOKŁADNYMI wymiarami piłowania
// (D×S) i stronami oklejki ABS (D1/D2/S1/S2), niezależnie od panel()/build() (te liczą tylko
// zagregowane metry kromki do wyceny — patrz komentarz przy computeCabinetParts w cabinetCalculator.js).
const findPart = (parts, element) => parts.find(p => p.element === element);

describe('computeCabinetParts — tumba z drzwiami rozwieranymi (Z drzwiami)', () => {
  const cabinet = { type: 'base_doors', W: 600, H: 820, D: 520, doors: 1, hdfInGroove: false };

  // Etap Z, krok 1 — zgłoszenie (Screenshot_6_2.jpg): produkcyjny standard oklejki boków to 3
  // strony (przedni pionowy torec D1 + górny/dolny poziomy torec S1/S2) — jedyna strona BEZ
  // kromki to tylna (D2, przylega do ściany/HDF). Suma metrażu kromki = height + 2*depth (ta sama
  // formuła co `sideEdgeMm(H,D) = H + 2*D` w panel()/build(), istniejącym silniku wyceny).
  it('2 Boki (H×D), kromkowane z 3 stron: przód (D1) + góra/dół (S1/S2) — suma metrażu = height + 2*depth', () => {
    const parts = computeCabinetParts(cabinet);
    const sides = findPart(parts, 'Bok');
    expect(sides.count).toBe(2);
    expect(sides.lengthMm).toBe(820);
    expect(sides.widthMm).toBe(520);
    expect(sides.edges).toEqual({ d1: true, d2: false, s1: true, s2: true });

    const edgeLengthPerSideMm = (sides.edges.d1 ? sides.lengthMm : 0) + (sides.edges.d2 ? sides.lengthMm : 0)
      + (sides.edges.s1 ? sides.widthMm : 0) + (sides.edges.s2 ? sides.widthMm : 0);
    expect(edgeLengthPerSideMm).toBe(820 + 2 * 520); // height + 2*depth
  });

  it('1 Dno (innerW × D-1, bo HDF nie jest wpuszczane), kromkowane z przodu', () => {
    const parts = computeCabinetParts(cabinet);
    const bottom = findPart(parts, 'Dno');
    expect(bottom.count).toBe(1);
    expect(bottom.lengthMm).toBe(564); // 600 - 2*18
    expect(bottom.widthMm).toBe(519); // 520 - 1 (brak HDF w rowku)
    expect(bottom.edges.d1).toBe(true);
  });

  it('2 Trawersy (innerW × 100mm), kromkowane z przodu', () => {
    const parts = computeCabinetParts(cabinet);
    const stretchers = findPart(parts, 'Trawers');
    expect(stretchers.count).toBe(2);
    expect(stretchers.lengthMm).toBe(564);
    expect(stretchers.widthMm).toBe(100);
    expect(stretchers.edges).toEqual({ d1: true, d2: false, s1: false, s2: false });
  });

  it('1 front (W×H), kromkowany z 4 stron (widoczny front)', () => {
    const parts = computeCabinetParts(cabinet);
    const front = findPart(parts, 'Front (drzwi)');
    expect(front.count).toBe(1);
    expect(front.lengthMm).toBe(600);
    expect(front.widthMm).toBe(820);
    expect(front.edges).toEqual({ d1: true, d2: true, s1: true, s2: true });
    expect(front.material).toBe('Front H1367');
  });

  it('2 drzwi (doors:2) dzielą szerokość na pół', () => {
    const parts = computeCabinetParts({ ...cabinet, doors: 2 });
    const front = findPart(parts, 'Front (drzwi)');
    expect(front.count).toBe(2);
    expect(front.lengthMm).toBe(300);
  });

  it('brak elementów szuflad (ten typ nie ma szuflad zewnętrznych)', () => {
    const parts = computeCabinetParts(cabinet);
    expect(findPart(parts, 'Dno szuflady')).toBeUndefined();
    expect(findPart(parts, 'Tył szuflady')).toBeUndefined();
  });

  it('Plecy HDF — base_doors MA koncepcję pleców (hdfInGroove w defaults)', () => {
    const parts = computeCabinetParts(cabinet);
    const hdf = findPart(parts, 'Plecy HDF');
    expect(hdf).toBeDefined();
    expect(hdf.material).toBe('HDF');
    expect(hdf.edges).toEqual({ d1: false, d2: false, s1: false, s2: false }); // plecy nie są kromkowane
  });
});

// Etap Y, krok 2 — DOKŁADNA reprodukcja przykładu z zadania: tumba 600×771×520, 3 JEDNAKOWE
// szuflady, płyta 18mm -> front 596×254, bok 771×520, dno 564×519 (HDF nie wpuszczane).
describe('computeCabinetParts — tumba z 3 szufladami (Z szufladami)', () => {
  const cabinet = {
    type: 'base_drawers', W: 600, H: 771, D: 520,
    externalDrawersHigh: 3, externalDrawersLow: 0, hdfInGroove: false,
  };

  it('front szuflady: 596 × 254 mm (3 szt.), kromkowany z 4 stron', () => {
    const parts = computeCabinetParts(cabinet);
    const front = findPart(parts, 'Front (szuflada)');
    expect(front.count).toBe(3);
    expect(front.lengthMm).toBe(596); // 600 - 4
    expect(front.widthMm).toBe(254); // round((771 - 3*3) / 3)
    expect(front.edges).toEqual({ d1: true, d2: true, s1: true, s2: true });
  });

  it('bok: 771 × 520 mm (2 szt.)', () => {
    const parts = computeCabinetParts(cabinet);
    const sides = findPart(parts, 'Bok');
    expect(sides.count).toBe(2);
    expect(sides.lengthMm).toBe(771);
    expect(sides.widthMm).toBe(520);
  });

  it('dno: 564 × 519 mm (1 szt.)', () => {
    const parts = computeCabinetParts(cabinet);
    const bottom = findPart(parts, 'Dno');
    expect(bottom.lengthMm).toBe(564); // 600 - 2*18
    expect(bottom.widthMm).toBe(519); // 520 - 1
  });

  it('dno szuflady: 513 × 474 mm, bez kromki; tył szuflady: 513 × 184 mm, kromka D1 (góra)', () => {
    const parts = computeCabinetParts(cabinet);
    const drawerBottom = findPart(parts, 'Dno szuflady');
    const drawerBack = findPart(parts, 'Tył szuflady');
    expect(drawerBottom.count).toBe(3);
    expect(drawerBottom.lengthMm).toBe(513);
    expect(drawerBottom.widthMm).toBe(474);
    expect(drawerBottom.edges).toEqual({ d1: false, d2: false, s1: false, s2: false });
    expect(drawerBack.count).toBe(3);
    expect(drawerBack.lengthMm).toBe(513);
    expect(drawerBack.widthMm).toBe(184);
    expect(drawerBack.edges).toEqual({ d1: true, d2: false, s1: false, s2: false });
  });

  it('domyślny podział "2 wysokie + 1 niska" (externalDrawersHigh:2, externalDrawersLow:1) liczy się jako 3 fronty razem', () => {
    const parts = computeCabinetParts({ ...cabinet, externalDrawersHigh: 2, externalDrawersLow: 1 });
    const front = findPart(parts, 'Front (szuflada)');
    expect(front.count).toBe(3); // 2 + 1, ta sama łączna liczba frontów co "3 jednakowe"
  });
});

describe('computeCabinetParts — penał pod piekarnik (oven_cabinet)', () => {
  const cabinet = { type: 'oven_cabinet', W: 600, H: 820, D: 520, externalDrawersLow: 1, externalDrawersHigh: 0 };

  it('ma Plecy HDF (hdfInGroove domyślnie true dla tego typu)', () => {
    const parts = computeCabinetParts({ ...cabinet, hdfInGroove: true });
    const hdf = findPart(parts, 'Plecy HDF');
    expect(hdf).toBeDefined();
    // wpuszczane w rowek -> mniejsze niż W×H (patrz hdfPanelDims w cabinetCalculator.js).
    expect(hdf.lengthMm).toBe(820 - 2 * 18 + 16); // 798
    expect(hdf.widthMm).toBe(600 - 2 * 18 + 16); // 580
  });

  it('front szuflady (1 szt.) kromkowany z 4 stron', () => {
    const parts = computeCabinetParts(cabinet);
    const front = findPart(parts, 'Front (szuflada)');
    expect(front.count).toBe(1);
    expect(front.edges).toEqual({ d1: true, d2: true, s1: true, s2: true });
  });

  it('Boki i Dno liczą się tak samo jak w pozostałych typach podłogowych', () => {
    const parts = computeCabinetParts(cabinet);
    expect(findPart(parts, 'Bok').lengthMm).toBe(820);
    expect(findPart(parts, 'Dno').lengthMm).toBe(564);
  });
});

describe('computeCabinetParts — penał pod lodówkę (fridge_tall_cabinet)', () => {
  const cabinet = { type: 'fridge_tall_cabinet', W: 600, H: 2100, D: 560, bottomHeightMm: 771 };

  it('2 NIERÓWNE fronty (dolny = bottomHeightMm, górny = reszta), oba kromkowane z 4 stron', () => {
    const parts = computeCabinetParts(cabinet);
    const bottomFront = findPart(parts, 'Front (dolny)');
    const topFront = findPart(parts, 'Front (górny)');
    expect(bottomFront.widthMm).toBe(771);
    expect(topFront.widthMm).toBe(2100 - 771); // 1329
    expect(bottomFront.edges).toEqual({ d1: true, d2: true, s1: true, s2: true });
    expect(topFront.edges).toEqual({ d1: true, d2: true, s1: true, s2: true });
  });

  it('BRAK pleców HDF — ten typ nie ma koncepcji pleców w ogóle (kanał wentylacyjny)', () => {
    const parts = computeCabinetParts(cabinet);
    expect(findPart(parts, 'Plecy HDF')).toBeUndefined();
  });

  it('brak elementów szuflad (fronty, nie szuflady)', () => {
    const parts = computeCabinetParts(cabinet);
    expect(findPart(parts, 'Dno szuflady')).toBeUndefined();
  });

  // Etap AB, krok 2 — zgłoszenie (холодильник.jpg): pod lodówkę NIE stoi pod blatem (słupek od
  // podłogi po sufit) — nie ma więc Trawers (царги pod blatem), ma za to PEŁNĄ crышę korpusu
  // (Wieniec górny, ta sama geometria co Dno), kromkowaną tylko z przodu.
  it('BRAK Trawers (nie stoi pod blatem) — ma za to Wieniec górny (crysza), ta sama szerokość co Dno, kromka tylko D1', () => {
    const parts = computeCabinetParts(cabinet);
    expect(findPart(parts, 'Trawers')).toBeUndefined();

    const bottom = findPart(parts, 'Dno');
    const top = findPart(parts, 'Wieniec górny');
    expect(top).toBeDefined();
    expect(top.count).toBe(1);
    expect(top.lengthMm).toBe(564); // 600 - 2*18, tak samo jak Dno
    expect(top.widthMm).toBe(bottom.widthMm); // ta sama geometria co Dno (559, brak HDF w rowku)
    expect(top.edges).toEqual({ d1: true, d2: false, s1: false, s2: false });
  });
});

// Etap AB, krok 3 — zgłoszenie (zmywarka.jpg): "Zabudowa zmywarki" to WOLNO STOJĄCY sprzęt AGD z
// WŁASNYM korpusem — nie ma żadnych formatek korpusu mebli, TYLKO 1 front maskujący urządzenie.
describe('computeCabinetParts — Zabudowa zmywarki (dishwasher_front)', () => {
  const cabinet = { type: 'dishwasher_front', W: 600, H: 771 };

  it('BRAK wszystkich formatek korpusu (Bok/Dno/Trawers/Plecy HDF) — korpusAreaM2 === 0', () => {
    const parts = computeCabinetParts(cabinet);
    expect(findPart(parts, 'Bok')).toBeUndefined();
    expect(findPart(parts, 'Dno')).toBeUndefined();
    expect(findPart(parts, 'Trawers')).toBeUndefined();
    expect(findPart(parts, 'Wieniec górny')).toBeUndefined();
    expect(findPart(parts, 'Plecy HDF')).toBeUndefined();

    const korpusAreaM2 = parts.filter(p => p.group === 'body' || p.group === 'hdf').reduce((sum, p) => sum + p.areaM2, 0);
    expect(korpusAreaM2).toBe(0);
  });

  it('TYLKO 1 front (W-4 × H), kromkowany z 4 stron', () => {
    const parts = computeCabinetParts(cabinet);
    expect(parts).toHaveLength(1);
    const front = findPart(parts, 'Front zmywarki');
    expect(front).toBeDefined();
    expect(front.count).toBe(1);
    expect(front.lengthMm).toBe(596); // 600 - 4
    expect(front.widthMm).toBe(771);
    expect(front.edges).toEqual({ d1: true, d2: true, s1: true, s2: true });
    expect(front.material).toBe('Front H1367');
  });
});

describe('computeCabinetParts — opcje boardThickness/hdfThickness', () => {
  it('niestandardowa boardThickness (np. 16mm) zmienia innerW Dna/Trawersów', () => {
    const parts = computeCabinetParts(
      { type: 'base_doors', W: 600, H: 820, D: 520, doors: 1 },
      { boardThickness: 16 },
    );
    expect(findPart(parts, 'Dno').lengthMm).toBe(568); // 600 - 2*16
  });

  it('nie rzuca wyjątku, gdy cabinet jest pusty/niekompletny', () => {
    expect(() => computeCabinetParts({})).not.toThrow();
    expect(() => computeCabinetParts(undefined)).not.toThrow();
  });
});
