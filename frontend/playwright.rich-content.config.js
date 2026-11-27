import base from './playwright.rebuild.config.js';
export default {
  ...base,
  testMatch: [
    'rich-content.spec.js',
    'rebuild.spec.js',
    'reference.spec.js',
    'unified-chat.spec.js',
  ],
};
