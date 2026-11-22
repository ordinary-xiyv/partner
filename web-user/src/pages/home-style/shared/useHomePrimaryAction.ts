import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../../../contexts/UserContext';
import { useAuthModal } from '../../../contexts/AuthModalContext';

/**
 * 首页主行动（"获取 API Key"按钮）该做什么。
 *
 * 逻辑很短，但它被两套风格共用，且以后大概率会变
 * （比如未登录用户改成先弹注册、或已登录但没额度时引导充值），
 * 所以单独放这里，而不是在两个 Hero 里各写一遍 if/else ——
 * 那种写法两处必然渐渐走偏。
 *
 * 原先长在旧首页 pages/home/hooks/ 下。旧首页删掉后移到 home-style 里：
 * 它本来就是「新首页需要的一段逻辑」，只是当初顺手放在了旧目录。
 */
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
