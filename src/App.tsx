import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import SplashRoute from './routes/SplashRoute';
import MenuRoute from './routes/MenuRoute';
import SettingsRoute from './routes/SettingsRoute';
import GameRoute from './routes/GameRoute';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<SplashRoute />} />
        <Route path="/menu" element={<MenuRoute />} />
        <Route path="/settings" element={<SettingsRoute />} />
        <Route path="/game" element={<GameRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
