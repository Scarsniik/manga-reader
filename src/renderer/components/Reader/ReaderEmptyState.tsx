import React from 'react';

type Props = {
    mangaPath?: string | null;
    hasGetMangasApi: boolean;
    hasListPagesApi: boolean;
    hasGetCoverDataApi: boolean;
    canRunDebug: boolean;
    onRunDebug: () => void;
    debugError?: string | null;
    debugList?: string[] | null;
    coverData?: string | null;
};

const ReaderEmptyState: React.FC<Props> = ({
    mangaPath,
    hasGetMangasApi,
    hasListPagesApi,
    hasGetCoverDataApi,
    canRunDebug,
    onRunDebug,
    debugError,
    debugList,
    coverData,
}) => {
    return (
        <div className="reader-empty">
            <p>Aucune image à afficher.</p>
            <div className="reader-debug">
                <div><strong>Manga path:</strong> {mangaPath ? <code>{mangaPath}</code> : <em>n/a</em>}</div>
                <div><strong>APIs:</strong>
                    <span> getMangas: {hasGetMangasApi ? 'OK' : 'NO'}</span>
                    <span> listPages: {hasListPagesApi ? 'OK' : 'NO'}</span>
                    <span> getCoverData: {hasGetCoverDataApi ? 'OK' : 'NO'}</span>
                </div>
                <div style={{ marginTop: 8 }}>
                    <button onClick={onRunDebug} disabled={!canRunDebug} type="button">Tester listPages</button>
                </div>
                {debugError ? <div className="debug-error">Erreur: {debugError}</div> : null}
                {debugList ? (
                    <div className="debug-list">
                        <div><strong>Pages trouvées ({debugList.length}):</strong></div>
                        <ul>
                            {debugList.map((entry, index) => (
                                <li key={index}><code style={{ fontSize: 12 }}>{entry}</code></li>
                            ))}
                        </ul>
                    </div>
                ) : null}
                {coverData ? (
                    <div className="debug-cover">
                        <div><strong>Cover data:</strong></div>
                        <img src={coverData} alt="cover debug" style={{ maxWidth: 200, maxHeight: 200 }} />
                    </div>
                ) : null}
            </div>
        </div>
    );
};

export default ReaderEmptyState;
