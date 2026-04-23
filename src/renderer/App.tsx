import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Reader from '@/renderer/components/Reader/Reader';
import Home from '@/renderer/components/Home/Home';
import AppTitleBar from "@/renderer/components/AppTitleBar/AppTitleBar";
import WorkspaceView from "@/renderer/components/Workspace/WorkspaceView";
import OcrRuntimeFirstLaunchGate from "@/renderer/components/OcrRuntimeFirstLaunchGate/OcrRuntimeFirstLaunchGate";
import OcrRuntimeGlobalUi from "@/renderer/components/OcrRuntime/OcrRuntimeGlobalUi";
import './styles/main.scss';
import useRefresh from '@/renderer/hooks/useRefresh';
import usePreventMiddleClickAutoScroll from "@/renderer/hooks/usePreventMiddleClickAutoScroll";

const App: React.FC = () => {
    const {refreshKey} = useRefresh();
    usePreventMiddleClickAutoScroll();

    return (
        <div className="app-shell" key={refreshKey}>
            <AppTitleBar />
            <main className="app-shell__content">
                <HashRouter>
                    <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/reader" element={<Reader />} />
                        <Route path="/workspace" element={<WorkspaceView />} />
                    </Routes>
                </HashRouter>
            </main>
            <OcrRuntimeFirstLaunchGate />
            <OcrRuntimeGlobalUi />
        </div>
    );
};

export default App;
