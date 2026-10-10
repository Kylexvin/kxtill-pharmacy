// src/initializer.js

import axios from 'axios';

const PRODUCT_KEY = 'kxtill';

export const initializeKxTill = async (organizationId) => {
  if (!organizationId) {
    throw new Error('initializeKxTill: No organization ID provided');
  }

  const response = await axios.post(
    `/products/organizations/${organizationId}/products/activate`,
    { productKey: PRODUCT_KEY, vertical: 'pharmacy' }
  );

  console.log(`KxTill activated for organization ${organizationId}`);
  return response.data;
};