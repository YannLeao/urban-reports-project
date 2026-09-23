import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { HomePage } from '../pages/HomePage'
import { StatusPage } from '../pages/StatusPage'
import { NotFoundPage } from '../pages/NotFoundPage'

const DesignSystemPage = import.meta.env.DEV
  ? lazy(() => import('../pages/dev/DesignSystemPage'))
  : null

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/status" element={<StatusPage />} />
      <Route path="/dev/design-system" element={DesignSystemPage ? <Suspense fallback={<p role="status">Carregando referência…</p>}><DesignSystemPage /></Suspense> : <NotFoundPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
