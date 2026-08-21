export function generateQrToken(name, index) {
  const cleanName = (name || 'patient').toLowerCase().replace(/\s+/g, '_');
  return `token_${cleanName}_${10000 + index}`;
}
