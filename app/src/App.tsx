import { useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { HomePage } from './pages/HomePage'
import { QuestionPage } from './pages/QuestionPage'
import { AskPage } from './pages/AskPage'
import { ProfilePage } from './pages/ProfilePage'
import { AdminPage } from './pages/AdminPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { I18nProvider } from './lib/I18nProvider'
import { restoreSession } from './store/knit'

export default function App() {
  // Khôi phục phiên đăng nhập từ token lưu ở trình duyệt.
  useEffect(() => {
    restoreSession().catch(() => undefined)
  }, [])

  return (
    <I18nProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/question/:id" element={<QuestionPage />} />
            <Route path="/ask" element={<AskPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </I18nProvider>
  )
}