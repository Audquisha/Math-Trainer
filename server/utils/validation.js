const isNonEmptyString = (value, maxLength) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;

const isValidClassCode = (value) => isNonEmptyString(value, 50);

module.exports = { isNonEmptyString, isValidClassCode };