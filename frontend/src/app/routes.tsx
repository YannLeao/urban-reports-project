import { EditOccurrencePage } from '../pages/EditOccurrencePage'
import { LoginPage } from '../pages/LoginPage'
import { AccountPage } from '../pages/AccountPage'
import { PrivateRoute } from '../features/auth/PrivateRoute'
import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { ImageProofPage } from '../pages/ImageProofPage'
import { RegistrationPage } from '../pages/RegistrationPage'
import { HomePage } from '../pages/HomePage'
import { StatusPage } from '../pages/StatusPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { ReportOccurrencePage } from '../pages/ReportOccurrencePage'
import { MyReportsPage } from '../pages/MyReportsPage'
import { OccurrenceDetailPage } from '../pages/OccurrenceDetailPage'

const DesignSystemPage = import.meta.env.DEV
  ? lazy(() => import('../pages/dev/DesignSystemPage'))
  : null

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/prova-imagem" element={<ImageProofPage />} />
      <Route path="/entrar" element={<LoginPage />} />
      <Route element={<PrivateRoute />}>
        <Route path="/minha-conta" element={<AccountPage />} />
        <Route path="/registrar-ocorrencia" element={<ReportOccurrencePage />} />
        <Route path="/meus-relatos" element={<MyReportsPage />} />
        <Route path="/meus-relatos/:id/editar" element={<EditOccurrencePage />} />
        <Route path="/meus-relatos/:id" element={<OccurrenceDetailPage />} />
      </Route>
      <Route path="/cadastro" element={<RegistrationPage />} />
      <Route path="/status" element={<StatusPage />} />
      <Route path="/dev/design-system" element={DesignSystemPage ? <Suspense fallback={<p role="status">Carregando referência…</p>}><DesignSystemPage /></Suspense> : <NotFoundPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
