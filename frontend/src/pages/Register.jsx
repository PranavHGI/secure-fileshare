import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import AuthLayout, { AuthLink } from '../components/AuthLayout';

function getRegisterError(err) {
  if (!err.response) {
    return 'Cannot reach server. Start the backend on port 3000.';
  }
  const { status, data } = err.response;
  if (status === 503) return data?.error || 'Database is not running. Start PostgreSQL.';
  if (status === 409) return 'This email is already registered.';
  if (status === 400) return data?.error || 'Check your email and password (min 8 characters).';
  if (status === 500) return data?.error || 'Server error. Check backend logs.';
  return data?.error || 'Registration failed.';
}

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/register', {
        email: email.trim().toLowerCase(),
        password
      });
      navigate('/login', {
        replace: true,
        state: { message: 'Account created! Sign in with your email and password.' }
      });
    } catch (err) {
      setError(getRegisterError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create account"
      subtitle="Register to upload and share encrypted files"
      footer={<AuthLink to="/login">Already have an account? Sign in</AuthLink>}
    >
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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 8 characters"
            minLength={8}
            required
          />
        </label>
        <label>
          Confirm password
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat password"
            minLength={8}
            required
          />
        </label>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  );
}
