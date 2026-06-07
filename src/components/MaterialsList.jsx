import React, { useState } from 'react';

export default function MaterialsList({ materials, setIsMaterialModalOpen }) {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const sortedMaterials = [...materials].sort((a, b) => {
    if (!sortConfig.key) return 0;
    const aValue = a[sortConfig.key].toString().toLowerCase();
    const bValue = b[sortConfig.key].toString().toLowerCase();
    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <>
      <div className="header-actions">
        <h1>Katalog materiałów</h1>
        <button className="btn-primary" onClick={() => setIsMaterialModalOpen(true)}>+ Dodaj materiał</button>
      </div>
      <table className="materials-table">
        <thead>
          <tr>
            <th onClick={() => requestSort('name')} style={{ cursor: 'pointer', userSelect: 'none' }}>
              Nazwa {sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
            </th>
            <th onClick={() => requestSort('category')} style={{ cursor: 'pointer', userSelect: 'none', width: '150px' }}>
              Kategoria {sortConfig.key === 'category' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
            </th>
            <th>Cena brutto</th>
            <th>Jm</th>
          </tr>
        </thead>
        <tbody>
          {sortedMaterials.map(mat => (
            <tr key={mat.id}>
              <td>{mat.name}</td>
              <td><span className="category-badge">{mat.category}</span></td>
              <td>{Number(mat.price).toFixed(2)} PLN</td>
              <td>{mat.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}