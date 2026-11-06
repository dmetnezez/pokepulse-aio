/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // IMAP + MIME parsing libraries are Node-only; load them at runtime instead of bundling.
  serverExternalPackages: ['imapflow', 'mailparser'],
};
export default nextConfig;
