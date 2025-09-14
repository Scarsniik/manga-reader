import React from 'react';
import MangaManager from '@/renderer/components/MangaManger/MangaManager';

function Home(): JSX.Element {
    return (
        <div className="home-page">
            <MangaManager />
        </div>
    );
}

export default Home;
