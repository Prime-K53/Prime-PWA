const disabledResponse = (email) => ({
  success: true,
  disabled: true,
  email: email ? String(email).toLowerCase().trim() : undefined,
  message: 'Email verification is disabled for this ERP.',
});

const requestVerification = async ({ email }) => disabledResponse(email);
const verifyCode = async ({ email }) => disabledResponse(email);
const findLatestPending = async () => null;
const sendVerificationEmail = async (email) => disabledResponse(email);

module.exports = {
  requestVerification,
  verifyCode,
  findLatestPending,
  sendVerificationEmail,
};
