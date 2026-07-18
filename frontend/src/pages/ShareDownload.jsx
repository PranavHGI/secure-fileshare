import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';

export default function ShareDownload() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    api
      .get(`/shares/public/${token}/info`)
      .then((res) => setInfo(res.data))
      .catch((err) => {
        setError(err.response?.data?.error || 'Invalid or expired share link');
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleDownload = async () => {
    setDownloading(true);
    setError('');
    try {
      const res = await api.get(`/shares/public/${token}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = info?.fileName || 'download';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error || 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const expiresLabel = info?.expiresAt
    ? new Date(info.expiresAt).toLocaleString()
    : '';

  return (
    <div className="auth-page">
      <div className="auth-card share-card">
        <div className="auth-brand">
          <span className="auth-logo" aria-hidden="true">🔒</span>
          <h1>Secure Fileshare</h1>
        </div>
        <h2>Shared file</h2>

        {loading && <p className="muted">Loading…</p>}
        {error && !loading && <p className="alert alert-error">{error}</p>}

        {info && !error && (
          <>
            <div className="share-file-info">
              <p className="share-file-name">{info.fileName}</p>
              <p className="muted">{(info.size / 1024).toFixed(1)} KB</p>
              <p className="share-expiry">Expires: {expiresLabel}</p>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? 'Downloading…' : 'Download file'}
            </button>
          </>
        )}

        <p className="auth-footer">
          <Link to="/login" className="auth-link">Sign in to your account</Link>
        </p>
      </div>
    </div>
  );
}
