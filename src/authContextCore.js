import { createContext } from 'react'

// Сам объект контекста — в отдельном файле без компонентов и без хуков, чтобы
// AuthContext.jsx (Provider) и useAuth.js (хук) могли оба его импортировать
// без цикличной зависимости друг от друга.
export const AuthContext = createContext(null)
