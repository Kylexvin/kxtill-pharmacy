import axios from 'axios';

export const getOrganizations = () =>
  axios.get('/organizations');

export const getBranches = (organizationId) =>
  axios.get(`/organizations/${organizationId}/branches`);