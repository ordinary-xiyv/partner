import { useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Spin } from 'antd';
import { AuthPage } from '../../components/AuthModal';
import { useUser } from '../../contexts/UserContext';
import { getPostAuthPath } from '../../hooks/usePostAuthNavigate';

export default function LoginPage() {
  const { user, loading } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const tab = searchParams.get('tab') === 'register' ? 'register' : 'login';

  useEffect(() => {
    if (!loading && user) {
      navigate(getPostAuthPath(location.state, searchParams.get('redirect')), { replace: true });
    }
  }, [loading, user, navigate, location.state, searchParams]);

  if (loading || user) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return <AuthPage tab={tab} />;
}
