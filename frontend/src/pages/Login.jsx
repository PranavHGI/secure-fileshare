import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api/axios';
import AuthLayout, { AuthLink } from '../components/AuthLayout';

function getLoginError(err) {
  if (!err.response) {
    return 'Cannot reach server. Start the backend on port 3000.';
  }
  const { status, data } = err.response;
  if (status === 503) return data?.error || 'Database is not running. Start PostgreSQL.';
  if (status === 429) return data?.error || data?.message || 'Too many attempts. Wait 15 minutes.';
  if (status === 400 || status === 401) return data?.error || 'Invalid email or password.';
  if (status === 500) return data?.error || 'Server error. Check backend logs.';
  return data?.error || 'Login failed. Try again.';
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const success = location.state?.message;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', {
        email: email.trim().toLowerCase(),
        password
      });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('role', res.data.role);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(getLoginError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to access your encrypted files"
      footer={<AuthLink to="/register">Create an account</AuthLink>}
    >
      {success && <p className="alert alert-success">{success}</p>}
      {error && <p className="alert alert-error">{error}</p>}
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </label>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  );
}
