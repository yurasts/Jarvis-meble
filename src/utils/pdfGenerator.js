// Функция генерации Оферты/Сметы
export const generatePDF = (client) => {
  const mCost = (client.calc_materials || []).reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
  const sCost = (client.calc_services || []).reduce((sum, item) => sum + (Number(item.price) * (Number(item.quantity) || 1)), 0);
  const tCost = mCost + sCost;
  const today = new Date().toLocaleDateString('pl-PL');
  const printWindow = window.open('', '_blank');
  
  const html = `
    <!DOCTYPE html><html><head><title>Oferta - ${client.full_name}</title>
    <style>
      body { font-family: 'Arial', sans-serif; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; }
      h1 { color: #2d3748; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 30px; }
      .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
      .client-info { margin-bottom: 40px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 14px; }
      th, td { border: 1px solid #cbd5e0; padding: 10px; text-align: left; }
      th { background-color: #edf2f7; color: #4a5568; }
      .total-box { margin-top: 30px; text-align: right; padding: 20px; background: #ebf8ff; border: 1px solid #bee3f8; border-radius: 8px; }
      .footer { margin-top: 50px; font-size: 12px; color: #a0aec0; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px; }
      @media print { body { padding: 0; } @page { margin: 1cm; } }
    </style></head><body>
    <div class="header"><div><h1>OFERTA / WYCENA</h1><p>Data: <strong>${today}</strong></p></div>
    <div style="text-align: right;"><h3 style="margin-bottom: 5px; color: #4a5568;">Wykonawca</h3><p style="margin: 0; font-weight: bold; font-size: 18px;">Jarvis Meble</p><p style="margin: 5px 0 0 0;">Tel: +48 000 000 000</p></div></div>
    <div class="client-info"><h3 style="margin: 0 0 10px 0; color: #4a5568;">Dla klienta:</h3><p style="margin: 0; font-size: 18px;"><strong>${client.full_name}</strong></p><p style="margin: 5px 0 0 0;">Tel: ${client.phone}</p>
    ${client.address ? `<p style="margin: 5px 0 0 0;">Adres: ${client.address}</p>` : ''}</div>
    <h3 style="color: #2d3748;">1. Wykorzystane materiały</h3>
    <table><tr><th>Nazwa materiału</th><th>Ilość</th><th>Jm</th><th>Cena jedn. brutto</th><th>Wartość</th></tr>
    ${(client.calc_materials || []).map(m => `<tr><td>${m.name}</td><td>${m.quantity}</td><td>${m.unit}</td><td>${Number(m.price).toFixed(2)} PLN</td><td><strong>${(Number(m.price) * Number(m.quantity)).toFixed(2)} PLN</strong></td></tr>`).join('')}
    ${(client.calc_materials || []).length === 0 ? '<tr><td colspan="5" style="text-align:center;">Brak materiałów</td></tr>' : ''}</table>
    <h3 style="color: #2d3748;">2. Usługi</h3>
    <table><tr><th>Nazwa usługi / kosztu</th><th>Ilość</th><th>Cena jedn. brutto</th><th>Wartość</th></tr>
    ${(client.calc_services || []).map(s => `<tr><td>${s.name}</td><td>${s.quantity || 1}</td><td>${Number(s.price).toFixed(2)} PLN</td><td><strong>${(Number(s.price) * (s.quantity || 1)).toFixed(2)} PLN</strong></td></tr>`).join('')}
    ${(client.calc_services || []).length === 0 ? '<tr><td colspan="4" style="text-align:center;">Brak usług</td></tr>' : ''}</table>
    <div class="total-box"><div style="font-size: 16px; color: #4a5568; margin-bottom: 10px;">Suma kosztów składowych: ${Number(tCost).toFixed(2)} PLN</div>
    <div style="font-size: 24px; color: #2b6cb0; font-weight: bold;">CAŁKOWITY KOSZT PROJEKTU: ${Number(client.budget).toFixed(2)} PLN</div></div>
    <div class="footer">Wygenerowano automatycznie. Oferta ma charakter informacyjny.</div></body></html>`;
  
  printWindow.document.write(html);
  printWindow.document.close();
  setTimeout(() => { printWindow.print() }, 250);
};

// Функция генерации Списка покупок для поставщиков
export const generateShoppingListPDF = (client) => {
  const materials = client.calc_materials || [];
  if (materials.length === 0) {
    alert('Brak materiałów do zamówienia.');
    return;
  }

  const grouped = materials.reduce((acc, mat) => {
    const supplier = mat.supplier || 'Nieokreślony';
    if (!acc[supplier]) acc[supplier] = [];
    acc[supplier].push(mat);
    return acc;
  }, {});

  const today = new Date().toLocaleDateString('pl-PL');
  const printWindow = window.open('', '_blank');

  let tablesHtml = '';
  for (const [supplier, items] of Object.entries(grouped)) {
    tablesHtml += `
      <div class="supplier-section">
        <h3>Dostawca: ${supplier}</h3>
        <table>
          <thead>
            <tr>
              <th style="width: 70%;">Nazwa materiału</th>
              <th style="width: 15%;">Ilość</th>
              <th style="width: 15%;">Jm</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(m => `
              <tr>
                <td>${m.name}</td>
                <td><strong>${m.quantity}</strong></td>
                <td>${m.unit}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  const html = `
    <!DOCTYPE html><html><head><title>Lista zakupów - ${client.full_name}</title>
    <style>
      body { font-family: 'Arial', sans-serif; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; }
      h1 { color: #2d3748; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 10px; }
      .header p { margin: 5px 0; color: #4a5568; }
      .supplier-section { margin-top: 30px; page-break-inside: avoid; }
      .supplier-section h3 { background: #edf2f7; padding: 10px; margin: 0; border: 1px solid #cbd5e0; border-bottom: none; font-size: 16px; color: #2b6cb0; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px; }
      th, td { border: 1px solid #cbd5e0; padding: 8px 10px; text-align: left; }
      th { background-color: #f8fafc; color: #4a5568; font-weight: bold; }
      @media print { body { padding: 0; } @page { margin: 1cm; } }
    </style></head><body>
    <div class="header">
      <h1>LISTA ZAKUPÓW</h1>
      <p>Projekt: <strong>${client.full_name}</strong></p>
      <p>Data wygenerowania: <strong>${today}</strong></p>
    </div>
    ${tablesHtml}
    <div style="margin-top: 40px; font-size: 12px; color: #a0aec0; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 15px;">
      Wygenerowano automatycznie z systemu Jarvis.
    </div>
    </body></html>
  `;
  
  printWindow.document.write(html);
  printWindow.document.close();
  setTimeout(() => { printWindow.print() }, 250);
};