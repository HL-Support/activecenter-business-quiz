
return items.map(({ json }) => ({
  json: buildLeadModel(json, { videoBaseUrl: 'https://business.activecenter.info' }),
}));