// Runtime configuration. Empty by default: the app then uses the values
// baked in at build time. In the Cloud Run container this file is replaced
// at startup (docker/write-env.sh) with the service's NEXT_PUBLIC_* variables.
window.__MINERVA_ENV__ = window.__MINERVA_ENV__ || {};
