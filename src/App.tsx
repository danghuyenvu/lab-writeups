import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import WriteupPage from './pages/WriteupPage';

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="writeups/:slug" element={<WriteupPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
