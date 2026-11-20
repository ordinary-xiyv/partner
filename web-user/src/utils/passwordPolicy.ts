/**
 * 密码复杂度校验，与后端 internal-user/gateway/upstream/common/password_policy.go 保持一致。
 * 规则：长度 >= 8；至少包含大写字母、小写字母、数字、特殊符号各一个。
 */
export function validatePasswordComplexity(password: string): string | null {
  if (!password || password.length < 8) {
    return 'passwordTooShort';
  }

  let hasUpper = false;
  let hasLower = false;
  let hasDigit = false;
  let hasSpecial = false;

  for (const ch of password) {
    if (/[A-Z]/.test(ch)) {
      hasUpper = true;
    } else if (/[a-z]/.test(ch)) {
      hasLower = true;
    } else if (/\d/.test(ch)) {
      hasDigit = true;
    } else {
      hasSpecial = true;
    }
  }

  if (!hasUpper || !hasLower || !hasDigit || !hasSpecial) {
    return 'passwordComplexity';
  }

  return null;
}

/** 仅校验长度（用于不需要复杂度的场景，如当前密码输入）。 */
export function validatePasswordMinLength(password: string): string | null {
  if (!password || password.length < 8) {
    return 'passwordTooShort';
  }
  return null;
}
