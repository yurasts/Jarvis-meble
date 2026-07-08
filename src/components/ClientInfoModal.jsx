import React from 'react';
import s from './Dashboard.module.css';

export default function ClientInfoModal({ info, onClose }) {
  return (
    <div className={s.modalOverlay} onClick={onClose}>
      <div className={s.modalBox} onClick={e => e.stopPropagation()}>
        <div className={s.modalHeader}>
          <span>👤 {info.clientName}</span>
          <button className={s.modalCloseBtn} onClick={onClose}>✕</button>
        </div>
        <div className={s.modalBody}>
          {info.address && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(info.address)}`}
              target="_blank" rel="noreferrer"
              className={s.clientInfoLink}
            >
              📍 {info.address}
            </a>
          )}
          {info.phone && (
            <a href={`tel:${info.phone}`} className={s.clientInfoLink}>
              📞 {info.phone}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
