// app.json + a sub-folder base for the public web demo (KIT_BASE_URL=/demo/site-app).
// Phone builds and tests leave KIT_BASE_URL unset.
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...(config.experiments || {}), ...(process.env.KIT_BASE_URL ? { baseUrl: process.env.KIT_BASE_URL } : {}) },
});
