import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function Dashboard() {
  const [files, setFiles] = useState([]);
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [shareModal, setShareModal] = useState(null);
  const [shareExpiry, setShareExpiry] = useState('24h');
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState('');
  const [createdLink, setCreatedLink] = useState('');
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const loadData = async () => {
    setError('');
    try {
      const filesRes = await api.get('/files');
      setFiles(filesRes.data);
      try {
        const sharesRes = await api.get('/shares');
        setShares(sharesRes.data.filter((s) => !s.expired));
      } catch {
        setShares([]);
      }
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem('token');
        navigate('/login', { replace: true });
        return;
      }
      setError(err.response?.data?.error || 'Could not load data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredFiles = useMemo(() => {
    let list = [...files];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((f) => f.name.toLowerCase().includes(q));
    }
    if (sort === 'newest') list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    else if (sort === 'oldest') list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    else if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'size') list.sort((a, b) => b.size - a.size);
    return list;
  }, [files, search, sort]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    navigate('/login', { replace: true });
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    setSuccess('');
    try {
      const form = new FormData();
      form.append('file', file);
      await api.post('/files/upload', form);
      setSuccess(`Uploaded "${file.name}"`);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload({ target: { files: [file] } });
  };

  const handleDownload = async (id, name) => {
    setError('');
    try {
      const res = await api.get(`/files/download/${id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Download failed.');
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setError('');
    setSuccess('');
    try {
      await api.delete(`/files/${id}`);
      setSuccess(`Deleted "${name}"`);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Delete failed.');
    }
  };

  const openShareModal = (file) => {
    setShareModal(file);
    setCreatedLink('');
    setShareError('');
    setShareExpiry('24h');
  };

  const createShareLink = async () => {
    if (!shareModal) return;
    setShareLoading(true);
    setShareError('');
    setError('');
    try {
      const res = await api.post('/files/share', {
        fileId: shareModal.id,
        expiresIn: shareExpiry
      });
      setCreatedLink(res.data.url);
      setSuccess('Share link created');
      await loadData();
    } catch (err) {
      const msg = err.response?.data?.error || 'Could not create share link.';
      setShareError(msg);
      if (!err.response) {
        setShareError('Cannot reach server. Restart the backend (npm run dev).');
      }
    } finally {
      setShareLoading(false);
    }
  };

  const copyLink = async (url) => {
    await navigator.clipboard.writeText(url);
    setSuccess('Link copied to clipboard');
  };

  const revokeShare = async (shareId) => {
    try {
      await api.delete(`/shares/${shareId}`);
      setSuccess('Share link revoked');
      await loadData();
    } catch {
      setError('Could not revoke share.');
    }
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>My Files</h1>
          <p className="dashboard-subtitle">Encrypted storage — share securely with expiring links</p>
        </div>
        <button type="button" className="btn-ghost" onClick={handleLogout}>
          Sign out
        </button>
      </header>

      {error && <p className="alert alert-error">{error}</p>}
      {success && <p className="alert alert-success">{success}</p>}

      <section
        className="upload-zone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          id="file-upload"
          className="upload-input"
          onChange={handleUpload}
          disabled={uploading}
        />
        <label htmlFor="file-upload" className={`upload-label ${uploading ? 'uploading' : ''}`}>
          <span className="upload-icon">↑</span>
          <span>{uploading ? 'Encrypting & uploading…' : 'Click or drag a file to upload'}</span>
          <span className="upload-hint">Max 50 MB · AES-256-GCM</span>
        </label>
      </section>

      <section className="file-list-section">
        <div className="file-list-toolbar">
          <h2>Your files</h2>
          <div className="toolbar-controls">
            <input
              type="search"
              placeholder="Search files…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
            />
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="sort-select">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A–Z</option>
              <option value="size">Largest first</option>
            </select>
          </div>
        </div>

        {loading ? (
          <p className="muted">Loading files…</p>
        ) : filteredFiles.length === 0 ? (
          <p className="empty-state">
            {search ? 'No files match your search.' : 'No files yet. Upload your first file above.'}
          </p>
        ) : (
          <ul className="file-list">
            {filteredFiles.map((f) => (
              <li key={f.id} className="file-item">
                <div className="file-meta">
                  <span className="file-name">{f.name}</span>
                  <span className="file-size">
                    {(f.size / 1024).toFixed(1)} KB · {formatDate(f.createdAt)}
                    {f.shareCount > 0 && ` · ${f.shareCount} active link${f.shareCount > 1 ? 's' : ''}`}
                  </span>
                </div>
                <div className="file-actions">
                  <button type="button" className="btn-secondary" onClick={() => openShareModal(f)}>
                    Share
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => handleDownload(f.id, f.name)}>
                    Download
                  </button>
                  <button type="button" className="btn-danger" onClick={() => handleDelete(f.id, f.name)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {shares.length > 0 && (
        <section className="file-list-section">
          <h2>Active share links</h2>
          <ul className="file-list">
            {shares.map((s) => (
              <li key={s.id} className="file-item share-item">
                <div className="file-meta">
                  <span className="file-name">{s.fileName}</span>
                  <span className="file-size">Expires {formatDate(s.expiresAt)}</span>
                </div>
                <div className="file-actions">
                  <button type="button" className="btn-secondary" onClick={() => copyLink(s.url)}>
                    Copy link
                  </button>
                  <button type="button" className="btn-danger" onClick={() => revokeShare(s.id)}>
                    Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {shareModal && (
        <div className="modal-overlay" onClick={() => setShareModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Share &quot;{shareModal.name}&quot;</h3>
            <p className="muted">Anyone with the link can download until it expires.</p>
            {shareError && <p className="alert alert-error">{shareError}</p>}

            {!createdLink ? (
              <>
                <label className="modal-label">
                  Link expires in
                  <select
                    value={shareExpiry}
                    onChange={(e) => setShareExpiry(e.target.value)}
                    className="sort-select"
                  >
                    <option value="1h">1 hour</option>
                    <option value="24h">24 hours</option>
                    <option value="7d">7 days</option>
                  </select>
                </label>
                <div className="modal-actions">
                  <button type="button" className="btn-ghost" onClick={() => setShareModal(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={createShareLink}
                    disabled={shareLoading}
                  >
                    {shareLoading ? 'Creating…' : 'Create link'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="share-link-box">
                  <input type="text" readOnly value={createdLink} className="share-link-input" />
                  <button type="button" className="btn-secondary" onClick={() => copyLink(createdLink)}>
                    Copy
                  </button>
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-primary" onClick={() => setShareModal(null)}>
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
