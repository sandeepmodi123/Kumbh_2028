const OTP_MODE = process.env.OTP_MODE || 'MOCK';

async function sendOtp(phone, otp) {
  // Adapter shape is ready for real vendor integration.
  if (OTP_MODE === 'MOCK') {
    return { ok: true, provider: 'mock', messageId: `mock-${Date.now()}` };
  }

  if (OTP_MODE === 'LOG') {
    console.log(`[OTP-LOG] phone=${phone} otp=${otp}`);
    return { ok: true, provider: 'log', messageId: `log-${Date.now()}` };
  }

  // Placeholder for real HTTP/SMS vendor integration.
  if (OTP_MODE === 'VENDOR') {
    return {
      ok: false,
      provider: 'vendor',
      error: 'Vendor integration not configured. Set OTP_MODE=MOCK or implement provider API call.'
    };
  }

  return { ok: false, provider: 'unknown', error: `Unsupported OTP_MODE=${OTP_MODE}` };
}

module.exports = { sendOtp, OTP_MODE };
