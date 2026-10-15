import { EditOccurrencePage } from '../pages/EditOccurrencePage'
import { LoginPage } from '../pages/LoginPage'
import { AccountPage } from '../pages/AccountPage'
import { PrivateRoute, RoleRoute } from '../features/auth/PrivateRoute'
import { AdminActivationPage } from '../pages/AdminActivationPage'
import { AdminAccountsPage } from '../pages/AdminAccountsPage'
import { ModerationQueuePage } from '../pages/ModerationQueuePage'
import { ModerationDetailPage } from '../pages/ModerationDetailPage'
import { AdministrativeReportPage } from '../pages/AdministrativeReportPage'
import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { RegistrationPage } from '../pages/RegistrationPage'
import { HomePage } from '../pages/HomePage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { ReportOccurrencePage } from '../pages/ReportOccurrencePage'
import { MyReportsPage } from '../pages/MyReportsPage'
import { OccurrenceDetailPage } from '../pages/OccurrenceDetailPage'
import { PublicOccurrencesPage } from '../pages/PublicOccurrencesPage'
import { PublicOccurrenceDetailPage } from '../pages/PublicOccurrenceDetailPage'
import { NotificationsPage } from '../pages/NotificationsPage'

const DesignSystemPage = import.meta.env.DEV
  ? lazy(() => import('../pages/dev/DesignSystemPage'))
  : null

const StatusPage = import.meta.env.DEV ? lazy(() => import('../pages/StatusPage').then(module => ({ default: module.StatusPage }))) : null
const ImageProofPage = import.meta.env.DEV ? lazy(() => import('../pages/ImageProofPage').then(module => ({ default: module.ImageProofPage }))) : null

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/ocorrencias" element={<PublicOccurrencesPage />} />
      <Route path="/ocorrencias/:id" element={<PublicOccurrenceDetailPage />} />
      <Route path="/prova-imagem" element={ImageProofPage ? <Suspense fallback={<p role="status">Carregando ferramenta…</p>}><ImageProofPage /></Suspense> : <NotFoundPage />} />
      <Route path="/entrar" element={<LoginPage />} />
      <Route path="/ativar-administrador" element={<AdminActivationPage />} />
      <Route element={<PrivateRoute />}>
        <Route path="/minha-conta" element={<AccountPage />} />
        <Route element={<RoleRoute role="SUPER_ADMIN" />}>
          <Route path="/administracao/contas" element={<AdminAccountsPage />} />
        </Route>
        <Route element={<RoleRoute role="ADMIN" />}>
          <Route path="/administracao/relatorio" element={<AdministrativeReportPage />} />
          <Route path="/administracao/relatos" element={<ModerationQueuePage />} />
          <Route path="/administracao/relatos/:id" element={<ModerationDetailPage />} />
        </Route>
        <Route element={<RoleRoute role="USER" />}>
        <Route path="/notificacoes" element={<NotificationsPage />} />
        <Route path="/registrar-ocorrencia" element={<ReportOccurrencePage />} />
        <Route path="/meus-relatos" element={<MyReportsPage />} />
        <Route path="/meus-relatos/:id/editar" element={<EditOccurrencePage />} />
        <Route path="/meus-relatos/:id" element={<OccurrenceDetailPage />} />
        </Route>
      </Route>
      <Route path="/cadastro" element={<RegistrationPage />} />
      <Route path="/status" element={StatusPage ? <Suspense fallback={<p role="status">Carregando ferramenta…</p>}><StatusPage /></Suspense> : <NotFoundPage />} />
      <Route path="/dev/design-system" element={DesignSystemPage ? <Suspense fallback={<p role="status">Carregando referência…</p>}><DesignSystemPage /></Suspense> : <NotFoundPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
