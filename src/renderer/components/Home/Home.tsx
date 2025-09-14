import React from 'react';
import MangaManager from '@/renderer/components/MangaManger/MangaManager';
import useModal from '@/renderer/hooks/useModal';

const Home: React.FC = () => {
    const { openModal } = useModal();

    return (
        <div className="home-page">
            <MangaManager />
        </div>
    );
};

export default Home;
