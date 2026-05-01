import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Workflows } from './pages/Workflows';
import { Costs } from './pages/Costs';
import { Architecture } from './pages/Architecture';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="/workflows" element={<Workflows />} />
        <Route path="/costs" element={<Costs />} />
        <Route path="/architecture" element={<Architecture />} />
      </Route>
    </Routes>
  );
}
