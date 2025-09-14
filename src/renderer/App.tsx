import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Reader from '@/renderer/components/Reader/Reader';
import Home from '@/renderer/components/Home/Home';
import './styles/main.scss';
import useRefresh from '@/renderer/hooks/useRefresh';

const App: React.FC = () => {
    const {refreshKey} = useRefresh();
    return (
        <div key={refreshKey}>
            <HashRouter>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/reader" element={<Reader />} />
                </Routes>
            </HashRouter>
        </div>
    );
};

export default App;