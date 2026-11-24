import { test } from 'node:test';
import assert from 'node:assert/strict';

function normalizeIndianMobile10(input) {
  const digits = String(input ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits.slice(0, 10);
}

function isValidIndianMobile10(digits10) {
  return /^[0-9]{10}$/.test(digits10);
}

function toIndianE164(input) {
  const d10 = normalizeIndianMobile10(input);
  return isValidIndianMobile10(d10) ? `+91${d10}` : '';
}

function formatIndianMobileDisplay(mobileNumber) {
  const d10 = normalizeIndianMobile10(mobileNumber);
  if (!isValidIndianMobile10(d10)) return mobileNumber || '';
  return `+91 ${d10.slice(0, 5)} ${d10.slice(5)}`;
}

test('Indian +91 mobile normalization and 10-digit validation', () => {
  assert.equal(normalizeIndianMobile10('9876543210'), '9876543210');
  assert.equal(normalizeIndianMobile10('+91 98765 43210'), '9876543210');
  assert.equal(normalizeIndianMobile10('09876543210'), '9876543210');
  assert.equal(normalizeIndianMobile10('98765-43210'), '9876543210');

  assert.equal(isValidIndianMobile10('9876543210'), true);
  assert.equal(isValidIndianMobile10('987654321'), false);
  assert.equal(isValidIndianMobile10(''), false);
  assert.equal(isValidIndianMobile10('98765abcde'), false);

  assert.equal(toIndianE164('9876543210'), '+919876543210');
  assert.equal(toIndianE164('+91 98765-43210'), '+919876543210');
  assert.equal(toIndianE164('12345'), '');

  assert.equal(formatIndianMobileDisplay('+919876543210'), '+91 98765 43210');
  assert.equal(formatIndianMobileDisplay('9876543210'), '+91 98765 43210');
});
