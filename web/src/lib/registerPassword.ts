// Shared by the register API and the sign-up form so both enforce the same rule.
export const REGISTER_PASSWORD_REGEX =
  /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d\s]).{8,128}$/;

export function isValidRegisterPassword(password: string): boolean {
  return REGISTER_PASSWORD_REGEX.test(password);
}
