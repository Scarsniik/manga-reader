import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Home from '@/renderer/components/Home/Home';
import AppTitleBar from "@/renderer/components/AppTitleBar/AppTitleBar";
import OcrRuntimeFirstLaunchGate from "@/renderer/components/OcrRuntimeFirstLaunchGate/OcrRuntimeFirstLaunchGate";
import OcrRuntimeGlobalUi from "@/renderer/components/OcrRuntime/OcrRuntimeGlobalUi";
import './styles/main.scss';
import useRefresh from '@/renderer/hooks/useRefresh';
import usePreventMiddleClickAutoScroll from "@/renderer/hooks/usePreventMiddleClickAutoScroll";

type DefaultComponentModule = {
    default: React.ComponentType<any>;
};

const loadDefaultComponent = async (loader: () => Promise<unknown>): Promise<DefaultComponentModule> => {
    const loaded = await loader() as DefaultComponentModule;
    return { default: loaded.default };
};

const Reader = React.lazy(() => loadDefaultComponent(() => import('@/renderer/components/Reader/Reader.js')));
const WorkspaceView = React.lazy(() => loadDefaultComponent(() => import('@/renderer/components/Workspace/WorkspaceView.js')));

const RouteLoadingFallback = () => (
    <div className="app-route-loading" aria-label="Chargement de la vue" aria-busy="true" />
);

const App: React.FC = () => {
    const {refreshKey} = useRefresh();
    usePreventMiddleClickAutoScroll();

    return (
        <div className="app-shell" key={refreshKey}>
            <AppTitleBar />
            <main className="app-shell__content">
                <HashRouter>
                    <React.Suspense fallback={<RouteLoadingFallback />}>
                        <Routes>
                            <Route path="/" element={<Home />} />
                            <Route path="/reader" element={<Reader />} />
                            <Route path="/workspace" element={<WorkspaceView />} />
                        </Routes>
                    </React.Suspense>
                </HashRouter>
            </main>
            <OcrRuntimeFirstLaunchGate />
            <OcrRuntimeGlobalUi />
        </div>
    );
};

export default App;
