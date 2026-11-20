import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../../../contexts/UserContext';
import { useAuthModal } from '../../../contexts/AuthModalContext';

export function useHomePrimaryAction() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { openLogin } = useAuthModal();

  const handlePrimary = useCallback(() => {
    if (user) navigate('/tokens');
    else openLogin();
  }, [user, navigate, openLogin]);

  return { handlePrimary };
}
