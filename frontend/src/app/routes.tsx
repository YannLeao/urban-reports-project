import { Route, Routes } from 'react-router'
import { HomePage } from '../pages/HomePage'
import { StatusPage } from '../pages/StatusPage'
import { NotFoundPage } from '../pages/NotFoundPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/status" element={<StatusPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
