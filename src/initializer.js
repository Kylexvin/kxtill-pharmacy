// src/initializer.js

import axios from 'axios';

const PRODUCT_KEY = 'kxtill';

export const initializeKxTill = async (organizationId) => {
  if (!organizationId) {
    console.warn('initializeKxTill: No organization ID provided');
    return null;
  }

  try {
    const response = await axios.post(
      `/products/organizations/${organizationId}/products/activate`,
      { productKey: PRODUCT_KEY }
    );

    console.log(`KxTill activated for organization ${organizationId}`);
    return response.data;
  } catch (error) {
    console.error('KxTill activation failed:', error?.response?.data || error.message);
    return null;
  }
};