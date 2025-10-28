module.exports = {
  allowedDevOrigins: [
    'localhost:3000',
    '192.168.1.5:3000'
  ],
  experimental: {
    turbo: true,
    strictNextHead: true // Previene errores de <head>
  },
  // Solo si usas App Router
  reactStrictMode: true
};
